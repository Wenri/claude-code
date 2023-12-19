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

const allowHelp =
  'Comma or space-separated list of tool names to allow (e.g. "Bash(git *) Edit")'
const denyHelp =
  'Comma or space-separated list of tool names to deny (e.g. "Bash(git *) Edit")'
const prefillB64Help =
  'Base64url-encoded --prefill value (deep-link shell-safe launch paths)'
const cwdB64Help =
  'Base64url-encoded working directory (deep-link shell-safe launch paths)'

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

function assertOrdered(contents, fragments, label) {
  let previous = -1
  for (const fragment of fragments) {
    const index = contents.indexOf(fragment, previous + 1)
    assert.ok(index > previous, `${label}: ${fragment}`)
    previous = index
  }
}

test('authenticated adjacent bundles retain exact CLI option metadata and order', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const fragment of [allowHelp, denyHelp, prefillB64Help, cwdB64Help]) {
      assert.ok(bundle.includes(fragment), `${release.version}: ${fragment}`)
    }
    assertOrdered(
      bundle,
      [
        '--prefill <text>',
        '--deep-link-origin',
        '--deep-link-repo <slug>',
        '--deep-link-last-fetch <ms>',
        '--prefill-b64 <b64>',
        '--deep-link-cwd-b64 <b64>',
        '--from-pr [value]',
      ],
      release.version,
    )
  }
})

test('source reconstructs exact CLI option metadata and order', () => {
  const source = fs.readFileSync(path.join(repo, 'src/main.tsx'), 'utf8')
  for (const fragment of [allowHelp, denyHelp, prefillB64Help, cwdB64Help]) {
    assert.ok(source.includes(fragment), fragment)
  }
  assertOrdered(
    source,
    [
      '--prefill <text>',
      '--deep-link-origin',
      '--deep-link-repo <slug>',
      '--deep-link-last-fetch <ms>',
      '--prefill-b64 <b64>',
      '--deep-link-cwd-b64 <b64>',
      '--from-pr [value]',
    ],
    'source',
  )
  assert.doesNotMatch(source, /Bash\(git:\*\) Edit/)
})
