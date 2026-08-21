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

function count(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates the retained quick-web-setup policy boundary', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      count(bundle, 'allow_quick_web_setup'),
      4,
      `${release.version}: policy check cardinality`,
    )
    assert.match(
      bundle,
      /"tengu_cobalt_lantern",!1\)&&\w+\("allow_remote_sessions"\)&&\w+\("allow_quick_web_setup"\)/,
      `${release.version}: command availability requires both policies`,
    )
    assert.match(
      bundle,
      /return!\w+\("allow_remote_sessions"\)\|\|!\w+\("allow_quick_web_setup"\)/,
      `${release.version}: command stays hidden when either policy denies it`,
    )
  }
})

test('source applies the policy to command and schedule guidance', () => {
  const command = compact(
    fs.readFileSync(
      path.join(repo, 'src/commands/remote-setup/index.ts'),
      'utf8',
    ),
  )
  assert.ok(
    command.includes(
      compact(`
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_lantern', false) &&
        isPolicyAllowed('allow_remote_sessions') &&
        isPolicyAllowed('allow_quick_web_setup')
      `),
    ),
  )
  assert.ok(
    command.includes(
      compact(`
        !isPolicyAllowed('allow_remote_sessions') ||
        !isPolicyAllowed('allow_quick_web_setup')
      `),
    ),
  )

  const schedule = fs.readFileSync(
    path.join(repo, 'src/skills/bundled/scheduleRemoteAgents.ts'),
    'utf8',
  )
  assert.equal(count(schedule, "isPolicyAllowed('allow_quick_web_setup')"), 2)
  assert.match(
    schedule,
    /webSetupEnabled\s*=\s*getFeatureValue_CACHED_MAY_BE_STALE\([\s\S]*?\)\s*&&\s*isPolicyAllowed\('allow_quick_web_setup'\)/,
  )
})
