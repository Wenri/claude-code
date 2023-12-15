import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_94_BUNDLE

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

const units = new Map([
  [8594, [6_831_757, 6_831_964, 'FunctionDeclaration', '9b45d3057a25a82ca0b8b1a67ba2ca8a8d024d92c2e0586eccd7a01fb1a2afe8']],
  [8595, [6_831_964, 6_832_324, 'FunctionDeclaration', '5e20326e8111d138de46a5e5f5e3d1d1c08306283c5185021eec164073f00a4b']],
  [8597, [6_832_340, 6_832_476, 'VariableDeclaration', 'f1e4d5700f89960a86d96bb08363e2f4da9c6df7c5f379e4d960be14a3f144fd']],
  [11530, [9_118_775, 9_122_576, 'VariableDeclaration', '7ebcc28596c32c2802b2a52b5ecea2012077da61ee376b95185a5d70e4db4c89']],
  [12102, [9_388_056, 9_388_483, 'FunctionDeclaration', '39cefd4a04a4b32cc60e53460a841ee7ab21391272b7bd3917260d1314c189e7']],
  [12103, [9_388_483, 9_389_250, 'FunctionDeclaration', '4ed3a1aee3ab8b5699e86c1017cf61b36b3ea30d96ecab3c2b71f1f9626470ef']],
  [12304, [9_535_185, 9_535_853, 'FunctionDeclaration', '7f33966ed72c337e5d912ffa6a51edb096da833e7dccdc65148534fdbe9ee01f']],
  [13330, [10_016_638, 10_018_380, 'FunctionDeclaration', '4f03ac3b0adde9197922fe35c4014529210395c5188cb599f1d113c2f0a4bf52']],
  [15893, [11_536_438, 11_536_934, 'FunctionDeclaration', 'd00881320afd964e8535c5ef961975c8ace50573ed44add2e4fdd91d718681aa']],
  [16489, [11_852_096, 11_852_210, 'FunctionDeclaration', '7a48a06097607aa8a2748efa3c4d9b604c3e60592fc87cf18f55054d27163d70']],
  [17636, [12_419_867, 12_421_117, 'FunctionDeclaration', '2d751db44be5731e09a8fee2d0ee0c7a626a6a89a2eb5aa53ba63c81983d2680']],
  [17950, [12_598_521, 12_598_702, 'FunctionDeclaration', '2ca89f73ec17b0db3fb4334d543ab59170db833eb05aab98f837b05fcc119dc4']],
  [18035, [12_635_669, 12_636_407, 'FunctionDeclaration', '508c9cac192936279384f99cceadce3ee43558207ed36ebefdc8f9faf83a210c']],
  [18061, [12_642_227, 12_642_316, 'FunctionDeclaration', '1d84ff2aa4d615da162043254d9618eef06399beb9caf45b0cbebb06447e71d7']],
  [18062, [12_642_316, 12_642_367, 'FunctionDeclaration', '6576821a8b55f214d8ba673062bf9efa73a41c85d2232b98089b2676a771e332']],
  [18065, [12_644_565, 12_644_671, 'FunctionDeclaration', '67fdd54a5f91b798153159ef6d8cae9110414b52d0a205d7ebb0324f147359f6']],
  [18423, [13_080_700, 13_112_054, 'FunctionDeclaration', 'f7ef250b9d096f9a61de4c7a751c125de0390975c7b07c3abe4b8770e0147744']],
  [18439, [13_125_784, 13_125_902, 'FunctionDeclaration', '13c9fb151b64031b47837c21ca050d71be4448e3671f677f3ece9a1ad1ed299c']],
  [18538, [13_176_568, 13_176_879, 'FunctionDeclaration', '3b46732a0f29b733157d88f383f35ba3e2c8627a7aa651f44d90feea218cb2eb']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_92_BUNDLE and CLAUDE_CODE_2_1_94_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
}

test('target94 authenticates all remaining runtime owner units', bundleOptions, () => {
  if (!selected || !baselinePath || !targetPath) return
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(
    sha256(baselineBytes),
    '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362',
  )
  assert.equal(
    sha256(targetBytes),
    '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, [start, end, nodeType, expectedHash]] of units) {
    const region = structural.regions[index]
    assert.equal(
      region.classification,
      index === 11530 ? 'changed' : 'unresolved',
      `${index}: class`,
    )
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.nodeType,
        region.target.sourceHash,
      ],
      [start, end, nodeType, expectedHash],
      `${index}: identity`,
    )
    const unit = target.slice(start, end)
    assert.equal(sha256(unit), expectedHash, `${index}: bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one complete top-level unit`,
    )
  }
})

test('target94 boundary introduces structured team-memory server errors', bundleOptions, () => {
  if (!selected || !baselinePath || !targetPath) return
  const baseline = fs.readFileSync(baselinePath, 'utf8')
  const target = fs.readFileSync(targetPath, 'utf8')
  for (const fragment of [
    'Forbidden by server policy',
    'server_message',
    'server_error_code',
    'server_error_type',
  ]) {
    assert.equal(baseline.includes(fragment), false, `baseline: ${fragment}`)
    assert.equal(target.includes(fragment), true, `target: ${fragment}`)
  }
  assert.ok(target.slice(9_388_056, 9_389_250).includes('files_soft_deleted'))
})

test('source owns the complete team-memory server-error propagation graph', sourceOptions, () => {
  assertFragments('src/services/teamMemorySync/types.ts', [
    'TeamMemoryErrorResponseSchema',
    'serverMessage?: string',
    'serverErrorType?: string',
    'serverErrorCode?: string',
    "'forbidden'",
  ])
  assertFragments('src/services/teamMemorySync/index.ts', [
    'const MAX_SERVER_ERROR_FIELD_LENGTH = 256',
    'value.slice(0, MAX_SERVER_ERROR_FIELD_LENGTH)',
    'TeamMemoryErrorResponseSchema().safeParse',
    "status === 403 ? 'forbidden' : 'auth'",
    'const serverError = getServerErrorMetadata(error)',
    '...serverError',
    'serverMessage: result.serverMessage',
    'serverErrorCode: result.serverErrorCode',
    'serverErrorType: result.serverErrorType',
    "probe.errorType === 'parse' ? undefined : probe.errorType",
    'server_message: outcome.serverMessage',
    'server_error_code: outcome.serverErrorCode',
    'server_error_type: outcome.serverErrorType',
    'files_soft_deleted: outcome.filesSoftDeleted',
  ])
})

test('source owns compact Slack output, web fetch, memory, and side-question control', sourceOptions, () => {
  assertFragments('src/tools/MCPTool/UI.tsx', [
    'trySlackSendCompact(mcpOutput, input)',
    'Sent a message to',
    'createHyperlink(slackSend.url, slackSend.channel)',
    'SLACK_ARCHIVES_RE',
    "text.includes('\"message_link\"')",
    "inp?.channel_id ?? inp?.channel ?? m[1]",
  ])
  assertFragments('src/tools/WebFetchTool/WebFetchTool.ts', [
    "contentType.includes('text/markdown')",
    'content.length < MAX_MARKDOWN_LENGTH',
    'result = content',
    'if (persistedPath)',
    '[Binary content (${contentType}',
  ])
  assertFragments('src/memdir/memoryScan.ts', [
    'last_read: string | null',
    "typeof frontmatter.last_read === 'string'",
  ])
  assertFragments('src/utils/sideQuestion.ts', [
    'createChildAbortController(parentController)',
    'retryAttempt: message.retryAttempt',
    'retryInMs: message.retryInMs',
    'isAbortError(error) || abortController.signal.aborted',
    'aborted: true',
  ])
  assertFragments('src/utils/sessionStorage.ts', [
    "m.attachment.type === 'skill_listing'",
  ])
})

test('source owns permission, survey, relaunch, and onboarding UI reachability', sourceOptions, () => {
  assertFragments('src/utils/permissionStatus.ts', [
    'createPermissionQueueSetter(',
    'next[0] ? formatPermissionStatus(next[0]) : null',
    "'answer question'",
    "'approve plan'",
  ])
  assertFragments('src/screens/REPL.tsx', [
    'createPermissionQueueSetter(rawSetToolUseConfirmQueue)',
  ])
  assertFragments('src/components/FeedbackSurvey/FeedbackSurveyView.tsx', [
    'Button tabIndex={-1}',
    "setInputValue('')",
    "backgroundColor={hovered ? 'userMessageBackgroundHover' : undefined}",
  ])
  assertFragments('src/utils/relaunch.ts', [
    'getRelaunchLauncher()',
    'isInBundledMode()',
    'cmd: process.execPath',
    'prefixArgs: [script]',
  ])
  assertFragments('src/components/TeamOnboardingDiscoveryStep.tsx', [
    'export function TeamOnboardingDiscoveryStep',
    "{ 'confirm:yes': onDone }",
    'TEAM_ONBOARDING_DISCOVERY_COPY.heading',
  ])
})

test('source owns Bedrock helpers, thinking display, and plugin telemetry warmup', sourceOptions, () => {
  assertFragments('src/utils/model/bedrockModelUpgrade.tsx', [
    'function keyForBedrockId(',
    'export function upgradeKey(',
    'findBedrockUpgradeCandidates()',
    'checkBedrockDefaultAvailability()',
    'function previousKey(',
  ])
  assertFragments('src/utils/thinking.ts', [
    "display?: 'summarized' | 'omitted'",
  ])
  assertFragments('src/cli/print.ts', [
    'function thinkingConfigForMaxTokens(',
    "display: 'summarized' | 'omitted' | undefined",
    "if (maxThinkingTokens === 0) return { type: 'disabled' }",
    "return { type: 'enabled', budgetTokens: maxThinkingTokens, display }",
    'const thinkingDisplay =',
    'thinkingConfigForMaxTokens(',
  ])
  assertFragments('src/main.tsx', [
    'loadPluginMcpServers(plugin, [])',
    'loadPluginLspServers(plugin, [])',
    'logPluginsEnabledForSession(enabled, managedNames, getPluginSeedDirs())',
  ])
  if (historical) {
    assert.equal(
      source('src/utils/permissionStatus.ts').includes('usePermissionStatus'),
      false,
      'target94 has the queue status graph before later background-source evolution',
    )
  } else {
    assertFragments('src/utils/permissionStatus.ts', [
      "'worker-sandbox'",
      "'elicitation'",
      'usePermissionStatus({',
    ])
  }
})
