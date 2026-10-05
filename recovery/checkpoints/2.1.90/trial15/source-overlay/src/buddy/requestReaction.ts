// Reconstructed module boundary, justified by the target request initializer.
import axios from 'axios'
import { OAUTH_BETA_HEADER, getOauthConfig } from '../constants/oauth.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
} from '../utils/auth.js'
import { getGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { isEssentialTrafficOnly } from '../utils/privacyLevel.js'
import { getClaudeCodeUserAgent } from '../utils/userAgent.js'
import type { Companion } from './types.js'

export type ReactionReason = 'test-fail' | 'error' | 'large-diff' | 'turn' | 'hatch' | 'pet'

export async function requestReaction(
  companion: Companion,
  transcript: string,
  reason: ReactionReason,
  recent: string[],
  addressed: boolean,
  signal: AbortSignal,
): Promise<string | null> {
  if (getAPIProvider() !== 'firstParty') return null
  if (isEssentialTrafficOnly()) return null

  const organizationUuid = getGlobalConfig().oauthAccount?.organizationUuid
  if (!organizationUuid) return null

  try {
    await checkAndRefreshOAuthTokenIfNeeded()
    const accessToken = getClaudeAIOAuthTokens()?.accessToken
    if (!accessToken) return null

    const url = `${getOauthConfig().BASE_API_URL}/api/organizations/${organizationUuid}/claude_code/buddy_react`
    const response = await axios.post(
      url,
      {
        name: companion.name.slice(0, 32),
        personality: companion.personality.slice(0, 200),
        species: companion.species,
        rarity: companion.rarity,
        stats: companion.stats,
        transcript: transcript.slice(0, 5000),
        reason,
        recent: recent.map(item => item.slice(0, 200)),
        addressed,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'anthropic-beta': OAUTH_BETA_HEADER,
          'User-Agent': getClaudeCodeUserAgent(),
        },
        timeout: 10_000,
        signal,
      },
    )
    return response.data.reaction?.trim() || null
  } catch (error) {
    logForDebugging(`[buddy] api failed: ${error}`, { level: 'debug' })
    return null
  }
}
