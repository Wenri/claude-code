import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
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

const baselineUnit = {
  index: 14398,
  start: 9055745,
  end: 9056417,
  hash: '9f596adaa42640303e775b1cefcbe823bf15016e07ad941cd8808c7657b77a25',
}
const targetUnit = {
  index: 14534,
  start: 9106363,
  end: 9107157,
  hash: '1c20f80bde5706a6e734d1a73129047eed80ee5e48a3ab8bd8c2ea0b1dd24341',
}
const retryLiteral = {
  start: 9106460,
  end: 9106526,
  value: "Reconnect returned 'needs-auth'; retrying once after cache clear",
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

async function compileReconnect(contents) {
  const ts = await loadTypeScript()
  const parsed = ts.createSourceFile(
    'client.ts',
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const fn = parsed.statements.find(
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'reconnectMcpServerImpl',
  )
  assert.ok(fn, 'reconnectMcpServerImpl must exist')
  const javascript = ts.transpileModule(
    `${fn.getText(parsed).replace(/^export\s+/, '')}\nglobalThis.reconnectMcpServerImpl = reconnectMcpServerImpl`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  return javascript
}

async function executeReconnect(javascript, sequence) {
  const state = {
    cacheDeletes: [],
    calls: [],
    clearKeychain: 0,
    clearServer: 0,
    debug: [],
    oauthClears: 0,
    fetches: 0,
  }
  const connectToServer = async (name, config) => {
    state.calls.push([name, config])
    return sequence.shift()
  }
  connectToServer.cache = {
    delete(key) {
      state.cacheDeletes.push(key)
    },
  }
  const context = {
    clearKeychainCache: () => state.clearKeychain++,
    clearMcpOAuthEntryIfNoTokens: () => state.oauthClears++,
    clearServerCache: async () => state.clearServer++,
    connectToServer,
    errorMessage: error => String(error),
    feature: () => false,
    fetchCommandsForClient: async () => {
      state.fetches++
      return ['command']
    },
    fetchMcpSkillsForClient: async () => [],
    fetchResourcesForClient: async () => [],
    fetchToolsForClient: async () => {
      state.fetches++
      return ['tool']
    },
    getServerCacheKey: (name, config) => `${name}:${config.type}`,
    ListMcpResourcesTool: { name: 'ListMcpResources' },
    logMCPDebug: (...args) => state.debug.push(args),
    logMCPError: () => {},
    markClaudeAiMcpConnected: () => {},
    Promise,
    ReadMcpResourceTool: { name: 'ReadMcpResource' },
    toolMatchesName: (tool, name) => tool.name === name,
  }
  vm.runInNewContext(javascript, context)
  const config = { type: 'http', url: 'https://example.test' }
  const result = await context.reconnectMcpServerImpl('server', config)
  return { result, state }
}

test(
  'authenticated target116 adds one cache-busting retry for needs-auth reconnects',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const targetRegion = structural.regions[targetUnit.index]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.sourceHash,
      ],
      [targetUnit.start, targetUnit.end, targetUnit.hash],
    )
    assert.equal(
      sha256(target.slice(targetUnit.start, targetUnit.end)),
      targetUnit.hash,
    )
    const baselineRegion = structural.unmatchedBaseline.find(
      unit => unit.index === baselineUnit.index,
    )
    assert.ok(baselineRegion)
    assert.deepEqual(
      [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
      [baselineUnit.start, baselineUnit.end, baselineUnit.hash],
    )
    assert.equal(
      sha256(baseline.slice(baselineUnit.start, baselineUnit.end)),
      baselineUnit.hash,
    )
    assert.equal(baseline.split(retryLiteral.value).length - 1, 0)
    assert.equal(target.split(retryLiteral.value).length - 1, 1)
    assert.ok(
      target
        .slice(retryLiteral.start, retryLiteral.end)
        .includes(retryLiteral.value),
    )
    const fn = target.slice(targetUnit.start, targetUnit.end)
    assert.match(fn, /\.cache\?\.delete\?\./)
    assert.equal(fn.split('await NT(H,$)').length - 1, 2)
  },
)

test(
  'source reconnect clears the memoized needs-auth result and retries exactly once',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const contents = fs.readFileSync(
      path.join(sourceRoot, 'services/mcp/client.ts'),
      'utf8',
    )
    assert.ok(contents.includes(retryLiteral.value))
    assert.match(
      contents,
      /if \(client\.type === 'needs-auth'\)[\s\S]*getServerCacheKey\(name, config\)[\s\S]*connectToServer\.cache\.delete\(key\)[\s\S]*client = await connectToServer\(name, config\)/,
    )
    const javascript = await compileReconnect(contents)
    const config = { name: 'server', type: 'http' }
    const connected = {
      name: 'server',
      type: 'connected',
      config,
      capabilities: {},
    }
    const recovered = await executeReconnect(javascript, [
      { name: 'server', type: 'needs-auth', config },
      connected,
    ])
    assert.equal(recovered.state.clearKeychain, 1)
    assert.equal(recovered.state.clearServer, 1)
    assert.equal(recovered.state.calls.length, 2)
    assert.deepEqual(recovered.state.cacheDeletes, ['server:http'])
    assert.deepEqual(recovered.state.debug, [
      [
        'server',
        "Reconnect returned 'needs-auth'; retrying once after cache clear",
      ],
    ])
    assert.equal(recovered.result.client.type, 'connected')
    assert.deepEqual(Array.from(recovered.result.tools), ['tool'])
    assert.deepEqual(Array.from(recovered.result.commands), ['command'])
    assert.equal(recovered.state.oauthClears, 1)

    const stillNeedsAuth = await executeReconnect(javascript, [
      { name: 'server', type: 'needs-auth', config },
      { name: 'server', type: 'needs-auth', config },
      connected,
    ])
    assert.equal(stillNeedsAuth.state.calls.length, 2)
    assert.equal(stillNeedsAuth.result.client.type, 'needs-auth')
    assert.equal(stillNeedsAuth.state.fetches, 0)
  },
)
