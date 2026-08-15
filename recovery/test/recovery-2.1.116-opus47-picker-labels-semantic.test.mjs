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

const boundaries = [
  {
    factory: 'getOpus47Option',
    baseline: {
      index: 13214,
      start: 8434531,
      end: 8434752,
      sourceHash:
        'f9b0d3d88995594ea0ea69ba2641b839173a004af06ec4bfc1dde8ba78267059',
      label: 'Opus',
    },
    target: {
      index: 13358,
      start: 8484730,
      end: 8484955,
      sourceHash:
        '0b5921caa49c1b354e00ffaed41e93df62c8ed063b4056f84e2ec6e02e23dc5f',
      label: 'Opus 4.7',
      literalStart: 8484797,
      literalEnd: 8484807,
      historicalRow: 368,
      currentRow: 350,
    },
  },
  {
    factory: 'getOpus47_1MOption',
    baseline: {
      index: 13217,
      start: 8435287,
      end: 8435547,
      sourceHash:
        '7992872ec98981576ec97eb582b0ca8a0efcab898f8f3ffa8679ef883ba7506f',
      label: 'Opus (1M context)',
    },
    target: {
      index: 13361,
      start: 8485490,
      end: 8485754,
      sourceHash:
        '8c0344616398dfceb1f29083f3441be6c17d6ee4ca45ba034058c0edeb4f4930',
      label: 'Opus 4.7 (1M context)',
      literalStart: 8485568,
      literalEnd: 8485591,
      historicalRow: 369,
      currentRow: 351,
    },
  },
  {
    factory: 'getMaxOpus47_1MOption',
    baseline: {
      index: 13225,
      start: 8436897,
      end: 8437105,
      sourceHash:
        '8e770cf16edc7af4bed616219d3eac267baaf0f7a422b85d1bfa2df404512da0',
      label: 'Opus (1M context)',
    },
    target: {
      index: 13369,
      start: 8487104,
      end: 8487316,
      sourceHash:
        '05501fb85cd345b84db8bb1fce817a419e9c640b837aec3751604e9cbc521394',
      label: 'Opus 4.7 (1M context)',
      literalStart: 8487214,
      literalEnd: 8487237,
      historicalRow: 370,
      currentRow: 352,
    },
  },
  {
    factory: 'getMergedOpus1MOption',
    baseline: {
      index: 13226,
      start: 8437105,
      end: 8437398,
      sourceHash:
        '237ace6ebe7ddc9243ed005e4727f3675be1a6e9ac2c826b4294d94e8f0b730c',
      label: 'Opus (1M context)',
    },
    target: {
      index: 13370,
      start: 8487316,
      end: 8487613,
      sourceHash:
        '3d4f9bb6cfd873b5211c5b9f0443cc6467f683a1fb920b27965547e9f48b8d5c',
      label: 'Opus 4.7 (1M context)',
      literalStart: 8487398,
      literalEnd: 8487421,
      historicalRow: 371,
      currentRow: 353,
    },
  },
]

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
const pairOptions = {
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

function inertModule() {
  const noop = () => undefined
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === '__esModule') return true
        return noop
      },
    },
  )
}

async function executeOwner({ direct, subscriber }) {
  let contents = source('src/utils/model/modelOptions.ts')
  for (const declaration of [
    'function getOpus47Option()',
    'function getMergedOpus1MOption(',
  ]) {
    const occurrences = contents.split(declaration).length - 1
    assert.equal(occurrences, 1, `${declaration} must remain uniquely injectable`)
    contents = contents.replace(declaration, `export ${declaration}`)
  }

  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier.endsWith('/auth.js')) {
      return {
        isClaudeAISubscriber: () => subscriber,
        isMaxSubscriber: () => false,
        isTeamPremiumSubscriber: () => false,
      }
    }
    if (specifier.endsWith('/modelStrings.js')) {
      return {
        getModelStrings: () => ({ opus47: 'vendor-opus-4-7' }),
      }
    }
    if (specifier.endsWith('/modelCost.js')) {
      return {
        COST_TIER_3_15: {},
        COST_TIER_5_25: {},
        COST_HAIKU_35: {},
        COST_HAIKU_45: {},
        formatModelPricing: () => '$5/$25 per Mtok',
      }
    }
    if (specifier.endsWith('/providers.js')) {
      return {
        getAPIProvider: () => (direct ? 'firstParty' : 'bedrock'),
        isDirectAnthropicAPIProvider: () => direct,
      }
    }
    if (specifier.endsWith('/settings.js')) {
      return { getSettings_DEPRECATED: () => undefined }
    }
    return inertModule()
  }
  new Function('require', 'exports', 'module', 'process', javascript)(
    requireStub,
    module.exports,
    module,
    process,
  )
  return module.exports
}

test('target116 authenticates the four Opus 4.7 picker-label boundaries', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const boundary of boundaries) {
    const baselineRegion = structural.unmatchedBaseline.find(
      candidate => candidate.index === boundary.baseline.index,
    )
    assert.ok(baselineRegion, `baseline unit ${boundary.baseline.index}`)
    assert.deepEqual(
      [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
      [
        boundary.baseline.start,
        boundary.baseline.end,
        boundary.baseline.sourceHash,
      ],
    )
    const baselineFunction = baseline.slice(
      boundary.baseline.start,
      boundary.baseline.end,
    )
    assert.equal(sha256(baselineFunction), boundary.baseline.sourceHash)
    assert.ok(
      baselineFunction.includes(
        `label:${JSON.stringify(boundary.baseline.label)}`,
      ),
    )

    const targetRegion = structural.regions[boundary.target.index]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.sourceHash,
      ],
      [boundary.target.start, boundary.target.end, boundary.target.sourceHash],
    )
    const targetFunction = target.slice(
      boundary.target.start,
      boundary.target.end,
    )
    assert.equal(sha256(targetFunction), boundary.target.sourceHash)
    assert.ok(
      targetFunction.includes(`label:${JSON.stringify(boundary.target.label)}`),
    )
    assert.equal(
      target.slice(boundary.target.literalStart, boundary.target.literalEnd),
      JSON.stringify(boundary.target.label),
      `added-owner rows historical=${boundary.target.historicalRow} current=${boundary.target.currentRow}`,
    )
  }
})

test('source labels Opus 4.7 consistently for every provider and billing branch', sourceOptions, async () => {
  for (const scenario of [
    { name: 'first-party PAYG', direct: true, subscriber: false },
    { name: 'first-party subscriber', direct: true, subscriber: true },
    { name: 'third-party', direct: false, subscriber: false },
  ]) {
    const owner = await executeOwner(scenario)
    for (const boundary of boundaries) {
      assert.equal(
        owner[boundary.factory]().label,
        boundary.target.label,
        `${scenario.name}: ${boundary.factory}`,
      )
    }
  }
})
