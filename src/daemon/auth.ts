import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { ChildProcess } from 'child_process'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'

const TOKEN_VALIDITY_WINDOW_MS = 5 * 60_000
const REFRESH_AHEAD_MS = 4 * 60_000
const REAUTH_COOLDOWN_MS = 5 * 60_000
const KEYCHAIN_RECHECK_MS = 30_000
const MAX_REFRESH_DELAY_MS = 24 * 60 * 60_000

export interface AuthSnapshot {
  accessToken: string
  subscriptionType: string | null
  rateLimitTier: string | null
}

export interface WorkerAuthManager {
  getAccessToken(): string | undefined
  reportAuth401(failedToken: string): Promise<boolean>
}

interface AuthIpcMessage {
  type: 'auth_401'
  failedToken: string
  requestId: string
}

function isAuth401Message(value: unknown): value is AuthIpcMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'auth_401' &&
    'failedToken' in value &&
    typeof value.failedToken === 'string' &&
    'requestId' in value &&
    typeof value.requestId === 'string'
  )
}

export function createDaemonAuthManager(
  signal: AbortSignal,
  log: (message: string) => void,
  hasOAuthConsumer: () => boolean = () => true,
): {
  ready: Promise<void>
  getAccessToken(): string | undefined
  getAuthSnapshot(): AuthSnapshot | undefined
  attachWorker(child: ChildProcess): void
  detachWorker(child: ChildProcess): void
  dispose(): void
} {
  let snapshot: AuthSnapshot | undefined
  let thirdPartyProvider = false
  let refreshTimer: NodeJS.Timeout | null = null
  let keychainTimer: NodeJS.Timeout | null = null
  let lastMissingToken: string | undefined
  let authModule: typeof import('../utils/auth.js') | undefined
  let reauthInFlight: Promise<void> | null = null
  const workers = new Set<ChildProcess>()

  const loadAuth = async () => (authModule ??= await import('../utils/auth.js'))

  const broadcastToken = (accessToken: string) => {
    for (const child of workers) {
      try {
        child.send?.({ type: 'token_update', accessToken })
      } catch {}
    }
  }

  const scheduleRefresh = (expiresAt: number | null) => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
    if (!expiresAt || signal.aborted) return
    const delay = Math.min(
      Math.max(expiresAt - Date.now() - REFRESH_AHEAD_MS, 5_000),
      MAX_REFRESH_DELAY_MS,
    )
    log(`auth: scheduling proactive refresh in ${Math.round(delay / 1_000)}s`)
    refreshTimer = setTimeout(() => void proactiveRefresh(), delay)
    refreshTimer.unref()
  }

  const reloadSnapshot = async () => {
    const tokens = await (await loadAuth()).getClaudeAIOAuthTokensAsync()
    if (tokens?.accessToken && tokens.accessToken !== snapshot?.accessToken) {
      snapshot = {
        accessToken: tokens.accessToken,
        subscriptionType: tokens.subscriptionType ?? null,
        rateLimitTier: tokens.rateLimitTier ?? null,
      }
      broadcastToken(snapshot.accessToken)
    }
    scheduleRefresh(tokens?.expiresAt ?? null)
  }

  const signalReauthRequired = () => {
    if (reauthInFlight) return reauthInFlight
    reauthInFlight = signalReauthRequiredInner().finally(() => {
      reauthInFlight = null
    })
    return reauthInFlight
  }

  const signalReauthRequiredInner = async () => {
    const auth = await loadAuth()
    if (auth.getAnthropicApiKey()) {
      log('auth: browser login skipped (API key auth available)')
      return
    }
    if (auth.isUsing3PServices() && !hasOAuthConsumer()) {
      log('auth: browser login skipped (3P provider, no OAuth-consuming worker)')
      return
    }
    const configDir = getClaudeConfigHomeDir()
    const cooldownPath = join(configDir, 'daemon-auth-cooldown')
    const statusPath = join(configDir, 'daemon-auth-status.json')
    try {
      const value = parseInt(await readFile(cooldownPath, 'utf8'), 10)
      if (!Number.isNaN(value) && Date.now() - value < REAUTH_COOLDOWN_MS) {
        log('auth: browser login skipped (cooldown)')
        return
      }
    } catch (error) {
      if (!isENOENT(error)) log(`auth: cooldown read error: ${String(error)}`)
    }
    try {
      await mkdir(configDir, { recursive: true })
      await writeFile(cooldownPath, String(Date.now()), 'utf8')
    } catch (error) {
      log(`auth: cooldown write error: ${String(error)}`)
    }
    try {
      void execFileNoThrow(
        'notify-send',
        ['Claude', 'Your Claude assistant needs re-authentication'],
        { useCwd: false },
      )
    } catch {}
    try {
      await writeFile(
        statusPath,
        JSON.stringify({ status: 'auth_required', since: Date.now() }),
        'utf8',
      )
    } catch (error) {
      log(`auth: status write error: ${String(error)}`)
    }
    log('auth: headless daemon cannot complete OAuth — run `claude auth login` to refresh')
  }

  const watchKeychain = (missingToken?: string) => {
    lastMissingToken = missingToken
    if (keychainTimer || signal.aborted) return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
    log('auth: no token found, will re-check keychain every 30s')
    keychainTimer = setInterval(() => {
      void loadAuth()
        .then(async auth => {
          auth.clearOAuthTokenCache()
          const tokens = await auth.getClaudeAIOAuthTokensAsync()
          if (
            tokens?.accessToken &&
            tokens.accessToken !== lastMissingToken &&
            tokens.expiresAt &&
            tokens.expiresAt > Date.now()
          ) {
            await reloadSnapshot()
            if (snapshot && keychainTimer) {
              clearInterval(keychainTimer)
              keychainTimer = null
              log('auth: token found via keychain re-check')
            }
          }
        })
        .catch(error => log(`auth: keychain re-check error: ${String(error)}`))
    }, KEYCHAIN_RECHECK_MS)
    keychainTimer.unref()
  }

  async function proactiveRefresh(): Promise<void> {
    if (signal.aborted) return
    try {
      log('auth: proactive refresh starting')
      const auth = await loadAuth()
      const previousToken = snapshot?.accessToken
      const didRefresh = await auth.checkAndRefreshOAuthTokenIfNeeded()
      auth.clearOAuthTokenCache()
      const tokens = await auth.getClaudeAIOAuthTokensAsync()
      const expiresAt = tokens?.expiresAt ?? null
      const sufficientlyValid =
        expiresAt === null || expiresAt > Date.now() + TOKEN_VALIDITY_WINDOW_MS
      if (
        tokens?.accessToken &&
        (didRefresh || tokens.accessToken !== previousToken || sufficientlyValid) &&
        (expiresAt === null || expiresAt > Date.now() + REFRESH_AHEAD_MS)
      ) {
        await reloadSnapshot()
        log(
          didRefresh
            ? 'auth: proactive refresh succeeded'
            : 'auth: token still valid (cross-process refresh or not yet due)',
        )
        return
      }
      log('auth: proactive refresh failed, signalling re-auth required')
      const failedToken = tokens?.accessToken ?? previousToken
      snapshot = undefined
      await signalReauthRequired()
      watchKeychain(failedToken)
    } catch (error) {
      log(`auth: proactive refresh error: ${String(error)}`)
      scheduleRefresh(Date.now() + 60_000 + REFRESH_AHEAD_MS)
    }
  }

  const recover401 = async (failedToken: string): Promise<boolean> => {
    if (thirdPartyProvider) {
      log('auth: 401 ignored (3P provider active, no OAuth)')
      return false
    }
    log('auth: handling 401')
    const auth = await loadAuth()
    if (await auth.handleOAuth401Error(failedToken)) {
      auth.clearOAuthTokenCache()
      await reloadSnapshot()
      log('auth: 401 recovery succeeded')
      return true
    }
    log('auth: 401 recovery failed, signalling re-auth required')
    snapshot = undefined
    await signalReauthRequired()
    auth.clearOAuthTokenCache()
    const tokens = await auth.getClaudeAIOAuthTokensAsync()
    if (tokens?.accessToken !== undefined && tokens.accessToken !== failedToken) {
      await reloadSnapshot()
      return true
    }
    watchKeychain(failedToken)
    return false
  }

  const onWorkerMessage = (message: unknown) => {
    if (!isAuth401Message(message)) return
    void recover401(message.failedToken)
      .then(refreshed => {
        for (const child of workers) {
          try {
            child.send?.({
              type: 'auth_401_result',
              refreshed,
              requestId: message.requestId,
            })
          } catch {}
        }
      })
      .catch(error => {
        log(`auth: 401 handler error: ${String(error)}`)
        for (const child of workers) {
          try {
            child.send?.({
              type: 'auth_401_result',
              refreshed: false,
              requestId: message.requestId,
            })
          } catch {}
        }
      })
  }

  const ready = (async () => {
    if (signal.aborted) return
    try {
      const auth = await loadAuth()
      const tokens = await auth.getClaudeAIOAuthTokensAsync()
      if (!tokens?.accessToken && auth.isUsing3PServices()) {
        thirdPartyProvider = true
        log('auth: 3P provider active, skipping OAuth refresh loop')
        return
      }
      if (tokens?.accessToken) {
        snapshot = {
          accessToken: tokens.accessToken,
          subscriptionType: tokens.subscriptionType ?? null,
          rateLimitTier: tokens.rateLimitTier ?? null,
        }
        scheduleRefresh(tokens.expiresAt ?? null)
      }
      await auth.checkAndRefreshOAuthTokenIfNeeded()
      await reloadSnapshot()
    } catch (error) {
      log(`auth: init error: ${String(error)}`)
    }
  })()

  void ready.then(() => {
    if (!signal.aborted && !snapshot && !thirdPartyProvider) watchKeychain()
  })

  const dispose = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
    if (keychainTimer) clearInterval(keychainTimer)
    keychainTimer = null
    for (const child of workers) child.removeListener('message', onWorkerMessage)
    workers.clear()
  }
  signal.addEventListener('abort', dispose, { once: true })

  return {
    ready,
    getAccessToken: () => snapshot?.accessToken,
    getAuthSnapshot: () => snapshot,
    attachWorker(child) {
      workers.add(child)
      child.on('message', onWorkerMessage)
      if (snapshot) {
        try {
          child.send?.({ type: 'token_update', accessToken: snapshot.accessToken })
        } catch {}
      }
    },
    detachWorker(child) {
      child.removeListener('message', onWorkerMessage)
      workers.delete(child)
    },
    dispose,
  }
}

export function createWorkerAuthManager(
  initialAccessToken?: string,
): WorkerAuthManager {
  if (typeof process.send === 'function') {
    let accessToken = initialAccessToken
    const waiting = new Map<
      string,
      { resolve: (refreshed: boolean) => void; timer: NodeJS.Timeout }
    >()
    const timeOut = (requestId: string) => {
      const pending = waiting.get(requestId)
      if (pending) {
        waiting.delete(requestId)
        pending.resolve(false)
      }
    }
    process.on('message', message => {
      if (!message || typeof message !== 'object' || !('type' in message)) return
      if (message.type === 'token_update' && 'accessToken' in message) {
        accessToken =
          typeof message.accessToken === 'string' ? message.accessToken : undefined
      }
    })
    process.on('message', message => {
      if (
        !message ||
        typeof message !== 'object' ||
        !('type' in message) ||
        message.type !== 'auth_401_result' ||
        !('requestId' in message) ||
        typeof message.requestId !== 'string'
      ) {
        return
      }
      const pending = waiting.get(message.requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      waiting.delete(message.requestId)
      pending.resolve('refreshed' in message && message.refreshed === true)
    })
    process.channel?.unref()
    return {
      getAccessToken: () => accessToken,
      reportAuth401(failedToken) {
        const requestId = randomUUID()
        return new Promise(resolve => {
          const timer = setTimeout(timeOut, 30_000, requestId)
          timer.unref()
          waiting.set(requestId, { resolve, timer })
          try {
            process.send?.({ type: 'auth_401', failedToken, requestId })
          } catch {
            clearTimeout(timer)
            waiting.delete(requestId)
            resolve(false)
          }
        })
      },
    }
  }

  let auth: typeof import('../utils/auth.js') | null = null
  void import('../utils/auth.js').then(value => {
    auth = value
  })
  return {
    getAccessToken: () => auth?.getClaudeAIOAuthTokens()?.accessToken,
    async reportAuth401(failedToken) {
      const value = auth ?? (await import('../utils/auth.js'))
      auth = value
      return value.handleOAuth401Error(failedToken)
    },
  }
}
