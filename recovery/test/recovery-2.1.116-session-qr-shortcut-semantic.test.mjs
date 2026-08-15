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
  index: 16570,
  nodeType: 'FunctionDeclaration',
  start: 10_451_700,
  end: 10_453_337,
  sourceHash:
    '2288767f8b12e93f44e021d8c98f4b1897f932a8001d332ec491459dff762325',
}
const targetUnit = {
  index: 16711,
  nodeType: 'FunctionDeclaration',
  start: 10_507_794,
  end: 10_509_467,
  sourceHash:
    'a071a38e34ee0e6a426f73a87077e8f0b2c2273bd5f721271da894fe0119103d',
}
const typedRows = [
  {
    historicalOrdinal: 473,
    currentOrdinal: 526,
    value: 'margin',
    start: 10_507_999,
    end: 10_508_005,
    baselineOccurrenceCount: 47,
    targetOccurrenceNumber: 50,
  },
  {
    historicalOrdinal: 474,
    currentOrdinal: 527,
    value: 'parens',
    start: 10_509_282,
    end: 10_509_288,
    baselineOccurrenceCount: 30,
    targetOccurrenceNumber: 31,
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function ownerSource() {
  return fs.readFileSync(
    path.join(sourceRoot, 'commands/session/session.tsx'),
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

async function renderSession(remoteSessionUrl) {
  const ts = await loadTypeScript()
  const source = ownerSource()
    .replace('function SessionInfo(t0)', 'export function SessionInfo(t0)')
    .replace(/\n\/\/# sourceMappingURL=[\s\S]*$/, '')
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const qrCalls = []
  const React = {
    createElement(type, props, ...children) {
      return {
        type,
        props: { ...(props ?? {}), children: children.flat(Infinity) },
      }
    },
    useEffect(effect) {
      effect?.()
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
  }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'react/compiler-runtime') {
      return {
        c: size => Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
      }
    }
    if (specifier === 'react') {
      return { __esModule: true, default: React, ...React }
    }
    if (specifier === 'qrcode') {
      return {
        toString: async (url, options) => {
          qrCalls.push({ url, options })
          return 'QR\n'
        },
      }
    }
    if (specifier.endsWith('/design-system/KeyboardShortcutHint.js')) {
      return { KeyboardShortcutHint: 'KeyboardShortcutHint' }
    }
    if (specifier.endsWith('/design-system/Pane.js')) return { Pane: 'Pane' }
    if (specifier.endsWith('/ink.js')) return { Box: 'Box', Text: 'Text' }
    if (specifier.endsWith('/keybindings/useKeybinding.js')) {
      return { useKeybinding() {} }
    }
    if (specifier.endsWith('/state/AppState.js')) {
      return {
        useAppState: selector => selector({ remoteSessionUrl }),
      }
    }
    if (specifier.endsWith('/utils/debug.js')) {
      return { logForDebugging() {} }
    }
    return {}
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  const node = module.exports.SessionInfo({ onDone() {} })
  await Promise.resolve()
  await Promise.resolve()
  return { node, qrCalls }
}

function findAll(node, type, matches = []) {
  if (node == null || node === false) return matches
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, type, matches)
    return matches
  }
  if (typeof node !== 'object') return matches
  if (node.type === type) matches.push(node)
  findAll(node.props?.children, type, matches)
  return matches
}

function renderedText(node) {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(renderedText).join('')
  return renderedText(node.props?.children)
}

bundleTest('authenticated 114→116 hardens remote session QR presentation', () => {
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
    /type:"utf8",errorCorrectionLevel:"L"\}/,
  )
  assert.equal(
    (oldOwner.toString('utf8').match(/\(press esc to close\)/g) ?? []).length,
    2,
  )
  assert.match(
    nextOwner.toString('utf8'),
    /type:"utf8",errorCorrectionLevel:"L",margin:0/,
  )
  assert.equal(
    (nextOwner.toString('utf8').match(/chord:"escape",action:"close",parens:!0/g) ?? [])
      .length,
    2,
  )
  assert.doesNotMatch(nextOwner.toString('utf8'), /press esc to close/)
  for (const row of typedRows) {
    assert.equal(target.toString('utf8').slice(row.start, row.end), row.value)
  }
})

sourceTest('source uses zero-margin QR output and shared escape hints', () => {
  const source = ownerSource()
  assert.match(
    source,
    /errorCorrectionLevel: "L",\s*margin: 0/,
  )
  assert.equal(
    (source.match(/<KeyboardShortcutHint chord="escape" action="close" parens=\{true\} \/>/g) ?? [])
      .length,
    2,
  )
  assert.doesNotMatch(source, /press esc to close/)
  assert.match(source, /t7 = <Box>\{t6\}<Text color="ide">/)
  assert.match(source, /t8 = <Box marginBottom=\{1\}>/)
  assert.match(source, /<T0>\{t4\}\{t7\}\{t8\}\{t5\}<\/T0>/)
})

sourceTest('actual session view routes both branches through exact hint props', async () => {
  const local = await renderSession(undefined)
  assert.equal(local.qrCalls.length, 0)
  assert.match(renderedText(local.node), /Not in remote mode/)
  const localHints = findAll(local.node, 'KeyboardShortcutHint')
  assert.equal(localHints.length, 1)
  assert.deepEqual(
    {
      chord: localHints[0].props.chord,
      action: localHints[0].props.action,
      parens: localHints[0].props.parens,
    },
    { chord: 'escape', action: 'close', parens: true },
  )

  const remote = await renderSession('https://claude.ai/session/demo')
  assert.deepEqual(remote.qrCalls, [
    {
      url: 'https://claude.ai/session/demo',
      options: { type: 'utf8', errorCorrectionLevel: 'L', margin: 0 },
    },
  ])
  assert.equal(remote.node.type, 'Pane')
  assert.deepEqual(
    remote.node.props.children.map(child => child.type),
    ['Box', 'Box', 'Box', 'Text'],
  )
  assert.equal(remote.node.props.children[1].props.marginTop, undefined)
  assert.equal(remote.node.props.children[2].props.marginBottom, 1)
  const remoteHints = findAll(remote.node, 'KeyboardShortcutHint')
  assert.equal(remoteHints.length, 1)
  assert.deepEqual(
    {
      chord: remoteHints[0].props.chord,
      action: remoteHints[0].props.action,
      parens: remoteHints[0].props.parens,
    },
    { chord: 'escape', action: 'close', parens: true },
  )
})
