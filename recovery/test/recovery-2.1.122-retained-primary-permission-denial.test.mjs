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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates both retained permission-denial callbacks', () => {
  for (const release of releases) {
    const filename = process.env[release.env]
    assert.ok(filename, `${release.env} must be set`)
    const bytes = fs.readFileSync(filename)
    assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
    assert.equal(
      crypto.createHash('sha256').update(bytes).digest('hex'),
      release.sha256,
      `${release.version}: SHA-256`,
    )
    assert.equal(
      occurrences(bytes.toString('utf8'), 'onPermissionDenial?.('),
      2,
      `${release.version}: callback call cardinality`,
    )
  }
})

test('notifies primary tool execution with the resolved denied input', () => {
  const execution = compact(
    fs.readFileSync(
      path.join(repo, 'src/services/tools/toolExecution.ts'),
      'utf8',
    ),
  )
  const assign = execution.indexOf('processedInput = resolved.input')
  const notify = execution.indexOf(
    'toolUseContext.onPermissionDenial?.(tool, toolUseID, processedInput)',
    assign,
  )
  const duration = execution.indexOf(
    'const permissionDurationMs = Date.now() - permissionStart',
    assign,
  )
  assert.ok(assign >= 0)
  assert.ok(notify > assign)
  assert.ok(duration > notify)
  assert.ok(
    execution.slice(assign, duration).includes(
      compact("if (permissionDecision.behavior !== 'allow')"),
    ),
  )
})
