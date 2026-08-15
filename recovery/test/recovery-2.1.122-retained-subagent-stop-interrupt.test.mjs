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

test('authenticates retained interrupted SubagentStop cleanup', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    const anchor = bundle.indexOf(
      '[runAgent] SubagentStop on interrupted query failed:',
    )
    assert.ok(anchor >= 0, `${release.version}: cleanup failure anchor`)
    const cleanup = bundle.slice(anchor - 500, anchor + 100)
    assert.match(cleanup, /name:"SubagentStop",run:async\(\)=>\{if\([\w$]+\)return/)
    assert.match(
      cleanup,
      /for await\(let [\w$]+ of [\w$]+\(void 0,void 0,5000,!1,[\w$]+,[\w$]+,void 0,[\w$]+\.agentType\)\);/,
    )
  }
})

test('source drains SubagentStop before destroying agent-scoped resources', () => {
  const source = fs.readFileSync(
    path.join(repo, 'src/tools/AgentTool/runAgent.ts'),
    'utf8',
  )
  assert.match(
    source,
    /if \(!completedNormally\) \{[\s\S]*?for await \(const _hookResult of executeStopHooks\([\s\S]*?5_000,[\s\S]*?false,[\s\S]*?agentId,[\s\S]*?agentToolUseContext,[\s\S]*?undefined,[\s\S]*?agentDefinition\.agentType,[\s\S]*?\)\)/,
  )
  const hookCleanup = source.indexOf('if (!completedNormally) {')
  const mcpCleanup = source.indexOf('await mcpCleanup()', hookCleanup)
  const registryCleanup = source.indexOf(
    'clearSessionHooks(rootSetAppState, agentId)',
    hookCleanup,
  )
  assert.ok(hookCleanup >= 0)
  assert.ok(mcpCleanup > hookCleanup)
  assert.ok(registryCleanup > mcpCleanup)
})
