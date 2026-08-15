import { useMemo } from 'react'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import {
  type DirectConnectConfig,
  DirectConnectSessionManager,
} from '../server/directConnectManager.js'
import type { Tool } from '../Tool.js'
import type { Message as MessageType } from '../types/message.js'
import { gracefulShutdown } from '../utils/gracefulShutdown.js'
import {
  type ExternalSessionAdapter,
  useExternalSession,
  type UseExternalSessionResult,
} from './useExternalSession.js'

type UseDirectConnectProps = {
  config: DirectConnectConfig | undefined
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  setIsLoading: (loading: boolean) => void
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
  tools: Tool[]
}

export function useDirectConnect({
  config,
  setMessages,
  setIsLoading,
  setToolUseConfirmQueue,
  tools,
}: UseDirectConnectProps): UseExternalSessionResult {
  const adapter = useMemo<ExternalSessionAdapter | undefined>(() => {
    if (!config) return undefined
    return {
      label: 'directConnect',
      createManager: callbacks =>
        new DirectConnectSessionManager(config, callbacks),
      onDisconnected: wasConnected => {
        process.stderr.write(
          wasConnected
            ? '\nServer disconnected.\n'
            : `\nFailed to connect to server at ${config.wsUrl}\n`,
        )
        void gracefulShutdown(1)
      },
    }
  }, [config])

  return useExternalSession({
    adapter,
    setMessages,
    setIsLoading,
    setToolUseConfirmQueue,
    tools,
  })
}
