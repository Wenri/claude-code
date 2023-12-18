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
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

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

const targetUnits = [
  [
    7231,
    'FunctionDeclaration',
    3377648,
    3378023,
    '2e365225a58655352e3ec173689b84304db8307ab0b629b3dbcc99d186e22942',
  ],
  [
    12159,
    'FunctionDeclaration',
    7698801,
    7700609,
    '7dd585b13fe2092e1b80523ec735a3b45463403ca51e32ea6ddcdd9e5747fd49',
  ],
  [
    18532,
    'ClassDeclaration',
    11407010,
    11416106,
    '7ad44c544ea0559116dbac5fcbd134554573de9028ec843728f4f811472577e5',
  ],
  [
    19937,
    'FunctionDeclaration',
    12073788,
    12074406,
    '3eaec64d8d1f1c10c59f51e07645ec1c898796510d97c6a97acedeac7c17b9ff',
  ],
  [
    19948,
    'FunctionDeclaration',
    12076530,
    12076738,
    '159d54b443f810f941fb6f2684aedb35a446c0c59878c77ce3ecf9bbdbc5e289',
  ],
]

const typedOccurrences = [
  ['property', 'useDecayCurve', 3377789, 3377802, 7231],
  ['property', 'useAdaptiveDrain', 3377821, 3377837, 7231],
  ['property', 'termProgram', 3377862, 3377873, 7231],
  ['property', 'connectors', 7700342, 7700352, 12159],
  ['property', 'body', 11410563, 11410567, 18532],
  ['property', 'body', 11410619, 11410623, 18532],
  ['property', 'body', 11415205, 11415209, 18532],
  ['property', 'hasUnmounted', 12074119, 12074131, 19937],
  ['property', 'rows', 12074237, 12074241, 19937],
  ['number', '24', 12074243, 12074245, 19937],
  ['property', 'height', 12074325, 12074331, 19937],
  ['property', 'flexShrink', 12074347, 12074357, 19937],
  ['property', 'useDecayCurve', 12076584, 12076597, 19948],
  ['property', 'termProgram', 12076695, 12076706, 19948],
  ['property', 'useDecayCurve', 12076716, 12076729, 19948],
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

function evaluateCommonJs(javaScript, requireImpl, globals = {}) {
  const module = { exports: {} }
  const names = ['exports', 'module', 'require', ...Object.keys(globals)]
  const values = [module.exports, module, requireImpl, ...Object.values(globals)]
  new Function(...names, javaScript)(...values)
  return module.exports
}

function findClassMethod(owner, className, methodName, ts) {
  const sourceFile = ts.createSourceFile(
    `${className}.ts`,
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  let match
  const visit = node => {
    if (
      ts.isClassDeclaration(node) &&
      node.name?.text === className
    ) {
      match = node.members.find(
        member =>
          ts.isMethodDeclaration(member) &&
          member.name?.getText(sourceFile) === methodName,
      )
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(match, `${className}.${methodName}`)
  return owner.slice(match.getStart(sourceFile), match.end)
}

test('target116 authenticates all four live residue units and shared wheel config', pairOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  const targetText = target.toString('utf8')
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  for (const [index, nodeType, start, end, sourceHash] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.index,
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [index, nodeType, start, end, sourceHash],
    )
    assert.equal(sha256(targetText.slice(start, end)), sourceHash)
  }

  for (const [kind, value, start, end, structuralIndex] of typedOccurrences) {
    assert.equal(targetText.slice(start, end), value)
    const owner = structural.regions[structuralIndex].target
    assert.ok(start >= owner.start && end <= owner.end, `${kind}:${value}`)
  }

  const fragments = new Map(
    targetUnits.map(([index, , start, end]) => [
      index,
      targetText.slice(start, end),
    ]),
  )
  assert.match(fragments.get(12159), /connectors:\[?/)
  assert.equal((fragments.get(18532).match(/\.body\?\.cancel\(\)/g) ?? []).length, 2)
  assert.match(fragments.get(19937), /hasUnmounted\?"":/)
  assert.match(fragments.get(19948), /useDecayCurve/)
  assert.match(fragments.get(19948), /termProgram/)
})

test('u12159 AgentProgressLine executes branch/last and pipe/space connectors', sourceOptions, async () => {
  const owner = source('components/AgentProgressLine.tsx')
  assert.match(
    owner,
    /import \{ Connector as TreeConnector \} from '\.\/design-system\/Tree\.js'/,
  )
  assert.doesNotMatch(owner, /const treeChar =/)
  assert.match(owner, /<TreeConnector connectors=\{t4\}>/)
  assert.match(owner, /connectors=\{\[isLast \? "space" : "pipe"\]\}/)

  const ts = await loadTypeScript()
  const javaScript = ts.transpileModule(owner, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const Box = Symbol('Box')
  const Text = Symbol('Text')
  const TreeConnector = Symbol('TreeConnector')
  const Fragment = Symbol('Fragment')
  const react = {
    Fragment,
    createElement(type, props, ...children) {
      return {
        type,
        props: {
          ...(props ?? {}),
          children: children.length <= 1 ? children[0] : children,
        },
      }
    },
  }
  const loaded = evaluateCommonJs(javaScript, specifier => {
    if (specifier === 'react/compiler-runtime') return { c: size => Array(size) }
    if (specifier === 'react') return react
    if (specifier === './design-system/Tree.js') return { Connector: TreeConnector }
    if (specifier === '../ink.js') return { Box, Text }
    if (specifier === '../utils/format.js') return { formatNumber: String }
    throw new Error(`unexpected AgentProgressLine import: ${specifier}`)
  })

  const baseProps = {
    agentType: 'Explore',
    toolUseCount: 1,
    tokens: 12,
    isResolved: false,
    isError: false,
    shouldAnimate: false,
  }
  const branch = loaded.AgentProgressLine({ ...baseProps, isLast: false })
  assert.equal(branch.type, Box)
  assert.equal(branch.props.paddingLeft, 3)
  assert.deepEqual(branch.props.children[0].props.connectors, ['branch'])
  assert.deepEqual(branch.props.children[1].props.connectors, ['pipe'])
  assert.deepEqual(branch.props.children[1].props.children.props.children, [
    '⎿  ',
    'Initializing…',
  ])

  const last = loaded.AgentProgressLine({ ...baseProps, isLast: true })
  assert.deepEqual(last.props.children[0].props.connectors, ['last'])
  assert.deepEqual(last.props.children[1].props.connectors, ['space'])
})

test('u18532 CCRClient executes native fetch and cancels every unconsumed body', sourceOptions, async () => {
  const owner = source('cli/transports/ccrClient.ts')
  assert.match(owner, /import \{ getProxyFetchOptions \} from '\.\.\/\.\.\/utils\/proxy\.js'/)
  assert.doesNotMatch(owner, /createAxiosInstance|this\.http|alwaysValidStatus/)
  assert.match(owner, /body: JSON\.stringify\(body\)/)
  assert.match(owner, /signal: AbortSignal\.timeout\(timeout\)/)
  assert.equal((owner.match(/response\.body\?\.cancel\(\)/g) ?? []).length, 2)

  const ts = await loadTypeScript()
  const request = findClassMethod(owner, 'CCRClient', 'request', ts)
  const getWithRetry = findClassMethod(owner, 'CCRClient', 'getWithRetry', ts)
  const harnessSource = `
    class Harness {
      consecutiveAuthFailures = 4
      sessionBaseUrl = 'https://ccr.example/session'
      onEpochMismatch = () => { throw new Error('epoch mismatch') }
      getAuthHeaders() { return { Authorization: 'Bearer test' } }
      handleEpochMismatch() { throw new Error('epoch mismatch') }
      ${request}
      ${getWithRetry}
    }
    exports.Harness = Harness
  `
  const javaScript = ts.transpileModule(harnessSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  let mode = 'request'
  let cancelCount = 0
  const fetchCalls = []
  const fetchMock = async (url, init) => {
    fetchCalls.push({ url, init })
    if (mode === 'request') {
      return {
        ok: false,
        status: 429,
        headers: { get: name => name === 'retry-after' ? '7' : null },
        body: { cancel: () => { cancelCount++ } },
      }
    }
    if (mode === 'get-success') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: ['event'] }),
        body: { cancel: () => { throw new Error('consumed body cancelled') } },
      }
    }
    return {
      ok: false,
      status: 500,
      body: { cancel: () => { cancelCount++ } },
    }
  }
  const loaded = evaluateCommonJs(javaScript, () => {
    throw new Error('the CCR harness must not import modules')
  }, {
    fetch: fetchMock,
    AbortSignal: { timeout: timeout => `timeout:${timeout}` },
    getProxyFetchOptions: () => ({ dispatcher: 'proxy-agent' }),
    getClaudeCodeUserAgent: () => 'test-agent',
    getSessionIngressAuthToken: () => null,
    decodeJwtExpiry: () => null,
    logForDebugging: () => {},
    logForDiagnosticsNoPII: () => {},
    errorMessage: String,
    getErrnoCode: () => 'ERR',
    sleep: async () => {},
  })
  const harness = new loaded.Harness()

  const requestResult = await harness.request(
    'post',
    '/worker',
    { worker_epoch: 4 },
    'worker',
  )
  assert.deepEqual(requestResult, { ok: false, retryAfterMs: 7000 })
  assert.equal(cancelCount, 1)
  assert.deepEqual(fetchCalls[0], {
    url: 'https://ccr.example/session/worker',
    init: {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test',
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'User-Agent': 'test-agent',
      },
      body: '{"worker_epoch":4}',
      signal: 'timeout:10000',
      dispatcher: 'proxy-agent',
    },
  })

  mode = 'get-failure'
  assert.equal(
    await harness.getWithRetry(
      'https://ccr.example/session/worker',
      { Authorization: 'Bearer test' },
      'worker_state',
    ),
    null,
  )
  assert.equal(cancelCount, 11)

  mode = 'get-success'
  assert.deepEqual(
    await harness.getWithRetry(
      'https://ccr.example/session/worker',
      { Authorization: 'Bearer test' },
      'worker_state',
    ),
    { data: ['event'] },
  )
})

test('u19937 AlternateScreen executes exactly one owner for alt-screen exit', sourceOptions, async () => {
  const owner = source('ink/components/AlternateScreen.tsx')
  assert.match(
    owner,
    /ink\?\.hasUnmounted \? "" : EXIT_ALT_SCREEN/,
  )
  const ts = await loadTypeScript()
  const javaScript = ts.transpileModule(owner, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  function run(hasUnmounted) {
    const writes = []
    let cleanup
    const writeContext = Symbol('TerminalWriteContext')
    const sizeContext = Symbol('TerminalSizeContext')
    const ink = {
      hasUnmounted,
      setAltScreenActive() {},
      clearTextSelection() {},
    }
    const react = {
      createElement(type, props, ...children) {
        return { type, props: { ...(props ?? {}), children } }
      },
      useContext(context) {
        if (context === writeContext) return value => writes.push(value)
        if (context === sizeContext) return { rows: 24 }
        throw new Error('unexpected context')
      },
      useInsertionEffect(effect) {
        cleanup = effect()
      },
    }
    const loaded = evaluateCommonJs(javaScript, specifier => {
      if (specifier === 'react/compiler-runtime') return { c: size => Array(size) }
      if (specifier === 'react') return { __esModule: true, default: react, ...react }
      if (specifier === '../instances.js') {
        return { __esModule: true, default: { get: () => ink } }
      }
      if (specifier === '../termio/dec.js') {
        return {
          DISABLE_MOUSE_TRACKING: '<mouse-off>',
          ENABLE_MOUSE_TRACKING: '<mouse-on>',
          ENTER_ALT_SCREEN: '<alt-on>',
          EXIT_ALT_SCREEN: '<alt-off>',
        }
      }
      if (specifier === '../useTerminalNotification.js') {
        return { TerminalWriteContext: writeContext }
      }
      if (specifier === './TerminalSizeContext.js') {
        return { TerminalSizeContext: sizeContext }
      }
      if (specifier === './Box.js') return { __esModule: true, default: Symbol('Box') }
      throw new Error(`unexpected AlternateScreen import: ${specifier}`)
    })
    loaded.AlternateScreen({ children: 'screen' })
    assert.equal(typeof cleanup, 'function')
    cleanup()
    return writes
  }

  assert.equal(run(false).at(-1), '<mouse-off><alt-off>')
  assert.equal(run(true).at(-1), '<mouse-off>')
})

test('u19948 shared wheel config executes native, Windows, WT and xterm policies', sourceOptions, async () => {
  const configOwner = source('ink/scroll-config.ts')
  const terminalOwner = source('ink/terminal.ts')
  const handlerOwner = source('components/ScrollKeybindingHandler.tsx')
  const rendererOwner = source('ink/render-node-to-output.ts')
  assert.match(terminalOwner, /export function getXtversionName\(\)/)
  assert.match(handlerOwner, /const config = getScrollConfig\(\)/)
  assert.match(handlerOwner, /config\.useDecayCurve/)
  assert.match(handlerOwner, /TERM_PROGRAM=\$\{config\.termProgram\}/)
  assert.match(rendererOwner, /getScrollConfig\(\)\.useAdaptiveDrain/)
  assert.doesNotMatch(rendererOwner, /function isXtermJsHost\(/)

  const ts = await loadTypeScript()
  const javaScript = ts.transpileModule(configOwner, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  function loadConfig({
    platform = 'linux',
    env = {},
    initialXtversion,
    initialXtermJs = false,
  } = {}) {
    let xtversion = initialXtversion
    let xtermJs = initialXtermJs
    const loaded = evaluateCommonJs(
      javaScript,
      specifier => {
        if (specifier === './terminal.js') {
          return {
            getXtversionName: () => xtversion,
            isXtermJs: () => xtermJs,
          }
        }
        throw new Error(`unexpected scroll-config import: ${specifier}`)
      },
      { process: { env, platform } },
    )
    return {
      get: loaded.getScrollConfig,
      setProbe(nextXtversion, nextXtermJs) {
        xtversion = nextXtversion
        xtermJs = nextXtermJs
      },
    }
  }

  const native = loadConfig()
  assert.deepEqual(native.get(), {
    useDecayCurve: false,
    useAdaptiveDrain: false,
    base: 1,
    xtermJs: false,
    termProgram: 'unset',
    xtversion: '(no reply)',
    wtSession: false,
    scrollSpeedEnv: 'unset',
    platform: 'linux',
  })
  assert.equal(native.get(), native.get(), 'unchanged XTVERSION reuses snapshot')
  native.setProbe('xterm.js 5.5', true)
  assert.deepEqual(
    {
      useDecayCurve: native.get().useDecayCurve,
      useAdaptiveDrain: native.get().useAdaptiveDrain,
      base: native.get().base,
      xtversion: native.get().xtversion,
    },
    {
      useDecayCurve: true,
      useAdaptiveDrain: true,
      base: 3,
      xtversion: 'xterm.js 5.5',
    },
  )

  const windows = loadConfig({ platform: 'win32' }).get()
  assert.equal(windows.useDecayCurve, true)
  assert.equal(windows.useAdaptiveDrain, false)
  assert.equal(windows.base, 3)

  const wt = loadConfig({ env: { WT_SESSION: '1' } }).get()
  assert.equal(wt.useDecayCurve, true)
  assert.equal(wt.useAdaptiveDrain, false)
  assert.equal(wt.base, 3)

  const clamped = loadConfig({
    env: {
      CLAUDE_CODE_SCROLL_SPEED: '50',
      TERM_PROGRAM: 'vscode',
    },
    initialXtversion: 'xterm.js',
    initialXtermJs: true,
  }).get()
  assert.equal(clamped.base, 20)
  assert.equal(clamped.termProgram, 'vscode')
  assert.equal(clamped.scrollSpeedEnv, '50')
})
