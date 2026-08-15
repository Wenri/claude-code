import { loadConfig } from '@anthropic-ai/sdk/core/credentials'
import { defaultCredentials } from '@anthropic-ai/sdk/lib/credentials/credential-chain'
import { TokenCache } from '@anthropic-ai/sdk/lib/credentials/token-cache'
import { WorkloadIdentityError } from '@anthropic-ai/sdk/lib/credentials/types'
import { logForDebugging } from './debug.js'
import { logError } from './log.js'

type WIFCredentials = Awaited<ReturnType<typeof defaultCredentials>>

let credentialsPromise: Promise<WIFCredentials> | undefined
let tokenCachePromise: Promise<TokenCache | null> | undefined

export function getWIFCredentials(): Promise<WIFCredentials> {
  if (credentialsPromise === undefined) {
    credentialsPromise = (async () => {
      if ((await loadConfig())?.authentication.type === 'user_oauth') {
        logForDebugging(
          'user_oauth profile detected; not supported in CC (inc-4829)',
          { level: 'error' },
        )
        return null
      }
      const [{ getUserAgent }, { getProxyFetchOptions }] = await Promise.all([
        import('./http.js'),
        import('./proxy.js'),
      ])
      return defaultCredentials({
        baseURL:
          process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            ...getProxyFetchOptions({ forAnthropicAPI: true }),
          }),
        userAgent: getUserAgent(),
        onSafetyWarning: warning =>
          logForDebugging(warning, { level: 'warn' }),
        onCacheWriteError: error =>
          logForDebugging(String(error), { level: 'warn' }),
      })
    })().catch(error => {
      logError(error)
      return null
    })
  }
  return credentialsPromise
}

export function getWIFTokenCache(): Promise<TokenCache | null> {
  tokenCachePromise ??= getWIFCredentials().then(credentials => {
    if (credentials === null) return null
    return new TokenCache(
      async options => {
        try {
          return await credentials.provider(options)
        } catch (error) {
          if (error instanceof WorkloadIdentityError) throw error
          throw new WorkloadIdentityError(
            error instanceof Error ? error.message : String(error),
            null,
          )
        }
      },
      error => logForDebugging(String(error), { level: 'warn' }),
    )
  })
  return tokenCachePromise
}

export function resetWIFSingletonsForTesting(): void {
  credentialsPromise = undefined
  tokenCachePromise = undefined
}

export { WorkloadIdentityError }
