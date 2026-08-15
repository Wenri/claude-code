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
  index: 8505,
  start: 4059504,
  end: 4061132,
  sourceHash:
    '07e5daa9031eb3400ae503da2149e644a7d98824f5c885437db7a678c8d63ee6',
}
const targetUnit = {
  index: 8593,
  start: 4087319,
  end: 4088995,
  sourceHash:
    'a3b6b4597df521ef1d1147be85ca175df5e7fd8bfa9db3ae3bb0f277f253064f',
}
const typedRow = {
  currentRow: 318,
  value: ' navigate',
  start: 4088288,
  end: 4088299,
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
  const owner = fs.readFileSync(
    path.join(sourceRoot, 'components/messageActions.tsx'),
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
  const React = {
    Fragment,
    createElement,
    createContext: defaultValue => ({ defaultValue }),
    useCallback: callback => callback,
    useContext: () => false,
    useMemo: factory => factory(),
    useRef: value => ({ current: value }),
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
    if (specifier === 'figures') {
      return {
        __esModule: true,
        default: { arrowUp: '↑', arrowDown: '↓' },
      }
    }
    if (specifier.endsWith('/ink.js')) return { Box: 'Box', Text: 'Text' }
    if (specifier.endsWith('/useKeybinding.js')) {
      return { useKeybindings() {} }
    }
    if (specifier.endsWith('/analytics/index.js')) return { logEvent() {} }
    if (specifier.endsWith('/utils/messages.js')) {
      return {
        isEmptyMessageText: value => value === '',
        SYNTHETIC_MESSAGES: new Set(),
      }
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

function renderedText(node, Fragment) {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) {
    return node.map(child => renderedText(child, Fragment)).join('')
  }
  if (node.type === Fragment || node.type === 'Box' || node.type === 'Text') {
    return renderedText(node.props.children, Fragment)
  }
  return ''
}

test(
  'authenticated target116 removes MessageActionsBar dot separators',
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
      target.slice(typedRow.start, typedRow.end),
      JSON.stringify(typedRow.value),
    )
    assert.match(baselineOwner, /" \\xB7 "/)
    assert.match(baselineOwner, /" navigate \\xB7 "/)
    assert.equal(targetOwner.includes('\\xB7'), false)
    assert.equal(targetOwner.includes(JSON.stringify(' navigate')), true)
  },
)

test(
  'source renders compact action, navigation, and back hints without dots',
  sourceOptions,
  async () => {
    const { exports, Fragment } = await instantiateOwner()
    const tree = exports.MessageActionsBar({
      cursor: {
        uuid: 'message-1',
        msgType: 'user',
        expanded: false,
      },
    })
    assert.equal(renderedText(tree, Fragment), 'enter editc copy↑↓ navigateesc back')

    const owner = fs.readFileSync(
      path.join(sourceRoot, 'components/messageActions.tsx'),
      'utf8',
    )
    const start = owner.indexOf('export function MessageActionsBar')
    const end = owner.indexOf('export function stripSystemReminders', start)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const bar = owner.slice(start, end)
    assert.equal(bar.includes(' · '), false)
    assert.equal(bar.includes(' navigate</Text>'), true)
  },
)
