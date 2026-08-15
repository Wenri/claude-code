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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetSha256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_110_BUNDLE is not set'
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

const pinnedUnits = new Map([
  [
    363,
    [
      24101,
      30589,
      '9b408019b3c38989889d77f502639df79b94057df5cc9e63a861b42534279837',
    ],
  ],
  [
    8908,
    [
      5943559,
      5943622,
      '234b39a1fff084c948123c9fe035eeba4aed182a6e2a1d8f1afcff56668d912d',
    ],
  ],
  [
    8909,
    [
      5943622,
      5943684,
      '1f4cf43b859c6eaed1e60cdb0fad58a88e0366eb38b15c04ceaf261257b4d7ef',
    ],
  ],
  [
    8911,
    [
      5943745,
      5945057,
      'a64e69f6c8f2c0323d68405b430607914f5243e3a4aa540c8e5eb45103c628e7',
    ],
  ],
  [
    12199,
    [
      9201858,
      9202607,
      '0d38bb56e8d2f252765b12624a7086353aca116670e534f300729a7e182933cc',
    ],
  ],
  [
    12203,
    [
      9202718,
      9203693,
      'aa5ff34ff1a748475028be5e6a67da5df31de8be4e82e0058675b929c2e7e47c',
    ],
  ],
  [
    12209,
    [
      9203824,
      9206535,
      'f9f3dd489a2b2425742f4b23a6af228bcc76e8fd87f7ce5043d384a577cfbede',
    ],
  ],
  [
    12265,
    [
      9237144,
      9237675,
      'ca6e89696da40a188cadd942c5c71a04086d38501740e5bd4f3a469cf27ffa67',
    ],
  ],
  [
    13859,
    [
      10048136,
      10048260,
      '0d5812fe6ec0a673234e7e092cceff0b3e58959144d5949172c87ea68a045002',
    ],
  ],
  [
    13860,
    [
      10048260,
      10051696,
      '0d32c369bda802f5cb518ede1f1da386ab19d791f937a6faff28a06af9af1cdd',
    ],
  ],
  [
    13862,
    [
      10051707,
      10051906,
      '4462f243ebb818ed435b3a3e806befdc41616e96adb6ba2aa2c8d70a03b9ca02',
    ],
  ],
  [
    13863,
    [
      10051906,
      10052236,
      'd1076677f9ec84bc98fdbfe793982c4ce7815a73d05f711d33e5704506dcc0dd',
    ],
  ],
  [
    13865,
    [
      10052248,
      10053008,
      'd4a1c922ab9abb37b30b08e5cc93321c36dcc8c9cead2705af081d2581bf9407',
    ],
  ],
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
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test('target110 pins push and remote-workflow structural units', bundleOptions, () => {
  const bytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bytes), targetSha256)
  const bundle = bytes.toString('utf8')

  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }

  for (const fragment of [
    'tengu_push_notification_send',
    'tengu_kairos_push_notifications',
    'remote_workflow_template',
    'tengu_remote_workflow_spawner_started',
    'Checking remote session eligibility…',
    'Spawn a remote session that reproduces, root-causes, fixes, and regression-tests a bug',
  ]) {
    assert.ok(bundle.includes(fragment), fragment)
  }
})

test('source recovers target110 PushNotification execution and rendering', sourceOptions, () => {
  const tool = assertFragments(
    'src/tools/PushNotificationTool/PushNotificationTool.ts',
    [
      "z.literal('proactive')",
      "'tengu_kairos_push_notifications'",
      "['config_off', 'user_present', 'bridge_inactive']",
      'Date.now() - getLastInteractionTime() < USER_PRESENT_THRESHOLD_MS',
      "notificationType: 'push_notification'",
      "logEvent('tengu_push_notification_send'",
      "disabledReason: 'config_off'",
      "disabledReason: 'user_present'",
      "disabledReason: 'bridge_inactive'",
      'pushSent: true',
    ],
  )
  assert.ok(
    tool.indexOf('isUserPresent()') < tool.indexOf('context.sendOSNotification'),
    'presence suppression precedes local and mobile delivery',
  )
  assertFragments('src/tools/PushNotificationTool/UI.tsx', [
    `'Not sent because "Push when Claude decides" is disabled in '`,
    'Not sent because you\'re active in this terminal.',
    'Not sent — Remote Control is off. Enable with ',
    'Terminal and mobile notification sent.',
    "logEvent('tengu_slash_link_clicked'",
  ])
  assertFragments('src/tools/PushNotificationTool/prompt.ts', [
    'Because a notification they didn\'t need is annoying',
    'Keep the message under 200 characters, one line, no markdown.',
  ])
  assertFragments('src/bootstrap/state.ts', [
    'export function isReplBridgeActive()',
    'export function setReplBridgeActive(value: boolean)',
  ])
  assertFragments('src/hooks/useMergedTools.ts', [
    'state => state.replBridgeEnabled',
    'state => state.replBridgeOutboundOnly',
    'setReplBridgeActive(replBridgeEnabled && !replBridgeOutboundOnly)',
  ])
  assertFragments('src/components/Settings/Config.tsx', [
    "'tengu_kairos_push_notifications'",
    "'tengu_kairos_input_needed_push'",
    "id: 'inputNeededNotifEnabled'",
    "id: 'agentPushNotifEnabled'",
  ])
  assertFragments('src/tools.ts', [
    "require('./tools/PushNotificationTool/PushNotificationTool.js')",
    '.PushNotificationTool',
    '...(PushNotificationTool ? [PushNotificationTool] : [])',
  ])
})

test(
  'historical target110 source recovers five target-only remote workflow commands',
  sourceOptions,
  () => {
    const indexPath = path.join(sourceRoot, 'commands/remote-workflows/index.ts')
    if (isCurrentSource) {
      assert.equal(
        fs.existsSync(indexPath),
        false,
        'remote workflow templates were removed after target112',
      )
      return
    }

    const index = assertFragments('src/commands/remote-workflows/index.ts', [
      "name: 'autopilot'",
      "name: 'bugfix'",
      "name: 'dashboard'",
      "name: 'docs'",
      "name: 'investigate'",
      '!isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)',
      'isClaudeAISubscriber()',
      "isPolicyAllowed('allow_remote_sessions')",
      'call: module.makeRemoteWorkflowCall(workflow)',
    ])
    assert.equal((index.match(/name: '/g) ?? []).length, 5)

    const spawner = assertFragments(
      'src/commands/remote-workflows/spawner.tsx',
      [
        "logEvent('tengu_remote_workflow_spawner_started'",
        'checkRemoteAgentEligibility({ skipBundle: true })',
        'getIsHeadOnRemote()',
        'hasUnpushedCommits()',
        'current branch has no upstream on GitHub.',
        'you have unpushed local commits.',
        'initialMessage: command',
        "source: 'remote_workflow_template'",
        'branchName,',
        'skipBundle: true',
        'useDefaultEnvironment: true',
        "remoteTaskType: 'remote-agent'",
        'isLongRunning: true',
        'void archiveRemoteSession(session.id)',
        'context.abortController.abort()',
        'Spawned remote ${workflow.name} session on ${branchName}',
        "checking: 'Checking remote session eligibility…'",
        "spawning: 'Spawning remote Claude Code session…'",
      ],
    )
    assert.ok(
      spawner.indexOf('checkRemoteAgentEligibility({ skipBundle: true })') <
        spawner.indexOf('teleportToRemote({'),
      'preconditions precede session creation',
    )
    assert.ok(
      spawner.indexOf('pendingSessionId.current = session.id') <
        spawner.indexOf('registerRemoteAgentTask({'),
      'created sessions are tracked for cancellation before task registration',
    )
    assertFragments('src/commands.ts', [
      "import { remoteWorkflowCommands } from './commands/remote-workflows/index.js'",
      '...remoteWorkflowCommands,',
    ])
    assertFragments('src/utils/teleport.tsx', [
      'source?: string;',
      "logEvent('tengu_ccr_session_link'",
      'source:',
      'options.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS',
    ])
  },
)
