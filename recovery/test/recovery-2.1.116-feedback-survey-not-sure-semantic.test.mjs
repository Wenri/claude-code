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
      ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
      : false,
}

const baselineUnits = [
  {
    role: 'view',
    index: 19_417,
    start: 11_870_794,
    end: 11_872_154,
    hash: 'b9ea89ec8d1313db6b616019d3da01f9ad66b4a254d70972e723734ad3660bf6',
  },
  {
    role: 'view declarations and validator',
    index: 19_418,
    start: 11_872_154,
    end: 11_872_260,
    hash: '2c5001533dffb84473192f44fbe1bbb0a41c654913ee02f085e1c8f98d26fd63',
  },
  {
    role: 'response map and options',
    index: 19_419,
    start: 11_872_260,
    end: 11_872_491,
    hash: 'e9d3f5510ea795a224ab4befb16c3376982c6e9da1020b211abdd9b3f34d19f6',
  },
  {
    role: 'memory survey view',
    index: 19_420,
    start: 11_872_491,
    end: 11_873_166,
    hash: 'd1d6a26706e816a5e6debcfe17caf6257847ab1ecf4e7226f1557f90d05bdf71',
  },
  {
    role: 'survey wrapper',
    index: 19_428,
    start: 11_875_114,
    end: 11_876_846,
    hash: 'a31e238cf45c821a36b1b5665371a1c722f6bf4dab8f6ebc99fb64adbe7885e1',
  },
  {
    role: 'pending response labels',
    index: 19_432,
    start: 11_878_594,
    end: 11_878_717,
    hash: '71e7c9416cbd06e92ffa69d2b0549f8ac933299ea0a3e8d356a9ef0a80acaa9b',
  },
  {
    role: 'REPL survey caller',
    index: 19_434,
    start: 11_878_921,
    end: 11_881_257,
    hash: '8d0d124279dcecd272b2f2ca50134a80b8cd485615579c7fb819613640006d7b',
  },
]

const targetUnits = [
  {
    role: 'gated response validator',
    index: 19_673,
    start: 11_961_601,
    end: 11_961_684,
    hash: '83e3c6c0659d5fa39db24bffa1b986ffb611e8baed173e51085f242697f9ef29',
  },
  {
    role: 'view',
    index: 19_674,
    start: 11_961_684,
    end: 11_963_238,
    hash: '01cd753a0e9568c2202fbc905b266ecc0165b5cf242c1e6f68bb36c1c4eb304d',
  },
  {
    role: 'view declarations',
    index: 19_675,
    start: 11_963_238,
    end: 11_963_330,
    hash: '79e22b107902e5a31ff062860d413074b90518f6f482c85d5aefe57fc2ec8816',
  },
  {
    role: 'response map and options',
    index: 19_676,
    start: 11_963_330,
    end: 11_963_589,
    hash: '9501fe6ce5f44f92bd452ae66ac28536a3529f6f6dc16003c077698a7cc07fe9',
  },
  {
    role: 'memory survey view',
    index: 19_677,
    start: 11_963_589,
    end: 11_964_279,
    hash: '73ffdca5129182da20b8585684ae97aa42f61342714cbbafc6db68b6c62e44ad',
  },
  {
    role: 'survey wrapper',
    index: 19_685,
    start: 11_966_153,
    end: 11_967_952,
    hash: '1d416622ef6bea489490d1aa6f6a7fae4dd0fceef87a1808569b033b1f57d67d',
  },
  {
    role: 'pending response labels',
    index: 19_689,
    start: 11_969_680,
    end: 11_969_828,
    hash: 'dcf4066e6b262facfe9ba369e1d29471f523385e74073cc0c2b4c20842b0a18f',
  },
  {
    role: 'REPL survey caller',
    index: 19_691,
    start: 11_970_032,
    end: 11_972_383,
    hash: 'af3b94a778ae609911996f5408cc3e8d31ef587153dc7e7e5b2b3ade6913b2db',
  },
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  const contents = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
  return contents.split('\n//# sourceMappingURL=')[0]
}

function unitSource(bundle, unit) {
  const bytes = bundle.subarray(unit.start, unit.end)
  assert.equal(sha256(bytes), unit.hash, `${unit.role}: unit ${unit.index}`)
  return bytes.toString('utf8')
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

function transpileModule(ts, contents, filename) {
  const result = ts.transpileModule(contents, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], `${filename} isolated runtime must compile`)
  const module = { exports: {} }
  new Function('exports', 'module', 'require', result.outputText)(
    module.exports,
    module,
    () => {
      throw new Error(`${filename} isolated runtime must not load modules`)
    },
  )
  return module.exports
}

function statementNamed(ts, file, name) {
  const statement = file.statements.find(candidate => {
    if (
      (ts.isFunctionDeclaration(candidate) ||
        ts.isTypeAliasDeclaration(candidate)) &&
      candidate.name?.text === name
    ) {
      return true
    }
    return (
      ts.isVariableStatement(candidate) &&
      candidate.declarationList.declarations.some(
        declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name,
      )
    )
  })
  assert.ok(statement, `${name} declaration`)
  return statement
}

function selectedStatements(ts, file, contents, names) {
  const statements = [...new Set(names.map(name => statementNamed(ts, file, name)))]
  statements.sort((left, right) => left.pos - right.pos)
  return statements
    .map(statement => contents.slice(statement.getStart(file), statement.end))
    .join('\n')
}

async function compileSurveyRuntime(viewSource, surveySource) {
  const ts = await loadTypeScript()
  const viewFile = ts.createSourceFile(
    'FeedbackSurveyView.tsx',
    viewSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const viewBody = selectedStatements(ts, viewFile, viewSource, [
    'Props',
    'RESPONSE_INPUTS',
    'ResponseInput',
    'inputToResponse',
    'isValidResponseInput',
    'PRIMARY_RESPONSE_OPTIONS',
    'NOT_SURE_RESPONSE_OPTION',
    'DISMISS_RESPONSE_OPTION',
    'DEFAULT_MESSAGE',
    'FeedbackSurveyView',
  ])
  const viewModule = transpileModule(
    ts,
    `
      type FeedbackSurveyResponse =
        | 'dismissed'
        | 'bad'
        | 'fine'
        | 'good'
        | 'not_sure'
      const {
        React,
        _c,
        Box,
        Button,
        Text,
        useDebouncedDigitInput,
      } = globalThis.__surveyDependencies
      ${viewBody}
    `,
    'FeedbackSurveyView.runtime.tsx',
  )
  globalThis.__surveyDependencies.isValidResponseInput =
    viewModule.isValidResponseInput

  const surveyFile = ts.createSourceFile(
    'FeedbackSurvey.tsx',
    surveySource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const surveyBody = selectedStatements(ts, surveyFile, surveySource, [
    'FeedbackSurvey',
    'RESPONSE_LABELS',
    'FeedbackSurveyPending',
    'MemorySurveyView',
  ])
  const surveyModule = transpileModule(
    ts,
    `
      type FeedbackSurveyResponse =
        | 'dismissed'
        | 'bad'
        | 'fine'
        | 'good'
        | 'not_sure'
      const {
        React,
        _c,
        Box,
        Text,
        FeedbackSurveyThanks,
        FeedbackSurveyView,
        isValidResponseInput,
        KeyboardShortcutHint,
        TranscriptSharePrompt,
        truncateToLines,
        useAppState,
        useKeybindingPreDispatch,
      } = globalThis.__surveyDependencies
      ${surveyBody}
      export { FeedbackSurveyPending, MemorySurveyView }
    `,
    'FeedbackSurvey.runtime.tsx',
  )
  return { surveyModule, viewModule }
}

function findElements(value, type, found = []) {
  if (Array.isArray(value)) {
    for (const child of value) findElements(child, type, found)
    return found
  }
  if (!value || typeof value !== 'object') return found
  if (value.type === type) found.push(value)
  findElements(value.children, type, found)
  return found
}

function flattenedText(value) {
  if (Array.isArray(value)) return value.map(flattenedText).join('')
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object') return ''
  return flattenedText(value.children)
}

test(
  'authenticated 114→116 adds the complete gated Not sure survey graph',
  bundleOptions,
  () => {
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
    for (const unit of baselineUnits) {
      assert.equal(
        structural.unmatchedBaseline.some(
          candidate =>
            candidate.index === unit.index &&
            candidate.start === unit.start &&
            candidate.end === unit.end &&
            candidate.sourceHash === unit.hash,
        ),
        true,
        `${unit.role}: baseline unit ${unit.index}`,
      )
    }
    for (const unit of targetUnits) {
      const region = structural.regions[unit.index]
      assert.ok(region, `${unit.role}: target unit ${unit.index}`)
      assert.deepEqual(
        [
          region.classification,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        ['unresolved', unit.start, unit.end, unit.hash],
        `${unit.role}: target unit ${unit.index}`,
      )
    }

    const baselineGraph = baselineUnits
      .map(unit => unitSource(baseline, unit))
      .join('\n')
    assert.doesNotMatch(baselineGraph, /not_sure|Not sure|showNotSure/)

    const targetGraph = new Map(
      targetUnits.map(unit => [unit.index, unitSource(target, unit)]),
    )
    assert.match(
      targetGraph.get(19_673),
      /H==="4"\)return \$;return H==="0"\|\|H==="1"\|\|H==="2"\|\|H==="3"/,
    )
    assert.match(
      targetGraph.get(19_674),
      /showNotSure:Y[\s\S]*?Y===void 0\?!1:Y[\s\S]*?w\?\[\.\.\.A74,xa1,f74\]:\[\.\.\.A74,f74\][\s\S]*?J=w\?ma1:ua1[\s\S]*?o26\(V,w\)/,
    )
    assert.match(targetGraph.get(19_675), /ua1=10,ma1=12/)
    assert.match(
      targetGraph.get(19_676),
      /"4":"not_sure"[\s\S]*?\{key:"4",label:"Not sure"\}/,
    )
    assert.match(targetGraph.get(19_677), /showNotSure:!0/)
    assert.match(
      targetGraph.get(19_685),
      /showNotSure:D[\s\S]*?D===void 0\?!1:D[\s\S]*?o26\(z,j\)[\s\S]*?showNotSure:j/,
    )
    assert.match(
      targetGraph.get(19_689),
      /not_sure:"Not sure"/,
    )
    assert.match(
      targetGraph.get(19_691),
      /memoryEvaluation:w,showNotSure:!0/,
    )
  },
)

test(
  'survey source retains every Not sure propagation edge',
  sourceOptions,
  () => {
    const view = source('components/FeedbackSurvey/FeedbackSurveyView.tsx')
    const survey = source('components/FeedbackSurvey/FeedbackSurvey.tsx')
    const repl = source('screens/REPL.tsx')

    assert.match(view, /showNotSure\?: boolean/)
    assert.match(view, /'4': 'not_sure'/)
    assert.match(
      view,
      /isValidResponseInput = \(input: string, showNotSure = false\)[\s\S]*?input === '4' \? showNotSure/,
    )
    assert.match(
      view,
      /showNotSure \? \[\.\.\.PRIMARY_RESPONSE_OPTIONS, NOT_SURE_RESPONSE_OPTION, DISMISS_RESPONSE_OPTION\] : \[\.\.\.PRIMARY_RESPONSE_OPTIONS, DISMISS_RESPONSE_OPTION\]/,
    )
    assert.match(
      view,
      /NOT_SURE_RESPONSE_OPTION = \{ key: '4', label: 'Not sure' \}/,
    )
    assert.match(view, /responseWidth = showNotSure \? 12 : 10/)
    assert.match(view, /digit => isValidResponseInput\(digit, showNotSure\)/)
    assert.match(view, /digit => onSelect\(inputToResponse\[digit\]\)/)

    assert.match(survey, /showNotSure\?: boolean/)
    assert.match(survey, /showNotSure = false/)
    assert.match(
      survey,
      /inputValue && !isValidResponseInput\(inputValue, showNotSure\)/,
    )
    assert.match(
      survey,
      /<FeedbackSurveyView[\s\S]*?showNotSure=\{showNotSure\}/,
    )
    assert.match(
      survey,
      /function MemorySurveyView[\s\S]*?<FeedbackSurveyView[\s\S]*?showNotSure=\{true\}/,
    )
    assert.match(survey, /not_sure: 'Not sure'/)
    assert.match(
      survey,
      /RESPONSE_LABELS\[lastResponse\] \?\? ''/,
    )

    assert.equal(occurrences(repl, 'showNotSure={true}'), 1)
    assert.match(
      repl,
      /memoryEvaluation=\{memorySurvey\.evaluation \?\? undefined\} showNotSure=\{true\}/,
    )
  },
)

test(
  'survey runtime gates, renders, selects, propagates, and labels Not sure',
  sourceOptions,
  async () => {
    const sentinel = Symbol.for('react.memo_cache_sentinel')
    const Box = Symbol('Box')
    const Button = Symbol('Button')
    const Text = Symbol('Text')
    const FeedbackSurveyView = Symbol('FeedbackSurveyView')
    const FeedbackSurveyThanks = Symbol('FeedbackSurveyThanks')
    const KeyboardShortcutHint = Symbol('KeyboardShortcutHint')
    const TranscriptSharePrompt = Symbol('TranscriptSharePrompt')
    const digitInputs = []
    const keybindings = []
    const dependencies = {
      Box,
      Button,
      FeedbackSurveyThanks,
      FeedbackSurveyView,
      KeyboardShortcutHint,
      React: {
        createElement(type, props, ...children) {
          return { children, props: props ?? {}, type }
        },
      },
      Text,
      TranscriptSharePrompt,
      _c: size => Array.from({ length: size }, () => sentinel),
      isValidResponseInput: undefined,
      truncateToLines: value => value,
      useAppState: selector => selector({ verbose: false }),
      useDebouncedDigitInput: options => digitInputs.push(options),
      useKeybindingPreDispatch: handler => keybindings.push(handler),
    }
    globalThis.__surveyDependencies = dependencies
    try {
      const { surveyModule, viewModule } = await compileSurveyRuntime(
        source('components/FeedbackSurvey/FeedbackSurveyView.tsx'),
        source('components/FeedbackSurvey/FeedbackSurvey.tsx'),
      )
      dependencies.isValidResponseInput = viewModule.isValidResponseInput

      for (const digit of ['0', '1', '2', '3']) {
        assert.equal(viewModule.isValidResponseInput(digit), true)
        assert.equal(viewModule.isValidResponseInput(digit, true), true)
      }
      assert.equal(viewModule.isValidResponseInput('4'), false)
      assert.equal(viewModule.isValidResponseInput('4', false), false)
      assert.equal(viewModule.isValidResponseInput('4', true), true)
      assert.equal(viewModule.isValidResponseInput('5', true), false)

      const baseViewProps = {
        inputValue: '',
        onSelect: () => {},
        setInputValue: () => {},
      }
      const defaultView = viewModule.FeedbackSurveyView(baseViewProps)
      const defaultOptionBoxes = findElements(defaultView, Box).filter(
        element => ['0', '1', '2', '3', '4'].includes(element.props.key),
      )
      assert.deepEqual(
        defaultOptionBoxes.map(element => [element.props.key, element.props.width]),
        [
          ['1', 10],
          ['2', 10],
          ['3', 10],
          ['0', 10],
        ],
      )
      assert.equal(digitInputs.at(-1).isValidDigit('4'), false)

      const selected = []
      const inputUpdates = []
      const enabledView = viewModule.FeedbackSurveyView({
        ...baseViewProps,
        onSelect: value => selected.push(value),
        setInputValue: value => inputUpdates.push(value),
        showNotSure: true,
      })
      const enabledOptionBoxes = findElements(enabledView, Box).filter(
        element => ['0', '1', '2', '3', '4'].includes(element.props.key),
      )
      assert.deepEqual(
        enabledOptionBoxes.map(element => [element.props.key, element.props.width]),
        [
          ['1', 12],
          ['2', 12],
          ['3', 12],
          ['4', 12],
          ['0', 12],
        ],
      )
      const enabledDigitInput = digitInputs.at(-1)
      assert.equal(enabledDigitInput.isValidDigit('4'), true)
      enabledDigitInput.onDigit('4')
      assert.deepEqual(selected, ['not_sure'])

      selected.length = 0
      const notSureButton = findElements(enabledView, Button).find(
        element => element.props.onAction && flattenedText(element.children[0]({ hovered: false })).includes('Not sure'),
      )
      assert.ok(notSureButton, 'Not sure button')
      notSureButton.props.onAction()
      assert.deepEqual(inputUpdates, [''])
      assert.deepEqual(selected, ['not_sure'])

      const baseSurveyProps = {
        handleSelect: () => {},
        handleTranscriptSelect: () => {},
        handleUndo: () => {},
        inputValue: '4',
        lastResponse: null,
        setInputValue: () => {},
        state: 'open',
      }
      assert.equal(surveyModule.FeedbackSurvey(baseSurveyProps), null)
      const enabledSurvey = surveyModule.FeedbackSurvey({
        ...baseSurveyProps,
        showNotSure: true,
      })
      assert.equal(enabledSurvey.type, FeedbackSurveyView)
      assert.equal(enabledSurvey.props.showNotSure, true)

      assert.equal(
        surveyModule.FeedbackSurvey({
          ...baseSurveyProps,
          memoryEvaluation: {},
        }),
        null,
      )
      const memorySurvey = surveyModule.FeedbackSurvey({
        ...baseSurveyProps,
        memoryEvaluation: {},
        showNotSure: true,
      })
      assert.equal(memorySurvey.type, surveyModule.MemorySurveyView)
      const memoryView = surveyModule.MemorySurveyView(memorySurvey.props)
      assert.equal(memoryView.type, FeedbackSurveyView)
      assert.equal(memoryView.props.showNotSure, true)

      let undoCount = 0
      const pending = surveyModule.FeedbackSurveyPending({
        lastResponse: 'not_sure',
        onUndo: () => undoCount++,
      })
      assert.match(flattenedText(pending), /Feedback: Not sure/)
      assert.equal(keybindings.at(-1)('', { escape: true }), true)
      assert.equal(undoCount, 1)
    } finally {
      delete globalThis.__surveyDependencies
    }
  },
)
