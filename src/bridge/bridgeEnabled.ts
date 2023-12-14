import { feature } from 'bun:bundle'
import { getRuntimeCapabilities } from '../bootstrap/state.js'
import { CLAUDE_AI_INFERENCE_SCOPE } from '../constants/oauth.js'
import {
  checkGate_CACHED_OR_BLOCKING,
  getDynamicConfig_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE,
} from '../services/analytics/growthbook.js'
import type { AppState } from '../state/AppStateStore.js'
// Namespace import breaks the bridgeEnabled → auth → config → bridgeEnabled
// cycle — authModule.foo is a live binding, so by the time the helpers below
// call it, auth.js is fully loaded. Previously used require() for the same
// deferral, but require() hits a CJS cache that diverges from the ESM
// namespace after mock.module() (daemon/auth.test.ts), breaking spyOn.
import * as authModule from '../utils/auth.js'
import { isDebugMode } from '../utils/debug.js'
import { getGlobalConfig } from '../utils/config.js'
import { isBareMode, isEnvTruthy } from '../utils/envUtils.js'
import { lt } from '../utils/semver.js'
import { getSessionSettingsCache } from '../utils/settings/settingsCache.js'

/**
 * Runtime check for bridge mode entitlement.
 *
 * Remote Control requires a claude.ai OAuth token carrying inference scope.
 * See github.com/deshaw/anthropic-issues/issues/24.
 *
 * The `feature('BRIDGE_MODE')` guard ensures the GrowthBook string literal
 * is only referenced when bridge mode is enabled at build time.
 */
export function isBridgeEnabled(): boolean {
  // Positive ternary pattern — see docs/feature-gating.md.
  // Negative pattern (if (!feature(...)) return) does not eliminate
  // inline string literals from external builds.
  return feature('BRIDGE_MODE')
    ? hasClaudeAIInferenceScope() &&
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_ccr_bridge', false)
    : false
}

/**
 * Blocking entitlement check for Remote Control.
 *
 * Returns cached `true` immediately (fast path). If the disk cache says
 * `false` or is missing, awaits GrowthBook init and fetches the fresh
 * server value (slow path, max ~5s), then writes it to disk.
 *
 * Use at entitlement gates where a stale `false` would unfairly block access.
 * For user-facing error paths, prefer `getBridgeDisabledReason()` which gives
 * a specific diagnostic. For render-body UI visibility checks, use
 * `isBridgeEnabled()` instead.
 */
export async function isBridgeEnabledBlocking(): Promise<boolean> {
  return feature('BRIDGE_MODE')
    ? hasClaudeAIInferenceScope() &&
        (await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bridge'))
    : false
}

/**
 * Diagnostic message for why Remote Control is unavailable, or null if
 * it's enabled. Call this instead of a bare `isBridgeEnabledBlocking()`
 * check when you need to show the user an actionable error.
 *
 * The GrowthBook gate targets on organizationUUID, which comes from
 * config.oauthAccount — populated by /api/oauth/profile during login.
 * That endpoint requires the user:profile scope. Tokens without it
 * (setup-token, CLAUDE_CODE_OAUTH_TOKEN env var, or pre-scope-expansion
 * logins) leave oauthAccount unpopulated, so the gate falls back to
 * false and users see a dead-end "not enabled" message with no hint
 * that re-login would fix it. See CC-1165 / gh-33105.
 */
export async function getBridgeDisabledReason(): Promise<string | null> {
  if (feature('BRIDGE_MODE')) {
    if (
      isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ||
      getRuntimeCapabilities().workspace === 'remote'
    ) {
      return 'Remote Control is not available inside a remote session.'
    }
    if (!hasClaudeAIInferenceScope()) {
      return 'Remote Control requires a claude.ai subscription. Run `claude auth login` to sign in with your claude.ai account.'
    }
    if (!hasProfileScope()) {
      return 'Remote Control requires a full-scope login token. Long-lived tokens (from `claude setup-token` or CLAUDE_CODE_OAUTH_TOKEN) are limited to inference-only for security reasons. Run `claude auth login` to use Remote Control.'
    }
    if (!getOauthAccountInfo()?.organizationUuid) {
      return 'Unable to determine your organization for Remote Control eligibility. Run `claude auth login` to refresh your account information.'
    }
    if (!(await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bridge'))) {
      return 'Remote Control is not yet enabled for your account.'
    }
    return null
  }
  return 'Remote Control is not available in this build.'
}

export function getBridgeAuthDebugInfo(): string {
  if (!isDebugMode()) return ''
  const set = (value: unknown): 'set' | 'unset' =>
    value ? 'set' : 'unset'

  try {
    const tokens = authModule.getClaudeAIOAuthTokens()
    const thirdPartyEnvs = [
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX',
      'CLAUDE_CODE_USE_FOUNDRY',
      'CLAUDE_CODE_USE_ANTHROPIC_AWS',
      'CLAUDE_CODE_USE_MANTLE',
    ].filter(key => isEnvTruthy(process.env[key]))

    return [
      '',
      '[debug] Remote Control auth state:',
      `  isBareMode=${isBareMode()}`,
      `  hasOAuthAccessToken=${!!tokens?.accessToken}`,
      `  oauthScopes=${tokens?.scopes?.join(',') ?? 'none'}`,
      `  hasClaudeAIInferenceScope=${hasClaudeAIInferenceScope()}`,
      `  hasProfileScope=${hasProfileScope()}`,
      `  oauthAccount.organizationUuid=${set(authModule.getOauthAccountInfo()?.organizationUuid)}`,
      `  ANTHROPIC_API_KEY=${set(process.env.ANTHROPIC_API_KEY)}`,
      `  ANTHROPIC_AUTH_TOKEN=${set(process.env.ANTHROPIC_AUTH_TOKEN)}`,
      `  apiKeyHelper=${authModule.getConfiguredApiKeyHelper() ? 'set' : 'unset'}`,
      `  CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR=${set(process.env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR)}`,
      `  CLAUDE_CODE_OAUTH_TOKEN=${set(process.env.CLAUDE_CODE_OAUTH_TOKEN)}`,
      `  ANTHROPIC_UNIX_SOCKET=${set(process.env.ANTHROPIC_UNIX_SOCKET)}`,
      `  3P env=${thirdPartyEnvs.length ? thirdPartyEnvs.join(',') : 'none'}`,
    ].join('\n')
  } catch (error) {
    return `\n[debug] failed to collect auth state: ${error}`
  }
}

// try/catch: main.tsx:5698 calls isBridgeEnabled() while defining the Commander
// program, before enableConfigs() runs. Pre-config, no OAuth token can exist
// anyway — false is correct. Same swallow getFeatureValue_CACHED_MAY_BE_STALE
// already does at growthbook.ts:775-780.
export function hasClaudeAIInferenceScope(): boolean {
  try {
    return Boolean(
      authModule
        .getClaudeAIOAuthTokens()
        ?.scopes?.includes(CLAUDE_AI_INFERENCE_SCOPE),
    )
  } catch {
    return false
  }
}
function hasProfileScope(): boolean {
  try {
    return authModule.hasProfileScope()
  } catch {
    return false
  }
}
function getOauthAccountInfo(): ReturnType<
  typeof authModule.getOauthAccountInfo
> {
  try {
    return authModule.getOauthAccountInfo()
  } catch {
    return undefined
  }
}

function getAutoUploadSessions(): boolean | undefined {
  try {
    return (
      getSessionSettingsCache()?.settings.autoUploadSessions ??
      getGlobalConfig().autoUploadSessions
    )
  } catch {
    return undefined
  }
}

/**
 * Kill-switch for the `cse_*` → `session_*` client-side retag shim.
 *
 * The shim exists because compat/convert.go:27 validates TagSession and the
 * claude.ai frontend routes on `session_*`, while v2 worker endpoints hand out
 * `cse_*`. Once the server tags by environment_kind and the frontend accepts
 * `cse_*` directly, flip this to false to make toCompatSessionId a no-op.
 * Defaults to true — the shim stays active until explicitly disabled.
 */
export function isCseShimEnabled(): boolean {
  return feature('BRIDGE_MODE')
    ? getFeatureValue_CACHED_MAY_BE_STALE(
        'tengu_bridge_repl_v2_cse_shim_enabled',
        true,
      )
    : true
}

/**
 * Returns an error message if the current CLI version is below the
 * minimum required for the v1 (env-based) Remote Control path, or null if the
 * version is fine. The v2 (env-less) path uses checkEnvLessBridgeMinVersion()
 * in envLessBridgeConfig.ts instead — the two implementations have independent
 * version floors.
 *
 * Uses cached (non-blocking) GrowthBook config. If GrowthBook hasn't
 * loaded yet, the default '0.0.0' means the check passes — a safe fallback.
 */
export function checkBridgeMinVersion(): string | null {
  // Positive pattern — see docs/feature-gating.md.
  // Negative pattern (if (!feature(...)) return) does not eliminate
  // inline string literals from external builds.
  if (feature('BRIDGE_MODE')) {
    const config = getDynamicConfig_CACHED_MAY_BE_STALE<{
      minVersion: string
    }>('tengu_bridge_min_version', { minVersion: '0.0.0' })
    if (config.minVersion && lt(MACRO.VERSION, config.minVersion)) {
      return `Your version of Claude Code (${MACRO.VERSION}) is too old for Remote Control.\nVersion ${config.minVersion} or higher is required. Run \`claude update\` to update.`
    }
  }
  return null
}

/**
 * Default for remoteControlAtStartup when the user hasn't explicitly set it.
 * When the CCR_AUTO_CONNECT build flag is present (ant-only) and the
 * tengu_cobalt_harbor GrowthBook gate is on, all sessions connect to CCR by
 * default — the user can still opt out by setting remoteControlAtStartup=false
 * in config (explicit settings always win over this default).
 *
 * Defined here rather than in config.ts to avoid a direct
 * config.ts → growthbook.ts import cycle (growthbook.ts → user.ts → config.ts).
 */
export function getCcrAutoConnectDefault(): boolean {
  return feature('CCR_AUTO_CONNECT')
    ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_harbor', false)
    : false
}

/**
 * Opt-in CCR mirror mode — every local session spawns an outbound-only
 * Remote Control session that receives forwarded events. Separate from
 * getCcrAutoConnectDefault (bidirectional Remote Control). Env var wins for
 * local opt-in; GrowthBook controls rollout.
 */
export function isCcrMirrorEnabled(): boolean {
  if (!feature('CCR_MIRROR')) return false
  if (isEnvTruthy(process.env.CLAUDE_CODE_CCR_MIRROR)) return true

  const configured = getAutoUploadSessions()
  if (configured !== undefined) return configured

  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_ccr_mirror', false)
}

export function applyRemoteControlToAppState(
  state: AppState,
  enabled: boolean,
): AppState {
  if (state.replBridgeOutboundOnly && !enabled) return state
  if (state.replBridgeEnabled === enabled && !state.replBridgeOutboundOnly) {
    return state
  }
  return {
    ...state,
    replBridgeEnabled: enabled,
    replBridgeOutboundOnly: false,
  }
}

export function applyAutoUploadSessionsToAppState(
  state: AppState,
  enabled: boolean,
): AppState {
  if (state.replBridgeEnabled && !state.replBridgeOutboundOnly) return state
  if (
    state.replBridgeEnabled === enabled &&
    state.replBridgeOutboundOnly === enabled
  ) {
    return state
  }
  return {
    ...state,
    replBridgeEnabled: enabled,
    replBridgeOutboundOnly: enabled,
  }
}
