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
    count: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    count: 1,
  },
]

function readBundle(release) {
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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates target-only spare fallback and worker init retry diagnostics', () => {
  const witnesses = [
    '[bg-spare] claim miss (',
    'Background service unreachable',
    'cli_worker_init_put_retries_exhausted',
  ]
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const witness of witnesses) {
      assert.equal(
        occurrences(bundle, witness),
        release.count,
        `${release.version}: ${witness}`,
      )
    }
  }
})

test('falls back from every spare claim failure to a fresh job', () => {
  const contents = compact(
    fs.readFileSync(
      path.join(repo, 'src/cli/handlers/templateJobs.ts'),
      'utf8',
    ),
  )
  for (const fragment of [
    '`[bg-spare] claim miss (${reason})${detail ? `: ${detail}` : \'\'}`',
    "logEvent('tengu_bg_spare_claim_fail', { reason })",
    "detail ?? 'Background service unreachable'",
    "if (!claimed) return fallBackToFreshJob('no-spare')",
    "fallBackToFreshJob('state-write', errorMessage(error))",
    "? 'enojob' : 'reply'",
    "fallBackToFreshJob('reply-throw', errorMessage(error))",
    'dispatchTemplateJob( DEFAULT_TEMPLATE, intent, claimed?.sessionId, claimed?.cwd',
  ]) {
    assert.ok(contents.includes(compact(fragment)), fragment)
  }
})

test('retries worker registration three times before failing', () => {
  const contents = compact(
    fs.readFileSync(
      path.join(repo, 'src/cli/transports/ccrClient.ts'),
      'utf8',
    ),
  )
  for (const fragment of [
    'for (let attempt = 1; attempt <= 3; attempt++)',
    'if (result.ok || this.closed) break',
    'Math.min(500 * 2 ** (attempt - 1), 30_000) + Math.random() * 500',
    "'cli_worker_init_put_retries_exhausted'",
    "throw new CCRInitError('worker_register_failed')",
  ]) {
    assert.ok(contents.includes(compact(fragment)), fragment)
  }
})
