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
    guardedIsError: 1,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    guardedIsError: 0,
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

test('authenticates the MCP error-result refactor', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, '"isError"in'),
      release.guardedIsError,
      `${release.version}: guarded isError access`,
    )
    assert.equal(
      occurrences(bundle, 'MCP tool returned error'),
      1,
      `${release.version}: error boundary`,
    )
  }
})

test('source preserves every textual MCP error block', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/services/mcp/client.ts'), 'utf8'),
  )
  for (const fragment of [
    'if (result.isError)',
    ".filter( block => block !== null && typeof block === 'object' && 'text' in block, )",
    '.map(block => block.text)',
    "if (textBlocks.length > 0) errorDetails = textBlocks.join('\\n')",
    'result._meta ? { _meta: result._meta } : undefined',
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
  assert.ok(!source.includes(compact("'isError' in result")))
})
