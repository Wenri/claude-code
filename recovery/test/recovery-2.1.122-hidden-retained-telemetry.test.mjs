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

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

test('authenticates the retained skill and plugin telemetry surface', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    for (const [fragment, count] of [
      ['skill_created_by', 1],
      ['agent_path_count', 1],
      ['has_lsp', 1],
      ['has_settings', 1],
      ['settings_keys', 1],
      ['tengu_plugin_enabled_for_session', 1],
      ['tengu_slash_command_forked', 1],
      ['tengu_skill_loaded', 1],
      ['tengu_input_command', 2],
      ['tengu_skill_tool_invocation', 2],
    ]) {
      assert.equal(
        occurrences(bundle, fragment),
        count,
        `${release.version}: ${fragment}`,
      )
    }

    assert.match(
      bundle,
      /skill_source:[\w$]+\},\.\.\.[\w$]+&&\{skill_loaded_from:[\w$]+\},\.\.\.[\w$]+&&\{skill_kind:[\w$]+\},\.\.\.[\w$]+&&\{skill_created_by:[\w$]+\}/,
      `${release.version}: four-field skill telemetry helper`,
    )
    assert.match(
      bundle,
      /agent_path_count:\([^)]*agentsPath[^)]*\)\+\([^}]*agentsPaths[^}]*\),has_mcp:[\w$]+\.mcpServers!==void 0,has_lsp:[\w$]+\.lspServers!==void 0,has_hooks:[\w$]+\.hooksConfig!==void 0,has_settings:[\w$]+\.settings!==void 0/,
      `${release.version}: plugin capability telemetry`,
    )
  }
})

test('source emits all retained skill telemetry fields on every active path', () => {
  const helper = compact(
    fs.readFileSync(
      path.join(repo, 'src/utils/telemetry/skillLoadedEvent.ts'),
      'utf8',
    ),
  )
  for (const fragment of [
    'export function buildSkillTelemetryFields(',
    'skill_source:',
    'skill_loaded_from:',
    'skill_kind:',
    'skill_created_by:',
    'skill.createdBy',
  ]) {
    assert.ok(helper.includes(compact(fragment)), fragment)
  }

  const slash = compact(
    fs.readFileSync(
      path.join(repo, 'src/utils/processUserInput/processSlashCommand.tsx'),
      'utf8',
    ),
  )
  assert.equal(occurrences(slash, 'buildSkillTelemetryFields('), 3)
  assert.equal(occurrences(slash, '_PROTO_skill_name:'), 3)
  assert.equal(occurrences(slash, 'command_content_chars:'), 2)
  assert.ok(!slash.includes("'external' === 'ant'"))

  const skillTool = compact(
    fs.readFileSync(path.join(repo, 'src/tools/SkillTool/SkillTool.ts'), 'utf8'),
  )
  assert.equal(occurrences(skillTool, 'buildSkillTelemetryFields('), 2)
  assert.ok(skillTool.includes('command.createdBy'))
  assert.ok(
    skillTool.includes(
      "command?.type === 'prompt' ? command.createdBy : undefined",
    ),
  )
})

test('source emits the complete retained plugin capability metadata', () => {
  const source = compact(
    fs.readFileSync(
      path.join(repo, 'src/utils/telemetry/pluginTelemetry.ts'),
      'utf8',
    ),
  )
  for (const fragment of [
    'agent_path_count:',
    'has_mcp: plugin.mcpServers !== undefined',
    'has_lsp: plugin.lspServers !== undefined',
    'has_hooks: plugin.hooksConfig !== undefined',
    'has_settings: plugin.settings !== undefined',
    "settings_keys: Object.keys(plugin.settings) .sort() .join(',')",
  ]) {
    assert.ok(source.includes(compact(fragment)), fragment)
  }
})
