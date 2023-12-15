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
  index: 15817,
  nodeType: 'FunctionDeclaration',
  start: 9982022,
  end: 9995814,
  sourceHash:
    '438ed464e71a053b1bb3113873ec378f981d1b4033e3d663c0123ceadb701f02',
}
const targetUnit = {
  index: 15953,
  nodeType: 'FunctionDeclaration',
  start: 10037155,
  end: 10050883,
  sourceHash:
    'c8ac38c2fbfb1fc4b42ab7a57ba24b0cddc8e79d596553d2b015bf2e4d3389f5',
}
const literalPins = [
  {
    value: '/customize/connectors',
    start: 10039350,
    end: 10039371,
  },
  {
    value: '/customize/connectors',
    start: 10040076,
    end: 10040097,
  },
  { value: 'hideBorder', start: 10047860, end: 10047870 },
  { value: 'box:"plain"', start: 10048352, end: 10048363 },
  { value: '"Status:"', start: 10048475, end: 10048484 },
  { value: '"Auth:"', start: 10049200, end: 10049207 },
  { value: '"URL:"', start: 10049521, end: 10049527 },
  {
    value: '"Config location:"',
    start: 10049672,
    end: 10049690,
  },
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

const sourceTest = selected ? test : test.skip
const bundleTest = selected && baselinePath && targetPath ? test : test.skip

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource() {
  return fs.readFileSync(
    path.join(sourceRoot, 'components/mcp/MCPRemoteServerMenu.tsx'),
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

async function instantiateMenu() {
  const ts = await loadTypeScript()
  const source = ownerSource()
  const sourceFile = ts.createSourceFile(
    'MCPRemoteServerMenu.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'MCPRemoteServerMenu',
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
  function Link() {}
  function Dialog() {}
  function StatusIcon() {}
  function CapabilitiesSection() {}
  function Select() {}
  function Byline() {}
  function KeyboardShortcutHint() {}
  function ConfigurableShortcutHint() {}
  function Spinner() {}
  function TextInput() {}
  function Table() {}
  Table.Row = function Row() {}

  const fragment = Symbol('Fragment')
  const stateHook = initial => [initial, () => {}]
  const React = {
    Fragment: fragment,
    createElement(type, props, ...children) {
      const normalized = children
        .flat(Infinity)
        .filter(child => child !== null && child !== undefined && child !== false)
      if (type === StatusIcon) {
        const icon = props?.status === 'success' ? '✓' : '✗'
        normalized.push(icon, props?.withSpace ? ' ' : '')
      }
      return { type, props: props ?? {}, children: normalized }
    },
    useState: stateHook,
    useCallback: callback => callback,
  }
  const browserUrls = []
  const dependencies = {
    React,
    useState: stateHook,
    useRef: initial => ({ current: initial }),
    useEffect() {},
    useTheme: () => ['theme'],
    useExitOnCtrlCDWithKeybindings: () => ({
      pending: false,
      keyName: 'Ctrl-C',
    }),
    useTerminalSize: () => ({ columns: 120 }),
    useAppState: selector =>
      selector({ mcp: { commands: [], resources: Object.create(null) } }),
    useSetAppState: () => () => {},
    useMcpReconnect: () => async () => ({ client: { type: 'connected' } }),
    useMcpToggleEnabled: () => async () => {},
    useKeybinding() {},
    useInput() {},
    filterMcpPromptsByServer: () => [],
    capitalize: value => value[0].toUpperCase() + value.slice(1),
    getOauthConfig: () => ({ CLAUDE_AI_ORIGIN: 'https://claude.test' }),
    getOauthAccountInfo: () => null,
    openBrowser: async url => {
      browserUrls.push(url)
    },
    logEvent() {},
    color: () => value => value,
    figures: {
      radioOff: '○',
      triangleUpOutline: '△',
    },
    describeMcpConfigFilePath: scope => `${scope} config`,
    Box,
    Text,
    Link,
    Dialog,
    StatusIcon,
    CapabilitiesSection,
    Select,
    Byline,
    KeyboardShortcutHint,
    ConfigurableShortcutHint,
    Spinner,
    TextInput,
    Table,
    clearServerCache: async () => {},
    excludeToolsByServer: value => value,
    excludeCommandsByServer: value => value,
    excludeResourcesByServer: value => value,
    AuthenticationCancelledError: Error,
    performMCPOAuthFlow: async () => {},
    revokeServerTokens: async () => {},
    setClipboard: async () => '',
    errorMessage: error => String(error),
    logMCPDebug() {},
    handleReconnectError: error => String(error),
    handleReconnectResult: () => ({ message: 'connected' }),
  }
  const dependencyNames = Object.keys(dependencies)
  const factory = new Function(
    ...dependencyNames,
    `${javascript}\nreturn MCPRemoteServerMenu`,
  )
  return {
    component: factory(
      ...dependencyNames.map(name => dependencies[name]),
    ),
    browserUrls,
    types: {
      Box,
      Dialog,
      Select,
      StatusIcon,
      Table,
      KeyboardShortcutHint,
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
  'authenticated 114→116 migrates the remote MCP details and connector routes',
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
    assert.equal((baselineSlice.match(/\/settings\/connectors/g) ?? []).length, 2)
    assert.equal(baselineSlice.includes('/customize/connectors'), false)
    assert.equal(baselineSlice.includes('box:"plain"'), false)
    assert.equal((targetSlice.match(/\/customize\/connectors/g) ?? []).length, 2)
    assert.equal(targetSlice.includes('/settings/connectors'), false)
    assert.equal((targetSlice.match(/box:"plain"/g) ?? []).length, 1)
    assert.equal((targetSlice.match(/\.Row/g) ?? []).length, 4)
    assert.equal((targetSlice.match(/withSpace/g) ?? []).length, 4)
    for (const pin of literalPins) {
      assert.equal(target.slice(pin.start, pin.end), pin.value)
    }
  },
)

sourceTest('the remote MCP source owns the exact target table graph', () => {
  const source = ownerSource()
  for (const imported of [
    "import { Dialog } from '../design-system/Dialog.js';",
    "import { StatusIcon } from '../design-system/StatusIcon.js';",
    "import { Table } from '../design-system/Table.js';",
  ]) {
    assert.ok(source.includes(imported), imported)
  }
  assert.equal((source.match(/<Table box="plain"/g) ?? []).length, 1)
  assert.equal((source.match(/<Table\.Row>/g) ?? []).length, 4)
  assert.equal((source.match(/<StatusIcon /g) ?? []).length, 4)
  for (const label of ['Status:', 'Auth:', 'URL:', 'Config location:']) {
    assert.ok(source.includes(`<>${label}</>`), label)
    assert.equal(source.includes(`<Text bold>${label} </Text>`), false)
  }
  assert.match(
    source,
    /<Dialog title=\{`\$\{capitalizedServerName\} MCP Server`\}[^>]*hideBorder=\{borderless\}/,
  )
  assert.ok(
    source.includes(
      `<KeyboardShortcutHint chord={['up', 'down']} format={{ arrowSep: '' }} action="navigate" />`,
    ),
  )
  assert.ok(
    source.includes(
      '<KeyboardShortcutHint chord="enter" action="select" />',
    ),
  )
  assert.equal((source.match(/\/customize\/connectors/g) ?? []).length, 2)
  assert.equal(source.includes('/settings/connectors'), false)

  for (const preserved of [
    'onWaitingForCallback:',
    'unmountedRef.current = true',
    'copyTimeoutRef.current',
    'hasHeadersHelper',
  ]) {
    assert.ok(source.includes(preserved), preserved)
  }
})

sourceTest(
  'actual source renders four Table.Row details and opens the customize fallback',
  async () => {
    const { component, browserUrls, types } = await instantiateMenu()
    const common = {
      name: 'github',
      config: { type: 'http', url: 'https://example.test/mcp' },
      transport: 'http',
      client: { type: 'connected' },
      isAuthenticated: true,
      scope: 'user',
    }
    const node = component({
      server: common,
      serverToolsCount: 2,
      onViewTools() {},
      onCancel() {},
      onComplete() {},
      borderless: false,
    })
    assert.equal(node.type, types.Box)
    assert.equal(node.props.paddingX, 0)
    const dialogs = collect(node, candidate => candidate.type === types.Dialog)
    assert.equal(dialogs.length, 1)
    assert.equal(dialogs[0].props.title, 'Github MCP Server')
    assert.equal(dialogs[0].props.hideBorder, false)

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
      'Auth:✓ authenticated',
      'URL:https://example.test/mcp',
      'Config location:user config',
    ])

    const guide = dialogs[0].props.inputGuide({
      pending: false,
      keyName: 'Ctrl-C',
    })
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
      textContent(
        dialogs[0].props.inputGuide({
          pending: true,
          keyName: 'Ctrl-C',
        }),
      ),
      'Press Ctrl-C again to exit',
    )

    const proxyNode = component({
      server: {
        name: 'slack',
        config: {
          type: 'claudeai-proxy',
          url: 'https://example.test/proxy',
        },
        transport: 'claudeai-proxy',
        client: { type: 'needs-auth' },
        isAuthenticated: false,
        scope: 'user',
      },
      serverToolsCount: 0,
      onViewTools() {},
      onCancel() {},
      onComplete() {},
      borderless: true,
    })
    assert.equal(proxyNode.props.paddingX, 1)
    const select = collect(
      proxyNode,
      candidate => candidate.type === types.Select,
    )[0]
    assert.ok(select)
    await select.props.onChange('claudeai-auth')
    assert.deepEqual(browserUrls, [
      'https://claude.test/customize/connectors',
    ])
  },
)
