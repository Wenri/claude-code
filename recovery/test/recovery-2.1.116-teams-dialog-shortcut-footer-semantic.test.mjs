import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
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
const baselineUnit = {
  index: 18912,
  start: 11_652_519,
  end: 11_653_622,
  sourceHash:
    '2285eb3d19e16b68150966213dbe38f255a2ee6b2c74ebd7aeea166aa2987608',
}
const targetUnit = {
  index: 19156,
  start: 11_740_663,
  end: 11_742_464,
  sourceHash:
    '3f546c9f05811dad15476ed902a0b4b0fe99aa726d93592f7517a03b4ba8063e',
}
const baselineTeammateUnit = {
  index: 18914,
  start: 11_654_583,
  end: 11_657_119,
  sourceHash:
    '72d595930c646c8590ca387453aa9fb28d5eebe17364e67636a4052e097ef766',
}
const targetTeammateUnit = {
  index: 19158,
  start: 11_743_425,
  end: 11_746_358,
  sourceHash:
    'b8516becd44b790ac17a01007770a06ed3a24db3d29c899c38762c446d9d9534',
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource() {
  return fs.readFileSync(
    path.join(sourceRoot, 'components/teams/TeamsDialog.tsx'),
    'utf8',
  )
}

function loadTypeScript() {
  const require = createRequire(import.meta.url)
  for (const candidate of [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]) {
    if (fs.existsSync(candidate)) return require(candidate)
  }
  throw new Error('TypeScript compiler not found')
}

function renderTeamDetailView(supportsHideShow) {
  const owner = ownerSource()
  const start = owner.indexOf('function TeamDetailView(')
  const end = owner.indexOf('type TeammateListItemProps', start)
  assert.ok(start >= 0 && end > start)
  const ts = loadTypeScript()
  const javascript = ts.transpileModule(
    `${owner.slice(start, end)}\nexports.TeamDetailView = TeamDetailView`,
    {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText

  function element(type, props, ...children) {
    return {
      type,
      props: {
        ...(props ?? {}),
        ...(children.length > 0 && {
          children: children.length === 1 ? children[0] : children,
        }),
      },
    }
  }
  const React = { createElement: element, Fragment: Symbol('Fragment') }
  const module = { exports: {} }
  const names = [
    'React',
    '_c',
    'getCachedBackend',
    'useShortcutDisplay',
    'Text',
    'Box',
    'TeammateListItem',
    'Dialog',
    'KeyboardShortcutHint',
    'Byline',
    'exports',
  ]
  const values = [
    React,
    size => Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
    () => ({ supportsHideShow }),
    () => 'Shift+Tab',
    function Text() {},
    function Box() {},
    function TeammateListItem() {},
    function Dialog() {},
    function KeyboardShortcutHint() {},
    function Byline() {},
    module.exports,
  ]
  Function(...names, javascript)(...values)
  return {
    tree: module.exports.TeamDetailView({
      teamName: 'alpha',
      teammates: [],
      selectedIndex: 0,
      onCancel() {},
    }),
    types: Object.fromEntries(names.slice(4, 10).map((name, index) => [name, values[index + 4]])),
  }
}

function renderTeammateDetailView(supportsHideShow) {
  const owner = ownerSource()
  const start = owner.indexOf('function TeammateDetailView(')
  const end = owner.indexOf('async function killTeammate(', start)
  assert.ok(start >= 0 && end > start)
  const ts = loadTypeScript()
  const javascript = ts.transpileModule(
    `${owner.slice(start, end)}\nexports.TeammateDetailView = TeammateDetailView`,
    {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText

  function element(type, props, ...children) {
    return {
      type,
      props: {
        ...(props ?? {}),
        ...(children.length > 0 && {
          children: children.length === 1 ? children[0] : children,
        }),
      },
    }
  }
  const React = { createElement: element, Fragment: Symbol('Fragment') }
  const module = { exports: {} }
  const names = [
    'React',
    '_c',
    'useState',
    'useShortcutDisplay',
    'AGENT_COLOR_TO_THEME_COLOR',
    'useEffect',
    'listTasks',
    'permissionModeFromString',
    'permissionModeSymbol',
    'getModeColor',
    'Text',
    'ThemedText',
    'Box',
    'truncateToWidth',
    'stringWidth',
    'Dialog',
    'getCachedBackend',
    'KeyboardShortcutHint',
    'Byline',
    'figures',
    'exports',
  ]
  const types = {
    Text: function Text() {},
    ThemedText: function ThemedText() {},
    Box: function Box() {},
    Dialog: function Dialog() {},
    KeyboardShortcutHint: function KeyboardShortcutHint() {},
    Byline: function Byline() {},
  }
  const values = [
    React,
    size => Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
    initial => [initial, () => {}],
    () => 'Shift+Tab',
    {},
    () => {},
    async () => [],
    value => value,
    () => undefined,
    () => undefined,
    types.Text,
    types.ThemedText,
    types.Box,
    value => value,
    value => value.length,
    types.Dialog,
    () => ({ supportsHideShow }),
    types.KeyboardShortcutHint,
    types.Byline,
    { tick: 'tick' },
    module.exports,
  ]
  Function(...names, javascript)(...values)
  return {
    tree: module.exports.TeammateDetailView({
      teammate: {
        agentId: 'agent-1',
        name: 'worker',
        status: 'working',
      },
      teamName: 'alpha',
      onCancel() {},
    }),
    types,
  }
}

function nodesOfType(node, type, found = []) {
  if (node === null || node === undefined || node === false) return found
  if (Array.isArray(node)) {
    for (const child of node) nodesOfType(child, type, found)
    return found
  }
  if (typeof node !== 'object') return found
  if (node.type === type) found.push(node)
  nodesOfType(node.props?.children, type, found)
  return found
}

test('target116 authenticates the Teams footer shortcut-component migration', bundleOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baseline),
    'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
  )
  assert.equal(
    sha256(target),
    'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
  )

  const baselineRegion = structural.unmatchedBaseline.find(
    region => region.index === baselineUnit.index,
  )
  assert.deepEqual(
    [
      baselineRegion?.start,
      baselineRegion?.end,
      baselineRegion?.nodeType,
      baselineRegion?.sourceHash,
    ],
    [
      baselineUnit.start,
      baselineUnit.end,
      'FunctionDeclaration',
      baselineUnit.sourceHash,
    ],
  )
  assert.equal(
    sha256(baseline.subarray(baselineUnit.start, baselineUnit.end)),
    baselineUnit.sourceHash,
  )
  const targetRegion = structural.regions[targetUnit.index]
  assert.equal(targetRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      targetRegion.target.start,
      targetRegion.target.end,
      targetRegion.target.nodeType,
      targetRegion.target.sourceHash,
    ],
    [
      targetUnit.start,
      targetUnit.end,
      'FunctionDeclaration',
      targetUnit.sourceHash,
    ],
  )
  assert.equal(
    sha256(target.subarray(targetUnit.start, targetUnit.end)),
    targetUnit.sourceHash,
  )

  const baselineOwner = baseline
    .subarray(baselineUnit.start, baselineUnit.end)
    .toString('utf8')
  const targetOwner = target
    .subarray(targetUnit.start, targetUnit.end)
    .toString('utf8')
  assert.match(baselineOwner, /" select \\xB7 Enter view \\xB7 k kill/)
  assert.doesNotMatch(baselineOwner, /shiftAsCase/)
  for (const fragment of [
    'chord:["up","down"],action:"select"',
    'chord:"p",action:"prune idle"',
    'chord:"shift+h",action:"hide/show all",format:{shiftAsCase:!0}',
    '" sync cycle modes for all"',
    'chord:"escape",action:"close"',
  ]) {
    assert.ok(targetOwner.includes(fragment), fragment)
  }

  const baselineTeammateRegion = structural.unmatchedBaseline.find(
    region => region.index === baselineTeammateUnit.index,
  )
  assert.deepEqual(
    [
      baselineTeammateRegion?.start,
      baselineTeammateRegion?.end,
      baselineTeammateRegion?.nodeType,
      baselineTeammateRegion?.sourceHash,
    ],
    [
      baselineTeammateUnit.start,
      baselineTeammateUnit.end,
      'FunctionDeclaration',
      baselineTeammateUnit.sourceHash,
    ],
  )
  assert.equal(
    sha256(
      baseline.subarray(
        baselineTeammateUnit.start,
        baselineTeammateUnit.end,
      ),
    ),
    baselineTeammateUnit.sourceHash,
  )
  const targetTeammateRegion = structural.regions[targetTeammateUnit.index]
  assert.equal(targetTeammateRegion.classification, 'unresolved')
  assert.deepEqual(
    [
      targetTeammateRegion.target.start,
      targetTeammateRegion.target.end,
      targetTeammateRegion.target.nodeType,
      targetTeammateRegion.target.sourceHash,
    ],
    [
      targetTeammateUnit.start,
      targetTeammateUnit.end,
      'FunctionDeclaration',
      targetTeammateUnit.sourceHash,
    ],
  )
  assert.equal(
    sha256(
      target.subarray(targetTeammateUnit.start, targetTeammateUnit.end),
    ),
    targetTeammateUnit.sourceHash,
  )

  const baselineTeammate = baseline
    .subarray(baselineTeammateUnit.start, baselineTeammateUnit.end)
    .toString('utf8')
  const targetTeammate = target
    .subarray(targetTeammateUnit.start, targetTeammateUnit.end)
    .toString('utf8')
  assert.match(
    baselineTeammate,
    /" back \\xB7 Esc close \\xB7 k kill \\xB7 s shutdown"/,
  )
  assert.match(targetTeammate, /\.c\(44\)/)
  for (const fragment of [
    'chord:"left",action:"back"',
    'chord:"escape",action:"close"',
    'chord:"k",action:"kill"',
    'chord:"s",action:"shutdown"',
    'chord:"h",action:"hide/show"',
  ]) {
    assert.ok(targetTeammate.includes(fragment), fragment)
  }
})

test('source renders the exact conditional shortcut graph through Byline', sourceOptions, () => {
  const owner = ownerSource()
  assert.match(owner, /import \{ Byline \} from '\.\.\/design-system\/Byline\.js'/)
  assert.match(
    owner,
    /import \{ KeyboardShortcutHint \} from '\.\.\/design-system\/KeyboardShortcutHint\.js'/,
  )
  assert.doesNotMatch(
    owner,
    /\{figures\.arrowUp\}\/\{figures\.arrowDown\} select · Enter view/,
  )

  for (const supportsHideShow of [false, true]) {
    const { tree, types } = renderTeamDetailView(supportsHideShow)
    assert.equal(nodesOfType(tree, types.Byline).length, 1)
    const shortcuts = nodesOfType(tree, types.KeyboardShortcutHint).map(
      node => node.props,
    )
    assert.deepEqual(
      shortcuts.map(shortcut => [shortcut.chord, shortcut.action]),
      [
        [['up', 'down'], 'select'],
        ['enter', 'view'],
        ['k', 'kill'],
        ['s', 'shutdown'],
        ['p', 'prune idle'],
        ...(supportsHideShow
          ? [
              ['h', 'hide/show'],
              ['shift+h', 'hide/show all'],
            ]
          : []),
        ['escape', 'close'],
      ],
    )
    const shifted = shortcuts.find(shortcut => shortcut.chord === 'shift+h')
    assert.deepEqual(
      shifted?.format,
      supportsHideShow ? { shiftAsCase: true } : undefined,
    )
  }
})

test('source renders the teammate detail shortcut graph through Byline', sourceOptions, () => {
  for (const supportsHideShow of [false, true]) {
    const { tree, types } = renderTeammateDetailView(supportsHideShow)
    assert.equal(nodesOfType(tree, types.Byline).length, 1)
    const shortcuts = nodesOfType(tree, types.KeyboardShortcutHint).map(
      node => node.props,
    )
    assert.deepEqual(
      shortcuts.map(shortcut => [shortcut.chord, shortcut.action]),
      [
        ['left', 'back'],
        ['escape', 'close'],
        ['k', 'kill'],
        ['s', 'shutdown'],
        ...(supportsHideShow ? [['h', 'hide/show']] : []),
      ],
    )
    const byline = nodesOfType(tree, types.Byline)[0]
    assert.match(JSON.stringify(byline.props.children), /Shift\+Tab.*cycle mode/)
  }
})
