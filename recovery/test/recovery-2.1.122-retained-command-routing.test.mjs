import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

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

function commandSets(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  const descriptors = new Map()
  const aliases = new Map()
  const sets = []

  function literalProperty(object, key) {
    for (const property of object.properties ?? []) {
      if (property.type !== 'Property' || property.computed) continue
      const propertyName =
        property.key.type === 'Identifier'
          ? property.key.name
          : property.key.value
      if (propertyName === key && property.value.type === 'Literal') {
        return property.value.value
      }
    }
  }

  function record(identifier, value) {
    if (identifier?.type !== 'Identifier' || !value) return
    if (value.type === 'ObjectExpression') {
      const type = literalProperty(value, 'type')
      const name = literalProperty(value, 'name')
      if (typeof type === 'string' && typeof name === 'string') {
        descriptors.set(identifier.name, { name, type })
      }
    } else if (value.type === 'Identifier') {
      aliases.set(identifier.name, value.name)
    } else if (
      value.type === 'NewExpression' &&
      value.callee.type === 'Identifier' &&
      value.callee.name === 'Set' &&
      value.arguments[0]?.type === 'ArrayExpression'
    ) {
      sets.push(value.arguments[0])
    }
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'VariableDeclarator') record(node.id, node.init)
    if (node.type === 'AssignmentExpression' && node.operator === '=') {
      record(node.left, node.right)
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue
      if (Array.isArray(value)) value.forEach(walk)
      else if (value?.type) walk(value)
    }
  }
  walk(ast)

  let changed = true
  while (changed) {
    changed = false
    for (const [left, right] of aliases) {
      if (!descriptors.has(left) && descriptors.has(right)) {
        descriptors.set(left, descriptors.get(right))
        changed = true
      }
    }
  }

  function identifiers(node, output = []) {
    if (!node) return output
    if (node.type === 'Identifier') output.push(node.name)
    else if (node.type === 'SpreadElement') identifiers(node.argument, output)
    else if (node.type === 'ConditionalExpression') {
      identifiers(node.consequent, output)
      identifiers(node.alternate, output)
    } else if (node.type === 'ArrayExpression') {
      node.elements.forEach(element => identifiers(element, output))
    }
    return output
  }

  return sets.map(array =>
    identifiers(array)
      .map(identifier => descriptors.get(identifier))
      .filter(Boolean),
  )
}

const remoteNames = [
  'session',
  'exit',
  'help',
  'theme',
  'color',
  'usage',
  'copy',
  'feedback',
  'mobile',
  'release-notes',
  'export',
  'doctor',
  'terminal-setup',
  'privacy-settings',
  'focus',
  'powerup',
  'passes',
  'extra-usage',
  'rename',
  'btw',
  'context',
  'plan',
  'effort',
  'fast',
  'model',
  'version',
  'clear',
  'compact',
  'stickers',
  'toggle-memory',
  'reload-plugins',
]

const bridgeNames = [
  'compact',
  'autocompact',
  'clear',
  'usage',
  'context',
  'exit',
  'version',
  'extra-usage',
  'rename',
  'color',
  'fast',
  'effort',
  'model',
  'reload-plugins',
  'update',
]

test('authenticates the retained remote and bridge command routing sets', () => {
  for (const release of releases) {
    const source = readBundle(release)
    const sets = commandSets(source)
    const remote = sets.find(set => {
      const names = set.map(command => command.name)
      return names.includes('session') && names.includes('privacy-settings')
    })
    const bridge = sets.find(set => {
      const names = set.map(command => command.name)
      return names.includes('autocompact') && names.includes('update')
    })
    assert.ok(remote, `${release.version}: remote-safe command set`)
    assert.ok(bridge, `${release.version}: bridge-safe command set`)
    assert.deepEqual(
      remote.map(command => command.name),
      remoteNames,
      `${release.version}: resolved remote-safe command order`,
    )
    assert.deepEqual(
      bridge.map(command => command.name),
      bridgeNames,
      `${release.version}: resolved bridge-safe command order`,
    )
    assert.match(
      source,
      /name:"recap",description:"Generate a one-line session recap now"/,
      `${release.version}: retained recap descriptor`,
    )
  }
})

function ordered(source, values, label) {
  let offset = 0
  for (const value of values) {
    const index = source.indexOf(value, offset)
    assert.notEqual(index, -1, `${label}: missing or out of order: ${value}`)
    offset = index + value.length
  }
}

test('source mirrors target command availability and text counterparts', () => {
  const source = fs.readFileSync(path.join(repo, 'src/commands.ts'), 'utf8')
  const remoteStart = source.indexOf('export const REMOTE_SAFE_COMMANDS')
  const bridgeStart = source.indexOf('export const BRIDGE_SAFE_COMMANDS')
  const remote = source.slice(remoteStart, bridgeStart)
  const bridge = source.slice(
    bridgeStart,
    source.indexOf('export function isBridgeSafeCommand', bridgeStart),
  )

  ordered(
    remote,
    [
      'session,',
      'exit,',
      'help,',
      'theme,',
      'color,',
      'usage,',
      'copy,',
      'feedback,',
      'mobile,',
      'releaseNotes,',
      'exportCommand,',
      'doctor,',
      'terminalSetup,',
      'privacySettings,',
      'focus,',
      'powerup,',
      'passes,',
      'extraUsage,',
      'daemonCommand',
      'rename,',
      'btw,',
      'context,',
      'plan,',
      'effort,',
      'fast,',
      'model,',
      'version,',
      'clear,',
      'compact,',
      'summary,',
      'stickers,',
      'toggleMemory,',
      'reloadPlugins,',
      'recap,',
    ],
    'remote-safe source set',
  )
  assert.doesNotMatch(remote, /\bkeybindings,|\bstatusline,/)

  ordered(
    bridge,
    [
      'compact,',
      'autocompactNonInteractive,',
      'clear,',
      'usageNonInteractive,',
      'contextNonInteractive,',
      'summary,',
      'exitNonInteractive,',
      'stopNonInteractive,',
      'versionNonInteractive,',
      'extraUsageNonInteractive,',
      'renameNonInteractive,',
      'colorNonInteractive,',
      'effortNonInteractive,',
      'fastNonInteractive,',
      'modelNonInteractive,',
      'recap,',
      'reloadPlugins,',
      'update,',
    ],
    'bridge-safe source set',
  )
  assert.doesNotMatch(bridge, /\breleaseNotes,/)
  assert.match(
    source,
    /const COMMANDS = memoize[\s\S]*?agents,\n  autocompact,\n  branch,/,
  )
})
