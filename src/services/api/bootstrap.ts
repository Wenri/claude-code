import axios from 'axios'
import isEqual from 'lodash-es/isEqual.js'
import {
  getAnthropicApiKey,
  getClaudeAIOAuthTokens,
  hasProfileScope,
} from 'src/utils/auth.js'
import { z } from 'zod'
import { getOauthConfig, OAUTH_BETA_HEADER } from '../../constants/oauth.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { withOAuth401Retry } from '../../utils/http.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'
import { getClaudeCodeUserAgent } from '../../utils/userAgent.js'

function mergeBootstrapOAuthAccount(
  current: ReturnType<typeof getGlobalConfig>['oauthAccount'],
  bootstrap:
    | z.infer<
        ReturnType<typeof bootstrapResponseSchema>
      >['oauth_account']
    | undefined,
): ReturnType<typeof getGlobalConfig>['oauthAccount'] {
  if (!current || !bootstrap) return current
  if (
    bootstrap.account_uuid != null &&
    bootstrap.account_uuid !== current.accountUuid
  ) {
    return current
  }

  const enrichment = {
    organizationType: bootstrap.organization_type ?? null,
    organizationRateLimitTier:
      bootstrap.organization_rate_limit_tier ?? null,
    userRateLimitTier: bootstrap.user_rate_limit_tier ?? null,
    seatTier: bootstrap.seat_tier ?? null,
    ...(bootstrap.account_email != null && {
      emailAddress: bootstrap.account_email,
    }),
    ...(bootstrap.organization_uuid != null && {
      organizationUuid: bootstrap.organization_uuid,
    }),
    ...(bootstrap.organization_name != null && {
      organizationName: bootstrap.organization_name,
    }),
  }
  return { ...current, ...enrichment }
}

const bootstrapResponseSchema = lazySchema(() =>
  z.object({
    client_data: z.record(z.unknown()).nullish(),
    additional_model_options: z
      .array(
        z
          .object({
            model: z.string(),
            name: z.string(),
            description: z.string(),
          })
          .transform(({ model, name, description }) => ({
            value: model,
            label: name,
            description,
          })),
      )
      .nullish(),
    additional_model_costs: z
      .record(
        z
          .object({
            input_tokens: z.number(),
            output_tokens: z.number(),
            prompt_cache_write_tokens: z.number(),
            prompt_cache_read_tokens: z.number(),
            web_search_requests: z.number().nullish(),
          })
          .transform(costs => ({
            inputTokens: costs.input_tokens,
            outputTokens: costs.output_tokens,
            promptCacheWriteTokens: costs.prompt_cache_write_tokens,
            promptCacheReadTokens: costs.prompt_cache_read_tokens,
            webSearchRequests: costs.web_search_requests ?? 0.01,
          })),
      )
      .nullish(),
    oauth_account: z
      .object({
        account_uuid: z.string().nullish(),
        account_email: z.string().nullish(),
        organization_uuid: z.string().nullish(),
        organization_name: z.string().nullish(),
        organization_type: z.string().nullish(),
        organization_rate_limit_tier: z.string().nullish(),
        user_rate_limit_tier: z.string().nullish(),
        seat_tier: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  }),
)

type BootstrapResponse = z.infer<ReturnType<typeof bootstrapResponseSchema>>

async function fetchBootstrapAPI(): Promise<BootstrapResponse | null> {
  if (isEssentialTrafficOnly()) {
    logForDebugging('[Bootstrap] Skipped: Nonessential traffic disabled')
    return null
  }

  if (getAPIProvider() !== 'firstParty') {
    logForDebugging('[Bootstrap] Skipped: 3P provider')
    return null
  }

  // OAuth preferred (requires user:profile scope — service-key OAuth tokens
  // lack it and would 403). Fall back to API key auth for console users.
  const apiKey = getAnthropicApiKey()
  const hasUsableOAuth =
    getClaudeAIOAuthTokens()?.accessToken && hasProfileScope()
  if (!hasUsableOAuth && !apiKey) {
    logForDebugging('[Bootstrap] Skipped: no usable OAuth or API key')
    return null
  }

  const endpoint = `${getOauthConfig().BASE_API_URL}/api/claude_cli/bootstrap`

  // withOAuth401Retry handles the refresh-and-retry. API key users fail
  // through on 401 (no refresh mechanism — no OAuth token to pass).
  try {
    return await withOAuth401Retry(async () => {
      // Re-read OAuth each call so the retry picks up the refreshed token.
      const token = getClaudeAIOAuthTokens()?.accessToken
      let authHeaders: Record<string, string>
      if (token && hasProfileScope()) {
        authHeaders = {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': OAUTH_BETA_HEADER,
        }
      } else if (apiKey) {
        authHeaders = { 'x-api-key': apiKey }
      } else {
        logForDebugging('[Bootstrap] No auth available on retry, aborting')
        return null
      }

      logForDebugging('[Bootstrap] Fetching')
      const response = await axios.get<unknown>(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': getClaudeCodeUserAgent(),
          ...authHeaders,
        },
        timeout: 5000,
      })
      const parsed = bootstrapResponseSchema().safeParse(response.data)
      if (!parsed.success) {
        logForDebugging(
          `[Bootstrap] Response failed validation: ${parsed.error.message}`,
        )
        return null
      }
      logForDebugging('[Bootstrap] Fetch ok')
      return parsed.data
    })
  } catch (error) {
    logForDebugging(
      `[Bootstrap] Fetch failed: ${axios.isAxiosError(error) ? (error.response?.status ?? error.code) : 'unknown'}`,
    )
    throw error
  }
}

/**
 * Fetch bootstrap data from the API and persist to disk cache.
 */
export async function fetchBootstrapData(): Promise<void> {
  try {
    const response = await fetchBootstrapAPI()
    if (!response) return

    const clientData = response.client_data ?? null
    const additionalModelOptions = response.additional_model_options ?? []
    const additionalModelCosts = response.additional_model_costs ?? {}

    // Only persist if data actually changed — avoids a config write on every startup.
    const config = getGlobalConfig()
    const oauthAccount = mergeBootstrapOAuthAccount(
      config.oauthAccount,
      response.oauth_account,
    )
    if (
      isEqual(config.clientDataCache, clientData) &&
      isEqual(config.additionalModelOptionsCache, additionalModelOptions) &&
      isEqual(config.additionalModelCostsCache, additionalModelCosts) &&
      isEqual(oauthAccount, config.oauthAccount)
    ) {
      logForDebugging('[Bootstrap] Cache unchanged, skipping write')
      return
    }

    logForDebugging('[Bootstrap] Cache updated, persisting to disk')
    saveGlobalConfig(current => ({
      ...current,
      clientDataCache: clientData,
      additionalModelOptionsCache: additionalModelOptions,
      additionalModelCostsCache: additionalModelCosts,
      oauthAccount: mergeBootstrapOAuthAccount(
        current.oauthAccount,
        response.oauth_account,
      ),
    }))
  } catch (error) {
    logError(error)
  }
}
