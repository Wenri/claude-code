import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
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
  [8635, ['FunctionDeclaration', 5906637, 5908071, '46fd5d5b169b180015504cfea0c13250e1ebd493f877baf479cc86352d4b1b39']],
  [8723, ['FunctionDeclaration', 5929730, 5932352, 'cc2a617fa75b44e0a776a88424b135af4ed55e8215d84f76b1ad45b13bb8c229']],
  [11928, ['FunctionDeclaration', 9290774, 9292288, '3f59038d2065eeb2bad2c0d0d4927d9917b8dc994fd41c90eba9763bd9d79c1d']],
  [12536, ['FunctionDeclaration', 9595047, 9597748, 'b210bfac002650dd876666f51185403ee641511750a1384f4644a662950b914d']],
  [12538, ['VariableDeclaration', 9597834, 9608991, '20e8bf10e74544e3f067eccc5a1283363bf17458cd4e7d4a9d55744f1b8d1193']],
  [12775, ['FunctionDeclaration', 9756399, 9758729, 'd934dbc8a1bc35c74d516343fa06f757286f30bcc3389e5a51c82af4c5ed47a5']],
  [18386, ['FunctionDeclaration', 12731362, 12789746, 'a19619e44713e41b4e5b83d8f9e5e8a67ef9553396a241a74ccc40f4a7980e32']],
  [18934, ['ClassDeclaration', 13410330, 13426994, '9c1d060ead7a059c35f7a2f11f846cedaa050565fe4fcc62e0d5a1f6651204c5']],
  [18935, ['FunctionDeclaration', 13426994, 13428318, '42006e68390ac01422b64f304d9e0b3627bd52d1ffebe75ff2168de133857bc9']],
  [18967, ['FunctionDeclaration', 13439202, 13472373, 'dff9e4822e9aeb3d9473b61353ca117788616672af04a6c2c19428c0c2d67be1']],
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

function assertFragments(relativePath, fragments) {
  const contents = source(relativePath)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relativePath}: ${fragment}`)
  }
  return contents
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

async function extractEnvironmentOverrideMethod() {
  const ts = await loadTypeScript()
  const relativePath = 'utils/shell/bashProvider.ts'
  const contents = source(relativePath)
  const parsed = ts.createSourceFile(
    relativePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  let method
  function visit(node) {
    if (
      ts.isMethodDeclaration(node) &&
      node.name.getText(parsed) === 'getEnvironmentOverrides'
    ) {
      method = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.ok(method, 'getEnvironmentOverrides declaration')
  return method
    .getText(parsed)
    .replace(/^async\s+getEnvironmentOverrides/, 'async function getEnvironmentOverrides')
}

async function compileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

test(
  'authenticated target105 pins the complete per-session tmux socket boundary',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    assert.equal(occurrences(baseline, 'tmuxSocket'), 0)
    assert.equal(occurrences(target, 'tmuxSocket'), 20)
    assert.equal(occurrences(latest, 'tmuxSocket'), 21)
    assert.equal(occurrences(baseline, 'getTmuxEnv'), 0)
    assert.equal(occurrences(target, 'getTmuxEnv'), 1)
    assert.equal(occurrences(latest, 'getTmuxEnv'), 1)

    for (const [index, [nodeType, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.index,
          region.target.nodeType,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [index, nodeType, start, end, hash],
        `${index}: identity`,
      )
      const fragment = target.slice(start, end)
      assert.equal(sha256(fragment), hash, `${index}: bytes`)
      assert.ok(
        fragment.includes(index === 8635 ? 'getTmuxEnv' : 'tmuxSocket'),
        `${index}: socket edge`,
      )
    }

    assert.match(
      target.slice(5906637, 5908071),
      /getEnvironmentOverrides\([^)]*\)[^{]*\{[^}]*getTmuxEnv\(\)/,
    )
    assert.match(
      target.slice(5929730, 5932352),
      /\{[^}]*sessionEnvVars:\w+,tmuxSocket:\w+\}/,
    )
    assert.match(
      target.slice(9756399, 9758729),
      /sessionEnvVars:\w+\.sessionEnvVars,tmuxSocket:\w+\.tmuxSocket/,
    )
  },
)

test(
  'authored source threads one optional socket through every reachable shell context',
  sourceOptions,
  () => {
    const providerContract = assertFragments('utils/shell/shellProvider.ts', [
      'export type TmuxSocket = {',
      'getTmuxEnv(): string | null',
      'tmuxSocket?: TmuxSocket',
    ])
    assert.equal(occurrences(providerContract, 'getTmuxEnv'), 1)

    const provider = assertFragments('utils/shell/bashProvider.ts', [
      'tmuxSocket?: TmuxSocket',
      'tmuxSocket?.getTmuxEnv() ?? null',
      'env.TMUX = claudeTmuxEnv',
    ])
    for (const staleGlobal of [
      'ensureSocketInitialized',
      'getClaudeTmuxEnv',
      'hasTmuxToolBeenUsed',
    ]) {
      assert.equal(provider.includes(staleGlobal), false, staleGlobal)
    }

    assertFragments('utils/Shell.ts', [
      'tmuxSocket?: TmuxSocket',
      'sessionEnvVars,\n    tmuxSocket,',
    ])
    assertFragments('Tool.ts', ['tmuxSocket?: TmuxSocket'])
    assertFragments('tools/MonitorTool/MonitorTool.ts', [
      'tmuxSocket: context.tmuxSocket',
    ])
    const bash = assertFragments('tools/BashTool/BashTool.tsx', [
      'tmuxSocket: toolUseContext.tmuxSocket',
      "tmuxSocket?: ToolUseContext['tmuxSocket']",
      'sessionEnvVars,\n    tmuxSocket',
    ])
    assert.ok(occurrences(bash, 'tmuxSocket') >= 4)
    assertFragments('utils/forkedAgent.ts', [
      'tmuxSocket: parentContext.tmuxSocket',
    ])
    assertFragments('screens/REPL.tsx', [
      "useRef<ToolUseContext['tmuxSocket']>(undefined)",
      'tmuxSocket: tmuxSocketRef.current',
    ])

    const engine = assertFragments('QueryEngine.ts', [
      "tmuxSocket?: ToolUseContext['tmuxSocket']",
      "private tmuxSocket: ToolUseContext['tmuxSocket']",
      'this.tmuxSocket = config.tmuxSocket',
      'tmuxSocket: this.tmuxSocket',
      'tmuxSocket,',
    ])
    assert.ok(occurrences(engine, 'tmuxSocket: this.tmuxSocket') >= 2)
    assertFragments('cli/print.ts', [
      "const tmuxSocket: ToolUseContext['tmuxSocket'] = undefined",
      'sessionEnvVars,\n              tmuxSocket,',
    ])
  },
)

test(
  'bash environment selection executes the supplied session capability without global state',
  sourceOptions,
  async () => {
    const method = await extractEnvironmentOverrideMethod()
    const javascript = await compileCommonJs(`
      type TmuxSocket = { getTmuxEnv(): string | null }
      let currentSandboxTmpDir: string | undefined
      ${method}
      module.exports = { getEnvironmentOverrides }
    `)
    const module = { exports: {} }
    new Function('module', 'exports', 'process', javascript)(
      module,
      module.exports,
      process,
    )
    const runtime = module.exports
    let calls = 0
    const socket = {
      getTmuxEnv() {
        calls++
        return '/tmp/tmux-42/claude,4242,0'
      },
    }

    assert.deepEqual(
      await runtime.getEnvironmentOverrides(
        'printf ok',
        new Map([['SESSION_ONLY', 'yes']]),
        socket,
      ),
      {
        CLAUDE_CODE_EXECPATH: process.execPath,
        TMUX: '/tmp/tmux-42/claude,4242,0',
        SESSION_ONLY: 'yes',
      },
    )
    assert.equal(calls, 1)

    const sessionWins = await runtime.getEnvironmentOverrides(
      'tmux list-sessions',
      new Map([['TMUX', 'explicit-session-value']]),
      socket,
    )
    assert.equal(sessionWins.TMUX, 'explicit-session-value')
    assert.equal(calls, 2)

    assert.deepEqual(
      await runtime.getEnvironmentOverrides('printf no-socket'),
      { CLAUDE_CODE_EXECPATH: process.execPath },
    )
    assert.equal(calls, 2)
  },
)
