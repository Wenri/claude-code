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

test('authenticates retained remote-control precedence and remote option grammar', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const conflictAnchor = bundle.indexOf(
      'Remote Control is not available inside --remote sessions.',
    )
    assert.ok(conflictAnchor >= 0, `${release.version}: remote conflict`)
    const conflict = bundle.slice(conflictAnchor - 250, conflictAnchor + 550)
    assert.match(
      conflict,
      /!==null\)[A-Za-z_$][\w$]*="Remote Control is not available inside --remote sessions\.";else if\([A-Za-z_$][\w$]*\)[A-Za-z_$][\w$]*="--teleport sessions start without Remote Control\. Use \/remote-control to enable it\.";else/,
    )
    assert.match(conflict, /--rc flag ignored\./)

    const optionAnchor = bundle.indexOf('--remote [description|session_id|url]')
    assert.ok(optionAnchor >= 0, `${release.version}: remote option grammar`)
    assert.ok(
      bundle
        .slice(optionAnchor, optionAnchor + 300)
        .includes(
          'Create a remote session with the given description, or attach to an existing one by session ID or claude.ai/code URL',
        ),
      `${release.version}: attach-capable option description`,
    )
  }
})

test('source preserves remote over teleport over entitlement precedence', () => {
  const source = fs.readFileSync(path.join(repo, 'src/main.tsx'), 'utf8')
  const remoteConflict = source.indexOf(
    "if (remote !== null) {\n          disabledReason = 'Remote Control is not available inside --remote sessions.';",
  )
  const teleportConflict = source.indexOf(
    "} else if (teleport) {\n          disabledReason = '--teleport sessions start without Remote Control. Use /remote-control to enable it.';",
  )
  const entitlement = source.indexOf(
    "disabledReason = await getBridgeDisabledReason();",
    teleportConflict,
  )
  assert.ok(remoteConflict >= 0)
  assert.ok(teleportConflict > remoteConflict)
  assert.ok(entitlement > teleportConflict)
  assert.ok(
    source.includes(
      "new Option('--remote [description|session_id|url]', 'Create a remote session with the given description, or attach to an existing one by session ID or claude.ai/code URL')",
    ),
  )
})
