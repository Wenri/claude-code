import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { SDKControlPermissionRequest } from '../entrypoints/sdk/controlTypes.js'
import type { RemotePermissionResponse } from '../remote/RemoteSessionManager.js'
import {
  createSyntheticAssistantMessage,
  createToolStub,
} from '../remote/remotePermissionBridge.js'
import {
  convertSDKMessage,
  isSessionEndMessage,
} from '../remote/sdkMessageAdapter.js'
import type { Tool } from '../Tool.js'
import { findToolByName } from '../Tool.js'
import type { Message as MessageType } from '../types/message.js'
import type {
  PermissionAskDecision,
  PermissionMode,
} from '../types/permissions.js'
import { logForDebugging } from '../utils/debug.js'
import { createSystemMessage } from '../utils/messages.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'

export type ExternalSessionCallbacks = {
  onMessage: (message: SDKMessage) => void
  onPermissionRequest: (
    request: SDKControlPermissionRequest,
    requestId: string,
  ) => void
  onConnected: () => void
  onReconnecting: (attempt: number, maxAttempts: number) => void
  onDisconnected: () => void
  onError: (error: Error) => void
}

export type ExternalSessionManager = {
  connect(): void
  disconnect(): void
  sendMessage(content: RemoteMessageContent): boolean
  sendInterrupt(): void
  respondToPermissionRequest(
    requestId: string,
    result: RemotePermissionResponse,
  ): void
  setPermissionMode?(mode: PermissionMode): void
}

export type ExternalSessionAdapter = {
  label: string
  createManager(callbacks: ExternalSessionCallbacks): ExternalSessionManager
  onDisconnected(wasConnected: boolean): void
  cleanup?(): void
}

type UseExternalSessionProps = {
  adapter: ExternalSessionAdapter | undefined
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  setIsLoading: (loading: boolean) => void
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
  tools: Tool[]
  permissionMode?: PermissionMode
}

export type UseExternalSessionResult = {
  isRemoteMode: boolean
  sendMessage: (content: RemoteMessageContent) => Promise<boolean>
  cancelRequest: () => void
  disconnect: () => void
}

export function useExternalSession({
  adapter,
  setMessages,
  setIsLoading,
  setToolUseConfirmQueue,
  tools,
  permissionMode,
}: UseExternalSessionProps): UseExternalSessionResult {
  const isRemoteMode = !!adapter
  const managerRef = useRef<ExternalSessionManager | null>(null)
  const hasReceivedInitRef = useRef(false)
  const isConnectedRef = useRef(false)
  const toolsRef = useRef(tools)

  useEffect(() => {
    toolsRef.current = tools
  }, [tools])

  const permissionModeRef = useRef(permissionMode)
  useEffect(() => {
    permissionModeRef.current = permissionMode
    if (permissionMode !== undefined && isConnectedRef.current) {
      managerRef.current?.setPermissionMode?.(permissionMode)
    }
  }, [permissionMode])

  useEffect(() => {
    if (!adapter) return

    const { label, createManager, onDisconnected, cleanup } = adapter
    hasReceivedInitRef.current = false
    logForDebugging(`[${label}] connecting`)

    const manager = createManager({
      onMessage: sdkMessage => {
        if (isSessionEndMessage(sdkMessage)) setIsLoading(false)
        if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
          if (hasReceivedInitRef.current) return
          hasReceivedInitRef.current = true
        }

        const converted = convertSDKMessage(sdkMessage, {
          convertToolResults: true,
        })
        if (converted.type === 'message') {
          setMessages(previous => [...previous, converted.message])
        }
      },
      onPermissionRequest: (request, requestId) => {
        logForDebugging(`[${label}] permission request: ${request.tool_name}`)
        const tool =
          findToolByName(toolsRef.current, request.tool_name) ??
          createToolStub(request.tool_name)
        const description =
          request.description ?? `${request.tool_name} requires permission`
        const permissionResult: PermissionAskDecision = {
          behavior: 'ask',
          message: description,
          suggestions: request.permission_suggestions,
          blockedPath: request.blocked_path,
        }
        const removeRequest = () =>
          setToolUseConfirmQueue(queue =>
            queue.filter(item => item.toolUseID !== request.tool_use_id),
          )
        const toolUseConfirm: ToolUseConfirm = {
          assistantMessage: createSyntheticAssistantMessage(request, requestId),
          tool,
          description,
          input: request.input,
          toolUseContext: {} as ToolUseConfirm['toolUseContext'],
          toolUseID: request.tool_use_id,
          permissionResult,
          permissionPromptStartTimeMs: Date.now(),
          onUserInteraction() {},
          onAbort() {
            manager.respondToPermissionRequest(requestId, {
              behavior: 'deny',
              message: 'User aborted',
            })
            removeRequest()
          },
          onAllow(updatedInput) {
            manager.respondToPermissionRequest(requestId, {
              behavior: 'allow',
              updatedInput,
            })
            removeRequest()
            setIsLoading(true)
          },
          onReject(feedback) {
            manager.respondToPermissionRequest(requestId, {
              behavior: 'deny',
              message: feedback ?? 'User denied permission',
            })
            removeRequest()
          },
          async recheckPermission() {},
        }
        setToolUseConfirmQueue(queue => [...queue, toolUseConfirm])
        setIsLoading(false)
      },
      onConnected: () => {
        logForDebugging(`[${label}] connected`)
        isConnectedRef.current = true
        if (permissionModeRef.current !== undefined) {
          manager.setPermissionMode?.(permissionModeRef.current)
        }
      },
      onReconnecting: (attempt, maxAttempts) => {
        logForDebugging(
          `[${label}] dropped, reconnecting (${attempt}/${maxAttempts})`,
        )
        isConnectedRef.current = false
        setIsLoading(false)
        setMessages(previous => [
          ...previous,
          createSystemMessage(
            `Connection dropped — reconnecting (attempt ${attempt}/${maxAttempts})...`,
            'warning',
          ),
        ])
      },
      onDisconnected: () => {
        logForDebugging(`[${label}] disconnected`)
        const wasConnected = isConnectedRef.current
        isConnectedRef.current = false
        setIsLoading(false)
        onDisconnected(wasConnected)
      },
      onError: error => {
        logForDebugging(`[${label}] error: ${error.message}`)
      },
    })

    managerRef.current = manager
    manager.connect()
    if (permissionModeRef.current !== undefined) {
      manager.setPermissionMode?.(permissionModeRef.current)
    }

    return () => {
      logForDebugging(`[${label}] cleanup`)
      manager.disconnect()
      cleanup?.()
      managerRef.current = null
    }
  }, [adapter, setMessages, setIsLoading, setToolUseConfirmQueue])

  const sendMessage = useCallback(
    async (content: RemoteMessageContent): Promise<boolean> => {
      const manager = managerRef.current
      if (!manager) return false
      setIsLoading(true)
      return manager.sendMessage(content)
    },
    [setIsLoading],
  )

  const cancelRequest = useCallback(() => {
    managerRef.current?.sendInterrupt()
    setIsLoading(false)
  }, [setIsLoading])

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect()
    managerRef.current = null
    isConnectedRef.current = false
  }, [])

  return useMemo(
    () => ({ isRemoteMode, sendMessage, cancelRequest, disconnect }),
    [isRemoteMode, sendMessage, cancelRequest, disconnect],
  )
}
