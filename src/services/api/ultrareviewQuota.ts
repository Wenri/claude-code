import axios from 'axios'
import { z } from 'zod'
import { getOauthConfig } from '../../constants/oauth.js'
import { getClaudeAIOAuthTokens } from '../../utils/auth.js'
import { logForDebugging } from '../../utils/debug.js'
import { safeParseJSON } from '../../utils/json.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'
import { getOAuthHeaders, prepareApiRequest } from '../../utils/teleport/api.js'

const ultrareviewPreflightSchema = lazySchema(() =>
  z.object({
    action: z.enum(['proceed', 'confirm', 'blocked']),
    billing_note: z.string().nullable().optional(),
    confirm: z
      .object({
        title: z.string().optional(),
        body: z.string(),
      })
      .nullable()
      .optional(),
    blocked: z
      .object({
        message: z.string(),
        action_url: z.string().nullable(),
        reason: z.string().optional(),
      })
      .nullable()
      .optional(),
  }),
)

export type UltrareviewPreflightResponse = z.infer<
  ReturnType<typeof ultrareviewPreflightSchema>
>

/**
 * Ask the first-party API whether an ultrareview may proceed, requires a
 * billing confirmation, or is blocked. Null is deliberately fail-open so a
 * transient preflight outage does not disable the server-enforced flow.
 */
export async function fetchUltrareviewPreflight(): Promise<UltrareviewPreflightResponse | null> {
  const fixture = process.env.CLAUDE_CODE_ULTRAREVIEW_PREFLIGHT_FIXTURE
  if (fixture) {
    const parsed = ultrareviewPreflightSchema().safeParse(
      safeParseJSON(fixture),
    )
    return parsed.success ? parsed.data : null
  }

  if (isEssentialTrafficOnly()) {
    return {
      action: 'blocked',
      blocked: {
        message:
          'Ultrareview runs in Claude Code on the web and is unavailable when essential-traffic-only mode is active.',
        action_url: null,
        reason: 'zdr',
      },
    }
  }

  if (!getClaudeAIOAuthTokens()?.accessToken) {
    return {
      action: 'blocked',
      blocked: {
        message:
          'Ultrareview requires a Claude.ai account. Run /login to authenticate.',
        action_url: null,
        reason: 'no_oauth_token',
      },
    }
  }

  try {
    const { accessToken, orgUUID } = await prepareApiRequest()
    const response = await axios.get<unknown>(
      `${getOauthConfig().BASE_API_URL}/v1/ultrareview/preflight`,
      {
        headers: {
          ...getOAuthHeaders(accessToken),
          'x-organization-uuid': orgUUID,
        },
        timeout: 5000,
      },
    )
    const parsed = ultrareviewPreflightSchema().safeParse(response.data)
    if (!parsed.success) {
      logForDebugging(
        `fetchUltrareviewPreflight schema mismatch: ${parsed.error.message}`,
      )
      return null
    }
    return parsed.data
  } catch (error) {
    logForDebugging(`fetchUltrareviewPreflight failed: ${error}`)
    return null
  }
}
