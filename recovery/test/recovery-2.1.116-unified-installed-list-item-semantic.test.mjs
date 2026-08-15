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
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'authenticated target114 and target116 bundles are required'
      : false,
}

const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const baselineUnit = {
  index: 15939,
  start: 10086738,
  end: 10093951,
  sourceHash:
    '1bc055caf531fd94a34b8e6f6b6bcc066a98bb8964725dc28e6f1ce5c789795b',
}
const targetUnit = {
  index: 16079,
  start: 10142308,
  end: 10149212,
  sourceHash:
    '4d91ad6164cb5e4ade0af5782d23709b430235611c28623add049058472e6a29',
}
const styledRows = [
  { historicalOrdinal: 471, currentOrdinal: 426, start: 10143971, end: 10143977 },
  { historicalOrdinal: 472, currentOrdinal: 427, start: 10145105, end: 10145111 },
  { historicalOrdinal: 473, currentOrdinal: 428, start: 10146391, end: 10146397 },
  { historicalOrdinal: 474, currentOrdinal: 429, start: 10148229, end: 10148235 },
  { historicalOrdinal: 475, currentOrdinal: 430, start: 10149148, end: 10149154 },
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function count(source, fragment) {
  return source.split(fragment).length - 1
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

async function instantiateOwner() {
  const ts = await loadTypeScript()
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'commands/plugin/UnifiedInstalledCell.tsx'),
    'utf8',
  )
  const javascript = ts.transpileModule(owner, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText
  const Fragment = Symbol('Fragment')
  const createElement = (type, props, ...children) => ({
    type,
    props: { ...props, children },
  })
  const React = { Fragment, createElement }
  const figures = {
    arrowRight: 'ARROW',
    cross: 'CROSS',
    radioOff: 'OFF',
    tick: 'TICK',
    warning: 'WARNING',
    triangleUpOutline: 'TRIANGLE',
    pointer: 'POINTER',
  }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'react') {
      return { __esModule: true, default: React, ...React }
    }
    if (specifier === 'figures') {
      return { __esModule: true, default: figures, ...figures }
    }
    if (specifier.endsWith('/ink.js')) {
      return {
        Text: 'Text',
        color: semantic => value => `${semantic}:${value}`,
        useTheme: () => ['theme'],
      }
    }
    if (specifier.endsWith('/ConfigurableShortcutHint.js')) {
      return { ConfigurableShortcutHint: 'ConfigurableShortcutHint' }
    }
    if (specifier.endsWith('/design-system/ListItem.js')) {
      return { ListItem: 'ListItem' }
    }
    if (specifier.endsWith('/stringUtils.js')) {
      return { plural: (amount, singular) => `${singular}${amount === 1 ? '' : 's'}` }
    }
    return {}
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return module.exports
}

function walk(node, visit) {
  if (node == null || node === false) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node !== 'object') return
  visit(node)
  walk(node.props?.children, visit)
}

function renderedText(node) {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(renderedText).join('')
  return renderedText(node.props?.children)
}

test(
  'authenticated target116 migrates all unified installed rows to ListItem',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    const baselineRegion = structural.unmatchedBaseline.find(
      region => region.index === baselineUnit.index,
    )
    assert.ok(baselineRegion)
    assert.deepEqual(
      [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
      [baselineUnit.start, baselineUnit.end, baselineUnit.sourceHash],
    )
    const baselineOwner = baseline.slice(baselineUnit.start, baselineUnit.end)
    assert.equal(sha256(baselineOwner), baselineUnit.sourceHash)

    const targetRegion = structural.regions[targetUnit.index]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.sourceHash,
      ],
      [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
    )
    const targetOwner = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(targetOwner), targetUnit.sourceHash)
    for (const row of styledRows) {
      assert.equal(target.slice(row.start, row.end), 'styled')
    }
    assert.equal(count(baselineOwner, 'styled:!1'), 0)
    assert.equal(count(targetOwner, 'styled:!1'), 5)
    assert.equal(count(targetOwner, 'isFocused:'), 5)

    // The configurable auth hint is inherited by both sides of this boundary;
    // the own-116 delta is the five ListItem wrappers.
    assert.equal(count(baselineOwner, 'description:"auth"'), 1)
    assert.equal(count(targetOwner, 'description:"auth"'), 1)
  },
)

test(
  'source delegates focus markers and cursor ownership for every row variant',
  sourceOptions,
  async () => {
    const { UnifiedInstalledCell } = await instantiateOwner()
    const variants = [
      {
        type: 'plugin',
        name: 'plugin-one',
        marketplace: 'market',
        pendingToggle: null,
        errorCount: 0,
        isEnabled: true,
      },
      {
        type: 'flagged-plugin',
        name: 'flagged-one',
        marketplace: 'market',
      },
      {
        type: 'failed-plugin',
        name: 'failed-one',
        marketplace: 'market',
        errorCount: 2,
      },
      { type: 'mcp', name: 'nested-mcp', status: 'connected', indented: true },
      { type: 'mcp', name: 'auth-mcp', status: 'needs-auth', indented: false },
    ]

    for (const item of variants) {
      const tree = UnifiedInstalledCell({ item, isSelected: true })
      assert.equal(tree.type, 'ListItem')
      assert.equal(tree.props.isFocused, true)
      assert.equal(tree.props.styled, false)
      assert.equal(tree.props.children.length, 1)
      assert.equal(tree.props.children[0].type, 'Text')
      assert.equal(renderedText(tree).includes('POINTER'), false)
    }

    const authTree = UnifiedInstalledCell({
      item: variants.at(-1),
      isSelected: false,
    })
    const shortcutNodes = []
    walk(authTree, node => {
      if (node.type === 'ConfigurableShortcutHint') shortcutNodes.push(node)
    })
    assert.equal(shortcutNodes.length, 1)
    assert.deepEqual(
      {
        action: shortcutNodes[0].props.action,
        context: shortcutNodes[0].props.context,
        fallback: shortcutNodes[0].props.fallback,
        description: shortcutNodes[0].props.description,
      },
      {
        action: 'select:accept',
        context: 'Select',
        fallback: 'Enter',
        description: 'auth',
      },
    )

    const owner = fs.readFileSync(
      path.join(sourceRoot, 'commands/plugin/UnifiedInstalledCell.tsx'),
      'utf8',
    )
    assert.equal(count(owner, '<ListItem isFocused={isSelected} styled={false}>'), 5)
    assert.equal(owner.includes('figures.pointer'), false)
  },
)
