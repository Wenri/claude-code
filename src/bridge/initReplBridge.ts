/**
 * REPL-specific wrapper around initBridgeCore. Owns the parts that read
 * bootstrap state — gates, cwd, session ID, git context, OAuth, title
 * derivation — then delegates to the bootstrap-free core.
 *
 * Split out of replBridge.ts because the sessionStorage import
 * (getCurrentSessionTitle) transitively pulls in src/commands.ts → the
 * entire slash command + React component tree (~1300 modules). Keeping
 * initBridgeCore in a file that doesn't touch sessionStorage lets
 * daemonBridge.ts import the core without bloating the Agent SDK bundle.
 *
 * Called via dynamic import by useReplBridge (auto-start) and print.ts
 * (SDK -p mode via query.enableRemoteControl).
 */

import type { UUID } from 'crypto'
import { getSessionId } from '../bootstrap/state.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { SDKControlResponse } from '../entrypoints/sdk/controlTypes.js'
import { generateFileSuggestions } from '../hooks/fileSuggestions.js'
import {
  hydrateNotificationPreferences,
  isKairosPushNotificationsEnabled,
} from '../services/notificationPreferences.js'
import { getOrganizationUUID } from '../services/oauth/client.js'
import {
  isPolicyAllowed,
  waitForPolicyLimitsToLoad,
} from '../services/policyLimits/index.js'
import type { Message } from '../types/message.js'
import { getEmptyToolPermissionContext, type ToolPermissionContext } from '../Tool.js'
import { AGENT_COLORS } from '../tools/AgentTool/agentColorManager.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  handleOAuth401Error,
} from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { stripDisplayTagsAllowEmpty } from '../utils/displayTags.js'
import { errorMessage } from '../utils/errors.js'
import { isEssentialTrafficOnly } from '../utils/privacyLevel.js'
import { getBranch, getRemoteUrl } from '../utils/git.js'
import { toSDKMessages } from '../utils/messages/mappers.js'
import {
  getContentText,
  getMessagesAfterCompactBoundary,
  isSyntheticMessage,
} from '../utils/messages.js'
import type { PermissionMode } from '../utils/permissions/PermissionMode.js'
import {
  clearInternalEventWriter,
  getCurrentSessionAgentColor,
  getCurrentSessionAiTitle,
  getCurrentSessionTitle,
  listSubagentIdsFromDisk,
  saveCustomTitle,
  setInternalEventReader,
  setInternalEventWriter,
} from '../utils/sessionStorage.js'
import {
  extractConversationText,
  generateSessionTitle,
} from '../utils/sessionTitle.js'
import { generateShortWordSlug } from '../utils/words.js'
import {
  getBridgeAccessToken,
  getBridgeBaseUrl,
  getBridgeSessionNamePrefix,
  getBridgeTokenOverride,
} from './bridgeConfig.js'
import {
  cleanupBridgeClientPresence,
  setupBridgeClientPresence,
} from './clientPresence.js'
import {
  isBridgeEnabledBlocking,
  isCseShimEnabled,
} from './bridgeEnabled.js'
import {
  getBridgeSession,
  updateBridgeSessionTitle,
  updateBridgeSessionColorTag,
} from './createSession.js'
import { logBridgeSkip } from './debugUtils.js'
import { checkEnvLessBridgeMinVersion } from './envLessBridgeConfig.js'
import { readFileForRemote } from './readFileForRemote.js'
import type { BridgeState, ReplBridgeHandle } from './replBridge.js'
import type {
  InternalEventReaders,
  InternalEventWriter,
} from './replBridgeTransport.js'
import { syncLocalTranscriptEvents } from './sessionPersistenceSync.js'
import { setCseShimGate, toCompatSessionId } from './sessionIdCompat.js'

export type InitBridgeOptions = {
  onInboundMessage?: (msg: SDKMessage) => void | Promise<void>
  onPermissionResponse?: (response: SDKControlResponse) => void
  onInterrupt?: () => void
  onSetModel?: (model: string | undefined) => void
  onSetMaxThinkingTokens?: (maxTokens: number | null) => void
  onSetPermissionMode?: (
    mode: PermissionMode,
  ) => { ok: true } | { ok: false; error: string }
  onSetColor?: (
    color: string,
  ) => { ok: true } | { ok: false; error: string }
  onStateChange?: (state: BridgeState, detail?: string) => void
  initialMessages?: Message[]
  // Explicit session name from `/remote-control <name>`. When set, overrides
  // the title derived from the conversation or /rename.
  initialName?: string
  // Fresh view of the full conversation at call time. Used by onUserMessage's
  // count-3 derivation to call generateSessionTitle over the full conversation.
  // Optional — print.ts's SDK enableRemoteControl path has no REPL message
  // array; count-3 falls back to the single message text when absent.
  getMessages?: () => Message[]
  getToolPermissionContext?: () => ToolPermissionContext
  onMcpAuthenticate?: (
    serverName: string,
    redirectUri?: string,
  ) => Promise<unknown>
  onMcpOauthCallbackUrl?: (
    serverName: string,
    callbackUrl: string,
  ) => Promise<unknown>
  onMcpReconnect?: (serverName: string) => Promise<unknown>
  onMcpStatus?: () => unknown[]
  /**
   * When true, the bridge only forwards events outbound (no SSE inbound
   * stream). Used by CCR mirror mode — local sessions visible on claude.ai
   * without enabling inbound control.
   */
  outboundOnly?: boolean
  tags?: string[]
  enableSessionPersistence?: boolean
}

export async function initReplBridge(
  options?: InitBridgeOptions,
): Promise<ReplBridgeHandle | null> {
  const {
    onInboundMessage,
    onPermissionResponse,
    onInterrupt,
    onSetModel,
    onSetMaxThinkingTokens,
    onSetPermissionMode,
    onSetColor,
    onStateChange,
    initialMessages,
    getMessages,
    initialName,
    outboundOnly,
    tags,
    getToolPermissionContext,
    onMcpAuthenticate,
    onMcpOauthCallbackUrl,
    onMcpReconnect,
    onMcpStatus,
    enableSessionPersistence,
  } = options ?? {}

  // /update hands the active Remote Control session to the replacement
  // process. Consume these once so child processes and later re-inits cannot
  // accidentally attach a second bridge to the same server session.
  const reattachSessionId = process.env.CLAUDE_BRIDGE_REATTACH_SESSION
  const reattachSequenceRaw = process.env.CLAUDE_BRIDGE_REATTACH_SEQ
  if (reattachSessionId) {
    delete process.env.CLAUDE_BRIDGE_REATTACH_SESSION
    delete process.env.CLAUDE_BRIDGE_REATTACH_SEQ
  }
  const reattachSequenceNum = reattachSequenceRaw
    ? Number.parseInt(reattachSequenceRaw, 10) || undefined
    : undefined

  // Wire the cse_ shim kill switch so toCompatSessionId respects the
  // GrowthBook gate. Daemon/SDK paths skip this — shim defaults to active.
  setCseShimGate(isCseShimEnabled)

  let persistenceGeneration = 0
  const persistenceCallbacks = {
    onTransportPersistenceReady: (
      writer: InternalEventWriter,
      readers: InternalEventReaders,
    ): void => {
      const generation = ++persistenceGeneration
      void (async () => {
        try {
          const agentIds = await listSubagentIdsFromDisk()
          await syncLocalTranscriptEvents(writer, readers, agentIds)
        } catch (error) {
          logForDebugging(
            `[bridge:repl] Persistence sync failed: ${errorMessage(error)}`,
            { level: 'error' },
          )
        }
        if (generation !== persistenceGeneration) {
          logForDebugging(
            '[bridge:repl] Transport torn down during sync — skipping writer install',
          )
          return
        }
        setInternalEventWriter(writer)
        setInternalEventReader(readers.readMain, readers.readSubagents)
        logForDebugging(
          '[bridge:repl] Session persistence enabled — transcript writer + hydrate readers registered',
        )
      })()
    },
    onTransportPersistenceTeardown: (): void => {
      persistenceGeneration++
      clearInternalEventWriter()
    },
  }

  // 1. Runtime gate
  if (!(await isBridgeEnabledBlocking())) {
    logBridgeSkip('not_enabled', '[bridge:repl] Skipping: bridge not enabled')
    return null
  }

  // 1b. Minimum version check — deferred to after the v1/v2 branch below,
  // since each implementation has its own floor (tengu_bridge_min_version
  // for v1, tengu_bridge_repl_v2_config.min_version for v2).

  // 2. Check OAuth — must be signed in with claude.ai. Runs before the
  // policy check so console-auth users get the actionable "/login" hint
  // instead of a misleading policy error from a stale/wrong-org cache.
  if (!getBridgeAccessToken()) {
    logBridgeSkip('no_oauth', '[bridge:repl] Skipping: no OAuth tokens')
    onStateChange?.('failed', '/login')
    return null
  }

  // 3. Check organization policy — remote control may be disabled
  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_control')) {
    logBridgeSkip(
      'policy_denied',
      '[bridge:repl] Skipping: allow_remote_control policy not allowed',
    )
    onStateChange?.('failed', "disabled by your organization's policy")
    return null
  }

  if (outboundOnly && !isPolicyAllowed('allow_remote_sessions')) {
    logBridgeSkip(
      'policy_denied',
      '[bridge:repl] Skipping mirror: allow_remote_sessions policy not allowed',
    )
    onStateChange?.('failed', "disabled by your organization's policy")
    return null
  }

  // When CLAUDE_BRIDGE_OAUTH_TOKEN is set (ant-only local dev), the bridge
  // uses that token directly via getBridgeAccessToken() — keychain state is
  // irrelevant. Skip 2b/2c to preserve that decoupling: an expired keychain
  // token shouldn't block a bridge connection that doesn't use it.
  if (!getBridgeTokenOverride()) {
    // 2a. Cross-process backoff. If N prior processes already saw this exact
    // dead token (matched by expiresAt), skip silently — no event, no refresh
    // attempt. The count threshold tolerates transient refresh failures (auth
    // server 5xx, lockfile errors per auth.ts:1437/1444/1485): each process
    // independently retries until 3 consecutive failures prove the token dead.
    // Mirrors useReplBridge's MAX_CONSECUTIVE_INIT_FAILURES for in-process.
    // The expiresAt key is content-addressed: /login → new token → new expiresAt
    // → this stops matching without any explicit clear.
    const cfg = getGlobalConfig()
    if (
      cfg.bridgeOauthDeadExpiresAt != null &&
      (cfg.bridgeOauthDeadFailCount ?? 0) >= 3 &&
      getClaudeAIOAuthTokens()?.expiresAt === cfg.bridgeOauthDeadExpiresAt
    ) {
      logForDebugging(
        `[bridge:repl] Skipping: cross-process backoff (dead token seen ${cfg.bridgeOauthDeadFailCount} times)`,
      )
      return null
    }

    // 2b. Proactively refresh if expired. Mirrors bridgeMain.ts:2096 — the REPL
    // bridge fires at useEffect mount BEFORE any v1/messages call, making this
    // usually the first OAuth request of the session. Without this, ~9% of
    // registrations hit the server with a >8h-expired token → 401 → withOAuthRetry
    // recovers, but the server logs a 401 we can avoid. VPN egress IPs observed
    // at 30:1 401:200 when many unrelated users cluster at the 8h TTL boundary.
    //
    // Fresh-token cost: one memoized read + one Date.now() comparison (~µs).
    // checkAndRefreshOAuthTokenIfNeeded clears its own cache in every path that
    // touches the keychain (refresh success, lockfile race, throw), so no
    // explicit clearOAuthTokenCache() here — that would force a blocking
    // keychain spawn on the 91%+ fresh-token path.
    await checkAndRefreshOAuthTokenIfNeeded()

    // 2c. Skip if token is still expired post-refresh-attempt. Env-var / FD
    // tokens (auth.ts:894-917) have expiresAt=null → never trip this. But a
    // keychain token whose refresh token is dead (password change, org left,
    // token GC'd) has expiresAt<now AND refresh just failed — the client would
    // otherwise loop 401 forever: withOAuthRetry → handleOAuth401Error →
    // refresh fails again → retry with same stale token → 401 again.
    // Datadog 2026-03-08: single IPs generating 2,879 such 401s/day. Skip the
    // guaranteed-fail API call; useReplBridge surfaces the failure.
    //
    // Intentionally NOT using isOAuthTokenExpired here — that has a 5-minute
    // proactive-refresh buffer, which is the right heuristic for "should
    // refresh soon" but wrong for "provably unusable". A token with 3min left
    // + transient refresh endpoint blip (5xx/timeout/wifi-reconnect) would
    // falsely trip a buffered check; the still-valid token would connect fine.
    // Check actual expiry instead: past-expiry AND refresh-failed → truly dead.
    const tokens = getClaudeAIOAuthTokens()
    if (tokens && tokens.expiresAt !== null && tokens.expiresAt <= Date.now()) {
      logBridgeSkip(
        'oauth_expired_unrefreshable',
        '[bridge:repl] Skipping: OAuth token expired and refresh failed (re-login required)',
      )
      onStateChange?.('failed', '/login')
      // Persist for the next process. Increments failCount when re-discovering
      // the same dead token (matched by expiresAt); resets to 1 for a different
      // token. Once count reaches 3, step 2a's early-return fires and this path
      // is never reached again — writes are capped at 3 per dead token.
      // Local const captures the narrowed type (closure loses !==null narrowing).
      const deadExpiresAt = tokens.expiresAt
      saveGlobalConfig(c => ({
        ...c,
        bridgeOauthDeadExpiresAt: deadExpiresAt,
        bridgeOauthDeadFailCount:
          c.bridgeOauthDeadExpiresAt === deadExpiresAt
            ? (c.bridgeOauthDeadFailCount ?? 0) + 1
            : 1,
      }))
      return null
    }
  }

  // 4. Compute baseUrl — needed by both v1 (env-based) and v2 (env-less)
  // paths. Hoisted above the v2 gate so both can use it.
  const baseUrl = getBridgeBaseUrl()

  // 5. Derive session title. Precedence: explicit initialName → /rename
  // → cached AI title → last meaningful user message → generated slug.
  // Cosmetic only (claude.ai session list); the model never sees it.
  // Two flags: `hasExplicitTitle` (initialName or /rename — never auto-
  // overwrite) vs. `hasTitle` (any title, including auto-derived — blocks
  // the count-1 re-derivation but not count-3). The onUserMessage callback
  // (wired to both v1 and v2 below) derives from the 1st prompt and again
  // from the 3rd so mobile/web show a title that reflects more context.
  // The slug fallback (e.g. "myhost-graceful-unicorn") makes
  // auto-started sessions distinguishable in the claude.ai list before the
  // first prompt.
  let title = `${getBridgeSessionNamePrefix()}-${generateShortWordSlug()}`
  let hasTitle = false
  let hasExplicitTitle = false
  if (initialName) {
    title = initialName
    hasTitle = true
    hasExplicitTitle = true
  } else {
    const sessionId = getSessionId()
    const customTitle = sessionId
      ? getCurrentSessionTitle(sessionId)
      : undefined
    const aiTitle = sessionId
      ? getCurrentSessionAiTitle(sessionId)
      : undefined
    if (customTitle) {
      title = customTitle
      hasTitle = true
      hasExplicitTitle = true
    } else if (aiTitle) {
      title = aiTitle
      hasTitle = true
    } else if (initialMessages && initialMessages.length > 0) {
      // Find the last user message that has meaningful content. Skip meta
      // (nudges), tool results, compact summaries ("This session is being
      // continued…"), non-human origins (task notifications, channel pushes),
      // and synthetic interrupts ([Request interrupted by user]) — none are
      // human-authored. Same filter as extractTitleText + isSyntheticMessage.
      for (let i = initialMessages.length - 1; i >= 0; i--) {
        const msg = initialMessages[i]!
        if (
          msg.type !== 'user' ||
          msg.isMeta ||
          msg.toolUseResult ||
          msg.isCompactSummary ||
          (msg.origin && msg.origin.kind !== 'human') ||
          isSyntheticMessage(msg)
        )
          continue
        const rawContent = getContentText(msg.message.content)
        if (!rawContent) continue
        const derived = deriveTitle(rawContent)
        if (!derived) continue
        title = derived
        hasTitle = true
        break
      }
    }
  }

  // Shared by both v1 and v2 — fires on every title-worthy user message until
  // it returns true. At count 1: deriveTitle placeholder immediately, then
  // generateSessionTitle (Haiku, sentence-case) fire-and-forget upgrade. At
  // count 3: re-generate over the full conversation. Skips entirely if the
  // title is explicit (/remote-control <name> or /rename) — re-checks
  // sessionStorage at call time so /rename between messages isn't clobbered.
  // Skips count 1 if initialMessages already derived (that title is fresh);
  // still refreshes at count 3. v2 passes cse_*; updateBridgeSessionTitle
  // retags internally.
  let userMessageCount = 0
  let lastBridgeSessionId: string | undefined
  let genSeq = 0
  let serverTitleSessionId: string | undefined
  const locallyGeneratedTitles = new Set([title])
  const onRenameSession = (
    requestedTitle: string,
  ): { ok: true } | { ok: false; error: string } => {
    const trimmedTitle = requestedTitle.trim()
    if (!trimmedTitle) {
      return { ok: false, error: 'title must be non-empty' }
    }
    title = trimmedTitle
    hasTitle = true
    hasExplicitTitle = true
    locallyGeneratedTitles.add(trimmedTitle)
    void saveCustomTitle(
      getSessionId() as UUID,
      trimmedTitle,
      undefined,
      'remote',
    )
    return { ok: true }
  }
  const patch = (
    derived: string,
    bridgeSessionId: string,
    atCount: number,
  ): void => {
    hasTitle = true
    title = derived
    locallyGeneratedTitles.add(derived)
    logForDebugging(
      `[bridge:repl] derived title from message ${atCount}: ${derived}`,
    )
    void updateBridgeSessionTitle(bridgeSessionId, derived, {
      baseUrl,
      getAccessToken: getBridgeAccessToken,
    }).catch(() => {})
  }
  // Fire-and-forget Haiku generation with post-await guards. Re-checks /rename
  // (sessionStorage), v1 env-lost (lastBridgeSessionId), and same-session
  // out-of-order resolution (genSeq — count-1's Haiku resolving after count-3
  // would clobber the richer title). generateSessionTitle never rejects.
  const generateAndPatch = (input: string, bridgeSessionId: string): void => {
    const gen = ++genSeq
    const atCount = userMessageCount
    void generateSessionTitle(input, AbortSignal.timeout(15_000)).then(
      async generated => {
        const isStale = (): boolean =>
          gen !== genSeq ||
          lastBridgeSessionId !== bridgeSessionId ||
          Boolean(getCurrentSessionTitle(getSessionId()))
        if (!generated || isStale()) return
        const session = await getBridgeSession(bridgeSessionId, {
          baseUrl,
          getAccessToken: getBridgeAccessToken,
        }).catch(() => null)
        if (isStale()) return
        if (
          session?.title &&
          !locallyGeneratedTitles.has(session.title)
        ) {
          serverTitleSessionId = bridgeSessionId
          return
        }
        patch(generated, bridgeSessionId, atCount)
      },
    )
  }
  const onUserMessage = (text: string, bridgeSessionId: string): boolean => {
    if (
      hasExplicitTitle ||
      serverTitleSessionId === bridgeSessionId ||
      getCurrentSessionTitle(getSessionId())
    ) {
      return true
    }
    // v1 env-lost re-creates the session with a new ID. Reset the count so
    // the new session gets its own count-3 derivation; hasTitle stays true
    // (new session was created via getCurrentTitle(), which reads the count-1
    // title from this closure), so count-1 of the fresh cycle correctly skips.
    if (
      lastBridgeSessionId !== undefined &&
      lastBridgeSessionId !== bridgeSessionId
    ) {
      userMessageCount = 0
    }
    lastBridgeSessionId = bridgeSessionId
    userMessageCount++
    if (userMessageCount === 1 && !hasTitle) {
      const placeholder = deriveTitle(text)
      if (placeholder) patch(placeholder, bridgeSessionId, userMessageCount)
      generateAndPatch(text, bridgeSessionId)
    } else if (userMessageCount === 3) {
      const msgs = getMessages?.()
      const input = msgs
        ? extractConversationText(getMessagesAfterCompactBoundary(msgs))
        : text
      generateAndPatch(input, bridgeSessionId)
    }
    // Also re-latches if v1 env-lost resets the transport's done flag past 3.
    return userMessageCount >= 3
  }

  const onFileSuggestions = async (
    query: string,
  ): Promise<Array<{ path: string; score?: number }>> =>
    (await generateFileSuggestions(query, true)).map(suggestion => ({
      path: suggestion.displayText,
    }))

  const initialHistoryCap = 200

  // Fetch orgUUID before the v1/v2 branch — both paths need it. v1 for
  // environment registration; v2 for archive (which lives at the compat
  // /v1/sessions/{id}/archive, not /v1/code/sessions). Without it, v2
  // archive 404s and sessions stay alive in CCR after /exit.
  const orgUUID = await getOrganizationUUID()
  if (!orgUUID) {
    logBridgeSkip('no_org_uuid', '[bridge:repl] Skipping: no org UUID')
    onStateChange?.('failed', '/login')
    return null
  }

  const versionError = await checkEnvLessBridgeMinVersion()
  if (versionError) {
    logBridgeSkip(
      'version_too_old',
      `[bridge:repl] Skipping: ${versionError}`,
      true,
    )
    onStateChange?.('failed', 'run `claude update` to upgrade')
    return null
  }

  const branch = await getBranch()
  const gitRepoUrl = await getRemoteUrl()
  const { initEnvLessBridgeCore } = await import('./remoteBridgeCore.js')
  const handle = await initEnvLessBridgeCore({
    reattachSessionId,
    reattachSequenceNum,
    baseUrl,
    orgUUID,
    title,
    getAccessToken: getBridgeAccessToken,
    onAuth401: handleOAuth401Error,
    onProactiveRefresh: async () => {
      await checkAndRefreshOAuthTokenIfNeeded()
    },
    toSDKMessages,
    initialHistoryCap,
    initialMessages,
    branch,
    gitRepoUrl,
    onUserMessage,
    onSessionEstablished: sessionId => {
      setupBridgeClientPresence(
        toCompatSessionId(sessionId),
        baseUrl,
        () => {
          const token = getBridgeAccessToken()
          return token ? { Authorization: `Bearer ${token}` } : {}
        },
      )
      if (isKairosPushNotificationsEnabled() && !isEssentialTrafficOnly()) {
        void hydrateNotificationPreferences()
      }
      const color = getCurrentSessionAgentColor()
      if (color && color !== 'default') {
        void updateBridgeSessionColorTag(sessionId, color, AGENT_COLORS, {
          baseUrl,
          getAccessToken: getBridgeAccessToken,
        })
      }
    },
    onInboundMessage,
    onPermissionResponse,
    onInterrupt,
    onSetModel,
    onSetMaxThinkingTokens,
    onSetPermissionMode,
    onRenameSession,
    onSetColor,
    onFileSuggestions,
    onReadFile: (path, maxBytes, encoding) =>
      readFileForRemote(
        path,
        maxBytes,
        getToolPermissionContext?.() ?? getEmptyToolPermissionContext(),
        encoding,
      ),
    onMcpAuthenticate,
    onMcpOauthCallbackUrl,
    onMcpReconnect,
    onMcpStatus,
    onStateChange,
    outboundOnly,
    tags,
    ...(enableSessionPersistence ? persistenceCallbacks : {}),
  })
  return attachClientPresenceCleanup(handle)
}

function attachClientPresenceCleanup(
  handle: ReplBridgeHandle | null,
): ReplBridgeHandle | null {
  if (!handle) {
    cleanupBridgeClientPresence()
    return null
  }
  const teardown = handle.teardown.bind(handle)
  handle.teardown = async options => {
    cleanupBridgeClientPresence()
    await teardown(options)
  }
  return handle
}

const TITLE_MAX_LEN = 50

/**
 * Quick placeholder title: strip display tags, take the first sentence,
 * collapse whitespace, truncate to 50 chars. Returns undefined if the result
 * is empty (e.g. message was only <local-command-stdout>). Replaced by
 * generateSessionTitle once Haiku resolves (~1-15s).
 */
function deriveTitle(raw: string): string | undefined {
  // Strip <ide_opened_file>, <session-start-hook>, etc. — these appear in
  // user messages when IDE/hooks inject context. stripDisplayTagsAllowEmpty
  // returns '' (not the original) so pure-tag messages are skipped.
  const clean = stripDisplayTagsAllowEmpty(raw)
  // First sentence is usually the intent; rest is often context/detail.
  // Capture group instead of lookbehind — keeps YARR JIT happy.
  const firstSentence = /^(.*?[.!?])\s/.exec(clean)?.[1] ?? clean
  // Collapse newlines/tabs — titles are single-line in the claude.ai list.
  const flat = firstSentence.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  return flat.length > TITLE_MAX_LEN
    ? flat.slice(0, TITLE_MAX_LEN - 1) + '\u2026'
    : flat
}
