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

const targetUnits = [
  [18442, 'FunctionDeclaration', 11383335, 11383650, 'f4d03c2f12cd3ad666945470b543365ea02f3533cf2db60203b7f8be55c23df4'],
  [18445, 'VariableDeclaration', 11383708, 11383813, '95413c55b0b1b33bba14448781ddcf5b6f5af2964026afad8afe131496938e0a'],
  [18448, 'FunctionDeclaration', 11383846, 11384484, '3b2e20a5ef92c570d8386ca1b3b46f22db5b8006893e50e142576801eb682655'],
  [19329, 'FunctionDeclaration', 11803951, 11831855, '997c52d29b50bc489a62979e07f11275e0da97d2e5cd7ce05c534b8f8148f609'],
  [19949, 'FunctionDeclaration', 12076738, 12081373, 'b2f90b965e89c7ff670813b80e00d375a64774dd0fede6acaa7ec17b4a88f9c7'],
  [19957, 'FunctionDeclaration', 12084492, 12084875, '1142fcc1912e5b4eb6c6959cbd3752ec0642ce4c06caa6b0335da2a3494e3534'],
  [19958, 'FunctionDeclaration', 12084875, 12085053, 'c16aa7f08fa1087f06ec111b0b4f7af49d99d6b35afa5282a7282088aec7aa92'],
  [19959, 'VariableDeclaration', 12085053, 12085232, 'eeb85a6be7c9d1ac739afcdc54de87352fec7aed547c660f8c59582ca41b9d3c'],
]

const typedOccurrences = [
  ['property', 'setHandler', 11383455, 11383465, 18442],
  ['property', 'tryDelete', 11383485, 11383494, 18442],
  ['property', 'setHandler', 11383774, 11383784, 18445],
  ['property', 'tryDelete', 11383792, 11383801, 18445],
  ['property', 'setHandler', 11826064, 11826074, 19329],
  ['property', 'setHandler', 11826110, 11826120, 19329],
  ['string', ' · disable auto-copy in /config', 12077404, 12077440, 19949],
  ['property', 'tryDelete', 12081240, 12081249, 19949],
  ['string', 'tengu_scroll_arrows_detected', 12084650, 12084680, 19957],
  ['string', 'arrow-burst', 12084755, 12084768, 19957],
  ['string', 'arrow-burst', 12084783, 12084796, 19957],
  ['string', 'scroll-as-arrows', 12084905, 12084923, 19958],
  ['string', 'Scroll wheel is sending arrow keys · run /terminal-setup to fix', 12084950, 12085018, 19958],
  ['string', 'auto-copy-config-hint', 12085195, 12085218, 19959],
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function extractFunction(owner, name, ts) {
  const sourceFile = ts.createSourceFile(
    `${name}.tsx`,
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let match
  const visit = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name
    ) {
      match = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(match, `${name} declaration`)
  return owner.slice(match.getStart(sourceFile), match.end)
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

async function transpileCommonJs(input, jsx = false) {
  const ts = await loadTypeScript()
  return ts.transpileModule(input, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: jsx ? ts.JsxEmit.React : undefined,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

test('target116 authenticates the complete selection-delete and scroll-hint graph', pairOptions, () => {
  const baseline = fs.readFileSync(baselinePath)
  const target = fs.readFileSync(targetPath)
  const targetText = target.toString('utf8')
  assert.equal(sha256(baseline), baselineSha256)
  assert.equal(sha256(target), targetSha256)

  for (const [index, nodeType, start, end, sourceHash] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.index,
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [index, nodeType, start, end, sourceHash],
    )
    assert.equal(sha256(targetText.slice(start, end)), sourceHash)
  }

  for (const [kind, value, start, end, structuralIndex] of typedOccurrences) {
    const raw = targetText.slice(start, end)
    const cooked = kind === 'string'
      ? new Function(`"use strict"; return (${raw})`)()
      : raw
    assert.equal(cooked, value)
    assert.ok(
      start >= structural.regions[structuralIndex].target.start &&
        end <= structural.regions[structuralIndex].target.end,
      `${kind}:${value} structural owner`,
    )
  }

  for (const fragment of [
    'tengu_scroll_arrows_detected',
    'scroll-as-arrows',
    'Scroll wheel is sending arrow keys',
    'run /terminal-setup to fix',
    'auto-copy-config-hint',
    'disable auto-copy in /config',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
})

test('source preserves all four live owners and their ordering constraints', sourceOptions, () => {
  const context = source('context/selectionDelete.tsx')
  const app = source('components/App.tsx')
  const prompt = source('components/PromptInput/PromptInput.tsx')
  const scroll = source('components/ScrollKeybindingHandler.tsx')

  for (const fragment of [
    'setHandler:',
    'tryDelete:',
    'handlerRef.current?.(selection) ?? false',
    '<SelectionDeleteContext.Provider value={valueRef.current}>',
  ]) assert.ok(context.includes(fragment), fragment)
  assert.match(
    app,
    /<KillRingProvider><SelectionDeleteProvider>\{children\}<\/SelectionDeleteProvider><\/KillRingProvider>/,
  )

  for (const fragment of [
    'selectionBounds(selection)',
    'nodeCache.get(containerElement)',
    'end.col + 1',
    'pushToBuffer(input, cursorOffset, pastedContents)',
    'trackAndSetInput(input.slice(0, offsets.start) + input.slice(offsets.end))',
    'selectionDelete.setHandler(',
    'selectionDelete.setHandler(null)',
    'ref={inputContainerRef}',
    'tabIndex={-1}',
  ]) assert.ok(prompt.includes(fragment), fragment)
  assert.ok(
    prompt.indexOf('pushToBuffer(input, cursorOffset, pastedContents)') <
      prompt.indexOf('trackAndSetInput(input.slice(0, offsets.start)'),
  )

  for (const fragment of [
    "logEvent('tengu_scroll_arrows_detected'",
    "internal_eventEmitter.on('arrow-burst'",
    "internal_eventEmitter.off('arrow-burst'",
    "key: 'scroll-as-arrows'",
    "text: 'Scroll wheel is sending arrow keys · run /terminal-setup to fix'",
    "const AUTO_COPY_CONFIG_HINT_KEY = 'auto-copy-config-hint'",
    "msg += ' · disable auto-copy in /config'",
    'getSessionsSinceLastShown(AUTO_COPY_CONFIG_HINT_KEY) >= AUTO_COPY_CONFIG_HINT_INTERVAL',
    'selectionDelete.tryDelete(state)',
    'useCopyOnSelect(selection, handlerIsActive, text => showCopiedToast(text, true))',
  ]) assert.ok(scroll.includes(fragment), fragment)
  assert.ok(
    scroll.indexOf('selectionDelete.tryDelete(state)') <
      scroll.indexOf('if (shouldClearSelectionOnKey(key_0))'),
  )
})

test('source context dispatch and PromptInput coordinate conversion execute', sourceOptions, async () => {
  const ts = await loadTypeScript()
  const contextJavaScript = ts.transpileModule(
    source('context/selectionDelete.tsx'),
    {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  let providedValue
  const contextObject = {
    Provider: Symbol('SelectionDeleteProvider'),
    defaultValue: undefined,
  }
  const react = {
    createContext(defaultValue) {
      contextObject.defaultValue = defaultValue
      return contextObject
    },
    createElement(type, props, ...children) {
      if (type === contextObject.Provider) providedValue = props.value
      return children[0]
    },
    useContext(value) {
      return value.defaultValue
    },
    useRef(initialValue) {
      return { current: initialValue }
    },
  }
  const contextModule = { exports: {} }
  new Function('exports', 'module', 'require', contextJavaScript)(
    contextModule.exports,
    contextModule,
    specifier => {
      if (specifier === 'react') return { __esModule: true, default: react, ...react }
      throw new Error(`unexpected selectionDelete import: ${specifier}`)
    },
  )
  contextModule.exports.SelectionDeleteProvider({ children: 'prompt' })
  assert.equal(providedValue.tryDelete({}), false)
  const selectedState = { id: 'selected' }
  providedValue.setHandler(value => value === selectedState)
  assert.equal(providedValue.tryDelete(selectedState), true)
  assert.equal(providedValue.tryDelete({}), false)
  providedValue.setHandler(null)
  assert.equal(providedValue.tryDelete(selectedState), false)

  const promptFunction = extractFunction(
    source('components/PromptInput/PromptInput.tsx'),
    'getPromptSelectionOffsets',
    ts,
  )
  const promptJavaScript = await transpileCommonJs(`export ${promptFunction}`)
  const promptModule = { exports: {} }
  const measuredPositions = []
  const Cursor = {
    fromText(input, columns, cursorOffset) {
      assert.equal(input, 'x'.repeat(80))
      assert.equal(columns, 20)
      assert.equal(cursorOffset, 9)
      return {
        getViewportStartLine(maxVisibleLines) {
          assert.equal(maxVisibleLines, 3)
          return 2
        },
        measuredText: {
          getOffsetFromPosition(position) {
            measuredPositions.push(position)
            return position.line * 10 + position.column
          },
        },
      }
    },
  }
  const selectionBounds = selection => ({
    start: selection.focus,
    end: selection.anchor,
  })
  new Function(
    'exports',
    'module',
    'selectionBounds',
    'Cursor',
    promptJavaScript,
  )(
    promptModule.exports,
    promptModule,
    selectionBounds,
    Cursor,
  )
  assert.deepEqual(
    promptModule.exports.getPromptSelectionOffsets(
      {
        anchor: { row: 8, col: 8 },
        focus: { row: 7, col: 6 },
      },
      { x: 5, y: 7, width: 20, height: 3 },
      'x'.repeat(80),
      20,
      9,
      3,
    ),
    { start: 21, end: 34 },
  )
  assert.deepEqual(measuredPositions, [
    { line: 2, column: 1 },
    { line: 3, column: 4 },
  ])
  assert.equal(
    promptModule.exports.getPromptSelectionOffsets(
      {
        anchor: { row: 10, col: 8 },
        focus: { row: 7, col: 6 },
      },
      { x: 5, y: 7, width: 20, height: 3 },
      'x'.repeat(80),
      20,
      9,
      3,
    ),
    null,
  )
})

test('the target arrow-scroll notification source executes exactly', sourceOptions, async () => {
  const owner = source('components/ScrollKeybindingHandler.tsx')
  const ts = await loadTypeScript()
  const functionSource = extractFunction(owner, 'showArrowScrollHint', ts)
  const javascript = await transpileCommonJs(`export ${functionSource}`)
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  const notifications = []
  module.exports.showArrowScrollHint(value => notifications.push(value))
  assert.deepEqual(notifications, [
    {
      key: 'scroll-as-arrows',
      priority: 'immediate',
      text: 'Scroll wheel is sending arrow keys · run /terminal-setup to fix',
      color: 'warning',
      timeoutMs: 12_000,
    },
  ])
})
