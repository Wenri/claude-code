import axios from 'axios'
import { getOauthConfig, OAUTH_BETA_HEADER } from '../constants/oauth.js'
import { createStore } from '../state/store.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
} from '../utils/auth.js'
import { getGlobalConfig } from '../utils/config.js'
import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
import { classifyAxiosError } from '../utils/errors.js'
import { isEssentialTrafficOnly } from '../utils/privacyLevel.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { createSignal } from '../utils/signal.js'
import { getClaudeCodeUserAgent } from '../utils/userAgent.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from './analytics/growthbook.js'
import { logEvent } from './analytics/index.js'

const NOTIFICATION_PREFERENCES_TIMEOUT_MS = 10_000

type NotificationPreferenceValues = {
  agentPushNotifEnabled?: boolean
  inputNeededNotifEnabled?: boolean
}

type FeaturePreference = {
  bogosort?: { enable_push?: boolean }
  code_requires_action?: { enable_push?: boolean }
}

export type PushReachability = {
  has_active_channel: boolean
  platforms: unknown[]
}

type NotificationPreferencesResponse = {
  preferences: {
    feature_preference?: FeaturePreference
  }
  push_reachability?: PushReachability | null
}

const pushReachabilityStore = createStore<
  PushReachability | null | undefined
>(undefined)
const notificationPreferencesHydrated = createSignal()

export const getPushReachability = pushReachabilityStore.getState
export const subscribeToPushReachability = pushReachabilityStore.subscribe
export const subscribeToNotificationPreferencesHydration =
  notificationPreferencesHydrated.subscribe

export function isKairosPushNotificationsEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_kairos_push_notifications',
    false,
  )
}

export function isInputNeededPushEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_kairos_input_needed_push',
    false,
  )
}

function getEffectivePreferenceValues(): NotificationPreferenceValues {
  const settings = getInitialSettings()
  const config = getGlobalConfig()
  return {
    agentPushNotifEnabled:
      settings.agentPushNotifEnabled ?? config.agentPushNotifEnabled,
    inputNeededNotifEnabled:
      settings.inputNeededNotifEnabled ?? config.inputNeededNotifEnabled,
  }
}

function getNotificationPreferencesEndpoint(): string {
  return `${getOauthConfig().BASE_API_URL}/api/claude_code/notification/preferences`
}

function getNotificationPreferencesHeaders(): Record<string, string> | null {
  if (isEssentialTrafficOnly()) return null
  const tokens = getClaudeAIOAuthTokens()
  if (!tokens?.accessToken) return null
  return {
    Authorization: `Bearer ${tokens.accessToken}`,
    'anthropic-beta': OAUTH_BETA_HEADER,
    'User-Agent': getClaudeCodeUserAgent(),
  }
}

async function fetchNotificationPreferences(): Promise<NotificationPreferencesResponse | null> {
  try {
    await checkAndRefreshOAuthTokenIfNeeded()
    const headers = getNotificationPreferencesHeaders()
    if (!headers) return null
    const response = await axios.get<NotificationPreferencesResponse>(
      getNotificationPreferencesEndpoint(),
      { headers, timeout: NOTIFICATION_PREFERENCES_TIMEOUT_MS },
    )
    return response.data
  } catch (error) {
    const { kind } = classifyAxiosError(error)
    logForDiagnosticsNoPII('warn', 'notif_prefs_fetch_failed', { kind })
    return null
  }
}

async function patchNotificationPreferences(
  featurePreference: FeaturePreference,
): Promise<void> {
  try {
    await checkAndRefreshOAuthTokenIfNeeded()
    const headers = getNotificationPreferencesHeaders()
    if (!headers) return
    await axios.patch(
      getNotificationPreferencesEndpoint(),
      { preferences: { feature_preference: featurePreference } },
      { headers, timeout: NOTIFICATION_PREFERENCES_TIMEOUT_MS },
    )
    logForDiagnosticsNoPII('info', 'notif_prefs_patch_ok')
  } catch (error) {
    const { kind } = classifyAxiosError(error)
    logForDiagnosticsNoPII('warn', 'notif_prefs_patch_failed', { kind })
  }
}

function toFeaturePreference(
  values: NotificationPreferenceValues,
): FeaturePreference {
  const featurePreference: FeaturePreference = {}
  if (typeof values.agentPushNotifEnabled === 'boolean') {
    featurePreference.bogosort = {
      enable_push: values.agentPushNotifEnabled,
    }
  }
  if (typeof values.inputNeededNotifEnabled === 'boolean') {
    featurePreference.code_requires_action = {
      enable_push: values.inputNeededNotifEnabled,
    }
  }
  return featurePreference
}

export function syncNotificationPreferences(): void {
  const featurePreference = toFeaturePreference(getEffectivePreferenceValues())
  if (Object.keys(featurePreference).length === 0) return
  void patchNotificationPreferences(featurePreference)
}

export function syncNotificationPreferenceValues(
  values: NotificationPreferenceValues,
): void {
  const featurePreference = toFeaturePreference(values)
  if (Object.keys(featurePreference).length === 0) return
  void patchNotificationPreferences(featurePreference)
}

export async function hydrateNotificationPreferences(): Promise<void> {
  const response = await fetchNotificationPreferences()
  if (!response) {
    pushReachabilityStore.setState(() => null)
    logForDiagnosticsNoPII('info', 'notif_prefs_hydrate_skipped', {
      reason: 'fetch_failed_or_no_auth',
    })
    return
  }

  const reachability = response.push_reachability ?? null
  pushReachabilityStore.setState(() => reachability)
  if (reachability) {
    logEvent('tengu_push_reachability', {
      has_active_channel: reachability.has_active_channel,
      platform_count: reachability.platforms.length,
    })
  }

  const featurePreference = response.preferences.feature_preference
  const serverAgentPush = featurePreference?.bogosort?.enable_push
  const serverInputNeeded =
    featurePreference?.code_requires_action?.enable_push
  const effective = getEffectivePreferenceValues()
  const settingsToSeed: NotificationPreferenceValues = {}

  if (
    effective.agentPushNotifEnabled === undefined &&
    typeof serverAgentPush === 'boolean'
  ) {
    settingsToSeed.agentPushNotifEnabled = serverAgentPush
  }
  if (
    effective.inputNeededNotifEnabled === undefined &&
    typeof serverInputNeeded === 'boolean'
  ) {
    settingsToSeed.inputNeededNotifEnabled = serverInputNeeded
  }

  logForDiagnosticsNoPII('info', 'notif_prefs_hydrate_result', {
    has_active_channel: reachability?.has_active_channel,
    server_bogosort: serverAgentPush,
    server_code_requires_action: serverInputNeeded,
    seeded: Object.keys(settingsToSeed).length > 0,
  })

  if (Object.keys(settingsToSeed).length === 0) return
  updateSettingsForSource('userSettings', settingsToSeed)
  notificationPreferencesHydrated.emit()
}
