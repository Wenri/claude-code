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

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

test('authenticated adjacent bundles retain exact channel filtering and handler lifecycle', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, "meta key(s) that don't match"),
      1,
      `${release.version}: unsafe meta diagnostic cardinality`,
    )
    assert.match(
      bundle,
      /Object\.entries\([^)]*\),\[[\w$]+,[\w$]+\]=[\w$]+\([^,]+,\(\[[\w$]+\]\)=>[\w$]+\.test\([\w$]+\)\);if\([^)]*\.length>0\)[\w$]+\(`\[channel\] \$\{H\}: dropped \$\{[^}]+\} meta key\(s\) that don't match \$\{[^}]+\.source\}: \$\{[^}]+\.map\(\(\[[\w$]+\]\)=>[\w$]+\)\.join\(", "\)\}`,\{level:"warn"\}\)/,
      `${release.version}: partition and warn before rendering attributes`,
    )
    assert.match(
      bundle,
      /new Set\),[\w$]+=[\w$]+\.useRef\(new Set\),[\w$]+=[\w$]+\.useRef\(null\)/,
      `${release.version}: warning and registered-server sets precede callback ref`,
    )
    assert.match(
      bundle,
      /\.kind==="auth"\|\|[^;]+\.kind==="disabled"\|\|[^;]+\.kind==="capability"[\s\S]{0,350}?\.current\.has\([^)]*\.name\)[\s\S]{0,350}?removeNotificationHandler\("notifications\/claude\/channel"\)[\s\S]{0,180}?removeNotificationHandler\([^)]*\)/,
      `${release.version}: transient skips remove both handlers`,
    )
    assert.match(
      bundle,
      /Channel gate says skip:\$\{[^}]+\.kind\} but was previously registered \\u2014 preserving handler/,
      `${release.version}: stable skip preserves prior registration`,
    )
    assert.match(
      bundle,
      /registered:[\w$]+,skip_kind:[^,]+\.action==="skip"\?[^:]+\.kind:void 0/,
      `${release.version}: telemetry uses effective registration state`,
    )
  }
})

test('source reproduces exact channel meta and re-gating semantics', () => {
  const notification = fs.readFileSync(
    path.join(repo, 'src/services/mcp/channelNotification.ts'),
    'utf8',
  )
  const manager = fs.readFileSync(
    path.join(repo, 'src/services/mcp/useManageMCPConnections.ts'),
    'utf8',
  )

  assert.match(
    notification,
    /const entries = Object\.entries\(meta \?\? \{\}\)[\s\S]{0,180}?const accepted = entries\.filter\(\(\[key\]\) => SAFE_META_KEY\.test\(key\)\)[\s\S]{0,180}?const dropped = entries\.filter\(\(\[key\]\) => !SAFE_META_KEY\.test\(key\)\)/,
  )
  assert.match(
    notification,
    /\[channel\] \$\{serverName\}: dropped \$\{dropped\.length\} meta key\(s\) that don't match \$\{SAFE_META_KEY\.source\}: \$\{dropped\.map\(\(\[key\]\) => key\)\.join\(', '\)\}[\s\S]{0,80}?\{ level: 'warn' \}/,
  )
  assert.match(
    manager,
    /channelRegisteredServersRef = useRef<Set<string>>\(new Set\(\)\)[\s\S]{0,18000}?const registerChannelHandlers = \(\) => \{\s*channelRegisteredServersRef\.current\.add\(client\.name\)/,
  )
  assert.match(
    manager,
    /const transient =\s*gate\.kind === 'auth' \|\|\s*gate\.kind === 'disabled' \|\|\s*gate\.kind === 'capability'[\s\S]{0,300}?channelRegisteredServersRef\.current\.has\(client\.name\)[\s\S]{0,450}?removeNotificationHandler\(\s*'notifications\/claude\/channel'[\s\S]{0,180}?removeNotificationHandler\(\s*CHANNEL_PERMISSION_METHOD[\s\S]{0,300}?Channel gate says skip:\$\{gate\.kind\} but was previously registered — preserving handler[\s\S]{0,180}?registerChannelHandlers\(\)[\s\S]{0,100}?registered = true/,
  )
  assert.match(
    manager,
    /registered \|\|\s*\(gate\.action === 'skip' && gate\.kind !== 'capability'\)[\s\S]{0,180}?registered,[\s\S]{0,180}?skip_kind:/,
  )
  assert.equal(
    occurrences(manager, 'channelRegisteredServersRef.current.delete('),
    4,
    'transient skip, local close, stale cleanup, and manual disable clear state',
  )
})
