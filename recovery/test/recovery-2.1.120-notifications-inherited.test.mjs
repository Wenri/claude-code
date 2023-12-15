import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const artifacts = {
  baseline: {
    env: 'CLAUDE_CODE_2_1_119_BUNDLE',
    bytes: 13_720_987,
    sha256: '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef',
  },
  target: {
    env: 'CLAUDE_CODE_2_1_120_BUNDLE',
    bytes: 13_784_743,
    sha256: 'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  },
}

function loadArtifact(spec) {
  const filename = process.env[spec.env]
  assert.ok(filename, `${spec.env} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, spec.bytes, `${spec.env}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    spec.sha256,
    `${spec.env}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function count(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates the inherited notification queue and closed-issue contract', () => {
  const baseline = loadArtifact(artifacts.baseline)
  const target = loadArtifact(artifacts.target)
  const witnesses = [
    ['closed-issue-notice', 1],
    ['tengu_gouda_loop', 1],
    ['my-closed-issues.json', 1],
    ['token-warning', 2],
    ['closedIssuesLastChecked', 2],
    ['closedIssuesAcknowledged', 5],
  ]
  for (const [fragment, expected] of witnesses) {
    assert.equal(count(baseline, fragment), expected, `baseline: ${fragment}`)
    assert.equal(count(target, fragment), expected, `target: ${fragment}`)
  }
})

test('source restores queue ownership, remote guards, and notice ordering', () => {
  const notifications = compact(
    source('src/components/PromptInput/Notifications.tsx'),
  )
  for (const fragment of [
    "key: 'token-warning'",
    'timeoutMs: 18_000_000',
    'fold: (_previous, next) => next',
    "removeNotification('token-warning')",
    "getRuntimeCapabilities().workspace === 'remote'",
    "getRuntimeCapabilities().workspace !== 'remote' && <SandboxPromptFooterHint />",
    '<ClosedIssueNotice />',
  ]) {
    assert.ok(notifications.includes(compact(fragment)), fragment)
  }
  assert.ok(
    notifications.indexOf('<ClosedIssueNotice />') <
      notifications.indexOf('{notifications.current &&'),
    'queued notification renders after fixed notices',
  )
})

test('source restores the bounded GitHub closed-issue cache and acknowledgement flow', () => {
  const notice = compact(source('src/components/ClosedIssueNotice.tsx'))
  for (const fragment of [
    "'gh', [ 'issue', 'list'",
    "'--author', '@me'",
    "'--state', 'closed'",
    "issue.stateReason === 'COMPLETED'",
    "'cache', 'my-closed-issues.json'",
    'jsonParse(stdout)',
    'jsonStringify(closedIssues)',
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_gouda_loop', false)",
    'elapsed > MAX_VISIBLE_REFRESH_MS',
    "key: 'closed-issue-notice'",
    "priority: 'low'",
    'timeoutMs: NOTICE_TIMEOUT_MS',
  ]) {
    assert.ok(notice.includes(compact(fragment)), fragment)
  }
  const config = source('src/utils/config.ts')
  assert.equal(count(config, 'closedIssuesLastChecked?: number'), 1)
  assert.equal(count(config, 'closedIssuesAcknowledged?: number[]'), 1)
})
