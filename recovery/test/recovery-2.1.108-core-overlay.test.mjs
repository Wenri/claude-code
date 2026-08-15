import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.107-to-2.1.108'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    repositoryRoot,
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_108_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844'
const TARGET_BUNDLE_SHA256 =
  'dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73'

function source(relative) {
  const sourceRelative = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ? relative.replace(/^src\//, '')
    : relative
  return fs.readFileSync(path.join(sourceRoot, sourceRelative), 'utf8')
}

function requiredBundle(filename, label, expectedSha256) {
  assert.ok(filename, `${label} environment variable must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
  )
  return bytes.toString('utf8')
}

test('recovers prompt-cache precedence and model-invocable built-ins', () => {
  const claude = source('src/services/api/claude.ts')
  const commands = source('src/commands.ts')
  const skillTool = source('src/tools/SkillTool/SkillTool.ts')
  const rewind = source('src/commands/rewind/index.ts')

  assert.ok(
    claude.indexOf('FORCE_PROMPT_CACHING_5M') <
      claude.indexOf('ENABLE_PROMPT_CACHING_1H'),
  )
  assert.match(
    claude,
    /isClaudeAISubscriber\(\) \|\| currentLimits\.isUsingOverage/,
  )
  assert.equal(
    claude.includes(
      "allowlist: ['repl_main_thread*', 'sdk', 'auto_mode']",
    ),
    true,
  )
  assert.match(commands, /cmd\.source === 'builtin'/)
  assert.match(
    commands,
    /cmd\.source === 'builtin' \|\|\n    cmd\.source === 'mcp' \|\|\n    cmd\.source === 'bundled'/,
  )
  assert.match(
    skillTool,
    /foundCommand\.type === 'local-jsx' \? 'UI' : 'built-in CLI'/,
  )
  assert.match(
    skillTool,
    /command, not a skill\. Ask the user to run \//,
  )
  assert.match(rewind, /aliases: \['checkpoint', 'undo'\]/)
})

test('recovers cache-miss warnings and typo suggestions', () => {
  const model = source('src/commands/model/model.tsx')
  const suggestions = source(
    'src/utils/suggestions/commandSuggestions.ts',
  )
  const slashCommand = source(
    'src/utils/processUserInput/processSlashCommand.tsx',
  )
  const skillTool = source('src/tools/SkillTool/SkillTool.ts')

  assert.match(model, /getTotalOutputTokens\(\) > 0/)
  assert.match(
    model,
    /canonicalModel\(model\) !==\s*canonicalModel\(mainLoopModelForSession \?\? mainLoopModel\)/,
  )
  assert.match(
    model,
    /subtitle="Your next response will be slower and use more tokens"/,
  )
  assert.match(suggestions, /export function findClosestCommand\(/)
  assert.match(suggestions, /function levenshteinDistance\(/)
  assert.match(slashCommand, /had_suggestion: Boolean\(suggestion\)/)
  assert.match(
    slashCommand,
    /Unknown command: \/\$\{commandName\}\. Did you mean \/\$\{suggestion\}\?/,
  )
  assert.match(
    skillTool,
    /Unknown skill: \$\{normalizedCommandName\}\. Did you mean \$\{suggestion\}\?/,
  )
})

test('recovers API status distinctions and terminal input handling', () => {
  const errors = source('src/services/api/errors.ts')
  const earlyInput = source('src/utils/earlyInput.ts')
  const paste = source('src/hooks/usePasteHandler.ts')

  for (const fragment of [
    "export const CLAUDE_STATUS_PAGE = 'status.claude.com'",
    'Server is temporarily limiting requests (not your usage limit)',
    'Request rejected (429)',
    "error: 'server_error'",
    'error.status >= 500',
  ]) {
    assert.equal(errors.includes(fragment), true, fragment)
  }
  assert.match(errors, /JSON\.parse\(stripped\)/)
  assert.match(earlyInput, /export function processChunk\(str: string\)/)
  for (const introducer of [
    'introducer === 91',
    'introducer === 93',
    'introducer === 80',
    'introducer === 88',
    'introducer === 94',
    'introducer === 95',
    'introducer === 79',
  ]) {
    assert.equal(earlyInput.includes(introducer), true, introducer)
  }
  if (historical) {
    assert.match(paste, /const event = new InputEvent\(\{/)
    assert.match(paste, /isPasted: true/)
    assert.match(paste, /onInput\(event\.input, event\.key\)/)
  } else {
    assert.match(paste, /handlePaste: \(event: PasteEvent\) => void/)
    assert.match(paste, /function handleKeyDown\(event: KeyboardEvent\)/)
    assert.match(paste, /nextHandleKeyDown\(event\)/)
    assert.match(paste, /event\.preventDefault\(\)/)
  }
})

test('recovers the smaller UI, shell, title, and auto-mode fixes', () => {
  const repl = source('src/screens/REPL.tsx')
  const logo = source('src/components/LogoV2/LogoV2.tsx')
  const prompts = source('src/constants/prompts.ts')
  const feedback = source('src/components/Feedback.tsx')
  const title = source('src/utils/sessionTitle.ts')
  const bash = source('src/utils/shell/bashProvider.ts')
  const permissions = source('src/utils/permissions/permissions.ts')

  assert.match(repl, /<Text dimColor=\{true\}>verbose <\/Text>/)
  assert.equal(
    logo.match(/<PromptCachingDisabledWarning \/>/g)?.length,
    3,
  )
  assert.match(logo, /DISABLE_PROMPT_CACHING_HAIKU/)
  assert.match(logo, /This will impact latency and token costs/)
  assert.match(prompts, /Maintain full orthographic correctness/)
  assert.match(feedback, /setError\(null\);\s*setStep\('consent'\)/)
  assert.match(title, /const MIN_TITLE_INPUT_LENGTH = 10/)
  assert.match(title, /trimmed\.length < MIN_TITLE_INPUT_LENGTH/)
  assert.match(bash, /commandParts\.push\(`\$\{sessionEnvScript\}\\n:`\)/)
  assert.match(
    permissions,
    /classifierResult\.transcriptTooLong[\s\S]*tool\.name === AGENT_TOOL_NAME[\s\S]*behavior: 'allow'/,
  )
})

test('recovers transcript integrity and resume metadata', () => {
  const sessions = source('src/utils/sessionStorage.ts')

  assert.match(
    sessions,
    /catch \(error\) \{\n        logError\(error\)[\s\S]*batch\[i\]!\.resolve\(\)/,
  )
  assert.match(sessions, /tengu_chain_self_reference_write/)
  assert.match(
    sessions,
    /agentName: agentNames\.get\(sessionId\) \?\? log\.agentName/,
  )
  assert.match(sessions, /agentColor: agentColors\.get\(sessionId\)/)
  assert.match(
    sessions,
    /let parent = messages\.get\(parentUuid\)[\s\S]*!parent \|\| seen\.has\(parent\.uuid\)[\s\S]*findClosestTimestampParent/,
  )
})

test('recovers bridge titles, scoped plugin updates, and rendered exits', () => {
  const bridge = source('src/bridge/initReplBridge.ts')
  const plugins = source('src/services/plugins/pluginOperations.ts')
  const main = source('src/main.tsx')

  assert.match(bridge, /await getBridgeSession\(bridgeSessionId/)
  assert.match(bridge, /serverTitleSessionId = bridgeSessionId/)
  assert.match(bridge, /locallyGeneratedTitles\.has\(session\.title\)/)
  assert.match(
    plugins,
    /matchingInstallation \?\? scopeInstallations\[0\]/,
  )
  assert.match(plugins, /projectPath: installation\.projectPath/)
  assert.match(plugins, /scope installs, none match CWD/)
  assert.match(
    main,
    /exitWithError\(root, isOperationError \? error\.message : errorMessage\(error\), \(\) => gracefulShutdown\(1\)\)/,
  )
  assert.match(
    main,
    /exitWithError\(root, message, \(\) => gracefulShutdown\(1\)\)/,
  )
  assert.match(main, /exitWithError\(root, `Failed to resume session \$\{sessionId\}`\)/)
})

test('recovers the exact lazy grammar registry shared by both renderers', () => {
  const languages = source('src/utils/highlightLanguages/index.ts')
  const cliHighlight = source('src/utils/cliHighlight.ts')
  const colorDiff = source('src/native-ts/color-diff/index.ts')

  const loaderCount = [...languages.matchAll(/: \(\) => require\(/g)].length
  assert.equal(loaderCount, 190)
  assert.match(languages, /import cedar from '\.\/cedar\.js'/)
  assert.match(
    languages,
    /as: 'actionscript',\n  asc: 'angelscript',\n  apacheconf: 'apache',\n  osascript: 'applescript'/,
  )
  assert.match(languages, /export function ensureLanguage\(/)
  assert.match(languages, /loadedLanguages\.add\(canonical\)/)
  assert.equal(cliHighlight.includes("from 'cli-highlight'"), false)
  assert.match(cliHighlight, /ensureLanguage,/)
  assert.match(cliHighlight, /function renderNode\(/)
  assert.match(colorDiff, /ensureLanguage,/)
  assert.match(colorDiff, /getHljsCore,/)
})

test('authenticated adjacent bundles contain the recovered replacements', () => {
  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_107_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_108_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )

  const targetOnlyFragments = [
    'if(R6(process.env.FORCE_PROMPT_CACHING_5M))return!1;if(R6(process.env.ENABLE_PROMPT_CACHING_1H)',
    'repl_main_thread*","sdk","auto_mode',
    ' command, not a skill. Ask the user to run /',
    'aliases:["checkpoint","undo"]',
    'Your next response will be slower and use more tokens',
    'Server is temporarily limiting requests (not your usage limit)',
    ' Did you mean /',
    'as:"actionscript",asc:"angelscript",apacheconf:"apache",osascript:"applescript"',
    'Prompt caching disabled via ',
    '"verbose "',
    'tengu_chain_self_reference_write',
    'Maintain full orthographic correctness',
  ]
  for (const fragment of targetOnlyFragments) {
    assert.equal(baseline.includes(fragment), false, fragment)
    assert.equal(target.includes(fragment), true, fragment)
  }

  assert.equal(baseline.match(/external-build-2211/g)?.length, 4)
  assert.equal(baseline.includes('external-build-2203'), false)
  assert.equal(target.includes('external-build-2211'), false)
  assert.equal(target.match(/external-build-2203/g)?.length, 4)

  // These two release-note behaviors were already present in both adjacent
  // bundles, so they do not justify an incremental source edit.
  for (const unchangedFragment of [
    'name:"recap"',
    'CLAUDE_CODE_ENABLE_AWAY_SUMMARY',
  ]) {
    assert.equal(baseline.includes(unchangedFragment), true)
    assert.equal(target.includes(unchangedFragment), true)
  }
})
