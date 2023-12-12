import axios from 'axios'
import { getOauthConfig } from '../constants/oauth.js'
import {
  getOauthAccountInfo,
  getSubscriptionType,
} from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'
import {
  getOAuthHeaders,
  prepareApiRequest,
} from '../utils/teleport/api.js'
import {
  getMockProTrialOverride,
  setMockProTrialOverride,
} from './mockRateLimits.js'

export const PRO_TRIAL_FALLBACK_DAYS = 14

export type ProTrialState =
  | { status: 'ineligible'; daysRemaining: null }
  | { status: 'not_started'; daysRemaining: null }
  | { status: 'active'; daysRemaining: number }
  | { status: 'expired'; daysRemaining: 0 }

const INELIGIBLE_STATE: ProTrialState = {
  status: 'ineligible',
  daysRemaining: null,
}

export function getProTrialDurationDays(): number | null {
  return getOauthAccountInfo()?.claudeCodeTrialDurationDays ?? null
}

export function getProTrialState(): ProTrialState {
  const mockOverride = getMockProTrialOverride()
  if (mockOverride) {
    return parseProTrialState(true, mockOverride.endsAt)
  }

  const account = getOauthAccountInfo()
  if (!account || getSubscriptionType() !== 'pro') {
    return INELIGIBLE_STATE
  }

  const eligible = account.ccOnboardingFlags?.e10 === true
  return parseProTrialState(eligible, account.claudeCodeTrialEndsAt ?? null)
}

export async function startProTrial(): Promise<ProTrialState> {
  if (getMockProTrialOverride()) {
    const endsAt = new Date(
      Date.now() + PRO_TRIAL_FALLBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    setMockProTrialOverride({ endsAt })
    return parseProTrialState(true, endsAt)
  }

  const { accessToken, orgUUID } = await prepareApiRequest()
  const response = await axios.post<{ ends_at: string }>(
    `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/claude_code/pro_trial`,
    {},
    { headers: getOAuthHeaders(accessToken) },
  )

  logForDebugging('Pro trial started', { level: 'debug' })
  persistTrialEndsAt(response.data.ends_at)
  return parseProTrialState(true, response.data.ends_at)
}

export function shouldAutoOpenProTrialExpired(): boolean {
  if (getProTrialState().status !== 'expired') {
    return false
  }
  return getGlobalConfig().cachedExtraUsageDisabledReason !== null
}

export function formatTrialBadge(state: ProTrialState): string | null {
  switch (state.status) {
    case 'active': {
      const days = state.daysRemaining ?? 0
      return `Trial: ${days} ${days === 1 ? 'day' : 'days'} left`
    }
    case 'expired':
      return 'Extra usage'
    case 'ineligible':
    case 'not_started':
      return null
  }
}

function parseProTrialState(
  eligible: boolean,
  endsAt: string | null,
): ProTrialState {
  if (!eligible) {
    return INELIGIBLE_STATE
  }
  if (!endsAt) {
    return { status: 'not_started', daysRemaining: null }
  }

  const endDate = new Date(endsAt)
  if (Number.isNaN(endDate.getTime())) {
    logError(new Error(`Invalid claude_code_trial_ends_at: ${endsAt}`))
    return INELIGIBLE_STATE
  }

  const remainingMs = endDate.getTime() - Date.now()
  if (remainingMs <= 0) {
    return { status: 'expired', daysRemaining: 0 }
  }
  return {
    status: 'active',
    daysRemaining: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
  }
}

function persistTrialEndsAt(endsAt: string): void {
  saveGlobalConfig(current => {
    if (
      !current.oauthAccount ||
      current.oauthAccount.claudeCodeTrialEndsAt === endsAt
    ) {
      return current
    }
    return {
      ...current,
      oauthAccount: {
        ...current.oauthAccount,
        claudeCodeTrialEndsAt: endsAt,
      },
    }
  })
}
