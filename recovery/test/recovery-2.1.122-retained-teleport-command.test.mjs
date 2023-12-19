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

test('authenticates the retained local teleport command in both bundles', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const descriptorAnchor = bundle.indexOf(
      'description:"Resume a Claude Code session from claude.ai"',
    )
    assert.ok(descriptorAnchor >= 0, `${release.version}: descriptor`)
    const descriptor = bundle.slice(descriptorAnchor - 100, descriptorAnchor + 500)
    assert.match(descriptor, /type:"local-jsx",name:"teleport"/)
    assert.match(descriptor, /aliases:\["tp"\]/)
    assert.match(descriptor, /allow_remote_sessions/)
    assert.match(descriptor, /isHidden/)

    const successAnchor = bundle.indexOf('Session resumed successfully')
    assert.ok(successAnchor >= 0, `${release.version}: completion`)
    const adapter = bundle.slice(successAnchor - 350, successAnchor + 700)
    assert.match(
      adapter,
      /applyMessageOp\(\{type:"replace-all",messages:[A-Za-z_$][\w$]*\.log\}\)/,
    )
    assert.match(adapter, /Teleport cancelled/)
    assert.match(adapter, /isEmbedded:!0,source:"localCommand"/)
  }
})

test('source restores the descriptor and exact local-JSX adapter behavior', () => {
  const descriptor = fs.readFileSync(
    path.join(repo, 'src/commands/teleport/index.js'),
    'utf8',
  )
  const adapter = fs.readFileSync(
    path.join(repo, 'src/commands/teleport/teleport.tsx'),
    'utf8',
  )

  for (const fragment of [
    "type: 'local-jsx'",
    "name: 'teleport'",
    "aliases: ['tp']",
    "isClaudeAISubscriber() && isPolicyAllowed('allow_remote_sessions')",
    "load: () => import('./teleport.js')",
  ]) {
    assert.ok(descriptor.includes(fragment), fragment)
  }
  for (const fragment of [
    'context.applyMessageOp({',
    "type: 'replace-all'",
    'messages: result.log',
    "onExit('Session resumed successfully', { display: 'system' })",
    "onExit('Teleport cancelled', { display: 'system' })",
    'isEmbedded',
    'source="localCommand"',
  ]) {
    assert.ok(adapter.includes(fragment), fragment)
  }
})
