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

const description =
  'Seeds the readFileState cache with a path+mtime entry. Use when a prior Read was removed from context so Edit validation would fail despite the client having observed the Read. The mtime lets the CLI detect if the file changed since the seeded Read — same staleness check as the normal path.'

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

test('authenticated adjacent bundles retain exact seed_read_state metadata', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const encoded = description.replaceAll('—', '\\u2014')
    assert.ok(bundle.includes(encoded), `${release.version}: exact description`)
    assert.match(
      bundle,
      /object\(\{subtype:[\w$]+\.literal\("seed_read_state"\),path:[\w$]+\.string\(\),mtime:[\w$]+\.number\(\)\}\)\.describe\("Seeds the readFileState cache/,
      `${release.version}: schema binding`,
    )
  }
})

test('source reconstructs exact seed_read_state metadata', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/entrypoints/sdk/controlSchemas.ts'),
    'utf8',
  )
  assert.ok(source.includes(description))
  assert.doesNotMatch(source, /removed from context \(e\.g\. by snip\)/)
})
