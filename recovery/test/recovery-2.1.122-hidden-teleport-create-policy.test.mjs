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
    hasCreatePolicyGate: false,
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    hasCreatePolicyGate: true,
  },
]

function readBundle(release) {
  const filename = release.envNames
    .map(name => process.env[name])
    .find(Boolean)
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

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates the target-only remote-session creation policy gate', () => {
  const policyGate =
    /if\(![\w$]+\("allow_remote_sessions"\)\)return [\w$]+\.onCreateFail\?\.\("Remote sessions are disabled by your organization's policy\."\),null;try\{/

  for (const release of releases) {
    assert.equal(
      policyGate.test(readBundle(release)),
      release.hasCreatePolicyGate,
      release.version,
    )
  }
})

test('rejects before authentication and reports through the create callback', () => {
  const source = compact(
    fs.readFileSync(path.join(repo, 'src/utils/teleport.tsx'), 'utf8'),
  )
  const functionStart = source.indexOf(
    'export async function teleportToRemote(options:',
  )
  const gate = source.indexOf(
    compact(`if (!isPolicyAllowed('allow_remote_sessions')) {
      options.onCreateFail?.(
        "Remote sessions are disabled by your organization's policy.",
      );
      return null;
    }`),
    functionStart,
  )
  const authenticate = source.indexOf(
    'await checkAndRefreshOAuthTokenIfNeeded()',
    functionStart,
  )

  assert.notEqual(functionStart, -1)
  assert.notEqual(gate, -1)
  assert.notEqual(authenticate, -1)
  assert.ok(gate < authenticate)
})
