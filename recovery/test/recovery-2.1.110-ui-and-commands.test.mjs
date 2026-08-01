import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const BASELINE_SHA256 =
  '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7'
const TARGET_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'

function source(relative) {
  return fs.readFileSync(
    fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
    'utf8',
  )
}

function bundle(environmentName, expectedSha256) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
}

test('authenticated adjacent bundles contain the 2.1.110 UI replacement', () => {
  const baseline = bundle('CLAUDE_CODE_2_1_109_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_110_BUNDLE', TARGET_SHA256)
  const targetOnly = [
    'Set the terminal UI renderer (default | fullscreen)',
    'Toggle focus view (show only your prompt, a tool summary, and the final response)',
    'Using flicker-free rendering',
    "# ─── Claude's last response (for reference; removed on save) ───",
    'autoScrollEnabled',
    'externalEditorContext',
    'plugin:favorite',
    'external-build-2205',
  ]
  for (const fragment of targetOnly) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }
})

test('recovers TUI, focus, editor-context, and renderer controls', () => {
  includesAll(source('src/commands/tui/index.ts'), [
    "name: 'tui'",
    'Set the terminal UI renderer (default | fullscreen)',
  ])
  includesAll(source('src/commands/tui/tui.ts'), [
    "updateSettingsForSource('userSettings', { tui: renderer })",
    'return relaunch({',
  ])
  includesAll(source('src/commands/update/update.ts'), [
    'return relaunch({',
  ])
  includesAll(source('src/utils/relaunch.ts'), [
    'markShuttingDownForRelaunch',
    'severTtyInputForRelaunch()',
    "stdio: 'inherit'",
  ])
  includesAll(source('src/commands/focus.ts'), [
    "name: 'focus'",
    'Toggle focus view (show only your prompt, a tool summary, and the final response)',
    'briefTranscript',
  ])

  const config = source('src/components/Settings/Config.tsx')
  includesAll(config, [
    "id: 'autoScrollEnabled'",
    "id: 'externalEditorContext'",
    "label: 'Session recap'",
  ])
  includesAll(source('src/utils/promptEditor.ts'), [
    "# ─── Claude's last response (for reference; removed on save) ───",
    'stripAssistantContextFromEditor',
  ])

  const ink = source('src/ink/ink.tsx')
  includesAll(ink, [
    'MAX_NON_TTY_LAYOUT_WIDTH = 8192',
    "private prevOverlaySig = ''",
    'overlaySignature !== this.prevOverlaySig',
  ])
  includesAll(source('src/screens/REPL.tsx'), [
    '!getGlobalConfig().autoScrollEnabled',
  ])
  includesAll(source('src/ink/terminal.ts'), [
    "termProgram === 'mintty'",
    "termProgram === 'rio'",
    "termProgram === 'Tabby'",
    'KONSOLE_VERSION',
    'SYNC_OUTPUT_SUPPORTED',
  ])
})

test('recovers Installed plugins, doctor warnings, scrolling skills, and bridge commands', () => {
  includesAll(source('src/commands/plugin/ManagePlugins.tsx'), [
    'favoritePluginIds',
    'plugin:favorite',
    'showDisabled',
    'needsAttention',
  ])
  includesAll(source('src/services/mcp/config.ts'), [
    'findMcpServerNameConflicts',
    'defined in multiple scopes with different endpoints',
  ])
  includesAll(source('src/components/skills/SkillsMenu.tsx'), [
    'visibleSkills',
    'hiddenAbove',
    'hiddenBelow',
  ])
  const commands = source('src/commands.ts')
  includesAll(commands, [
    'autocompactNonInteractive',
    'contextNonInteractive',
    'exitNonInteractive',
    'reloadPlugins',
    'BRIDGE_SAFE_COMMANDS',
  ])
  includesAll(source('src/commands/autocompact/autocompact-noninteractive.ts'), [
    'applyAutoCompactWindow',
    'Auto-compact window:',
    "updateSettingsForSource('userSettings'",
    'getInitialSettings().autoCompactWindow',
    "source === 'experiment'",
    'mergedValue !== value',
    '{ ...previous, autoCompactWindow: value }',
  ])
  includesAll(source('src/commands/autocompact/autocompact.tsx'), [
    "source === 'model' || source === 'experiment'",
  ])
  includesAll(source('src/services/compact/autoCompact.ts'), [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_redwood', '')",
    "source: 'experiment'",
    "validateBoundedIntEnvVar(\n      'CLAUDE_CODE_AUTO_COMPACT_WINDOW'",
    'isAutoCompactEnabled() ? autoCompactWindow : undefined',
  ])
})
