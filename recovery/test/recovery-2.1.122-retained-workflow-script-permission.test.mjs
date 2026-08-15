import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const reason =
  'Workflow script files for current session are allowed for writing'
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

test('authenticates retained workflow-script write permission', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const permissionOffset = bundle.indexOf(reason)
    assert.notEqual(permissionOffset, -1, `${release.version}: permission reason`)

    const helperOffset = bundle.lastIndexOf(
      '"workflows","scripts"',
      permissionOffset,
    )
    assert.ok(helperOffset >= permissionOffset - 13_000)
    const helperAndPermission = bundle.slice(
      helperOffset - 200,
      permissionOffset + reason.length,
    )
    assert.match(
      helperAndPermission,
      /"workflows","scripts"\)\+[^;]{1,20}\.sep/,
      `${release.version}: session workflow directory`,
    )
    assert.match(
      helperAndPermission,
      /\.startsWith\([^)]*\(\)\)&&[^;]+\.endsWith\("\.js"\)/,
      `${release.version}: JavaScript-only path predicate`,
    )
  }
})

test('source allows only current-session workflow JavaScript files', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/utils/permissions/filesystem.ts'),
    'utf8',
  )
  assert.match(
    source,
    /getProjectDir\(getCwd\(\)\)[\s\S]{0,120}?getSessionId\(\)[\s\S]{0,120}?'workflows'[\s\S]{0,60}?'scripts'[\s\S]{0,40}?\+ sep/,
  )
  assert.match(
    source,
    /normalizedPath\.startsWith\(getWorkflowScriptsDir\(\)\)[\s\S]{0,100}?normalizedPath\.endsWith\('\.js'\)/,
  )
  assert.match(source, new RegExp(reason))
})
