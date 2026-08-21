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

const baselineUnits = [
  [19118, 11760879, 11763213, 'cdc373a9619425e5dcfa883741916bcb6538a584201200d75ee8b0b802ccd162'],
  [19121, 11763283, 11766190, '53851956a7bf2c48e9bfcd67e5d95658e8b0cabaedd28d9f72f7c4feccf99096'],
]
const targetUnits = [
  [19363, 11852642, 11855063, '7218feb2dcca097aad61c7a0a1767f431679091560e29ca1e3bd88cf25fdf489'],
  [19366, 11855127, 11855527, '3776a6715067d9ae0d8277ea1cb762db168af43fcd487e9972a51321667b9ee7'],
  [19369, 11855583, 11856173, 'dfe8bdb63a2e6aa15719abc722287937144270854ac41991f43ca2ff520c5aac'],
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

async function instantiateHook(dependencies) {
  const ts = await loadTypeScript()
  const owner = source('hooks/useExternalSession.ts')
  const sourceFile = ts.createSourceFile(
    'useExternalSession.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'useExternalSession',
  )
  assert.ok(declaration, 'useExternalSession declaration must be present')
  const isolated = owner
    .slice(declaration.getStart(sourceFile), declaration.end)
    .replace(/^export /, '')
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const names = Object.keys(dependencies)
  return new Function(...names, `${javascript}\nreturn useExternalSession`)(
    ...names.map(name => dependencies[name]),
  )
}

test('target116 pins the shared external-session hook and both adapters', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  for (const [index, start, end, hash] of baselineUnits) {
    const region = structural.unmatchedBaseline.find(unit => unit.index === index)
    assert.ok(region, `baseline unit ${index}`)
    assert.deepEqual(
      [region.start, region.end, region.sourceHash],
      [start, end, hash],
    )
    assert.equal(sha256(baseline.slice(start, end)), hash)
  }
  for (const [index, start, end, hash] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    assert.equal(sha256(target.slice(start, end)), hash)
  }

  const oldDirect = baseline.slice(11760879, 11763213)
  const oldSSH = baseline.slice(11763283, 11766190)
  const shared = target.slice(11852642, 11855063)
  const directAdapter = target.slice(11855127, 11855527)
  const sshAdapter = target.slice(11855583, 11856173)
  assert.match(oldDirect, /useDirectConnect/)
  assert.match(oldSSH, /SSH connection dropped \\u2014 reconnecting/)
  assert.doesNotMatch(oldDirect + oldSSH, /adapter:/)
  assert.match(shared, /adapter:/)
  assert.match(shared, /createManager/)
  assert.match(shared, /Connection dropped \\u2014 reconnecting \(attempt/)
  assert.equal(
    target.slice(11854358, 11854406),
    'Connection dropped \\u2014 reconnecting (attempt ',
  )
  assert.match(directAdapter, /label:"directConnect"/)
  assert.match(sshAdapter, /label:"ssh"/)
  assert.match(sshAdapter, /permissionMode:/)
})

test('source owns one shared adapter hook and routes permission mode to both adapters', sourceOptions, () => {
  const shared = source('hooks/useExternalSession.ts')
  const direct = source('hooks/useDirectConnect.ts')
  const ssh = source('hooks/useSSHSession.ts')
  const repl = source('screens/REPL.tsx')

  for (const fragment of [
    'adapter: ExternalSessionAdapter | undefined',
    'const { label, createManager, onDisconnected, cleanup } = adapter',
    'managerRef.current?.setPermissionMode?.(permissionMode)',
    'manager.setPermissionMode?.(permissionModeRef.current)',
    '`Connection dropped — reconnecting (attempt ${attempt}/${maxAttempts})...`',
    'createSystemMessage(',
    'cleanup?.()',
  ]) assert.ok(shared.includes(fragment), fragment)
  assert.doesNotMatch(shared, /SSH connection dropped/)
  assert.match(direct, /label: 'directConnect'/)
  assert.match(direct, /new DirectConnectSessionManager\(config, callbacks\)/)
  assert.match(direct, /permissionMode: PermissionMode/)
  assert.match(direct, /permissionMode,/)
  assert.match(ssh, /label: 'ssh'/)
  assert.match(ssh, /permissionMode,/)
  assert.match(ssh, /cleanup: \(\) => session\.proxy\.stop\(\)/)

  const directCall = repl.slice(
    repl.indexOf('const directConnect = useDirectConnect({'),
    repl.indexOf('// SSH session hook'),
  )
  const sshCall = repl.slice(
    repl.indexOf('const sshRemote = useSSHSession({'),
    repl.indexOf('// Use whichever remote mode'),
  )
  assert.match(directCall, /permissionMode: toolPermissionContext\.mode/)
  assert.match(sshCall, /permissionMode: toolPermissionContext\.mode/)
})

test('actual shared hook reports reconnects and preserves mode/disconnect lifecycle', sourceOptions, async () => {
  const effects = []
  const loading = []
  const messageState = []
  const managerCalls = []
  const disconnectStates = []
  let callbacks
  const manager = {
    connect: () => managerCalls.push('connect'),
    disconnect: () => managerCalls.push('disconnect'),
    sendMessage: () => true,
    sendInterrupt: () => managerCalls.push('interrupt'),
    respondToPermissionRequest() {},
    setPermissionMode: mode => managerCalls.push(`mode:${mode}`),
  }
  const dependencies = {
    useRef: value => ({ current: value }),
    useEffect: callback => effects.push(callback()),
    useMemo: callback => callback(),
    useCallback: callback => callback,
    isSessionEndMessage: () => false,
    convertSDKMessage: () => ({ type: 'ignored' }),
    findToolByName: () => undefined,
    createToolStub: () => ({}),
    createSyntheticAssistantMessage: () => ({}),
    logForDebugging() {},
    createSystemMessage: (content, level) => ({ content, level }),
  }
  const useExternalSession = await instantiateHook(dependencies)
  const result = useExternalSession({
    adapter: {
      label: 'ssh',
      createManager(nextCallbacks) {
        callbacks = nextCallbacks
        return manager
      },
      onDisconnected: connected => disconnectStates.push(connected),
      cleanup: () => managerCalls.push('cleanup'),
    },
    setMessages(update) {
      messageState.splice(0, messageState.length, ...update(messageState))
    },
    setIsLoading(value) {
      loading.push(value)
    },
    setToolUseConfirmQueue() {},
    tools: [],
    permissionMode: 'plan',
  })

  assert.equal(result.isRemoteMode, true)
  assert.deepEqual(managerCalls, ['connect', 'mode:plan'])
  callbacks.onConnected()
  callbacks.onReconnecting(2, 5)
  assert.deepEqual(managerCalls, ['connect', 'mode:plan', 'mode:plan'])
  assert.deepEqual(loading, [false])
  assert.deepEqual(messageState, [
    {
      content: 'Connection dropped — reconnecting (attempt 2/5)...',
      level: 'warning',
    },
  ])
  callbacks.onConnected()
  callbacks.onDisconnected()
  assert.deepEqual(disconnectStates, [true])
  assert.deepEqual(loading, [false, false])
  effects.filter(Boolean).at(-1)()
  assert.deepEqual(managerCalls.slice(-2), ['disconnect', 'cleanup'])
})
