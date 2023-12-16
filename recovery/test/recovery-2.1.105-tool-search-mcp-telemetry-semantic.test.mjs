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

const unit = [
  7108,
  'unresolved',
  5103531,
  5106341,
  'VariableDeclaration',
  'd5c6f56a9fec0c1d6474d25d2a37fc151ddf00d7661ccca1bf1b60f6b61bef0b',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function ownerSource() {
  return fs.readFileSync(
    path.join(sourceRoot, 'tools/ToolSearchTool/ToolSearchTool.ts'),
    'utf8',
  )
}

function functionSource(contents, name) {
  const marker = `function ${name}`
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, `${name}: declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`${name}: unterminated declaration`)
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

async function compileTelemetry(contents) {
  const ts = await loadTypeScript()
  const helper = functionSource(contents, 'logSearchOutcome')
  const javascript = ts.transpileModule(
    `
      type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = string
      export function run(appState: any, tools: any[], deferredTools: any[]) {
        const query = 'calendar'
        const max_results = 5
        const getAppState = () => appState
        let result: unknown
        const logEvent = (name: string, metadata: unknown) => {
          result = { name, metadata }
        }
        ${helper}
        logSearchOutcome(['mcp__calendar__list'], 'keyword')
        return result
      }
    `,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports.run
}

test(
  'authenticated target105 pins MCP pool telemetry in ToolSearch',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
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
    const [index, classification, start, end, nodeType, hash] = unit
    const region = structural.regions[index]
    assert.equal(region.classification, classification)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [start, end, nodeType, hash],
    )
    assert.equal(sha256(target.slice(start, end)), hash)
    for (const fragment of [
      'mcpServersConfigured',
      'mcpServersConnected',
      'mcpServersPending',
      'mcpToolsInPool',
    ]) {
      assert.equal(occurrences(baseline, fragment), 0, `${fragment}: baseline`)
      assert.equal(occurrences(target, fragment), 1, `${fragment}: target105`)
      assert.equal(occurrences(latest, fragment), 1, `${fragment}: target116`)
      assert.ok(target.slice(start, end).includes(fragment), `${fragment}: unit`)
    }
  },
)

test(
  'authored ToolSearch owner reports live MCP connection and tool counts',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const source = ownerSource()
    for (const fragment of [
      'const mcp = getAppState().mcp',
      'mcpServersConfigured: mcp.clients.length',
      "client => client.type === 'connected'",
      "client => client.type === 'pending'",
      'mcpToolsInPool: tools.filter(tool => Boolean(tool.mcpInfo)).length',
    ]) {
      assert.ok(source.includes(fragment), fragment)
    }
    const run = await compileTelemetry(source)
    const result = run(
      {
        mcp: {
          clients: [
            { name: 'ready', type: 'connected' },
            { name: 'loading', type: 'pending' },
            { name: 'failed', type: 'failed' },
          ],
        },
      },
      [
        { name: 'Read' },
        { name: 'mcp__calendar__list', mcpInfo: {} },
        { name: 'mcp__calendar__create', mcpInfo: {} },
      ],
      [{ name: 'mcp__calendar__list', mcpInfo: {} }],
    )
    assert.deepEqual(result, {
      name: 'tengu_tool_search_outcome',
      metadata: {
        query: 'calendar',
        queryType: 'keyword',
        matchCount: 1,
        totalDeferredTools: 1,
        maxResults: 5,
        hasMatches: true,
        mcpServersConfigured: 3,
        mcpServersConnected: 1,
        mcpServersPending: 1,
        mcpToolsInPool: 2,
      },
    })
  },
)
