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

const contexts = ['Scroll', 'MessageActions', 'Doctor']
const contextDescriptions = [
  'When a scrollable view is focused (fullscreen layout)',
  'When the message actions menu is open (fullscreen layout)',
  'When the /doctor diagnostics screen is open',
]
const actions = [
  'app:openFrame',
  'select:pageUp',
  'select:pageDown',
  'select:first',
  'select:last',
  'doctor:fix',
  'scroll:pageUp',
  'scroll:pageDown',
  'scroll:lineUp',
  'scroll:lineDown',
  'scroll:top',
  'scroll:bottom',
  'scroll:halfPageUp',
  'scroll:halfPageDown',
  'scroll:fullPageUp',
  'scroll:fullPageDown',
  'selection:copy',
  'selection:clear',
  'selection:extendLeft',
  'selection:extendRight',
  'selection:extendUp',
  'selection:extendDown',
  'selection:extendLineStart',
  'selection:extendLineEnd',
]
const messageActionDescription =
  'Message action binding (e.g., "messageActions:copy"). Triggers a registered message action.'
const invalidMessageAction =
  'action name may only contain alphanumeric characters, colons, hyphens, and underscores'
const moveMessageAction =
  'Move this binding to a block with "context": "MessageActions"'

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

function readJsonArrayStartingWith(bundle, prefix) {
  const start = bundle.indexOf(prefix)
  assert.ok(start >= 0, `bundle array starts with ${prefix}`)
  const end = bundle.indexOf(']', start)
  assert.ok(end > start, `bundle array ends after ${prefix}`)
  return JSON.parse(bundle.slice(start, end + 1))
}

function readSourceConstArray(source, name) {
  const match = source.match(
    new RegExp(`(?:export )?const ${name}(?::[^=]+)? = \\[([\\s\\S]*?)\\](?: as const)?`),
  )
  assert.ok(match, `${name}: source const array`)
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1])
}

test('authenticated adjacent bundles retain expanded keybinding schema', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const value of [
      ...contexts,
      ...contextDescriptions,
      ...actions,
      messageActionDescription,
      invalidMessageAction,
      moveMessageAction,
    ]) {
      assert.ok(bundle.includes(value), `${release.version}: ${value}`)
    }
    const descriptionAt = bundle.indexOf(messageActionDescription)
    assert.ok(descriptionAt >= 0)
    assert.ok(
      bundle.slice(descriptionAt - 80, descriptionAt).includes('.string().regex('),
      `${release.version}: dynamic message action schema binding`,
    )
    assert.ok(
      bundle.includes('/^messageActions:[a-zA-Z0-9:\\-_]+$/'),
      `${release.version}: dynamic message action pattern`,
    )
  }
})

test('source reconstructs contexts, actions, schema, and validation', () => {
  const schema = fs.readFileSync(
    path.join(repo, 'src/keybindings/schema.ts'),
    'utf8',
  )
  const validate = fs.readFileSync(
    path.join(repo, 'src/keybindings/validate.ts'),
    'utf8',
  )
  for (const value of [...contexts, ...contextDescriptions, ...actions]) {
    assert.ok(schema.includes(`'${value}'`), `schema: ${value}`)
  }
  for (const context of contexts) {
    assert.ok(validate.includes(`'${context}'`), `validator context: ${context}`)
  }
  assert.ok(schema.includes(messageActionDescription))
  assert.ok(validate.includes(invalidMessageAction))
  assert.ok(validate.includes(moveMessageAction))
  for (const source of [schema, validate]) {
    assert.match(source, /\^messageActions:\[a-zA-Z0-9:\\-_\]\+\$/)
  }
  assert.match(
    validate,
    /action\.startsWith\('messageActions:'\)[\s\S]*contextName !== 'MessageActions'/,
  )

  const target = readBundle(releases[1])
  const targetContexts = readJsonArrayStartingWith(
    target,
    '["Global","Chat","Autocomplete","Confirmation"',
  )
  const targetActions = readJsonArrayStartingWith(
    target,
    '["app:interrupt","app:exit","app:toggleTodos"',
  )
  assert.deepEqual(
    readSourceConstArray(schema, 'KEYBINDING_CONTEXTS'),
    targetContexts,
    'source context names and order match authenticated target',
  )
  assert.deepEqual(
    readSourceConstArray(validate, 'VALID_CONTEXTS'),
    targetContexts,
    'validator context names and order match authenticated target',
  )
  assert.deepEqual(
    readSourceConstArray(schema, 'KEYBINDING_ACTIONS'),
    targetActions,
    'source action names and order match authenticated target',
  )
})
