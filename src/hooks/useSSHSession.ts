import { useMemo } from 'react'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { SSHSession } from '../ssh/createSSHSession.js'
import type { Tool } from '../Tool.js'
import type { Message as MessageType } from '../types/message.js'
import type { PermissionMode } from '../types/permissions.js'
import { gracefulShutdown } from '../utils/gracefulShutdown.js'
import {
  type ExternalSessionAdapter,
  useExternalSession,
  type UseExternalSessionResult,
} from './useExternalSession.js'

type UseSSHSessionProps = {
  session: SSHSession | undefined
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  setIsLoading: (loading: boolean) => void
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
  tools: Tool[]
  permissionMode: PermissionMode
}

export function useSSHSession({
  session,
  setMessages,
  setIsLoading,
  setToolUseConfirmQueue,
  tools,
  permissionMode,
}: UseSSHSessionProps): UseExternalSessionResult {
  const adapter = useMemo<ExternalSessionAdapter | undefined>(() => {
    if (!session) return undefined
    return {
      label: 'ssh',
      createManager: callbacks => session.createManager(callbacks),
      onDisconnected: wasConnected => {
        const stderr = session.getStderrTail().trim()
        const exitCode = session.proc.exitCode
        let message = wasConnected
          ? 'Remote session ended.'
          : 'SSH session failed before connecting.'
        if (stderr && (!wasConnected || exitCode !== 0)) {
          message += `\nRemote stderr (exit ${exitCode ?? `signal ${session.proc.signalCode}`}):\n${stderr}`
        }
        void gracefulShutdown(1, 'other', { finalMessage: message })
      },
      cleanup: () => session.proxy.stop(),
    }
  }, [session])

  return useExternalSession({
    adapter,
    setMessages,
    setIsLoading,
    setToolUseConfirmQueue,
    tools,
    permissionMode,
  })
}
