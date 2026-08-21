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

test('authenticated adjacent bundles retain the empty-detail attach fallback', () => {
  const exactBranch =
    '_.msg?`Couldn\'t attach \\u2014 ${_.msg}`:"Couldn\'t attach to that session"'
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.ok(bundle.includes(exactBranch), `${release.version}: attach branch`)
    assert.equal(
      bundle.split('Couldn\'t attach to that session').length - 1,
      1,
      `${release.version}: fallback cardinality`,
    )
  }
})

test('source preserves detail and falls back for empty or absent detail', () => {
  const source = fs.readFileSync(path.join(repo, 'src/cli/bg.ts'), 'utf8')
  const match = source.match(
    /outcome\.msg\s*\?\s*(`Couldn't attach — \$\{outcome\.msg\}`)\s*:\s*("Couldn't attach to that session")/,
  )
  assert.ok(match, 'attach detail/fallback expression')
  const render = Function(
    'outcome',
    `return outcome.msg ? ${match[1]} : ${match[2]}`,
  )
  assert.equal(render({ msg: 'ECONNRESET' }), 'Couldn\'t attach — ECONNRESET')
  assert.equal(render({ msg: '' }), 'Couldn\'t attach to that session')
  assert.equal(render({}), 'Couldn\'t attach to that session')
})
