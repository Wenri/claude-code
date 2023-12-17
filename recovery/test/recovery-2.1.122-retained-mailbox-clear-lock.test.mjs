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
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function assertOrder(text, ...needles) {
  let cursor = -1
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1)
    assert.ok(next > cursor, `${needle} is missing or out of order`)
    cursor = next
  }
}

test('authenticates retained mailbox clear lock and compromise handler', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const anchor = bundle.indexOf('[TeammateMailbox] Cleared inbox for')
    assert.ok(anchor >= 0, `${release.version}: clear anchor`)
    const clear = bundle.slice(anchor - 350, anchor + 400)

    assert.match(
      clear,
      /await [\w$]+\([\w$]+,\{lockfilePath:[\w$]+,\.\.\.[\w$]+\}\),await [\w$]+\.writeFile\([\w$]+,"\[\]",\{encoding:"utf-8"\}\)/,
      `${release.version}: clear locks before truncation`,
    )
    assert.match(
      clear,
      /finally\{await [\w$]+\?\.\(\)\}/,
      `${release.version}: clear releases in finally`,
    )
    assert.match(
      bundle,
      /\{retries:\{retries:10,minTimeout:5,maxTimeout:100\},onCompromised:\(([\w$]+)\)=>[\w$]+\(\1\)\}/,
      `${release.version}: compromised locks are logged`,
    )
  }
})

test('source serializes clearMailbox with every other inbox mutation', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/teammateMailbox.ts'),
    'utf8',
  )
  const from = source.indexOf('export async function clearMailbox')
  const to = source.indexOf('/**\n * Format teammate messages', from)
  assert.ok(from >= 0 && to > from)
  const clear = source.slice(from, to)

  assert.ok(
    source.includes('onCompromised: (error: Error) => logError(error)'),
  )
  assertOrder(
    clear,
    'const lockFilePath = `${inboxPath}.lock`',
    'release = await lockfile.lock(inboxPath, {',
    'lockfilePath: lockFilePath',
    '...LOCK_OPTIONS',
    "await writeFile(inboxPath, '[]', { encoding: 'utf-8' })",
    "if (code === 'ENOENT')",
    'finally',
    'await release?.()',
  )
  assert.doesNotMatch(clear, /flag:\s*'r\+'/)
})
