import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.92-to-2.1.94'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const historical = semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_92_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_94_BUNDLE
const BASELINE_BUNDLE_SHA256 =
  '6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362'
const TARGET_BUNDLE_SHA256 =
  '11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564'

function readSource(relativePath) {
  const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
  const sourceMap = source.indexOf('//# sourceMappingURL=')
  return sourceMap === -1 ? source : source.slice(0, sourceMap)
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

function isMantleModelId(model) {
  return model.startsWith('anthropic.') && !/-v\d+(?::\d+)?$/.test(model)
}

test('recovers per-model Mantle routing and first-party-compatible capabilities', () => {
  assert.equal(isMantleModelId('anthropic.claude-opus-4-6'), true)
  assert.equal(isMantleModelId('anthropic.claude-opus-4-6-v1:0'), false)
  assert.equal(isMantleModelId('claude-opus-4-6'), false)

  const providers = readSource('utils/model/providers.ts')
  const client = readSource('services/api/client.ts')
  const betas = readSource('utils/betas.ts')
  const thinking = readSource('utils/thinking.ts')
  const effort = readSource('utils/effort.ts')
  assert.match(providers, /\| 'mantle'/)
  assert.match(providers, /export function getSecondaryAPIProvider/)
  assert.match(
    providers,
    /getAPIProvider\(\) === 'bedrock'[\s\S]*?CLAUDE_CODE_USE_MANTLE[\s\S]*?return 'mantle'/,
  )
  assert.equal(
    providers.includes(
      "model.startsWith('anthropic.') && !/-v\\d+(?::\\d+)?$/.test(model)",
    ),
    true,
  )
  assert.match(providers, /export function getAPIProviderForModel/)
  assert.match(
    providers,
    /provider === 'firstParty' \|\|[\s\S]*?provider === 'foundry' \|\|[\s\S]*?provider === 'mantle'/,
  )
  assert.match(client, /if \(apiProvider === 'mantle'\)/)
  assert.match(client, /AnthropicBedrockMantle/)
  assert.match(client, /CLAUDE_CODE_SKIP_MANTLE_AUTH/)
  assert.match(
    betas,
    /provider === 'vertex' \|\|[\s\S]*?provider === 'bedrock' \|\|[\s\S]*?provider === 'mantle'/,
  )
  assert.match(
    thinking,
    /isFirstPartyCompatibleAPIProvider\(getAPIProviderForModel\(model\)\)/,
  )
  assert.match(
    effort,
    /isFirstPartyCompatibleAPIProvider\(getAPIProviderForModel\(model\)\)/,
  )

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  for (const marker of [
    'CLAUDE_CODE_USE_MANTLE',
    'CLAUDE_CODE_SKIP_MANTLE_AUTH',
    'ANTHROPIC_BEDROCK_MANTLE_BASE_URL',
    'AnthropicBedrockMantle',
  ]) {
    assert.equal(baseline.includes(marker), false, marker)
    assert.equal(target.includes(marker), true, marker)
  }
})

test('recovers corrected Bedrock routing, effort defaults, resume, and hyperlink settings', () => {
  const configs = readSource('utils/model/configs.ts')
  const effort = readSource('utils/effort.ts')
  const resume = readSource('utils/crossProjectResume.ts')
  const hyperlinks = readSource('ink/supports-hyperlinks.ts')
  assert.match(
    configs,
    /bedrock: 'us\.anthropic\.claude-3-5-sonnet-20241022-v2:0'/,
  )
  assert.match(
    effort,
    /isUltrathinkEnabled\(\)[\s\S]*?\(isProSubscriber\(\) \|\| isMaxSubscriber\(\)\)/,
  )
  assert.doesNotMatch(effort, /isTeamSubscriber/)
  assert.doesNotMatch(resume, /process\.env\.USER_TYPE !== 'ant'/)
  assert.match(
    resume,
    /const isSameRepo = worktreePaths\.some\([\s\S]*?isSameRepoWorktree: true/,
  )
  assert.match(hyperlinks, /const env = options\?\.env \?\? process\.env/)
  assert.match(
    hyperlinks,
    /if \('FORCE_HYPERLINK' in env\) \{[\s\S]*?return stdoutSupported/,
  )

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(
    baseline.includes('us.anthropic.claude-3-5-sonnet-20241022-v2:0'),
    false,
  )
  assert.equal(
    target.includes('us.anthropic.claude-3-5-sonnet-20241022-v2:0'),
    true,
  )
})

test('recovers plugin metadata, skill hooks, stable names, and prompt session titles', () => {
  const commands = readSource('utils/plugins/loadPluginCommands.ts')
  const outputStyles = readSource('utils/plugins/loadPluginOutputStyles.ts')
  const pluginLoader = readSource('utils/plugins/pluginLoader.ts')
  const hooks = readSource('utils/hooks.ts')
  const processInput = readSource('utils/processUserInput/processUserInput.ts')
  const coreSchemas = readSource('entrypoints/sdk/coreSchemas.ts')
  assert.match(
    outputStyles,
    /frontmatter\['keep-coding-instructions'\]/,
  )
  assert.match(commands, /HooksSchema\(\)\.safeParse\(frontmatter\.hooks\)/)
  assert.match(commands, /skillRoot:[\s\S]*?hooks \? pluginPath : undefined/)
  assert.match(
    commands,
    /typeof frontmatter\.name === 'string'[\s\S]*?frontmatter\.name\.trim\(\)[\s\S]*?\|\| basename\(skillsPath\)/,
  )
  if (historical) {
    assert.match(
      pluginLoader,
      /if \(installPath && \(await pathExists\(installPath\)\)\) \{[\s\S]*?pluginPath = installPath/,
    )
  } else {
    assert.match(pluginLoader, /loadPluginFromMarketplaceEntryCacheOnly/)
    assert.match(
      pluginLoader,
      /installPath &&[\s\S]*?await pathExists\(installPath\)[\s\S]*?pluginPath = installPath/,
    )
  }
  assert.match(
    coreSchemas,
    /UserPromptSubmitHookSpecificOutputSchema[\s\S]*?sessionTitle: z\.string\(\)\.optional\(\)/,
  )
  assert.match(
    hooks,
    /export async function applyHookSessionTitle[\s\S]*?saveCustomTitle\(sessionId, sanitized, undefined, 'hook'\)[\s\S]*?saveAgentName\(sessionId, sanitized, undefined, 'hook'\)/,
  )
  assert.match(
    processInput,
    /if \(hookSessionTitle\) \{[\s\S]*?await applyHookSessionTitle\(hookSessionTitle\)/,
  )

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  assert.equal(baseline.split('keep-coding-instructions').length - 1, 1)
  assert.equal(target.split('keep-coding-instructions').length - 1, 2)
  assert.equal(
    baseline.includes(
      'Set the session title (same effect as /rename)',
    ),
    false,
  )
  assert.equal(
    target.includes('Set the session title (same effect as /rename)'),
    true,
  )
})

test('recovers bounded Retry-After, UTF-8 streaming, strict keychain writes, and SDK partial output', () => {
  const retry = readSource('services/api/withRetry.ts')
  const guard = readSource('utils/streamJsonStdoutGuard.ts')
  const auth = readSource('utils/auth.ts')
  const claude = readSource('services/api/claude.ts')
  assert.match(retry, /const MAX_RETRY_AFTER_MS = 60_000/)
  assert.match(
    retry,
    /if \(!persistent && delayMs > MAX_RETRY_AFTER_MS\)[\s\S]*?tengu_api_retry_after_too_long[\s\S]*?throw new CannotRetryError/,
  )
  assert.match(guard, /const decoder = new TextDecoder\('utf-8'\)/)
  assert.match(guard, /decoder\.decode\(chunk, \{ stream: true \}\)/)
  assert.match(guard, /buffer \+= decoder\.decode\(\)/)
  assert.match(auth, /timeout: 5000/)
  assert.match(
    auth,
    /if \(result\.exitCode !== 0\)[\s\S]*?Failed to save API key to macOS Keychain/,
  )
  assert.match(
    claude,
    /if \(options\.querySource === 'sdk'\)[\s\S]*?contentBlock\.text\.trim\(\)[\s\S]*?partialMessage[\s\S]*?type: 'assistant'/,
  )

  const baseline = requiredBundle(
    baselineBundlePath,
    'CLAUDE_CODE_2_1_92_BUNDLE',
    BASELINE_BUNDLE_SHA256,
  )
  const target = requiredBundle(
    targetBundlePath,
    'CLAUDE_CODE_2_1_94_BUNDLE',
    TARGET_BUNDLE_SHA256,
  )
  for (const marker of [
    'tengu_api_retry_after_too_long',
    'Failed to save API key to macOS Keychain',
  ]) {
    assert.equal(baseline.includes(marker), false, marker)
    assert.equal(target.includes(marker), true, marker)
  }
  assert.equal(
    target.includes('new TextDecoder("utf-8")') ||
      target.includes("new TextDecoder('utf-8')"),
    true,
  )
})
