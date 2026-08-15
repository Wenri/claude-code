import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
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

const updateCall = [
  11409701,
  11410830,
  '9a970c70ff163445777d2d9035ea18522fcc58583e8b110cc036588170301727',
]

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_107_BUNDLE and CLAUDE_CODE_2_1_108_BUNDLE are required'
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

test('target108 pins the update/relaunch semantic delta', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844',
  )
  assert.equal(
    sha256(targetBytes),
    'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73',
  )

  const region = structural.regions[16088]
  assert.equal(region.classification, 'unresolved')
  assert.deepEqual(
    [region.target.start, region.target.end, region.target.sourceHash],
    updateCall,
  )
  const unit = targetBytes.toString('utf8').slice(updateCall[0], updateCall[1])
  assert.equal(sha256(unit), updateCall[2])
  assert.equal(
    parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
    1,
  )
})

test('target108 introduces assistant-team propagation without changing relaunch lifecycle', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  assert.equal(baseline.includes('CLAUDE_INTERNAL_ASSISTANT_TEAM_NAME'), false)
  assert.equal(target.includes('CLAUDE_INTERNAL_ASSISTANT_TEAM_NAME'), true)
  assert.ok(target.includes('startsWith("assistant-")'))
  assert.ok(target.includes('env:O?{...process.env,CLAUDE_INTERNAL_ASSISTANT_TEAM_NAME:O}:process.env'))
  for (const fragment of [
    'flush timeout',
    'cleanup timeout',
    'Switching from',
    'conversation will continue',
    '--resume',
    'SIGINT',
    'SIGTERM',
    'SIGHUP',
    'Failed to relaunch Claude Code:',
  ]) {
    assert.equal(baseline.includes(fragment), true, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
})

test('source owns target-specific update and relaunch control flow', sourceOptions, () => {
  const update = source('src/commands/update/update.ts')
  const relaunch = source('src/utils/relaunch.ts')

  assertFragments(
    update,
    [
      "which('claude')",
      "teamName?.startsWith('assistant-')",
      'CLAUDE_INTERNAL_ASSISTANT_TEAM_NAME: assistantTeamName',
      'Switching from ${MACRO.VERSION} to latest… conversation will continue',
    ],
    'src/commands/update/update.ts',
  )
  assertFragments(
    relaunch,
    [
      "join(getXDGDataHome(), 'claude', 'versions') + sep",
      "process.platform === 'win32' ? 'claude.exe' : 'claude'",
      'return { cmd: process.execPath, prefixArgs: [script] }',
    ],
    'src/utils/relaunch.ts',
  )

  if (isCurrentSource) {
    assertFragments(
      update,
      [
        "task.status === 'running' || task.status === 'pending'",
        "logEvent('tengu_update_refused', { active_tasks: true })",
        "logEvent('tengu_update_refused', { transcript_path_drift: true })",
        'freshIfNoTranscript: true',
        'launcher: await resolveLauncher()',
        'preSpawn: () => {',
      ],
      'current src/commands/update/update.ts',
    )
    assertFragments(
      relaunch,
      [
        'stopCapturingEarlyInput()',
        'markShuttingDownForRelaunch()',
        "withTimeout(flushSessionStorage(), 2_000, 'flush timeout')",
        'cleanupTerminalForRelaunch()',
        "withTimeout(runCleanupFunctions(), 2_000, 'cleanup timeout')",
        'delete childEnv.CLAUDE_CODE_TUI_JUST_SWITCHED',
        "options.args ?? (resume ? ['--resume', sessionId] : [])",
        'cwd: getRelaunchCwd()',
        'child.ref()',
        'severTtyInputForRelaunch()',
        'process.removeAllListeners(signal)',
      ],
      'current src/utils/relaunch.ts',
    )
  } else {
    assert.equal(update.includes('tengu_update_refused'), false)
    assert.equal(update.includes('freshIfNoTranscript'), false)
    assertFragments(
      update,
      [
        'const { cmd, prefixArgs } = await resolveLauncher()',
        'markShuttingDownForRelaunch()',
        'setInterval(() => {}, 1_073_741_824)',
        "withTimeout(flushSessionStorage(), 2_000, 'flush timeout')",
        'cleanupTerminalForRelaunch()',
        "withTimeout(runCleanupFunctions(), 2_000, 'cleanup timeout')",
        "spawn(cmd, [...prefixArgs, '--resume', sessionId]",
        ': process.env,',
        'child.ref()',
        'process.removeAllListeners(signal)',
        'const exitCode = await new Promise<number>',
        'process.exit(exitCode)',
      ],
      'target108 src/commands/update/update.ts',
    )
    const shutdown = update.indexOf('markShuttingDownForRelaunch()')
    const flush = update.indexOf('withTimeout(flushSessionStorage()')
    const terminal = update.indexOf('cleanupTerminalForRelaunch()')
    const cleanup = update.indexOf('withTimeout(runCleanupFunctions()')
    const spawnIndex = update.indexOf('const child = spawn(')
    assert.ok(shutdown < flush && flush < terminal && terminal < cleanup)
    assert.ok(cleanup < spawnIndex)
  }
})
