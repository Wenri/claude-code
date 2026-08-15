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

test('authenticates the retained bounded auto-copy hint', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const fragment of [
      'auto-copy-config-hint',
      'disable auto-copy in /config',
      'copyOnSelect===void 0',
    ]) {
      assert.equal(
        bundle.split(fragment).length - 1,
        1,
        `${release.version}: ${fragment}`,
      )
    }
    const hint = bundle.indexOf('disable auto-copy in /config')
    const context = bundle.slice(hint - 700, hint + 200)
    assert.match(context, /===-1/)
    assert.match(bundle, /="auto-copy-config-hint",\w+=10,\w+=5/)
    assert.match(context, />=\w+/)
    assert.match(context, /<\w+/)
    assert.match(context, /===1\?"char":"chars"/)
    assert.match(context, /===\"native\"\?2000:4000/)
  }
})

test('source matches the target auto-copy hint lifecycle', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/components/ScrollKeybindingHandler.tsx'),
    'utf8',
  )
  for (const fragment of [
    "const AUTO_COPY_CONFIG_HINT_ID = 'auto-copy-config-hint'",
    'const AUTO_COPY_CONFIG_HINT_SESSION_GAP = 10',
    'const AUTO_COPY_CONFIG_HINT_MAX_USES = 5',
    "const unit = n === 1 ? 'char' : 'chars'",
    'getGlobalConfig().copyOnSelect === undefined',
    'getSessionsSinceLastShown(AUTO_COPY_CONFIG_HINT_ID)',
    'recordTipShown(AUTO_COPY_CONFIG_HINT_ID)',
    "msg += ' · disable auto-copy in /config'",
    'text => showCopiedToast(text, true)',
  ]) {
    assert.ok(source.includes(fragment), fragment)
  }
})
