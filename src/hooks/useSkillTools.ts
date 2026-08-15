import { feature } from 'bun:bundle'
import { useEffect } from 'react'
import {
  getProjectRoot,
  getSessionSkillAllowlist,
} from '../bootstrap/state.js'
import {
  filterCommandsBySkillAllowlist,
  getCommands,
  getMcpSkillCommands,
} from '../commands.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import type { Tools } from '../Tool.js'
import type { Command } from '../types/command.js'
import { logError } from '../utils/log.js'
import { isSkillsAsToolsEnabled } from '../tools/SkillTool/SkillTool.js'

type SkillToolsModule = {
  buildSkillTools(
    commands: Command[],
    options: { emitTelemetry: boolean },
  ): Tools
}

// The builder is internal-only and is absent from the authenticated external
// bundle. Keep the module boundary conditional so the external build reduces
// this binding to null, exactly like the release artifact.
/* eslint-disable @typescript-eslint/no-require-imports */
const skillToolsModule = feature('SKILLS_AS_TOOLS')
  ? (require('../tools/SkillTool/SkillTool.js') as unknown as SkillToolsModule)
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

/** Refresh the experimental per-skill tool pool when MCP skills change. */
export function useSkillTools(): void {
  const setAppState = useSetAppState()
  const mcpCommands = useAppState(state => state.mcp.commands)

  useEffect(() => {
    if (!skillToolsModule || !isSkillsAsToolsEnabled()) return

    let cancelled = false
    getCommands(getProjectRoot())
      .then(localCommands => {
        if (cancelled) return

        const mcpSkills = getMcpSkillCommands(mcpCommands)
        const commands = filterCommandsBySkillAllowlist(
          [...localCommands, ...mcpSkills],
          getSessionSkillAllowlist(),
        )
        setAppState(state => {
          if (state.skillTools.length === commands.length) return state
          return {
            ...state,
            skillTools: skillToolsModule.buildSkillTools(commands, {
              emitTelemetry: state.skillTools.length === 0,
            }),
          }
        })
      })
      .catch(logError)

    return () => {
      cancelled = true
    }
  }, [setAppState, mcpCommands])
}
