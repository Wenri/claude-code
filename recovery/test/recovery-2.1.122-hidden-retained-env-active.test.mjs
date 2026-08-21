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
  const filename = release.envNames
    .map(name => process.env[name])
    .find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const value = fs.readFileSync(filename)
  assert.equal(value.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(value).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return value.toString('utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, '')
}

test('authenticates all three retained active environment branches', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.match(
      bundle,
      /modelEnvVar:"ANTHROPIC_CUSTOM_MODEL_OPTION",capabilitiesEnvVar:"ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES"/,
      `${release.version}: custom model capability pair`,
    )
    assert.match(
      bundle,
      /if\(![\w$]+\(process\.env\.CLAUDE_CODE_DISABLE_CLAUDE_API_SKILL\)\)\{let\{registerClaudeApiSkill:[\w$]+\}/,
      `${release.version}: Claude API skill suppression`,
    )
    assert.match(
      bundle,
      /if\([\w$]+\(process\.env\.CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH\)&&[\w$]+\?\.needsRefresh\)\{[\w$]+\.needsRefresh=!1;try\{await [\w$]+\(\)\}catch/,
      `${release.version}: post-startup background plugin refresh`,
    )
    assert.match(
      bundle,
      /function [\w$]+\([\w$]+\)\{let [\w$]+=\{needsRefresh:!1\};return [\w$]+\(\)\.then\(\([\w$]+\)=>\{[\w$]+\.needsRefresh=[\w$]+\}\)\.catch\([\w$]+\),[\w$]+\}/,
      `${release.version}: mutable background completion handle`,
    )
  }
})

test('source restores the retained capability and skill gates', () => {
  const modelOverrides = compact(
    fs.readFileSync(
      path.join(repo, 'src/utils/model/modelSupportOverrides.ts'),
      'utf8',
    ),
  )
  assert.ok(
    modelOverrides.includes(
      compact(`{
        modelEnvVar: 'ANTHROPIC_CUSTOM_MODEL_OPTION',
        capabilitiesEnvVar: 'ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES',
      }`),
    ),
  )

  const bundledSkills = compact(
    fs.readFileSync(path.join(repo, 'src/skills/bundled/index.ts'), 'utf8'),
  )
  assert.ok(
    bundledSkills.includes(
      compact(`if (
        feature('BUILDING_CLAUDE_APPS') &&
        !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_CLAUDE_API_SKILL)
      )`),
    ),
  )
})

test('source tracks background completion and refreshes once before a turn', () => {
  const print = compact(
    fs.readFileSync(path.join(repo, 'src/cli/print.ts'), 'utf8'),
  )
  for (const fragment of [
    'async function installPluginsAndApplyMcpInBackground(',
    'onProgress?:(event:HeadlessPluginInstallProgress)=>void',
    '):Promise<boolean>',
    'let pluginsInstalled=false',
    'return pluginsInstalled',
    'const state={needsRefresh:false}',
    'state.needsRefresh=needsRefresh',
    'backgroundPluginRefresh=kickOffBackgroundPluginInstall(installPluginsAndApplyMcpInBackground,)',
    'process.env.CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH',
    'backgroundPluginRefresh?.needsRefresh',
    'backgroundPluginRefresh.needsRefresh=false',
    'await refreshPluginState()',
  ]) {
    assert.equal(print.includes(compact(fragment)), true, fragment)
  }

  const gate = print.indexOf(
    'process.env.CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH',
  )
  const consume = print.indexOf(
    compact('backgroundPluginRefresh.needsRefresh = false'),
    gate,
  )
  const refresh = print.indexOf(compact('await refreshPluginState()'), consume)
  const commandLoop = print.indexOf(
    compact('// Only main-thread commands (agentId===undefined)'),
    refresh,
  )
  assert.ok(gate < consume)
  assert.ok(consume < refresh)
  assert.ok(refresh < commandLoop)
})
