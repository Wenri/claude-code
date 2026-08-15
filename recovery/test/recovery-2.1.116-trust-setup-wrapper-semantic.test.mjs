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

const trustUnits = {
  baseline: [
    19827,
    12_105_410,
    12_109_104,
    '7141ca6e25c0e330e241b5b9698ffe8d7d7090eb2c2d34523e17eac7caffedb0',
  ],
  target: [
    20099,
    12_205_378,
    12_209_063,
    '8122427fa70f33d9f301dce0ce10795334c9ffe8fdd1b4f955cd9071a5c05d4c',
  ],
}
const headlessUnits = {
  baseline: [
    20294,
    12_800_398,
    12_806_769,
    'ee1bedabeea2e113fbaa8d5307d3b71907e668957fcf57437b340a452eb97331',
  ],
  target: [
    20580,
    12_909_210,
    12_915_603,
    '402d9f29e0fecc4bc2f056bfb51164040f4f04ff7b76078893685557fdec398a',
  ],
}
const setupDispatchUnit = [
  20024,
  12_167_564,
  12_167_812,
  '08da5eba150338c9f80ad082b042e64c460cef65c0f915e5b381b5a4dcfb9812',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

function pinUnresolvedUnit(bundle, side, pin) {
  const [index, start, end, sourceHash] = pin
  const region =
    side === 'target'
      ? structural.regions[index]?.target
      : structural.unmatchedBaseline.find(item => item.index === index)
  assert.deepEqual(
    [region?.index, region?.start, region?.end, region?.nodeType, region?.sourceHash],
    [index, start, end, 'FunctionDeclaration', sourceHash],
  )
  const bytes = bundle.subarray(start, end)
  assert.equal(sha256(bytes), sourceHash)
  return bytes.toString('utf8')
}

function compileTrustDialog(pending) {
  const relativePath = 'components/TrustDialog/TrustDialog.tsx'
  const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
  const ts = loadTypeScript()
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const declarations = []
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      (statement.name?.text === 'TrustDialog' ||
        statement.name?.text.startsWith('_temp'))
    ) {
      declarations.push(statement.getText(sourceFile))
    }
  }
  assert.equal(declarations.length, 8, 'TrustDialog and seven compiler helpers')
  const javascript = ts.transpileModule(
    `${declarations.join('\n')}\nexports.TrustDialog = TrustDialog`,
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
  const React = {
    createElement: element,
    Fragment: Symbol('Fragment'),
    useEffect() {},
  }
  const types = {
    Text: function Text() {},
    Link: function Link() {},
    Select: function Select() {},
    PermissionDialog: function PermissionDialog() {},
    Box: function Box() {},
    Byline: function Byline() {},
    KeyboardShortcutHint: function KeyboardShortcutHint() {},
  }
  const bindings = {
    React,
    _c: size => Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
    getMcpConfigsByScope: () => ({ servers: {} }),
    getHooksSources: () => [],
    getBashPermissionSources: () => [],
    getApiKeyHelperSources: () => [],
    getAwsCommandsSources: () => [],
    getGcpCommandsSources: () => [],
    getOtelHeadersHelperSources: () => [],
    getDangerousEnvVarsSources: () => [],
    checkHasTrustDialogAccepted: () => false,
    homedir: () => '/home/test',
    getCwd: () => '/work',
    logEvent() {},
    setSessionTrustAccepted() {},
    saveCurrentProjectConfig() {},
    gracefulShutdownSync() {},
    useExitOnCtrlCDWithKeybindings: () => ({ pending, keyName: 'Ctrl-C' }),
    useKeybinding() {},
    getFsImplementation: () => ({ cwd: () => '/work' }),
    BASH_TOOL_NAME: 'Bash',
    ...types,
  }
  const exports = {}
  Function(...Object.keys(bindings), 'exports', javascript)(
    ...Object.values(bindings),
    exports,
  )
  return {
    tree: exports.TrustDialog({ onDone() {}, commands: [] }),
    types,
  }
}

function collectElements(value, results = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectElements(item, results)
  } else if (value && typeof value === 'object') {
    if ('type' in value && 'props' in value) {
      results.push(value)
      collectElements(value.props.children, results)
    }
  }
  return results
}

test('target116 pins the trust footer and setup-wrapper residues', bundleOptions, () => {
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

  const baselineTrust = pinUnresolvedUnit(
    baseline,
    'baseline',
    trustUnits.baseline,
  )
  const targetTrust = pinUnresolvedUnit(target, 'target', trustUnits.target)
  const baselineHeadless = pinUnresolvedUnit(
    baseline,
    'baseline',
    headlessUnits.baseline,
  )
  const targetHeadless = pinUnresolvedUnit(
    target,
    'target',
    headlessUnits.target,
  )

  for (const trustOwner of [baselineTrust, targetTrust]) {
    assert.match(trustOwner, /chord:"enter",action:"confirm"/)
    assert.match(trustOwner, /chord:"escape",action:"cancel"/)
  }
  for (const headlessOwner of [baselineHeadless, targetHeadless]) {
    assert.match(
      headlessOwner,
      /kind:"setup",trigger:[A-Za-z_$][\w$]*\.setupTrigger/,
    )
  }

  const [dispatchIndex, dispatchStart, dispatchEnd, dispatchHash] =
    setupDispatchUnit
  const dispatchRegion = structural.regions[dispatchIndex]
  assert.deepEqual(
    [
      dispatchRegion?.classification,
      dispatchRegion?.baselineUnitIndex,
      dispatchRegion?.target.start,
      dispatchRegion?.target.end,
      dispatchRegion?.target.nodeType,
      dispatchRegion?.target.sourceHash,
    ],
    [
      'matched',
      19752,
      dispatchStart,
      dispatchEnd,
      'FunctionDeclaration',
      dispatchHash,
    ],
  )
  const dispatchSource = target.subarray(dispatchStart, dispatchEnd).toString('utf8')
  assert.equal(sha256(dispatchSource), dispatchHash)

  const calls = []
  const dispatchSetup = Function(
    'uI',
    'MyK',
    `${dispatchSource}; return k$H`,
  )(
    () => assert.fail('setup dispatch must not call the session-start hook'),
    (...args) => calls.push(args),
  )
  dispatchSetup({ kind: 'setup', trigger: 'maintenance' })
  assert.deepEqual(calls, [['maintenance', { forceSyncExecution: undefined }]])
})

test('source renders configurable trust shortcuts and preserves direct setup dispatch', sourceOptions, () => {
  const { tree, types } = compileTrustDialog(false)
  const elements = collectElements(tree)
  const bylines = elements.filter(element => element.type === types.Byline)
  assert.equal(bylines.length, 1)
  assert.deepEqual(
    elements
      .filter(element => element.type === types.KeyboardShortcutHint)
      .map(element => [element.props.chord, element.props.action]),
    [
      ['enter', 'confirm'],
      ['escape', 'cancel'],
    ],
  )

  const pending = compileTrustDialog(true)
  assert.equal(
    collectElements(pending.tree).filter(
      element => element.type === pending.types.KeyboardShortcutHint,
    ).length,
    0,
  )

  const printSource = fs.readFileSync(path.join(sourceRoot, 'cli/print.ts'), 'utf8')
  const ts = loadTypeScript()
  const sourceFile = ts.createSourceFile(
    'cli/print.ts',
    printSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  let setupCall
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'processSetupHooks'
    ) {
      setupCall = node
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(setupCall, 'cli/print.ts: processSetupHooks call')
  assert.equal(setupCall.arguments.length, 1)
  assert.equal(setupCall.arguments[0].getText(sourceFile), 'options.setupTrigger')

  const directCalls = []
  const runDirect = Function(
    'processSetupHooks',
    'options',
    'return options.setupTrigger ? processSetupHooks(options.setupTrigger) : undefined',
  )
  runDirect((...args) => directCalls.push(args), { setupTrigger: 'maintenance' })
  assert.deepEqual(directCalls, [['maintenance']])
})
