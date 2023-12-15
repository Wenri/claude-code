import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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
  [18365, [12517505, 12518776, '5d5730b65a81045fbcbc03a779922eaa2911e36a37b270b182c57a6380a73f73', 'FunctionDeclaration', 'unresolved']],
  [18366, [12518776, 12518792, '09e549901a4e324979d0430d6acadd104eb11e0e828d541f277b5a6c473878da', 'VariableDeclaration', 'unresolved']],
  [18368, [12518823, 12522773, '811c545aa82d0fd694444d7df2b9e11d9112b57830d505a0e8f3da50d7b771a6', 'FunctionDeclaration', 'unresolved']],
  [18376, [12523635, 12526092, '23fa7e9a78f20829ebf870e7b4c707f0b779ddc37a1e7bf5fc90f8511a59c288', 'FunctionDeclaration', 'unresolved']],
  [18380, [12526505, 12527943, 'e4f5f3c752dbf6c37477cfdb2edfb5cef6cd40c69b5b9c82081b68710e731955', 'FunctionDeclaration', 'unresolved']],
  [18398, [12532790, 12534508, '7510f3700a94f0aeeac418143606b424a3b6f8bfb9d3340976167c2b782d2449', 'FunctionDeclaration', 'unresolved']],
  [18399, [12534508, 12535091, 'be415e614be205432b11234b08a68ad208e5cbb230a6730528164c240525f6e9', 'FunctionDeclaration', 'unresolved']],
  [18401, [12536210, 12536238, 'fda9851728e187b370c60e9c0c3366ed33f7e212b36214c07be5680ccc4b6469', 'VariableDeclaration', 'unresolved']],
  [18402, [12536238, 12536353, 'be4face4ec0aed6ca17717ad773dc3f2f5f4398f7a7d258a2d673c7f0ee067d0', 'VariableDeclaration', 'unresolved']],
  [18403, [12536353, 12536557, '913a5f0b393ebd7de27207ba3060252fa3357c79c335f01f720221531e635351', 'FunctionDeclaration', 'matched']],
  [18404, [12536557, 12538889, 'c194ba5a02ae3ec0f7739d1482246a5f3dec00f6b1acb7906c181435e6122317', 'FunctionDeclaration', 'unresolved']],
])

const pairSkip = !selected
  ? `not applicable to ${semanticCase}`
  : !baselineBundlePath || !targetBundlePath
    ? 'CLAUDE_CODE_2_1_109_BUNDLE and CLAUDE_CODE_2_1_110_BUNDLE are required'
    : false
const sourceSkip = selected ? false : `not applicable to ${semanticCase}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target110 authenticates the delayed-submit and undo graph', { skip: pairSkip }, () => {
  if (pairSkip) return
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
  )
  assert.equal(
    sha256(targetBytes),
    'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
  )
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, hash, nodeType, classification]] of units) {
    const region = structural.regions[index]
    assert.equal(region.classification, classification, `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash, region.target.nodeType],
      [start, end, hash, nodeType],
      `${index}: identity`,
    )
    assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
  }

  assert.equal(baseline.split('handleUndo').length - 1, 0)
  assert.ok(target.split('handleUndo').length - 1 >= 20)
  const stateMachine = target.slice(12517505, 12518776)
  assertFragments(
    stateMachine,
    [
      'useRef(null)',
      'useEffect(()=>()=>',
      'clearTimeout',
      '"pending"',
      'setTimeout',
      'handleSelect:',
      'handleUndo:',
      'handleTranscriptSelect:',
    ],
    'survey state machine',
  )
  assert.match(stateMachine, /setTimeout\([\w$]+,[\w$]+,[\w$]+\)/)
  assert.match(stateMachine, /if\([\w$]+\.current\)clearTimeout\([\w$]+\.current\),[\w$]+\.current=null/)

  const pending = target.slice(12534508, 12535091)
  assertFragments(
    pending,
    [
      'stopImmediatePropagation()',
      '"Feedback: "',
      'chord:"escape"',
      'action:"undo"',
    ],
    'pending feedback row',
  )
  const aggregate = target.slice(12536557, 12538889)
  for (const survey of ['postCompact', 'memory', 'feedback', 'frustration']) {
    assert.ok(aggregate.includes(`case"${survey}"`), `aggregate: ${survey}`)
  }
  assert.ok(aggregate.indexOf('case"postCompact"') < aggregate.indexOf('case"memory"'))
  assert.ok(aggregate.indexOf('case"memory"') < aggregate.indexOf('case"feedback"'))
  assert.ok(aggregate.indexOf('case"feedback"') < aggregate.indexOf('case"frustration"'))
})

test('source owns synchronous dismiss, delayed selection, and reachable undo', { skip: sourceSkip }, () => {
  if (sourceSkip) return
  const state = source('components/FeedbackSurvey/useSurveyState.tsx')
  assertFragments(
    state,
    [
      "| 'pending'",
      'const SUBMIT_DELAY_MS = 3000',
      'const pendingSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)',
      'pendingSubmitTimer.current = null',
      "if (selected === 'dismissed')",
      'processSelection(selected)',
      "setState('pending')",
      'pendingSubmitTimer.current = setTimeout(processSelection, SUBMIT_DELAY_MS, selected)',
      'const handleUndo = useCallback(() =>',
      'clearTimeout(pendingSubmitTimer.current)',
      'lastResponseRef.current = null',
      "setState('open')",
      'handleUndo,',
    ],
    'useSurveyState',
  )
  assert.ok(
    state.indexOf("if (selected === 'dismissed')") < state.indexOf("setState('pending')"),
    'dismiss is processed before the delayed path',
  )
  assert.ok(
    state.indexOf('clearTimeout(pendingSubmitTimer.current)', state.indexOf('const handleUndo')) <
      state.indexOf("setState('open')", state.indexOf('const handleUndo')),
    'undo clears the pending timer before reopening',
  )

  for (const relative of [
    'components/FeedbackSurvey/useFeedbackSurvey.tsx',
    'components/FeedbackSurvey/useMemorySurvey.tsx',
  ]) {
    assertFragments(source(relative), ["| 'pending'", 'handleUndo'], relative)
  }
  assertFragments(
    source('components/FeedbackSurvey/usePostCompactSurvey.tsx'),
    ['handleUndo', 'lastResponse', 'state'],
    'components/FeedbackSurvey/usePostCompactSurvey.tsx',
  )

  const component = source('components/FeedbackSurvey/FeedbackSurvey.tsx')
  assertFragments(
    component,
    [
      "if (state === 'pending')",
      '<FeedbackSurveyPending lastResponse={lastResponse} onUndo={handleUndo}',
      'Feedback: <Text color="text">{responseLabel}</Text>',
      '<KeyboardShortcutHint chord="escape" action="undo"',
    ],
    'FeedbackSurvey',
  )
  if (historical) {
    assertFragments(
      component,
      ['useInput((_input, key, event)', 'event.stopImmediatePropagation()'],
      'target110 escape routing',
    )
  } else {
    assertFragments(
      component,
      ['useKeybindingPreDispatch((_input, key)', 'return true'],
      'target116 escape routing',
    )
  }

  const repl = source('screens/REPL.tsx')
  const surveyRender = repl.slice(repl.indexOf("postCompactSurvey.state !== 'closed'"))
  assertFragments(
    surveyRender,
    [
      "postCompactSurvey.state !== 'closed'",
      "memorySurvey.state !== 'closed'",
      "feedbackSurvey.state !== 'closed'",
      "frustrationDetection.state !== 'closed'",
      'handleUndo={postCompactSurvey.handleUndo}',
      'handleUndo={memorySurvey.handleUndo}',
      'handleUndo={feedbackSurvey.handleUndo}',
    ],
    'REPL survey priority and undo wiring',
  )
})
