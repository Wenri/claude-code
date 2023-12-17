import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_96_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const baselineSha256 =
  '62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e'
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'

const baselineUnits = [
  {
    index: 3_194,
    nodeType: 'FunctionDeclaration',
    start: 2_414_243,
    end: 2_414_400,
    sourceHash:
      '0585e13b5faba2bc6f17c965178310f5df317799bb79f0f3064391302df5d791',
  },
  {
    index: 17_942,
    nodeType: 'FunctionDeclaration',
    start: 12_596_899,
    end: 12_597_275,
    sourceHash:
      '4d226a51a1fa5a0ae584f865db444ec2e43c193304d74d3d164dad6538f2ea64',
  },
  {
    index: 17_944,
    nodeType: 'VariableDeclaration',
    start: 12_597_283,
    end: 12_597_624,
    sourceHash:
      '51f4846ad63235e9d2578ac4bcacb863c363cf94ea9bdb4631e0326aad227a44',
  },
]
const targetUnits = [
  {
    index: 3_205,
    nodeType: 'FunctionDeclaration',
    start: 2_415_204,
    end: 2_415_428,
    sourceHash:
      '7fb39230926e2a77f0779896c2e94ad37246ebf68b7d2384f40306f4125261b9',
  },
  {
    index: 17_919,
    nodeType: 'FunctionDeclaration',
    start: 12_557_359,
    end: 12_557_829,
    sourceHash:
      '64e754e312da4de679a873311df3e9477eec58897e9479f30a9c2bb3b65d8ee5',
  },
  {
    index: 17_921,
    nodeType: 'VariableDeclaration',
    start: 12_557_837,
    end: 12_558_625,
    sourceHash:
      'd7d99edf82cf5bd35a14de141191dd536d7384e05b8e3b18c83ced2377315c10',
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
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_96_BUNDLE and CLAUDE_CODE_2_1_97_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), expectedSha256, `${label} hash drifted`)
  return bytes.toString('utf8')
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

function declarationText(ts, owner, predicate, label) {
  const ast = ts.createSourceFile(
    label,
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = ast.statements.find(statement => predicate(statement, ts))
  assert.ok(declaration, `${label} declaration must be reachable`)
  return declaration.getText(ast)
}

function evaluateTypeScript(ts, harness, filename) {
  const result = ts.transpileModule(harness, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(
    errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')),
    [],
    `${filename} must transpile`,
  )
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports
}

async function instantiateBootstrapHarness() {
  const ts = await loadTypeScript()
  const owner = source('services/api/bootstrap.ts')
  const schema = declarationText(
    ts,
    owner,
    (statement, compiler) =>
      compiler.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        declaration => declaration.name.getText() === 'bootstrapResponseSchema',
      ),
    'bootstrap schema',
  )
  const persist = declarationText(
    ts,
    owner,
    (statement, compiler) =>
      compiler.isFunctionDeclaration(statement) &&
      statement.name?.text === 'fetchBootstrapData',
    'bootstrap persistence',
  ).replace(/^export /, '')

  return evaluateTypeScript(
    ts,
    `
      class Schema {
        constructor(read) { this.read = read }
        parse(value) { return this.read(value) }
        safeParse(value) {
          try { return { success: true, data: this.parse(value) } }
          catch (error) { return { success: false, error } }
        }
        nullish() {
          return new Schema(value => value == null ? value : this.parse(value))
        }
        transform(transformer) {
          return new Schema(value => transformer(this.parse(value)))
        }
      }
      const typed = (name, predicate) => new Schema(value => {
        if (!predicate(value)) throw new TypeError(name)
        return value
      })
      const z = {
        number: () => typed('number', value => typeof value === 'number'),
        string: () => typed('string', value => typeof value === 'string'),
        unknown: () => new Schema(value => value),
        array: schema => new Schema(value => {
          if (!Array.isArray(value)) throw new TypeError('array')
          return value.map(item => schema.parse(item))
        }),
        record: schema => new Schema(value => {
          if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError('record')
          }
          return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, schema.parse(item)]),
          )
        }),
        object: shape => new Schema(value => {
          if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError('object')
          }
          return Object.fromEntries(
            Object.entries(shape).map(([key, schema]) => [key, schema.parse(value[key])]),
          )
        }),
      }
      const lazySchema = factory => factory
      let apiResponse = null
      let config = {}
      const writes = []
      const fetchBootstrapAPI = async () => apiResponse
      const getGlobalConfig = () => config
      const isEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right)
      const saveGlobalConfig = update => {
        config = update(config)
        writes.push(config)
      }
      const logForDebugging = () => {}
      const logError = error => { throw error }
      ${schema}
      ${persist}
      module.exports = {
        parse: value => bootstrapResponseSchema().safeParse(value),
        setResponse: value => { apiResponse = value },
        setConfig: value => { config = value },
        getConfig: () => config,
        writes,
        fetchBootstrapData,
      }
    `,
    'additionalModelCostsBootstrap.ts',
  )
}

async function instantiateCostHarness() {
  const ts = await loadTypeScript()
  const owner = source('utils/modelCost.ts')
  const getModelCosts = declarationText(
    ts,
    owner,
    (statement, compiler) =>
      compiler.isFunctionDeclaration(statement) &&
      statement.name?.text === 'getModelCosts',
    'model cost lookup',
  ).replace(/^export /, '')

  return evaluateTypeScript(
    ts,
    `
      type ModelCosts = Record<string, number>
      type Usage = { speed?: string }
      const known = { inputTokens: 1, outputTokens: 2, promptCacheWriteTokens: 3, promptCacheReadTokens: 4, webSearchRequests: 5 }
      const fallback = { inputTokens: 10, outputTokens: 20, promptCacheWriteTokens: 30, promptCacheReadTokens: 40, webSearchRequests: 50 }
      const MODEL_COSTS: Record<string, ModelCosts> = { known, fallback }
      const DEFAULT_UNKNOWN_MODEL_COST = fallback
      const CLAUDE_OPUS_4_6_CONFIG = { firstParty: '__opus_4_6__' }
      const firstPartyNameToCanonical = value => value
      const getCanonicalName = value => value === 'raw-id' ? 'canonical' : value
      const getDefaultMainLoopModelSetting = () => 'fallback'
      const getOpus46CostTier = () => ({ ...known, inputTokens: 99 })
      let additionalModelCostsCache = undefined
      const getGlobalConfig = () => ({ additionalModelCostsCache })
      const tracked = []
      const trackUnknownModelCost = (...args) => tracked.push(args)
      ${getModelCosts}
      module.exports = {
        getModelCosts,
        known,
        fallback,
        tracked,
        setAdditional: value => { additionalModelCostsCache = value },
      }
    `,
    'additionalModelCostsLookup.ts',
  )
}

test(
  '2.1.97 adds the authenticated bootstrap-to-model-cost runtime graph',
  bundleOptions,
  () => {
    if (!selected || !baselinePath || !targetPath) return
    const baseline = requiredBundle(
      baselinePath,
      'CLAUDE_CODE_2_1_96_BUNDLE',
      baselineSha256,
    )
    const target = requiredBundle(
      targetPath,
      'CLAUDE_CODE_2_1_97_BUNDLE',
      targetSha256,
    )
    assert.equal(occurrences(baseline, 'additional_model_costs'), 0)
    assert.equal(occurrences(target, 'additional_model_costs'), 2)

    for (const unit of baselineUnits) {
      const row = structural.unmatchedBaseline.find(
        candidate => candidate.index === unit.index,
      )
      assert.ok(row, `baseline u${unit.index} must be unmatched`)
      assert.deepEqual(
        [row.nodeType, row.start, row.end, row.sourceHash],
        [unit.nodeType, unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(baseline.slice(unit.start, unit.end)),
        unit.sourceHash,
      )
    }
    for (const unit of targetUnits) {
      const row = structural.regions[unit.index]
      assert.equal(row.classification, 'unresolved')
      assert.deepEqual(
        [
          row.target.index,
          row.target.nodeType,
          row.target.start,
          row.target.end,
          row.target.sourceHash,
        ],
        [unit.index, unit.nodeType, unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
    }

    const lookup = target.slice(targetUnits[0].start, targetUnits[0].end)
    const persist = target.slice(targetUnits[1].start, targetUnits[1].end)
    const schema = target.slice(targetUnits[2].start, targetUnits[2].end)
    assert.match(lookup, /additionalModelCostsCache/)
    assert.match(lookup, /\?\.\[q\]\?\?Y\?\.\[_\]/)
    assert.match(persist, /additional_model_costs\?\?\{\}/)
    assert.equal(occurrences(persist, 'additionalModelCostsCache'), 2)
    assert.match(schema, /web_search_requests/)
    assert.match(schema, /webSearchRequests:q\.web_search_requests\?\?0\.01/)
  },
)

test(
  'source exposes and persists transformed server model pricing',
  sourceOptions,
  async () => {
    if (!selected) return
    const bootstrap = source('services/api/bootstrap.ts')
    const config = source('utils/config.ts')
    const costs = source('utils/modelCost.ts')
    assert.match(bootstrap, /additional_model_costs: z/)
    assert.match(bootstrap, /webSearchRequests: value\.web_search_requests \?\? 0\.01/)
    assert.equal(occurrences(bootstrap, 'additionalModelCostsCache'), 2)
    assert.match(config, /additionalModelCostsCache\?: Record<string, ModelCosts>/)
    assert.match(costs, /additionalCosts\?\.\[model\] \?\? additionalCosts\?\.\[shortName\]/)

    const harness = await instantiateBootstrapHarness()
    const parsed = harness.parse({
      client_data: { experiment: true },
      additional_model_options: [],
      additional_model_costs: {
        'custom-model': {
          input_tokens: 1.25,
          output_tokens: 6.5,
          prompt_cache_write_tokens: 1.5,
          prompt_cache_read_tokens: 0.125,
          web_search_requests: null,
        },
      },
    })
    assert.equal(parsed.success, true)
    assert.deepEqual(parsed.data.additional_model_costs['custom-model'], {
      inputTokens: 1.25,
      outputTokens: 6.5,
      promptCacheWriteTokens: 1.5,
      promptCacheReadTokens: 0.125,
      webSearchRequests: 0.01,
    })
    harness.setConfig({})
    harness.setResponse(parsed.data)
    await harness.fetchBootstrapData()
    assert.deepEqual(
      harness.getConfig().additionalModelCostsCache,
      parsed.data.additional_model_costs,
    )
    assert.equal(harness.writes.length, 1)
    await harness.fetchBootstrapData()
    assert.equal(harness.writes.length, 1, 'unchanged cache must not be rewritten')
  },
)

test(
  'unknown models use exact and canonical server prices before fallback telemetry',
  sourceOptions,
  async () => {
    if (!selected) return
    const harness = await instantiateCostHarness()
    assert.equal(harness.getModelCosts('known', {}), harness.known)

    const exact = { ...harness.known, inputTokens: 11 }
    const canonical = { ...harness.known, inputTokens: 22 }
    harness.setAdditional({ 'raw-id': exact, canonical })
    assert.equal(harness.getModelCosts('raw-id', {}), exact)
    assert.deepEqual(harness.tracked, [])

    harness.setAdditional({ canonical })
    assert.equal(harness.getModelCosts('raw-id', {}), canonical)
    assert.deepEqual(harness.tracked, [])

    harness.setAdditional(undefined)
    assert.equal(harness.getModelCosts('raw-id', {}), harness.fallback)
    assert.deepEqual(harness.tracked, [['raw-id', 'canonical']])
  },
)
