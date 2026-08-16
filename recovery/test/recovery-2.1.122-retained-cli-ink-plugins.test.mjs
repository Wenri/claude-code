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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const rootHandlers = [
  'pluginValidateHandler',
  'pluginTagHandler',
  'pluginListHandler',
  'marketplaceAddHandler',
  'marketplaceListHandler',
  'marketplaceRemoveHandler',
  'marketplaceUpdateHandler',
  'pluginInstallHandler',
  'pluginUninstallHandler',
  'pluginPruneHandler',
  'pluginEnableHandler',
  'pluginDisableHandler',
]

test('authenticates the complete retained plugin Ink handler boundary', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const aliases = Object.fromEntries(
      rootHandlers.map(name => {
        const alias = bundle.match(new RegExp(`${name}:\\(\\)=>([\\w$]+)`))?.[1]
        assert.ok(alias, `${release.version}: ${name} alias`)
        return [name, alias]
      }),
    )
    for (const [name, alias] of Object.entries(aliases)) {
      assert.match(
        bundle,
        new RegExp(`async function ${escapeRegex(alias)}\\([\\w$]+`),
        `${release.version}: ${name} accepts Root first`,
      )
    }

    assert.equal(
      bundle.split('Adding marketplace\\u2026').length - 1,
      1,
      `${release.version}: exact marketplace Suspense fallback`,
    )
    assert.ok(bundle.includes('Installing plugin "${'))
    assert.ok(bundle.includes('Validation passed with warnings'))
    assert.ok(bundle.includes('No marketplaces configured'))

    const commandStart = bundle.lastIndexOf('Manage Claude Code plugins')
    assert.ok(commandStart >= 0, `${release.version}: plugin CLI command block`)
    const commands = bundle.slice(commandStart, commandStart + 18_000)
    assert.ok(
      commands.split('createSubcommandRoot').length - 1 >= rootHandlers.length,
      `${release.version}: every Ink plugin command creates a Root`,
    )
  }
})

test('source renders every retained plugin result through its Root', () => {
  const handlers = fs.readFileSync(
    path.join(repo, 'src/cli/handlers/plugins.ts'),
    'utf8',
  )
  const commands = fs.readFileSync(
    path.join(repo, 'src/services/plugins/pluginCliCommands.ts'),
    'utf8',
  )
  const main = fs.readFileSync(path.join(repo, 'src/main.tsx'), 'utf8')

  for (const name of rootHandlers) {
    assert.match(
      handlers,
      new RegExp(`function ${name}\\(\\n?\\s*root: Root`),
      name,
    )
    assert.match(
      main,
      new RegExp(`${name}\\(await createSubcommandRoot\\(\\),`),
      `${name} main Root call`,
    )
  }
  assert.ok(handlers.includes("React.Suspense"))
  assert.ok(handlers.includes("'Adding marketplace…'"))
  assert.ok(handlers.includes('`Installing plugin "${plugin}"...`'))
  assert.ok(handlers.split('React.use(promise)').length - 1 >= 3)
  assert.ok(handlers.split('await root.waitUntilExit()').length - 1 >= 12)
  assert.ok(!handlers.includes('cliOk('))
  assert.ok(!handlers.includes('console.log('))

  assert.match(commands, /function installPlugin\([\s\S]*?\): Promise<string>/)
  assert.match(commands, /function uninstallPlugin\([\s\S]*?\): Promise<string>/)
  assert.match(commands, /function prunePlugins\([\s\S]*?\): Promise<string>/)
  assert.ok(commands.includes('return result.message'))
  assert.ok(commands.includes('!result.alreadyUpToDate && !result.skipped'))
})
