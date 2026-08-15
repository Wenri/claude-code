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
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
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

test('authenticated adjacent bundles retain rendezvous and release-note exports', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const name of [
      'sendRv',
      'formatVersion',
      'formatAll',
      'ReleaseNotesPicker',
    ]) {
      assert.equal(
        bundle.split(name).length - 1,
        1,
        `${release.version}: ${name} export cardinality`,
      )
    }
    assert.match(
      bundle,
      /formatVersion:\(\)=>[\w$]+,formatAll:\(\)=>[\w$]+,call:\(\)=>[\w$]+,ReleaseNotesPicker:\(\)=>[\w$]+/,
      `${release.version}: release-note export order`,
    )
    assert.match(
      bundle,
      /sendRv:\(\)=>[\w$]+/,
      `${release.version}: rendezvous export`,
    )
  }
})

test('source delegates live behavior through the retained helper names', () => {
  const rendezvous = fs.readFileSync(
    path.join(repo, 'src/daemon/rendezvous.ts'),
    'utf8',
  )
  const classifier = fs.readFileSync(
    path.join(repo, 'src/jobs/classifier.ts'),
    'utf8',
  )
  const releaseNotes = fs.readFileSync(
    path.join(repo, 'src/commands/release-notes/release-notes.tsx'),
    'utf8',
  )

  assert.match(rendezvous, /export function sendRv\(message: unknown\)/)
  assert.match(rendezvous, /export const sendRendezvous = sendRv/)
  assert.equal(rendezvous.split('sendRv(').length - 1, 3)
  assert.match(classifier, /import \{ sendRv \}/)
  assert.match(classifier, /sendRv\(\{ type: 'state', patch \}\)/)

  assert.match(releaseNotes, /export function formatVersion\(/)
  assert.match(releaseNotes, /export function formatAll\(/)
  assert.match(releaseNotes, /export function ReleaseNotesPicker\(/)
  assert.equal(releaseNotes.split('formatVersion(').length - 1, 3)
  assert.equal(releaseNotes.split('formatAll(').length - 1, 2)
})
