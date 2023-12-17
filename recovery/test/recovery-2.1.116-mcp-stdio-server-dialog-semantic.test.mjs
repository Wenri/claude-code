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
  index: 15820,
  nodeType: 'FunctionDeclaration',
  start: 9_995_973,
  end: 9_999_678,
  sourceHash:
    'ae469ec402440f29b73b7980ea7d18f7fe9ae8d6c57255d7765f1ad280e54916',
}
const targetUnit = {
  index: 15956,
  nodeType: 'FunctionDeclaration',
  start: 10_051_059,
  end: 10_054_586,
  sourceHash:
    '49f42c6d3adada65528a49f565e6422c38ae11490e5989fe995c24ddba0519da',
}
const literalPins = [
  { value: 'hideBorder', start: 10_051_860, end: 10_051_870 },
  { value: 'hideInputGuide', start: 10_051_873, end: 10_051_887 },
  { value: 'hideBorder', start: 10_052_277, end: 10_052_287 },
  {
    value: 'chord:["up","down"]',
    start: 10_052_447,
    end: 10_052_466,
  },
  { value: 'chord:"enter"', start: 10_052_537, end: 10_052_550 },
  { value: 'box:"plain"', start: 10_052_766, end: 10_052_777 },
  { value: '"Status:"', start: 10_052_889, end: 10_052_898 },
  { value: 'withSpace', start: 10_053_108, end: 10_053_117 },
  { value: 'withSpace', start: 10_053_240, end: 10_053_249 },
  { value: 'withSpace', start: 10_053_351, end: 10_053_360 },
  { value: '"Command:"', start: 10_053_464, end: 10_053_474 },
  { value: '"Args:"', start: 10_053_662, end: 10_053_669 },
  {
    value: '"Config location:"',
    start: 10_053_825,
    end: 10_053_843,
  },
]

const sourceTest = selected ? test : test.skip
const bundleTest = selected && baselinePath && targetPath ? test : test.skip
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
    path.join(sourceRoot, 'components/mcp/MCPStdioServerMenu.tsx'),
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

async function instantiateMenu(reconnecting = false) {
  const ts = await loadTypeScript()
  const source = ownerSource()
  const sourceFile = ts.createSourceFile(
    'MCPStdioServerMenu.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'MCPStdioServerMenu',
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

  function Box() {}
  function Text() {}
  function Dialog() {}
  function StatusIcon() {}
  function Table() {}
  Table.Row = function Row() {}
  function CapabilitiesSection() {}
  function Select() {}
  function Byline() {}
  function KeyboardShortcutHint() {}
  function ConfigurableShortcutHint() {}
  function Spinner() {}
  const stateHook = initial => [reconnecting ? true : initial, () => {}]
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const normalized = children
        .flat(Infinity)
        .filter(child => child !== null && child !== undefined && child !== false)
      if (type === StatusIcon) {
        normalized.push(
          props?.status === 'success'
            ? '✓'
            : props?.status === 'pending'
              ? '○'
              : '✗',
          props?.withSpace ? ' ' : '',
        )
      }
      return { type, props: props ?? {}, children: normalized }
    },
    useCallback: callback => callback,
  }
  const dependencies = {
    React,
    useState: stateHook,
    useTheme: () => ['theme'],
    useAppState: selector =>
      selector({ mcp: { commands: [], resources: { demo: [] } } }),
    useMcpReconnect: () => async () => ({ client: { type: 'connected' } }),
    useMcpToggleEnabled: () => async () => {},
    errorMessage: error => String(error),
    capitalize: value => value[0].toUpperCase() + value.slice(1),
    filterMcpPromptsByServer: () => [],
    getMcpConfigByName: () => ({ scope: 'project' }),
    describeMcpConfigFilePath: scope => `${scope} config`,
    color: () => value => value,
    figures: { radioOff: '○' },
    Box,
    Text,
    Dialog,
    StatusIcon,
    Table,
    CapabilitiesSection,
    Select,
    Byline,
    KeyboardShortcutHint,
    ConfigurableShortcutHint,
    Spinner,
    handleReconnectError: error => String(error),
    handleReconnectResult: () => ({ message: 'connected' }),
  }
  const names = Object.keys(dependencies)
  const factory = new Function(
    ...names,
    `${javascript}\nreturn MCPStdioServerMenu`,
  )
  return {
    component: factory(...names.map(name => dependencies[name])),
    types: {
      Box,
      Dialog,
      KeyboardShortcutHint,
      StatusIcon,
      Table,
    },
  }
}

function collect(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result
  if (predicate(node)) result.push(node)
  for (const child of node.children ?? []) collect(child, predicate, result)
  return result
}

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object') return ''
  return (node.children ?? []).map(textContent).join('')
}

bundleTest(
  'authenticated 114→116 migrates the stdio MCP menu to Dialog and StatusIcon',
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(baselineBytes.length, 12_986_755)
    assert.equal(targetBytes.length, 13_102_272)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    const baselineRegion = structural.unmatchedBaseline.find(
      candidate => candidate.index === baselineUnit.index,
    )
    assert.ok(baselineRegion)
    assert.deepEqual(
      [
        baselineRegion.nodeType,
        baselineRegion.start,
        baselineRegion.end,
        baselineRegion.sourceHash,
      ],
      [
        baselineUnit.nodeType,
        baselineUnit.start,
        baselineUnit.end,
        baselineUnit.sourceHash,
      ],
    )
    const targetRegion = structural.regions.find(
      candidate => candidate.target?.index === targetUnit.index,
    )
    assert.ok(targetRegion)
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.nodeType,
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.sourceHash,
      ],
      [
        targetUnit.nodeType,
        targetUnit.start,
        targetUnit.end,
        targetUnit.sourceHash,
      ],
    )

    const baselineSlice = baseline.slice(baselineUnit.start, baselineUnit.end)
    const targetSlice = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(baselineSlice), baselineUnit.sourceHash)
    assert.equal(sha256(targetSlice), targetUnit.sourceHash)
    assert.equal((baselineSlice.match(/hideBorder/g) ?? []).length, 0)
    assert.equal((baselineSlice.match(/withSpace/g) ?? []).length, 0)
    assert.equal((targetSlice.match(/hideBorder/g) ?? []).length, 2)
    assert.equal((targetSlice.match(/withSpace/g) ?? []).length, 3)
    assert.equal((targetSlice.match(/box:"plain"/g) ?? []).length, 1)
    for (const pin of literalPins) {
      assert.equal(target.slice(pin.start, pin.end), pin.value)
    }
  },
)

sourceTest('the source owns the exact stdio Dialog/Table graph', () => {
  const source = ownerSource()
  for (const imported of [
    "import { Dialog } from '../design-system/Dialog.js';",
    "import { StatusIcon } from '../design-system/StatusIcon.js';",
    "import { Table } from '../design-system/Table.js';",
  ]) {
    assert.ok(source.includes(imported), imported)
  }
  assert.equal(source.includes('useExitOnCtrlCDWithKeybindings'), false)
  assert.equal((source.match(/<Dialog /g) ?? []).length, 2)
  assert.equal((source.match(/hideBorder=\{borderless\}/g) ?? []).length, 2)
  assert.equal((source.match(/<Table\.Row>/g) ?? []).length, 4)
  assert.equal((source.match(/<StatusIcon /g) ?? []).length, 3)
  assert.ok(source.includes('<Table box="plain" columns={[{ bold: true }, {}]}>'))
  assert.ok(source.includes("chord={['up', 'down']}"))
  assert.ok(source.includes('chord="enter"'))
  assert.equal(source.includes('borderStyle={borderless'), false)
})

sourceTest(
  'actual source renders details and reconnect state through Dialog',
  async () => {
    const commonProps = {
      server: {
        name: 'demo',
        client: { type: 'connected' },
        config: { command: 'bun', args: ['run', 'server.ts'] },
      },
      serverToolsCount: 2,
      onViewTools() {},
      onCancel() {},
      onComplete() {},
      borderless: true,
    }
    const { component, types } = await instantiateMenu(false)
    const node = component(commonProps)
    assert.equal(node.type, types.Dialog)
    assert.equal(node.props.title, 'Demo MCP Server')
    assert.equal(node.props.hideBorder, true)
    const tables = collect(node, candidate => candidate.type === types.Table)
    assert.equal(tables.length, 1)
    assert.equal(tables[0].props.box, 'plain')
    assert.deepEqual(tables[0].props.columns, [{ bold: true }, {}])
    const rows = collect(
      tables[0],
      candidate => candidate.type === types.Table.Row,
    )
    assert.deepEqual(rows.map(textContent), [
      'Status:✓ connected',
      'Command:bun',
      'Args:run server.ts',
      'Config location:project config',
    ])
    const icons = collect(node, candidate => candidate.type === types.StatusIcon)
    assert.deepEqual(icons.map(icon => icon.props), [
      { status: 'success', withSpace: true },
    ])
    const guide = node.props.inputGuide({ pending: false, keyName: 'Ctrl-C' })
    const shortcuts = collect(
      guide,
      candidate => candidate.type === types.KeyboardShortcutHint,
    )
    assert.deepEqual(
      shortcuts.map(shortcut => [
        shortcut.props.chord,
        shortcut.props.format,
        shortcut.props.action,
      ]),
      [
        [['up', 'down'], { arrowSep: '' }, 'navigate'],
        ['enter', undefined, 'select'],
      ],
    )
    assert.equal(
      textContent(node.props.inputGuide({ pending: true, keyName: 'Ctrl-C' })),
      'Press Ctrl-C again to exit',
    )

    const reconnecting = await instantiateMenu(true)
    const reconnectNode = reconnecting.component(commonProps)
    assert.equal(reconnectNode.type, reconnecting.types.Dialog)
    assert.equal(reconnectNode.props.title, 'Demo MCP Server')
    assert.equal(reconnectNode.props.hideBorder, true)
    assert.equal(reconnectNode.props.hideInputGuide, true)
    assert.match(textContent(reconnectNode), /Reconnecting to demo/)
    assert.equal(
      collect(reconnectNode, candidate => candidate.type === reconnecting.types.Box)
        .length,
      1,
    )
  },
)
