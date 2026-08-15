import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
const latestBundlePath = process.env.CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE
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

const targetUnits = new Map([
  [
    5271,
    [
      3798110,
      3799307,
      'e4bf4c7de8a1b18c60b5d917034cbe3ecf47c8b2a19b4d93885da01b2901fcd3',
    ],
  ],
  [
    5366,
    [
      3956462,
      3956993,
      '731c592794932ec39e8657662be8ed400375bc962acf39728dde8ea90773205c',
    ],
  ],
  [
    5370,
    [
      3957631,
      3957826,
      '168b345ec541bbd4b0078e0dbb9dd3ff74c3cf7d58d45e66430872fce517d2c5',
    ],
  ],
  [
    5607,
    [
      4047232,
      4047492,
      '1a250b4d3697b629cc10e915df477c4811afe84797f78e2e500175c8e13cd4b1',
    ],
  ],
  [
    5613,
    [
      4047892,
      4048134,
      '2d7d7fae9665b66548471646ef9f29291372eb7d77f894cfe6a19b3d5df8e31d',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}
const latestOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !latestBundlePath
      ? 'CLAUDE_CODE_2_1_116_PUBLISHED_BUNDLE is not set'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

function assertOrdered(contents, fragments, label) {
  let previous = -1
  for (const fragment of fragments) {
    const index = contents.indexOf(fragment, previous + 1)
    assert.notEqual(index, -1, `${label}: ${fragment}`)
    assert.ok(index > previous, `${label}: ordering ${fragment}`)
    previous = index
  }
}

function parsedKey(overrides = {}) {
  return {
    kind: 'key',
    name: '',
    sequence: '',
    raw: '',
    fn: false,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
    isPasted: false,
    ...overrides,
  }
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

async function loadRecoveredEventClasses() {
  const ts = await loadTypeScript()
  const eventSource = [
    'ink/events/keyboard-event.ts',
    'ink/events/paste-event.ts',
    'ink/events/wheel-event.ts',
  ]
    .map((relative) => source(relative).replace(/^import[^\n]*\n/gm, ''))
    .join('\n')
  const terminalEventStub = `
class TerminalEvent {
  constructor(type, init = {}) {
    this.type = type
    this.bubbles = init.bubbles ?? true
    this.cancelable = init.cancelable ?? true
    this._defaultPrevented = false
  }
  get defaultPrevented() { return this._defaultPrevented }
  preventDefault() {
    if (this.cancelable) this._defaultPrevented = true
  }
}
`
  const javascript = ts.transpileModule(`${terminalEventStub}\n${eventSource}`, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test('target101 pins every exact Ink wheel structural unit', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')

  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }

  const units = Object.fromEntries(
    [...targetUnits].map(([index, [start, end]]) => [index, target.slice(start, end)]),
  )
  assert.match(units[5271], /wheelUp:.*name==="wheelup",wheelDown:.*name==="wheeldown"/)
  assert.ok(units[5366].includes('wheel:{bubble:"onWheel",capture:"onWheelCapture"}'))
  assert.ok(units[5366].includes('"onWheel","onWheelCapture"'))
  assert.match(units[5370], /case"scroll":case"wheel":case"mousemove"/)
  assert.ok(units[5607].includes('charCodeAt(0)===27'))
  assert.ok(units[5607].includes('/^(\\[<\\d[\\d;]*[Mm]?)+$/'))
  assert.ok(units[5613].includes('super("wheel",{bubbles:!0,cancelable:!0})'))
  assert.ok(units[5613].includes('deltaX'))
})

test('wheel dispatch and the legacy stop guard are introduced at 100 to 101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'wheel:{bubble:"onWheel",capture:"onWheelCapture"}',
    'super("wheel",{bubbles:!0,cancelable:!0})',
    'dispatchWheelEvent',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.doesNotMatch(
    baseline,
    /else if\(!\w+\.didStopImmediatePropagation\(\)\)\w+\.props\.dispatchKeyboardEvent/,
  )
  assert.match(
    target,
    /else if\(!\w+\.didStopImmediatePropagation\(\)\)\w+\.props\.dispatchKeyboardEvent/,
  )
})

test('source owns the complete target101 input-event route', sourceOptions, async () => {
  assertFragments('src/ink/events/input-event.ts', [
    'wheelUp: keypress.name === \'wheelup\'',
    'wheelDown: keypress.name === \'wheeldown\'',
    'if (!keypress.name && /^(\\x1b?\\[<\\d[\\d;]*[Mm]?)+$/.test(input))',
  ])
  assertFragments('src/ink/events/event-handlers.ts', [
    "import type { WheelEvent } from './wheel-event.js'",
    "wheel: { bubble: 'onWheel', capture: 'onWheelCapture' }",
    "'onWheelCapture'",
  ])
  assertFragments('src/ink/events/dispatcher.ts', [
    "case 'scroll':",
    "case 'wheel':",
    'return ContinuousEventPriority as number',
  ])
  assertFragments('src/ink/events/keyboard-event.ts', [
    "if (seq.charCodeAt(0) === 0x1b) return ''",
    'if (/^(\\[<\\d[\\d;]*[Mm]?)+$/.test(seq)) return \'\'',
  ])
  assertFragments('src/ink/events/paste-event.ts', [
    'export class PasteEvent extends TerminalEvent',
    "super('paste', { bubbles: true, cancelable: true })",
    'this.text = text',
  ])
  assertFragments('src/ink/events/wheel-event.ts', [
    'export class WheelEvent extends TerminalEvent',
    "super('wheel', { bubbles: true, cancelable: true })",
    'this.deltaY = deltaY',
    'this.deltaX = init.deltaX ?? 0',
    'this.meta = init.meta ?? false',
  ])

  const box = assertFragments('src/ink/components/Box.tsx', [
    'onPaste?: (event: PasteEvent) => void',
    'onWheel?: (event: WheelEvent) => void',
    'onPaste={onPaste}',
    'onWheel={onWheel}',
  ])
  assert.equal(box.includes('onWheelCapture={onWheelCapture}'), true)

  const app = source('src/ink/components/App.tsx')
  assertOrdered(app, [
    'if (!item.isPasted)',
    "app.internal_eventEmitter.emit('input', event)",
    'if (item.isPasted)',
    "app.props.dispatchPasteEvent(item.sequence ?? '')",
    "item.name === 'wheelup' || item.name === 'wheeldown' || item.name === 'mouse'",
    "if (item.name !== 'mouse')",
    'app.props.dispatchWheelEvent(item)',
    '!event.didStopImmediatePropagation()',
    'app.props.dispatchKeyboardEvent(item)',
  ], 'App input routing')

  const ink = source('src/ink/ink.tsx')
  assertOrdered(ink, [
    'dispatchPasteEvent(text: string)',
    'dispatcher.dispatchDiscrete(target, new PasteEvent(text))',
    'dispatchWheelEvent(parsedKey: ParsedKey)',
    "parsedKey.name === 'wheeldown' ? 1 : -1",
    'dispatcher.dispatchContinuous(target, new WheelEvent(deltaY, {',
    'dispatchKeyboardEvent(parsedKey: ParsedKey)',
  ], 'Ink root dispatch')
  for (const fragment of [
    'dispatchPasteEvent={this.dispatchPasteEvent}',
    'dispatchWheelEvent={this.dispatchWheelEvent}',
  ]) assert.ok(ink.includes(fragment), fragment)

  const { KeyboardEvent, PasteEvent, WheelEvent } =
    await loadRecoveredEventClasses()

  assert.equal(new KeyboardEvent(parsedKey({ sequence: '\x1b[999~' })).key, '')
  assert.equal(new KeyboardEvent(parsedKey({ sequence: '[<64;12;4M' })).key, '')
  const paste = new PasteEvent('alpha\nbeta')
  assert.equal(paste.type, 'paste')
  assert.equal(paste.text, 'alpha\nbeta')
  const wheel = new WheelEvent(1, { ctrl: true, shift: true })
  assert.deepEqual(
    [wheel.type, wheel.deltaY, wheel.deltaX, wheel.ctrl, wheel.shift, wheel.meta],
    ['wheel', 1, 0, true, true, false],
  )
  wheel.preventDefault()
  assert.equal(wheel.defaultPrevented, true)
})

const currentSourceTest = selected && isCurrentSource ? test : test.skip

currentSourceTest(
  'latest source retains target116 keyboard normalization and raw-mode reachability',
  async () => {
    assertFragments('src/ink/events/keyboard-event.ts', [
      'readonly name: string',
      "this.name = parsedKey.name ?? ''",
      "if (parsed.shift && name.length === 1 && name >= 'a' && name <= 'z')",
      'return name.toUpperCase()',
    ])
    assertFragments('src/ink/events/event-handlers.ts', [
      'export const INPUT_EVENT_HANDLER_PROPS = new Set<string>([',
      "'onPasteCapture'",
      "'onWheelCapture'",
    ])
    assertFragments('src/ink/dom.ts', [
      '_holdsRawModeRef?: boolean',
      'setRawMode?: (value: boolean) => void',
      '_pendingRawModeDelta?: number',
    ])
    const reconciler = source('src/ink/reconciler.ts')
    assertOrdered(reconciler, [
      'function hasInputEventHandler',
      'function updateRootRawModeRef',
      'function syncRawModeRef',
      'function releaseRawModeRefs',
      'syncRawModeRef(node, root)',
      'releaseRawModeRefs(removeNode, node)',
      'if (inputEventHandlerChanged)',
      'syncRawModeRef(node, getRootNode(node))',
    ], 'raw-mode ownership')
    assertFragments('src/ink/components/App.tsx', [
      'const pendingRawModeDelta = root._pendingRawModeDelta ?? 0',
      'root.setRawMode = this.handleSetRawMode',
      'this.props.rootNode.setRawMode = undefined',
    ])
    assert.ok(source('src/ink/ink.tsx').includes('rootNode={this.rootNode}'))

    const { KeyboardEvent } = await loadRecoveredEventClasses()
    const shifted = new KeyboardEvent(
      parsedKey({ name: 'a', sequence: '\x1b[97;2u', shift: true }),
    )
    assert.equal(shifted.key, 'A')
    assert.equal(shifted.name, 'a')
  },
)

test('authenticated target116 retains the complete reachable event graph', latestOptions, () => {
  const bytes = fs.readFileSync(latestBundlePath)
  assert.equal(bytes.length, 13_102_362)
  assert.equal(
    sha256(bytes),
    '06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193',
  )
  const target = bytes.toString('utf8')

  for (const fragment of [
    'wheel:{bubble:"onWheel",capture:"onWheelCapture"}',
    'new Set(["onKeyDown","onKeyDownCapture","onPaste","onPasteCapture","onWheel","onWheelCapture"])',
    'super("paste",{bubbles:!0,cancelable:!0})',
    'super("wheel",{bubbles:!0,cancelable:!0})',
    'dispatchPasteEvent(H){',
    'dispatchWheelEvent(H){',
    '_pendingRawModeDelta',
    'hoverIgnoresBlankCells',
  ]) assert.ok(target.includes(fragment), fragment)

  assert.ok(target.includes('if(!_.isPasted)H.handleInput(A)'))
  assert.ok(target.includes('if(H.internal_eventEmitter.emit("input",f),_.isPasted)H.props.dispatchPasteEvent(_.sequence??"")'))
  assert.ok(target.includes('_.name==="wheelup"||_.name==="wheeldown"||_.name==="mouse"'))

  const wheelMethodStart = target.indexOf('dispatchWheelEvent(H){')
  assert.notEqual(wheelMethodStart, -1)
  const wheelMethod = target.slice(wheelMethodStart, wheelMethodStart + 420)
  assert.ok(wheelMethod.includes('H.name==="wheeldown"?1:-1'))
  assert.ok(wheelMethod.includes('.dispatchContinuous('))
  assert.ok(wheelMethod.includes('{ctrl:H.ctrl,shift:H.shift,meta:H.meta||H.option}'))
})
