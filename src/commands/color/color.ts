import type { UUID } from 'crypto'
import { getSessionId } from '../../bootstrap/state.js'
import {
  getBridgeBaseUrlOverride,
  getBridgeTokenOverride,
} from '../../bridge/bridgeConfig.js'
import type { ToolUseContext } from '../../Tool.js'
import {
  AGENT_COLORS,
  type AgentColorName,
} from '../../tools/AgentTool/agentColorManager.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import {
  getTranscriptPath,
  saveAgentColor,
} from '../../utils/sessionStorage.js'
import { isTeammate } from '../../utils/teammate.js'

const RESET_ALIASES = ['default', 'reset', 'none', 'gray', 'grey'] as const

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  onDone(await performSetColor(args, context), { display: 'system' })
  return null
}

export async function performSetColor(
  args: string,
  context: ToolUseContext & LocalJSXCommandContext,
): Promise<string> {
  // Teammates cannot set their own color
  if (isTeammate()) {
    return 'Cannot set color: This session is a swarm teammate. Teammate colors are assigned by the team leader.'
  }

  if (!args || args.trim() === '') {
    const colorList = AGENT_COLORS.join(', ')
    return `Please provide a color. Available colors: ${colorList}, default`
  }

  const colorArg = args.trim().toLowerCase()

  const reset = RESET_ALIASES.includes(
    colorArg as (typeof RESET_ALIASES)[number],
  )
  if (!reset && !AGENT_COLORS.includes(colorArg as AgentColorName)) {
    const colorList = AGENT_COLORS.join(', ')
    return `Invalid color "${colorArg}". Available colors: ${colorList}, default`
  }

  const sessionId = getSessionId() as UUID
  const fullPath = getTranscriptPath()
  const persistedColor = reset ? 'default' : colorArg

  await saveAgentColor(sessionId, persistedColor, fullPath)

  context.setAppState(prev => ({
    ...prev,
    standaloneAgentContext: {
      ...prev.standaloneAgentContext,
      name: prev.standaloneAgentContext?.name ?? '',
      color: reset ? undefined : (colorArg as AgentColorName),
    },
  }))

  syncRemoteColor(context, persistedColor)
  return persistedColor === 'default'
    ? 'Session color reset to default'
    : `Session color set to: ${colorArg}`
}

function syncRemoteColor(
  context: ToolUseContext & LocalJSXCommandContext,
  color: string,
): void {
  const bridgeSessionId = context.getAppState().replBridgeSessionId
  if (!bridgeSessionId) return
  const token = getBridgeTokenOverride()
  void import('../../bridge/createSession.js').then(
    ({ updateBridgeSessionColorTag }) =>
      updateBridgeSessionColorTag(bridgeSessionId, color, AGENT_COLORS, {
        baseUrl: getBridgeBaseUrlOverride(),
        getAccessToken: token ? () => token : undefined,
      }).catch(() => {}),
  )
}
