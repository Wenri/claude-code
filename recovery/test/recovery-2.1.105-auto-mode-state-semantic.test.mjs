import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

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
  [11658, ['moved', 9170198, 9170208, '8d937d73119f3003b6e2915e9fb456a9d1683112f15754a3757cf486e221d3f4']],
  [11659, ['unresolved', 9170208, 9170457, 'dc22ee433364f7cc3196de93d610f8456230227cc271ca53e26e1b936425382d']],
  [11660, ['unresolved', 9170457, 9170518, 'd10445ea81ea630515104366326fae56e59e3a3bb2de6648c455d81867fb5a0b']],
  [11661, ['unresolved', 9170518, 9170547, '93c2b3d6e4f9a9d0242587a1ce8bfc65f6002373a62689e03b553d4a6f532b28']],
  [11662, ['unresolved', 9170547, 9170580, '3349e437adbdfecf80e305dda45f369cbdef14eb3e5100a943828e0f79932ce4']],
  [11663, ['unresolved', 9170580, 9170610, '77df9e593e0e3171887f879dce120eed29638c4286e9e0da4667c548ae9df804']],
  [11664, ['unresolved', 9170610, 9170644, '0985cdd85bddb0e2c701d8773cc5811381c9387dc8868e4ea952ad14cad0ce9f']],
  [11665, ['unresolved', 9170644, 9170680, 'b5e0c0434ef98db23de0ee78990fd307cfdcdd8cd4ca35d1552c621b03b566ec']],
  [11666, ['unresolved', 9170680, 9170720, '76fd9bafb5c44e1949e801ce503c131281b6648b959f9587077a775537e486d9']],
  [11667, ['unresolved', 9170720, 9170742, 'a83a1704ccf13cc28bff10d5d62e7dcd9638af868690848a138e4d03b29e8eec']],
  [11668, ['moved', 9170742, 9170750, '1e521af03ba9a20f8e72127489fed670a93272decfb82198039a821d4a932045']],
  [11669, ['unresolved', 9170750, 9170776, 'f903746b0eebc9a5e7619dfdd6c78015d90f728da74a73503ab25c2888ff9944']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(contents, name) {
  const start = contents.indexOf(`function ${name}(`)
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function assertStateObjectBundle(bundle, label) {
  assert.equal((bundle.match(/createAutoModeState/g) ?? []).length, 1, `${label}: factory export`)
  assert.equal(
    (bundle.match(/_setGlobalAutoModeStateForTesting/g) ?? []).length,
    1,
    `${label}: injector export`,
  )
  const exportMatch = bundle.match(
    /createAutoModeState:\(\)=>([\w$]+),_setGlobalAutoModeStateForTesting:\(\)=>([\w$]+)/,
  )
  assert.ok(exportMatch, `${label}: adjacent state exports`)
  const [, factoryName, injectorName] = exportMatch
  assert.equal(
    functionSource(bundle, factoryName),
    `function ${factoryName}(){return{active:!1,flagCli:!1,circuitBroken:!1}}`,
    `${label}: fresh-state factory`,
  )

  const identifier = '[A-Za-z_$][\\w$]*'
  const injector = functionSource(bundle, injectorName)
  const injection = injector.match(
    new RegExp(`^function ${escapeRegExp(injectorName)}\\((${identifier})\\)\\{(${identifier})=\\1\\}$`),
  )
  assert.ok(injection, `${label}: state replacement`)
  const stateName = injection[2]
  const escapedState = escapeRegExp(stateName)
  for (const property of ['active', 'flagCli', 'circuitBroken']) {
    assert.match(
      bundle,
      new RegExp(`function ${identifier}\\((${identifier})\\)\\{${escapedState}\\.${property}=\\1\\}`),
      `${label}: ${property} setter`,
    )
    assert.match(
      bundle,
      new RegExp(`function ${identifier}\\(\\)\\{return ${escapedState}\\.${property}\\}`),
      `${label}: ${property} getter`,
    )
  }
  assert.match(
    bundle,
    new RegExp(`${escapedState}=${escapeRegExp(factoryName)}\\(\\)`),
    `${label}: singleton initialization`,
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

test(
  'target105 pins the complete auto-mode state-object boundary',
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
    assert.equal((baseline.match(/_resetForTesting/g) ?? []).length, 1)
    assert.equal(baseline.includes('createAutoModeState'), false)
    assert.equal(baseline.includes('_setGlobalAutoModeStateForTesting'), false)

    for (const [index, identity] of units) {
      const [classification, start, end, sourceHash] = identity
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: identity`,
      )
      const statement = target.slice(start, end)
      assert.equal(sha256(statement), sourceHash, `${index}: target bytes`)
      assert.equal(
        parse(statement, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
        1,
        `${index}: one statement`,
      )
    }

    assertStateObjectBundle(target, 'target105')
  },
)

test(
  'source exposes fresh state and swaps the tested singleton by identity',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const contents = source('utils/permissions/autoModeState.ts')
    for (const fragment of [
      'export type AutoModeState = {',
      'active: boolean',
      'flagCli: boolean',
      'circuitBroken: boolean',
      'export function createAutoModeState(): AutoModeState',
      'let globalAutoModeState = createAutoModeState()',
      'globalAutoModeState.active = active',
      'return globalAutoModeState.active',
      'globalAutoModeState.flagCli = passed',
      'return globalAutoModeState.flagCli',
      'globalAutoModeState.circuitBroken = broken',
      'return globalAutoModeState.circuitBroken',
      'export function _setGlobalAutoModeStateForTesting(state: AutoModeState)',
      'globalAutoModeState = state',
    ]) {
      assert.ok(contents.includes(fragment), fragment)
    }
    assert.equal(contents.includes('_resetForTesting'), false)

    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(contents, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    const api = module.exports

    const first = api.createAutoModeState()
    const second = api.createAutoModeState()
    assert.notEqual(first, second)
    assert.deepEqual(first, {
      active: false,
      flagCli: false,
      circuitBroken: false,
    })
    assert.deepEqual(second, first)

    first.active = true
    first.circuitBroken = true
    api._setGlobalAutoModeStateForTesting(first)
    assert.equal(api.isAutoModeActive(), true)
    assert.equal(api.getAutoModeFlagCli(), false)
    assert.equal(api.isAutoModeCircuitBroken(), true)
    api.setAutoModeActive(false)
    api.setAutoModeFlagCli(true)
    api.setAutoModeCircuitBroken(false)
    assert.deepEqual(first, {
      active: false,
      flagCli: true,
      circuitBroken: false,
    })

    api._setGlobalAutoModeStateForTesting(second)
    assert.equal(api.isAutoModeActive(), false)
    assert.equal(api.getAutoModeFlagCli(), false)
    assert.equal(api.isAutoModeCircuitBroken(), false)
    assert.equal(first.flagCli, true)
  },
)

test(
  'target116 retains the target105 state-object isolation API',
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
    assert.equal(latest.includes('_resetForTesting'), false)
    assertStateObjectBundle(latest, 'target116')
  },
)
