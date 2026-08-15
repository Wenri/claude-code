import axios from 'axios'
import { toCompatSessionId } from '../../bridge/sessionIdCompat.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { getOAuthHeaders } from '../../utils/teleport/api.js'

type AutofixAction = 'subscribe' | 'unsubscribe'

function responseErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const error = 'error' in data ? data.error : undefined
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return typeof error.message === 'string' ? error.message : null
  }
  return null
}

export async function updateAutofixSubscription(
  action: AutofixAction,
  sessionId: string,
  repo: string,
  prNumber: number,
  baseUrl: string,
  getAccessToken: () => string | undefined,
): Promise<boolean> {
  const accessToken = getAccessToken()
  if (!accessToken) {
    logForDebugging(`[bridge] No access token for ${action}-pr`)
    return false
  }
  const url = `${baseUrl}/v1/code/github/${action}-pr`
  const body = {
    session_id: toCompatSessionId(sessionId),
    repo,
    pr_number: prNumber,
  }
  let response
  try {
    response = await axios.post(url, body, {
      headers: getOAuthHeaders(accessToken),
      timeout: 10_000,
      validateStatus: status => status < 500,
    })
  } catch (cause) {
    logForDebugging(
      `[bridge] ${action}-pr request failed: ${errorMessage(cause)}`,
    )
    return false
  }
  if (!((response.status >= 200 && response.status < 300) || response.status === 409)) {
    const detail = responseErrorMessage(response.data)
    logForDebugging(
      `[bridge] ${action}-pr failed ${response.status}${detail ? `: ${detail}` : ''}`,
    )
    return false
  }
  logForDebugging(`[bridge] ${action}-pr ${repo}#${prNumber} ok`)
  return true
}
