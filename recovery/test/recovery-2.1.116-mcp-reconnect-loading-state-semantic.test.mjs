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
const sourceTest = selected ? test : test.skip
const bundleTest = selected && baselinePath && targetPath ? test : test.skip

const baselineUnit = {
  index: 15809,
  nodeType: 'FunctionDeclaration',
  start: 9_978_593,
  end: 9_980_632,
  sourceHash:
    '9b31311333db85170aa5360f360c89c793191145bd7722c5e83851c53ad0e43c',
}
const targetUnit = {
  index: 15945,
  nodeType: 'FunctionDeclaration',
  start: 10_033_788,
  end: 10_035_765,
  sourceHash:
    'ec13179a0ef63e2cf108bc1bfe3a4eeca6a1a0f0d8c6537fbb7621614e68ddb3',
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
    path.join(sourceRoot, 'components/mcp/MCPReconnect.tsx'),
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

async function renderReconnect() {
  const ts = await loadTypeScript()
  const source = ownerSource()
  const sourceFile = ts.createSourceFile(
    'MCPReconnect.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'MCPReconnect',
  )
  assert.ok(declaration, 'MCPReconnect must remain a function declaration')
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
  function LoadingState() {}
  let stateCall = 0
  const dependencies = {
    _c: size => Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
    React: {
      createElement(type, props, ...children) {
        return { type, props: props ?? {}, children: children.flat(Infinity) }
      },
    },
    useTheme: () => ['theme'],
    useAppStateStore: () => ({
      getState: () => ({ mcp: { clients: [{ name: 'demo' }] } }),
    }),
    useMcpReconnect: () => async () => ({ client: { type: 'connected' } }),
    useState: initial => {
      stateCall += 1
      return [stateCall === 1 ? initial : null, () => {}]
    },
    useEffect: () => {},
    color: () => value => value,
    figures: { cross: 'x' },
    Box,
    Text,
    LoadingState,
  }
  const names = Object.keys(dependencies)
  const factory = new Function(
    ...names,
    `${javascript}\nreturn MCPReconnect`,
  )
  return {
    node: factory(...names.map(name => dependencies[name]))({
      serverName: 'demo',
      onComplete() {},
    }),
    types: { Box, LoadingState, Text },
  }
}

bundleTest('authenticated 114→116 migrates MCP reconnect loading UI', () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(baseline.length, 12_986_755)
  assert.equal(target.length, 13_102_272)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  const baselineRegion = structural.unmatchedBaseline.find(
    candidate => candidate.index === baselineUnit.index,
  )
  const targetRegion = structural.regions.find(
    candidate => candidate.target?.index === targetUnit.index,
  )
  assert.ok(baselineRegion)
  assert.ok(targetRegion)
  assert.equal(targetRegion.classification, 'unresolved')
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

  const oldOwner = baseline.subarray(baselineUnit.start, baselineUnit.end)
  const nextOwner = target.subarray(targetUnit.start, targetUnit.end)
  assert.equal(sha256(oldOwner), baselineUnit.sourceHash)
  assert.equal(sha256(nextOwner), targetUnit.sourceHash)
  assert.match(
    oldOwner.toString('utf8'),
    /createElement\([^,]+,null,[\s\S]*Establishing connection to MCP server/,
  )
  assert.match(
    nextOwner.toString('utf8'),
    /createElement\([^,]+,\{message:"Establishing connection to MCP server"\}\)/,
  )
  assert.equal(
    target.toString('utf8').slice(10_034_911, 10_034_948),
    'Establishing connection to MCP server',
  )
})

sourceTest('source delegates reconnect loading presentation to LoadingState', () => {
  const source = ownerSource()
  assert.match(
    source,
    /import \{ LoadingState \} from '\.\.\/design-system\/LoadingState\.js'/,
  )
  assert.match(
    source,
    /<LoadingState message="Establishing connection to MCP server" \/>/,
  )
  assert.doesNotMatch(source, /import \{ Spinner \} from '\.\.\/Spinner\.js'/)
  assert.doesNotMatch(source, /<Spinner \/><Text> Establishing connection/)
  for (const fragment of [
    'Successfully reconnected to',
    'requires authentication. Use /mcp to authenticate.',
    'Failed to reconnect to',
    'Error: {error}',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})

sourceTest('actual reconnect component renders the shared loading primitive', async () => {
  const { node, types } = await renderReconnect()
  assert.equal(node.type, types.Box)
  assert.equal(node.props.flexDirection, 'column')
  assert.equal(node.props.gap, 1)
  assert.equal(node.props.padding, 1)
  assert.equal(node.children[0].type, types.Text)
  assert.equal(node.children[1].type, types.LoadingState)
  assert.equal(
    node.children[1].props.message,
    'Establishing connection to MCP server',
  )
})
