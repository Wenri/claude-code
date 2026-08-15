import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const BASELINE_SHA256 =
  '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7'
const TARGET_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceOptions = {
  skip:
    !semanticCase || semanticCase === caseName
      ? false
      : `target110 source assertions are not applicable to isolated ${semanticCase}`,
}
const bundleOptions = {
  skip:
    semanticCase && semanticCase !== caseName
      ? `target110 bundle assertions are not applicable to isolated ${semanticCase}`
      : !semanticCase &&
          (!process.env.CLAUDE_CODE_2_1_109_BUNDLE ||
            !process.env.CLAUDE_CODE_2_1_110_BUNDLE)
        ? 'authenticated target109 and target110 bundles are required'
        : false,
}
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.109-to-2.1.110/structural/generated-delta.json.gz',
      ),
    ),
  ),
)
const structuralUnits = new Map([
  [15206, [10987944, 10988390, 'FunctionDeclaration', 'd542de3f3a25fdf15a283046c6224c6c82a02173f21b51ff1357ede6accf96be']],
  [15209, [10988530, 10988580, 'FunctionDeclaration', 'fdbdcf10b2ef623e8d9479293f6d4fc496b903f58f684a0153b2a746f2975af3']],
  [15210, [10988580, 10988757, 'FunctionDeclaration', '7d8e1bab4dedc2b820477db9196e9498942829b8699febe586367e970d17def7']],
  [15212, [10988806, 10988969, 'FunctionDeclaration', 'c607ad1a88cf588703539bfedae2db4de5e10b04c7695829b2ceac71683ef3a8']],
  [15213, [10988969, 10989376, 'FunctionDeclaration', 'b2efcebb64c303eb728723cb33832a22fdebe0318c436b33da097ebd1cc62902']],
  [15214, [10989376, 10990289, 'FunctionDeclaration', '1257d30c7c83602f7f5a431b9355f9af821409d66ae7ed17dafa56ffaab430e2']],
  [15225, [10991462, 10993980, 'FunctionDeclaration', '5cc19f71e2ee9bd60db081548c873a57c0e2bbf96fe476196fd11f10307bfa5c']],
  [15645, [11217798, 11218482, 'VariableDeclaration', '001a8adfc1a0c46b1c650f6fd2c82e938dcd0bd284020c932432613cd6d74576']],
  [15646, [11218482, 11218549, 'VariableDeclaration', '4f0d5a9ff6b563e6acc940d861eb31d04bdfe0a8b448c95a03431de38253b952']],
  [15648, [11218561, 11218795, 'VariableDeclaration', 'e2454f17ee267a9a599d12252ae45235684e76b58bd9c4ee421155ef52c61e46']],
  [16299, [11481848, 11482337, 'VariableDeclaration', 'ee08a9cc389c3b83d7bfa02352488a9c5aacf038f278974717de432f55607838']],
])

function source(relative) {
  if (process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT) {
    return fs.readFileSync(
      path.join(
        process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT,
        relative.replace(/^src\//, ''),
      ),
      'utf8',
    )
  }
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

test('authenticated adjacent bundles contain the 2.1.110 UI replacement', bundleOptions, () => {
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

  const targetContents = target
  for (const [index, [start, end, nodeType, hash]] of structuralUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: class`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.nodeType, region.target.sourceHash],
      [start, end, nodeType, hash],
      `${index}: structural identity`,
    )
    assert.equal(
      crypto.createHash('sha256').update(targetContents.slice(start, end)).digest('hex'),
      hash,
      `${index}: target bytes`,
    )
  }
})

test('recovers TUI, focus, editor-context, and renderer controls', sourceOptions, () => {
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
  includesAll(source('src/components/LogoV2/AnimatedAsterisk.tsx'), [
    'prefersReducedMotion',
    'setTimeout(setDone',
    'hueToRgb',
  ])
  includesAll(source('src/components/LogoV2/FullscreenUpsell.tsx'), [
    'getDynamicConfig_CACHED_MAY_BE_STALE',
    "'tengu_ochre_hollow'",
    'fullscreenUpsellSeenCount',
    'Try flicker-free rendering',
    'Using flicker-free rendering',
    'Click to expand collapsed tool results',
  ])
  includesAll(source('src/components/LogoV2/CondensedLogo.tsx'), [
    '<FullscreenUpsell />',
    'CLAUDE_CODE_TUI_JUST_SWITCHED',
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

test('recovers Installed plugins, doctor warnings, scrolling skills, and bridge commands', sourceOptions, () => {
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
  includesAll(
    source('src/components/skills/SkillsMenu.tsx'),
    semanticCase === caseName
      ? ['visibleSkills', 'hiddenAbove', 'hiddenBelow']
      : ['<Select', 'visibleCount={visibleCount}', 'overflowHint="count"'],
  )
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
