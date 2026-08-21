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
  display_tool_name: string
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
  effort_level?: string | null
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

// Worker-only metadata is not exposed to remote clients. It survives worker
// replacement and is used to restore process-local execution state.
export type SessionInternalMetadata = Record<string, unknown> & {
  running_background_tasks?: Array<{
    task_id: string
    description?: string
  }>
  session_allow_rules?: unknown
}

export type RestoredWorkerState = {
  external: SessionExternalMetadata | null
  internal: SessionInternalMetadata | null
}

type SessionStateChangedListener = (
  state: SessionState,
  details?: RequiresActionDetails,
) => void
type SessionMetadataChangedListener = (
  metadata: SessionExternalMetadata,
) => void
type SessionInternalMetadataChangedListener = (
  metadata: SessionInternalMetadata,
) => void
type PermissionModeChangedListener = (mode: PermissionMode) => void

export class SessionStateManager {
  onStateChanged?: SessionStateChangedListener
  onMetadataChanged?: SessionMetadataChangedListener
  onInternalMetadataChanged?: SessionInternalMetadataChangedListener
  onPermissionModeChanged?: PermissionModeChangedListener

  private currentState: SessionState = 'idle'
  private hasPendingAction = false
  private hasTaskSummary = false

  getState(): SessionState {
    return this.currentState
  }

  notifyStateChanged(
    state: SessionState,
    details?: RequiresActionDetails,
  ): void {
    this.currentState = state
    this.onStateChanged?.(state, details)

    // Mirror details into external_metadata so GetSession carries the
    // pending-action context without proto changes. Cleared via RFC 7396
    // null on the next non-blocked transition.
    if (state === 'requires_action' && details) {
      this.hasPendingAction = true
      this.onMetadataChanged?.({
        pending_action: details,
      })
    } else if (this.hasPendingAction) {
      this.hasPendingAction = false
      this.onMetadataChanged?.({ pending_action: null })
    }

    if (state === 'running') {
      this.onMetadataChanged?.({ post_turn_summary: null })
    }

    // Only emit the idle clear when a summary was actually published. Besides
    // avoiding redundant metadata writes, routing it through the normal
    // metadata path emits the matching SDK task_summary event.
    if (state === 'idle' && this.hasTaskSummary) {
      this.hasTaskSummary = false
      this.notifyMetadataChanged({ task_summary: null })
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

  notifyMetadataChanged(metadata: SessionExternalMetadata): void {
    this.onMetadataChanged?.(metadata)
    if ('task_summary' in metadata) {
      if (metadata.task_summary != null) this.hasTaskSummary = true
      enqueueSdkEvent({
        type: 'system',
        subtype: 'task_summary',
        detail: metadata.task_summary ?? null,
      })
    }
  }

  notifyInternalMetadataChanged(metadata: SessionInternalMetadata): void {
    this.onInternalMetadataChanged?.(metadata)
  }

  notifyPermissionModeChanged(mode: PermissionMode): void {
    this.onPermissionModeChanged?.(mode)
  }
}
