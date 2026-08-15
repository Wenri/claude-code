import { setMainLoopModelOverride } from '../bootstrap/state.js'
import { setCurrentJobRespawnFlag } from '../daemon/jobs.js'
import {
  clearApiKeyHelperCache,
  clearAwsCredentialsCache,
  clearGcpCredentialsCache,
  resetAwsAuthRefreshCooldown,
} from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { toError } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import { applyConfigEnvironmentVariables } from '../utils/managedEnv.js'
import {
  permissionModeFromString,
  toExternalPermissionMode,
} from '../utils/permissions/PermissionMode.js'
import {
  notifyPermissionModeChanged,
  notifySessionInternalMetadataChanged,
  notifySessionMetadataChanged,
  type SessionExternalMetadata,
  type SessionInternalMetadata,
} from '../utils/sessionState.js'
import { isBackgroundTask, type TaskState } from '../tasks/types.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { setConfigValue } from '../utils/settings/configSettings.js'
import type { AppState } from './AppStateStore.js'

// Inverse of the push below — restore on worker restart.
export function externalMetadataToAppState(
  metadata: SessionExternalMetadata,
): (prev: AppState) => AppState {
  return prev => ({
    ...prev,
    ...(typeof metadata.permission_mode === 'string'
      ? {
          toolPermissionContext: {
            ...prev.toolPermissionContext,
            mode: permissionModeFromString(metadata.permission_mode),
          },
        }
      : {}),
    ...(typeof metadata.is_ultraplan_mode === 'boolean'
      ? { isUltraplanMode: metadata.is_ultraplan_mode }
      : {}),
  })
}

export function internalMetadataToAppState(
  metadata: SessionInternalMetadata,
): (prev: AppState) => AppState {
  if (!Array.isArray(metadata.session_allow_rules)) return prev => prev
  const sessionAllowRules = metadata.session_allow_rules.filter(
    (rule): rule is string =>
      typeof rule === 'string' && !rule.startsWith('mcp__'),
  )
  if (sessionAllowRules.length === 0) return prev => prev
  return prev => ({
    ...prev,
    toolPermissionContext: {
      ...prev.toolPermissionContext,
      alwaysAllowRules: {
        ...prev.toolPermissionContext.alwaysAllowRules,
        session: sessionAllowRules,
      },
    },
  })
}

function runningBackgroundTasks(state: AppState): Array<{
  task_id: string
  description?: string
}> {
  return (Object.values(state.tasks) as unknown as TaskState[])
    .filter(
      task =>
        isBackgroundTask(task) &&
        (task.type === 'local_bash' || task.type === 'monitor_mcp'),
    )
    .map(task => ({ task_id: task.id, description: task.description }))
}
export function onChangeAppState({
  newState,
  oldState,
}: {
  newState: AppState
  oldState: AppState
}) {
  if (newState.tasks !== oldState.tasks) {
    const previousTasks = runningBackgroundTasks(oldState)
    const nextTasks = runningBackgroundTasks(newState)
    if (
      previousTasks.length !== nextTasks.length ||
      nextTasks.some(
        (task, index) => task.task_id !== previousTasks[index]?.task_id,
      )
    ) {
      notifySessionInternalMetadataChanged({
        running_background_tasks: nextTasks,
      })
    }
  }

  const previousSessionRules =
    oldState.toolPermissionContext.alwaysAllowRules.session
  const nextSessionRules = newState.toolPermissionContext.alwaysAllowRules.session
  if (previousSessionRules !== nextSessionRules) {
    const safeRules = nextSessionRules?.filter(
      rule => !rule.startsWith('mcp__'),
    )
    notifySessionInternalMetadataChanged({
      session_allow_rules: safeRules?.length ? [...safeRules] : null,
    })
  }

  // toolPermissionContext.mode — single choke point for CCR/SDK mode sync.
  //
  // Prior to this block, mode changes were relayed to CCR by only 2 of 8+
  // mutation paths: a bespoke setAppState wrapper in print.ts (headless/SDK
  // mode only) and a manual notify in the set_permission_mode handler.
  // Every other path — Shift+Tab cycling, ExitPlanModePermissionRequest
  // dialog options, the /plan slash command, rewind, the REPL bridge's
  // onSetPermissionMode — mutated AppState without telling
  // CCR, leaving external_metadata.permission_mode stale and the web UI out
  // of sync with the CLI's actual mode.
  //
  // Hooking the diff here means ANY setAppState call that changes the mode
  // notifies CCR (via notifySessionMetadataChanged → ccrClient.reportMetadata)
  // and the SDK status stream (via notifyPermissionModeChanged → registered
  // in print.ts). The scattered callsites above need zero changes.
  const prevMode = oldState.toolPermissionContext.mode
  const newMode = newState.toolPermissionContext.mode
  if (prevMode !== newMode) {
    // CCR external_metadata must not receive internal-only mode names
    // (bubble, ungated auto). Externalize first — and skip
    // the CCR notify if the EXTERNAL mode didn't change (e.g.,
    // default→bubble→default is noise from CCR's POV since both
    // externalize to 'default'). The SDK channel (notifyPermissionModeChanged)
    // passes raw mode; its listener in print.ts applies its own filter.
    const prevExternal = toExternalPermissionMode(prevMode)
    const newExternal = toExternalPermissionMode(newMode)
    if (prevExternal !== newExternal) {
      // Ultraplan = first plan cycle only. The initial control_request
      // sets mode and isUltraplanMode atomically, so the flag's
      // transition gates it. null per RFC 7396 (removes the key).
      const isUltraplan =
        newExternal === 'plan' &&
        newState.isUltraplanMode &&
        !oldState.isUltraplanMode
          ? true
          : null
      notifySessionMetadataChanged({
        permission_mode: newExternal,
        is_ultraplan_mode: isUltraplan,
      })
    }
    notifyPermissionModeChanged(newMode)
    void setCurrentJobRespawnFlag('--permission-mode', [], newMode)
  }

  const prevSessionAllowRules =
    oldState.toolPermissionContext.alwaysAllowRules.session
  const newSessionAllowRules =
    newState.toolPermissionContext.alwaysAllowRules.session
  if (prevSessionAllowRules !== newSessionAllowRules) {
    const builtInRules = newSessionAllowRules?.filter(
      rule => !rule.startsWith('mcp__'),
    )
    notifySessionInternalMetadataChanged({
      session_allow_rules: builtInRules?.length ? builtInRules : null,
    })
  }

  if (newState.mainLoopModel !== oldState.mainLoopModel) {
    const selected = newState.mainLoopModel
    updateSettingsForSource('userSettings', { model: selected ?? undefined })
    const projectModel = getSettingsForSource('projectSettings')?.model
    const localModel = getSettingsForSource('localSettings')?.model
    if (
      selected !== null &&
      (projectModel !== undefined || localModel !== undefined) &&
      selected !== projectModel
    ) {
      updateSettingsForSource('localSettings', { model: selected })
    } else if (localModel !== undefined) {
      updateSettingsForSource('localSettings', { model: undefined })
    }
    setMainLoopModelOverride(selected)
    void setCurrentJobRespawnFlag('--model', ['-m'], selected)
  }

  // expandedView → persist as showExpandedTodos + showSpinnerTree for backwards compat
  if (newState.expandedView !== oldState.expandedView) {
    const showExpandedTodos = newState.expandedView === 'tasks'
    const showSpinnerTree = newState.expandedView === 'teammates'
    if (
      getGlobalConfig().showExpandedTodos !== showExpandedTodos ||
      getGlobalConfig().showSpinnerTree !== showSpinnerTree
    ) {
      saveGlobalConfig(current => ({
        ...current,
        showExpandedTodos,
        showSpinnerTree,
      }))
    }
  }

  // verbose
  if (newState.verbose !== oldState.verbose) {
    setConfigValue('verbose', newState.verbose)
  }

  // tungstenPanelVisible (ant-only tmux panel sticky toggle)
  if (process.env.USER_TYPE === 'ant') {
    if (
      newState.tungstenPanelVisible !== oldState.tungstenPanelVisible &&
      newState.tungstenPanelVisible !== undefined &&
      getGlobalConfig().tungstenPanelVisible !== newState.tungstenPanelVisible
    ) {
      const tungstenPanelVisible = newState.tungstenPanelVisible
      saveGlobalConfig(current => ({ ...current, tungstenPanelVisible }))
    }
  }

  // settings: clear auth-related caches when settings change
  // This ensures apiKeyHelper and AWS/GCP credential changes take effect immediately
  if (newState.settings !== oldState.settings) {
    try {
      clearApiKeyHelperCache()
      clearAwsCredentialsCache()
      resetAwsAuthRefreshCooldown()
      clearGcpCredentialsCache()

      // Re-apply environment variables when settings.env changes
      // This is additive-only: new vars are added, existing may be overwritten, nothing is deleted
      if (newState.settings.env !== oldState.settings.env) {
        applyConfigEnvironmentVariables()
      }
    } catch (error) {
      logError(toError(error))
    }
  }
}
