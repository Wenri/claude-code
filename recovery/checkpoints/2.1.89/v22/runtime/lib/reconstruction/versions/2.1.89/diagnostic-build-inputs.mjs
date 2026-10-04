import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const BASELINE_MAP_SHA256 = '7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657'
export const BASELINE_BUNDLE_SHA256 = '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f'
export const EXPECTED_BUN_VERSION = '1.3.11'
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
export const describeFile = filename => {
  const bytes = fs.readFileSync(filename)
  return { path: path.resolve(filename), bytes: bytes.length, sha256: sha256(bytes) }
}
export function parseFlags(argv, required, optional = []) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    assert(argv[i]?.startsWith('--') && [...required, ...optional].includes(key), `Unknown option ${argv[i]}`)
    assert(!Object.hasOwn(result, key), `Duplicate option --${key}`)
    assert(argv[i + 1] && !argv[i + 1].startsWith('--'), `Missing value for --${key}`)
    result[key] = path.resolve(argv[i + 1])
  }
  for (const key of required) assert(result[key], `Required: --${key} PATH`)
  return result
}
export function within(root, filename) {
  const relative = path.relative(root, filename)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}
// Resolve existing ancestors as well as the final component: a new path under
// a symlinked parent can otherwise bypass lexical containment checks.
function physicalDestination(filename) {
  let ancestor = path.resolve(filename)
  const suffix = []
  while (true) {
    try { return path.join(fs.realpathSync(ancestor), ...suffix) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = path.dirname(ancestor)
      if (parent === ancestor) throw error
      suffix.unshift(path.basename(ancestor)); ancestor = parent
    }
  }
}
function optionalStatus(filename) {
  try { return fs.lstatSync(filename) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
export function assertDistinctFileOutput(output, protectedFiles) {
  const status = optionalStatus(output)
  if (status) assert(status.isFile() && !status.isSymbolicLink(), 'Diagnostic output must be a regular file or new path')
  const destination = physicalDestination(output)
  for (const filename of protectedFiles) {
    assert(destination !== physicalDestination(filename), `Diagnostic output aliases protected input or tool: ${filename}`)
    if (status) {
      const protectedStatus = fs.statSync(filename)
      assert(status.dev !== protectedStatus.dev || status.ino !== protectedStatus.ino,
        `Diagnostic output aliases protected input or tool inode: ${filename}`)
    }
  }
}
export function assertBuildOutputDirectory(output, inputRoots) {
  const destination = physicalDestination(output)
  for (const root of inputRoots) {
    assert(!within(physicalDestination(root), destination), 'Build output must be physically outside input trees')
  }
  const status = optionalStatus(output)
  if (status) assert(status.isDirectory() && !status.isSymbolicLink() && fs.readdirSync(output).length === 0,
    'Build output must be a new or empty real directory')
}
export function safeRelative(relative) {
  assert(typeof relative === 'string' && relative.length > 0 && !relative.includes('\0') && !relative.includes('\\') && !path.posix.isAbsolute(relative), 'Unsafe relative input path')
  assert(relative.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsafe relative input path')
  return relative
}
export function inventoryTree(root) {
  assert(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink(), 'Input root must be a real directory')
  const files = []
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      assert(!entry.isSymbolicLink(), `Symlink input is not accepted: ${filename}`)
      if (entry.isDirectory()) visit(filename)
      else {
        assert(entry.isFile(), `Nonregular input: ${filename}`)
        files.push({ path: path.relative(root, filename).split(path.sep).join('/'), bytes: fs.statSync(filename).size, sha256: sha256(fs.readFileSync(filename)) })
      }
    }
  }
  visit(root)
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return { root: path.resolve(root), files, count: files.length,
    manifestSha256: sha256(files.map(file => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join('')) }
}
export function validateMappedInputs(map, tree) {
  assert.equal(map.version, 3)
  assert.equal(map.sources.length, map.sourcesContent.length)
  const actual = new Map(tree.files.map(file => [file.path, file]))
  assert.equal(actual.size, map.sources.length, 'Mapped input tree contains missing or unlisted files')
  const seen = new Set()
  for (let i = 0; i < map.sources.length; i++) {
    assert(/^\.\.\/(src|node_modules|vendor)\//.test(map.sources[i]), 'Unexpected source-map path')
    const relative = safeRelative(map.sources[i].slice(3))
    assert(!seen.has(relative), 'Duplicate source-map input path')
    seen.add(relative)
    assert.equal(typeof map.sourcesContent[i], 'string', 'Missing source-map content')
    const bytes = Buffer.from(map.sourcesContent[i], 'utf8'), entry = actual.get(relative)
    assert(entry && entry.bytes === bytes.length && entry.sha256 === sha256(bytes), `Mapped input differs: ${relative}`)
  }
}
export function validateDependencyCandidate(evidence, tree) {
  assert.equal(evidence.kind, 'baseline-supplementary-dependency-candidate')
  assert.equal(evidence.package, 'zod-to-json-schema')
  assert.equal(evidence.version, '3.25.1')
  assert.equal(evidence.inputs.source_map.sha256, BASELINE_MAP_SHA256)
  assert.equal(evidence.mappedComparisons.length, 27)
  assert(evidence.mappedComparisons.every(row => row.byteEqual === true))
  assert(Array.isArray(evidence.registry.verifiedSigningKeys) && evidence.registry.verifiedSigningKeys.length > 0)
  assert.equal(tree.files.length, evidence.extractedFiles.length, 'Candidate tree contains missing or unlisted files')
  const expected = new Map(evidence.extractedFiles.map(row => [safeRelative(row.path), row]))
  assert.equal(expected.size, tree.files.length, 'Duplicate candidate evidence path')
  for (const file of tree.files) {
    const pin = expected.get(file.path)
    assert(pin && pin.bytes === file.bytes && pin.sha256 === file.sha256, `Candidate file differs: ${file.path}`)
  }
}
export function validateSupplementalInputs(evidence, tree, map) {
  assert.equal(evidence.kind, 'baseline-missing-source-supplement-candidate')
  assert.equal(evidence.baselineMapSha256, BASELINE_MAP_SHA256)
  assert.equal(evidence.baselineBundleSha256, BASELINE_BUNDLE_SHA256)
  const mapped = new Set(map.sources.map(source => source.slice(3)))
  const expected = new Map(evidence.files.map(file => [safeRelative(file.path), file]))
  assert.equal(expected.size, evidence.files.length, 'Duplicate supplemental input path')
  assert.equal(expected.size, tree.files.length, 'Supplemental input set differs')
  for (const file of tree.files) {
    const pin = expected.get(file.path)
    assert(!mapped.has(file.path), `Supplement must not replace mapped source: ${file.path}`)
    assert(pin?.absentFromMappedInputs === true && pin.bytes === file.bytes && pin.sha256 === file.sha256, `Supplemental input differs: ${file.path}`)
  }
}
export function selectFeatureHypotheses(evidence) {
  assert.equal(evidence.kind, 'source-map-feature-hypotheses-not-proof')
  const enabled = [], disabledCandidates = [], conflicted = []
  for (const [name, votes] of Object.entries(evidence.byFeature)) {
    assert(Number.isSafeInteger(votes.true) && votes.true >= 0 && Number.isSafeInteger(votes.false) && votes.false >= 0, 'Invalid feature evidence count')
    if (votes.true && !votes.false) enabled.push(name)
    else if (votes.true && votes.false) conflicted.push(name)
    else if (votes.false) disabledCandidates.push(name)
  }
  return { enabled: enabled.sort(), disabledCandidates: disabledCandidates.sort(), conflicted: conflicted.sort(), unknownOrConflictedBuildDefault: false, defaultIsHypothesis: true }
}
export function validateRecipeOverrides(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Recipe overrides must be an object')
  assert(value.evidence && (typeof value.evidence === 'string' || typeof value.evidence === 'object'), 'Recipe overrides require an evidence field')
  for (const key of Object.keys(value)) assert(['features', 'additionalDefines', 'manualEntries', 'aliases', 'compilerUnresolvedRelative', 'evidence'].includes(key), `Unknown recipe override ${key}`)
  const features = value.features ?? [], additionalDefines = value.additionalDefines ?? {}, manualEntries = value.manualEntries ?? {}, aliases = value.aliases ?? {}
  assert(Array.isArray(features) && features.every(name => typeof name === 'string' && /^[A-Z0-9_]+$/.test(name)), 'Candidate features must be feature-name strings')
  for (const object of [additionalDefines, manualEntries, aliases]) assert(object && typeof object === 'object' && !Array.isArray(object), 'Recipe override entries must be objects')
  for (const [key, expression] of Object.entries(additionalDefines)) {
    assert(/^process\.env\.[A-Za-z_$][\w$]*$/.test(key) && typeof expression === 'string' && expression.length > 0, 'Additional defines must be process.env names with Bun expression strings')
  }
  for (const [specifier, entry] of Object.entries(manualEntries)) { safeRelative(specifier); safeRelative(entry) }
  for (const [specifier, entry] of Object.entries(aliases)) { safeRelative(specifier); safeRelative(entry) }
  const compilerUnresolvedRelative = validateCompilerUnresolvedRelativeRules(value.compilerUnresolvedRelative ?? [])
  return { features: [...new Set(features)].sort(), additionalDefines, manualEntries, aliases, compilerUnresolvedRelative, evidence: value.evidence, originalProfileEstablished: false }
}

export function validateCompilerUnresolvedRelativeRules(rules) {
  assert(Array.isArray(rules), 'compilerUnresolvedRelative must be an array')
  const seen = new Set()
  return rules.map(rule => {
    assert(rule && typeof rule === 'object' && !Array.isArray(rule) && Object.keys(rule).every(key => ['importer', 'specifier'].includes(key)), 'Missing-relative rules require only importer and specifier')
    safeRelative(rule.importer)
    assert(typeof rule.specifier === 'string' && /^(?:\.\/|\.\.\/)/.test(rule.specifier) && !rule.specifier.includes('\\') && !rule.specifier.includes('\0'), 'Compiler unresolved specifier must be an explicit relative path')
    const key = `${rule.importer}\0${rule.specifier}`
    assert(!seen.has(key), 'Duplicate compiler unresolved-relative rule')
    seen.add(key)
    return { importer: rule.importer, specifier: rule.specifier }
  })
}
