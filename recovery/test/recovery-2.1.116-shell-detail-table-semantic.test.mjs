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
  index: 16661,
  nodeType: 'FunctionDeclaration',
  start: 10500769,
  end: 10504754,
  sourceHash:
    '7e5bab320509ac3ec497c4415f8f6923c634190bc86fade34b9a8d652fd5ef97',
}
const targetUnit = {
  index: 16811,
  nodeType: 'FunctionDeclaration',
  start: 10559275,
  end: 10563446,
  sourceHash:
    'e1039ebe814dd69c2c77e83c58cae5284801c99b83908ad89b655dbe107ad5bd',
}
const literalPins = [
  { value: 'ratio', start: 10561037, end: 10561042 },
  { value: 'Row', start: 10561290, end: 10561293 },
  { value: 'Row', start: 10562088, end: 10562091 },
  { value: 'Row', start: 10562319, end: 10562322 },
  { value: 'box', start: 10562453, end: 10562456 },
  { value: '"plain"', start: 10562457, end: 10562464 },
  { value: 'forceWidth', start: 10562475, end: 10562485 },
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
    path.join(sourceRoot, 'components/tasks/ShellDetailDialog.tsx'),
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

async function renderShellDetail(shell) {
  const ts = await loadTypeScript()
  const source = ownerSource()
  const sourceFile = ts.createSourceFile(
    'ShellDetailDialog.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'ShellDetailDialog',
  )
  assert.ok(declaration, 'ShellDetailDialog declaration')
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
  const sentinel = Symbol.for('react.memo_cache_sentinel')
  const dependencies = {
    React,
    _c: size => Array(size).fill(sentinel),
    useTerminalSize: () => ({ columns: 100 }),
    useState: initial => [initial, () => {}],
    useDeferredValue: value => value,
    useEffect() {},
    useKeybindings() {},
    truncateToWidth: value => value,
    formatDuration: value => `${value}ms`,
    Box: function Box() {},
    Text: function Text() {},
    Byline: function Byline() {},
    KeyboardShortcutHint: function KeyboardShortcutHint() {},
    Dialog: function Dialog() {},
    Suspense: function Suspense() {},
    ShellOutputContent: function ShellOutputContent() {},
    Table,
  }
  const names = Object.keys(dependencies)
  const factory = new Function(
    ...names,
    `${javascript}\nreturn ShellDetailDialog`,
  )
  const component = factory(...names.map(name => dependencies[name]))
  return {
    node: component({ shell, onDone() {}, onKillShell() {}, onBack() {} }),
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
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object') return ''
  return (node.children ?? []).map(textContent).join('')
}

test('authenticated 114→116 migrates Shell details to the shared Table', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  const baselineRegion = structural.unmatchedBaseline.find(
    candidate => candidate.index === baselineUnit.index,
  )
  assert.ok(baselineRegion, 'target114 ShellDetailDialog unit')
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
    candidate => candidate.target.index === targetUnit.index,
  )
  assert.ok(targetRegion, 'target116 ShellDetailDialog unit')
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
  assert.doesNotMatch(baselineSlice, /forceWidth/)
  assert.doesNotMatch(baselineSlice, /box:"plain"/)
  assert.match(targetSlice, /forceWidth/)
  assert.match(targetSlice, /box:"plain"/)
  for (const pin of literalPins) {
    assert.equal(target.slice(pin.start, pin.end), pin.value)
  }
})

test('the source owner retains the exact target Table geometry', sourceOptions, () => {
  const source = ownerSource()
  assert.match(source, /import \{ Table \} from '\.\.\/design-system\/Table\.js'/)
  assert.match(source, /const t12 = columns - 6/)
  assert.match(source, /width:\s*\{\s*ratio: 1\s*\}/)
  assert.match(
    source,
    /<Table box="plain" columns=\{t11\} forceWidth=\{t12\}>/,
  )
  assert.equal((source.match(/<Table\.Row>/g) ?? []).length, 3)
  assert.doesNotMatch(source, /<Text bold=\{true\}>Status:<\/Text>/)
})

test('actual Shell details render status, runtime, and command as Table rows', sourceOptions, async () => {
  const { node, Table } = await renderShellDetail({
    id: 'shell-1',
    kind: 'shell',
    command: 'echo hello',
    status: 'completed',
    result: { code: 0 },
    startTime: 1_000,
    endTime: 61_000,
  })
  const tables = collect(node, candidate => candidate.type === Table)
  assert.equal(tables.length, 1)
  assert.equal(tables[0].props.box, 'plain')
  assert.deepEqual(tables[0].props.columns, [
    { bold: true },
    { width: { ratio: 1 } },
  ])
  assert.equal(tables[0].props.forceWidth, 94)
  const rows = collect(tables[0], candidate => candidate.type === Table.Row)
  assert.deepEqual(rows.map(textContent), [
    'Status:completed (exit code: 0)',
    'Runtime:60000ms',
    'Command:echo hello',
  ])
})
