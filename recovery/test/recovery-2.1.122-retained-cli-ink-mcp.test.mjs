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

test('authenticates retained MCP Root handlers and Suspense health output', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const aliases = Object.fromEntries(
      ['mcpRemoveHandler', 'mcpListHandler', 'mcpGetHandler', 'mcpAddJsonHandler', 'mcpResetChoicesHandler'].map(name => {
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
      bundle.split('Checking MCP server health\\u2026').length - 1,
      1,
      `${release.version}: exact live health fallback`,
    )
    const listStart = bundle.indexOf(`async function ${aliases.mcpListHandler}`)
    const list = bundle.slice(listStart, listStart + 2_200)
    assert.match(list, /\.Suspense,\{fallback:/)
    assert.match(list, /\.render\(/)
    assert.match(list, /\.waitUntilExit\(\)/)

    const commandStart = bundle.indexOf('List configured MCP servers. Note:')
    const commands = bundle.slice(commandStart - 800, commandStart + 4_500)
    assert.ok(commandStart >= 0)
    assert.ok(
      commands.split('createSubcommandRoot').length - 1 >= 5,
      `${release.version}: MCP command actions create Roots`,
    )
  }
})

test('source routes the complete MCP Ink handler boundary through Roots', () => {
  const handlers = fs.readFileSync(
    path.join(repo, 'src/cli/handlers/mcp.tsx'),
    'utf8',
  )
  const main = fs.readFileSync(path.join(repo, 'src/main.tsx'), 'utf8')

  for (const signature of [
    'mcpRemoveHandler(root: Root,',
    'mcpListHandler(root: Root)',
    'mcpGetHandler(root: Root,',
    'mcpAddJsonHandler(root: Root,',
    'mcpResetChoicesHandler(root: Root)',
  ]) {
    assert.ok(handlers.includes(signature), signature)
  }
  assert.match(
    handlers,
    /<React\.Suspense fallback=\{<Text>Checking MCP server health…\{'\\n\\n'\}<\/Text>\}>/,
  )
  assert.ok(!handlers.includes("console.log('Checking MCP server health..."))
  assert.ok(handlers.split('await root.waitUntilExit()').length - 1 >= 5)
  assert.ok(main.split('await createSubcommandRoot()').length - 1 >= 5)
  assert.match(main, /mcpRemoveHandler\(await createSubcommandRoot\(\), name, options\)/)
  assert.match(main, /mcpListHandler\(await createSubcommandRoot\(\)\)/)
  assert.match(main, /mcpGetHandler\(await createSubcommandRoot\(\), name\)/)
  assert.match(main, /mcpAddJsonHandler\(await createSubcommandRoot\(\), name, json, options\)/)
  assert.match(main, /mcpResetChoicesHandler\(await createSubcommandRoot\(\)\)/)
})
