#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { summarizeSourceMap } from '../lib/source-map.mjs'

const SOURCE_CATEGORIES = new Set(['src', 'node_modules', 'vendor'])
const INLINE_MAP_MARKER =
  '//# sourceMappingURL=data:application/json;charset=utf-8;base64,'
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })
const MANIFEST_HASH_ALGORITHM =
  'sha256 over UTF-8 `path\\0bytes\\0sha256\\n` records sorted by ' +
  'JavaScript code-unit order'

function usage() {
  console.error(
    'Usage: extract-baseline.mjs --map BASELINE.map --output DIR ' +
      '[--expected-sha256 HEX]',
  )
}

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) throw new Error(`Unexpected ${argument}`)
    const key = argument.slice(2)
    if (!['map', 'output', 'expected-sha256'].includes(key)) {
      throw new Error(`Unknown argument: ${argument}`)
    }
    if (result[key] !== undefined) {
      throw new Error(`Duplicate argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  return result
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function compareText(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function assertEmptyOutput(output) {
  if (!fs.existsSync(output)) return
  const status = fs.lstatSync(output)
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`Output exists and is not a real directory: ${output}`)
  }
  const entries = fs.readdirSync(output)
  if (entries.length > 0) {
    throw new Error(
      `Refusing to use non-empty output directory: ${output} (${entries[0]})`,
    )
  }
}

function unsafeSource(source, reason) {
  throw new Error(`Unsafe source-map path ${JSON.stringify(source)}: ${reason}`)
}

function classifyOuterSource(source) {
  if (typeof source !== 'string' || source.length === 0) {
    unsafeSource(source, 'expected a non-empty string')
  }
  if (source.includes('\0')) unsafeSource(source, 'contains a NUL byte')
  if (
    path.posix.isAbsolute(source) ||
    path.win32.isAbsolute(source) ||
    source.includes('\\')
  ) {
    unsafeSource(source, 'absolute and backslash paths are forbidden')
  }

  const parts = source.split('/')
  if (parts[0] !== '..' || !SOURCE_CATEGORIES.has(parts[1])) {
    unsafeSource(
      source,
      'expected exactly ../src, ../node_modules, or ../vendor',
    )
  }
  const relativeParts = parts.slice(2)
  if (
    relativeParts.length === 0 ||
    relativeParts.some(
      part => part.length === 0 || part === '.' || part === '..',
    )
  ) {
    unsafeSource(source, 'empty, dot, and traversal components are forbidden')
  }

  const category = parts[1]
  const relativePath = relativeParts.join('/')
  return {
    category,
    relativePath,
    bunInputPath: path.posix.join('bun-input', category, relativePath),
    pristinePath:
      category === 'src'
        ? path.posix.join('pristine', 'src', relativePath)
        : null,
  }
}

function assertSafeNestedSource(source, outerSource, relativePath) {
  if (typeof source !== 'string' || source.length === 0) {
    unsafeSource(source, `invalid nested source for ${outerSource}`)
  }
  if (
    source.includes('\0') ||
    source.includes('/') ||
    source.includes('\\') ||
    source === '.' ||
    source === '..' ||
    path.posix.isAbsolute(source) ||
    path.win32.isAbsolute(source)
  ) {
    unsafeSource(source, `invalid nested source for ${outerSource}`)
  }
  const expected = path.posix.basename(relativePath)
  if (source !== expected) {
    throw new Error(
      `${outerSource}: nested source ${JSON.stringify(source)} ` +
        `does not match ${JSON.stringify(expected)}`,
    )
  }
}

function generatedCodeLineCount(value) {
  if (value.length === 0) return 0
  const withoutOneTrailingNewline = value.endsWith('\n')
    ? value.slice(0, -1)
    : value
  return withoutOneTrailingNewline.split('\n').length
}

function decodeCanonicalBase64(encoded, source) {
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  ) {
    throw new Error(`${source}: nested source map is not canonical base64`)
  }
  const decoded = Buffer.from(encoded, 'base64')
  if (decoded.toString('base64') !== encoded) {
    throw new Error(`${source}: nested source map failed base64 verification`)
  }
  return decoded
}

function extractNestedOriginal(source, relativePath, outerContent) {
  const markerIndex = outerContent.indexOf(INLINE_MAP_MARKER)
  if (markerIndex < 0) {
    throw new Error(`${source}: missing nested inline compiler source map`)
  }
  if (markerIndex !== outerContent.lastIndexOf(INLINE_MAP_MARKER)) {
    throw new Error(`${source}: multiple nested inline compiler source maps`)
  }
  if (markerIndex > 0 && outerContent[markerIndex - 1] !== '\n') {
    throw new Error(`${source}: nested source-map marker is not line-aligned`)
  }

  const tail = outerContent.slice(markerIndex + INLINE_MAP_MARKER.length)
  const encodedMatch = tail.match(
    /^([A-Za-z0-9+/]+={0,2})[ \t]*(?:\r?\n)?$/,
  )
  if (!encodedMatch) {
    throw new Error(`${source}: malformed nested inline compiler source map`)
  }
  const decoded = decodeCanonicalBase64(encodedMatch[1], source)
  let nested
  try {
    nested = JSON.parse(UTF8_DECODER.decode(decoded))
  } catch (error) {
    throw new Error(`${source}: invalid nested source-map JSON`, {
      cause: error,
    })
  }
  if (
    nested.version !== 3 ||
    !Array.isArray(nested.sources) ||
    nested.sources.length !== 1 ||
    !Array.isArray(nested.sourcesContent) ||
    nested.sourcesContent.length !== 1 ||
    typeof nested.sourcesContent[0] !== 'string' ||
    typeof nested.mappings !== 'string' ||
    (nested.names !== undefined && !Array.isArray(nested.names))
  ) {
    throw new Error(`${source}: unexpected nested source-map topology`)
  }
  assertSafeNestedSource(nested.sources[0], source, relativePath)

  const summary = summarizeSourceMap(nested)
  const generatedLines = generatedCodeLineCount(
    outerContent.slice(0, markerIndex),
  )
  if (summary.generatedLineCount !== generatedLines) {
    throw new Error(
      `${source}: nested map has ${summary.generatedLineCount} generated ` +
        `lines for ${generatedLines} compiler-output lines`,
    )
  }
  if (summary.usedSourceCount !== 1) {
    throw new Error(`${source}: nested map does not use its sole source`)
  }

  return {
    original: nested.sourcesContent[0],
    source: nested.sources[0],
    mapBytes: decoded.length,
    mapSha256: sha256(decoded),
    summary,
  }
}

function assertNoDestinationConflicts(records) {
  const destinations = new Set()
  for (const record of records) {
    for (const destination of [
      record.bunInput.path,
      record.pristine?.path,
    ]) {
      if (!destination) continue
      if (destinations.has(destination)) {
        throw new Error(`Duplicate extraction destination: ${destination}`)
      }
      destinations.add(destination)
    }
  }

  for (const destination of destinations) {
    const parts = destination.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      const ancestor = parts.slice(0, index).join('/')
      if (destinations.has(ancestor)) {
        throw new Error(
          `Extraction destination is both file and directory: ${ancestor}`,
        )
      }
    }
  }
}

function summarizeRecords(records) {
  const hash = crypto.createHash('sha256')
  let bytes = 0
  const sorted = [...records].sort((left, right) =>
    compareText(left.path, right.path),
  )
  for (const record of sorted) {
    bytes += record.bytes
    hash
      .update(record.path)
      .update('\0')
      .update(String(record.bytes))
      .update('\0')
      .update(record.sha256)
      .update('\n')
  }
  return {
    count: sorted.length,
    bytes,
    manifestSha256: hash.digest('hex'),
  }
}

function buildExtractionPlan(map) {
  if (typeof map.mappings !== 'string') {
    throw new Error('Outer source map must contain a mappings string')
  }
  if (map.names !== undefined && !Array.isArray(map.names)) {
    throw new Error('Outer source map names must be an array')
  }
  const sourceMapSummary = summarizeSourceMap(map)
  const records = []
  const seenSources = new Set()

  for (let index = 0; index < map.sources.length; index += 1) {
    const source = map.sources[index]
    const outerContent = map.sourcesContent[index]
    if (typeof outerContent !== 'string') {
      throw new Error(`${source}: missing outer sourcesContent`)
    }
    if (seenSources.has(source)) {
      throw new Error(`Duplicate source-map source: ${source}`)
    }
    seenSources.add(source)

    const classified = classifyOuterSource(source)
    const outerBytes = Buffer.byteLength(outerContent)
    const outerSha256 = sha256(outerContent)
    let pristine = null
    let nestedSourceMap = null

    if (classified.category === 'src') {
      let pristineContent = outerContent
      let origin = 'outer-sourcesContent'
      if (source.endsWith('.tsx')) {
        const nested = extractNestedOriginal(
          source,
          classified.relativePath,
          outerContent,
        )
        pristineContent = nested.original
        origin = 'nested-inline-source-map'
        nestedSourceMap = {
          source: nested.source,
          bytes: nested.mapBytes,
          sha256: nested.mapSha256,
          summary: nested.summary,
        }
      }
      pristine = {
        path: classified.pristinePath,
        bytes: Buffer.byteLength(pristineContent),
        sha256: sha256(pristineContent),
        origin,
        content: pristineContent,
      }
    }

    records.push({
      source,
      category: classified.category,
      bunInput: {
        path: classified.bunInputPath,
        bytes: outerBytes,
        sha256: outerSha256,
        content: outerContent,
      },
      pristine,
      nestedSourceMap,
    })
  }

  assertNoDestinationConflicts(records)
  records.sort((left, right) => compareText(left.source, right.source))
  return { records, sourceMapSummary }
}

function buildManifest(mapEvidence, plan) {
  const files = plan.records.map(record => {
    const result = {
      source: record.source,
      category: record.category,
      bunInput: {
        path: record.bunInput.path,
        bytes: record.bunInput.bytes,
        sha256: record.bunInput.sha256,
      },
    }
    if (record.pristine) {
      result.pristine = {
        path: record.pristine.path,
        bytes: record.pristine.bytes,
        sha256: record.pristine.sha256,
        origin: record.pristine.origin,
      }
    }
    if (record.nestedSourceMap) {
      result.nestedSourceMap = record.nestedSourceMap
    }
    return result
  })

  const bunInputRecords = files.map(file => file.bunInput)
  const pristineRecords = files
    .filter(file => file.pristine)
    .map(file => file.pristine)
  const categories = {}
  for (const category of SOURCE_CATEGORIES) {
    categories[category] = summarizeRecords(
      files
        .filter(file => file.category === category)
        .map(file => file.bunInput),
    )
  }
  const tsxFiles = files.filter(
    file => file.pristine?.origin === 'nested-inline-source-map',
  )

  return {
    schemaVersion: 1,
    format: 'claude-code-baseline-extraction',
    manifestHashAlgorithm: MANIFEST_HASH_ALGORITHM,
    sourceMap: {
      ...mapEvidence,
      summary: plan.sourceMapSummary,
    },
    counts: {
      outerSourceCount: files.length,
      outerSourceBytes: bunInputRecords.reduce(
        (sum, record) => sum + record.bytes,
        0,
      ),
      pristineSourceCount: pristineRecords.length,
      pristineSourceBytes: pristineRecords.reduce(
        (sum, record) => sum + record.bytes,
        0,
      ),
      nestedTsxSourceCount: tsxFiles.length,
      nestedSourceMapBytes: tsxFiles.reduce(
        (sum, file) => sum + file.nestedSourceMap.bytes,
        0,
      ),
    },
    trees: {
      bunInput: {
        ...summarizeRecords(bunInputRecords),
        categories,
      },
      pristine: summarizeRecords(pristineRecords),
    },
    files,
  }
}

function safeOutputFilename(root, relative) {
  const resolvedRoot = path.resolve(root)
  const filename = path.resolve(resolvedRoot, ...relative.split('/'))
  if (
    filename === resolvedRoot ||
    !filename.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Extraction destination escaped staging root: ${relative}`)
  }
  return filename
}

function writePlan(staging, plan, manifest) {
  for (const directory of [
    'bun-input/src',
    'bun-input/node_modules',
    'bun-input/vendor',
    'pristine/src',
  ]) {
    fs.mkdirSync(safeOutputFilename(staging, directory), { recursive: true })
  }

  for (const record of plan.records) {
    for (const output of [record.bunInput, record.pristine]) {
      if (!output) continue
      const filename = safeOutputFilename(staging, output.path)
      fs.mkdirSync(path.dirname(filename), { recursive: true })
      fs.writeFileSync(filename, output.content, { flag: 'wx' })
    }
  }
  fs.writeFileSync(
    safeOutputFilename(staging, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx' },
  )
}

export function extractBaseline({
  mapPath,
  outputPath,
  expectedSha256,
}) {
  const resolvedMap = path.resolve(mapPath)
  const output = path.resolve(outputPath)
  assertEmptyOutput(output)

  const mapBuffer = fs.readFileSync(resolvedMap)
  const actualSha256 = sha256(mapBuffer)
  if (expectedSha256 !== undefined) {
    if (!/^[a-fA-F0-9]{64}$/.test(expectedSha256)) {
      throw new Error('Expected source-map SHA-256 must be 64 hex characters')
    }
    if (actualSha256 !== expectedSha256.toLowerCase()) {
      throw new Error(
        `Source-map SHA-256 mismatch: expected ${expectedSha256.toLowerCase()}, ` +
          `got ${actualSha256}`,
      )
    }
  }

  let map
  try {
    map = JSON.parse(UTF8_DECODER.decode(mapBuffer))
  } catch (error) {
    throw new Error(`Invalid outer source-map JSON: ${resolvedMap}`, {
      cause: error,
    })
  }
  const plan = buildExtractionPlan(map)
  const manifest = buildManifest(
    { bytes: mapBuffer.length, sha256: actualSha256 },
    plan,
  )

  const parent = path.dirname(output)
  fs.mkdirSync(parent, { recursive: true })
  const staging = fs.mkdtempSync(
    path.join(parent, `.${path.basename(output)}.tmp-`),
  )
  let stagingExists = true
  try {
    writePlan(staging, plan, manifest)
    assertEmptyOutput(output)
    if (fs.existsSync(output)) fs.rmdirSync(output)
    fs.renameSync(staging, output)
    stagingExists = false
  } finally {
    if (stagingExists) {
      fs.rmSync(staging, { recursive: true, force: true })
    }
  }
  return manifest
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.map || !args.output) {
    usage()
    process.exitCode = 2
    return
  }
  const manifest = extractBaseline({
    mapPath: args.map,
    outputPath: args.output,
    expectedSha256: args['expected-sha256'],
  })
  console.log(
    JSON.stringify(
      {
        output: path.resolve(args.output),
        manifest: path.resolve(args.output, 'manifest.json'),
        counts: manifest.counts,
        trees: manifest.trees,
      },
      null,
      2,
    ),
  )
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  try {
    main()
  } catch (error) {
    console.error(error.stack ?? error)
    process.exitCode = 1
  }
}
