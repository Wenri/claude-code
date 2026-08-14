import axios from 'axios'
import memoize from 'lodash-es/memoize.js'
import { getOauthConfig } from 'src/constants/oauth.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  getOauthAccountInfo,
} from 'src/utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js'
import { logForDebugging } from 'src/utils/debug.js'
import { isEnvDefinedFalsy } from 'src/utils/envUtils.js'
import { withOAuth401Retry } from 'src/utils/http.js'
import { clearMcpAuthCache } from './client.js'
import { normalizeNameForMCP } from './normalization.js'
import type {
  McpClaudeAIProxyServerConfig,
  ScopedMcpServerConfig,
} from './types.js'

type ClaudeAIMcpServer = {
  type: 'mcp_server'
  id: string
  display_name: string
  url: string
  created_at: string
}

type ClaudeAIMcpServersResponse = {
  data: ClaudeAIMcpServer[]
  has_more: boolean
  next_page: string | null
}

const FETCH_TIMEOUT_MS = 5000
const MCP_SERVERS_BETA_HEADER = 'mcp-servers-2025-12-04'

function normalizeUpstreamUrl(url: string): string {
  try {
    return new URL(url).href.replace(/\/+$/, '')
  } catch {
    return url
  }
}

export function buildClaudeAiMcpAuthUrl(
  config: McpClaudeAIProxyServerConfig,
): string | null {
  const organizationUuid = getOauthAccountInfo()?.organizationUuid
  if (!organizationUuid || !config.id) return null
  const baseUrl = getOauthConfig().CLAUDE_AI_ORIGIN
  const serverId = config.id.startsWith('mcprs')
    ? `mcpsrv${config.id.slice(5)}`
    : config.id
  const productSurface = encodeURIComponent(
    process.env.CLAUDE_CODE_ENTRYPOINT || 'cli',
  )
  return `${baseUrl}/api/organizations/${organizationUuid}/mcp/start-auth/${serverId}?product_surface=${productSurface}`
}

/**
 * Fetches MCP server configurations from Claude.ai org configs.
 * These servers are managed by the organization via Claude.ai.
 *
 * Results are memoized for the session lifetime (fetch once per CLI session).
 */
export const fetchClaudeAIMcpConfigsIfEligible = memoize(
  async (): Promise<Record<string, ScopedMcpServerConfig>> => {
    try {
      if (isEnvDefinedFalsy(process.env.ENABLE_CLAUDEAI_MCP_SERVERS)) {
        logForDebugging('[claudeai-mcp] Disabled via env var')
        logEvent('tengu_claudeai_mcp_eligibility', {
          state:
            'disabled_env_var' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {}
      }

      await checkAndRefreshOAuthTokenIfNeeded()
      const tokens = getClaudeAIOAuthTokens()
      if (!tokens?.accessToken) {
        logForDebugging('[claudeai-mcp] No access token')
        logEvent('tengu_claudeai_mcp_eligibility', {
          state:
            'no_oauth_token' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {}
      }

      // Check for user:mcp_servers scope directly instead of isClaudeAISubscriber().
      // In non-interactive mode, isClaudeAISubscriber() returns false when ANTHROPIC_API_KEY
      // is set (even with valid OAuth tokens) because preferThirdPartyAuthentication() causes
      // isAnthropicAuthEnabled() to return false. Checking the scope directly allows users
      // with both API keys and OAuth tokens to access claude.ai MCPs in print mode.
      if (!tokens.scopes?.includes('user:mcp_servers')) {
        logForDebugging(
          `[claudeai-mcp] Missing user:mcp_servers scope (scopes=${tokens.scopes?.join(',') || 'none'})`,
        )
        logEvent('tengu_claudeai_mcp_eligibility', {
          state:
            'missing_scope' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {}
      }

      const baseUrl = getOauthConfig().BASE_API_URL
      const url = `${baseUrl}/v1/mcp_servers?limit=1000`

      logForDebugging(`[claudeai-mcp] Fetching from ${url}`)

      const response = await withOAuth401Retry(() =>
        axios.get<ClaudeAIMcpServersResponse>(url, {
          headers: {
            Authorization: `Bearer ${getClaudeAIOAuthTokens()?.accessToken ?? tokens.accessToken}`,
            'Content-Type': 'application/json',
            'anthropic-beta': MCP_SERVERS_BETA_HEADER,
            'anthropic-version': '2023-06-01',
          },
          timeout: FETCH_TIMEOUT_MS,
        }),
      )

      const serversByUpstream = new Map<string, ClaudeAIMcpServer>()
      for (const server of response.data.data) {
        const upstream = normalizeUpstreamUrl(server.url)
        const duplicate = serversByUpstream.get(upstream)
        if (duplicate) {
          logForDebugging(
            `[claudeai-mcp] Dropping duplicate upstream ${upstream}: keeping ${duplicate.id}, dropping ${server.id}`,
          )
          continue
        }
        serversByUpstream.set(upstream, server)
      }

      const configs: Record<string, ScopedMcpServerConfig> = {}
      // Track used normalized names to detect collisions and assign (2), (3), etc. suffixes.
      // We check the final normalized name (including suffix) to handle edge cases where
      // a suffixed name collides with another server's base name (e.g., "Example Server 2"
      // colliding with "Example Server! (2)" which both normalize to claude_ai_Example_Server_2).
      const usedNormalizedNames = new Set<string>()

      for (const server of serversByUpstream.values()) {
        const baseName = `claude.ai ${server.display_name}`

        // Try without suffix first, then increment until we find an unused normalized name
        let finalName = baseName
        let finalNormalized = normalizeNameForMCP(finalName)
        let count = 1
        while (usedNormalizedNames.has(finalNormalized)) {
          count++
          finalName = `${baseName} (${count})`
          finalNormalized = normalizeNameForMCP(finalName)
        }
        if (count > 1) {
          logForDebugging(
            `[claudeai-mcp] Display-name collision on distinct upstreams: "${finalName}" (${server.id}, ${server.url})`,
          )
        }
        usedNormalizedNames.add(finalNormalized)

        configs[finalName] = {
          type: 'claudeai-proxy',
          url: server.url,
          id: server.id,
          scope: 'claudeai',
        }
      }

      logForDebugging(
        `[claudeai-mcp] Fetched ${Object.keys(configs).length} servers`,
      )
      logEvent('tengu_claudeai_mcp_eligibility', {
        state:
          'eligible' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      return configs
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? String(error.response?.status ?? error.code ?? 'unknown')
        : 'unknown'
      logForDebugging(`[claudeai-mcp] Fetch failed (${status})`)
      logEvent('tengu_claudeai_mcp_eligibility', {
        state:
          'fetch_failed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        status:
          status as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      fetchClaudeAIMcpConfigsIfEligible.cache.clear?.()
      return {}
    }
  },
)

/**
 * Clears the memoized cache for fetchClaudeAIMcpConfigsIfEligible.
 * Call this after login so the next fetch will use the new auth tokens.
 */
export function clearClaudeAIMcpConfigsCache(): void {
  fetchClaudeAIMcpConfigsIfEligible.cache.clear?.()
  // Also clear the auth cache so freshly-authorized servers get re-connected
  clearMcpAuthCache()
}

/**
 * Record that a claude.ai connector successfully connected. Idempotent.
 *
 * Gates the "N connectors unavailable/need auth" startup notifications: a
 * connector that was working yesterday and is now failed is a state change
 * worth surfacing; an org-configured connector that's been needs-auth since
 * it showed up is one the user has demonstrably ignored.
 */
export function markClaudeAiMcpConnected(name: string): void {
  saveGlobalConfig(current => {
    const seen = current.claudeAiMcpEverConnected ?? []
    if (seen.includes(name)) return current
    return { ...current, claudeAiMcpEverConnected: [...seen, name] }
  })
}

export function hasClaudeAiMcpEverConnected(name: string): boolean {
  return (getGlobalConfig().claudeAiMcpEverConnected ?? []).includes(name)
}
