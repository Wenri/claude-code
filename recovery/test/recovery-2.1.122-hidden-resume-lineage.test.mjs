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
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
    expected: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    expected: 1,
  },
]

function loadBundle(release) {
  const filename = process.env[release.env]
  assert.ok(filename, `${release.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, pattern) {
  return [...contents.matchAll(pattern)].length
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function source(relative) {
  return compact(fs.readFileSync(path.join(repo, relative), 'utf8'))
}

function ordered(contents, fragments) {
  let cursor = 0
  for (const fragment of fragments) {
    const index = contents.indexOf(fragment, cursor)
    assert.ok(index >= cursor, `missing or out of order: ${fragment}`)
    cursor = index + fragment.length
  }
}

test('authenticates the target-only resume lineage and spare-claim structures', () => {
  const structures = {
    initialState:
      /sessionId:[A-Za-z_$][\w$]*\.sessionId,resumeSessionId:[A-Za-z_$][\w$]*\.sessionId/g,
    schema:
      /sessionId:[A-Za-z_$][\w$]*\.string\(\),resumeSessionId:[A-Za-z_$][\w$]*\.string\(\)\.optional\(\)/g,
    classifier:
      /sessionId:[^,]{1,80},resumeSessionId:[A-Za-z_$][\w$]*\(\),cliVersion:/g,
    supervisorRefresh:
      /\?\.resumeSessionId\?\?[^,;]+\.sessionId,[A-Za-z_$][\w$]*=[^,;]+\?\.respawnFlags\?\?[^,;]+\.respawnFlags/g,
    spareClaimResize:
      /\.wirePty\([^;]{1,200}\),[^;]{0,40}\.resize\([^;]{1,100}\.cols\?\?200,[^;]{1,100}\.rows\?\?50\),[^;]{0,40}\.connectRv\(\)/g,
    claimReattachEnv:
      /if\([^)]*\.reattachEnv\)Object\.assign\([^,]+,[^)]*\.reattachEnv\)/g,
  }

  for (const release of releases) {
    const bundle = loadBundle(release)
    assert.equal(
      occurrences(bundle, /resumeSessionId/g),
      release.expected * 5,
      `${release.version}: resumeSessionId occurrences`,
    )
    assert.equal(
      occurrences(bundle, /\.resumeSessionId\?\?[^,;]+\.sessionId/g),
      release.expected * 2,
      `${release.version}: manual and supervised fallback`,
    )
    for (const [name, pattern] of Object.entries(structures)) {
      assert.equal(
        occurrences(bundle, pattern),
        release.expected,
        `${release.version}: ${name}`,
      )
    }
  }
})

test('persists the original job id and the current resumable session id', () => {
  const jobs = source('src/daemon/jobs.ts')
  assert.ok(
    jobs.includes(
      "sessionId: z.string(), resumeSessionId: z.string().optional(), cliVersion:",
    ),
  )
  assert.ok(
    jobs.includes(
      'sessionId: options.sessionId, resumeSessionId: options.sessionId, cwd:',
    ),
  )

  const classifier = source('src/jobs/classifier.ts')
  assert.ok(
    classifier.includes(
      'sessionId: latest?.sessionId ?? getSessionId(), resumeSessionId: getSessionId(), cliVersion:',
    ),
  )
})

test('manual respawn follows the refreshed session id everywhere', () => {
  const bg = source('src/cli/bg.ts')
  ordered(bg, [
    'const resumeSessionId = state.resumeSessionId ?? state.sessionId',
    '`${resumeSessionId}.jsonl`',
    "...(exists ? ['--resume', resumeSessionId] : []),",
    "const spawned = await spawnBgSession( args, resumeSessionId, 'fleet',",
  ])
})

test('supervised respawn refreshes state before transcript validation and launch', () => {
  const supervisor = source('src/daemon/supervisor.ts')
  ordered(supervisor, [
    'let resumeSessionId = dispatch.sessionId',
    'let respawnFlags = dispatch.respawnFlags',
    'const state = await readJobState(jobDir)',
    'resumeSessionId = state?.resumeSessionId ?? dispatch.sessionId',
    'respawnFlags = state?.respawnFlags ?? dispatch.respawnFlags',
    '`${resumeSessionId}.jsonl`',
    'const args = launchArgs( dispatch, this.attempt, currentTranscriptValid, resumeSessionId, respawnFlags, )',
  ])
  assert.ok(
    supervisor.includes(
      "return ['--resume', resumeSessionId, ...respawnFlags]",
    ),
  )
})

test('claimed workers restore terminal geometry, pid state, and launch environment', () => {
  const supervisor = source('src/daemon/supervisor.ts')
  ordered(supervisor, [
    'handle.wirePty(connectPtyHost(options.ptySockPath, options.pid))',
    'handle.resize(dispatch.cols ?? 200, dispatch.rows ?? 50)',
    'handle.connectRendezvous()',
  ])
  ordered(supervisor, [
    'handle.record.pid !== options.pid',
    'if (token) handle.procStart = token',
    'handle.patch({ pid: options.pid })',
  ])
  ordered(supervisor, [
    'const env = jobEnvironment(',
    'if (dispatch.reattachEnv) Object.assign(env, dispatch.reattachEnv)',
    'argv: launchArgs( dispatch, 1, false, dispatch.sessionId, dispatch.respawnFlags, )',
  ])
  const claim = supervisor.slice(
    supervisor.indexOf('static claim('),
    supervisor.indexOf('static buildClaimFrame('),
  )
  assert.ok(!claim.includes('handle.cols = 0'))
})

test('resume lineage recovery preserves crash diagnostics and uptime telemetry', () => {
  const supervisor = source('src/daemon/supervisor.ts')
  ordered(supervisor, [
    'this.procStart = undefined',
    '[worker crashed (${detail}) — respawning…]',
    'this.pushRing(notice)',
    'this.stream.emit(notice)',
    'this.respawnTimer = setTimeout',
  ])

  const main = source('src/daemon/main.ts')
  for (const event of [
    'tengu_daemon_worker_permanent_exit',
    'tengu_daemon_worker_crash',
  ]) {
    const index = main.lastIndexOf(event)
    assert.ok(index >= 0, event)
    assert.ok(main.slice(index, index + 250).includes('uptime_ms: uptime'), event)
  }
})
