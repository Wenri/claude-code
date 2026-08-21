import type { AppState } from '../../state/AppState.js'
import type { AgentColorName } from '../../tools/AgentTool/agentColorManager.js'
import { AGENT_COLORS } from '../../tools/AgentTool/agentColorManager.js'
import { detectAndGetBackend } from './backends/registry.js'
import type { PaneBackend } from './backends/types.js'

export type TeammateColorsState = {
  assignments: Map<string, AgentColorName>
  index: number
}

export type TeammateColors = {
  assign(teammateId: string): AgentColorName
  get(teammateId: string): AgentColorName | undefined
  clear(): void
}

type GetAppState = () => AppState
type SetAppState = (updater: (previous: AppState) => AppState) => void

/**
 * Creates the session-scoped color allocator carried by ToolUseContext.
 *
 * Color state lives in AppState so independently injected stores cannot leak
 * assignments into one another. Updates preserve the previous AppState when
 * another caller already assigned the same teammate or the allocator is
 * already empty.
 */
export function createTeammateColors(
  getAppState: GetAppState,
  setAppState: SetAppState,
): TeammateColors {
  return {
    assign(teammateId) {
      const state = getAppState().teammateColors
      const existing = state.assignments.get(teammateId)
      if (existing) return existing

      const color = AGENT_COLORS[state.index % AGENT_COLORS.length]!
      setAppState(previous => {
        if (previous.teammateColors.assignments.has(teammateId)) {
          return previous
        }
        const assignments = new Map(previous.teammateColors.assignments)
        assignments.set(teammateId, color)
        return {
          ...previous,
          teammateColors: {
            assignments,
            index: previous.teammateColors.index + 1,
          },
        }
      })
      return color
    },

    get(teammateId) {
      return getAppState().teammateColors.assignments.get(teammateId)
    },

    clear() {
      setAppState(previous =>
        previous.teammateColors.assignments.size === 0 &&
        previous.teammateColors.index === 0
          ? previous
          : {
              ...previous,
              teammateColors: { assignments: new Map(), index: 0 },
            },
      )
    },
  }
}

export const NOOP_TEAMMATE_COLORS: TeammateColors = {
  assign: () => AGENT_COLORS[0]!,
  get: () => undefined,
  clear() {},
}

/**
 * Gets the appropriate backend for the current environment.
 * detectAndGetBackend() caches internally — no need for a second cache here.
 */
async function getBackend(): Promise<PaneBackend> {
  return (await detectAndGetBackend()).backend
}

/**
 * Checks if we're currently running inside a tmux session.
 * Uses the detection module directly for this check.
 */
export async function isInsideTmux(): Promise<boolean> {
  const { isInsideTmux: checkTmux } = await import('./backends/detection.js')
  return checkTmux()
}

/**
 * Creates a new teammate pane in the swarm view.
 * Automatically selects the appropriate backend (tmux or iTerm2) based on environment.
 *
 * When running INSIDE tmux:
 * - Uses TmuxBackend to split the current window
 * - Leader stays on left (30%), teammates on right (70%)
 *
 * When running in iTerm2 (not in tmux) with it2 CLI:
 * - Uses ITermBackend for native iTerm2 split panes
 *
 * When running OUTSIDE tmux/iTerm2:
 * - Falls back to TmuxBackend with external claude-swarm session
 */
export async function createTeammatePaneInSwarmView(
  teammateName: string,
  teammateColor: AgentColorName,
): Promise<{ paneId: string; isFirstTeammate: boolean }> {
  const backend = await getBackend()
  return backend.createTeammatePaneInSwarmView(teammateName, teammateColor)
}

/**
 * Enables pane border status for a window (shows pane titles).
 * Delegates to the detected backend.
 */
export async function enablePaneBorderStatus(
  windowTarget?: string,
  useSwarmSocket = false,
): Promise<void> {
  const backend = await getBackend()
  return backend.enablePaneBorderStatus(windowTarget, useSwarmSocket)
}

/**
 * Sends a command to a specific pane.
 * Delegates to the detected backend.
 */
export async function sendCommandToPane(
  paneId: string,
  command: string,
  useSwarmSocket = false,
): Promise<void> {
  const backend = await getBackend()
  return backend.sendCommandToPane(paneId, command, useSwarmSocket)
}
