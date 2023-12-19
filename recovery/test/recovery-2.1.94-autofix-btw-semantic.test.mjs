import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
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

const pinnedUnits = new Map([
  [13312, [10009021, 10009525, '523b21e1f18d12577cc9b2b74d6f3ab39f4d2d4e2d5915d312fdd4869207cedd']],
  [13318, [10009826, 10010051, '86ccf3fb0e6d6b1c882256b3001346eabeac86a6ed3f5550b220d33320c50da5']],
  [13319, [10010051, 10013740, 'da51ae92618bde1ecf728bc27e67c99452fe7f5540aa6234133f50dfa7988be0']],
  [13321, [10013845, 10014100, '7253a0a4ea107877762eeec7bd5167bd9be92c5e13146a91384f52a422c4648d']],
  [13323, [10014112, 10014474, '7b8378fcbd0d23fe812c348f5f4f8b7f037f423aabfa729470a5ebb9bb75e446']],
  [13337, [10018960, 10021216, '9292fdb5c9d3e9118290b0454c413139dd96e472ba89f1c6db571e655872b7cc']],
  [13339, [10021243, 10022293, '7290a2c1768646001e1de449accf7bd05d92b39513106683c397302dcd460023']],
  [13340, [10022293, 10022456, 'c0cb6d99a50353114f35977f22a8fc06a28ac9d5001126e4c24332db4ba943b5']],
])

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

test(
  '2.1.94 pins every introduced autofix and /btw retry structural unit',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_94_BUNDLE is not set'
        : false,
  },
  () => {
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(
      sha256(targetBytes),
      '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564',
    )
    if (baselineBundlePath) {
      assert.equal(
        sha256(fs.readFileSync(baselineBundlePath)),
        '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362',
      )
    }
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, sourceHash]] of pinnedUnits) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: classification`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, sourceHash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), sourceHash, `${index}: bytes`)
    }
  },
)

test(
  '2.1.94 bundle contains the complete reachable autofix and retry behavior',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !targetBundlePath
        ? 'CLAUDE_CODE_2_1_94_BUNDLE is not set'
        : false,
  },
  () => {
    const target = fs.readFileSync(targetBundlePath, 'utf8')
    for (const fragment of [
      '/v1/code/github/${q}-pr',
      'session_id:Qy(K)',
      'When CI failures or review comments arrive as notifications',
      'mR6({skipBundle:!0})',
      'reuseOutcomeBranch:P',
      'skipBundle:!0',
      'remoteTaskType:"autofix-pr"',
      'WARNING: Failed to turn on autofix for this PR',
      'tengu_autofix_pr_started',
      'tengu_autofix_pr_result',
      'Detecting open PR for current branch…',
      'Rate limited',
      'API overloaded',
      'Authentication failed',
      'retrying in ',
    ]) {
      assert.ok(target.includes(fragment), fragment)
    }
  },
)

test(
  'source owns the autofix API, launch lifecycle, cancellation, and command gate',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    assertFragments('src/commands/autofix-pr/api.ts', [
      '/v1/code/github/${action}-pr',
      'session_id: toCompatSessionId(sessionId)',
      'pr_number: prNumber',
      'timeout: 10_000',
      'status === 409',
    ])
    assertFragments('src/commands/autofix-pr/index.ts', [
      "name: 'autofix-pr'",
      "isPolicyAllowed('allow_remote_sessions')",
      'isClaudeAISubscriber()',
      "load: () => import('./autofix-pr.js')",
    ])
    const owner = assertFragments('src/commands/autofix-pr/autofix-pr.tsx', [
      'When CI failures or review comments arrive as notifications',
      "logEvent('tengu_autofix_pr_started'",
      "logEvent('tengu_autofix_pr_result'",
      "['pr', 'view', '--json', 'number,state,url']",
      'reuseOutcomeBranch: branch',
      "remoteTaskType: 'autofix-pr'",
      'WARNING: Failed to turn on autofix for this PR',
      'WARNING: You have unpushed local commits',
      "onDone('Autofix PR cancelled')",
      'void archiveRemoteSession(remoteSessionId.current)',
    ])
    if (historical) {
      assert.ok(owner.includes('checkRemoteAgentEligibility({ skipBundle: true })'))
      assert.ok(owner.includes('skipBundle: true'))
      assert.equal(owner.includes('onBundleFail:'), false)
    } else {
      assert.ok(owner.includes('checkRemoteAgentEligibility()'))
      assert.ok(owner.includes('onBundleFail: message =>'))
      assert.equal(owner.includes('skipBundle: true'), false)
    }
  },
)

test(
  'source owns /btw abort, retry, and latest threaded-history semantics',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const sideQuestion = assertFragments('src/utils/sideQuestion.ts', [
      'parentController?: AbortController',
      'createChildAbortController(parentController)',
      'overrides: { abortController }',
      'retryAttempt: message.retryAttempt',
      'retryInMs: message.retryInMs',
      'isAbortError(error) || abortController.signal.aborted',
    ])
    const btw = assertFragments('src/commands/btw/btw.tsx', [
      "return 'Rate limited'",
      "return 'API overloaded'",
      "return 'Authentication failed'",
      "{' · retrying in '}",
      'parentController: abortController',
      'retryAt: Date.now() + next.retryInMs',
    ])
    if (historical) {
      assert.equal(sideQuestion.includes('skipTranscript: true'), false)
      assert.equal(btw.includes('Forking into a new session…'), false)
    } else {
      for (const fragment of [
        'skipTranscript: true',
        'sideQuestionHistory.flatMap',
        'synthetic: boolean',
        'if (threadHistory && response && !synthetic)',
      ]) {
        assert.ok(sideQuestion.includes(fragment), fragment)
      }
      for (const fragment of [
        'getSideQuestionHistory()',
        "event.key === 'x'",
        "event.key === 'f' && response && !synthetic",
        'branchAndResume(context, onDone',
        'Forking into a new session…',
        'clearSideQuestionHistory()',
      ]) {
        assert.ok(btw.includes(fragment), fragment)
      }
      assertFragments('src/commands/branch/branch.ts', [
        'export async function branchAndResume(',
        'extraMessages?: Message[]',
        'To return to the original: /resume ${originalSessionId}',
      ])
    }
  },
)
