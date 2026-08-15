import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
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

const unitPairs = [
  {
    name: 'modelSupports1M',
    baseline: [6012, 2_729_070, 2_729_200, 'c3c2f3c81733a51fca465aa13f34dc12477f98c733bf450c8e7ec60e5fd3b0bf'],
    target: [6059, 2_747_545, 2_747_868, '31c60499749ffef4d7bbbf71747556d85f8836f797a03a03ff66a35c263955c7'],
  },
  {
    name: 'getSonnet1mExpTreatmentEnabled',
    baseline: [6014, 2_729_475, 2_729_625, 'dfbc947c1e9ef06a864de708b81052f9f20145cef381ebc06168f6eb4568fae6'],
    target: [6061, 2_748_143, 2_748_291, '705dc4646718ea801800dff84cc6d9978a275daf1b9301d98bdc3effbbc2b8bb'],
  },
  {
    name: 'getModelMaxOutputTokens',
    baseline: [6016, 2_729_842, 2_730_580, 'f3831aec53ed4bfecab1c5cb545114cd47a93ced853179b4fc7cc6fbd82ba677'],
    target: [6063, 2_748_508, 2_749_242, '91b52e99d2f044a44ad559b893ac592f968132d7a9e94636ddd029d430d582bb'],
  },
  {
    name: 'modelSupportsISP',
    baseline: [6024, 2_732_023, 2_732_258, '2ca9d15984b878e1f6e043ce960ba32dc1bde66352c4af06f36857bb562ccb83'],
    target: [6071, 2_750_690, 2_750_919, '12022e57a58b1f063dcd0b45559fb0b4dadd8db61e8ea8ddb1bf5af5f033a1df'],
  },
  {
    name: 'vertexModelSupportsWebSearch',
    baseline: [6025, 2_732_258, 2_732_382, '020b06cd5c0da561339b36df8316efd532570c2757fd2a3fc34ad598c525c7d6'],
    target: [6072, 2_750_919, 2_751_167, 'c3f27f1223ba83b00cfb293c148ab413acfa61ee6fe78d0dae52d1f5d10a3554'],
  },
  {
    name: 'modelSupportsContextManagement',
    baseline: [6026, 2_732_382, 2_732_580, '0db1118513593bccd8f2cde0669fcacf069cf5f47d192245c3a60cc243652742'],
    target: [6073, 2_751_167, 2_751_489, '627fb580eeed4e425ecdf8ce77f8e14c4e113bb41f02d216083e4639825597e5'],
  },
  {
    name: 'modelSupportsStructuredOutputs',
    baseline: [6027, 2_732_580, 2_732_859, 'f7788419cb8851f8e908a40f23b83579252a3a45c70e76b01ebc562fa22d5836'],
    target: [6074, 2_751_489, 2_751_633, 'b1c13a8983f55ecc12d3d49f822daf939cf7545311b04d17153faed2549b2a77'],
  },
  {
    name: 'modelSupportsAdaptiveThinking',
    baseline: [8057, 3_845_994, 3_846_253, '2155b9615feee24d8629416ac95c93e1750ae0cfa3f8770d5823d90b475a7cde'],
    target: [8146, 3_873_506, 3_873_867, '9d26301c1559f35f071706e1ec264237fbf9757b256cb4295af31d3eb5c354e2'],
  },
  {
    name: 'modelSupportsEffort',
    baseline: [8061, 3_846_776, 3_847_084, '523969ffc90bcf4e398a008fd6b27af50aa99d7c6e9a08e0ccc5dbae9efd2740'],
    target: [8150, 3_874_390, 3_874_800, '60184f7a1edb8558c40e2cab344c96a49cf2cefdb77216614d6f4c4fa55bce0d'],
  },
  {
    name: 'modelSupportsMaxEffort',
    baseline: [8063, 3_847_231, 3_847_364, 'f65e8d6d880c50267df42ac59429e0d98ceeb036d71ba881bf81c9d68f83698d'],
    target: [8151, 3_874_800, 3_875_154, '38096ae57246dba9ff44f29913794ff400adee00add61b9bb5ad8faafec78c1e'],
  },
  {
    name: 'modelSupportsXHighEffort',
    baseline: [8064, 3_847_364, 3_847_464, '40d584e607610db6a1894e6658e7142796ce5b9b6a1503d3a26ae65da68280bd'],
    target: [8152, 3_875_154, 3_875_510, '27286bc00e77b5b0a555520db760c240f93f59b3618acc95165a5bdcbb132f3f'],
  },
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function loadTypeScript() {
  const require = createRequire(import.meta.url)
  for (const candidate of [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error('TypeScript compiler not found')
}

function owner(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function compileFunction(relativePath, name, bindings = {}) {
  const ts = loadTypeScript()
  const source = owner(relativePath)
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  let declaration
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name
    ) {
      declaration = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(declaration, `${relativePath}: ${name} declaration`)
  const javascript = ts.transpileModule(
    `${declaration.getText(sourceFile)}\nexports.value = ${name}`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const exports = {}
  Function(...Object.keys(bindings), 'exports', javascript)(
    ...Object.values(bindings),
    exports,
  )
  return exports.value
}

const isCompatible = provider =>
  ['firstParty', 'anthropicAws', 'foundry', 'mantle'].includes(provider)

function providerCapability(relativePath, name, provider, override) {
  return compileFunction(relativePath, name, {
    get3PModelCapabilityOverride: () => override,
    getCanonicalName: model => model,
    getAPIProviderForModel: () => provider,
    isFirstPartyCompatibleAPIProvider: isCompatible,
    isEnvTruthy: value => value === '1',
    process: { env: {} },
  })
}

test('target116 authenticates every exact model-capability dispatch replacement', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  for (const pair of unitPairs) {
    const [baselineIndex, baselineStart, baselineEnd, baselineHash] =
      pair.baseline
    const [targetIndex, targetStart, targetEnd, targetHash] = pair.target
    const baselineRegion = structural.unmatchedBaseline.find(
      region => region.index === baselineIndex,
    )
    assert.deepEqual(
      [
        baselineRegion?.start,
        baselineRegion?.end,
        baselineRegion?.nodeType,
        baselineRegion?.sourceHash,
      ],
      [baselineStart, baselineEnd, 'FunctionDeclaration', baselineHash],
      `${pair.name}: baseline pin`,
    )
    assert.equal(
      sha256(baseline.subarray(baselineStart, baselineEnd)),
      baselineHash,
      `${pair.name}: baseline bytes`,
    )

    const targetRegion = structural.regions[targetIndex]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.nodeType,
        targetRegion.target.sourceHash,
      ],
      [targetStart, targetEnd, 'FunctionDeclaration', targetHash],
      `${pair.name}: target pin`,
    )
    assert.equal(
      sha256(target.subarray(targetStart, targetEnd)),
      targetHash,
      `${pair.name}: target bytes`,
    )
    assert.equal(
      baseline.includes(target.subarray(targetStart, targetEnd)),
      false,
      `${pair.name}: exact target unit absent from 114`,
    )
  }
})

test('source executes the exact 1M and output-token boundaries', sourceOptions, () => {
  const build1m = (provider, disabled = false) =>
    compileFunction('utils/context.ts', 'modelSupports1M', {
      is1mContextDisabled: () => disabled,
      getCanonicalName: model => model,
      getAPIProviderForModel: () => provider,
      isFirstPartyCompatibleAPIProvider: isCompatible,
    })
  const firstParty1m = build1m('firstParty')
  const vertex1m = build1m('vertex')
  for (const model of [
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-sonnet-4-0',
  ]) {
    assert.equal(vertex1m(model), true, `${model}: explicit 1M allow`)
  }
  for (const model of [
    'claude-3-7-sonnet',
    'claude-opus-4-0',
    'claude-opus-4-1',
    'claude-opus-4-5',
    'claude-haiku-4-5',
  ]) {
    assert.equal(firstParty1m(model), false, `${model}: explicit 1M deny`)
  }
  assert.equal(firstParty1m('claude-future-9'), true)
  assert.equal(vertex1m('claude-future-9'), false)
  assert.equal(build1m('firstParty', true)('claude-opus-4-7'), false)

  const sonnetTreatment = compileFunction(
    'utils/context.ts',
    'getSonnet1mExpTreatmentEnabled',
    {
      is1mContextDisabled: () => false,
      has1mContext: () => false,
      getCanonicalName: model => model,
      getGlobalConfig: () => ({
        clientDataCache: { coral_reef_sonnet: 'true' },
      }),
    },
  )
  assert.equal(sonnetTreatment('claude-sonnet-4-6'), true)
  assert.equal(sonnetTreatment('claude-sonnet-4-6-lookalike'), false)

  const maxTokens = compileFunction(
    'utils/context.ts',
    'getModelMaxOutputTokens',
    {
      process: { env: {} },
      getCanonicalName: model => model,
      getModelCapability: model =>
        model === 'cap-10k' ? { max_tokens: 10_000 } : undefined,
      MAX_OUTPUT_TOKENS_DEFAULT: 32_000,
      MAX_OUTPUT_TOKENS_UPPER_LIMIT: 128_000,
    },
  )
  assert.deepEqual(maxTokens('claude-opus-4-7'), {
    default: 64_000,
    upperLimit: 128_000,
  })
  assert.deepEqual(maxTokens('claude-sonnet-4-6'), {
    default: 32_000,
    upperLimit: 128_000,
  })
  assert.deepEqual(maxTokens('claude-opus-4-5'), {
    default: 32_000,
    upperLimit: 64_000,
  })
  assert.deepEqual(maxTokens('claude-3-opus'), {
    default: 4_096,
    upperLimit: 4_096,
  })
  assert.deepEqual(maxTokens('claude-opus-4-7-lookalike'), {
    default: 32_000,
    upperLimit: 128_000,
  })
  assert.deepEqual(maxTokens('cap-10k'), {
    default: 10_000,
    upperLimit: 10_000,
  })
})

test('source executes exact beta and provider dispatch boundaries', sourceOptions, () => {
  const vertexWebSearch = compileFunction(
    'utils/betas.ts',
    'vertexModelSupportsWebSearch',
    { getCanonicalName: model => model },
  )
  const explicitClaude4Models = [
    'claude-opus-4-0',
    'claude-opus-4-1',
    'claude-opus-4-5',
    'claude-opus-4-6',
    'claude-opus-4-7',
    'claude-sonnet-4-0',
    'claude-sonnet-4-5',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
  ]
  for (const model of explicitClaude4Models) {
    assert.equal(vertexWebSearch(model), true, `${model}: Vertex web search`)
  }
  assert.equal(vertexWebSearch('claude-opus-4-future'), false)
  assert.equal(vertexWebSearch('prefix-claude-opus-4-7'), false)

  const isp = providerCapability(
    'utils/betas.ts',
    'modelSupportsISP',
    'vertex',
  )
  assert.equal(isp('claude-haiku-4-5'), false)
  assert.equal(isp('claude-haiku-4-future'), true)
  assert.equal(isp('claude-3-7-sonnet'), false)
  assert.equal(
    providerCapability('utils/betas.ts', 'modelSupportsISP', 'vertex', false)(
      'claude-opus-4-7',
    ),
    false,
  )

  const vertexContext = providerCapability(
    'utils/betas.ts',
    'modelSupportsContextManagement',
    'vertex',
  )
  for (const model of explicitClaude4Models) {
    assert.equal(vertexContext(model), true, `${model}: Vertex context management`)
  }
  assert.equal(vertexContext('claude-opus-4-future'), false)
  assert.equal(
    providerCapability(
      'utils/betas.ts',
      'modelSupportsContextManagement',
      'foundry',
    )('claude-3-opus'),
    true,
  )

  const firstPartyStructured = providerCapability(
    'utils/betas.ts',
    'modelSupportsStructuredOutputs',
    'firstParty',
  )
  for (const model of [
    'claude-3-opus',
    'claude-opus-4-0',
    'claude-sonnet-4-0',
  ]) {
    assert.equal(firstPartyStructured(model), false, `${model}: structured deny`)
  }
  assert.equal(firstPartyStructured('claude-opus-4-7'), true)
  assert.equal(firstPartyStructured('claude-future-9'), true)
  assert.equal(
    providerCapability(
      'utils/betas.ts',
      'modelSupportsStructuredOutputs',
      'vertex',
    )('claude-opus-4-7'),
    false,
  )
})

test('source executes adaptive, effort, max, and xhigh truth tables', sourceOptions, () => {
  const adaptive = providerCapability(
    'utils/thinking.ts',
    'modelSupportsAdaptiveThinking',
    'firstParty',
  )
  const effort = providerCapability(
    'utils/effort.ts',
    'modelSupportsEffort',
    'firstParty',
  )
  const normalize = compileFunction(
    'utils/effort.ts',
    'normalizeModelForEffortCapability',
  )
  const withoutMax = new Set([
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-5-sonnet',
    'claude-3-7-sonnet',
    'claude-sonnet-4',
    'claude-sonnet-4-0',
    'claude-sonnet-4-5',
    'claude-opus-4',
    'claude-opus-4-0',
    'claude-opus-4-1',
    'claude-opus-4-5',
  ])
  const maxEffort = compileFunction('utils/effort.ts', 'modelSupportsMaxEffort', {
    get3PModelCapabilityOverride: () => undefined,
    getCanonicalName: model => model,
    normalizeModelForEffortCapability: normalize,
    MODELS_WITHOUT_MAX_EFFORT: withoutMax,
    getAPIProviderForModel: () => 'firstParty',
    isFirstPartyCompatibleAPIProvider: isCompatible,
  })
  const xhigh = providerCapability(
    'utils/effort.ts',
    'modelSupportsXHighEffort',
    'firstParty',
  )

  const rows = [
    ['claude-3-opus', false, false, false, false],
    ['claude-opus-4-0', false, false, false, false],
    ['claude-opus-4-5', false, true, false, false],
    ['claude-opus-4-6', true, true, true, false],
    ['claude-opus-4-7', true, true, true, true],
    ['claude-sonnet-4-5', false, false, false, false],
    ['claude-sonnet-4-6', true, true, true, false],
    ['claude-haiku-4-5', false, false, false, false],
    ['claude-future-9', true, true, true, true],
  ]
  for (const [model, adaptiveExpected, effortExpected, maxExpected, xhighExpected] of rows) {
    assert.equal(adaptive(model), adaptiveExpected, `${model}: adaptive`)
    assert.equal(effort(model), effortExpected, `${model}: effort`)
    assert.equal(maxEffort(model), maxExpected, `${model}: max`)
    assert.equal(xhigh(model), xhighExpected, `${model}: xhigh`)
  }

  for (const [relativePath, name, capability] of [
    ['utils/thinking.ts', 'modelSupportsAdaptiveThinking', 'adaptive'],
    ['utils/effort.ts', 'modelSupportsEffort', 'effort'],
    ['utils/effort.ts', 'modelSupportsXHighEffort', 'xhigh'],
  ]) {
    assert.equal(
      providerCapability(relativePath, name, 'vertex', false)(
        'claude-opus-4-7',
      ),
      false,
      `${capability}: override false precedes explicit allow`,
    )
  }
  assert.equal(
    providerCapability(
      'utils/effort.ts',
      'modelSupportsEffort',
      'firstParty',
      undefined,
    )('claude-opus-4-7'),
    true,
  )
  const forcedEffort = compileFunction('utils/effort.ts', 'modelSupportsEffort', {
    isEnvTruthy: () => true,
    process: { env: { CLAUDE_CODE_ALWAYS_ENABLE_EFFORT: '1' } },
  })
  assert.equal(forcedEffort('claude-3-opus'), true)
})
