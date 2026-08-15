import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const introCase = '2.1.88-to-2.1.89'
const gateCase = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected =
  !semanticCase || semanticCase === introCase || semanticCase === gateCase
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const historicalSource = Boolean(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)

const bundlePaths = {
  88: process.env.CLAUDE_CODE_2_1_88_BUNDLE,
  89: process.env.CLAUDE_CODE_2_1_89_BUNDLE,
  90: process.env.CLAUDE_CODE_2_1_90_BUNDLE,
}
const bundles = {
  88: {
    bytes: 13_047_043,
    sha256:
      '75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f',
  },
  89: {
    bytes: 13_081_065,
    sha256:
      'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01',
  },
  90: {
    bytes: 13_128_331,
    sha256:
      '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9',
  },
}

const units = {
  baselineRepl88: {
    index: 17518,
    start: 12302612,
    end: 12355644,
    sourceHash:
      'a234ae26236017d1922ca972eb7609e7798448ebc155673449a6d72953978a9e',
  },
  helper89: {
    index: 12720,
    start: 9740292,
    end: 9740415,
    sourceHash:
      '086bf93c3c6823d3385ad12ddaad7379afab6baf86d4f004610e2e270c269572',
  },
  repl89: {
    index: 17571,
    start: 12328906,
    end: 12383754,
    sourceHash:
      'a914114a938b388df395f839d047e06bfeea5246fb67e321721098177bfdc943',
  },
  helper90: {
    index: 12763,
    start: 9754350,
    end: 9754473,
    sourceHash:
      '16ff688e957840b0c26318191a88e3189439936bfd01b1e6bd4eef6bb7682276',
  },
  repl90: {
    index: 17664,
    start: 12374084,
    end: 12429086,
    sourceHash:
      '7e05eb2169ee606c7091e321a21e8fd764a257361e09bef97422bb801d762366',
  },
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const introOptions = {
  skip:
    semanticCase && semanticCase !== introCase
      ? `not applicable to ${semanticCase}`
      : !bundlePaths[88] || !bundlePaths[89]
        ? 'CLAUDE_CODE_2_1_88_BUNDLE and CLAUDE_CODE_2_1_89_BUNDLE are required'
        : false,
}
const gateOptions = {
  skip:
    semanticCase && semanticCase !== gateCase
      ? `not applicable to ${semanticCase}`
      : !bundlePaths[89] || !bundlePaths[90]
        ? 'CLAUDE_CODE_2_1_89_BUNDLE and CLAUDE_CODE_2_1_90_BUNDLE are required'
        : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function readBundle(version) {
  const bytes = fs.readFileSync(bundlePaths[version])
  assert.equal(bytes.length, bundles[version].bytes, `${version}: byte length`)
  assert.equal(sha256(bytes), bundles[version].sha256, `${version}: SHA-256`)
  return bytes.toString('utf8')
}

function structural(caseName) {
  return JSON.parse(
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
}

function assertTargetUnit(report, bundle, identity, classification) {
  const region = report.regions[identity.index]
  assert.equal(region.classification, classification)
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    [identity.start, identity.end, identity.sourceHash],
  )
  const unit = bundle.slice(identity.start, identity.end)
  assert.equal(sha256(unit), identity.sourceHash)
  return unit
}

function assertBaselineUnit(report, bundle, identity) {
  const unit = report.unmatchedBaseline.find(item => item.index === identity.index)
  assert.ok(unit, `${identity.index}: unmatched baseline unit`)
  assert.deepEqual(
    [unit.start, unit.end, unit.sourceHash],
    [identity.start, identity.end, identity.sourceHash],
  )
  const bytes = bundle.slice(identity.start, identity.end)
  assert.equal(sha256(bytes), identity.sourceHash)
  return bytes
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

async function loadHelper() {
  const owner = source('utils/messages.ts')
  const start = owner.indexOf('export function appendOrReplaceMessageByUuid(')
  const end = owner.indexOf('\nexport function ', start + 1)
  assert.ok(start >= 0 && end > start, 'UUID replacement helper source range')
  const ts = await loadTypeScript()
  const result = ts.transpileModule(owner.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [])
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports.appendOrReplaceMessageByUuid
}

test('target89 introduces UUID-stable append-or-replace behavior', introOptions, () => {
  const before = readBundle(88)
  const after = readBundle(89)
  const report = structural(introCase)
  const baselineRepl = assertBaselineUnit(
    report,
    before,
    units.baselineRepl88,
  )
  const helper = assertTargetUnit(
    report,
    after,
    units.helper89,
    'unresolved',
  )
  const repl = assertTargetUnit(report, after, units.repl89, 'unresolved')

  assert.equal(baselineRepl.includes('findLastIndex'), false)
  assert.equal(before.includes('findLastIndex((z)=>z.uuid==='), false)
  assert.ok(helper.includes('findLastIndex'))
  assert.ok(helper.includes('.filter('))
  assert.ok(repl.includes('Q0K(m8,E8)'))
})

test('target90 limits UUID replacement to fullscreen rendering', gateOptions, () => {
  const before = readBundle(89)
  const after = readBundle(90)
  const report = structural(gateCase)
  const helper = assertTargetUnit(report, after, units.helper90, 'matched')
  const repl = assertTargetUnit(report, after, units.repl90, 'unresolved')

  assert.equal(
    sha256(before.slice(units.helper89.start, units.helper89.end)),
    units.helper89.sourceHash,
  )
  assert.ok(helper.includes('findLastIndex'))
  assert.ok(repl.includes('R4()?nGK(d8,h8):[...d8,h8]'))
  assert.ok(
    after
      .slice(6988842, 6989114)
      .includes('CLAUDE_CODE_NO_FLICKER'),
  )
})

test('source preserves order, removes stale UUID copies, and keeps the fullscreen gate', sourceOptions, async () => {
  const helper = await loadHelper()
  const first = { uuid: 'first' }
  const replacement = { uuid: 'same', version: 2 }
  const original = [first, { uuid: 'same', version: 0 }, { uuid: 'tail' }, { uuid: 'same', version: 1 }]

  const appended = helper([first], replacement)
  assert.deepEqual(appended, [first, replacement])
  assert.notEqual(appended, original)
  assert.deepEqual(helper(original, replacement), [first, { uuid: 'tail' }, replacement])
  assert.deepEqual(original.map(item => item.version), [undefined, 0, undefined, 1])

  const repl = source('screens/REPL.tsx')
  if (historicalSource && semanticCase === introCase) {
    assert.ok(
      repl.includes(
        'setMessages(oldMessages => appendOrReplaceMessageByUuid(oldMessages, newMessage))',
      ),
    )
  } else if (historicalSource && semanticCase === gateCase) {
    assert.ok(repl.includes('setMessages(oldMessages => isFullscreenEnvEnabled()'))
    assert.ok(repl.includes('? appendOrReplaceMessageByUuid(oldMessages, newMessage)'))
    assert.ok(repl.includes(': [...oldMessages, newMessage]'))
  } else {
    assert.ok(repl.includes('if (isFullscreenEnvEnabled())'))
    assert.ok(
      repl.includes(
        'updater: oldMessages => appendOrReplaceMessageByUuid(oldMessages, newMessage)',
      ),
    )
    assert.ok(repl.includes("applyMessageOp({ type: 'append', messages: [newMessage] })"))
  }
})
