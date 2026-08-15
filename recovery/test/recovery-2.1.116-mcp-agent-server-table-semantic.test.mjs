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

const baselineUnit = {
  index: 15762,
  start: 9951367,
  end: 9954977,
  sourceHash:
    'd8259199150c82688cad351c1ffedbcff658b6ebf1cdb0970f1e5946a357ae69',
}
const targetUnit = {
  index: 15896,
  start: 10004958,
  end: 10008783,
  sourceHash:
    '67e0b295fc780d2bcfbda182f3d1091fc8f1826110f68fb58640201fb5cb0bc8',
}
const literalPins = [
  { historicalRow: 448, currentRow: 410, value: '"Type:"', start: 10007251, end: 10007258 },
  { historicalRow: 449, currentRow: 411, value: '"Used by:"', start: 10007716, end: 10007726 },
  { historicalRow: 450, currentRow: 412, value: 'box', start: 10007859, end: 10007862 },
  { historicalRow: 451, currentRow: 413, value: '"plain"', start: 10007863, end: 10007870 },
  { historicalRow: 452, currentRow: 414, value: 'Row', start: 10007931, end: 10007934 },
  { historicalRow: 453, currentRow: 415, value: 'Row', start: 10008136, end: 10008139 },
  { historicalRow: 454, currentRow: 416, value: '"Auth:"', start: 10008195, end: 10008202 },
]

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

function ownerSource() {
  return fs.readFileSync(
    path.join(sourceRoot, 'components/mcp/MCPAgentServerMenu.tsx'),
    'utf8',
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

async function renderMenu(agentServer) {
  const ts = await loadTypeScript()
  const source = ownerSource()
  const sourceFile = ts.createSourceFile(
    'MCPAgentServerMenu.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'MCPAgentServerMenu',
  )
  assert.ok(declaration)
  const isolated = source
    .slice(declaration.getStart(sourceFile), declaration.end)
    .replace(/^export /, '')
  const javascript = ts.transpileModule(isolated, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat() }
    },
  }
  function Table() {}
  Table.Row = function Row() {}
  const dependencies = {
    React,
    useTheme: () => ['theme'],
    useState: initial => [initial, () => {}],
    useRef: initial => ({ current: initial }),
    useEffect() {},
    useCallback: callback => callback,
    useKeybinding() {},
    AbortController,
    performMCPOAuthFlow: async () => {},
    AuthenticationCancelledError: Error,
    capitalize: value => value[0].toUpperCase() + value.slice(1),
    Box: function Box() {},
    Text: function Text() {},
    Link: function Link() {},
    Spinner: function Spinner() {},
    ConfigurableShortcutHint: function ConfigurableShortcutHint() {},
    Select: function Select() {},
    Byline: function Byline() {},
    Dialog: function Dialog() {},
    KeyboardShortcutHint: function KeyboardShortcutHint() {},
    Table,
    color: () => value => value,
    figures: { radioOff: '○', tick: '✓', triangleUpOutline: '△' },
  }
  const dependencyNames = Object.keys(dependencies)
  const factory = new Function(
    ...dependencyNames,
    `${javascript}\nreturn MCPAgentServerMenu`,
  )
  const component = factory(...dependencyNames.map(name => dependencies[name]))
  return {
    node: component({ agentServer, onCancel() {}, onComplete() {} }),
    Table,
  }
}

function collect(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result
  if (predicate(node)) result.push(node)
  for (const child of node.children ?? []) collect(child, predicate, result)
  return result
}

function textContent(node) {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  return (node.children ?? []).map(textContent).join('')
}

test('authenticated 114→116 migrates the agent MCP details to design-system tables', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  const baselineRegion = structural.unmatchedBaseline.find(
    candidate => candidate.index === baselineUnit.index,
  )
  assert.ok(baselineRegion)
  assert.deepEqual(
    [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
    [baselineUnit.start, baselineUnit.end, baselineUnit.sourceHash],
  )
  const targetRegion = structural.regions.find(
    candidate => candidate.target.index === targetUnit.index,
  )
  assert.ok(targetRegion)
  assert.deepEqual(
    [targetRegion.target.start, targetRegion.target.end, targetRegion.target.sourceHash],
    [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
  )
  const baselineSlice = baseline.slice(baselineUnit.start, baselineUnit.end)
  const targetSlice = target.slice(targetUnit.start, targetUnit.end)
  assert.equal(sha256(baselineSlice), baselineUnit.sourceHash)
  assert.equal(sha256(targetSlice), targetUnit.sourceHash)
  assert.doesNotMatch(baselineSlice, /box:"plain"/)
  assert.match(targetSlice, /box:"plain"/)
  assert.match(targetSlice, /\.Row/)
  for (const pin of literalPins) {
    assert.equal(target.slice(pin.start, pin.end), pin.value)
  }
})

test('the source owner uses the target two-table layout', sourceOptions, () => {
  const source = ownerSource()
  assert.match(source, /import \{ Table \} from '\.\.\/design-system\/Table\.js'/)
  assert.equal((source.match(/<Table box="plain"/g) ?? []).length, 2)
  assert.match(source, /<>Type:<\/>/)
  assert.match(source, /<>Used by:<\/>/)
  assert.match(source, /<>Status:<\/>/)
  assert.match(source, /<>Auth:<\/>/)
  assert.doesNotMatch(source, /<Text bold>Type: <\/Text>/)
})

test('actual source renders identity and status rows through Table.Row', sourceOptions, async () => {
  const { node, Table } = await renderMenu({
    name: 'github',
    transport: 'http',
    url: 'https://example.test/mcp',
    command: 'serve',
    sourceAgents: ['reviewer', 'tester'],
    needsAuth: true,
    isAuthenticated: false,
  })
  const tables = collect(node, candidate => candidate.type === Table)
  assert.equal(tables.length, 2)
  for (const table of tables) {
    assert.equal(table.props.box, 'plain')
    assert.deepEqual(table.props.columns, [{ bold: true, width: 8 }, {}])
  }
  const firstRows = collect(tables[0], candidate => candidate.type === Table.Row)
  const secondRows = collect(tables[1], candidate => candidate.type === Table.Row)
  assert.deepEqual(firstRows.map(textContent), [
    'Type:http',
    'URL:https://example.test/mcp',
    'Command:serve',
    'Used by:reviewer, tester',
  ])
  assert.deepEqual(secondRows.map(textContent), [
    'Status:○ not connected (agent-only)',
    'Auth:△ may need authentication',
  ])
})
