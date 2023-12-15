import type { AppState } from '../state/AppState.js'
import type { AgentId } from '../types/ids.js'

export type AgentLifecycle = {
  markTypeInvoked(agentType: string): void
  registerName(name: string, agentId: AgentId): void
  clearTodos(agentId: string): void
}

type SetAppState = (updater: (previous: AppState) => AppState) => void

/**
 * Session-scoped agent bookkeeping shared by every ToolUseContext.
 *
 * Keeping these mutations behind one facade makes nested/forked contexts use
 * the root application store and preserves referential equality for no-ops.
 */
export function createAgentLifecycle(setAppState: SetAppState): AgentLifecycle {
  return {
    markTypeInvoked(agentType) {
      setAppState(previous =>
        previous.agentTypesInvokedThisSession.has(agentType)
          ? previous
          : {
              ...previous,
              agentTypesInvokedThisSession: new Set(
                previous.agentTypesInvokedThisSession,
              ).add(agentType),
            },
      )
    },
    registerName(name, agentId) {
      setAppState(previous => {
        if (previous.agentNameRegistry.get(name) === agentId) return previous
        const agentNameRegistry = new Map(previous.agentNameRegistry)
        agentNameRegistry.set(name, agentId)
        return { ...previous, agentNameRegistry }
      })
    },
    clearTodos(agentId) {
      setAppState(previous => {
        if (!(agentId in previous.todos)) return previous
        const { [agentId]: _removed, ...todos } = previous.todos
        return { ...previous, todos }
      })
    },
  }
}

export const NOOP_AGENT_LIFECYCLE: AgentLifecycle = {
  markTypeInvoked() {},
  registerName() {},
  clearTodos() {},
}
