import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const units = new Map([
  [18062, ['FunctionDeclaration', 12598641, 12598665, 'e535b5617218667332f41dc6c34496439c5c75ddea786afdbce292c50008e4b7']],
  [18063, ['FunctionDeclaration', 12598665, 12598730, '8e94ed6d29bd41c6c40c038cce2636978a4f35785bb6874be981751efaa93f23']],
  [18064, ['FunctionDeclaration', 12598730, 12598861, '4e11026fc884faec154a85f13a52ad588f259b9b310e5db14f31c8279dcb63b9']],
  [18065, ['FunctionDeclaration', 12598861, 12598885, '72d33084bef227a3066b459d2a1ec29d5f74fd56011bd117759e7040bb0c787f']],
  [18067, ['FunctionDeclaration', 12599149, 12601580, '6f2c6ce756bcfb1b79cd92271299a03dd9f5b3772aeae27bdb2fed03bbde459d']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source() {
  return fs.readFileSync(
    path.join(sourceRoot, 'components/FeedbackSurvey/useMemorySurvey.tsx'),
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

async function executeJudge(contents, classification, random) {
  const judgeFlag = 'const MEMORY_SURVEY_JUDGE_ENABLED = false;'
  assert.equal(occurrences(contents, judgeFlag), 1)
  const enabledContents = contents.replace(
    judgeFlag,
    'const MEMORY_SURVEY_JUDGE_ENABLED = true;',
  )
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(enabledContents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const effects = []
  const stateWrites = []
  const events = []
  let surveyOptions
  let openCount = 0
  const React = {
    useCallback: callback => callback,
    useEffect: effect => effects.push(effect),
    useMemo: factory => factory(),
    useRef: initial => ({ current: initial }),
    useState: initial => [initial, value => stateWrites.push(value)],
  }
  const evaluation = {
    classification,
    evidence_type: 'explicit_memory_reference',
    memory_impact_summary: 'memory changed the answer',
  }
  const assistant = {
    type: 'assistant',
    uuid: 'assistant-1',
    message: {
      content: [
        { type: 'text', text: 'I used your memory.' },
        {
          type: 'tool_use',
          name: 'Read',
          input: { file_path: '/managed/MEMORY.md' },
        },
      ],
    },
  }
  const noop = () => undefined
  const fallback = new Proxy({}, { get: () => noop })
  const require = id => {
    if (id === 'react') return React
    if (id.endsWith('/analytics/config.js')) {
      return { isFeedbackSurveyDisabled: () => false }
    }
    if (id.endsWith('/analytics/growthbook.js')) {
      return {
        getFeatureValue_CACHED_MAY_BE_STALE: (key, fallbackValue) =>
          key === 'tengu_velvet_moth' ? fallbackValue : true,
      }
    }
    if (id.endsWith('/analytics/index.js')) {
      return { logEvent: (name, metadata) => events.push([name, metadata]) }
    }
    if (id.endsWith('/memdir/paths.js')) {
      return { isAutoMemoryEnabled: () => true }
    }
    if (id.endsWith('/policyLimits/index.js')) {
      return { isPolicyAllowed: () => true }
    }
    if (id.endsWith('/FileReadTool/prompt.js')) {
      return { FILE_READ_TOOL_NAME: 'Read' }
    }
    if (id.endsWith('/utils/config.js')) {
      return { getGlobalConfig: () => ({}), saveGlobalConfig: noop }
    }
    if (id.endsWith('/utils/envUtils.js')) {
      return { isEnvTruthy: () => false }
    }
    if (id.endsWith('/utils/memoryFileDetection.js')) {
      return { isAutoManagedMemoryFile: () => true }
    }
    if (id.endsWith('/utils/messages.js')) {
      return {
        extractTextContent: () => 'I used your memory.',
        getLastAssistantMessage: () => assistant,
      }
    }
    if (id.endsWith('/telemetry/events.js')) {
      return { logOTelEvent: noop }
    }
    if (id.endsWith('/submitTranscriptShare.js')) {
      return { submitTranscriptShare: async () => ({ success: true }) }
    }
    if (id.endsWith('/useSurveyState.js')) {
      return {
        useSurveyState: options => {
          surveyOptions = options
          return {
            state: 'closed',
            lastResponse: null,
            open: () => {
              openCount++
              surveyOptions.onOpen('appearance-1')
            },
            handleSelect: noop,
            handleUndo: noop,
            handleTranscriptSelect: noop,
          }
        },
      }
    }
    if (id.endsWith('/state/AppState.js')) {
      return {
        useAppState: selector =>
          selector({
            lastMemoryEvaluation: {
              assistantUuid: assistant.uuid,
              evaluation,
            },
          }),
      }
    }
    return fallback
  }
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'process', javascript)(
    require,
    module.exports,
    module,
    process,
  )
  const result = module.exports.useMemorySurvey([assistant], false)
  assert.equal(effects.length, 2)
  const originalRandom = Math.random
  Math.random = () => random
  try {
    for (const effect of effects) effect()
  } finally {
    Math.random = originalRandom
  }
  return { events, evaluation, openCount, result, stateWrites }
}

test(
  'authenticated target105 pins the memory judge hook and its same-owner helpers',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const artifacts = [
      [baselinePath, 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39', [0, 0, 0, 0]],
      [targetPath, '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75', [1, 2, 2, 1]],
      [latestPath, 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a', [1, 2, 2, 1]],
    ]
    const contents = artifacts.map(([filename, hash, counts]) => {
      const bytes = fs.readFileSync(filename)
      assert.equal(sha256(bytes), hash)
      const text = bytes.toString('utf8')
      const fragments = [
        'lastMemoryEvaluation',
        'judge_classification',
        'judge_evidence_type',
        'classification!=="harmed"',
      ]
      for (let index = 0; index < fragments.length; index++) {
        assert.equal(occurrences(text, fragments[index]), counts[index])
      }
      return text
    })

    const target = contents[1]
    for (const [index, [nodeType, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.equal(region.target.index, index, `${index}: target index`)
      assert.equal(region.target.nodeType, nodeType, `${index}: node type`)
      assert.equal(region.target.parseStatus, 'parsed', `${index}: parse`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    const hook = target.slice(12599149, 12601580)
    for (const fragment of [
      'lastMemoryEvaluation',
      'judge_classification',
      'judge_evidence_type',
      'assistantUuid!==V.uuid',
      'classification!=="harmed"',
      'evaluation:$',
    ]) assert.ok(hook.includes(fragment), fragment)
    assert.ok(
      hook.indexOf('if(!z||H_5()||!j_5())') <
        hook.indexOf('if(!z||!H_5()||!j_5())'),
      'target105 keeps fallback before judged evaluation',
    )
    assert.equal(contents[0].includes('tengu_velvet_moth'), false)
    assert.equal(target.includes('tengu_velvet_moth'), false)
    assert.ok(contents[2].includes('tengu_velvet_moth'))
    assert.equal(target.includes('otherSurveyActive'), false)
    assert.ok(contents[2].includes('otherSurveyActive'))
  },
)

test(
  'source root owns target105 judge semantics or the preserved target116 evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const contents = source()
    for (const fragment of [
      'type MemorySurveyEvaluation',
      'lastMemoryEvaluation',
      'judge_classification',
      'judge_evidence_type',
      "classification === 'helped'",
      "classification === 'harmed'",
      "classification === 'neutral'",
      "nextEvaluation.classification !== 'harmed'",
      'evaluationRef.current = nextEvaluation',
      'setEvaluation(nextEvaluation)',
      'evaluation,',
    ]) assert.ok(contents.includes(fragment), fragment)
    assert.equal(occurrences(contents, 'judge_classification:'), 2)
    assert.equal(occurrences(contents, 'judge_evidence_type:'), 2)

    const fallbackGate =
      '!enabled || MEMORY_SURVEY_JUDGE_ENABLED || !isMemorySurveyEligible()'
    const judgeGate =
      '!enabled || !MEMORY_SURVEY_JUDGE_ENABLED || !isMemorySurveyEligible()'
    assert.ok(contents.includes(fallbackGate))
    assert.ok(contents.includes(judgeGate))
    const target105Mode = !contents.includes('MEMORY_SURVEY_PROBABILITY_GATE')
    if (target105Mode) {
      assert.ok(contents.includes('const SURVEY_PROBABILITY = 0.2'))
      assert.ok(contents.indexOf(fallbackGate) < contents.indexOf(judgeGate))
      assert.equal(contents.includes('otherSurveyActive'), false)
      assert.equal(contents.includes('handleUndo'), false)
      assert.equal(contents.includes("'pending'"), false)
      assert.equal(contents.includes('getMemorySurveyProbability'), false)
    } else {
      assert.ok(contents.includes("const MEMORY_SURVEY_PROBABILITY_GATE = 'tengu_velvet_moth'"))
      assert.ok(contents.includes('getMemorySurveyProbability()'))
      assert.ok(contents.indexOf(judgeGate) < contents.indexOf(fallbackGate))
      assert.ok(contents.includes('otherSurveyActive'))
      assert.ok(contents.includes('handleUndo'))
      assert.ok(contents.includes("'pending'"))
    }
  },
)

test(
  'executable judge bypasses sampling for harm and annotates telemetry in both modes',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const contents = source()
    const harmed = await executeJudge(contents, 'harmed', 0.999)
    assert.equal(harmed.openCount, 1)
    assert.deepEqual(harmed.stateWrites, [harmed.evaluation])
    assert.equal(harmed.result.evaluation, null)
    const appeared = harmed.events.find(([, metadata]) => metadata.event_type === 'appeared')
    assert.ok(appeared)
    assert.equal(appeared[0], 'tengu_memory_survey_event')
    assert.equal(appeared[1].judge_classification, 'harmed')
    assert.equal(appeared[1].judge_evidence_type, 'explicit_memory_reference')

    const sampledOut = await executeJudge(contents, 'helped', 0.999)
    assert.equal(sampledOut.openCount, 0)
    assert.deepEqual(sampledOut.stateWrites, [])

    const sampledIn = await executeJudge(contents, 'helped', 0.1)
    assert.equal(sampledIn.openCount, 1)
    assert.deepEqual(sampledIn.stateWrites, [sampledIn.evaluation])

    const invalid = await executeJudge(contents, 'unknown', 0)
    assert.equal(invalid.openCount, 0)
    assert.deepEqual(invalid.stateWrites, [])
  },
)
