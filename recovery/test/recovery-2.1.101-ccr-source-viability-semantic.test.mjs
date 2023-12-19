import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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

const targetUnits = new Map([
  [
    15080,
    [
      11147197,
      11147487,
      'bcd805eca68780f7236c7728e642a680ab5ce40d1cc2c76c8a092ad7519a6c62',
    ],
  ],
  [
    15108,
    [
      11159495,
      11161528,
      'fe474e31122fb96d4ca346456926a49fad0e65192b2e7dcdbb5fac1fd76fd600',
    ],
  ],
  [
    15111,
    [
      11161789,
      11161871,
      '53396d9d24d9f9bf7a1723901e592ff8f73a6c03a13ab954a49e52341412d17f',
    ],
  ],
  [
    15114,
    [
      11162557,
      11163178,
      'f9bc50d5c9518f341dce1cc14df07aefde54d482786c3df433bf4911eba9c404',
    ],
  ],
  [
    15115,
    [
      11163178,
      11165088,
      'cefd15646d15aa4a92bc28298aed24426145887ae003bc6e1ed71034701bdc85',
    ],
  ],
  [
    15116,
    [
      11165088,
      11165766,
      '1bbedb84ed5b11b069c9e3172109bd11c24c08df0a11e1e4722fcf54aab7a762',
    ],
  ],
  [
    17866,
    [
      12514337,
      12514557,
      '6466e174b06f03509d5e7cfa6cf61ebe12e70dd2c255c789cae295dd8b2257e3',
    ],
  ],
  [
    17867,
    [
      12514557,
      12515934,
      '0c5b414a2aa1b7fd13ed7805abee307e62b6704c94e7a8824d4cbf89fd046377',
    ],
  ],
  [
    17874,
    [
      12516293,
      12517843,
      '816e573542edc3617810bb7ea9a6f488cd6a9cab4f8ab85a088dc56d7766b123',
    ],
  ],
  [
    18222,
    [
      12660551,
      12718728,
      '74b589580c0b21c4bb029a90a90e1767aea485121eee0a52d5b87ff4fa074cdd',
    ],
  ],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

test('target101 pins the complete CCR source and Ultraplan call graph', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )

  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('CCR source viability and confirmation enter at target101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(occurrences(baseline, 'cloneViable'), 0)
  assert.equal(occurrences(target, 'cloneViable'), 3)
  assert.equal(occurrences(baseline, 'bundleSeedEnabled'), 0)
  assert.equal(occurrences(target, 'bundleSeedEnabled'), 3)
  assert.equal(occurrences(baseline, 'sourcePromise'), 0)
  assert.equal(occurrences(target, 'sourcePromise'), 6)
  for (const fragment of [
    'This will try to clone your git remote and fall back to uploading this repository.',
    'This will upload your repository to Claude Code on the web.',
    'The remote ultraplan session produced a plan and is waiting for approval.',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.ok(target.includes('ultraplanLaunchPending:{ultraplanArg:z,sourcePromise:O}'))
  assert.ok(target.includes('sourcePromise:a.sourcePromise'))
  assert.ok(target.includes('L7=rq.uuid'))
})

test('source owns viability, confirmation, status replacement, and launch reachability', sourceOptions, () => {
  const remote = source('src/utils/background/remote/remoteSession.ts')
  assertFragments(
    remote,
    [
      'export type RemoteSourceViability',
      'cloneViable: boolean',
      'bundleSeedEnabled: boolean',
      'export async function getRemoteSourceViability()',
      "checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled')",
      'isEnvTruthy(process.env.CCR_ENABLE_BUNDLE)',
      "repository.host !== 'github.com'",
      'await checkGithubAppInstalled(repository.owner, repository.name)',
    ],
    'src/utils/background/remote/remoteSession.ts',
  )
  assert.ok(
    remote.indexOf('if (!bundleSeedEnabled)') <
      remote.indexOf('await checkGithubAppInstalled'),
  )

  const dialog = source('src/components/ultraplan/UltraplanLaunchDialog.tsx')
  assertFragments(
    dialog,
    [
      'sourcePromise?: Promise<RemoteSourceViability | null> | null',
      'const source = sourcePromise ? React.use(sourcePromise) : null',
      'if (!source.bundleSeedEnabled) return null',
      'This will try to clone your git remote and fall back to uploading this repository.',
      'This will upload your repository to Claude Code on the web.',
      'sourcePromise ?? getRemoteSourceViability().catch(() => null)',
      "logEvent('tengu_ultraplan_dialog_choice'",
      "logEvent('tengu_ultraplan_first_launch'",
    ],
    'src/components/ultraplan/UltraplanLaunchDialog.tsx',
  )

  const command = source('src/commands/ultraplan.tsx')
  assertFragments(
    command,
    [
      'let planReadyNotified = false',
      "phase === 'plan_ready' && !planReadyNotified",
      'onStatusMessage?.(buildPlanReadyMessage(url))',
      'The remote ultraplan session produced a plan and is waiting for approval.',
      'deleteRemoteAgentMetadata(taskId)',
      'onStatusMessage?.(buildSessionReadyMessage(url))',
      'startDetachedPoll(taskId, session.id, url, getAppState, setAppState, onStatusMessage)',
      'ultraplanLaunchPending: {',
      'ultraplanArg: arg',
      'sourcePromise',
    ],
    'src/commands/ultraplan.tsx',
  )

  const state = source('src/state/AppStateStore.ts')
  assertFragments(
    state,
    [
      'ultraplanLaunchPending?: {',
      'ultraplanArg: string',
      'sourcePromise?: Promise<',
      "RemoteSourceViability | null",
    ],
    'src/state/AppStateStore.ts',
  )

  const repl = source('src/screens/REPL.tsx')
  assertFragments(
    repl,
    [
      'sourcePromise={ultraplanLaunchPending.sourcePromise}',
      'const { ultraplanArg',
      'if (ultraplanArg) setInputValue(ultraplanArg)',
      "formatCommandInputTags('ultraplan', ultraplanArg)",
      'let statusMessageId: string | undefined',
      'const previousId = statusMessageId',
      'prev.findIndex(message => message.uuid === previousId)',
      'updated[index] = next',
      'onStatusMessage: appendWhenIdle',
      'statusMessageId = initial.uuid',
    ],
    'src/screens/REPL.tsx',
  )

  if (isCurrentSource) {
    assert.ok(state.includes("source: 'slash' | 'keyword'"))
    assert.ok(repl.includes('const { ultraplanArg, source }'))
    assert.ok(repl.includes('source,'))
    assert.ok(command.includes('getGlobalConfig().hasSeenUltraplanTerms'))
    assert.ok(command.includes('getRemoteSourceViability().catch(() => null)'))
  } else {
    assert.equal(state.includes("source: 'slash' | 'keyword'"), false)
    assert.ok(repl.includes('const { ultraplanArg }'))
    assert.equal(repl.includes('const { ultraplanArg, source }'), false)
    assert.ok(
      command.includes(
        'const sourcePromise = getGlobalConfig().hasSeenUltraplanTerms',
      ),
    )
    assert.ok(
      command.includes(
        "failureMessage ? ` — ${failureMessage}` : '. See --debug for details.'",
      ),
    )
  }
})
