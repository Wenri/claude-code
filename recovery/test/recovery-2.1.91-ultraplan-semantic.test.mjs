import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.90-to-2.1.91'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_91_BUNDLE
const targetSha256 =
  'b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816'
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
      ? 'CLAUDE_CODE_2_1_91_BUNDLE is not set'
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
    14597,
    [
      10890433,
      10891912,
      '7a086234e8635621e7564175dd6303d8b42f2a31c10345ad82a517807955eb73',
    ],
  ],
  [
    14603,
    [
      10892720,
      10892789,
      '9a1bce5a227ee7ec4fdf789f3d1c267d3c5e1a15e9e1794e7c653cd76996e78c',
    ],
  ],
  [
    14609,
    [
      10893717,
      10893893,
      'bb94f0a3fb1fd17ad5a3b27bd5bbcc406d88a353e493e9e9c38ecfda1ae6db70',
    ],
  ],
  [
    14623,
    [
      10901140,
      10902916,
      'dd8d1a87127ccfdcc00783c2e28ee88fdd1b89893b651e8f00e2474039705a2c',
    ],
  ],
  [
    14627,
    [
      10903364,
      10903895,
      '57843e3c17a30c2bde7f1f2529db821b7afc9b302c6adf449e78f1b064c7688b',
    ],
  ],
  [
    14629,
    [
      10904518,
      10906326,
      'ad0e9075c2f77025e4e8e53e9661f3facc022ccf5b711ecd816f9dcfaca2f125',
    ],
  ],
  [
    14631,
    [
      10906921,
      10908330,
      'f6e8a51544b0120e08f6aade5b38dfa07af089dda85acb82c1ab3796278b9a2e',
    ],
  ],
  [
    14676,
    [
      10935032,
      10939504,
      '43fcf7bf4b7eb9d6110779b52770203a16b2740d2db106152584e2c133108fdb',
    ],
  ],
  [
    17373,
    [
      12260304,
      12263795,
      '67f70586addbce8a799d1fb05ccabc12d6ef62c1619d17eb38eec3d2ac4d32fe',
    ],
  ],
  [
    17375,
    [
      12263811,
      12263925,
      'f2ea686b633efb3a569d13676501ccfd93e98c9fa1386843394cc34239335f8f',
    ],
  ],
  [
    17376,
    [
      12263925,
      12264016,
      '4a92c459ce6b712767986afa3d5301817b04a3636206284f4edcd50239fcad0d',
    ],
  ],
  [
    17381,
    [
      12264227,
      12266284,
      '52ac91c486c942070dd22a19b36fc47458885745e592d46ad4cc806a1013ee0e',
    ],
  ],
  [
    17382,
    [
      12266284,
      12266365,
      'a34c37312219bc517801dceb4ec046301bc314c72f64b5444408b4aefa9916ba',
    ],
  ],
  [
    17386,
    [
      12266567,
      12266616,
      'da2150c7311fcca5eff7077761d3e5e77e50ad9447d890ea5fbd9c0eb0cb677e',
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

test('2.1.91 evidence pins the complete Ultraplan structural cluster', bundleOptions, () => {
  const bundleBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(bundleBytes), targetSha256)
  const bundle = bundleBytes.toString('utf8')
  for (const [index, [start, end, sourceHash]] of pinnedUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, sourceHash],
      `${index}: structural identity`,
    )
    assert.equal(sha256(bundle.slice(start, end)), sourceHash, `${index}: bytes`)
  }
})

test('source recovers the approval-choice and launch-dialog control flow', sourceOptions, () => {
  const choice = assertFragments(
    'src/components/ultraplan/UltraplanChoiceDialog.tsx',
    [
      "case 'here'",
      'Ultraplan approved in browser. Here is the plan:',
      "case 'fresh'",
      'Previous session saved · resume with: claude --resume',
      'Here is the approved implementation plan:',
      "case 'cancel'",
      'Ultraplan rejected · Plan saved to',
      "status: 'completed', endTime: Date.now()",
      'archiveRemoteSession(sessionId)',
      'ctrl+u/ctrl+d to scroll',
      'Implement here',
      'Start new session',
    ],
  )
  assert.ok(choice.indexOf("case 'here'") < choice.indexOf("case 'fresh'"))
  assert.ok(choice.indexOf("case 'fresh'") < choice.indexOf("case 'cancel'"))
  assert.ok(choice.includes("status: 'completed', endTime: Date.now()"))

  const launch = assertFragments(
    'src/components/ultraplan/UltraplanLaunchDialog.tsx',
    [
      '!getGlobalConfig().hasSeenUltraplanTerms',
      'getUltraplanPromptIdentifier',
      "choice === 'run' && replBridgeEnabled",
      'hasSeenUltraplanTerms: true',
      'Disable remote control and launch in Claude Code on the web',
      'Run ultraplan in the cloud?',
    ],
  )
  assert.ok(
    launch.indexOf('hasSeenUltraplanTerms: true') <
      launch.indexOf('onChoice(choice,'),
  )

  const command = assertFragments('src/commands/ultraplan.tsx', [
    'ultraplanPendingChoice: undefined',
    'ultraplanSessionUrl: undefined',
  ])
  assert.match(
    command,
    /ultraplanPendingChoice:\s*undefined[\s\S]{0,160}ultraplanSessionUrl:\s*undefined|ultraplanSessionUrl:\s*undefined[\s\S]{0,160}ultraplanPendingChoice:\s*undefined/,
  )

  assertFragments('src/screens/REPL.tsx', [
    'UltraplanChoiceDialog',
    'UltraplanLaunchDialog',
    'promptIdentifier: opts?.promptIdentifier',
  ])
})

test('source recovers phase-aware details and stop behavior', sourceOptions, () => {
  const detail = assertFragments(
    'src/components/tasks/RemoteSessionDetailDialog.tsx',
    [
      "phase === \"plan_ready\" ? \"Terminate session and discard plan\"",
      "phase === \"plan_ready\" ? DIAMOND_FILLED : DIAMOND_OPEN",
      'Review in Claude Code on the web',
      'Answer in Claude Code on the web',
      'Open in Claude Code on the web',
      'Discard the generated plan',
    ],
  )
  assert.ok(
    detail.indexOf('Terminate session and discard plan') <
      detail.indexOf('Discard the generated plan'),
  )
})

test(
  'historical source recovers the target-91 poll, gate, cleanup, and telemetry',
  {
    ...sourceOptions,
    skip:
      sourceOptions.skip ||
      (isCurrentSource ? 'historical target-91 source only' : false),
  },
  () => {
    if (isCurrentSource) return
    const command = assertFragments('src/commands/ultraplan.tsx', [
      "'tengu_ultraplan_config'",
      '?.enabled === true',
      'deleteRemoteAgentMetadata(taskId)',
      'Ultraplan terminated:',
      "Remote Ultraplan session failed. Wait for the user's next instructions.",
      'Ultraplan hit an unexpected error during launch.',
      'get description()',
      'getUltraplanDisplayConfig().timeEstimate',
      'isEnabled: () => isUltraplanEnabled()',
    ])
    assert.ok(
      command.indexOf('deleteRemoteAgentMetadata(taskId)') <
        command.indexOf("status: 'completed'"),
    )
    assertFragments('src/utils/ultraplan/ccrSession.ts', [
      'Math.round(timeoutMs / 60_000)',
      "timeoutMinutes === 1 ? 'minute' : 'minutes'",
      'no approval after ${timeoutMinutes} ${timeoutUnit}',
      'ExitPlanMode never reached after ${timeoutMinutes} ${timeoutUnit}',
    ])
  },
)
