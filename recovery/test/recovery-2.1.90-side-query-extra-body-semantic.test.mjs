import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.89-to-2.1.90'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_89_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_90_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.89, 2.1.90, and 2.1.116 bundles are required'
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

const units = new Map([
  [8787, ['unresolved', 6956834, 6960227, 'FunctionDeclaration', 'cdb660925588f7c324e020bbb9fb390d489404ee301eccfea6269a789c4da2db']],
  [8788, ['unresolved', 6960227, 6963895, 'FunctionDeclaration', '436068044ac67f073506cee6a96fe0e2ccb09c7c6ff590a702cf9f2d3d082207']],
  [15997, ['unresolved', 11570961, 11572608, 'FunctionDeclaration', '5c3f5ef9ac43e8a45d40b551d58da99f8cd5d4bc53fc8d33ba9724b6950f625b']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
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

async function executeSideQuery(contents) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const state = { requests: [], events: [], completion: null }
  const response = {
    _request_id: 'side-query-request',
    usage: {
      input_tokens: 3,
      output_tokens: 2,
      cache_read_input_tokens: 1,
      cache_creation_input_tokens: 0,
    },
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'MACRO', javascript)(
    id => {
      if (id.endsWith('/bootstrap/state.js')) {
        return {
          getLastApiCompletionTimestamp: () => null,
          setLastApiCompletionTimestamp: value => {
            state.completion = value
          },
        }
      }
      if (id.endsWith('/constants/betas.js')) {
        return { STRUCTURED_OUTPUTS_BETA_HEADER: 'structured-outputs' }
      }
      if (id.endsWith('/constants/system.js')) {
        return {
          getAttributionHeader: () => undefined,
          getCLISyspromptPrefix: () => 'cli-prefix',
        }
      }
      if (id.endsWith('/analytics/index.js')) {
        return { logEvent: (name, metadata) => state.events.push({ name, metadata }) }
      }
      if (id.endsWith('/api/claude.js')) {
        return { getAPIMetadata: () => ({ user_id: 'test-user' }) }
      }
      if (id.endsWith('/api/client.js')) {
        return {
          getAnthropicClient: async () => ({
            beta: {
              messages: {
                create: async (body, options) => {
                  state.requests.push({ body, options })
                  return response
                },
              },
            },
          }),
        }
      }
      if (id.endsWith('/betas.js')) {
        return {
          getModelBetas: () => [],
          modelSupportsStructuredOutputs: () => false,
          modelSupportsTemperature: () => true,
        }
      }
      if (id.endsWith('/fingerprint.js')) {
        return { computeFingerprint: () => 'fingerprint' }
      }
      if (id.endsWith('/model/model.js')) {
        return { normalizeModelStringForAPI: model => model }
      }
      throw new Error(`unexpected sideQuery import: ${id}`)
    },
    module.exports,
    module,
    { VERSION: '2.1.test' },
  )
  return { sideQuery: module.exports.sideQuery, state, response }
}

test(
  'authenticated target90 pins yolo producers and the side-query request-body spread at their first boundary',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01',
    )
    assert.equal(
      sha256(targetBytes),
      '069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(occurrences(baseline, 'extraBodyParams'), 0)
    assert.equal(occurrences(target, 'extraBodyParams'), 4)
    assert.equal(
      occurrences(target.slice(6956834, 6960227), 'extraBodyParams'),
      2,
    )
    assert.equal(
      occurrences(target.slice(6960227, 6963895), 'extraBodyParams'),
      1,
    )
    const sideQueryTarget = target.slice(11570961, 11572608)
    assert.equal(occurrences(sideQueryTarget, 'extraBodyParams'), 1)
    assert.ok(sideQueryTarget.includes('metadata:'))
    assert.match(sideQueryTarget, /metadata:[^,}]+,\.\.\.[A-Za-z_$][\w$]*}/)
    assert.ok(occurrences(latest, 'extraBodyParams') >= 5)
  },
)

test(
  'source root carries yolo body parameters through the typed side-query boundary',
  sourceOptions,
  () => {
    const sideQuery = source('utils/sideQuery.ts')
    const yolo = source('utils/permissions/yoloClassifier.ts')
    assert.equal(occurrences(sideQuery, 'extraBodyParams'), 3)
    assert.ok(
      sideQuery.includes('extraBodyParams?: Record<string, unknown>'),
    )
    assert.ok(sideQuery.includes('    extraBodyParams,'))
    assert.ok(sideQuery.includes('      ...extraBodyParams,'))
    assert.equal(occurrences(yolo, 'extraBodyParams: getExtraBodyParams()'), 3)
  },
)

test(
  'executable side query spreads provider fields into the API body without nesting them',
  sourceOptions,
  async () => {
    const { sideQuery, state, response } = await executeSideQuery(
      source('utils/sideQuery.ts'),
    )
    const result = await sideQuery({
      model: 'claude-test',
      messages: [{ role: 'user', content: 'classify this command' }],
      querySource: 'auto_mode',
      extraBodyParams: {
        anthropic_internal: { auto_mode: true },
        provider_extension: 'enabled',
      },
    })
    assert.equal(result, response)
    assert.equal(state.requests.length, 1)
    const { body } = state.requests[0]
    assert.deepEqual(body.anthropic_internal, { auto_mode: true })
    assert.equal(body.provider_extension, 'enabled')
    assert.equal(body.extraBodyParams, undefined)
    assert.deepEqual(body.metadata, { user_id: 'test-user' })
    assert.equal(state.events[0].name, 'tengu_api_success')
    assert.ok(state.completion !== null)
  },
)
