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
  index: 15661,
  start: 9857347,
  end: 9860299,
  sourceHash:
    '234abb08c252c8fd449279b1f275354af7edcdeb7ef04b1954ae1ab76d4a1f09',
}
const targetUnit = {
  index: 15798,
  start: 9911536,
  end: 9914629,
  sourceHash:
    'f9afe3603479a4d085386802f47278bfb21f81c27ed9de57d09fe467cf377699',
}
const typedResidueRow = {
  currentOrdinal: 399,
  value: '…and ',
  start: 9914156,
  end: 9914168,
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
  const owner = fs
    .readFileSync(path.join(sourceRoot, 'commands/ide/ide.tsx'), 'utf8')
    .replace('function IDEScreen(t0)', 'export function IDEScreen(t0)')
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
  const React = {
    Fragment,
    createElement,
    useCallback: callback => callback,
    useEffect() {},
    useRef: value => ({ current: value }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'react/compiler-runtime') {
      return {
        c: size =>
          Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
      }
    }
    if (specifier === 'react') {
      return { __esModule: true, default: React, ...React }
    }
    if (specifier === 'chalk') {
      return { __esModule: true, default: { bold: value => value } }
    }
    if (specifier === 'path') return path
    if (specifier.endsWith('/CustomSelect/index.js')) return { Select: 'Select' }
    if (specifier.endsWith('/design-system/Dialog.js')) return { Dialog: 'Dialog' }
    if (specifier.endsWith('/IdeAutoConnectDialog.js')) {
      return {
        IdeAutoConnectDialog: 'IdeAutoConnectDialog',
        IdeDisableAutoConnectDialog: 'IdeDisableAutoConnectDialog',
        shouldShowAutoConnectDialog: () => false,
        shouldShowDisableAutoConnectDialog: () => false,
      }
    }
    if (specifier.endsWith('/ink.js')) return { Box: 'Box', Text: 'Text' }
    if (specifier.endsWith('/analytics/index.js')) return { logEvent() {} }
    if (specifier.endsWith('/mcp/client.js')) return { clearServerCache() {} }
    if (specifier.endsWith('/state/AppState.js')) {
      return {
        useAppState: () => undefined,
        useSetAppState: () => () => {},
      }
    }
    if (specifier.endsWith('/utils/cwd.js')) return { getCwd: () => '/repo' }
    if (specifier.endsWith('/utils/execFileNoThrow.js')) {
      return { execFileNoThrow: async () => ({ code: 0 }) }
    }
    if (specifier.endsWith('/utils/ide.js')) {
      return {
        detectIDEs: async () => [],
        detectRunningIDEs: async () => [],
        isJetBrainsIde: () => false,
        isSupportedJetBrainsTerminal: () => false,
        isSupportedTerminal: () => true,
        toIDEDisplayName: value => value,
      }
    }
    if (specifier.endsWith('/utils/worktree.js')) {
      return { getCurrentWorktreeSession: () => null }
    }
    return {}
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return { exports: module.exports, Fragment }
}

function renderedText(node) {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(renderedText).join('')
  return renderedText(node.props?.children)
}

test(
  'authenticated target116 bounds the unavailable IDE list',
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
    assert.equal(
      target.slice(typedResidueRow.start, typedResidueRow.end),
      '"\\u2026and "',
    )
    assert.equal(baselineOwner.includes('.slice(0,4)'), false)
    assert.equal(targetOwner.includes('.slice(0,4)'), true)
    assert.equal(targetOwner.includes('.length>4'), true)
    assert.equal(targetOwner.includes('.length-4'), true)
  },
)

test(
  'source renders four unavailable IDEs and an exact overflow count',
  sourceOptions,
  async () => {
    const { exports } = await instantiateOwner()
    const unavailableIDEs = Array.from({ length: 6 }, (_, index) => ({
      name: `IDE ${index + 1}`,
      port: 9000 + index,
      workspaceFolders: [],
    }))
    const tree = exports.IDEScreen({
      availableIDEs: [],
      unavailableIDEs,
      selectedIDE: null,
      onClose() {},
      onSelect() {},
    })
    const text = renderedText(tree)
    for (let index = 1; index <= 4; index += 1) {
      assert.equal(text.includes(`IDE ${index}`), true)
    }
    assert.equal(text.includes('IDE 5'), false)
    assert.equal(text.includes('IDE 6'), false)
    assert.equal(text.includes('…and 2 more'), true)

    const owner = fs.readFileSync(
      path.join(sourceRoot, 'commands/ide/ide.tsx'),
      'utf8',
    )
    assert.match(owner, /unavailableIDEs\.slice\(0, 4\)\.map\(_temp3\)/)
    assert.match(owner, /unavailableIDEs\.length > 4/)
    assert.match(owner, /unavailableIDEs\.length - 4/)
  },
)
