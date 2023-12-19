import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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
  [10377, [8387426, 8387870, '1f13eaed7ac1ace972fc3064763765c7065821b496f4b2e12a3a415718286a4c']],
  [10378, [8387870, 8388092, '23d8ba79305f8f4a022045cb5a74c56566e277e9f6d62db58ca86f0d2431e88c']],
  [10379, [8388092, 8388348, '5a9a7172df25c6755f9ba78ef5f6e7b3cfee797e62a6338904a1a75d8b934690']],
  [10380, [8388348, 8388390, 'c386f1f55e582b32cc96c829a9a503b37b050fefa4c5483a7017091d4af74819']],
  [10381, [8388390, 8388508, '94eb89a4540736ea255ccf74166de3a649da541479c6765b2a725506052cd1a2']],
  [10382, [8388508, 8388669, 'bc9b8bc377de1bd64ed8087d4b163f67646206db0e0da70b22d079b79c12c339']],
  [10383, [8388669, 8388834, '5488baa3d4041b9bb4dd2d32646221e59773448eebf9644c6b8c9073472e621f']],
  [10384, [8388834, 8390569, 'b5610a7cf0d3431ed1feebee91fe3cb59d355178b6f5936d854f1da1b1db1076']],
  [10386, [8391316, 8391400, '5d042a6581787716ffa2ec81a3ee9fd686cf44e8dda93b139d33d657438bcb2c']],
  [10387, [8391400, 8391442, 'd5bab9259eb028a0604068012e3d2ee37b478c35b383b99d918dbc7946884409']],
  [10388, [8391442, 8391492, 'fa09d0212fd7102c5778acaeea3d021480d655c7657613cb4ce56c458259ce01']],
  [10389, [8391492, 8391601, '20d3c6b79b42e57343d2f80ec33366bad14593870261e83827bbc6525e7f12a4']],
  [10391, [8391629, 8392072, '194b3833d55ae71110cab7c91345ca42dc79bd4b9ce0a0bcb936d12f8542aef1']],
  [10392, [8392072, 8392124, '08ef6b1cfb60ab64cf5a8f4632ad2db9feb13c5e69fefe0a67217d20b61a176d']],
  [10393, [8392124, 8392235, '0ac5a624ff5a48e0691f797b0e88b1b34875a075b027ea1a6deb12f0f2555978']],
  [10394, [8392235, 8392405, 'fcbca1660143043a694ec137992321b329778a53a392c2bfc438a1e8e124d459']],
  [10395, [8392405, 8392635, 'a454747f67fd9be021feeb7f1f0aa5806ce563e9db8afab2a5078e1b9db2b875']],
  [10396, [8392635, 8392820, 'eab738d62009b6f31110995cd596e14b89b08d28757827bfa91e06b778e0fce2']],
  [10398, [8392827, 8392896, '885c4f5479636ad839c44467b12fe00a7aed7c35d405ff7de604b945d9309868']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(contents, name, prefix = 'function') {
  const start = contents.indexOf(`${prefix} ${name}(`)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated`)
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

test(
  'target105 pins the complete backend registry state-object boundary',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.includes('globalBackendRegistry'), false)
    assert.equal(baseline.includes('createBackendRegistry'), false)
    assert.equal((target.match(/globalBackendRegistry/g) ?? []).length, 1)
    assert.equal((target.match(/createBackendRegistry/g) ?? []).length, 1)

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(target.slice(identity[0], identity[1])),
        identity[2],
        `${index}: target bytes`,
      )
    }

    const graph = target.slice(8387426, 8392896)
    for (const property of [
      'cachedBackend',
      'cachedDetectionResult',
      'backendsRegistered',
      'cachedInProcessBackend',
      'cachedPaneBackendExecutor',
      'inProcessFallbackActive',
      'TmuxBackendClass',
      'ITermBackendClass',
    ]) {
      assert.ok(graph.includes(property), property)
    }
    assert.match(graph, /function .+\(.+=.+\)\{if\(.+\.backendsRegistered\)return/)
    assert.match(graph, /\.TmuxBackendClass=.+\.TmuxBackendClass/)
    assert.match(graph, /\.ITermBackendClass=.+\.ITermBackendClass/)
  },
)

test(
  'authored registry state is isolated and every cache API accepts a registry',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const registry = source('utils/swarm/backends/registry.ts')
    for (const fragment of [
      'export type BackendRegistry = {',
      'export function createBackendRegistry(): BackendRegistry',
      'export const globalBackendRegistry = createBackendRegistry()',
      'registry.TmuxBackendClass = globalBackendRegistry.TmuxBackendClass',
      'registry.ITermBackendClass = globalBackendRegistry.ITermBackendClass',
      'registry: BackendRegistry = globalBackendRegistry',
      'detectAndGetBackend(registry)',
      'createPaneBackendExecutor(',
    ]) {
      assert.ok(registry.includes(fragment), fragment)
    }
    assert.equal(
      (registry.match(/registry: BackendRegistry = globalBackendRegistry/g) ?? [])
        .length,
      13,
    )

    const typeStart = registry.indexOf('export type BackendRegistry = {')
    const factoryStart = registry.indexOf('export function createBackendRegistry')
    assert.notEqual(typeStart, -1)
    const typeSource = registry.slice(typeStart, factoryStart)
    const snippets = [
      functionSource(registry, 'createBackendRegistry', 'export function'),
      'export const globalBackendRegistry = createBackendRegistry()',
      functionSource(registry, 'registerTmuxBackend', 'export function'),
      functionSource(registry, 'registerITermBackend', 'export function'),
      functionSource(registry, 'getCachedBackend', 'export function'),
      functionSource(registry, 'getCachedDetectionResult', 'export function'),
      functionSource(registry, 'markInProcessFallback', 'export function'),
      functionSource(registry, 'resetBackendDetection', 'export function'),
    ]
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `type PaneBackend = any; type BackendDetectionResult = any; type TeammateExecutor = any;\n` +
        `const logForDebugging = (_message: string) => {};\n` +
        typeSource +
        snippets.join('\n'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    const first = module.exports.createBackendRegistry()
    const second = module.exports.createBackendRegistry()
    assert.notEqual(first, second)
    assert.deepEqual(first, second)
    assert.deepEqual(Object.keys(first), [
      'cachedBackend',
      'cachedDetectionResult',
      'backendsRegistered',
      'cachedInProcessBackend',
      'cachedPaneBackendExecutor',
      'inProcessFallbackActive',
      'TmuxBackendClass',
      'ITermBackendClass',
    ])
    class FirstBackend {}
    module.exports.registerTmuxBackend(FirstBackend, first)
    assert.equal(first.TmuxBackendClass, FirstBackend)
    assert.equal(second.TmuxBackendClass, null)
    first.cachedBackend = { type: 'tmux' }
    first.cachedDetectionResult = { backend: first.cachedBackend }
    module.exports.markInProcessFallback(first)
    assert.equal(module.exports.getCachedBackend(first), first.cachedBackend)
    assert.equal(
      module.exports.getCachedDetectionResult(first),
      first.cachedDetectionResult,
    )
    assert.equal(first.inProcessFallbackActive, true)
    assert.equal(second.inProcessFallbackActive, false)
    module.exports.resetBackendDetection(first)
    assert.equal(first.cachedBackend, null)
    assert.equal(first.cachedDetectionResult, null)
    assert.equal(first.inProcessFallbackActive, false)
    assert.equal(first.TmuxBackendClass, FirstBackend)
  },
)

test(
  'target116 retains the same registry state shape and parameterized graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.equal((latest.match(/globalBackendRegistry/g) ?? []).length, 1)
    assert.equal((latest.match(/createBackendRegistry/g) ?? []).length, 1)
    const exportMatch = latest.match(/createBackendRegistry:\(\)=>[\w$]+/)
    assert.ok(exportMatch)
    const factoryName = exportMatch[0].split('=>')[1]
    const factory = functionSource(latest, factoryName)
    for (const property of [
      'cachedBackend',
      'cachedDetectionResult',
      'backendsRegistered',
      'cachedInProcessBackend',
      'cachedPaneBackendExecutor',
      'inProcessFallbackActive',
      'TmuxBackendClass',
      'ITermBackendClass',
    ]) {
      assert.ok(factory.includes(property), property)
    }
  },
)
