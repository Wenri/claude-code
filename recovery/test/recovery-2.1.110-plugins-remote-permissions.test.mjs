import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const historical = semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative.replace(/^src\//, '')), 'utf8')
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.equal(contents.includes(fragment), true, fragment)
  }
}

test('propagates user-modified writes and failed-hook context', () => {
  includesAll(source('src/tools/FileWriteTool/FileWriteTool.ts'), [
    'userModified',
    'The user modified your proposed content before accepting it.',
  ])
  includesAll(source('src/Tool.ts'), ['userModified?: boolean'])
  includesAll(source('src/services/tools/toolExecution.ts'), [
    "case 'additionalContext'",
    'resultingMessages.push(result.message)',
  ])
})

test('rechecks rewritten permission input and protects bypass mode', () => {
  includesAll(source('src/utils/permissions/permissions.ts'), [
    'getPermissionRequestHookRuleOverride',
    'await checkRuleBasedPermissions(tool, finalInput, context)',
    'updatedInput, but ${ruleCheck.behavior} rule overrides',
  ])
  includesAll(source('src/hooks/toolPermission/PermissionContext.ts'), [
    'await checkRuleBasedPermissions',
    'ruleOverride?.behavior',
    'finalInput',
  ])
  includesAll(source('src/utils/permissions/PermissionUpdate.ts'), [
    "update.mode === 'bypassPermissions'",
    '!context.isBypassPermissionsModeAvailable',
    'Ignoring permission update',
  ])
})

test('installs manifest dependencies and keeps their completion note', () => {
  includesAll(source('src/utils/plugins/pluginInstallationHelpers.ts'), [
    'resolvePluginJsonDependencies',
    'cacheResult.manifest.dependencies',
    'formatDependencyCountSuffix',
    'depNote',
    'installPluginDependencies(finalPath)',
  ])
  includesAll(source('src/utils/plugins/pluginDependencyInstaller.ts'), [
    "args: ['install', '--frozen-lockfile', '--ignore-scripts']",
    "args: ['ci', '--ignore-scripts']",
    'PLUGIN_DEPENDENCY_INSTALL_TIMEOUT_MS',
  ])
  for (const file of [
    'src/commands/plugin/BrowseMarketplace.tsx',
    'src/commands/plugin/DiscoverPlugins.tsx',
  ]) {
    includesAll(source(file), [
      'depNote: result_0.depNote',
      '${plugin_',
      '${depNote}. Run /reload-plugins',
    ])
  }
})

test('limits explicit Skill invocation to the current human turn', () => {
  includesAll(source('src/tools/SkillTool/SkillTool.ts'), [
    'wasExplicitlyInvoked',
    'context.turnStartIndex',
    'disable-model-invocation',
    'commandPattern.test',
  ])
  includesAll(source('src/query.ts'), [
    'findCurrentTurnStart',
    'turnStartIndex: findCurrentTurnStart(messagesForQuery)',
  ])
  const queryEngine = source('src/QueryEngine.ts')
  if (historical) {
    includesAll(queryEngine, ['turnStartIndex: findCurrentTurnStart(messages)'])
  } else {
    includesAll(queryEngine, ['turnStartIndex: 0'])
  }
})

test('recovers Remote Control stale-auth and rename persistence', () => {
  includesAll(source('src/bridge/codeSessionApi.ts'), [
    "'session_stale_relogin'",
    'RemoteCredentialsTerminal',
  ])
  includesAll(source('src/bridge/remoteBridgeCore.ts'), [
    'session expired for trusted-device check — run /login to re-authenticate',
  ])
  includesAll(source('src/bridge/bridgeMessaging.ts'), [
    "case 'rename_session'",
    'onRenameSession',
  ])
  includesAll(source('src/bridge/initReplBridge.ts'), [
    'saveCustomTitle',
    "'remote'",
  ])
})

test('preserves empty dependency constraints for validation', () => {
  includesAll(source('src/utils/plugins/dependencyResolver.ts'), [
    'normalizedVersion === undefined && normalizedSha === undefined',
    'required !== undefined && !isBare',
    'installed,',
  ])
})
