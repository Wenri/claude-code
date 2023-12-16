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
  [7936, ['FunctionDeclaration', 5544274, 5544460, '3b7b7b3fdc0bbbc93bb5994f2b0df263a52e25be3665dda2dc6ae06d92ee0418']],
  [7937, ['FunctionDeclaration', 5544460, 5544568, '6c5bb3b7bd378b20134a84e886b00bc2f59230025fb45c7a1b60a3f8231e1cc0']],
  [7939, ['FunctionDeclaration', 5545520, 5547491, '866790dfad9042a24a66652f5b3c424befc69868b94a01b10c6cede2cc23b72c']],
  [7944, ['ClassDeclaration', 5555532, 5568733, '6c112ae4306d0127de55f8c25c86caf00b382b742e888792f1064e471a2a9639']],
  [8476, ['FunctionDeclaration', 5769389, 5770061, '8ad87afb6fe5db9117218f00e69880e970274516470c6643a271de19da91cf12']],
  [8479, ['FunctionDeclaration', 5770385, 5771966, '4b770c7aa889d9b78403055d65c25b09b42d5af7a7a406abe635fdd8ff2d8bae']],
])

const typedRows = [
  [100, 5544436, 5544454],
  [101, 5547363, 5547381],
  [102, 5547399, 5547417],
  [103, 5564274, 5564292],
]

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

async function parseOwner(relativePath) {
  const ts = await loadTypeScript()
  const contents = source(relativePath)
  return {
    ts,
    contents,
    parsed: ts.createSourceFile(
      relativePath,
      contents,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  }
}

async function extractFunction(relativePath, name) {
  const { ts, parsed } = await parseOwner(relativePath)
  const declaration = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.ok(declaration, `${name} declaration`)
  return declaration.getText(parsed).replace(/^export\s+/, '')
}

async function extractMethod(relativePath, className, methodName) {
  const { ts, parsed } = await parseOwner(relativePath)
  const declaration = parsed.statements.find(
    statement =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  )
  assert.ok(declaration, `${className} declaration`)
  const method = declaration.members.find(
    member =>
      ts.isMethodDeclaration(member) && member.name.getText(parsed) === methodName,
  )
  assert.ok(method, `${className}.${methodName} declaration`)
  return method.getText(parsed)
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
  'authenticated target105 pins OAuth discovery persistence and successful-connect cleanup',
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
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(occurrences(baseline, 'oauthMetadataFound'), 0)
    assert.equal(occurrences(target, 'oauthMetadataFound'), 4)
    assert.equal(occurrences(latest, 'oauthMetadataFound'), 4)
    for (const [index, start, end] of typedRows) {
      assert.equal(target.slice(start, end), 'oauthMetadataFound', `${index}`)
    }

    const predicate = target.slice(5544274, 5544460)
    const cleanup = target.slice(5544460, 5544568)
    const revoke = target.slice(5545520, 5547491)
    const provider = target.slice(5555532, 5568733)
    assert.match(predicate, /discoveryState\?\.oauthMetadataFound===!0/)
    assert.match(cleanup, /if\([^)]*!\w+\.accessToken&&!\w+\.refreshToken\)/)
    assert.match(revoke, /oauthMetadataFound:\w+\.discoveryState\.oauthMetadataFound/)
    assert.match(provider, /oauthMetadataFound:!!\w+\.authorizationServerMetadata/)
    assert.equal(occurrences(target.slice(5769389, 5770061), 'ql1('), 1)
    assert.equal(occurrences(target.slice(5770385, 5771966), 'ql1('), 1)
  },
)

test(
  'authored OAuth source persists only successful discovery and clears stale empty entries after connect',
  sourceOptions,
  () => {
    const auth = source('services/mcp/auth.ts')
    const client = source('services/mcp/client.ts')
    assert.match(
      auth,
      /entry\.discoveryState\?\.oauthMetadataFound === true/,
    )
    assert.match(
      auth,
      /oauthMetadataFound:\s*!!state\.authorizationServerMetadata/,
    )
    assert.match(
      auth,
      /oauthMetadataFound:\s*tokenData\.discoveryState\.oauthMetadataFound/,
    )
    assert.match(
      auth,
      /export function clearMcpOAuthEntryIfNoTokens[\s\S]*if \(entry && !entry\.accessToken && !entry\.refreshToken\)[\s\S]*clearServerTokensFromLocalStorage/,
    )
    assert.equal(occurrences(client, 'clearMcpOAuthEntryIfNoTokens'), 3)
    assert.equal(
      occurrences(
        client,
        "if (config.type === 'http' || config.type === 'sse')",
      ) >= 2,
      true,
    )
  },
)

test(
  'discovery predicate, stale-entry cleanup, and persistence execute as one coherent state machine',
  sourceOptions,
  async () => {
    const predicate = await extractFunction(
      'services/mcp/auth.ts',
      'hasMcpDiscoveryButNoToken',
    )
    const cleanup = await extractFunction(
      'services/mcp/auth.ts',
      'clearMcpOAuthEntryIfNoTokens',
    )
    const saveDiscoveryState = await extractMethod(
      'services/mcp/auth.ts',
      'ClaudeAuthProvider',
      'saveDiscoveryState',
    )
    const javascript = await compileCommonJs(`
      type McpSSEServerConfig = any
      type McpHTTPServerConfig = any
      type OAuthDiscoveryState = any
      type SecureStorageData = any
      let xaaEnabled = false
      let data: any = { mcpOAuth: {} }
      const updates: any[] = []
      const clears: any[] = []
      const storage = {
        read: () => data,
        update: (next: any) => { data = next; updates.push(next) },
      }
      const getSecureStorage = () => storage
      const getServerKey = () => 'server-key'
      const isXaaEnabled = () => xaaEnabled
      const logMCPDebug = () => {}
      const clearServerTokensFromLocalStorage = (...args: any[]) => {
        clears.push(args)
        delete data.mcpOAuth['server-key']
      }
      ${predicate}
      ${cleanup}
      class Harness {
        serverName = 'server'
        serverConfig: any = { type: 'http', url: 'https://mcp.example' }
        ${saveDiscoveryState}
      }
      module.exports = {
        hasMcpDiscoveryButNoToken,
        clearMcpOAuthEntryIfNoTokens,
        Harness,
        clears,
        updates,
        setEntry(value: any) { data = { mcpOAuth: { 'server-key': value } } },
        getEntry() { return data.mcpOAuth['server-key'] },
        setXaa(value: boolean) { xaaEnabled = value },
      }
    `)
    const module = { exports: {} }
    new Function('module', 'exports', javascript)(module, module.exports)
    const runtime = module.exports
    const config = { type: 'http', url: 'https://mcp.example' }

    for (const [entry, expected] of [
      [undefined, false],
      [{}, false],
      [{ discoveryState: { oauthMetadataFound: false } }, false],
      [{ discoveryState: { oauthMetadataFound: true } }, true],
      [
        {
          accessToken: 'access',
          discoveryState: { oauthMetadataFound: true },
        },
        false,
      ],
      [
        {
          refreshToken: 'refresh',
          discoveryState: { oauthMetadataFound: true },
        },
        false,
      ],
    ]) {
      runtime.setEntry(entry)
      assert.equal(
        runtime.hasMcpDiscoveryButNoToken('server', config),
        expected,
      )
    }

    runtime.setEntry({ discoveryState: { oauthMetadataFound: true } })
    runtime.setXaa(true)
    assert.equal(
      runtime.hasMcpDiscoveryButNoToken('server', {
        ...config,
        oauth: { xaa: true },
      }),
      false,
    )
    runtime.setXaa(false)

    runtime.setEntry({ discoveryState: { oauthMetadataFound: true } })
    runtime.clearMcpOAuthEntryIfNoTokens('server', config)
    assert.equal(runtime.getEntry(), undefined)
    assert.equal(runtime.clears.length, 1)
    runtime.setEntry({ accessToken: 'access' })
    runtime.clearMcpOAuthEntryIfNoTokens('server', config)
    assert.equal(runtime.getEntry().accessToken, 'access')
    assert.equal(runtime.clears.length, 1)

    const provider = new runtime.Harness()
    runtime.setEntry({ accessToken: '' })
    await provider.saveDiscoveryState({
      authorizationServerUrl: 'https://auth.example',
      resourceMetadataUrl: 'https://mcp.example/.well-known/oauth',
      authorizationServerMetadata: { issuer: 'https://auth.example' },
    })
    assert.deepEqual(runtime.getEntry().discoveryState, {
      authorizationServerUrl: 'https://auth.example',
      resourceMetadataUrl: 'https://mcp.example/.well-known/oauth',
      oauthMetadataFound: true,
    })
    await provider.saveDiscoveryState({
      authorizationServerUrl: 'https://fallback.example',
    })
    assert.equal(runtime.getEntry().discoveryState.oauthMetadataFound, false)
  },
)
