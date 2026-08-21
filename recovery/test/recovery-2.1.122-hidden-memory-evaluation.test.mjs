import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    judgeCount: 2,
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    judgeCount: 1,
  },
]

function readBundle(release) {
  const filename = release.envNames
    .map(name => process.env[name])
    .find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function source(relativePath) {
  return compact(fs.readFileSync(path.join(repo, relativePath), 'utf8'))
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(compact(fragment)), `missing ${fragment}`)
  }
}

test('authenticates the retained evaluation survey and target shared logger', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [fragment, count] of [
      ['lastMemoryEvaluation', 1],
      ['memory_impact_summary', 3],
      ['Did this help? (optional)', 1],
      ['not_sure', 2],
      ['judge_classification', release.judgeCount],
      ['judge_evidence_type', release.judgeCount],
    ]) {
      assert.equal(
        occurrences(bundle, fragment),
        count,
        `${release.version}: ${fragment}`,
      )
    }
    assert.match(
      bundle,
      /lastMemoryEvaluation\).*?assistantUuid!==.*?\.uuid.*?evaluation.*?classification!=="harmed"/,
      `${release.version}: retained evaluation branch`,
    )
    assert.match(
      bundle,
      /\("pending"\),[A-Za-z_$][\w$]*\.current=setTimeout\([A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*\)/,
      `${release.version}: delayed response commit`,
    )
  }

  const target = readBundle(releases[1])
  for (const fragment of [
    'event_type:R,appearance_id:C,response:F,judge_classification:x?.classification,judge_evidence_type:x?.evidence_type',
    'w("appeared",R)',
    'w("timeout",R)',
    'w("responded",R,C)',
    'messageBold:!1,mountDelayMs:z,showNotSure:!0',
    'case"memory":{let w=_.evaluation??void 0',
    'memoryEvaluation:w,showNotSure:!0',
  ]) {
    assert.equal(occurrences(target, fragment), 1, fragment)
  }
})

test('source retains injectable AppState evaluation and exact survey branch', () => {
  const appState = source('src/state/AppStateStore.ts')
  includesAll(appState, [
    'export type MemoryEvaluation = {',
    "classification: 'helped' | 'harmed' | 'neutral' | string",
    'evidence_type?: string',
    'memory_impact_summary?: string | null',
    'export type LastMemoryEvaluation = {',
    'assistantUuid: string',
    'evaluation: MemoryEvaluation',
    'lastMemoryEvaluation?: LastMemoryEvaluation | null',
  ])

  const survey = source(
    'src/components/FeedbackSurvey/useMemorySurvey.tsx',
  )
  includesAll(survey, [
    'const lastMemoryEvaluation = useAppState(state_0 => state_0.lastMemoryEvaluation)',
    'const [evaluation, setEvaluation] = useState<MemoryEvaluation | null>(null)',
    'const evaluationRef = useRef<MemoryEvaluation | null>(null)',
    'const currentEvaluation = evaluationRef.current',
    'event_type: eventType',
    'response: response',
    'judge_classification: currentEvaluation?.classification',
    'judge_evidence_type: currentEvaluation?.evidence_type',
    "logSurveyEvent('appeared', appearanceId)",
    "logSurveyEvent('timeout', appearanceId_0)",
    "logSurveyEvent('responded', appearanceId_0, selected)",
    'if (lastMemoryEvaluation.assistantUuid !== lastAssistant.uuid)',
    'const nextEvaluation = lastMemoryEvaluation.evaluation',
    'if (!isValidMemoryClassification(nextEvaluation.classification))',
    "if (nextEvaluation.classification !== 'harmed' && !shouldForceMemorySurvey()",
    'evaluationRef.current = nextEvaluation',
    'setEvaluation(nextEvaluation)',
    'evaluation, handleSelect, handleUndo, handleTranscriptSelect',
  ])
})

test('source restores evaluation UI, optional response, and undo timing', () => {
  const view = source(
    'src/components/FeedbackSurvey/MemoryEvaluationSurveyView.tsx',
  )
  includesAll(view, [
    'evaluation.memory_impact_summary?.trim()',
    'truncateToLines(rawSummary, MAX_SUMMARY_LINES)',
    "const FOLLOW_UP_MESSAGE = 'Did this help? (optional)'",
    'messageBold={false}',
    'showNotSure={true}',
  ])

  const digitInput = source(
    'src/components/FeedbackSurvey/useDebouncedDigitInput.ts',
  )
  includesAll(digitInput, [
    'const DEFAULT_DEBOUNCE_MS = 400',
    'const DEFAULT_MOUNT_DELAY_MS = 600',
    'inputValue !== initialInputValue.current && inputValue.length === 1',
    "inputValue.normalize('NFKC')",
    "callbacksRef.current.setInputValue('')",
  ])

  const surveyState = source(
    'src/components/FeedbackSurvey/useSurveyState.tsx',
  )
  includesAll(surveyState, [
    'const RESPONSE_COMMIT_DELAY_MS = 3000',
    "setState('pending')",
    'responseCommitTimeout.current = setTimeout(commitResponse, RESPONSE_COMMIT_DELAY_MS, selected)',
    'clearTimeout(responseCommitTimeout.current)',
    'lastResponseRef.current = null',
    "setState('open')",
    'handleUndo',
  ])

  const feedback = source(
    'src/components/FeedbackSurvey/FeedbackSurvey.tsx',
  )
  includesAll(feedback, [
    "if (state === 'pending')",
    '<FeedbackSurveyPending lastResponse={lastResponse} onUndo={handleUndo} />',
    "not_sure: 'Unsure'",
    'if (key.escape)',
    '<KeyboardShortcutHint shortcut="Esc" action="undo" />',
    'mountDelayMs: 0',
  ])

  const repl = source('src/screens/REPL.tsx')
  includesAll(repl, [
    'handleUndo={postCompactSurvey.handleUndo}',
    'handleUndo={memorySurvey.handleUndo}',
    'memoryEvaluation={memorySurvey.evaluation ?? undefined}',
    'showNotSure={true}',
    'handleUndo={feedbackSurvey.handleUndo}',
  ])
})
