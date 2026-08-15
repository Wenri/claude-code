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
    onReplyError: 0,
    replyError: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    onReplyError: 2,
    replyError: 2,
  },
]

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

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

test('authenticates the target-only FleetView reply-error surface', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const identifier of ['onReplyError', 'replyError']) {
      assert.equal(
        occurrences(bundle, identifier),
        release[identifier],
        `${release.version}: ${identifier}`,
      )
    }
  }
})

test('guards reply submission and restores both returned and thrown failures', () => {
  const fleet = compact(source('src/components/FleetView.tsx'))
  for (const fragment of [
    'const replyInFlight = useRef(false)',
    'if (replyInFlight.current) return',
    'const attachSelectedFromReply = (): void => { if (!selected || replyInFlight.current) return replyInFlight.current = true setDetail(false) openJob(selected) }',
    "if (!text && replyMode === 'prompt') { attachSelectedFromReply() return }",
    "if (key.rightArrow && !reply && replyMode === 'prompt') { attachSelectedFromReply() return }",
    "const restoreReply = (): void => { if (replyRef.current === '') { replyDrafts.current.set(selected.id, outgoing) replyRef.current = text setReply(text) setReplyCursor(text.length) } if (replyModeRef.current === 'prompt') { replyModeRef.current = mode setReplyMode(mode) } }",
    'result => { if (result) { restoreReply() setReplyError(result) } void poll() }',
    'caught => { restoreReply() setReplyError(errorMessage(caught)) }',
    '.finally(() => { replyInFlight.current = false',
  ]) {
    assert.ok(fleet.includes(compact(fragment)), fragment)
  }
  assert.equal(occurrences(fleet, 'restoreReply()'), 2)
})

test('tracks live reply text and mode so restoration never overwrites edits', () => {
  const fleet = compact(source('src/components/FleetView.tsx'))
  for (const fragment of [
    "const replyRef = useRef('')",
    "const replyModeRef = useRef<'prompt' | 'bash'>('prompt')",
    'onChange={value => { replyRef.current = value setReply(value) }}',
    "replyModeRef.current = 'bash' setReplyMode('bash')",
    "replyModeRef.current = 'prompt' setReplyMode('prompt')",
  ]) {
    assert.ok(fleet.includes(compact(fragment)), fragment)
  }
})
