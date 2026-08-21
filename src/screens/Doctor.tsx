import { join } from 'path'
import React, {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { getOriginalCwd } from '../bootstrap/state.js'
import { KeybindingWarnings } from '../components/KeybindingWarnings.js'
import { Pane } from '../components/design-system/Pane.js'
import { StatusIcon } from '../components/design-system/StatusIcon.js'
import { Tree } from '../components/design-system/Tree.js'
import { McpParsingWarnings } from '../components/mcp/McpParsingWarnings.js'
import { SandboxDoctorSection } from '../components/sandbox/SandboxDoctorSection.js'
import { ValidationErrorsList } from '../components/ValidationErrorsList.js'
import { getBgDaemonStatus, type BgDaemonStatus } from '../daemon/status.js'
import { useSettingsErrors } from '../hooks/notifs/useSettingsErrors.js'
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js'
import { Box, Text } from '../ink.js'
import {
  getCachedKeybindingWarnings,
  getKeybindingsPath,
} from '../keybindings/loadUserBindings.js'
import type { KeybindingWarning } from '../keybindings/validate.js'
import { useKeybindings } from '../keybindings/useKeybinding.js'
import { useAppState } from '../state/AppState.js'
import type { LocalJSXCommandOnDone } from '../types/command.js'
import { getPluginErrorMessage, type PluginError } from '../types/plugin.js'
import { isDaemonCliEnabled } from '../utils/agentsFleet.js'
import {
  getGcsDistTags,
  getNpmDistTags,
  type NpmDistTags,
} from '../utils/autoUpdater.js'
import { getModelMaxOutputTokens } from '../utils/context.js'
import {
  type ContextWarning,
  type ContextWarnings,
  checkContextWarnings,
} from '../utils/doctorContextWarnings.js'
import {
  type DiagnosticInfo,
  getDoctorDiagnostic,
} from '../utils/doctorDiagnostic.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import {
  type EnvVarValidationResult,
  validateBoundedIntEnvVar,
} from '../utils/envValidation.js'
import { pathExists } from '../utils/file.js'
import {
  cleanupStaleLocks,
  getAllLockInfo,
  isPidBasedLockingEnabled,
  type LockInfo,
} from '../utils/nativeInstaller/pidLock.js'
import { isEssentialTrafficOnly } from '../utils/privacyLevel.js'
import { SandboxManager } from '../utils/sandbox/sandbox-adapter.js'
import { getInitialSettings } from '../utils/settings/settings.js'
import type { SettingSource } from '../utils/settings/constants.js'
import type { ValidationError } from '../utils/settings/validation.js'
import {
  BASH_MAX_OUTPUT_DEFAULT,
  BASH_MAX_OUTPUT_UPPER_LIMIT,
} from '../utils/shell/outputLimits.js'
import {
  TASK_MAX_OUTPUT_DEFAULT,
  TASK_MAX_OUTPUT_UPPER_LIMIT,
} from '../utils/task/outputFormatting.js'
import { getXDGStateHome } from '../utils/xdg.js'

type Props = {
  onDone: LocalJSXCommandOnDone
}

type AgentInfo = {
  activeAgents: Array<{
    agentType: string
    source: SettingSource | 'built-in' | 'plugin'
  }>
  userAgentsDir: string
  projectAgentsDir: string
  userDirExists: boolean
  projectDirExists: boolean
  failedFiles: Array<{ path: string; error: string }>
}

type VersionLockInfo = {
  enabled: boolean
  locks: LockInfo[]
  locksDir: string
  staleLocksCleaned: number
}

type EnvValidation = EnvVarValidationResult & { name: string }

type DistTagsResult = {
  tags: NpmDistTags
  isNative: boolean
}

export function DistTagsDisplay({
  promise,
}: {
  promise: Promise<DistTagsResult>
}): React.ReactNode {
  const { tags, isNative } = use(promise)
  if (!tags.latest) {
    return isNative && isEssentialTrafficOnly() ? (
      <Tree.Node dimColor>
        Version check skipped (essential-traffic-only mode)
      </Tree.Node>
    ) : (
      <Tree.Node dimColor>Failed to fetch versions</Tree.Node>
    )
  }

  return (
    <Tree.Group>
      {tags.stable && <Tree.Node>Stable version: {tags.stable}</Tree.Node>}
      <Tree.Node>Latest version: {tags.latest}</Tree.Node>
    </Tree.Group>
  )
}

function BackgroundServerDetails({
  promise,
}: {
  promise: Promise<BgDaemonStatus>
}): React.ReactNode {
  const status = use(promise)
  const supervisor = status.supervisor
  const workerCount = status.workersLive ?? status.workersRoster
  const mode = status.serviceInstalled ? 'service-managed' : 'ephemeral'

  return (
    <>
      {supervisor === null ? (
        <Tree.Node>Status: not running</Tree.Node>
      ) : (
        <Tree.Node>
          Status: running · pid {supervisor.pid} · v{supervisor.version} ·{' '}
          {workerCount} bg {workerCount === 1 ? 'worker' : 'workers'}
          {status.controlReachable ? '' : ' · control.sock unreachable'}
        </Tree.Node>
      )}
      <Tree.Node>Mode: {mode}</Tree.Node>
      {supervisor !== null && supervisor.version !== MACRO.VERSION ? (
        <Tree.Node color="warning">
          Server version v{supervisor.version} differs from this CLI (v
          {MACRO.VERSION}). It will restart on next use.
        </Tree.Node>
      ) : null}
      {status.serviceInstalled ? (
        <Tree.Node color="warning">
          A persistent launchd/systemd unit is installed. The next server start
          will remove it; run{' '}
          <Text dimColor>claude daemon uninstall</Text> to remove it now.
        </Tree.Node>
      ) : null}
      {status.configuredWorkers > 0 ? (
        <Tree.Node color="warning">
          {status.configuredWorkers} configured background{' '}
          {status.configuredWorkers === 1 ? 'worker' : 'workers'} (daemon.json)
          only run while a foreground client or background job keeps the server
          alive. They will not start after reboot.
        </Tree.Node>
      ) : null}
      <Tree.Node dimColor>
        See <Text dimColor>claude daemon status</Text> for details
      </Tree.Node>
    </>
  )
}

function BackgroundServer(): React.ReactNode {
  const promise = useMemo(() => getBgDaemonStatus(), [])
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Background server</Text>
      <Tree variant="tree">
        <Suspense fallback={<Tree.Node dimColor>Probing background server…</Tree.Node>}>
          <BackgroundServerDetails promise={promise} />
        </Suspense>
      </Tree>
    </Box>
  )
}

function ContextWarningNode({
  warning,
}: {
  warning: ContextWarning
}): React.ReactNode {
  return (
    <Tree.Node color="warning" label={warning.message}>
      {warning.details.map((detail, index) => (
        <Tree.Node key={index} dimColor>
          {detail}
        </Tree.Node>
      ))}
    </Tree.Node>
  )
}

function getSandboxDependencyErrors(): string[] {
  return (
    SandboxManager.isSupportedPlatform() &&
    SandboxManager.isSandboxEnabledInSettings() &&
    SandboxManager.isPlatformInEnabledList()
      ? SandboxManager.checkDependencies().errors
      : []
  )
}

export function buildFixPrompt(
  diagnostic: DiagnosticInfo | null,
  agentInfo: AgentInfo | null,
  settingsErrors: ValidationError[],
  pluginErrors: PluginError[],
  contextWarnings: ContextWarnings | null,
  envValidationErrors: EnvValidation[],
  keybindingWarnings: KeybindingWarning[] = getCachedKeybindingWarnings(),
  sandboxErrors: string[] = getSandboxDependencyErrors(),
): string | null {
  const issues: string[] = []

  for (const warning of diagnostic?.warnings ?? []) {
    issues.push(`- ${warning.issue}\n  Suggested fix: ${warning.fix}`)
  }
  for (const warning of keybindingWarnings) {
    issues.push(
      `- Keybinding (${getKeybindingsPath()}): ${warning.message}${
        warning.suggestion
          ? `\n  Suggested fix: ${warning.suggestion}`
          : ''
      }`,
    )
  }
  for (const failedFile of agentInfo?.failedFiles ?? []) {
    issues.push(
      `- Agent file failed to parse: ${failedFile.path}\n  Error: ${failedFile.error}`,
    )
  }
  for (const error of settingsErrors) {
    const location = [error.file, error.path].filter(Boolean).join(' › ')
    issues.push(
      `- Settings${location ? ` (${location})` : ''}: ${error.message}${
        error.suggestion ? `\n  Suggested fix: ${error.suggestion}` : ''
      }`,
    )
  }
  for (const error of pluginErrors) {
    const location = [
      'plugin' in error && error.plugin,
      error.source,
    ]
      .filter(Boolean)
      .join(' @ ')
    issues.push(
      `- Plugin${location ? ` (${location})` : ''}: ${getPluginErrorMessage(error)}`,
    )
  }
  for (const error of sandboxErrors) {
    issues.push(
      `- Sandbox: ${error}\n  (See /sandbox for install instructions)`,
    )
  }
  for (const warning of [
    contextWarnings?.claudeMdWarning,
    contextWarnings?.agentWarning,
    contextWarnings?.unreachableRulesWarning,
  ]) {
    if (warning) {
      issues.push(`- ${warning.message}\n  ${warning.details.join('\n  ')}`)
    }
  }
  for (const error of envValidationErrors) {
    issues.push(`- Environment variable ${error.name}: ${error.message}`)
  }

  if (issues.length === 0) return null

  return [
    'Help me fix the issues reported by /doctor below.',
    '',
    'For each issue: briefly explain what the fix will do, then ask me to confirm before running any shell command that deletes files, modifies global config, or changes my installation. Safe read-only checks are fine without asking. If a suggested fix looks wrong for my setup, say so instead of running it.',
    '',
    issues.join('\n'),
  ].join('\n')
}

export function Doctor({ onDone }: Props): React.ReactNode {
  const agentDefinitions = useAppState(state => state.agentDefinitions)
  const toolPermissionContext = useAppState(state => state.toolPermissionContext)
  const pluginErrors = useAppState(state => state.plugins.errors)
  useExitOnCtrlCDWithKeybindings()

  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo | null>(null)
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null)
  const [contextWarnings, setContextWarnings] =
    useState<ContextWarnings | null>(null)
  const [versionLockInfo, setVersionLockInfo] =
    useState<VersionLockInfo | null>(null)
  const validationErrors = useSettingsErrors()

  const distTagsPromise = useMemo(async (): Promise<DistTagsResult> => {
    const isNative =
      (await getDoctorDiagnostic()).installationType === 'native'
    return {
      tags: await (isNative ? getGcsDistTags : getNpmDistTags)().catch(() => ({
        latest: null,
        stable: null,
      })),
      isNative,
    }
  }, [])
  const autoUpdatesChannel =
    getInitialSettings()?.autoUpdatesChannel ?? 'latest'
  const settingsErrors = validationErrors.filter(
    error => error.mcpErrorMetadata === undefined,
  )
  const envValidationErrors = useMemo((): EnvValidation[] => {
    return [
      {
        name: 'BASH_MAX_OUTPUT_LENGTH',
        default: BASH_MAX_OUTPUT_DEFAULT,
        upperLimit: BASH_MAX_OUTPUT_UPPER_LIMIT,
      },
      {
        name: 'TASK_MAX_OUTPUT_LENGTH',
        default: TASK_MAX_OUTPUT_DEFAULT,
        upperLimit: TASK_MAX_OUTPUT_UPPER_LIMIT,
      },
      {
        name: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
        ...getModelMaxOutputTokens('claude-opus-4-6'),
      },
    ]
      .map(config => ({
        name: config.name,
        ...validateBoundedIntEnvVar(
          config.name,
          process.env[config.name],
          config.default,
          config.upperLimit,
        ),
      }))
      .filter(result => result.status !== 'valid')
  }, [])

  useEffect(() => {
    void getDoctorDiagnostic({ probeKeychain: true }).then(setDiagnostic)
    void (async () => {
      const userAgentsDir = join(getClaudeConfigHomeDir(), 'agents')
      const projectAgentsDir = join(getOriginalCwd(), '.claude', 'agents')
      const { activeAgents, allAgents, failedFiles } = agentDefinitions
      const [userDirExists, projectDirExists] = await Promise.all([
        pathExists(userAgentsDir),
        pathExists(projectAgentsDir),
      ])
      const nextAgentInfo: AgentInfo = {
        activeAgents: activeAgents.map(agent => ({
          agentType: agent.agentType,
          source: agent.source,
        })),
        userAgentsDir,
        projectAgentsDir,
        userDirExists,
        projectDirExists,
        failedFiles: failedFiles ?? [],
      }
      setAgentInfo(nextAgentInfo)
      setContextWarnings(
        await checkContextWarnings(
          { activeAgents, allAgents, failedFiles },
          async () => toolPermissionContext,
        ),
      )

      if (isPidBasedLockingEnabled()) {
        const locksDir = join(getXDGStateHome(), 'claude', 'locks')
        const staleLocksCleaned = cleanupStaleLocks(locksDir)
        const locks = getAllLockInfo(locksDir)
        setVersionLockInfo({
          enabled: true,
          locks,
          locksDir,
          staleLocksCleaned,
        })
      } else {
        setVersionLockInfo({
          enabled: false,
          locks: [],
          locksDir: '',
          staleLocksCleaned: 0,
        })
      }
    })()
  }, [toolPermissionContext, agentDefinitions])

  const handleDismiss = useCallback(() => {
    onDone('Claude Code diagnostics dismissed', { display: 'system' })
  }, [onDone])
  const fixPrompt = useMemo(
    () =>
      buildFixPrompt(
        diagnostic,
        agentInfo,
        settingsErrors,
        pluginErrors,
        contextWarnings,
        envValidationErrors,
      ),
    [
      diagnostic,
      agentInfo,
      settingsErrors,
      pluginErrors,
      contextWarnings,
      envValidationErrors,
    ],
  )

  useKeybindings(
    {
      'confirm:yes': handleDismiss,
      'confirm:no': handleDismiss,
    },
    { context: 'Confirmation' },
  )
  useKeybindings(
    {
      'doctor:fix': () => {
        if (fixPrompt) {
          onDone(fixPrompt, { display: 'user', shouldQuery: true })
        }
      },
    },
    { context: 'Doctor', isActive: fixPrompt !== null },
  )

  if (!diagnostic) {
    return (
      <Pane>
        <Text dimColor>Checking installation status…</Text>
      </Pane>
    )
  }

  return (
    <Pane>
      <Box flexDirection="column">
        <Box flexDirection="column">
          <Text bold>Diagnostics</Text>
          <Tree variant="tree">
            <Tree.Node>
              Currently running: {diagnostic.installationType} (
              {diagnostic.version})
            </Tree.Node>
            {MACRO.GIT_SHA && (
              <Tree.Node>Commit: {MACRO.GIT_SHA.slice(0, 12)}</Tree.Node>
            )}
            <Tree.Node>
              Platform: {process.platform}-{process.arch}
            </Tree.Node>
            {diagnostic.packageManager && (
              <Tree.Node>
                Package manager: {diagnostic.packageManager}
              </Tree.Node>
            )}
            <Tree.Node>Path: {diagnostic.installationPath}</Tree.Node>
            {diagnostic.invokedBinary !== diagnostic.installationPath && (
              <Tree.Node>Invoked: {diagnostic.invokedBinary}</Tree.Node>
            )}
            <Tree.Node>
              Config install method: {diagnostic.configInstallMethod}
            </Tree.Node>
            <Tree.Node>
              Search: {diagnostic.ripgrepStatus.working ? 'OK' : 'Not working'} (
              {diagnostic.ripgrepStatus.mode === 'embedded'
                ? 'bundled'
                : diagnostic.ripgrepStatus.mode === 'builtin'
                  ? 'vendor'
                  : diagnostic.ripgrepStatus.systemPath || 'system'}
              )
            </Tree.Node>
          </Tree>
        </Box>

        {diagnostic.multipleInstallations.length > 1 && (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <StatusIcon status="warning" withSpace />
              Multiple installations found
            </Text>
            <Tree variant="tree">
              {diagnostic.multipleInstallations.map((installation, index) => (
                <Tree.Node key={index}>
                  {installation.type} at {installation.path}
                </Tree.Node>
              ))}
            </Tree>
          </Box>
        )}

        {diagnostic.warnings.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {diagnostic.warnings.map((warning, index) => (
              <Box key={index} flexDirection="column">
                <Text>
                  <StatusIcon status="warning" withSpace />
                  {warning.issue}
                </Text>
                <Box marginLeft={2}>
                  <Tree>
                    <Tree.Node dimColor>{warning.fix}</Tree.Node>
                  </Tree>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {settingsErrors.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Invalid settings</Text>
            <ValidationErrorsList errors={settingsErrors} />
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Updates</Text>
          <Tree variant="tree">
            <Tree.Node>
              Auto-updates:{' '}
              {diagnostic.packageManager
                ? 'Managed by package manager'
                : diagnostic.autoUpdates}
            </Tree.Node>
            {diagnostic.hasUpdatePermissions !== null && (
              <Tree.Node>
                Update permissions:{' '}
                {diagnostic.hasUpdatePermissions ? 'Yes' : 'No (requires sudo)'}
              </Tree.Node>
            )}
            <Tree.Node>
              Auto-update channel:{' '}
              {autoUpdatesChannel === 'rc' ? 'slow' : autoUpdatesChannel}
            </Tree.Node>
            <Suspense
              fallback={<Tree.Node dimColor>Checking for updates…</Tree.Node>}
            >
              <DistTagsDisplay promise={distTagsPromise} />
            </Suspense>
          </Tree>
        </Box>

        <SandboxDoctorSection />
        {isDaemonCliEnabled() ? <BackgroundServer /> : null}
        <McpParsingWarnings />
        <KeybindingWarnings />

        {envValidationErrors.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Environment variables</Text>
            <Tree variant="tree">
              {envValidationErrors.map((error, index) => (
                <Tree.Node key={index}>
                  <Text>
                    {error.name}:{' '}
                    <Text color={error.status === 'capped' ? 'warning' : 'error'}>
                      {error.message}
                    </Text>
                  </Text>
                </Tree.Node>
              ))}
            </Tree>
          </Box>
        )}

        {versionLockInfo?.enabled &&
          (versionLockInfo.locks.length > 0 ||
            versionLockInfo.staleLocksCleaned > 0) && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Version locks</Text>
              <Tree variant="tree">
                {versionLockInfo.staleLocksCleaned > 0 && (
                  <Tree.Node dimColor>
                    Cleaned {versionLockInfo.staleLocksCleaned} stale lock(s)
                  </Tree.Node>
                )}
                {versionLockInfo.locks.map((lock, index) => (
                  <Tree.Node key={index}>
                    <Text>
                      {lock.version}: PID {lock.pid}{' '}
                      {lock.isProcessRunning ? (
                        <Text>(running)</Text>
                      ) : (
                        <Text color="warning">(stale)</Text>
                      )}
                    </Text>
                  </Tree.Node>
                ))}
              </Tree>
            </Box>
          )}

        {agentInfo && agentInfo.failedFiles.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <StatusIcon status="error" withSpace />
              <Text bold>Agent parse errors</Text>
            </Text>
            <Tree variant="tree">
              <Tree.Node
                color="error"
                label={`Failed to parse ${agentInfo.failedFiles.length} agent file(s):`}
              >
                {agentInfo.failedFiles.map((file, index) => (
                  <Tree.Node key={index} dimColor>
                    {file.path}: {file.error}
                  </Tree.Node>
                ))}
              </Tree.Node>
            </Tree>
          </Box>
        )}

        {pluginErrors.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <StatusIcon status="error" withSpace />
              <Text bold>Plugin errors</Text>
            </Text>
            <Tree variant="tree">
              <Tree.Node
                color="error"
                label={`${pluginErrors.length} plugin error(s) detected:`}
              >
                {pluginErrors.map((error, index) => (
                  <Tree.Node key={index} dimColor>
                    {error.source || 'unknown'}
                    {'plugin' in error && error.plugin
                      ? ` [${error.plugin}]`
                      : ''}
                    : {getPluginErrorMessage(error)}
                  </Tree.Node>
                ))}
              </Tree.Node>
            </Tree>
          </Box>
        )}

        {contextWarnings?.unreachableRulesWarning && (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <StatusIcon status="warning" withSpace />
              <Text bold>Unreachable permission rules</Text>
            </Text>
            <Tree variant="tree">
              <ContextWarningNode
                warning={contextWarnings.unreachableRulesWarning}
              />
            </Tree>
          </Box>
        )}

        {contextWarnings &&
          (contextWarnings.claudeMdWarning || contextWarnings.agentWarning) && (
            <Box flexDirection="column" marginTop={1}>
              <Text>
                <StatusIcon status="warning" withSpace />
                <Text bold>Context usage warnings</Text>
              </Text>
              <Tree variant="tree">
                {contextWarnings.claudeMdWarning && (
                  <ContextWarningNode
                    warning={contextWarnings.claudeMdWarning}
                  />
                )}
                {contextWarnings.agentWarning && (
                  <ContextWarningNode warning={contextWarnings.agentWarning} />
                )}
              </Tree>
            </Box>
          )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Still having issues? Run /feedback to report details.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="permission">
          Press <Text bold>Enter</Text> to continue
          {fixPrompt && (
            <Text dimColor>
              {' · '}
              <Text bold>f</Text> to fix with Claude
            </Text>
          )}
        </Text>
      </Box>
    </Pane>
  )
}
