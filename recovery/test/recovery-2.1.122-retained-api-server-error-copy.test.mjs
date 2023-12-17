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

const capacityCopy =
  '. The API is at capacity — this is usually temporary. Try again in a moment.'
const serverCopy =
  '. This is a server-side issue, usually temporary — try again in a moment.'
const statusCopy = ' If it persists, check '

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

test('authenticated adjacent bundles retain detailed 529 and 5xx copy', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const decoded = bundle
      .replaceAll('\\u2014', '—')
      .replaceAll('\\u2026', '…')
    for (const copy of [capacityCopy, serverCopy, statusCopy]) {
      assert.equal(
        decoded.split(copy).length - 1,
        1,
        `${release.version}: ${copy}`,
      )
    }
    assert.match(
      decoded,
      /\.replace\(\/\[\.!\?…\]\+\$\/,["']{2}\)/,
      `${release.version}: strip terminal punctuation before 5xx copy`,
    )
  }
})

test('source reconstructs provider-aware detailed server error responses', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/services/api/errors.ts'),
    'utf8',
  )
  for (const copy of [capacityCopy, serverCopy, statusCopy]) {
    assert.equal(source.split(copy).length - 1, 1, copy)
  }
  assert.match(
    source,
    /const statusHint = isFirstPartyCompatibleAPIProvider\(\)[\s\S]*If it persists, check/,
  )
  assert.match(
    source,
    /const detail = formatAPIError\(error\)\.replace\(\/\[\.!\?…\]\+\$\/, ''\)/,
  )
  assert.ok(!source.includes('` · check ${CLAUDE_STATUS_PAGE}`'))
})
