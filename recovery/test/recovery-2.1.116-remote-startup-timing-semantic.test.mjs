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

const baselineSystemInit = [
  18296,
  11_322_900,
  11_324_060,
  '7fe0e4c7f7c9b4041358c78e6dd2b1cde9dd53785c0562bb7fdf90b45a71205a',
]
const targetUnits = [
  [
    18363,
    11_328_251,
    11_328_304,
    'FunctionDeclaration',
    '04666a827f93dafef9a022ac31996b79a6a34abb8e5b9f98d3719a4fe9d77e5e',
  ],
  [
    18364,
    11_328_304,
    11_328_497,
    'FunctionDeclaration',
    '26c8995013ac21c1ab0dcb4479d952e4b8c7c058fbbb21bec8e6fab27f9f7717',
  ],
  [
    18365,
    11_328_497,
    11_328_512,
    'VariableDeclaration',
    '004b142a743c9022ccef6452bb82dee742908e22b2a85d35661266f49299351d',
  ],
  [
    18366,
    11_328_512,
    11_328_541,
    'VariableDeclaration',
    '4327c54c2addc327ac1818534fcdcd1715031e643269c34552a7f268826569ea',
  ],
  [
    18502,
    11_397_918,
    11_399_165,
    'FunctionDeclaration',
    '637facd87df6c7c003ad95c3d3d5461495b715f31c003e993bfd3bb5d4e45dc5',
  ],
  [
    20581,
    12_915_603,
    12_954_120,
    'FunctionDeclaration',
    '66fa02021a22925ae2e3eb6c757c5a9e91a25ecb102ebe0ed8bdd47efeb44ce2',
  ],
  [
    20720,
    13_036_753,
    13_094_202,
    'FunctionDeclaration',
    '5eedcab727da9a4eb48d70598545dc8c7e0d3f33546e1d64f0b186ab829a7017',
  ],
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

async function instantiateStartupTiming(env = {}) {
  const ts = await loadTypeScript()
  const owner = source('bridge/startupTiming.ts').replace(
    /^import[^\n]+\n/,
    '',
  )
  const javascript = ts.transpileModule(owner, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  const fakeProcess = { env: { ...env } }
  new Function('exports', 'module', 'isEnvTruthy', 'process', javascript)(
    module.exports,
    module,
    value => /^(?:1|true|yes)$/i.test(value ?? ''),
    fakeProcess,
  )
  return { api: module.exports, process: fakeProcess }
}

test('target116 pins the remote startup timing producer and all four writers', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  assert.equal(baseline.length, 12_986_755)
  assert.equal(target.length, 13_102_272)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  const [baselineIndex, baselineStart, baselineEnd, baselineHash] =
    baselineSystemInit
  const oldInit = structural.unmatchedBaseline.find(
    unit => unit.index === baselineIndex,
  )
  assert.ok(oldInit, `baseline unit ${baselineIndex}`)
  assert.deepEqual(
    [oldInit.start, oldInit.end, oldInit.sourceHash],
    [baselineStart, baselineEnd, baselineHash],
  )
  assert.equal(sha256(baseline.slice(baselineStart, baselineEnd)), baselineHash)

  for (const [index, start, end, nodeType, hash] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
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

  for (const marker of [
    'startup_timing',
    'plugin_mcp_reconcile_ms',
    'first_message_read_ms',
    'plugin_install_ms',
    'mcp_connect_ms',
  ]) {
    assert.equal((baseline.match(new RegExp(marker, 'g')) ?? []).length, 0)
    assert.equal((target.match(new RegExp(marker, 'g')) ?? []).length, 1)
  }

  const producer = target.slice(11_328_251, 11_328_541)
  assert.match(producer, /Math\.round\(\$\)/)
  assert.match(producer, /CLAUDE_CODE_REMOTE/)
  assert.match(producer, /CLAUDE_CODE_ENTRYPOINT\?\?"unknown"/)
  assert.match(producer, /Object\.keys\(.+\)\.length===0/)
  assert.match(producer, /phases:\{\.\.\./)

  const init = target.slice(11_397_918, 11_399_165)
  assert.match(init, /fast_mode_state=.+;let .+=.+\(\);if\(.+\)K\.startup_timing=/)

  const headless = target.slice(12_915_603, 12_954_120)
  assert.match(
    headless,
    /CLAUDE_CODE_SYNC_PLUGIN_INSTALL.+plugin_mcp_reconcile_ms/s,
  )
  assert.match(headless, /run_entry.+first_message_read_ms/s)
  assert.match(headless, /plugin_install_ms/)

  const main = target.slice(13_036_753, 13_094_202)
  assert.match(main, /performance\.now\(\).+mcp_connect_ms/s)
})

test('source preserves the internal-only init payload and all target phase boundaries', sourceOptions, () => {
  const timing = source('bridge/startupTiming.ts')
  const init = source('utils/messages/systemInit.ts')
  const headless = source('cli/print.ts')
  const main = source('main.tsx')
  const sdkSchema = source('entrypoints/sdk/coreSchemas.ts')
  const sdkTypes = source('entrypoints/sdk/coreTypes.ts')

  for (const fragment of [
    'const startupPhases: Record<string, number> = {}',
    'let consumed = false',
    'if (consumed) return',
    'startupPhases[name] = Math.round(durationMs)',
    'if (!isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) return undefined',
    "entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT ?? 'unknown'",
    'phases: { ...startupPhases }',
  ]) assert.ok(timing.includes(fragment), fragment)

  assert.ok(
    init.includes(
      "import { consumeRemoteStartupTiming } from 'src/bridge/startupTiming.js'",
    ),
  )
  assert.ok(init.includes('const startupTiming = consumeRemoteStartupTiming()'))
  assert.ok(init.includes('Object.assign(initMessage, { startup_timing: startupTiming })'))

  for (const fragment of [
    "recordRemoteStartupPhase('first_message_read_ms', performance.now())",
    "'plugin_mcp_reconcile_ms'",
    "'plugin_install_ms'",
    'performance.now() - reconcileStartedAt',
    'performance.now() - pluginInstallStartedAt',
  ]) assert.ok(headless.includes(fragment), fragment)
  assert.match(
    headless,
    /CLAUDE_CODE_SYNC_PLUGIN_INSTALL[\s\S]+plugin_mcp_reconcile_ms/,
  )
  assert.ok(main.includes('const mcpConnectStartedAt = performance.now()'))
  assert.ok(
    main.includes(
      "recordRemoteStartupPhase('mcp_connect_ms', performance.now() - mcpConnectStartedAt)",
    ),
  )

  // The target bundle contains startup_timing only at the init builder. It is
  // intentionally an internal wire extension, not part of the public SDK type.
  assert.doesNotMatch(sdkSchema, /startup_timing/)
  assert.doesNotMatch(sdkTypes, /startup_timing/)
})

test('actual startup timing rounds phases, gates on remote mode, and consumes once', sourceOptions, async () => {
  const local = await instantiateStartupTiming()
  local.api.recordRemoteStartupPhase('initial_ms', 1.6)
  assert.equal(local.api.consumeRemoteStartupTiming(), undefined)
  local.process.env.CLAUDE_CODE_REMOTE = 'true'
  assert.deepEqual(local.api.consumeRemoteStartupTiming(), {
    entrypoint: 'unknown',
    phases: { initial_ms: 2 },
  })
  assert.equal(local.api.consumeRemoteStartupTiming(), undefined)
  local.api.recordRemoteStartupPhase('too_late_ms', 9)
  assert.equal(local.api.consumeRemoteStartupTiming(), undefined)

  const remote = await instantiateStartupTiming({
    CLAUDE_CODE_REMOTE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'sdk-ts',
  })
  assert.equal(remote.api.consumeRemoteStartupTiming(), undefined)
  remote.api.recordRemoteStartupPhase('alpha_ms', 1.49)
  remote.api.recordRemoteStartupPhase('beta_ms', -1.6)
  assert.deepEqual(remote.api.consumeRemoteStartupTiming(), {
    entrypoint: 'sdk-ts',
    phases: { alpha_ms: 1, beta_ms: -2 },
  })
})

test('actual system-init builder propagates the timing payload without disturbing existing fields', sourceOptions, async () => {
  const ts = await loadTypeScript()
  const init = source('utils/messages/systemInit.ts')
  const builder = functionSource(init, 'buildSystemInitMessage')
  const javascript = ts.transpileModule(
    `type SystemInitInputs = any; type SDKMessage = any; type ApiKeySource = any;\n` +
      `let timingValue: unknown;\n` +
      `const consumeRemoteStartupTiming = () => { const value = timingValue; timingValue = undefined; return value; };\n` +
      `const getSettings_DEPRECATED = () => undefined; const DEFAULT_OUTPUT_STYLE_NAME = 'default';\n` +
      `const getCwd = () => '/work'; const getSessionId = () => 'session';\n` +
      `const sdkCompatToolName = (name: string) => name; const feature = () => false;\n` +
      `const isAutoMemoryEnabled = () => false; const getAutoMemPath = () => '/memory';\n` +
      `const getAnthropicApiKeyWithSource = () => ({ source: 'none' }); const getSdkBetas = () => [];\n` +
      `const MACRO = { VERSION: '2.1.116' }; const randomUUID = () => 'uuid';\n` +
      `const getFastModeState = () => ({ type: 'off' });\n` +
      `${builder}\n` +
      `export { buildSystemInitMessage, setTiming };\n` +
      `function setTiming(value: unknown) { timingValue = value; }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    () => ({}),
  )
  const inputs = {
    tools: [],
    mcpClients: [],
    model: 'model',
    permissionMode: 'default',
    commands: [],
    agents: [],
    skills: [],
    plugins: [],
    pluginErrors: [],
    fastMode: false,
  }

  const withoutTiming = module.exports.buildSystemInitMessage(inputs)
  assert.equal(withoutTiming.startup_timing, undefined)
  assert.deepEqual(withoutTiming.fast_mode_state, { type: 'off' })

  const payload = { entrypoint: 'sdk-py', phases: { mcp_connect_ms: 17 } }
  module.exports.setTiming(payload)
  const withTiming = module.exports.buildSystemInitMessage(inputs)
  assert.deepEqual(withTiming.startup_timing, payload)
  assert.deepEqual(withTiming.fast_mode_state, { type: 'off' })
  assert.equal(
    module.exports.buildSystemInitMessage(inputs).startup_timing,
    undefined,
  )
})
