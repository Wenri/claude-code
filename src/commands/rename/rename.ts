import type { UUID } from 'crypto'
import {
  getRuntimeCapabilities,
  getSessionId,
} from '../../bootstrap/state.js'
import {
  getBridgeBaseUrlOverride,
  getBridgeTokenOverride,
} from '../../bridge/bridgeConfig.js'
import type { ToolUseContext } from '../../Tool.js'
import { renameJob } from '../../daemon/jobs.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import {
  getMessagesAfterCompactBoundary,
  wrapInSystemReminder,
} from '../../utils/messages.js'
import {
  getTranscriptPath,
  saveAgentName,
  saveCustomTitle,
} from '../../utils/sessionStorage.js'
import { isTeammate } from '../../utils/teammate.js'
import { updateSessionName } from '../../utils/concurrentSessions.js'
import { generateSessionName } from './generateSessionName.js'

export function renameSystemReminder(name: string): string {
  return wrapInSystemReminder(
    `The user named this session "${name}". This may indicate the session's focus or intent.`,
  )
}

export async function performRename(
  args: string,
  context: ToolUseContext & LocalJSXCommandContext,
): Promise<{ message: string; newName?: string }> {
  // Prevent teammates from renaming - their names are set by team leader
  if (isTeammate()) {
    return {
      message:
        'Cannot rename: This session is a swarm teammate. Teammate names are set by the team leader.',
    }
  }

  let newName: string
  if (!args || args.trim() === '') {
    const generated = await generateSessionName(
      getMessagesAfterCompactBoundary(context.messages),
      context.abortController.signal,
    )
    if (!generated) {
      return {
        message:
          'Could not generate a name: no conversation context yet. Usage: /rename <name>',
      }
    }
    newName = generated
  } else {
    newName = args.trim()
  }

  const sessionId = getSessionId() as UUID
  const fullPath = getTranscriptPath()

  // Always save the custom title (session name)
  await saveCustomTitle(sessionId, newName, fullPath)

  // Sync title to bridge session on claude.ai/code (best-effort, non-blocking).
  // v2 env-less bridge stores cse_* in replBridgeSessionId —
  // updateBridgeSessionTitle retags internally for the compat endpoint.
  const appState = context.getAppState()
  const bridgeSessionId = appState.replBridgeSessionId
  if (bridgeSessionId) {
    const tokenOverride = getBridgeTokenOverride()
    void import('../../bridge/createSession.js').then(
      ({ updateBridgeSessionTitle }) =>
        updateBridgeSessionTitle(bridgeSessionId, newName, {
          baseUrl: getBridgeBaseUrlOverride(),
          getAccessToken: tokenOverride ? () => tokenOverride : undefined,
        }).catch(() => {}),
    )
  }

  // Also persist as the session's agent name for prompt-bar display
  await saveAgentName(sessionId, newName, fullPath)
  context.setAppState(prev => ({
    ...prev,
    standaloneAgentContext: {
      ...prev.standaloneAgentContext,
      name: newName,
    },
  }))

  const remote = getRuntimeCapabilities().remote
  if (remote?.kind === 'ccr' && remote.sessionId) {
    const remoteSessionId = remote.sessionId
    void import('../../utils/teleport/api.js').then(({ updateSessionTitle }) =>
      updateSessionTitle(remoteSessionId, newName),
    )
  }
  await renameJob(sessionId, newName)
  await updateSessionName(newName)

  return { message: `Session renamed to: ${newName}`, newName }
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const { message, newName } = await performRename(args, context)
  onDone(message, {
    display: 'system',
    metaMessages: newName ? [renameSystemReminder(newName)] : undefined,
  })
  return null
}
