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

test('authenticates the retained Remote Control status row shape', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /createElement\([^,]+,null,"\/remote-control is active",[^;]+" \\xB7 Code in CLI or at ",[^;]+url:[^.]+\.url[^;]+\.url\)\)/,
      `${release.version}: inline dimmed URL row`,
    )
    assert.match(
      bundle,
      /upgradeNudge&&[^;]+flexDirection:"row"[^;]+"\\u23BF  "[^;]+\.upgradeNudge/,
      `${release.version}: upgrade nudge row`,
    )
  }
})

test('source restores the retained Remote Control status rendering', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/messages/SystemTextMessage.tsx'),
    'utf8',
  )
  assert.match(
    source,
    /<Text>\s*\/remote-control is active\s*<Text dimColor>/,
  )
  assert.match(source, /\{' · Code in CLI or at '\}/)
  assert.match(source, /<Link url=\{message\.url\}>\{message\.url\}<\/Link>/)
  assert.match(
    source,
    /<Box flexDirection="row">\s*<Text dimColor>\{'⎿  '\}<\/Text>\s*<Text dimColor>\{message\.upgradeNudge\}<\/Text>/,
  )
  assert.doesNotMatch(source, /ThemedText/)
})
