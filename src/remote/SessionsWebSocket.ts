import { randomUUID } from 'crypto'
import { parseSSEFrames } from '../cli/transports/SSETransport.js'
import { getOauthConfig } from '../constants/oauth.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlCancelRequest,
  SDKControlRequest,
  SDKControlRequestInner,
  SDKControlResponse,
} from '../entrypoints/sdk/controlTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage, toError } from '../utils/errors.js'
import { getUserAgent } from '../utils/http.js'
import { logError } from '../utils/log.js'
import { getProxyFetchOptions } from '../utils/proxy.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30000
const MAX_RECONNECT_ATTEMPTS = 5
const LIVENESS_TIMEOUT_MS = 45000
const PERMANENT_HTTP_CODES = new Set([401, 403, 404])
const STREAM_DECODE_OPTIONS: TextDecodeOptions = { stream: true }

type SessionsClientState = 'idle' | 'connecting' | 'connected' | 'closed'

type SessionsMessage =
  | SDKMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKControlCancelRequest

type ClientEvent = {
  event_type?: string
  sequence_num?: number | string
  payload?: unknown
}

type EphemeralEvent = {
  payload?: unknown
}

function isSessionsMessage(value: unknown): value is SessionsMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

export type SessionsWebSocketCallbacks = {
  onMessage: (message: SessionsMessage) => void
  onClose?: () => void
  onError?: (error: Error) => void
  onConnected?: () => void
  /** Fired when a transient stream end schedules a reconnect. */
  onReconnecting?: () => void
}

/**
 * Sessions v2 client. Reads events over SSE and writes control events over
 * HTTP while preserving the historical class/API name used by callers.
 */
export class SessionsWebSocket {
  private state: SessionsClientState = 'idle'
  private abortController: AbortController | null = null
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private livenessTimer: NodeJS.Timeout | null = null
  private lastSequenceNum = 0

  constructor(
    private readonly sessionId: string,
    private readonly orgUuid: string,
    private readonly getAccessToken: () => string,
    private readonly callbacks: SessionsWebSocketCallbacks,
  ) {}

  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') {
      logForDebugging('[SessionsV2Client] Already connecting/connected')
      return
    }

    this.state = 'connecting'
    const url = new URL(
      `${getOauthConfig().BASE_API_URL}/v1/code/sessions/${this.sessionId}/events/stream`,
    )
    if (this.lastSequenceNum > 0) {
      url.searchParams.set(
        'from_sequence_num',
        String(this.lastSequenceNum),
      )
    }

    const headers: Record<string, string> = {
      ...this.authHeaders(),
      Accept: 'text/event-stream',
    }
    if (this.lastSequenceNum > 0) {
      headers['Last-Event-ID'] = String(this.lastSequenceNum)
    }

    logForDebugging(
      `[SessionsV2Client] Connecting to ${url.href} (from_sequence_num=${this.lastSequenceNum})`,
    )
    this.abortController = new AbortController()
    void this.readStream(url, headers, this.abortController)
  }

  private async readStream(
    url: URL,
    headers: Record<string, string>,
    abortController: AbortController,
  ): Promise<void> {
    let response: Response
    try {
      response = await fetch(url.href, {
        method: 'GET',
        headers,
        signal: abortController.signal,
        ...getProxyFetchOptions({ url: url.href }),
      })
    } catch (error) {
      if (abortController.signal.aborted) return
      logForDebugging(
        `[SessionsV2Client] Connect error: ${errorMessage(error)}`,
        { level: 'error' },
      )
      this.callbacks.onError?.(toError(error))
      this.handleStreamEnd()
      return
    }

    if (!response.ok || !response.body) {
      logForDebugging(
        `[SessionsV2Client] HTTP ${response.status} on SSE connect`,
        { level: 'error' },
      )
      void response.body?.cancel()
      if (PERMANENT_HTTP_CODES.has(response.status)) {
        this.state = 'closed'
        this.callbacks.onClose?.()
        return
      }
      this.handleStreamEnd()
      return
    }

    this.state = 'connected'
    this.reconnectAttempts = 0
    this.resetLivenessTimer()
    logForDebugging('[SessionsV2Client] Connected')
    this.callbacks.onConnected?.()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, STREAM_DECODE_OPTIONS)
        const { frames, remaining } = parseSSEFrames(buffer)
        buffer = remaining
        for (const frame of frames) {
          this.resetLivenessTimer()
          if (frame.event && frame.data) {
            this.handleFrame(frame.event, frame.id, frame.data)
          }
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) return
      logForDebugging(
        `[SessionsV2Client] Stream read error: ${errorMessage(error)}`,
        { level: 'error' },
      )
    } finally {
      reader.releaseLock()
    }

    if (!abortController.signal.aborted) {
      logForDebugging('[SessionsV2Client] Stream ended')
      this.handleStreamEnd()
    }
  }

  private handleFrame(event: string, id: string | undefined, data: string) {
    let decoded: unknown
    try {
      decoded = jsonParse(data)
    } catch (error) {
      logError(
        new Error(
          `[SessionsV2Client] Failed to parse ${event} frame: ${errorMessage(error)}`,
        ),
      )
      return
    }

    switch (event) {
      case 'client_event': {
        const clientEvent = decoded as ClientEvent
        const sequenceNum = parseInt(
          id ?? String(clientEvent.sequence_num),
          10,
        )
        if (!isNaN(sequenceNum) && sequenceNum > this.lastSequenceNum) {
          this.lastSequenceNum = sequenceNum
        }
        if (isSessionsMessage(clientEvent.payload)) {
          this.callbacks.onMessage(clientEvent.payload)
        } else {
          logForDebugging(
            `[SessionsV2Client] Dropping client_event with no payload.type (event_type=${clientEvent.event_type})`,
          )
        }
        return
      }
      case 'ephemeral_event': {
        const ephemeralEvent = decoded as EphemeralEvent
        if (isSessionsMessage(ephemeralEvent.payload)) {
          this.callbacks.onMessage(ephemeralEvent.payload)
        }
        return
      }
      case 'session_update':
      case 'delivery_update':
      case 'catch_up_truncated':
        logForDebugging(`[SessionsV2Client] Ignoring ${event} frame`)
        return
      default:
        logForDebugging(
          `[SessionsV2Client] Unknown SSE event type '${event}'`,
          { level: 'warn' },
        )
        return
    }
  }

  private handleStreamEnd(): void {
    this.clearLivenessTimer()
    if (this.state === 'closed') return

    this.abortController = null
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logForDebugging(
        `[SessionsV2Client] Reconnect budget exhausted (${MAX_RECONNECT_ATTEMPTS}), closing`,
      )
      this.state = 'closed'
      this.callbacks.onClose?.()
      return
    }

    this.reconnectAttempts++
    this.state = 'idle'
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempts - 1),
      RECONNECT_MAX_DELAY_MS,
    )
    logForDebugging(
      `[SessionsV2Client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}, from_sequence_num=${this.lastSequenceNum})`,
    )
    this.callbacks.onReconnecting?.()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private onLivenessTimeout = () => {
    this.livenessTimer = null
    logForDebugging('[SessionsV2Client] Liveness timeout, reconnecting', {
      level: 'warn',
    })
    this.abortController?.abort()
    this.abortController = null
    this.handleStreamEnd()
  }

  private resetLivenessTimer(): void {
    this.clearLivenessTimer()
    this.livenessTimer = setTimeout(
      this.onLivenessTimeout,
      LIVENESS_TIMEOUT_MS,
    )
  }

  private clearLivenessTimer(): void {
    if (this.livenessTimer) {
      clearTimeout(this.livenessTimer)
      this.livenessTimer = null
    }
  }

  private async sendEvent(
    payload: unknown,
  ): Promise<{ sequence_num: number } | null> {
    if (this.state === 'closed') {
      logForDebugging('[SessionsV2Client] Cannot send: closed', {
        level: 'warn',
      })
      return null
    }

    const url = `${getOauthConfig().BASE_API_URL}/v1/code/sessions/${this.sessionId}/events`
    const body = {
      session_id: this.sessionId,
      events: [{ payload }],
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.authHeaders(),
        body: jsonStringify(body),
        signal: AbortSignal.timeout(30000),
        ...getProxyFetchOptions({ url }),
      })
      if (!response.ok) {
        void response.body?.cancel()
        logForDebugging(
          `[SessionsV2Client] POST /events returned ${response.status}`,
          { level: 'warn' },
        )
        return null
      }

      const result = (
        (await response.json()) as {
          results?: Array<{ sequence_num?: number | string }>
        }
      ).results?.[0]
      const sequenceNum = result
        ? parseInt(String(result.sequence_num), 10)
        : NaN
      return { sequence_num: isNaN(sequenceNum) ? 0 : sequenceNum }
    } catch (error) {
      logForDebugging(
        `[SessionsV2Client] POST /events failed: ${errorMessage(error)}`,
        { level: 'warn' },
      )
      return null
    }
  }

  sendControlResponse(response: SDKControlResponse): void {
    logForDebugging('[SessionsV2Client] Sending control_response')
    void this.sendEvent({ ...response, uuid: randomUUID() })
  }

  sendControlRequest(request: SDKControlRequestInner): string | null {
    if (this.state === 'closed') {
      logForDebugging(
        '[SessionsV2Client] Cannot send control_request: closed',
        { level: 'warn' },
      )
      return null
    }

    const requestId = randomUUID()
    const controlRequest = {
      type: 'control_request' as const,
      request_id: requestId,
      request,
      uuid: randomUUID(),
    }
    logForDebugging(
      `[SessionsV2Client] Sending control_request: ${request.subtype}`,
    )
    void this.sendEvent(controlRequest)
    return requestId
  }

  isConnected(): boolean {
    return this.state === 'connected'
  }

  close(): void {
    logForDebugging('[SessionsV2Client] Closing')
    this.state = 'closed'
    this.clearLivenessTimer()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.abortController?.abort()
    this.abortController = null
  }

  reconnect(): void {
    logForDebugging('[SessionsV2Client] Force reconnect')
    this.reconnectAttempts = 0
    this.clearLivenessTimer()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.abortController?.abort()
    this.abortController = null
    this.state = 'idle'
    void this.connect()
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getAccessToken()}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-organization-uuid': this.orgUuid,
      'User-Agent': getUserAgent(),
    }
  }
}
