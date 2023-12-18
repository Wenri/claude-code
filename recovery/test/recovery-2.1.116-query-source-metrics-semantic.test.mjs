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
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const units = {
  baselineCost: {
    index: 9661,
    start: 4856247,
    end: 4856952,
    sourceHash:
      '69ac687a2d3347a986438cc5b31a0694da28e3a408a09dfb1fb418f96380c8ce',
  },
  baselineCaller: {
    index: 18046,
    start: 11161578,
    end: 11182480,
    sourceHash:
      '28ea106cf36db06ec6e8af62a52b3846e3c18d0c8d9b7328b918b679395cf61a',
  },
  classifier: {
    index: 9718,
    start: 4873684,
    end: 4873886,
    sourceHash:
      '79f877a9009adb1a24d6bf260b5b9613ffd3692f2a2046b5bd9ead925da4b582',
  },
  targetCost: {
    index: 9761,
    start: 4886037,
    end: 4886774,
    sourceHash:
      '1b998226e632085522a0e062506e8053ffdbcfd637049bf5d1bcd23c67a01d40',
  },
  vcrCaller: {
    index: 14284,
    start: 8992005,
    end: 8992117,
    sourceHash:
      'f003e09b5db455b6e7c0063c303d26f175018a3ca9a1574fdf19caee0fff729c',
  },
  targetCaller: {
    index: 18244,
    start: 11235477,
    end: 11256379,
    sourceHash:
      '0d503be293dff9130a38e5d4ed4d1dadcde12cc00e0f97f1dcd24f4c67f9f157',
  },
}
const typedAuxiliaryRow = {
  historicalRow: 363,
  currentRow: 329,
  literalKind: 'string',
  value: 'auxiliary',
  start: 4873874,
  end: 4873885,
  structuralIndex: 9718,
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
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
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

async function instantiateCostTracker({ fastMode = false } = {}) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source('cost-tracker.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const counterAdds = []
  const modelUsage = new Map()
  const counter = kind => ({
    add(value, attrs) {
      counterAdds.push({ kind, value, attrs })
    },
  })
  const state = {
    addToTotalCostState() {},
    getCostCounter: () => counter('cost'),
    getTokenCounter: () => counter('token'),
    getUsageForModel(model) {
      if (!modelUsage.has(model)) {
        modelUsage.set(model, {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
          costUSD: 0,
          contextWindow: 0,
          maxOutputTokens: 0,
        })
      }
      return modelUsage.get(model)
    },
    getSdkBetas: () => [],
  }
  const requireStub = specifier => {
    if (specifier === 'chalk') {
      return { __esModule: true, default: { dim: value => value } }
    }
    if (specifier.endsWith('/bootstrap/state.js')) {
      return new Proxy(state, { get: (target, property) => target[property] ?? (() => 0) })
    }
    if (specifier.endsWith('/services/analytics/index.js')) {
      return { logEvent() {} }
    }
    if (specifier.endsWith('/utils/advisor.js')) {
      return { getAdvisorUsage: usage => usage.advisor_usage ?? [] }
    }
    if (specifier.endsWith('/utils/config.js')) {
      return {
        getCurrentProjectConfig: () => ({}),
        saveCurrentProjectConfig() {},
      }
    }
    if (specifier.endsWith('/utils/context.js')) {
      return {
        getContextWindowForModel: () => 200_000,
        getModelMaxOutputTokens: () => ({ default: 32_000 }),
      }
    }
    if (specifier.endsWith('/utils/fastMode.js')) {
      return { isFastModeEnabled: () => fastMode }
    }
    if (specifier.endsWith('/utils/format.js')) {
      return { formatDuration: String, formatNumber: String }
    }
    if (specifier.endsWith('/utils/gracefulShutdown.js')) {
      return { isShuttingDown: () => false }
    }
    if (specifier.endsWith('/utils/model/model.js')) {
      return { getCanonicalName: value => value }
    }
    if (specifier.endsWith('/utils/modelCost.js')) {
      return { calculateUSDCost: () => 0.25 }
    }
    throw new Error(`unexpected cost-tracker import: ${specifier}`)
  }
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return { tracker: module.exports, counterAdds }
}

function usage(overrides = {}) {
  return {
    input_tokens: 3,
    output_tokens: 5,
    cache_read_input_tokens: 7,
    cache_creation_input_tokens: 11,
    ...overrides,
  }
}

test('authenticated target116 adds query-source dimensions to cost and token metrics', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const unit of [units.baselineCost, units.baselineCaller]) {
    const region = structural.unmatchedBaseline.find(
      candidate => candidate.index === unit.index,
    )
    assert.ok(region)
    assert.deepEqual(
      [region.start, region.end, region.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(baseline.slice(unit.start, unit.end)), unit.sourceHash)
  }
  for (const unit of [
    units.classifier,
    units.targetCost,
    units.vcrCaller,
    units.targetCaller,
  ]) {
    const region = structural.regions[unit.index]
    assert.ok(region)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
  }

  assert.equal(
    target.slice(typedAuxiliaryRow.start, typedAuxiliaryRow.end),
    JSON.stringify(typedAuxiliaryRow.value),
  )
  assert.equal(typedAuxiliaryRow.structuralIndex, units.classifier.index)
  assert.equal(baseline.split('"auxiliary"').length - 1, 0)
  assert.equal(target.split('"auxiliary"').length - 1, 1)

  const classifier = target.slice(units.classifier.start, units.classifier.end)
  assert.match(classifier, /startsWith\("repl_main_thread"\)\|\|[^|]+==="sdk"/)
  assert.match(classifier, /startsWith\("agent:"\)/)
  assert.match(classifier, /==="hook_agent"\|\|[^|]+==="verification_agent"/)

  const targetCost = target.slice(units.targetCost.start, units.targetCost.end)
  const targetCostName = /^function ([A-Za-z_$][\w$]*)\(/.exec(targetCost)?.[1]
  assert.ok(targetCostName)
  assert.ok(targetCost.includes('query_source'))
  assert.equal(targetCost.split(`${targetCostName}(`).length - 1, 2)
  const targetCaller = target.slice(
    units.targetCaller.start,
    units.targetCaller.end,
  )
  assert.equal(targetCaller.split(`${targetCostName}(`).length - 1, 2)
  assert.equal(
    targetCaller.split(`${targetCostName}(`).slice(1).every(call =>
      call.slice(0, call.indexOf(')')).includes('.querySource'),
    ),
    true,
  )
  const vcrCaller = target.slice(units.vcrCaller.start, units.vcrCaller.end)
  assert.match(vcrCaller, new RegExp(`${targetCostName}\\([^)]*\\)`))
  assert.equal(vcrCaller.includes('querySource'), false)

  const baselineCost = baseline.slice(
    units.baselineCost.start,
    units.baselineCost.end,
  )
  const baselineCostName = /^function ([A-Za-z_$][\w$]*)\(/.exec(
    baselineCost,
  )?.[1]
  assert.ok(baselineCostName)
  assert.equal(baselineCost.includes('query_source'), false)
  const baselineCaller = baseline.slice(
    units.baselineCaller.start,
    units.baselineCaller.end,
  )
  assert.equal(baselineCaller.split(`${baselineCostName}(`).length - 1, 2)
})

test('source propagates querySource at both live API cost sites but not VCR', sourceOptions, () => {
  const tracker = source('cost-tracker.ts')
  const claude = source('services/api/claude.ts')
  const vcr = source('services/vcr.ts')
  assert.match(tracker, /function getMetricsQuerySource/)
  assert.match(tracker, /querySource\.startsWith\('repl_main_thread'\)/)
  assert.match(tracker, /querySource === 'sdk'/)
  assert.match(tracker, /querySource\.startsWith\('agent:'\)/)
  assert.match(tracker, /query_source: metricsQuerySource/)
  assert.match(
    tracker,
    /advisorUsage\.model,\s*querySource,\s*\)/,
  )
  const costCalls = [...claude.matchAll(/addToTotalSessionCost\([\s\S]*?\n\s*\)/g)]
  assert.equal(costCalls.length, 2)
  assert.equal(costCalls.every(match => match[0].includes('options.querySource')), true)
  assert.match(vcr, /addToTotalSessionCost\(costUSD, usage, model\)/)
})

test('actual counters classify main, subagent, auxiliary, and advisor usage', sourceOptions, async () => {
  const cases = [
    [undefined, undefined],
    ['repl_main_thread', 'main'],
    ['repl_main_thread:compact', 'main'],
    ['sdk', 'main'],
    ['sdk_replay', 'auxiliary'],
    ['agent:reviewer', 'subagent'],
    ['hook_agent', 'subagent'],
    ['verification_agent', 'subagent'],
    ['compact', 'auxiliary'],
  ]
  for (const [querySource, expected] of cases) {
    const { tracker, counterAdds } = await instantiateCostTracker()
    assert.equal(
      tracker.addToTotalSessionCost(1, usage(), 'claude-test', querySource),
      1,
    )
    assert.equal(counterAdds.length, 5)
    for (const add of counterAdds) {
      if (expected === undefined) {
        assert.equal('query_source' in add.attrs, false)
      } else {
        assert.equal(add.attrs.query_source, expected)
      }
    }
  }

  const { tracker, counterAdds } = await instantiateCostTracker({
    fastMode: true,
  })
  const total = tracker.addToTotalSessionCost(
    1,
    usage({
      speed: 'fast',
      advisor_usage: [usage({ model: 'advisor-model' })],
    }),
    'main-model',
    'agent:worker',
  )
  assert.equal(total, 1.25)
  assert.equal(counterAdds.length, 10)
  assert.equal(
    counterAdds.every(add => add.attrs.query_source === 'subagent'),
    true,
  )
  assert.equal(counterAdds.slice(0, 5).every(add => add.attrs.speed === 'fast'), true)
  assert.equal(counterAdds.slice(5).every(add => !('speed' in add.attrs)), true)
})
