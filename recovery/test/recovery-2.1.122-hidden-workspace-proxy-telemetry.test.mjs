import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const baselineBundle = process.env.CLAUDE_21121_INNER
const targetBundle = process.env.CLAUDE_21122_INNER

const expectedBundles = {
  baseline: {
    version: '2.1.121',
    bytes: 13_908_188,
    sha256: '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  target: {
    version: '2.1.122',
    bytes: 13_949_544,
    sha256: 'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
}

function readAuthenticatedBundle(bundlePath, expected) {
  assert.ok(bundlePath, `missing authenticated ${expected.version} bundle path`)
  const contents = fs.readFileSync(bundlePath)
  assert.equal(contents.byteLength, expected.bytes)
  assert.equal(
    crypto.createHash('sha256').update(contents).digest('hex'),
    expected.sha256,
  )
  return contents.toString('utf8')
}

function count(text, needle) {
  return text.split(needle).length - 1
}

test('2.1.122 adds detailed workspace Bash proxy telemetry', () => {
  const baseline = readAuthenticatedBundle(
    baselineBundle,
    expectedBundles.baseline,
  )
  const target = readAuthenticatedBundle(targetBundle, expectedBundles.target)

  assert.equal(count(baseline, 'full_command'), 2)
  assert.equal(count(target, 'full_command'), 3)
  const proxyFieldMapping =
    'full_command:e.command,...e.timeout_ms!==void 0&&{timeout:e.timeout_ms}'
  assert.equal(count(baseline, proxyFieldMapping), 0)
  assert.equal(count(target, proxyFieldMapping), 1)
})

test('source preserves the target workspace Bash proxy field mapping', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const parser = fs.readFileSync(
    path.join(root, 'src/utils/permissions/permissionRuleParser.ts'),
    'utf8',
  )
  const execution = fs.readFileSync(
    path.join(root, 'src/services/tools/toolExecution.ts'),
    'utf8',
  )

  assert.match(
    parser,
    /export const WORKSPACE_BASH_TOOL_NAME = 'mcp__workspace__bash'/,
  )
  assert.match(parser, /Bash: \[WORKSPACE_BASH_TOOL_NAME\]/)
  assert.match(execution, /tool\.name === WORKSPACE_BASH_TOOL_NAME/)
  assert.match(execution, /typeof processedInput\.command === 'string'/)
  assert.match(execution, /bash_command: bashCommand/)
  assert.match(execution, /full_command: workspaceBashInput\.command/)
  assert.match(execution, /timeout: workspaceBashInput\.timeout_ms/)
})
