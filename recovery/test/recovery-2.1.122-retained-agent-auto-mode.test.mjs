import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = {
  baseline: {
    names: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  target: {
    names: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
}

function loadBundle({ names, bytes, sha256 }) {
  const filename = names.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${names.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, bytes)
  assert.equal(crypto.createHash('sha256').update(value).digest('hex'), sha256)
  return value.toString('utf8')
}

test('authenticated adjacent releases retain unconditional parent auto-mode preservation', () => {
  for (const [name, release] of Object.entries(releases)) {
    const bundle = loadBundle(release)
    const matches = bundle.match(
      /\.mode!=="bypassPermissions"&&[\w$]+\.mode!=="acceptEdits"&&[\w$]+\.mode!=="auto"/g,
    )
    assert.equal(matches?.length, 1, `${name}: agent permission override guard`)
  }
})

test('source never overrides an auto-mode parent with the agent default', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/tools/AgentTool/runAgent.ts'),
    'utf8',
  )
  assert.match(
    source,
    /agentPermissionMode &&\s*parentContext\.mode !== 'bypassPermissions' &&\s*parentContext\.mode !== 'acceptEdits' &&\s*parentContext\.mode !== 'auto'/,
  )
  assert.doesNotMatch(
    source,
    /feature\('TRANSCRIPT_CLASSIFIER'\) &&\s*parentContext\.mode === 'auto'/,
  )
})
