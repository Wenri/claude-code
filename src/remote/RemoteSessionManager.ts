import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlCancelRequest,
  SDKControlPermissionRequest,
  SDKControlRequest,
  SDKControlRequestInner,
  SDKControlResponse,
} from '../entrypoints/sdk/controlTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'
import {
  type RemoteBashCommand,
  type RemoteMessageContent,
  sendBashCommandToRemoteSession,
  sendEventToRemoteSession,
} from '../utils/teleport/api.js'
import {
  SessionsWebSocket,
  type SessionsAuth401Handler,
  type SessionsWebSocketCallbacks,
} from './SessionsWebSocket.js'

type RemoteStreamMessage =
  | SDKMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKControlCancelRequest
  | { type: 'keep_alive' }
  | { type: 'transcript_mirror'; filePath: string; entries: unknown[] }
  | { type: 'system'; subtype: 'task_summary' }

/**
 * Type guard to check if a message is an SDKMessage (not a control message)
 */
function isSDKMessage(
  message: RemoteStreamMessage,
): message is SDKMessage {
  return (
    message.type !== 'control_request' &&
    message.type !== 'control_response' &&
    message.type !== 'keep_alive' &&
    message.type !== 'control_cancel_request' &&
    message.type !== 'transcript_mirror' &&
    !(message.type === 'system' && message.subtype === 'task_summary')
  )
}

/**
 * Simple permission response for remote sessions.
 * This is a simplified version of PermissionResult for CCR communication.
 */
export type RemotePermissionResponse =
  | {
      behavior: 'allow'
      updatedInput: Record<string, unknown>
    }
  | {
      behavior: 'deny'
      message: string
    }

export type RemoteSessionConfig = {
  sessionId: string
  getAccessToken: () => string
  orgUuid: string
  /** True if session was created with an initial prompt that's being processed */
  hasInitialPrompt?: boolean
  /**
   * When true, this client is a pure viewer. Ctrl+C/Escape do NOT send
   * interrupt to the remote agent; 60s reconnect timeout is disabled;
   * session title is never updated. Used by `claude assistant`.
   */
  viewerOnly?: boolean
  /** True when --remote attached to an already-existing session. */
  isAttachToExisting?: boolean
  /** Validates an attached session after the UI starts. */
  preflightCheck?: Promise<void>
  /** Refreshes a stale OAuth token after a 401 response. */
  onAuth401?: SessionsAuth401Handler
}

export type RemoteSessionCallbacks = {
  /** Called when an SDKMessage is received from the session */
  onMessage: (message: SDKMessage) => void
  /** Called when a permission request is received from CCR */
  onPermissionRequest: (
    request: SDKControlPermissionRequest,
    requestId: string,
  ) => void
  /** Called when the server cancels a pending permission request */
  onPermissionCancelled?: (
    requestId: string,
    toolUseId: string | undefined,
  ) => void
  /** Called when connection is established */
  onConnected?: () => void
  /** Called when connection is lost and cannot be restored */
  onDisconnected?: () => void
  /** Called while the SSE stream reconnect backoff is in progress */
  onReconnecting?: () => void
  /** Called on error */
  onError?: (error: Error) => void
}

/**
 * Manages a remote CCR session.
 *
 * Coordinates:
 * - SSE subscription for receiving messages from CCR
 * - HTTP POST for sending user messages to CCR
 * - Permission request/response flow
 */
export class RemoteSessionManager {
  private client: SessionsWebSocket | null = null
  private pendingPermissionRequests: Map<string, SDKControlPermissionRequest> =
    new Map()
  private pendingControlRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
    }
  >()

  constructor(
    private readonly config: RemoteSessionConfig,
    private readonly callbacks: RemoteSessionCallbacks,
  ) {}

  /**
   * Connect to the remote session event stream
   */
  connect(): void {
    logForDebugging(
      `[RemoteSessionManager] Connecting to session ${this.config.sessionId}`,
    )

    const clientCallbacks: SessionsWebSocketCallbacks = {
      onMessage: message => this.handleMessage(message),
      onConnected: () => {
        logForDebugging('[RemoteSessionManager] Connected')
        this.callbacks.onConnected?.()
      },
      onClose: () => {
        logForDebugging('[RemoteSessionManager] Disconnected')
        this.callbacks.onDisconnected?.()
      },
      onReconnecting: () => {
        logForDebugging('[RemoteSessionManager] Reconnecting')
        this.callbacks.onReconnecting?.()
      },
      onError: error => {
        logError(error)
        this.callbacks.onError?.(error)
      },
    }

    this.client = new SessionsWebSocket(
      this.config.sessionId,
      this.config.orgUuid,
      this.config.getAccessToken,
      clientCallbacks,
      this.config.onAuth401,
    )

    void this.client.connect()
  }

  /**
   * Handle messages from the session event stream
   */
  private handleMessage(message: RemoteStreamMessage): void {
    // Handle control requests (permission prompts from CCR)
    if (message.type === 'control_request') {
      this.handleControlRequest(message)
      return
    }

    // Handle control cancel requests (server cancelling a pending permission prompt)
    if (message.type === 'control_cancel_request') {
      const { request_id } = message
      const pendingRequest = this.pendingPermissionRequests.get(request_id)
      logForDebugging(
        `[RemoteSessionManager] Permission request cancelled: ${request_id}`,
      )
      this.pendingPermissionRequests.delete(request_id)
      this.callbacks.onPermissionCancelled?.(
        request_id,
        pendingRequest?.tool_use_id,
      )
      return
    }

    // Handle control responses (acknowledgments)
    if (message.type === 'control_response') {
      const { request_id: requestId } = message.response
      const pending = this.pendingControlRequests.get(requestId)
      if (pending) {
        this.pendingControlRequests.delete(requestId)
        if (message.response.subtype === 'success') {
          pending.resolve(message.response.response)
        } else {
          pending.reject(new Error(message.response.error))
        }
      } else {
        logForDebugging('[RemoteSessionManager] Received control response')
      }
      return
    }

    // Forward SDK messages to callback (type guard ensures proper narrowing)
    if (isSDKMessage(message)) {
      this.callbacks.onMessage(message)
    }
  }

  /**
   * Handle control requests from CCR (e.g., permission requests)
   */
  private handleControlRequest(request: SDKControlRequest): void {
    const { request_id, request: inner } = request

    if (inner.subtype === 'can_use_tool') {
      logForDebugging(
        `[RemoteSessionManager] Permission request for tool: ${inner.tool_name}`,
      )
      this.pendingPermissionRequests.set(request_id, inner)
      this.callbacks.onPermissionRequest(inner, request_id)
    } else {
      // Send an error response for unrecognized subtypes so the server
      // doesn't hang waiting for a reply that never comes.
      logForDebugging(
        `[RemoteSessionManager] Unsupported control request subtype: ${inner.subtype}`,
      )
      const response: SDKControlResponse = {
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id,
          error: `Unsupported control request subtype: ${inner.subtype}`,
        },
      }
      this.client?.sendControlResponse(response)
    }
  }

  /**
   * Send a user message to the remote session via HTTP POST
   */
  async sendMessage(
    content: RemoteMessageContent,
    opts?: { uuid?: string },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    logForDebugging(
      `[RemoteSessionManager] Sending message to session ${this.config.sessionId}`,
    )

    const result = await sendEventToRemoteSession(
      this.config.sessionId,
      content,
      opts,
    )

    if (!result.ok) {
      logError(
        new Error(
          `[RemoteSessionManager] Failed to send message to session ${this.config.sessionId}: ${result.reason}`,
        ),
      )
    }

    return result
  }

  async sendBashCommand(
    command: RemoteBashCommand,
    opts?: { uuid?: string },
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    logForDebugging(
      `[RemoteSessionManager] Sending bash_command to session ${this.config.sessionId}`,
    )

    const result = await sendBashCommandToRemoteSession(
      this.config.sessionId,
      command,
      opts,
    )

    if (!result.ok) {
      logError(
        new Error(
          `[RemoteSessionManager] Failed to send bash_command to session ${this.config.sessionId}: ${result.reason}`,
        ),
      )
    }

    return result
  }

  /**
   * Respond to a permission request from CCR
   */
  respondToPermissionRequest(
    requestId: string,
    result: RemotePermissionResponse,
  ): void {
    const pendingRequest = this.pendingPermissionRequests.get(requestId)
    if (!pendingRequest) {
      logError(
        new Error(
          `[RemoteSessionManager] No pending permission request with ID: ${requestId}`,
        ),
      )
      return
    }

    this.pendingPermissionRequests.delete(requestId)

    const response: SDKControlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: result.behavior,
          ...(result.behavior === 'allow'
            ? { updatedInput: result.updatedInput }
            : { message: result.message }),
        },
      },
    }

    logForDebugging(
      `[RemoteSessionManager] Sending permission response: ${result.behavior}`,
    )

    this.client?.sendControlResponse(response)
  }

  /**
   * Check if connected to the remote session
   */
  isConnected(): boolean {
    return this.client?.isConnected() ?? false
  }

  /**
   * Send an interrupt signal to cancel the current request on the remote session
   */
  cancelSession(): void {
    logForDebugging('[RemoteSessionManager] Sending interrupt signal')
    this.client?.sendControlRequest({ subtype: 'interrupt' })
  }

  sendControlRequest<Response = Record<string, unknown>>(
    request: SDKControlRequestInner,
  ): Promise<Response> {
    const requestId = this.client?.sendControlRequest(request)
    if (requestId == null) {
      return Promise.reject(
        new Error('[RemoteSessionManager] Cannot send: not connected'),
      )
    }
    return new Promise<Response>((resolve, reject) => {
      this.pendingControlRequests.set(requestId, {
        resolve: value => resolve(value as Response),
        reject,
      })
    })
  }

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.config.sessionId
  }

  /**
   * Disconnect from the remote session
   */
  disconnect(): void {
    logForDebugging('[RemoteSessionManager] Disconnecting')
    this.client?.close()
    this.client = null
    this.pendingPermissionRequests.clear()
    for (const request of this.pendingControlRequests.values()) {
      request.reject(new Error('[RemoteSessionManager] Disconnected'))
    }
    this.pendingControlRequests.clear()
  }

  /**
   * Force reconnect the SSE stream.
   * Useful when the subscription becomes stale after container shutdown.
   */
  reconnect(): void {
    logForDebugging('[RemoteSessionManager] Reconnecting SSE stream')
    this.client?.reconnect()
  }
}

/**
 * Create a remote session config from OAuth tokens
 */
export function createRemoteSessionConfig(
  sessionId: string,
  getAccessToken: () => string,
  orgUuid: string,
  hasInitialPrompt = false,
  viewerOnly = false,
  isAttachToExisting = false,
  preflightCheck?: Promise<void>,
  onAuth401?: SessionsAuth401Handler,
): RemoteSessionConfig {
  return {
    sessionId,
    getAccessToken,
    orgUuid,
    hasInitialPrompt,
    viewerOnly,
    isAttachToExisting,
    preflightCheck,
    onAuth401,
  }
}
