import axios from 'axios'
import { getOauthConfig } from '../../constants/oauth.js'
import {
  getClaudeAIOAuthTokens,
  hasProfileScope,
  isClaudeAISubscriber,
} from '../../utils/auth.js'
import { logForDebugging } from '../../utils/debug.js'
import { getAuthHeaders, withOAuth401Retry } from '../../utils/http.js'
import { getClaudeCodeUserAgent } from '../../utils/userAgent.js'
import { isOAuthTokenExpired } from '../oauth/client.js'

export type RateLimit = {
  utilization: number | null // a percentage from 0 to 100
  resets_at: string | null // ISO 8601 timestamp
}

export type ExtraUsage = {
  is_enabled: boolean
  monthly_limit: number | null
  used_credits: number | null
  utilization: number | null
}

export type Utilization = {
  five_hour?: RateLimit | null
  seven_day?: RateLimit | null
  seven_day_oauth_apps?: RateLimit | null
  seven_day_opus?: RateLimit | null
  seven_day_sonnet?: RateLimit | null
  extra_usage?: ExtraUsage | null
}

export async function fetchUtilization(): Promise<Utilization | null> {
  if (!isClaudeAISubscriber() || !hasProfileScope()) {
    return {}
  }

  // Skip API call if OAuth token is expired to avoid 401 errors
  const tokens = getClaudeAIOAuthTokens()
  if (tokens && isOAuthTokenExpired(tokens.expiresAt)) {
    return null
  }

  const url = `${getOauthConfig().BASE_API_URL}/api/oauth/usage`
  let attempts = 0
  const response = await withOAuth401Retry(() => {
    attempts++
    // Re-read auth inside the retry closure so a refreshed token is used.
    const authResult = getAuthHeaders()
    if (authResult.error) {
      throw new Error(`Auth error: ${authResult.error}`)
    }

    logForDebugging(`fetchUtilization: GET ${url} (attempt ${attempts})`)
    return axios.get<Utilization>(url, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': getClaudeCodeUserAgent(),
        ...authResult.headers,
      },
      timeout: 5000, // 5 second timeout
    })
  })

  logForDebugging(
    `fetchUtilization: 200 after ${attempts} attempt(s)${attempts > 1 ? ' (401→refresh→retry succeeded)' : ''}`,
  )
  return response.data
}
