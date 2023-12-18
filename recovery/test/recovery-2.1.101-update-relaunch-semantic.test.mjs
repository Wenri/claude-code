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
  [15821, [11494326, 11494373, 'd4c9ed43fd7b5f2abd1bbf2111bed1dabf3bc9546b19f99815b92e1278b68835', 'ExpressionStatement']],
  [15823, [11494413, 11494446, '63f7311279f2de88a0ecbc2787f377a3308e39de88f04e3a07b520c04cf5e718', 'ImportDeclaration']],
  [15824, [11494446, 11494538, '705872d80fc3476ce815ac7536df0141223ca70969cfd7da8adc53d7e3896e6e', 'FunctionDeclaration']],
  [15825, [11494538, 11495512, 'f5eb728190ab4a7a8f75ff00ef7d53cb2846c2d496c13cc92c8d92cb243e7069', 'VariableDeclaration']],
  [15826, [11495512, 11495565, 'bdf7c8a5ceb23e39762010e9cfca6bc2dc8933f759c72af1c760144fe94442e1', 'VariableDeclaration']],
  [15828, [11495577, 11495809, '32adb090bbb234ffef0e0f480851087cd1fbcf9956176275b72c552a63be2d7d', 'VariableDeclaration']],
  [16067, [11634752, 11637615, '20a9e9624b51788f45ec17b864fd7a859a2678bec23b6f80405a7e3c2c490044', 'VariableDeclaration']],
])
const transitiveLauncherUnit = [
  11398,
  8824231,
  8824571,
  '310b70f0afa73db86492fcb7ae4449972f2990a64531e9329d123fcb90db2feb',
  'FunctionDeclaration',
]

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
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
}

test('target101 pins the hidden update command, relaunch, and registration units', pairOptions, () => {
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
  for (const [index, [start, end, hash, nodeType]] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
        region.target.nodeType,
      ],
      [start, end, hash, nodeType],
      `${index}: structural identity`,
    )
    const unit = target.slice(start, end)
    assert.equal(sha256(unit), hash, `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }

  const [index, start, end, hash, nodeType] = transitiveLauncherUnit
  const launcherRegion = structural.regions[index]
  assert.equal(launcherRegion.classification, 'matched', `${index}: classification`)
  assert.deepEqual(
    [
      launcherRegion.target.start,
      launcherRegion.target.end,
      launcherRegion.target.sourceHash,
      launcherRegion.target.nodeType,
    ],
    [start, end, hash, nodeType],
    `${index}: transitive launcher identity`,
  )
  assert.equal(sha256(target.slice(start, end)), hash, `${index}: target bytes`)
})

test('the resumable update command enters at target101 with fail-safe relaunch ordering', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'Switch to the latest version (conversation continues)',
    'Switching from ${',
    'cleanup timeout',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }

  const call = target.slice(...targetUnits.get(15825).slice(0, 2))
  assertFragments(
    call,
    [
      '1073741824',
      '2000,"flush timeout"',
      '2000,"cleanup timeout"',
      '"--resume"',
      'stdio:"inherit"',
      '["SIGINT","SIGTERM","SIGHUP"]',
      'removeAllListeners',
      '128+',
      'Failed to relaunch Claude Code:',
    ],
    'target101 update call',
  )
  assert.ok(call.indexOf('flush timeout') < call.indexOf('cleanup timeout'))
  assert.ok(call.indexOf('cleanup timeout') < call.indexOf('Switching from'))
  assert.ok(call.indexOf('Switching from') < call.indexOf('"--resume"'))
})

test('source owns the historical update graph and exact latest safety evolution', sourceOptions, () => {
  const descriptor = source('commands/update/index.ts')
  assertFragments(
    descriptor,
    [
      "type: 'local'",
      "name: 'update'",
      "description: 'Switch to the latest version (conversation continues)'",
      'supportsNonInteractive: false',
      'isEnabled: () => false',
      'isHidden: true',
      "load: () => import('./update.js')",
    ],
    'commands/update/index.ts',
  )

  const update = source('commands/update/update.ts')
  assertFragments(
    update,
    [
      "const installedLauncher = await which('claude')",
      '? { cmd: installedLauncher, prefixArgs: [] }',
      ': getRelaunchLauncher()',
      'Switching from ${MACRO.VERSION} to latest… conversation will continue',
    ],
    'commands/update/update.ts',
  )
  if (isCurrentSource) {
    assertFragments(
      update,
      [
        'Cannot /update while background tasks are running',
        'transcript_path_drift: true',
        "teamName?.startsWith('assistant-')",
        'return relaunch({',
        'freshIfNoTranscript: true',
        'CLAUDE_INTERNAL_ASSISTANT_TEAM_NAME',
      ],
      'latest update safety graph',
    )
  } else {
    assertFragments(
      update,
      [
        'markShuttingDownForRelaunch()',
        'setInterval(() => {}, 1_073_741_824)',
        "withTimeout(flushSessionStorage(), 2_000, 'flush timeout')",
        'cleanupTerminalForRelaunch()',
        "withTimeout(runCleanupFunctions(), 2_000, 'cleanup timeout')",
        "spawn(cmd, [...prefixArgs, '--resume', sessionId]",
        "['SIGINT', 'SIGTERM', 'SIGHUP']",
        'process.removeAllListeners(signal)',
        '128 + (constants.signals[signal] ?? 0)',
        'process.exit(exitCode)',
      ],
      'target101 update graph',
    )
  }

  const commands = source('commands.ts')
  assert.ok(commands.includes("import update from './commands/update/index.js'"))
  assert.ok(/\n\s*update,\n/.test(commands), 'commands.ts registers update')
})
