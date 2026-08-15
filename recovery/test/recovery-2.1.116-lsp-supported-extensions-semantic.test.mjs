import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import nodePath from 'node:path'
import test from 'node:test'
import * as nodeUrl from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = nodeUrl.fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? nodePath.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : nodePath.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const baselineUnit = {
  start: 7915997,
  end: 7919766,
  sourceHash:
    '57c2238c8963776f2cd2b1861886a09bb21313f4065652c85c20537c565ab5a6',
}
const targetUnit = {
  index: 12644,
  start: 7962139,
  end: 7965981,
  sourceHash:
    '356bff332ef39d65118207a86c67ff73fbfb3ce1247aa19ed51f28e74eba7075',
}
const supportedExtensionsProperty = {
  typedAuditRow: 588,
  start: 7965874,
  end: 7965896,
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      nodePath.join(
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
  return fs.readFileSync(
    nodePath.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

async function loadTypeScript() {
  const candidates = [
    nodePath.resolve(
      nodePath.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    nodePath.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(nodeUrl.pathToFileURL(candidate).href)
  return module.default ?? module
}

async function instantiateManager(serverConfigs) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    source('src/services/lsp/LSPServerManager.ts'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'path') return nodePath
    if (specifier === 'url') return nodeUrl
    if (specifier.endsWith('/debug.js')) return { logForDebugging() {} }
    if (specifier.endsWith('/errors.js')) {
      return { errorMessage: error => String(error?.message ?? error) }
    }
    if (specifier.endsWith('/log.js')) return { logError() {} }
    if (specifier.endsWith('/config.js')) {
      return { getAllLspServers: async () => ({ servers: serverConfigs }) }
    }
    if (specifier.endsWith('/LSPServerInstance.js')) {
      return {
        createLSPServerInstance(name, config) {
          const instance = {
            name,
            config,
            state: 'stopped',
            onRequest() {},
            async start() {
              instance.state = 'running'
            },
            async stop() {
              instance.state = 'stopped'
            },
            async sendRequest() {},
            async sendNotification() {},
          }
          return instance
        },
      }
    }
    throw new Error(`unexpected import: ${specifier}`)
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return module.exports.createLSPServerManager()
}

test(
  'target116 authenticates the added getSupportedExtensions manager API',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const baselineOwner = baseline.slice(baselineUnit.start, baselineUnit.end)
    const targetOwner = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)
    assert.equal(sha256(targetOwner), targetUnit.sourceHash)

    const region = structural.regions[targetUnit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
    )
    assert.equal(
      target.slice(
        supportedExtensionsProperty.start,
        supportedExtensionsProperty.end,
      ),
      'getSupportedExtensions',
      `typed-audit row ${supportedExtensionsProperty.typedAuditRow}`,
    )

    assert.doesNotMatch(baselineOwner, /getSupportedExtensions/)
    const implementation = targetOwner.match(
      /function ([A-Za-z_$][\w$]*)\(\)\{return Array\.from\(([A-Za-z_$][\w$]*)\.keys\(\)\)\.sort\(\)\}/,
    )
    assert.ok(implementation, 'sorted extension-map key accessor')
    assert.match(
      targetOwner,
      new RegExp(`getSupportedExtensions:${implementation[1]}(?:[,}])`),
    )
  },
)

test(
  'source exposes sorted normalized LSP extensions and clears them on shutdown',
  sourceOptions,
  async () => {
    const manager = await instantiateManager({
      typescript: {
        command: 'typescript-language-server',
        extensionToLanguage: { '.TS': 'typescript', '.js': 'javascript' },
      },
      python: {
        command: 'pyright-langserver',
        extensionToLanguage: { '.Py': 'python', '.JS': 'javascript' },
      },
    })

    await manager.initialize()
    assert.deepEqual(manager.getSupportedExtensions(), ['.js', '.py', '.ts'])
    await manager.shutdown()
    assert.deepEqual(manager.getSupportedExtensions(), [])
  },
)
