import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const BASELINE_SHA256 =
  'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861'
const TARGET_SHA256 =
  '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0'

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

function extractBundledSkillPrompt(contents) {
  const match = contents.match(
    /const SKILL_PROMPT = \[\n([\s\S]*?)\n\]\.join\('\\n'\)/,
  )
  assert.ok(match, 'bundled skill prompt array')
  return match[1]
    .split('\n')
    .map(line => {
      const entry = line.trim().replace(/,$/, '')
      assert.match(entry, /^"(?:\\.|[^"\\])*"$/)
      return JSON.parse(entry)
    })
    .join('\n')
}

function extractTargetSkillLiteral(contents) {
  const start = contents.indexOf("'# Less Permission Prompts")
  assert.notEqual(start, -1, 'target bundled-skill literal')
  let escaped = false
  for (let index = start + 1; index < contents.length; index += 1) {
    const character = contents[index]
    if (escaped) {
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === "'") {
      return runInNewContext(contents.slice(start, index + 1))
    }
  }
  assert.fail('unterminated target bundled-skill literal')
}

test('recovers theme, skill sorting, input clearing, and transcript controls', () => {
  const theme = source('src/components/ThemePicker.tsx')
  includesAll(theme, ['Auto (match terminal)', 'value: "auto" as const'])
  assert.equal(theme.includes('feature("AUTO_THEME")'), false)

  includesAll(source('src/components/skills/SkillsMenu.tsx'), [
    'estimateSkillFrontmatterTokens',
    'sortByTokens',
    "'settings:sortByTokens'",
    'sorted by tokens',
  ])
  includesAll(source('src/keybindings/defaultBindings.ts'), [
    "t: 'settings:sortByTokens'",
  ])

  const input = source('src/hooks/useTextInput.ts')
  includesAll(input, [
    'function killInput(): Cursor',
    "['u', killInput]",
    'pushToKillRing(cursor.text',
    "return Cursor.fromText('', columns, 0)",
  ])

  includesAll(source('src/screens/REPL.tsx'), [
    '[ to print output',
    'v to ${editorAction}',
    'getExternalEditorDisplayName()',
  ])
})

test('coordinates surveys and preserves a renamed session across clear', () => {
  includesAll(source('src/components/FeedbackSurvey/useSurveyState.tsx'), [
    'otherSurveyActive?: boolean',
    "otherSurveyActive && state === 'open'",
    "setState('closed')",
  ])
  includesAll(source('src/components/FeedbackSurvey/useFeedbackSurvey.tsx'), [
    'otherSurveyActive: boolean = false',
    'if (otherSurveyActive)',
  ])
  includesAll(source('src/screens/REPL.tsx'), [
    "otherSurveyActive: postCompactSurvey.state !== 'closed'",
    "postCompactSurvey.state !== 'closed' || memorySurvey.state !== 'closed'",
  ])

  includesAll(source('src/commands/clear/conversation.ts'), [
    'const preservedTitle = getCurrentSessionTitle(getSessionId())',
    'if (preservedTitle)',
    "saveCustomTitle(getSessionId(), preservedTitle, undefined, 'user')",
  ])
  includesAll(source('src/commands/clear/index.ts'), [
    'previous session stays on disk (resumable with /resume)',
  ])
})

test('linkifies ordinary output with bounded OSC 8-safe handling', () => {
  includesAll(source('src/components/shell/OutputLine.tsx'), [
    "import { OSC8_PREFIX } from '../../ink/screen.js'",
    'const MAX_LINKIFY_LENGTH = 100_000',
    'if (content.length > MAX_LINKIFY_LENGTH)',
    'if (content.includes(OSC8_PREFIX))',
    'const formatted = linkifyUrlsInText(tryJsonFormatContent(content))',
  ])

  const mcpUI = source('src/tools/MCPTool/UI.tsx')
  assert.equal(mcpUI.includes('linkifyUrls={true}'), false)
  includesAll(mcpUI, [
    '<OutputLine content={unwrapped.body} verbose={verbose} />',
    '<OutputLine content={content} verbose={verbose} />',
  ])
})

test('hardens notifications and enables the PowerShell rollout', () => {
  includesAll(source('src/ink/useTerminalNotification.ts'), [
    'function sanitizeTerminalNotification',
    "code < 32 || code === 127 ? ' '",
    'osc(OSC.ITERM2, sanitizeTerminalNotification(displayString))',
    'sanitizeTerminalNotification(title)',
    'sanitizeTerminalNotification(message)',
  ])

  includesAll(source('src/utils/shell/shellToolUtils.ts'), [
    'export function isPowerShellToolEnabled()',
    "getPlatform() !== 'windows'",
    'isEnvDefinedFalsy(envValue)',
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_ridge', false)",
  ])
  includesAll(source('src/utils/permissions/permissionSetup.ts'), [
    'bashIsDenied',
    'powerShellWasExplicitlyConfigured',
    "getPlatform() === 'windows'",
  ])
  assert.equal(
    source('src/utils/sessionEnvironment.ts').includes(
      'Session environment not yet supported on Windows',
    ),
    false,
  )
})

test('allows narrow read-only globs and registers the permission skill', () => {
  includesAll(source('src/tools/BashTool/readOnlyValidation.ts'), [
    'const READ_ONLY_GLOB_COMMANDS = new Set',
    "expansion === 'glob'",
    '!READ_ONLY_GLOB_COMMANDS.has(commandName)',
    'return isCommandReadOnly(subcmd)',
  ])
  includesAll(source('src/skills/bundled/index.ts'), [
    'registerLessPermissionPromptsSkill',
    'registerLessPermissionPromptsSkill()',
  ])
  includesAll(source('src/skills/bundled/lessPermissionPrompts.ts'), [
    "name: 'less-permission-prompts'",
    'settings.json',
    'prioritized',
  ])
})

test('authenticated adjacent bundles contain the UI and platform replacement', () => {
  const baseline = bundle('CLAUDE_CODE_2_1_110_BUNDLE', BASELINE_SHA256)
  const target = bundle('CLAUDE_CODE_2_1_111_BUNDLE', TARGET_SHA256)
  for (const fragment of [
    'sorted by tokens',
    'Start a new session with empty context; previous session stays on disk (resumable with /resume)',
    'otherSurveyActive',
  ]) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }
  assert.equal(baseline.includes('linkifyUrls'), true)
  assert.equal(target.includes('linkifyUrls'), false)
  const permissionPrompt = extractBundledSkillPrompt(
    source('src/skills/bundled/lessPermissionPrompts.ts'),
  )
  assert.equal(baseline.includes(permissionPrompt), false)
  assert.equal(extractTargetSkillLiteral(target), permissionPrompt)
  // The environment-variable spelling was already latent in 2.1.110; the
  // source overlay recovers the new default Windows rollout semantics.
  assert.equal(target.includes('CLAUDE_CODE_USE_POWERSHELL_TOOL'), true)
})
