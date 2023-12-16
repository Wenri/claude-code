import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const baselineUnits = {
  exports: [
    17550,
    10941211,
    10944367,
    'f8543462ea83e5bd55810d72747bc623c97b06dbc720a5606d7512d3999132f0',
  ],
  scanner: [
    17648,
    10974616,
    10975652,
    '6db48c06ed8e1b1dd064bcde6f847f09aa4e28ba1bf6285d33578617014b1fe3',
  ],
  loader: [
    17650,
    10975832,
    10979204,
    '00d7c6c6f86e329c80b14de2b16920469292f401a1db836f55d96e4ebe502cc4',
  ],
  initializer: [
    17687,
    10993075,
    10993204,
    'b9b12f2761a87299cb3a43e654333eed27a6d2dab5d6200bcc60971d089adca7',
  ],
}

const targetUnits = {
  exports: [
    17741,
    11010110,
    11013357,
    'a9d2a77686f90b7365cdcfbda36a58951c92acb41a30dfa016b878b5e4627ddf',
  ],
  scanner: [
    17842,
    11044749,
    11047074,
    '202894c4444e56bd550858212535121853cf6706fe6d659bd8d8a9e85fc9c613',
  ],
  loader: [
    17844,
    11047254,
    11050992,
    '7cbb9f9e7ed516fbbf881fb1ab83a8413e24270a7a956d866429f28c7fdfaae3',
  ],
  initializer: [
    17881,
    11064863,
    11065013,
    '8516442ea0848a595b06c691128f12110d53660c0e1313230236b12c70aa28ac',
  ],
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function exactNumericOccurrences(contents, value) {
  const pattern = new RegExp(`(?<!\\d)${value}(?!\\d)`, 'g')
  return [...contents.matchAll(pattern)].length
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function instantiateSourceScanner() {
  const ts = await loadTypeScript()
  const text = source('src/utils/sessionStorage.ts')
  const file = ts.createSourceFile(
    'sessionStorage.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const variableNames = new Set([
    'TRANSCRIPT_SCAN_CHUNK_SIZE',
    'INDEX_HEAD_SCAN_BYTES',
    'INDEX_BOUNDARY_SCAN_BYTES',
  ])
  const functionNames = new Set([
    'findDepthOneKey',
    'pickDepthOneUuidCandidate',
    'parseTranscriptLine',
    'scanLargeTranscript',
  ])
  const declarations = []

  for (const statement of file.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration =>
          ts.isIdentifier(declaration.name) &&
          variableNames.has(declaration.name.text),
      )
    ) {
      declarations.push(text.slice(statement.getStart(file), statement.end))
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      functionNames.has(statement.name.text)
    ) {
      declarations.push(text.slice(statement.getStart(file), statement.end))
    }
  }

  assert.equal(declarations.length, 7)
  const result = ts.transpileModule(
    `${declarations.join('\n')}\nmodule.exports = { scanLargeTranscript, INDEX_HEAD_SCAN_BYTES, INDEX_BOUNDARY_SCAN_BYTES }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    },
  )
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [])

  const module = { exports: {} }
  new Function(
    'exports',
    'module',
    'Buffer',
    'openSync',
    'readSync',
    'closeSync',
    'jsonParse',
    result.outputText,
  )(
    module.exports,
    module,
    Buffer,
    fs.openSync,
    fs.readSync,
    fs.closeSync,
    JSON.parse,
  )
  return module.exports
}

function uuid(value) {
  return `${String(value).padStart(8, '0')}-0000-4000-8000-000000000000`
}

function transcriptEntry(id, parentUuid, extra = {}) {
  return {
    parentUuid,
    ...extra,
    uuid: uuid(id),
    timestamp: '2026-08-12T00:00:00.000Z',
    type: 'user',
    message: { role: 'user', content: `message-${id}` },
  }
}

test(
  'target116 authenticates the exported two-pass session index graph',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(baselineBytes.length, 12_986_755)
    assert.equal(targetBytes.length, 13_102_272)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [name, [index, start, end, hash]] of Object.entries(
      baselineUnits,
    )) {
      const unit = structural.unmatchedBaseline.find(item => item.index === index)
      assert.ok(unit, `${name}: unmatched baseline unit`)
      assert.deepEqual([unit.start, unit.end, unit.sourceHash], [start, end, hash])
      assert.equal(sha256(baseline.slice(start, end)), hash)
    }
    for (const [name, [index, start, end, hash]] of Object.entries(
      targetUnits,
    )) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${name}: classification`)
      assert.deepEqual(
        [
          region.target.index,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [index, start, end, hash],
      )
      assert.equal(sha256(target.slice(start, end)), hash)
    }

    assert.equal((baseline.match(/INDEX_HEAD_SCAN_BYTES/g) ?? []).length, 0)
    assert.equal((baseline.match(/INDEX_BOUNDARY_SCAN_BYTES/g) ?? []).length, 0)
    assert.equal((target.match(/INDEX_HEAD_SCAN_BYTES/g) ?? []).length, 1)
    assert.equal((target.match(/INDEX_BOUNDARY_SCAN_BYTES/g) ?? []).length, 1)
    assert.equal(target.slice(11013263, 11013284), 'INDEX_HEAD_SCAN_BYTES')
    assert.equal(target.slice(11013293, 11013318), 'INDEX_BOUNDARY_SCAN_BYTES')

    const targetExports = target.slice(
      targetUnits.exports[1],
      targetUnits.exports[2],
    )
    const targetInitializer = target.slice(
      targetUnits.initializer[1],
      targetUnits.initializer[2],
    )
    const targetScanner = target.slice(
      targetUnits.scanner[1],
      targetUnits.scanner[2],
    )
    const targetLoader = target.slice(
      targetUnits.loader[1],
      targetUnits.loader[2],
    )
    const headBinding = targetExports.match(
      /INDEX_HEAD_SCAN_BYTES:\(\)=>([\w$]+)/,
    )?.[1]
    const boundaryBinding = targetExports.match(
      /INDEX_BOUNDARY_SCAN_BYTES:\(\)=>([\w$]+)/,
    )?.[1]
    assert.equal(headBinding, 'Il7')
    assert.equal(boundaryBinding, 'Rl7')
    assert.match(targetInitializer, /Il7=256,Rl7=4096/)
    assert.ok(targetScanner.includes(`S=${headBinding},F=${boundaryBinding}`))
    assert.match(targetScanner, /_H<=F\?n:n\.subarray\(0,F\)/)
    assert.match(targetScanner, /_H<=S\?n:n\.subarray\(0,S\)/)
    assert.match(targetScanner, /if\(!_&&!C\)/)
    assert.match(targetLoader, /Vp1\(H,C,y,\(\)=>\{/)
    assert.match(targetLoader, /\$\?\.keepAllLeaves\?\?!1/)

    const baselineExports = baseline.slice(
      baselineUnits.exports[1],
      baselineUnits.exports[2],
    )
    const baselineScanner = baseline.slice(
      baselineUnits.scanner[1],
      baselineUnits.scanner[2],
    )
    assert.doesNotMatch(baselineExports, /INDEX_(?:HEAD|BOUNDARY)_SCAN_BYTES/)
    assert.doesNotMatch(baselineScanner, /"parentUuid":/)
    assert.doesNotMatch(baselineScanner, /isSidechain/)

    // Both session-storage 50 MiB bindings already existed in 2.1.114. The
    // global 5 -> 6 literal count is an unrelated git limit change, not part
    // of this index graph.
    const baselineInitializer = baseline.slice(
      baselineUnits.initializer[1],
      baselineUnits.initializer[2],
    )
    assert.equal(exactNumericOccurrences(baselineInitializer, 52428800), 2)
    assert.equal(exactNumericOccurrences(targetInitializer, 52428800), 2)
    assert.equal(exactNumericOccurrences(baseline, 52428800), 5)
    assert.equal(exactNumericOccurrences(target, 52428800), 6)
  },
)

test(
  'source exports the official index thresholds and routes both probes through them',
  sourceOptions,
  async () => {
    const ts = await loadTypeScript()
    const contents = source('src/utils/sessionStorage.ts')
    const file = ts.createSourceFile(
      'sessionStorage.ts',
      contents,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const constants = new Map()
    for (const statement of file.statements) {
      if (!ts.isVariableStatement(statement)) continue
      const exported = statement.modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        if (
          declaration.name.text === 'INDEX_HEAD_SCAN_BYTES' ||
          declaration.name.text === 'INDEX_BOUNDARY_SCAN_BYTES'
        ) {
          constants.set(declaration.name.text, {
            exported,
            initializer: declaration.initializer?.getText(file),
          })
        }
      }
    }
    assert.deepEqual(constants.get('INDEX_HEAD_SCAN_BYTES'), {
      exported: true,
      initializer: '256',
    })
    assert.deepEqual(constants.get('INDEX_BOUNDARY_SCAN_BYTES'), {
      exported: true,
      initializer: '4096',
    })
    assert.doesNotMatch(contents, /SIDECHAIN_PROBE_BYTES/)
    assert.doesNotMatch(contents, /COMPACT_BOUNDARY_PROBE_BYTES/)

    const scanner = file.statements.find(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === 'scanLargeTranscript',
    )
    assert.ok(scanner, 'scanLargeTranscript declaration')
    const scannerText = contents.slice(scanner.getStart(file), scanner.end)
    assert.equal((scannerText.match(/INDEX_HEAD_SCAN_BYTES/g) ?? []).length, 2)
    assert.equal(
      (scannerText.match(/INDEX_BOUNDARY_SCAN_BYTES/g) ?? []).length,
      2,
    )
    assert.match(scannerText, /let selectedOffsets: Set<number> \| null = null/)
    assert.match(scannerText, /if \(!keepAllLeaves && !hasPreservedSegment\)/)

    const loader = file.statements.find(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === 'loadTranscriptFile',
    )
    assert.ok(loader, 'loadTranscriptFile declaration')
    const loaderText = contents.slice(loader.getStart(file), loader.end)
    assert.match(loaderText, /const scan = scanLargeTranscript\(/)
    assert.match(loaderText, /opts\?\.keepAllLeaves \?\? false/)
  },
)

test(
  'source scanner prunes dead and sidechain leaves while retaining metadata and boundaries',
  sourceOptions,
  async t => {
    const {
      scanLargeTranscript,
      INDEX_HEAD_SCAN_BYTES,
      INDEX_BOUNDARY_SCAN_BYTES,
    } = await instantiateSourceScanner()
    assert.equal(INDEX_HEAD_SCAN_BYTES, 256)
    assert.equal(INDEX_BOUNDARY_SCAN_BYTES, 4096)

    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'claude-session-index-'),
    )
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }))

    const transcriptPath = path.join(temporaryDirectory, 'branches.jsonl')
    const attribution = {
      type: 'attribution-snapshot',
      messageId: uuid(3),
      snapshot: {},
    }
    const lines = [
      transcriptEntry(1, null),
      { type: 'summary', leafUuid: uuid(1), summary: 'metadata' },
      transcriptEntry(2, uuid(1)),
      transcriptEntry(3, uuid(1)),
      transcriptEntry(4, uuid(3), { isSidechain: true }),
      attribution,
    ]
    fs.writeFileSync(
      transcriptPath,
      `${lines.map(line => JSON.stringify(line)).join('\n')}\n`,
    )

    const visit = keepAllLeaves => {
      const entries = []
      let resetCount = 0
      const result = scanLargeTranscript(
        transcriptPath,
        fs.statSync(transcriptPath).size,
        entry => entries.push(entry),
        () => resetCount++,
        keepAllLeaves,
      )
      return { entries, resetCount, result }
    }

    const selected = visit(false)
    assert.deepEqual(
      selected.entries.map(entry => entry.uuid ?? entry.type),
      [uuid(1), 'summary', uuid(3)],
    )
    assert.equal(selected.resetCount, 0)
    const transcriptBytes = fs.readFileSync(transcriptPath)
    assert.equal(
      JSON.parse(
        transcriptBytes
          .subarray(
            selected.result.lastAttributionOffset,
            selected.result.lastAttributionOffset +
              selected.result.lastAttributionLength,
          )
          .toString('utf8'),
      ).type,
      'attribution-snapshot',
    )

    const allLeaves = visit(true)
    assert.deepEqual(
      allLeaves.entries.map(entry => entry.uuid ?? entry.type),
      [uuid(1), 'summary', uuid(2), uuid(3), uuid(4)],
    )

    const boundaryPath = path.join(temporaryDirectory, 'boundary.jsonl')
    const boundary = {
      parentUuid: uuid(10),
      uuid: uuid(11),
      timestamp: '2026-08-12T00:00:00.000Z',
      type: 'system',
      subtype: 'compact_boundary',
      compactMetadata: { trigger: 'manual' },
    }
    fs.writeFileSync(
      boundaryPath,
      `${[
        transcriptEntry(10, null),
        { type: 'tag', sessionId: uuid(10), tag: 'keep-me' },
        boundary,
        transcriptEntry(12, uuid(11)),
      ]
        .map(line => JSON.stringify(line))
        .join('\n')}\n`,
    )
    const events = []
    scanLargeTranscript(
      boundaryPath,
      fs.statSync(boundaryPath).size,
      entry => events.push(entry.uuid ?? entry.type),
      () => events.push('reset'),
      false,
    )
    assert.deepEqual(events, ['tag', 'reset', uuid(11), uuid(12)])
  },
)
