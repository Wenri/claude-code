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
    growthBookTimeout: 300,
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    growthBookTimeout: 1500,
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

test('authenticates startup phase timing and the 2.1.122 GB wait', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const phase of [
      'plugin_mcp_reconcile_ms',
      'first_message_read_ms',
      'plugin_install_ms',
      'gb-before-tools',
    ]) {
      assert.equal(
        bundle.split(phase).length - 1,
        1,
        `${release.version}: ${phase}`,
      )
    }
    const gbIndex = bundle.indexOf('gb-before-tools')
    const gbContext = bundle.slice(gbIndex - 200, gbIndex + 40)
    assert.ok(
      gbContext.includes(`,${release.growthBookTimeout},`),
      `${release.version}: ${release.growthBookTimeout}ms GB wait`,
    )
  }
})

test('source records the target phases and hydrates GB after setup, before tools', () => {
  const print = fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8')
  const main = fs.readFileSync(path.join(repo, 'src/main.tsx'), 'utf8')

  for (const fragment of [
    "recordRemoteStartupPhase('first_message_read_ms', performance.now())",
    "'plugin_mcp_reconcile_ms'",
    "'plugin_install_ms'",
    'performance.now() - reconcileStartedAt',
    'performance.now() - pluginInstallStartedAt',
  ]) {
    assert.ok(print.includes(fragment), fragment)
  }
  const reconcile = print.slice(
    print.indexOf('const reconcileStartedAt'),
    print.indexOf('return pluginsInstalled'),
  )
  assert.ok(
    reconcile.indexOf('await applyPluginMcpDiff') <
      reconcile.indexOf("'plugin_mcp_reconcile_ms'"),
  )

  const setupDone = main.indexOf('await setupPromise')
  const gbWait = main.indexOf("'gb-before-tools'")
  const toolBuild = main.indexOf('tools = getTools(toolPermissionContext)', gbWait)
  assert.ok(setupDone !== -1 && setupDone < gbWait)
  assert.ok(gbWait < toolBuild)
  assert.match(
    main.slice(gbWait - 300, gbWait + 100),
    /initializeGrowthBook\(\)[\s\S]*1500/,
  )
})
