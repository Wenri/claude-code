import axios from 'axios'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { toCompatSessionId } from './sessionIdCompat.js'

const ANTHROPIC_VERSION = '2023-06-01'
const CCR_BETA = 'ccr-byoc-2025-07-29'
const SUBSCRIPTION_TIMEOUT_MS = 10_000

type SubscriptionAction = 'subscribe' | 'unsubscribe'

function getErrorResponseMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  if ('message' in value && typeof value.message === 'string') {
    return value.message
  }
  if (
    'error' in value &&
    value.error !== null &&
    typeof value.error === 'object' &&
    'message' in value.error &&
    typeof value.error.message === 'string'
  ) {
    return value.error.message
  }
  return undefined
}

function getSubscriptionHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION,
    'anthropic-beta': CCR_BETA,
  }
}

export async function updatePullRequestSubscription(
  action: SubscriptionAction,
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
  let response
  try {
    response = await axios.post(
      url,
      {
        session_id: toCompatSessionId(sessionId),
        repo,
        pr_number: prNumber,
      },
      {
        headers: getSubscriptionHeaders(accessToken),
        timeout: SUBSCRIPTION_TIMEOUT_MS,
        validateStatus: status => status < 500,
      },
    )
  } catch (error) {
    logForDebugging(
      `[bridge] ${action}-pr request failed: ${errorMessage(error)}`,
    )
    return false
  }

  if (
    !(
      (response.status >= 200 && response.status < 300) ||
      response.status === 409
    )
  ) {
    const message = getErrorResponseMessage(response.data)
    logForDebugging(
      `[bridge] ${action}-pr failed ${response.status}${message ? `: ${message}` : ''}`,
    )
    return false
  }

  logForDebugging(`[bridge] ${action}-pr ${repo}#${prNumber} ok`)
  return true
}

export async function updateSlackThreadSubscription(
  action: SubscriptionAction,
  sessionId: string,
  channel: string,
  threadTs: string,
  baseUrl: string,
  getAccessToken: () => string | undefined,
): Promise<boolean> {
  const accessToken = getAccessToken()
  if (!accessToken) {
    logForDebugging(`[bridge] No access token for ${action}-thread`)
    return false
  }

  const url = `${baseUrl}/v1/code/slack/${action}-thread`
  let response
  try {
    response = await axios.post(
      url,
      {
        session_id: toCompatSessionId(sessionId),
        channel,
        thread_ts: threadTs,
      },
      {
        headers: getSubscriptionHeaders(accessToken),
        timeout: SUBSCRIPTION_TIMEOUT_MS,
        validateStatus: status => status < 500,
      },
    )
  } catch (error) {
    logForDebugging(
      `[bridge] ${action}-thread request failed: ${errorMessage(error)}`,
    )
    return false
  }

  if (
    !(
      (response.status >= 200 && response.status < 300) ||
      response.status === 409
    )
  ) {
    const message = getErrorResponseMessage(response.data)
    logForDebugging(
      `[bridge] ${action}-thread failed ${response.status}${message ? `: ${message}` : ''}`,
    )
    return false
  }

  logForDebugging(`[bridge] ${action}-thread ${channel}/${threadTs} ok`)
  return true
}
