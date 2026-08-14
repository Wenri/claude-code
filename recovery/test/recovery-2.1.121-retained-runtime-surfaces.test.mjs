import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundleSpecs = [
  [
    'CLAUDE_CODE_2_1_120_BUNDLE',
    13_784_743,
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  ],
  [
    'CLAUDE_CODE_2_1_121_BUNDLE',
    13_908_188,
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  ],
]

function loadBundle([environmentName, expectedBytes, expectedSha256]) {
  const filename = process.env[environmentName]
  assert.ok(filename, `${environmentName} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${environmentName}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    expectedSha256,
    `${environmentName}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSource(relativePath, fragments) {
  const contents = compact(source(relativePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${relativePath}: ${fragment}`,
    )
  }
}

function assertSourceMap(sourceMap) {
  for (const [relativePath, fragments] of Object.entries(sourceMap)) {
    assertSource(relativePath, fragments)
  }
}

test('authenticates retained UI, CLI, session, and updater runtime surfaces', () => {
  const bundles = bundleSpecs.map(loadBundle)
  const exactCounts = new Map([
    ['tengu_amber_lark', 1],
    ['tengu_coral_beacon', 2],
    ['tengu_velvet_moth', 1],
    ['tengu_opus47_launch_shown', 1],
    ['tengu_status_line_result', 1],
    ['tengu_billiard_aviary', 1],
    ['tengu_crimson_vector', 1],
    ['tengu_marlin_porch', 1],
    ['tengu_slate_harbor', 1],
    ['tengu_sage_compass2', 1],
    ['tengu_slate_finch', 1],
    ['tengu_gleaming_fair', 1],
    ['tengu_plugin_settings_premature_read', 1],
    ['Ignoring invalid --deep-link-cwd-b64', 1],
    ['No MCP server found with name:', 5],
    ['allowMachLookup', 9],
    ['rewakeMessage', 4],
    ['https://claude.ai/customize/connectors', 4],
    ['Rejected command with unsafe characters', 1],
    ['gcp-cloud-workstations', 1],
    ['aws-cloud9', 1],
    ['skipSpill', 2],
    ['session_search_out_of_scope', 1],
    ['No sessions match', 1],
    ['tengu_review_remote_stopped', 1],
    ['Terminate session and discard plan', 1],
    ['net-redirect', 1],
    ['cd-compound-write', 1],
    ['cd-compound-redirect', 1],
    ['process-substitution', 1],
    ['No sed arguments', 1],
    ['Claude Platform on AWS', 5],
    ['tengu_canary', 1],
    ['wasSkipped', 6],
    ['/.bun/install/global/', 1],
  ])
  for (const [fragment, count] of exactCounts) {
    assert.deepEqual(
      bundles.map(bundle => occurrences(bundle, fragment)),
      [count, count],
      fragment,
    )
  }
})

test('retains exact UI, rating, cost, image, deep-link, and settings behavior', () => {
  assertSourceMap({
    'src/commands/cost/cost.ts': [
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_lark', false)",
      'const breakdown = formatSessionCostBreakdown()',
    ],
    'src/commands/rate-limit-options/rate-limit-options.tsx': [
      'tengu_coral_beacon',
      "const TEAM_UPGRADE_URL = 'https://claude.ai/create/team'",
    ],
    'src/components/FeedbackSurvey/useMemorySurvey.tsx': [
      "const MEMORY_SURVEY_PROBABILITY_GATE = 'tengu_velvet_moth'",
      'getFeatureValue_CACHED_MAY_BE_STALE(MEMORY_SURVEY_PROBABILITY_GATE, 0.2)',
    ],
    'src/components/LogoV2/Opus47LaunchNotice.tsx': [
      'const MAX_SEEN_COUNT = 5',
      "const ON_OPUS_COPY = 'Welcome to Opus 4.7 xhigh!'",
      "logEvent('tengu_opus47_launch_shown', {})",
    ],
    'src/components/Message.tsx': [
      'messageUuid={message.uuid}',
      'isTranscriptMode={isTranscriptMode}',
    ],
    'src/components/ResumeReturnDialog.tsx': [
      "label: 'Resume from summary (recommended)'",
      "label: \"Don't ask me again\"",
    ],
    'src/components/StatusLine.tsx': [
      "import { stringWidth } from '../ink/stringWidth.js'",
      "logEvent('tengu_status_line_result'",
      'command_length: commandLength',
      'visual_width: visualWidth',
    ],
    'src/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx': [
      'const imageLimits = getImageLimits(useMainLoopModel())',
      'convertImagesToBlocks(allImageAttachments, imageLimitsRef.current)',
    ],
    'src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx': [
      'const imageLimitsRef = useRef(getImageLimits(imageModel))',
      'imageLimitsRef.current = getImageLimits(imageModel)',
    ],
    'src/context/messageRating.tsx': [
      "logEvent('tengu_message_rated'",
      "'tengu_billiard_aviary'",
      "'tiny_memory'",
      'cited_team_count: citedTeamCount',
    ],
    'src/cost-tracker.ts': [
      'export function formatSessionCostBreakdown()',
      "return parts.length > 0 ? `breakdown · ${parts.join(' · ')}` : null",
    ],
    'src/ink/terminal.ts': [
      'if (isFullscreenEnvEnabled()) return (decstbmSafe = false)',
      'process.env.CLAUDE_CODE_DECSTBM',
      "'tengu_marlin_porch'",
    ],
    'src/tools/BashTool/utils.ts': [
      'maybeResizeAndDownsampleImageBuffer(',
      'getImageLimits(model)',
    ],
    'src/tools/REPLTool/constants.ts': [
      'if (isEnvTruthy(process.env.CLAUDE_CODE_REPL)) return true',
      "entrypoint === 'cli' || entrypoint === 'remote'",
      "'tengu_slate_harbor'",
    ],
    'src/utils/advisor.ts': [
      "'tengu_sage_compass2'",
      'getAPIProvider() !== \'firstParty\'',
      'CLAUDE_CODE_ENABLE_EXPERIMENTAL_ADVISOR_TOOL',
    ],
    'src/utils/effort.ts': [
      "getSubscriptionType() === 'pro'",
      "'tengu_slate_finch'",
      'burns fastest — medium handles most tasks',
    ],
    'src/utils/imagePaste.ts': [
      'const imageLimits = getImageLimits(getMainLoopModel())',
      'imageLimits.targetRawSize',
    ],
    'src/utils/imageResizer.ts': [
      "'claude-opus-4-7': { maxWidth: 2576, maxHeight: 2576 }",
      "'tengu_crimson_vector'",
      '? 10 * 1024 * 1024',
      'Math.floor((effectiveBase64Size * 3) / 4)',
    ],
    'src/utils/imageValidation.ts': [
      'limits: ImageLimits = getImageLimits()',
      'base64Size > limits.maxBase64Size',
    ],
    'src/utils/processUserInput/processUserInput.ts': [
      'getImageLimits(context.options.mainLoopModel)',
    ],
    'src/utils/resumeReturn.ts': [
      "'tengu_gleaming_fair'",
      'CLAUDE_CODE_RESUME_THRESHOLD_MINUTES',
      'CLAUDE_CODE_RESUME_TOKEN_THRESHOLD',
    ],
    'src/utils/subagentStatusLine.ts': [
      "getSettingsAfterPluginLoad('subagentStatusLine')",
    ],
    'src/utils/deepLink/parseDeepLink.ts': [
      'export function validateDeepLinkCwd(cwd: string)',
      'UNC / network paths are not supported',
      'INVISIBLE_OR_BIDI_CONTROL.test(cwd)',
    ],
    'src/utils/deepLink/terminalLauncher.ts': [
      "Buffer.from(value, 'utf8').toString('base64url')",
      '`--deep-link-cwd-b64=${encode(action.cwd)}`',
      'if (await attempt(opts.cwd)) return true',
      'if (opts.cwd) return attempt(undefined)',
      "process.env.ComSpec || `${process.env.SystemRoot || 'C:\\\\Windows'}\\\\System32\\\\cmd.exe`",
    ],
    'src/utils/settings/settings.ts': [
      'export function getSettingsAfterPluginLoad',
      "logEvent('tengu_plugin_settings_premature_read', { key })",
      'return getInitialSettings()[key]',
    ],
    'src/utils/settings/settingsCache.ts': [
      'let pluginSettingsInitialized = false',
      'export function isPluginSettingsInitialized()',
      'pluginSettingsInitialized = true',
    ],
  })
})

test('retains exact CLI configuration and scoped session-search safeguards', () => {
  assertSourceMap({
    'src/cli/handlers/mcp.tsx': [
      'if (options.scope)',
      'return cliOk(`File modified: ${describeMcpConfigFilePath(scope)}`)',
      'Configured servers: ${configuredNames.join(\', \')}',
      'No MCP servers are configured.',
    ],
    'src/entrypoints/sandboxTypes.ts': [
      'allowMachLookup: z',
      'Wildcards are only allowed as a single trailing "*"',
    ],
    'src/schemas/hooks.ts': [
      'rewakeMessage: z',
      'rewakeSummary: z',
      'asyncRewake hook exits with code 2',
    ],
    'src/skills/bundled/scheduleRemoteAgents.ts': [
      'https://claude.ai/customize/connectors',
    ],
    'src/utils/binaryCheck.ts': [
      '? /^[A-Za-z0-9/\\\\][A-Za-z0-9_.+:\\\\?/-]*$/',
      ': /^[A-Za-z0-9/][A-Za-z0-9_.+/-]*$/',
      '[binaryCheck] Rejected command with unsafe characters',
    ],
    'src/utils/env.ts': [
      'GOOGLE_CLOUD_WORKSTATIONS',
      "return 'gcp-cloud-workstations'",
      "if (process.env.C9_PID || process.env.C9_USER) return 'aws-cloud9'",
    ],
    'src/utils/sandbox/sandbox-adapter.ts': [
      'allowMachLookup: settings.sandbox?.network?.allowMachLookup',
      'getAllowMachLookup: BaseSandboxManager.getAllowMachLookup',
    ],
    'src/components/LogSelector.tsx': [
      'No sessions match "{searchQuery}".',
      'only show current repo',
      'only show current branch',
      '!isSearching && !isLoading',
    ],
    'src/utils/ShellCommand.ts': [
      'background(taskId: string, options?: { skipSpill?: boolean })',
      '} else if (!options?.skipSpill)',
    ],
    'src/utils/agenticSessionSearch.ts': [
      'const SEARCH_TOOLS = [FileReadTool, GrepTool]',
      'additionalWorkingDirectories',
      "reason: 'session_search_out_of_scope'",
      'const absolutePath = toolPath ? expandPath(toolPath) : undefined',
      'const MAX_TURNS = 20',
    ],
  })
})

test('retains exact Bash and remote-session safety semantics', () => {
  assertSourceMap({
    'src/commands/ultraplan.tsx': [
      "logEvent('tengu_review_remote_stopped', {})",
      'The user stopped the ultrareview session above.',
    ],
    'src/components/tasks/BackgroundTasksDialog.tsx': [
      'currentSelection_0.task.isRemoteReview',
      'stopUltrareview(task_0.id, task_0.sessionId, setAppState)',
    ],
    'src/components/tasks/RemoteSessionDetailDialog.tsx': [
      'Terminate session and discard plan',
      'Discard the generated plan',
      'session.isUltraplan || session.isRemoteReview',
    ],
    'src/tools/BashTool/pathValidation.ts': [
      "bashMissKind: 'cd-compound-write'",
      "bashMissKind: 'cd-compound-redirect'",
      "bashMissKind: 'process-substitution'",
      "? 'net-redirect'",
      'Redirect involving /dev/tcp or /dev/udp opens a network connection',
    ],
    'src/tools/BashTool/sedValidation.ts': [
      "throw new Error('No sed arguments')",
    ],
    'src/utils/bash/commands.ts': [
      "dangerousRedirectionReason?: 'network_device' | 'shell_expansion'",
      "? 'network_device'",
      "/^\\/dev\\/(tcp|udp)\\//",
    ],
    'src/utils/fastMode.ts': [
      'Fast mode is not available on Bedrock, Vertex, Foundry, or Claude Platform on AWS',
    ],
  })
})

test('retains truthful native updater canary and package-manager semantics', () => {
  assertSourceMap({
    'src/utils/autoUpdater.ts': [
      "executable.includes('/.bun/install/global/')",
      'executable.startsWith(`${bunInstall}/install/global/`)',
      "return env.isRunningWithBun() && !env.isNpmFromWindowsPath() ? 'bun' : 'npm'",
    ],
    'src/utils/nativeInstaller/installer.ts': [
      "getFeatureValue_CACHED_MAY_BE_STALE('tengu_canary', {})",
      'semver.valid(canary.external)',
      'canaryExceedsMax',
      'return { success: true, wasSkipped: true, latestVersion: version }',
      'wasUpdated: updateResult.success && !updateResult.wasSkipped',
      'wasSkipped: updateResult.wasSkipped',
    ],
  })
})
