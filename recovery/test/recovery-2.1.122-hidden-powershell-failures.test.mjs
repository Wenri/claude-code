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
    eventCount: 0,
  },
  {
    version: '2.1.122',
    env: 'CLAUDE_CODE_2_1_122_BUNDLE',
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
    eventCount: 1,
  },
]

function loadBundle(release) {
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

test('authenticates target-only PowerShell failure telemetry', () => {
  for (const release of releases) {
    const bundle = loadBundle(release)
    assert.equal(
      bundle.split('tengu_powershell_tool_command_failed').length - 1,
      release.eventCount,
      release.version,
    )
  }
})

test('recovers the ordered failure taxonomy and bounded event payload', () => {
  const semantics = fs.readFileSync(
    path.join(repo, 'src/tools/PowerShellTool/commandSemantics.ts'),
    'utf8',
  )
  for (const fragment of [
    "['ps5_chain_op'",
    "'parser_error'",
    "'not_recognized'",
    "['command_not_found'",
    "['native_command_error'",
    "['path_not_found'",
    "'access_denied'",
    "'parameter_binding'",
    "['object_not_found'",
    "'execution_policy'",
    "['native_npm'",
    "['native_dotnet'",
    "if (!output.trim()) return 'empty'",
    "return 'other'",
  ]) {
    assert.ok(semantics.includes(fragment), `missing ${fragment}`)
  }

  const tool = fs.readFileSync(
    path.join(repo, 'src/tools/PowerShellTool/PowerShellTool.tsx'),
    'utf8',
  )
  for (const fragment of [
    "logEvent('tengu_powershell_tool_command_failed'",
    'processedStdout.length <= 8192',
    'processedStdout.slice(0, 4096) + processedStdout.slice(-4096)',
    'stdout_length: processedStdout.length',
    'error_class: classifyPowerShellFailure(classificationOutput)',
    "powershell_edition: (await getPowerShellEdition()) ?? 'unknown'",
  ]) {
    assert.ok(tool.includes(fragment), `missing ${fragment}`)
  }
  assert.ok(
    tool.indexOf("logEvent('tengu_powershell_tool_command_failed'") <
      tool.indexOf('throw new ShellError', tool.indexOf('interpretation.isError')),
  )
})
