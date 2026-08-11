export type SessionState = 'idle' | 'running' | 'requires_action'

/**
 * Context carried with requires_action transitions so downstream
 * surfaces (CCR sidebar, push notifications) can show what the
 * session is blocked on, not just that it's blocked.
 *
 * Two delivery paths:
 * - tool_name + action_description → RequiresActionDetails proto
 *   (webhook payload, typed, logged in Datadog)
 * - full object → external_metadata.pending_action (queryable JSON
 *   on the Session, lets the frontend iterate on shape without
 *   proto round-trips)
 */
export type RequiresActionDetails = {
  tool_name: string
  /** Human-readable summary, e.g. "Editing src/foo.ts", "Running npm test" */
  action_description: string
  raw_command?: string
  tool_use_id: string
  request_id: string
  /** Raw tool input — the frontend reads from external_metadata.pending_action.input
   * to parse question options / plan content without scanning the event stream. */
  input?: Record<string, unknown>
}

import { isEnvTruthy } from './envUtils.js'
import type { PermissionMode } from './permissions/PermissionMode.js'
import { enqueueSdkEvent } from './sdkEventQueue.js'

// CCR external_metadata keys — push in onChangeAppState, restore in
// externalMetadataToAppState.
export type SessionExternalMetadata = {
  permission_mode?: string | null
  is_ultraplan_mode?: boolean | null
  model?: string | null
  pending_action?: RequiresActionDetails | null
  // Opaque — typed at the emit site. Importing PostTurnSummaryOutput here
  // would leak the import path string into sdk.d.ts via agentSdkBridge's
  // re-export of SessionState.
  post_turn_summary?: unknown
  // Mid-turn progress line from the forked-agent summarizer — fires every
  // ~5 steps / 2min so long-running turns still surface "what's happening
  // right now" before post_turn_summary arrives.
  task_summary?: string | null
  current_branches?: Record<string, string | null>
}

type SessionStateChangedListener = (
  state: SessionState,
  details?: RequiresActionDetails,
) => void
type SessionMetadataChangedListener = (
  metadata: SessionExternalMetadata,
) => void
type PermissionModeChangedListener = (mode: PermissionMode) => void

let stateListener: SessionStateChangedListener | null = null
let metadataListener: SessionMetadataChangedListener | null = null
let permissionModeListener: PermissionModeChangedListener | null = null

export function setSessionStateChangedListener(
  cb: SessionStateChangedListener | null,
): void {
  stateListener = cb
}

export function setSessionMetadataChangedListener(
  cb: SessionMetadataChangedListener | null,
): void {
  metadataListener = cb
}

/**
 * Register a listener for permission-mode changes from onChangeAppState.
 * Wired by print.ts to emit an SDK system:status message so CCR/IDE clients
 * see mode transitions in real time — regardless of which code path mutated
 * toolPermissionContext.mode (Shift+Tab, ExitPlanMode dialog, slash command,
 * bridge set_permission_mode, etc.).
 */
export function setPermissionModeChangedListener(
  cb: PermissionModeChangedListener | null,
): void {
  permissionModeListener = cb
}

let hasPendingAction = false
let hasTaskSummary = false
let currentState: SessionState = 'idle'

export function getSessionState(): SessionState {
  return currentState
}

export function notifySessionStateChanged(
  state: SessionState,
  details?: RequiresActionDetails,
): void {
  currentState = state
  stateListener?.(state, details)

  // Mirror details into external_metadata so GetSession carries the
  // pending-action context without proto changes. Cleared via RFC 7396
  // null on the next non-blocked transition.
  if (state === 'requires_action' && details) {
    hasPendingAction = true
    metadataListener?.({
      pending_action: details,
    })
  } else if (hasPendingAction) {
    hasPendingAction = false
    metadataListener?.({ pending_action: null })
  }

  if (state === 'running') metadataListener?.({ post_turn_summary: null })

  // Only emit the idle clear when a summary was actually published. Besides
  // avoiding redundant metadata writes, routing it through the normal
  // metadata path emits the matching SDK task_summary event.
  if (state === 'idle' && hasTaskSummary) {
    hasTaskSummary = false
    notifySessionMetadataChanged({ task_summary: null })
  }

  // Mirror to the SDK event stream so non-CCR consumers (scmuxd, VS Code)
  // see the same authoritative idle/running signal the CCR bridge does.
  // 'idle' fires after heldBackResult flushes — lets scmuxd flip IDLE and
  // show the bg-task dot instead of a stuck generating spinner.
  //
  // Opt-in until CCR web + mobile clients learn to ignore this subtype in
  // their isWorking() last-message heuristics — the trailing idle event
  // currently pins them at "Running...".
  // https://anthropic.slack.com/archives/C093BJBD1CP/p1774152406752229
  if (isEnvTruthy(process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS)) {
    enqueueSdkEvent({
      type: 'system',
      subtype: 'session_state_changed',
      state,
    })
  }
}

export function notifySessionMetadataChanged(
  metadata: SessionExternalMetadata,
): void {
  metadataListener?.(metadata)
  if ('task_summary' in metadata) {
    if (metadata.task_summary != null) hasTaskSummary = true
    enqueueSdkEvent({
      type: 'system',
      subtype: 'task_summary',
      detail: metadata.task_summary ?? null,
    })
  }
}

/**
 * Fired by onChangeAppState when toolPermissionContext.mode changes.
 * Downstream listeners (CCR external_metadata PUT, SDK status stream) are
 * both wired through this single choke point so no mode-mutation path can
 * silently bypass them.
 */
export function notifyPermissionModeChanged(mode: PermissionMode): void {
  permissionModeListener?.(mode)
}
