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
const historical = sourceRoot !== path.join(repositoryRoot, 'src')
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
  [18956, [13431810, 13432157, '19810bde7f941fc4d516003d2d5e8e7e726265affa47e8c7986c849fb5ab11c1']],
  [18967, [13439202, 13472373, 'dff9e4822e9aeb3d9473b61353ca117788616672af04a6c2c19428c0c2d67be1']],
  [18968, [13472373, 13472841, '0ca25080ee32aa6e54f661ad6850fee47419471e95ca0247c29603a71269b4c9']],
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
  'target105 pins the first-command MCP prewait export, call, and helper',
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
    assert.equal(baseline.includes('waitForPendingMcpBeforeFirstCommand'), false)
    assert.equal(target.includes('waitForPendingMcpBeforeFirstCommand'), true)

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

    assert.match(target.slice(13439202, 13472373), /await [\w$]+\([\w$]+\)/)
    assert.match(target.slice(13472373, 13472841), /===0\|\|.+>0\)return/)
    assert.ok(target.slice(13472373, 13472841).includes('tengu_headless_mcp_prewait'))
  },
)

test(
  'source waits once and preserves the 105-to-116 tools-present evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const print = source('cli/print.ts')
    const helper = functionSource(
      print,
      'waitForPendingMcpBeforeFirstCommand',
      'export async function',
    )
    for (const fragment of [
      'const pendingBefore = initialMcp.clients.filter(',
      "client => client.type === 'pending'",
      'const toolsBefore = initialMcp.tools.length',
      "logEvent('tengu_headless_mcp_prewait'",
      'pendingAfter: mcp.clients.filter',
      'mcpNonBlocking: isEnvTruthy(process.env.MCP_CONNECTION_NONBLOCKING)',
      'if (shouldWaitForHeadlessMcp)',
      'shouldWaitForHeadlessMcp = false',
      'await waitForPendingMcpBeforeFirstCommand(getAppState)',
    ]) {
      assert.ok(print.includes(fragment), fragment)
    }
    if (historical) {
      assert.ok(helper.includes('pendingBefore === 0 || toolsBefore > 0'))
    } else {
      assert.ok(helper.includes('if (pendingBefore === 0) return'))
      assert.equal(helper.includes('toolsBefore > 0'), false)
    }

    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `type AppState = any; const events: any[] = [];\n` +
        `const sleep = async () => {}; const isEnvTruthy = () => false;\n` +
        `const logEvent = (name: string, fields: any) => events.push({ name, fields });\n` +
        `${helper}\nexport { waitForPendingMcpBeforeFirstCommand, events };`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    const getState = () => ({
      mcp: {
        clients: [{ type: 'pending' }],
        tools: [{}],
      },
    })
    await module.exports.waitForPendingMcpBeforeFirstCommand(getState, 0)
    assert.equal(module.exports.events.length, historical ? 0 : 1)
  },
)

test(
  'target116 keeps the export but waits even after another tool connects',
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
    const exportMatch = latest.match(
      /waitForPendingMcpBeforeFirstCommand:\(\)=>[\w$]+/,
    )
    assert.ok(exportMatch)
    const minifiedName = exportMatch[0].split('=>')[1]
    const helper = functionSource(latest, minifiedName, 'async function')
    assert.match(helper, /===0\)return/)
    assert.doesNotMatch(helper, /===0\|\|.+>0\)return/)
    assert.ok(helper.includes('tengu_headless_mcp_prewait'))
  },
)
