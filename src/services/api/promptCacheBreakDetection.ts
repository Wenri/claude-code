import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getSessionId } from 'src/bootstrap/state.js'
import type { AgentId } from 'src/types/ids.js'
import type { Message } from 'src/types/message.js'
import { COMPUTER_USE_MCP_SERVER_NAME } from 'src/utils/computerUse/common.js'
import { logForDebugging } from 'src/utils/debug.js'
import { isEnvTruthy } from 'src/utils/envUtils.js'
import { djb2Hash } from 'src/utils/hash.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { logError } from 'src/utils/log.js'
import { getClaudeTempDir } from 'src/utils/permissions/filesystem.js'
import { jsonParse, jsonStringify } from 'src/utils/slowOperations.js'
import { z } from 'zod'
import type { QuerySource } from '../../constants/querySource.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'

type PreviousState = {
  systemHash: number
  toolsHash: number
  /** Hash of system blocks WITH cache_control intact. Catches scope/TTL flips
   *  (global↔org, 1h↔5m) that stripCacheControl erases from systemHash. */
  cacheControlHash: number
  toolNames: string[]
  /** Per-tool schema hash. Diffed to name which tool's description changed
   *  when toolSchemasChanged but added=removed=0 (77% of tool breaks per
   *  BQ 2026-03-22). AgentTool/SkillTool embed dynamic agent/command lists. */
  perToolHashes: Record<string, number>
  perBlockHashes: number[]
  perBlockLengths: number[]
  systemCharCount: number
  model: string
  fastMode: boolean
  /** 'tool_based' | 'system_prompt' | 'none' — flips when MCP tools are
   *  discovered/removed. */
  globalCacheStrategy: string
  /** Sorted beta header list. Diffed to show which headers were added/removed. */
  betas: string[]
  /** AFK_MODE_BETA_HEADER presence — should NOT break cache anymore
   *  (sticky-on latched in claude.ts). Tracked to verify the fix. */
  autoModeActive: boolean
  /** Overage state flip — should NOT break cache anymore (eligibility is
   *  latched session-stable in should1hCacheTTL). Tracked to verify the fix. */
  isUsingOverage: boolean
  is1hCacheTTL: boolean
  queryDepth?: number
  /** Cache-editing beta header presence — should NOT break cache anymore
   *  (sticky-on latched in claude.ts). Tracked to verify the fix. */
  cachedMCEnabled: boolean
  cacheDiagnosis: boolean
  /** Resolved effort (env → options → model default). Goes into output_config
   *  or anthropic_internal.effort_override. */
  effortValue: string
  /** Hash of getExtraBodyParams() — catches CLAUDE_CODE_EXTRA_BODY and
   *  anthropic_internal changes. */
  extraBodyHash: number
  callCount: number
  pendingChanges: PendingChanges | null
  prevCacheReadTokens: number | null
  /** Set when cached microcompact sends cache_edits deletions. Cache reads
   *  will legitimately drop — this is expected, not a break. */
  cacheDeletionsPending: boolean
  messageHashes: number[]
  buildDiffableContent: () => string
}

type PendingChanges = {
  systemPromptChanged: boolean
  toolSchemasChanged: boolean
  modelChanged: boolean
  fastModeChanged: boolean
  cacheControlChanged: boolean
  globalCacheStrategyChanged: boolean
  betasChanged: boolean
  autoModeChanged: boolean
  overageChanged: boolean
  cachedMCChanged: boolean
  cacheDiagnosisChanged: boolean
  effortChanged: boolean
  extraBodyChanged: boolean
  messagesHistoryChanged: boolean
  firstChangedMessageIndex: number
  prevMessageCount: number
  addedToolCount: number
  removedToolCount: number
  systemCharDelta: number
  addedTools: string[]
  removedTools: string[]
  changedToolSchemas: string[]
  prevBlockCount: number
  newBlockCount: number
  changedBlockIndices: number[]
  changedBlockLengthDeltas: number[]
  previousModel: string
  newModel: string
  prevGlobalCacheStrategy: string
  newGlobalCacheStrategy: string
  addedBetas: string[]
  removedBetas: string[]
  prevEffortValue: string
  newEffortValue: string
  buildPrevDiffableContent: () => string
}

const previousStateBySource = new Map<string, PreviousState>()
let persistentStateLoaded = false
let persistentStateWrite = Promise.resolve()

/** Prompt-cache diagnostics are active for Cowork and Claude Desktop. */
export function shouldTrackPromptCacheBreaks(): boolean {
  return (
    isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK) ||
    process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop'
  )
}

// State survives Cowork worker restarts. Desktop participates in diagnostics,
// but its cache state is intentionally process-local.
function shouldPersistPromptCacheState(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
}

function getPromptCacheStatePath(): string {
  return join(getClaudeTempDir(), `cache-break-state-${getSessionId()}.json`)
}

type PersistedPreviousState = Omit<
  PreviousState,
  'pendingChanges' | 'buildDiffableContent'
>

const persistedStateSchema = lazySchema(() =>
  z.record(
    z.string(),
    z.object({
      systemHash: z.number(),
      toolsHash: z.number(),
      cacheControlHash: z.number(),
      toolNames: z.array(z.string()),
      perToolHashes: z.record(z.string(), z.number()),
      perBlockHashes: z.array(z.number()),
      perBlockLengths: z.array(z.number()),
      systemCharCount: z.number(),
      model: z.string(),
      fastMode: z.boolean(),
      globalCacheStrategy: z.string(),
      betas: z.array(z.string()),
      autoModeActive: z.boolean(),
      isUsingOverage: z.boolean(),
      is1hCacheTTL: z.boolean().default(false),
      queryDepth: z.number().optional(),
      cachedMCEnabled: z.boolean(),
      cacheDiagnosis: z.boolean().default(false),
      effortValue: z.string(),
      extraBodyHash: z.number(),
      callCount: z.number(),
      prevCacheReadTokens: z.number().nullable(),
      cacheDeletionsPending: z.boolean(),
      messageHashes: z.array(z.number()),
    }),
  ),
)

function loadPersistentState(): void {
  if (persistentStateLoaded || !shouldPersistPromptCacheState()) return
  persistentStateLoaded = true
  try {
    const parsed = persistedStateSchema().safeParse(
      jsonParse(readFileSync(getPromptCacheStatePath(), 'utf8')),
    )
    if (!parsed.success) return
    for (const [key, value] of Object.entries(parsed.data)) {
      if (previousStateBySource.has(key)) continue
      previousStateBySource.set(key, {
        ...(value as PersistedPreviousState),
        pendingChanges: null,
        buildDiffableContent: () => '',
      })
    }
  } catch {
    // Missing, stale, or corrupt state should never affect a query.
  }
}

function persistState(): void {
  if (!shouldPersistPromptCacheState()) return
  try {
    const serializable: Record<string, PersistedPreviousState> = {}
    for (const [key, state] of previousStateBySource) {
      const {
        buildDiffableContent: _buildDiffableContent,
        pendingChanges: _pendingChanges,
        ...persisted
      } = state
      serializable[key] = persisted
    }
    const path = getPromptCacheStatePath()
    const contents = jsonStringify(serializable)
    persistentStateWrite = persistentStateWrite
      .then(() => mkdir(getClaudeTempDir(), { recursive: true, mode: 0o700 }))
      .then(() => writeFile(path, contents))
      .catch(() => {})
  } catch {
    // Cache diagnostics are best effort.
  }
}

// Cap the number of tracked sources to prevent unbounded memory growth.
// Each entry stores a ~300KB+ diffableContent string (serialized system prompt
// + tool schemas). Without a cap, spawning many subagents (each with a unique
// agentId key) causes the map to grow indefinitely.
const MAX_TRACKED_SOURCES = 10

const TRACKED_SOURCE_PREFIXES = [
  'repl_main_thread',
  'sdk',
  'agent:custom',
  'agent:default',
  'agent:builtin',
]

// Minimum absolute token drop required to trigger a cache break warning.
// Small drops (e.g., a few thousand tokens) can happen due to normal variation
// and aren't worth alerting on.
const MIN_CACHE_MISS_TOKENS = 2_000

// Anthropic's server-side prompt cache TTL thresholds to test.
// Cache breaks after these durations are likely due to TTL expiration
// rather than client-side changes.
const CACHE_TTL_5MIN_MS = 5 * 60 * 1000
export const CACHE_TTL_1HOUR_MS = 60 * 60 * 1000
const BILLING_HEADER_PREFIX = 'x-anthropic-billing-header:'

function shouldPersistState(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
}

function getPersistedStatePath(): string {
  return join(getClaudeTempDir(), `cache-break-state-${getSessionId()}.json`)
}

function loadPersistedState(): void {
  if (persistedStateLoaded || !shouldPersistState()) return
  persistedStateLoaded = true
  try {
    const parsed = persistedStateSchema.safeParse(
      JSON.parse(readFileSync(getPersistedStatePath(), 'utf8')),
    )
    if (!parsed.success) return
    for (const [key, state] of Object.entries(parsed.data)) {
      if (previousStateBySource.has(key)) continue
      previousStateBySource.set(key, {
        ...state,
        pendingChanges: null,
        buildDiffableContent: () => '',
      })
    }
  } catch {}
}

function persistState(): void {
  if (!shouldPersistState()) return
  try {
    const serialized: Record<string, unknown> = {}
    for (const [key, state] of previousStateBySource) {
      const {
        buildDiffableContent: _,
        pendingChanges: __,
        ...persisted
      } = state
      serialized[key] = persisted
    }
    const statePath = getPersistedStatePath()
    const contents = jsonStringify(serialized)
    persistQueue = persistQueue
      .then(() => mkdir(getClaudeTempDir(), { recursive: true }))
      .then(() => writeFile(statePath, contents))
      .catch(() => {})
  } catch {}
}

// Models to exclude from cache break detection (e.g., haiku has different caching behavior)
function isExcludedModel(model: string): boolean {
  return model.includes('haiku')
}

/**
 * Returns the tracking key for a querySource, or null if untracked.
 * Compact shares the same server-side cache as repl_main_thread
 * (same cacheSafeParams), so they share tracking state.
 *
 * For subagents with a tracked querySource, uses the unique agentId to
 * isolate tracking state. This prevents false positive cache break
 * notifications when multiple instances of the same agent type run
 * concurrently.
 *
 * Untracked sources (speculation, session_memory, prompt_suggestion, etc.)
 * are short-lived forked agents where cache break detection provides no
 * value — they run 1-3 turns with a fresh agentId each time, so there's
 * nothing meaningful to compare against. Their cache metrics are still
 * logged via tengu_api_success for analytics.
 */
function getTrackingKey(
  querySource: QuerySource,
  agentId?: AgentId,
): string | null {
  if (querySource === 'compact') return 'repl_main_thread'
  for (const prefix of TRACKED_SOURCE_PREFIXES) {
    if (querySource.startsWith(prefix)) return agentId || querySource
  }
  return null
}

function stripCacheControl(
  items: ReadonlyArray<Record<string, unknown>>,
): unknown[] {
  return items.map(item => {
    if (!('cache_control' in item)) return item
    const { cache_control: _, ...rest } = item
    return rest
  })
}

function getTextBlockText(block: unknown): string | undefined {
  if (!block || typeof block !== 'object') return undefined
  const text = (block as { text?: unknown }).text
  return typeof text === 'string' ? text : undefined
}

const BILLING_HEADER_PREFIX = 'x-anthropic-billing-header:'

function isBillingHeaderBlock(block: unknown): boolean {
  return getTextBlockText(block)?.startsWith(BILLING_HEADER_PREFIX) ?? false
}

function computeHash(data: unknown): number {
  const str = jsonStringify(data)
  if (typeof Bun !== 'undefined') {
    const hash = Bun.hash(str)
    // Bun.hash can return bigint for large inputs; convert to number safely
    return typeof hash === 'bigint' ? Number(hash & 0xffffffffn) : hash
  }
  // Fallback for non-Bun runtimes (e.g. Node.js via npm global install)
  return djb2Hash(str)
}

/** MCP tool names are user-controlled (server config) and may leak filepaths.
 *  Collapse them to 'mcp'; built-in names are a fixed vocabulary. */
function sanitizeToolName(name: string): string {
  if (!name.startsWith('mcp__')) return name
  const serverName = name.split('__')[1]
  if (!serverName) return 'mcp'
  if (
    process.env.CLAUDE_CODE_ENTRYPOINT === 'local-agent' ||
    serverName === COMPUTER_USE_MCP_SERVER_NAME
  ) {
    return `mcp__${serverName}`
  }
  return 'mcp'
}

function sanitizeQuerySource(querySource: QuerySource): string {
  return querySource.startsWith('agent:custom:')
    ? 'agent:custom'
    : querySource
}

function stripMessageCacheData(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const { cache_control: _cacheControl, ...rest } = value as Record<
    string,
    unknown
  >
  const source = rest.source
  if (source && typeof source === 'object') {
    const sourceObject = source as Record<string, unknown>
    if (
      typeof sourceObject.data === 'string' &&
      sourceObject.data.length > 256
    ) {
      return {
        ...rest,
        source: { ...sourceObject, data: sourceObject.data.length },
      }
    }
  }
  if (Array.isArray(rest.content)) {
    return { ...rest, content: rest.content.map(stripMessageCacheData) }
  }
  return rest
}

function computeMessageHashes(messages: ReadonlyArray<unknown>): number[] {
  return messages.map(message => {
    const value = message as {
      role?: unknown
      content?: unknown
      message?: { role?: unknown; content?: unknown }
    }
    const payload = value.message ?? value
    return computeHash({
      role: payload.role,
      content: Array.isArray(payload.content)
        ? payload.content.map(stripMessageCacheData)
        : payload.content,
    })
  })
}

function computePerToolHashes(
  strippedTools: ReadonlyArray<unknown>,
  names: string[],
): Record<string, number> {
  const hashes: Record<string, number> = {}
  for (let i = 0; i < strippedTools.length; i++) {
    hashes[names[i] ?? `__idx_${i}`] = computeHash(strippedTools[i])
  }
  return hashes
}

function getSystemCharCount(system: TextBlockParam[]): number {
  let total = 0
  for (const block of system) {
    total += getTextBlockText(block)?.length ?? 0
  }
  return total
}

function buildDiffableContent(
  system: TextBlockParam[],
  tools: BetaToolUnion[],
  model: string,
): string {
  const systemText = system.map(b => b.text).join('\n\n')
  const toolDetails = tools
    .map(t => {
      if (!('name' in t)) return 'unknown'
      const desc = 'description' in t ? t.description : ''
      const schema = 'input_schema' in t ? jsonStringify(t.input_schema) : ''
      return `${t.name}\n  description: ${desc}\n  input_schema: ${schema}`
    })
    .sort()
    .join('\n\n')
  return `Model: ${model}\n\n=== System Prompt ===\n\n${systemText}\n\n=== Tools (${tools.length}) ===\n\n${toolDetails}\n`
}

/** Extended tracking snapshot — everything that could affect the server-side
 *  cache key that we can observe from the client. All fields are optional so
 *  the call site can add incrementally; undefined fields compare as stable. */
export type PromptStateSnapshot = {
  system: TextBlockParam[]
  toolSchemas: BetaToolUnion[]
  querySource: QuerySource
  model: string
  agentId?: AgentId
  fastMode?: boolean
  globalCacheStrategy?: string
  betas?: readonly string[]
  autoModeActive?: boolean
  isUsingOverage?: boolean
  is1hCacheTTL?: boolean
  queryDepth?: number
  cachedMCEnabled?: boolean
  cacheDiagnosis?: boolean
  effortValue?: string | number
  extraBodyParams?: unknown
  messagesForAPI?: ReadonlyArray<unknown>
}

export type CacheMissReason = {
  type: string
  cache_missed_input_tokens?: number
}

export function logPromptCacheDiagnosis(
  reason: CacheMissReason,
  context: {
    requestId?: string
    previousMessageId?: string
    model: string
    is1hCacheTTL: boolean
    querySource: QuerySource
    queryDepth?: number
  },
): void {
  try {
    logEvent('tengu_prompt_cache_diagnosis_received', {
      diagnosisType:
        reason.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      tokensMissed: reason.cache_missed_input_tokens ?? -1,
      requestId: (context.requestId ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      previousMessageId: (context.previousMessageId ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      model:
        context.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      isCowork: isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK),
      is1hCacheTTL: context.is1hCacheTTL,
      querySource: sanitizeQuerySource(
        context.querySource,
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      queryDepth: context.queryDepth,
    })
  } catch (error) {
    logError(error)
  }
}

/**
 * Phase 1 (pre-call): Record the current prompt/tool state and detect what changed.
 * Does NOT fire events — just stores pending changes for phase 2 to use.
 */
export function recordPromptState(snapshot: PromptStateSnapshot): void {
  try {
    const {
      system,
      toolSchemas,
      querySource,
      model,
      agentId,
      fastMode,
      globalCacheStrategy = '',
      betas = [],
      autoModeActive = false,
      isUsingOverage = false,
      is1hCacheTTL = false,
      queryDepth,
      cachedMCEnabled = false,
      cacheDiagnosis = false,
      effortValue,
      extraBodyParams,
      messagesForAPI,
    } = snapshot
    const key = getTrackingKey(querySource, agentId)
    if (!key) return

    const strippedSystem = stripCacheControl(
      system as unknown as ReadonlyArray<Record<string, unknown>>,
    ).filter(block => !isBillingHeaderBlock(block))
    const strippedTools = stripCacheControl(
      toolSchemas as unknown as ReadonlyArray<Record<string, unknown>>,
    )

    const systemHash = computeHash(strippedSystem)
    const toolsHash = computeHash(strippedTools)
    // Hash the full system array INCLUDING cache_control — this catches
    // scope flips (global↔org/none) and TTL flips (1h↔5m) that the stripped
    // hash can't see because the text content is identical.
    const cacheControlHash = computeHash(
      system
        .filter(block => !isBillingHeaderBlock(block))
        .map(b => ('cache_control' in b ? b.cache_control : null)),
    )
    const toolNames = toolSchemas.map(t => ('name' in t ? t.name : 'unknown'))
    // Only compute per-tool hashes when the aggregate changed — common case
    // (tools unchanged) skips N extra jsonStringify calls.
    const computeToolHashes = () =>
      computePerToolHashes(strippedTools, toolNames)
    const computeBlockHashes = () => strippedSystem.map(computeHash)
    const computeBlockLengths = () =>
      strippedSystem.map(block => getTextBlockText(block)?.length ?? 0)
    const systemCharCount = getSystemCharCount(
      system.filter(block => !isBillingHeaderBlock(block)),
    )
    const lazyDiffableContent = () =>
      buildDiffableContent(system, toolSchemas, model)
    const isFastMode = fastMode ?? false
    const sortedBetas = [...betas].sort()
    const effortStr = effortValue === undefined ? '' : String(effortValue)
    const extraBodyHash =
      extraBodyParams === undefined ? 0 : computeHash(extraBodyParams)
    const messageHashes = messagesForAPI
      ? computeMessageHashes(messagesForAPI)
      : []

    loadPersistentState()
    const prev = previousStateBySource.get(key)

    if (!prev) {
      // Evict oldest entries if map is at capacity
      while (previousStateBySource.size >= MAX_TRACKED_SOURCES) {
        const oldest = previousStateBySource.keys().next().value
        if (oldest !== undefined) previousStateBySource.delete(oldest)
      }

      previousStateBySource.set(key, {
        systemHash,
        toolsHash,
        cacheControlHash,
        toolNames,
        systemCharCount,
        model,
        fastMode: isFastMode,
        globalCacheStrategy,
        betas: sortedBetas,
        autoModeActive,
        isUsingOverage,
        is1hCacheTTL,
        queryDepth,
        cachedMCEnabled,
        cacheDiagnosis,
        effortValue: effortStr,
        extraBodyHash,
        callCount: 1,
        pendingChanges: null,
        prevCacheReadTokens: null,
        cacheDeletionsPending: false,
        messageHashes,
        buildDiffableContent: lazyDiffableContent,
        perToolHashes: computeToolHashes(),
        perBlockHashes: computeBlockHashes(),
        perBlockLengths: computeBlockLengths(),
      })
      persistState()
      return
    }

    prev.callCount++

    const systemPromptChanged = systemHash !== prev.systemHash
    const toolSchemasChanged = toolsHash !== prev.toolsHash
    const modelChanged = model !== prev.model
    const fastModeChanged = isFastMode !== prev.fastMode
    const cacheControlChanged = cacheControlHash !== prev.cacheControlHash
    const globalCacheStrategyChanged =
      globalCacheStrategy !== prev.globalCacheStrategy
    const betasChanged =
      sortedBetas.length !== prev.betas.length ||
      sortedBetas.some((b, i) => b !== prev.betas[i])
    const autoModeChanged = autoModeActive !== prev.autoModeActive
    const overageChanged = isUsingOverage !== prev.isUsingOverage
    const cachedMCChanged = cachedMCEnabled !== prev.cachedMCEnabled
    const cacheDiagnosisChanged = cacheDiagnosis !== prev.cacheDiagnosis
    const effortChanged = effortStr !== prev.effortValue
    const extraBodyChanged = extraBodyHash !== prev.extraBodyHash
    const firstChangedMessageIndex = prev.messageHashes.findIndex(
      (hash, index) => messageHashes[index] !== hash,
    )
    const messagesHistoryChanged = firstChangedMessageIndex !== -1

    if (
      systemPromptChanged ||
      toolSchemasChanged ||
      modelChanged ||
      fastModeChanged ||
      cacheControlChanged ||
      globalCacheStrategyChanged ||
      betasChanged ||
      autoModeChanged ||
      overageChanged ||
      cachedMCChanged ||
      cacheDiagnosisChanged ||
      effortChanged ||
      extraBodyChanged ||
      messagesHistoryChanged
    ) {
      const prevToolSet = new Set(prev.toolNames)
      const newToolSet = new Set(toolNames)
      const prevBetaSet = new Set(prev.betas)
      const newBetaSet = new Set(sortedBetas)
      const addedTools = toolNames.filter(n => !prevToolSet.has(n))
      const removedTools = prev.toolNames.filter(n => !newToolSet.has(n))
      const changedToolSchemas: string[] = []
      if (toolSchemasChanged) {
        const newHashes = computeToolHashes()
        for (const name of toolNames) {
          if (!prevToolSet.has(name)) continue
          if (newHashes[name] !== prev.perToolHashes[name]) {
            changedToolSchemas.push(name)
          }
        }
        prev.perToolHashes = newHashes
      }
      const prevBlockCount = prev.perBlockHashes.length
      const newBlockCount = strippedSystem.length
      const changedBlockIndices: number[] = []
      const changedBlockLengthDeltas: number[] = []
      if (systemPromptChanged) {
        const newBlockHashes = computeBlockHashes()
        const newBlockLengths = computeBlockLengths()
        if (newBlockCount === prevBlockCount) {
          for (let i = 0; i < newBlockCount; i++) {
            if (newBlockHashes[i] !== prev.perBlockHashes[i]) {
              changedBlockIndices.push(i)
              changedBlockLengthDeltas.push(
                (newBlockLengths[i] ?? 0) - (prev.perBlockLengths[i] ?? 0),
              )
            }
          }
        }
        prev.perBlockHashes = newBlockHashes
        prev.perBlockLengths = newBlockLengths
      }
      prev.pendingChanges = {
        systemPromptChanged,
        toolSchemasChanged,
        modelChanged,
        fastModeChanged,
        cacheControlChanged,
        globalCacheStrategyChanged,
        betasChanged,
        autoModeChanged,
        overageChanged,
        cachedMCChanged,
        cacheDiagnosisChanged,
        effortChanged,
        extraBodyChanged,
        messagesHistoryChanged,
        firstChangedMessageIndex,
        prevMessageCount: prev.messageHashes.length,
        addedToolCount: addedTools.length,
        removedToolCount: removedTools.length,
        addedTools,
        removedTools,
        changedToolSchemas,
        prevBlockCount,
        newBlockCount,
        changedBlockIndices,
        changedBlockLengthDeltas,
        systemCharDelta: systemCharCount - prev.systemCharCount,
        previousModel: prev.model,
        newModel: model,
        prevGlobalCacheStrategy: prev.globalCacheStrategy,
        newGlobalCacheStrategy: globalCacheStrategy,
        addedBetas: sortedBetas.filter(b => !prevBetaSet.has(b)),
        removedBetas: prev.betas.filter(b => !newBetaSet.has(b)),
        prevEffortValue: prev.effortValue,
        newEffortValue: effortStr,
        buildPrevDiffableContent: prev.buildDiffableContent,
      }
    } else {
      prev.pendingChanges = null
    }

    prev.systemHash = systemHash
    prev.toolsHash = toolsHash
    prev.cacheControlHash = cacheControlHash
    prev.toolNames = toolNames
    prev.systemCharCount = systemCharCount
    prev.model = model
    prev.fastMode = isFastMode
    prev.globalCacheStrategy = globalCacheStrategy
    prev.betas = sortedBetas
    prev.autoModeActive = autoModeActive
    prev.isUsingOverage = isUsingOverage
    prev.is1hCacheTTL = is1hCacheTTL
    prev.queryDepth = queryDepth
    prev.cachedMCEnabled = cachedMCEnabled
    prev.cacheDiagnosis = cacheDiagnosis
    prev.effortValue = effortStr
    prev.extraBodyHash = extraBodyHash
    prev.messageHashes = messageHashes
    prev.buildDiffableContent = lazyDiffableContent
    persistState()
  } catch (e: unknown) {
    logError(e)
  }
}

/**
 * Phase 2 (post-call): Check the API response's cache tokens to determine
 * if a cache break actually occurred. If it did, use the pending changes
 * from phase 1 to explain why.
 */
export async function checkResponseForCacheBreak(
  querySource: QuerySource,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  messages: Message[],
  agentId?: AgentId,
  requestId?: string | null,
  previousMessageId?: string,
): Promise<void> {
  const key = getTrackingKey(querySource, agentId)
  if (!key) return

  const state = previousStateBySource.get(key)
  if (!state) return

  // Skip excluded models (e.g., haiku has different caching behavior)
  if (isExcludedModel(state.model)) return

  try {
    const prevCacheRead = state.prevCacheReadTokens
    state.prevCacheReadTokens = cacheReadTokens

    // Calculate time since last call for TTL detection by finding the most recent
    // assistant message timestamp in the messages array (before the current response)
    const lastAssistantMessage = messages.findLast(m => m.type === 'assistant')
    const timeSinceLastAssistantMsg = lastAssistantMessage
      ? Date.now() - new Date(lastAssistantMessage.timestamp).getTime()
      : null

    // Skip the first call — no previous value to compare against
    if (prevCacheRead === null) return

    const changes = state.pendingChanges

    // Cache deletions via cached microcompact intentionally reduce the cached
    // prefix. The drop in cache read tokens is expected — reset the baseline
    // so we don't false-positive on the next call.
    if (state.cacheDeletionsPending) {
      state.cacheDeletionsPending = false
      logForDebugging(
        `[PROMPT CACHE] cache deletion applied, cache read: ${prevCacheRead} → ${cacheReadTokens} (expected drop)`,
      )
      // Don't flag as a break — the remaining state is still valid
      state.pendingChanges = null
      return
    }

    // Detect a cache break: cache read dropped >5% from previous AND
    // the absolute drop exceeds the minimum threshold.
    const tokenDrop = prevCacheRead - cacheReadTokens
    if (
      cacheReadTokens >= prevCacheRead * 0.95 ||
      tokenDrop < MIN_CACHE_MISS_TOKENS
    ) {
      state.pendingChanges = null
      return
    }

    // Build explanation from pending changes (if any)
    const parts: string[] = []
    if (changes) {
      if (changes.modelChanged) {
        parts.push(
          `model changed (${changes.previousModel} → ${changes.newModel})`,
        )
      }
      if (changes.systemPromptChanged) {
        const charDelta = changes.systemCharDelta
        const charInfo =
          charDelta === 0
            ? ''
            : charDelta > 0
              ? ` (+${charDelta} chars)`
              : ` (${charDelta} chars)`
        parts.push(`system prompt changed${charInfo}`)
      }
      if (changes.toolSchemasChanged) {
        const toolDiff =
          changes.addedToolCount > 0 || changes.removedToolCount > 0
            ? ` (+${changes.addedToolCount}/-${changes.removedToolCount} tools)`
            : ' (tool prompt/schema changed, same tool set)'
        parts.push(`tools changed${toolDiff}`)
      }
      if (changes.fastModeChanged) {
        parts.push('fast mode toggled')
      }
      if (changes.globalCacheStrategyChanged) {
        parts.push(
          `global cache strategy changed (${changes.prevGlobalCacheStrategy || 'none'} → ${changes.newGlobalCacheStrategy || 'none'})`,
        )
      }
      if (
        changes.cacheControlChanged &&
        !changes.globalCacheStrategyChanged &&
        !changes.systemPromptChanged
      ) {
        // Only report as standalone cause if nothing else explains it —
        // otherwise the scope/TTL flip is a consequence, not the root cause.
        parts.push('cache_control changed (scope or TTL)')
      }
      if (changes.betasChanged) {
        const added = changes.addedBetas.length
          ? `+${changes.addedBetas.join(',')}`
          : ''
        const removed = changes.removedBetas.length
          ? `-${changes.removedBetas.join(',')}`
          : ''
        const diff = [added, removed].filter(Boolean).join(' ')
        parts.push(`betas changed${diff ? ` (${diff})` : ''}`)
      }
      if (changes.autoModeChanged) {
        parts.push('auto mode toggled')
      }
      if (changes.overageChanged) {
        parts.push('overage state changed (TTL flip expected)')
      }
      if (changes.cachedMCChanged) {
        parts.push('cached microcompact toggled')
      }
      if (changes.cacheDiagnosisChanged) {
        parts.push('cache diagnosis toggled')
      }
      if (changes.effortChanged) {
        parts.push(
          `effort changed (${changes.prevEffortValue || 'default'} → ${changes.newEffortValue || 'default'})`,
        )
      }
      if (changes.extraBodyChanged) {
        parts.push('extra body params changed')
      }
      if (changes.messagesHistoryChanged) {
        parts.push(
          `message history mutated at index ${changes.firstChangedMessageIndex}/${changes.prevMessageCount}`,
        )
      }
    }

    // Check if time gap suggests TTL expiration
    const lastAssistantMsgOver5minAgo =
      timeSinceLastAssistantMsg !== null &&
      timeSinceLastAssistantMsg > CACHE_TTL_5MIN_MS
    const lastAssistantMsgOver1hAgo =
      timeSinceLastAssistantMsg !== null &&
      timeSinceLastAssistantMsg > CACHE_TTL_1HOUR_MS

    // Post PR #19823 BQ analysis (bq-queries/prompt-caching/cache_break_pr19823_analysis.sql):
    // when all client-side flags are false and the gap is under TTL, ~90% of breaks
    // are server-side routing/eviction or billed/inference disagreement. Label
    // accordingly instead of implying a CC bug hunt.
    let reason: string
    if (parts.length > 0) {
      reason = parts.join(', ')
    } else if (lastAssistantMsgOver1hAgo) {
      reason = 'possible 1h TTL expiry (prompt unchanged)'
    } else if (lastAssistantMsgOver5minAgo) {
      reason = 'possible 5min TTL expiry (prompt unchanged)'
    } else if (timeSinceLastAssistantMsg !== null) {
      reason = 'likely server-side (prompt unchanged, <5min gap)'
    } else {
      reason = 'unknown cause'
    }

    logEvent('tengu_prompt_cache_break', {
      systemPromptChanged: changes?.systemPromptChanged ?? false,
      toolSchemasChanged: changes?.toolSchemasChanged ?? false,
      modelChanged: changes?.modelChanged ?? false,
      fastModeChanged: changes?.fastModeChanged ?? false,
      cacheControlChanged: changes?.cacheControlChanged ?? false,
      globalCacheStrategyChanged: changes?.globalCacheStrategyChanged ?? false,
      betasChanged: changes?.betasChanged ?? false,
      autoModeChanged: changes?.autoModeChanged ?? false,
      overageChanged: changes?.overageChanged ?? false,
      cachedMCChanged: changes?.cachedMCChanged ?? false,
      cacheDiagnosisChanged: changes?.cacheDiagnosisChanged ?? false,
      effortChanged: changes?.effortChanged ?? false,
      extraBodyChanged: changes?.extraBodyChanged ?? false,
      messagesHistoryChanged: changes?.messagesHistoryChanged ?? false,
      firstChangedMessageIndex: changes?.firstChangedMessageIndex ?? -1,
      addedToolCount: changes?.addedToolCount ?? 0,
      removedToolCount: changes?.removedToolCount ?? 0,
      systemCharDelta: changes?.systemCharDelta ?? 0,
      prevBlockCount: changes?.prevBlockCount ?? 0,
      newBlockCount: changes?.newBlockCount ?? 0,
      changedBlockIndices: (changes?.changedBlockIndices ?? []).join(','),
      changedBlockLengthDeltas: (
        changes?.changedBlockLengthDeltas ?? []
      ).join(','),
      // Tool names are sanitized: built-in names are a fixed vocabulary,
      // MCP tools collapse to 'mcp' (user-configured, could leak paths).
      addedTools: (changes?.addedTools ?? [])
        .map(sanitizeToolName)
        .join(
          ',',
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      removedTools: (changes?.removedTools ?? [])
        .map(sanitizeToolName)
        .join(
          ',',
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      changedToolSchemas: (changes?.changedToolSchemas ?? [])
        .map(sanitizeToolName)
        .join(
          ',',
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      // Beta header names and cache strategy are fixed enum-like values,
      // not code or filepaths. requestId is an opaque server-generated ID.
      addedBetas: (changes?.addedBetas ?? []).join(
        ',',
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      removedBetas: (changes?.removedBetas ?? []).join(
        ',',
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      prevGlobalCacheStrategy: (changes?.prevGlobalCacheStrategy ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      newGlobalCacheStrategy: (changes?.newGlobalCacheStrategy ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      systemHash: state.systemHash,
      toolsHash: state.toolsHash,
      is1hCacheTTL: state.is1hCacheTTL,
      queryDepth: state.queryDepth,
      querySource: sanitizeQuerySource(
        querySource,
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      model:
        state.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      globalCacheStrategy:
        state.globalCacheStrategy as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      callNumber: state.callCount,
      prevCacheReadTokens: prevCacheRead,
      cacheReadTokens,
      cacheCreationTokens,
      timeSinceLastAssistantMsg: timeSinceLastAssistantMsg ?? -1,
      lastAssistantMsgOver5minAgo,
      lastAssistantMsgOver1hAgo,
      isCowork: isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK),
      isDesktop: process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop',
      requestId: (requestId ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      previousMessageId: (previousMessageId ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    const summary = `[PROMPT CACHE BREAK] ${reason} [source=${querySource}, call #${state.callCount}, cache read: ${prevCacheRead} → ${cacheReadTokens}, creation: ${cacheCreationTokens}]`

    logForDebugging(summary, { level: 'warn' })

    state.pendingChanges = null
  } catch (e: unknown) {
    logError(e)
  } finally {
    persistState()
  }
}

/**
 * Call when cached microcompact sends cache_edits deletions.
 * The next API response will have lower cache read tokens — that's
 * expected, not a cache break.
 */
export function notifyCacheDeletion(
  querySource: QuerySource,
  agentId?: AgentId,
): void {
  const key = getTrackingKey(querySource, agentId)
  const state = key ? previousStateBySource.get(key) : undefined
  if (state) {
    state.cacheDeletionsPending = true
    persistState()
  }
}

/**
 * Call after compaction to reset the cache read baseline.
 * Compaction legitimately reduces message count, so cache read tokens
 * will naturally drop on the next call — that's not a break.
 */
export function notifyCompaction(
  querySource: QuerySource,
  agentId?: AgentId,
): void {
  const key = getTrackingKey(querySource, agentId)
  const state = key ? previousStateBySource.get(key) : undefined
  if (state) {
    state.prevCacheReadTokens = null
    persistState()
  }
}

export function cleanupAgentTracking(agentId: AgentId): void {
  previousStateBySource.delete(agentId)
  persistState()
}

export function resetPromptCacheBreakDetection(): void {
  previousStateBySource.clear()
  persistentStateLoaded = false
  persistState()
}
