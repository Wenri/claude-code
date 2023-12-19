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

test('authenticates the retained user tmux session listing API', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /\["-S",\w+,"list-sessions","-F","#\{session_name\}"\],\{useCwd:!1,timeout:2000\}/,
      `${release.version}: original-server tmux query`,
    )
    assert.match(
      bundle,
      /listUserTmuxSessions:\(\)=>\w+/,
      `${release.version}: retained namespace export`,
    )
  }
})

test('source lists sessions through the captured user tmux socket', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/swarm/backends/detection.ts'),
    'utf8',
  )

  assert.match(
    source,
    /export async function listUserTmuxSessions\(\): Promise<string\[\] \| undefined>/,
  )
  assert.match(source, /const socketPath = ORIGINAL_USER_TMUX\.split\(','\)\[0\]/)
  assert.match(
    source,
    /\['-S', socketPath, 'list-sessions', '-F', '#\{session_name\}'\]/,
  )
  assert.match(source, /\{ useCwd: false, timeout: 2000 \}/)
  assert.match(source, /result\.stdout\.split\('\\n'\)\.filter\(Boolean\)/)
})
