import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnit = {
  index: 18709,
  start: 11577413,
  end: 11577539,
  sourceHash:
    '34de29b304564b676cbc01563a46af8407b61a126f62593addf20618345b5cc5',
}
const targetUnit = {
  index: 18919,
  start: 11653377,
  end: 11653532,
  sourceHash:
    'ee48bc7b94a3eebe4c57b4b3075cb2b827c52958389b27a4f553dc7584819cca',
}
const typedRow = {
  historicalRow: 745,
  currentRow: 678,
  literalKind: 'property',
  value: 'voice',
  baselineOccurrenceCount: 8,
  targetOccurrenceNumber: 9,
  start: 11653418,
  end: 11653423,
  structuralIndex: 18919,
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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
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

async function instantiateUseVoiceEnabled({ settings, authed, gate }) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source('src/hooks/useVoiceEnabled.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const state = { settings, authVersion: 7 }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'react') return { useMemo: factory => factory() }
    if (specifier.endsWith('/state/AppState.js')) {
      return { useAppState: selector => selector(state) }
    }
    if (specifier.endsWith('/voice/voiceModeEnabled.js')) {
      return {
        hasVoiceAuth: () => authed,
        isVoiceGrowthBookEnabled: () => gate,
      }
    }
    throw new Error(`unexpected useVoiceEnabled import: ${specifier}`)
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return module.exports.useVoiceEnabled
}

test('target116 authenticates nested voice-setting precedence', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const baselineRegion = structural.unmatchedBaseline.find(
    region => region.index === baselineUnit.index,
  )
  assert.ok(baselineRegion)
  assert.deepEqual(
    [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
    [baselineUnit.start, baselineUnit.end, baselineUnit.sourceHash],
  )
  const baselineOwner = baseline.slice(baselineUnit.start, baselineUnit.end)
  assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)

  const targetRegion = structural.regions[targetUnit.index]
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      targetRegion.target.start,
      targetRegion.target.end,
      targetRegion.target.sourceHash,
    ],
    [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
  )
  const targetOwner = target.slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(targetOwner), targetUnit.sourceHash)

  assert.equal(typedRow.structuralIndex, targetUnit.index)
  assert.equal(target.slice(typedRow.start, typedRow.end), typedRow.value)
  assert.equal(typedRow.literalKind, 'property')
  assert.equal(typedRow.baselineOccurrenceCount, 8)
  assert.equal(typedRow.targetOccurrenceNumber, 9)
  assert.match(baselineOwner, /settings\.voiceEnabled===!0/)
  assert.doesNotMatch(baselineOwner, /settings\.voice\?\.enabled/)
  assert.match(
    targetOwner,
    /\(K\.settings\.voice\?\.enabled\?\?K\.settings\.voiceEnabled\)===!0/,
  )
})

test('source honors nested voice.enabled before the legacy setting', sourceOptions, async () => {
  const owner = source('src/hooks/useVoiceEnabled.ts')
  assert.match(
    owner,
    /\(s\.settings\.voice\?\.enabled \?\? s\.settings\.voiceEnabled\) === true/,
  )

  const cases = [
    [{ voice: { enabled: true }, voiceEnabled: false }, true],
    [{ voice: { enabled: false }, voiceEnabled: true }, false],
    [{ voice: {}, voiceEnabled: true }, true],
    [{ voiceEnabled: false }, false],
    [{}, false],
  ]
  for (const [settings, expected] of cases) {
    const useVoiceEnabled = await instantiateUseVoiceEnabled({
      settings,
      authed: true,
      gate: true,
    })
    assert.equal(useVoiceEnabled(), expected)
  }

  const blockedByAuth = await instantiateUseVoiceEnabled({
    settings: { voice: { enabled: true } },
    authed: false,
    gate: true,
  })
  assert.equal(blockedByAuth(), false)

  const blockedByGate = await instantiateUseVoiceEnabled({
    settings: { voice: { enabled: true } },
    authed: true,
    gate: false,
  })
  assert.equal(blockedByGate(), false)
})
