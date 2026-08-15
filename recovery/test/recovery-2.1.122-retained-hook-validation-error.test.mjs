import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const missingEvent =
  'hookSpecificOutput is missing required field "hookEventName"'
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

test('authenticates retained hook validation error shaping', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const offset = bundle.indexOf(missingEvent)
    assert.notEqual(offset, -1, `${release.version}: missing-event diagnostic`)
    const context = bundle.slice(offset - 500, offset + 700)
    assert.match(
      context,
      /\.error\.issues,[^;]+\[0\],[^;]+\.path\.join\("\."\)\|\|"\(root\)"/,
      `${release.version}: first issue is promoted`,
    )
    assert.match(
      context,
      /\.slice\(1\)\.map\([^;]+`  - /,
      `${release.version}: remaining issues are bulleted`,
    )
    assert.match(
      context,
      /Hook JSON output validation failed \\u2014 \$\{/,
      `${release.version}: exact error prefix`,
    )
  }
})

test('source preserves the authenticated first-issue diagnostic contract', () => {
  const source = fs.readFileSync(path.join(repo, 'src/utils/hooks.ts'), 'utf8')
  assert.match(source, /const firstIssue = issues\[0\]/)
  assert.match(source, /firstIssue\.path\.join\('\.'\) \|\| '\(root\)'/)
  assert.match(source, new RegExp(missingEvent))
  assert.match(source, /issues\s*\.slice\(1\)/)
  assert.match(
    source,
    /Hook JSON output validation failed \\u2014 \$\{firstError\}/,
  )
})
