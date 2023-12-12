import { APIError } from '@anthropic-ai/sdk'
import { extractConnectionErrorDetails } from './errorUtils.js'

const OFFLINE_FAILURE_WINDOW_MS = 60_000
const OFFLINE_FAILURE_THRESHOLD = 2
const OFFLINE_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ConnectionRefused',
  'ENOTFOUND',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTUNREACH',
  'EHOSTDOWN',
  'EAI_AGAIN',
  'FailedToOpenSocket',
])

export type ConnectionFailureReason =
  | { kind: 'connection'; detail: string }
  | { kind: 'overloaded'; status: 429 | 529 }
  | { kind: 'server-error'; status: number }

export type ConnectionStatus =
  | { phase: 'idle' }
  | { phase: 'connecting'; since: number; attempt: number }
  | {
      phase: 'streaming'
      since: number
      bytesReceived: number
      lastByteAt: number
    }
  | {
      phase: 'degraded'
      since: number
      reason: ConnectionFailureReason
      retryAt: number
      attempt: number
      maxRetries: number
    }
  | { phase: 'offline'; since: number; lastError: Error }
  | { phase: 'failed'; error: Error }

export type ConnectionEvent =
  | { type: 'sending' }
  | { type: 'receiving'; bytes: number }
  | {
      type: 'retrying'
      error: Error
      retryInMs: number
      attempt: number
      maxRetries: number
    }
  | { type: 'completed' }
  | { type: 'failed'; error: Error }

export type ConnectionSummary = {
  ms_in_connecting: number
  ms_in_streaming: number
  ms_in_degraded: number
  ms_in_offline: number
  offline_entries: number
}

type TimedPhase = 'connecting' | 'streaming' | 'degraded' | 'offline'

export class ConnectionLifecycleTracker {
  private status: ConnectionStatus = { phase: 'idle' }
  private readonly listeners = new Set<(status: ConnectionStatus) => void>()
  private recentFailureCodes: Array<{ code: string; at: number }> = []
  private readonly msIn: Record<TimedPhase, number> = {
    connecting: 0,
    streaming: 0,
    degraded: 0,
    offline: 0,
  }
  private offlineEntries = 0

  get current(): ConnectionStatus {
    return this.status
  }

  subscribe(listener: (status: ConnectionStatus) => void): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => {
      this.listeners.delete(listener)
    }
  }

  push(event: ConnectionEvent): void {
    const previous = this.status
    const now = Date.now()
    const next = this.reduce(event, now)
    if (next === previous) return
    if (
      previous.phase === 'connecting' ||
      previous.phase === 'streaming' ||
      previous.phase === 'degraded' ||
      previous.phase === 'offline'
    ) {
      this.msIn[previous.phase] += now - previous.since
    }
    if (next.phase === 'offline' && previous.phase !== 'offline') {
      this.offlineEntries += 1
    }
    this.status = next
    for (const listener of this.listeners) listener(next)
  }

  summary(): ConnectionSummary {
    const now = Date.now()
    const current: Record<TimedPhase, number> = {
      connecting: 0,
      streaming: 0,
      degraded: 0,
      offline: 0,
    }
    if (
      this.status.phase === 'connecting' ||
      this.status.phase === 'streaming' ||
      this.status.phase === 'degraded' ||
      this.status.phase === 'offline'
    ) {
      current[this.status.phase] = now - this.status.since
    }
    return {
      ms_in_connecting: this.msIn.connecting + current.connecting,
      ms_in_streaming: this.msIn.streaming + current.streaming,
      ms_in_degraded: this.msIn.degraded + current.degraded,
      ms_in_offline: this.msIn.offline + current.offline,
      offline_entries: this.offlineEntries,
    }
  }

  private reduce(event: ConnectionEvent, now: number): ConnectionStatus {
    switch (event.type) {
      case 'sending': {
        const attempt =
          this.status.phase === 'degraded' ? this.status.attempt + 1 : 1
        return { phase: 'connecting', since: now, attempt }
      }
      case 'receiving':
        this.recentFailureCodes = []
        if (this.status.phase === 'streaming') {
          return {
            ...this.status,
            bytesReceived: this.status.bytesReceived + event.bytes,
            lastByteAt: now,
          }
        }
        return {
          phase: 'streaming',
          since: now,
          bytesReceived: event.bytes,
          lastByteAt: now,
        }
      case 'retrying': {
        const reason = this.classify(event.error, now)
        if (reason === 'offline') {
          return { phase: 'offline', since: now, lastError: event.error }
        }
        return {
          phase: 'degraded',
          since: now,
          reason,
          retryAt: now + event.retryInMs,
          attempt: event.attempt,
          maxRetries: event.maxRetries,
        }
      }
      case 'completed':
        return this.status.phase === 'idle' ? this.status : { phase: 'idle' }
      case 'failed':
        return this.status.phase === 'failed' &&
          this.status.error === event.error
          ? this.status
          : { phase: 'failed', error: event.error }
    }
  }

  private classify(
    error: Error,
    now: number,
  ): ConnectionFailureReason | 'offline' {
    const details = extractConnectionErrorDetails(error)
    if (details) {
      this.recentFailureCodes = this.recentFailureCodes.filter(
        failure => now - failure.at < OFFLINE_FAILURE_WINDOW_MS,
      )
      this.recentFailureCodes.push({ code: details.code, at: now })
      if (
        this.recentFailureCodes.filter(failure =>
          OFFLINE_ERROR_CODES.has(failure.code),
        ).length >= OFFLINE_FAILURE_THRESHOLD
      ) {
        return 'offline'
      }
      return { kind: 'connection', detail: details.message }
    }
    if (error instanceof APIError) {
      if (error.status === 429 || error.status === 529) {
        return { kind: 'overloaded', status: error.status }
      }
      if (typeof error.status === 'number' && error.status >= 500) {
        return { kind: 'server-error', status: error.status }
      }
    }
    return { kind: 'connection', detail: error.message }
  }
}
