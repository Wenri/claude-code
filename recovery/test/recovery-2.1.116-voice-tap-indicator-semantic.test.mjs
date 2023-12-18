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

const baselineImpl = {
  index: 18751,
  start: 11593339,
  end: 11593528,
  sourceHash:
    '97bb0486231e18496f6784373a7e3d01e4df80a6453f335c36e89d78e2e04735',
}
const targetImpl = {
  index: 18961,
  start: 11669904,
  end: 11670507,
  sourceHash:
    '69a2989d1f6bb5c9d11995cce562cfc26ad12133b71f8d61f884b1fe563ab463',
}
const targetSelector = {
  index: 18962,
  start: 11670507,
  end: 11670561,
  sourceHash:
    'ea2de11ea365a6f6cccb61a69e18f7cd170d336101d739aab681d2d6bb171050',
}
const literalPins = [
  {
    row: 684,
    value: ' REC',
    start: 11670123,
    end: 11670129,
    source: '" REC"',
  },
  {
    row: 685,
    value: ' · tap to send',
    start: 11670164,
    end: 11670183,
    source: '" \\xB7 tap to send"',
  },
  {
    residueRow: 725,
    value: 'tap',
    start: 11669996,
    end: 11670001,
    source: '"tap"',
  },
  {
    residueRow: 728,
    value: 'voice',
    start: 11670541,
    end: 11670546,
    source: 'voice',
  },
]

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

async function instantiateIndicator(settings) {
  const ts = await loadTypeScript()
  const owner = source('src/components/PromptInput/VoiceIndicator.tsx')
  const sourceFile = ts.createSourceFile(
    'VoiceIndicator.tsx',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const names = new Set(['VoiceIndicatorImpl', 'selectVoiceMode'])
  const declarations = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      names.has(statement.name.text),
  )
  assert.equal(declarations.length, 2)
  const isolated = declarations
    .map(declaration => owner.slice(declaration.getStart(sourceFile), declaration.end))
    .join('\n')
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
  }
  const cache = Array(3).fill(Symbol.for('react.memo_cache_sentinel'))
  const module = { exports: {} }
  new Function(
    '_c',
    'React',
    'useAppState',
    'Text',
    'BLACK_CIRCLE',
    'ProcessingShimmer',
    'module',
    'exports',
    `${javascript}\nmodule.exports = { VoiceIndicatorImpl, selectVoiceMode }`,
  )(
    () => cache,
    React,
    selector => selector({ settings }),
    'Text',
    '●',
    'ProcessingShimmer',
    module,
    module.exports,
  )
  return module.exports
}

function flattenText(node) {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  return (node.children ?? []).map(flattenText).join('')
}

test('target 2.1.116 authenticates the tap-to-send voice indicator boundary', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  const baselineRegion = structural.unmatchedBaseline.find(
    unit => unit.index === baselineImpl.index,
  )
  assert.ok(baselineRegion)
  assert.deepEqual(
    [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
    [baselineImpl.start, baselineImpl.end, baselineImpl.sourceHash],
  )
  const baselineSource = baseline.slice(baselineImpl.start, baselineImpl.end)
  assert.equal(sha256(baselineSource), baselineImpl.sourceHash)
  assert.doesNotMatch(baselineSource, /tap| REC/)

  for (const unit of [targetImpl, targetSelector]) {
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
  }
  for (const pin of literalPins) {
    assert.equal(target.slice(pin.start, pin.end), pin.source)
  }
  assert.match(
    target.slice(targetSelector.start, targetSelector.end),
    /settings\.voice\?\.mode\?\?"hold"/,
  )
})

test('the exact owner—not TokenWarning—owns the tap mode and selector', sourceOptions, () => {
  const indicator = source('src/components/PromptInput/VoiceIndicator.tsx')
  const tokenWarning = source('src/components/TokenWarning.tsx')
  assert.match(indicator, /useAppState\(selectVoiceMode\)/)
  assert.match(indicator, /state\.settings\.voice\?\.mode \?\? "hold"/)
  assert.match(indicator, /\{BLACK_CIRCLE\} REC/)
  assert.match(indicator, / · tap to send/)
  assert.doesNotMatch(tokenWarning, /tap to send|selectVoiceMode/)
})

test('actual source renders tap, hold, processing, and idle modes exactly', sourceOptions, async () => {
  const tap = await instantiateIndicator({ voice: { mode: 'tap' } })
  assert.equal(tap.selectVoiceMode({ settings: { voice: { mode: 'tap' } } }), 'tap')
  assert.equal(tap.selectVoiceMode({ settings: {} }), 'hold')
  const tapNode = tap.VoiceIndicatorImpl({ voiceState: 'recording' })
  assert.equal(flattenText(tapNode), '● REC · tap to send')
  assert.equal(tapNode.children[0].props.color, 'error')
  assert.equal(tapNode.children[1].props.dimColor, true)

  const hold = await instantiateIndicator({ voice: { mode: 'hold' } })
  const holdNode = hold.VoiceIndicatorImpl({ voiceState: 'recording' })
  assert.equal(flattenText(holdNode), 'listening…')
  assert.equal(holdNode.props.dimColor, true)
  assert.equal(hold.VoiceIndicatorImpl({ voiceState: 'processing' }).type, 'ProcessingShimmer')
  assert.equal(hold.VoiceIndicatorImpl({ voiceState: 'idle' }), null)
})
