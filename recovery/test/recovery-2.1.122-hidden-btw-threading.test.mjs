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
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
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

function around(contents, needle, before, after) {
  const index = contents.indexOf(needle)
  assert.ok(index >= 0, `missing authenticated anchor: ${needle}`)
  return contents.slice(Math.max(0, index - before), index + after)
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

test('authenticates retained threaded side-question execution in both releases', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'This is a side question from the user.'),
      1,
      `${release.version}: side-question implementation cardinality`,
    )
    assert.equal(
      occurrences(bundle, 'threadHistory:!1'),
      1,
      `${release.version}: remote history opt-out cardinality`,
    )

    const side = around(
      bundle,
      'This is a side question from the user.',
      1_500,
      4_500,
    )
    const append = side.match(
      /([A-Za-z_$][\w$]*)\.history=\[\.\.\.\1\.history,\{question:[A-Za-z_$][\w$]*,response:[A-Za-z_$][\w$]*\}\]\.slice\(-([A-Za-z_$][\w$]*)\)/,
    )
    assert.ok(append, `${release.version}: capped history append`)
    assert.ok(
      side.includes(`${append[2]}=20`),
      `${release.version}: twenty-entry history cap`,
    )
    assert.match(
      side,
      /history\.flatMap\([^)]*\)=>\[[A-Za-z_$][\w$]*\(\{content:[^}]+\.question\}\),[A-Za-z_$][\w$]*\(\{content:[^}]+\.response\}\)\]\)/,
      `${release.version}: alternating user/assistant history`,
    )
    assert.match(
      side,
      /skipCacheWrite:!0,skipTranscript:!0,overrides:\{abortController:[A-Za-z_$][\w$]*\}/,
      `${release.version}: ephemeral transcript and inherited abort`,
    )
    assert.match(
      side,
      /onMessage:[\s\S]{0,400}retryAttempt:[^,]+,maxRetries:[^,]+,retryInMs:[^,]+,status:[^.]+\.error\.status/,
      `${release.version}: retry callback payload`,
    )
    assert.match(
      side,
      /instanceof [A-Za-z_$][\w$]*\|\|[A-Za-z_$][\w$]*\.signal\.aborted[^}]+response:null,synthetic:!1[^}]+aborted:!0/,
      `${release.version}: abort result`,
    )
    assert.ok(
      side.includes('instead of answering directly. Try rephrasing'),
      `${release.version}: synthetic tool-use response`,
    )
    assert.ok(
      side.includes('response:`(API error: ${'),
      `${release.version}: synthetic API-error response`,
    )
  }
})

test('authenticates retained /btw history, retry, remote, and fork UI', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const ui = around(
      bundle,
      'Forking into a new session\\u2026',
      7_000,
      3_500,
    )

    for (const fragment of [
      'subtype:"side_question",question:',
      'earlier /btw',
      'extraMessages:',
      'action:"clear history"',
      'action:"fork"',
      'action:"dismiss"',
      'Answering\\u2026',
      'retrying in ',
      'Rate limited',
      'API overloaded',
      'Authentication failed',
    ]) {
      assert.ok(ui.includes(fragment), `${release.version}: ${fragment}`)
    }
    assert.match(
      ui,
      /\.key==="x"[\s\S]{0,500}\.current=\[\],[A-Za-z_$][\w$]*\(\[\]\)/,
    )
    assert.match(
      ui,
      /\.key==="f"[\s\S]{0,1500}customTitle:[\s\S]{0,200},extraMessages:/,
    )
    assert.match(
      ui,
      /sendControlRequest\(\{subtype:"side_question",question:[^}]+\}\)[\s\S]{0,800}\.synthetic\?\?!1/,
    )
    assert.match(
      ui,
      /Math\.max\(0,Math\.ceil\(\([^)]*\.retryAt-Date\.now\(\)\)\/1000\)\)/,
    )

    const remote = around(bundle, 'threadHistory:!1', 1_200, 800)
    assert.match(
      remote,
      /threadHistory:!1\}\);[^;]{0,200}\(.*\{response:[^.]+\.response,synthetic:[^.]+\.synthetic\}\)/,
      `${release.version}: remote response preserves classification`,
    )
  }
})

test('authenticates the retained reusable branch-and-resume contract', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'branchAndResume:'),
      2,
      `${release.version}: export plus lazy consumer`,
    )
    const branch = around(bundle, 'branchAndResume:', 500, 6_500)
    assert.ok(branch.includes('extraMessages'), `${release.version}: extra messages`)
    assert.ok(
      branch.includes('tengu_conversation_forked'),
      `${release.version}: fork telemetry`,
    )
    assert.ok(
      branch.includes('You are now in the branch. Use /resume '),
      `${release.version}: live resume message`,
    )
    assert.ok(
      branch.includes('Failed to branch conversation:'),
      `${release.version}: bounded failure path`,
    )
  }
})

test('source implements the authenticated side-question state machine', () => {
  const contents = source('src/utils/sideQuestion.ts')
  includesAll(contents, [
    'const MAX_SIDE_QUESTION_HISTORY = 20',
    'return sideQuestionState.history',
    'sideQuestionState.history = []',
    'sideQuestionState.history = history',
    '].slice(-MAX_SIDE_QUESTION_HISTORY)',
    'threadHistory = true',
    'createChildAbortController(parentController)',
    'sideQuestionState.history.flatMap(entry => [ createUserMessage({ content: entry.question }), createAssistantMessage({ content: entry.response }), ])',
    'skipTranscript: true',
    'overrides: { abortController }',
    'retryAttempt: message.retryAttempt',
    'status: message.error.status',
    'if (threadHistory && response && !synthetic)',
    'error instanceof APIUserAbortError || abortController.signal.aborted',
    'usage: EMPTY_USAGE',
    'aborted: true',
    'return { response: text, synthetic: false }',
    'synthetic: true',
    'return { response: null, synthetic: false }',
  ])
})

test('source implements authenticated /btw UI and branch reuse', () => {
  const btw = source('src/commands/btw/btw.tsx')
  includesAll(btw, [
    'useState(() => getSideQuestionHistory())',
    "event.key === 'x' && historyRef.current.length > 0",
    'response && !synthetic ? [{ question, response }] : []',
    "event.key === 'f' && response && !synthetic && !remote",
    "import('../branch/branch.js')",
    'branchAndResume(context, onDone, { customTitle: truncateSummary(`btw: ${question}`, 80), extraMessages, })',
    "subtype: 'side_question'",
    'parentController, onRetry:',
    'if (activeRemote && !result.synthetic)',
    'appendSideQuestionHistory(question, result.response)',
    'history.slice(-VISIBLE_HISTORY_ENTRIES)',
    'const VISIBLE_HISTORY_ENTRIES = 5',
    'rows - CHROME_ROWS - OUTER_CHROME_ROWS - historyRows',
    'Forking into a new session…',
    'Answering…',
    "action=\"clear history\"",
    'Math.ceil((retry.retryAt - Date.now()) / 1000)',
    "return 'Rate limited'",
    "return 'API overloaded'",
    "return 'Authentication failed'",
  ])

  const branch = source('src/commands/branch/branch.ts')
  includesAll(branch, [
    'export async function branchAndResume(',
    'options.customTitle, options.extraMessages,',
    'const effectiveTitle = title ?? (await getUniqueForkName(firstPrompt))',
    'const titleInfo = title ? ` "${effectiveTitle}"` : \'\'',
    'return true',
    'return false',
    'await branchAndResume(context, onDone, { customTitle: args?.trim() || undefined, })',
  ])

  const print = source('src/cli/print.ts')
  includesAll(print, [
    'threadHistory: false',
    'response: result.response, synthetic: result.synthetic,',
  ])
})
