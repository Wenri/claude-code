import { randomUUID } from 'crypto'
import { z } from 'zod/v4'
import type { RequiresActionDetails } from '../utils/sessionState.js'
import type { Message } from '../types/message.js'
import { getSessionId } from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from './analytics/growthbook.js'
import { runForkedAgent, getLastCacheSafeParams, type CacheSafeParams } from '../utils/forkedAgent.js'
import { createUserMessage } from '../utils/messages.js'
import { logForDebugging } from '../utils/debug.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { errorMessage } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import { safeParseJSON } from '../utils/json.js'
import { notifySessionMetadataChanged } from '../utils/sessionState.js'

export type PostTurnSummaryOutput = {
  status_category: 'blocked' | 'completed' | 'review_ready'
  status_detail: string
  title: string
  needs_action: string
}

export type PostTurnSummaryMessage = {
  type: 'system'
  subtype: 'post_turn_summary'
  summarizes_uuid: string
  status_category: 'blocked' | 'review_ready'
  status_detail: string
  title: string
  needs_action: string
  uuid: string
  session_id: string
}

const PostTurnSummaryOutputSchema = z.object({
  status_category: z.enum(['blocked', 'completed', 'review_ready']),
  status_detail: z.string(),
  title: z.string(),
  needs_action: z.string(),
})

const MAX_VALIDATION_NUDGES = 2
const POST_TURN_DELAY_MS = 2_000

let currentSummary: PostTurnSummaryOutput | null = null
let summaryAbortController: AbortController | null = null
let contextBuilder: (() => Promise<CacheSafeParams>) | null = null

export function isPostTurnSummaryEnabled(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
    return getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_ccr_post_turn_summary',
      false,
    )
  }
  return false
}

export function hydratePostTurnSummary(value: unknown): void {
  if (!value || typeof value !== 'object') return
  const parsed = PostTurnSummaryOutputSchema.safeParse(value)
  if (parsed.success) {
    currentSummary = parsed.data
    return
  }
  const legacy = value as { title?: unknown }
  if (typeof legacy.title === 'string') {
    currentSummary = {
      status_category: 'review_ready',
      status_detail: '',
      title: legacy.title,
      needs_action: '',
    }
  }
}

export function setPostTurnSummaryContextBuilder(
  builder: (() => Promise<CacheSafeParams>) | null,
): void {
  contextBuilder = builder
}

export function buildPostTurnSummaryPrompt(
  previous: PostTurnSummaryOutput | null,
  blockedHint?: Pick<RequiresActionDetails, 'tool_name' | 'action_description'>,
): string {
  const previousTitle = previous?.title
    ? `\nPrevious title: "${previous.title}"\nReturn this title VERBATIM unless the session's focus has shifted to different work.\n`
    : ''
  const permissionContext = blockedHint
    ? `\nThe session is parked on a permission prompt — Claude attempted ${blockedHint.tool_name} (${blockedHint.action_description}) and is waiting for the user's decision. The tool call and Claude's intent are visible in the conversation above as the most recent tool_use block. Explain what Claude is trying to accomplish with this call — not just that it's waiting.\n`
    : ''

  return `<system-reminder>
You are now producing a post-turn summary for this Claude Code session. Read the conversation that just happened and produce an overview that helps the user triage which of their many sessions need attention, and in what order.
${previousTitle}${permissionContext}
IMPORTANT:
- You have NO tools available — do not attempt to call any tool
- This is a one-off response — there will be no follow-up turns
- Respond with ONLY a JSON object on a single line, nothing else (no code fences, no prose)

The JSON must have exactly these fields:
{"status_category":"blocked|review_ready","status_detail":"...","title":"...","needs_action":"..."}

Formatting: all fields except title accept markdown. Use \`backticks\` for file names, function names, and shell commands. Use [text](url) for PRs and documents. Keep title plain text.

Frame fields in terms of user-visible behavior. Describe what the user will observe, what now works differently, or what broke or got fixed. Don't over-index on implementation details or specific lines of code unless the user is in the weeds with you — this summary is intentionally high-level. Good: "Login no longer loops on expired tokens", "Settings now sync across restarts".

status_category — pick one based on who unblocks the session next:
- blocked: Claude hit genuine ambiguity or a missing piece it can't route around — conflicting requirements, an unanswerable design question, context only the user has. NOT for awaiting review or normal handoffs: if Claude produced a deliverable and is waiting for eyes, use review_ready. Blocked indicates that a session is stuck, not waiting further direction or general review.
- review_ready: Claude produced something the user should look at — a PR, a plan, a diff, a document, a pushed branch, or a conversational answer. This is the default end state; the user (not this classifier) decides when work is "done".

status_detail — A 5-12 word blurb, scannable in an inbox row. Present tense, concrete, names the subject AND the cause in one breath — "Blocked on retry logic merge: three call sites conflict", "PR #1234 ready: tests green, auth code needs review". The reader should know both WHAT state the conversation is currently in, and WHY without opening the session. Present tense, concrete.

title — a short (3-6 words) title shown to the user in a list of all of their sessions. This title should be specific and actionable for the user to distinguish between other streams of work. Name the feature or bug being worked on, not the activity. Ex: "Fix infinite login redirect on /code". Keep this stable — only change this from your previously generated title if the session's focus has shifted. Write as a noun phrase or imperative, no subject.

needs_action — A 5-12 word blurb, scannable in an inbox row. Present tense, concrete, names the subject AND the cause in one breath — "Blocked on retry logic merge: three call sites conflict", "PR #1234 ready: tests green, auth code needs review". The reader should know both WHAT state the conversation is currently in, and WHY without opening the session. Present tense, concrete. Only populate this if the user has an action they should do. Empty string if nothing required.

Respond now with ONLY the JSON object:
</system-reminder>`
}

function extractAssistantText(messages: Message[]): string {
  return messages
    .flatMap(message =>
      message.type === 'assistant' ? message.message.content : [],
    )
    .filter(block => block.type === 'text')
    .map(block => ('text' in block ? block.text : ''))
    .join('')
    .trim()
}

export function parsePostTurnSummaryResponse(
  response: string,
): PostTurnSummaryOutput | string {
  const normalized = response
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    const parsed = PostTurnSummaryOutputSchema.safeParse(
      safeParseJSON(normalized),
    )
    if (parsed.success) {
      if (parsed.data.status_category === 'completed') {
        parsed.data.status_category = 'review_ready'
      }
      return parsed.data
    }
    return `schema validation failed: ${parsed.error.message}`
  } catch (error) {
    return `JSON.parse failed: ${errorMessage(error)}`
  }
}

async function generatePostTurnSummary(
  cacheSafeParams: CacheSafeParams,
  signal: AbortSignal,
  options?: {
    skipDelay?: boolean
    blockedHint?: Pick<
      RequiresActionDetails,
      'tool_name' | 'action_description'
    >
  },
): Promise<PostTurnSummaryOutput | null> {
  if (!options?.skipDelay) {
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, POST_TURN_DELAY_MS)
      timer.unref()
    })
  }
  if (signal.aborted) return null

  const promptMessages: Message[] = [
    createUserMessage({
      content: buildPostTurnSummaryPrompt(
        currentSummary,
        options?.blockedHint,
      ),
    }),
  ]
  const controller = new AbortController()
  signal.addEventListener('abort', () => controller.abort(), { once: true })

  for (let attempt = 0; attempt <= MAX_VALIDATION_NUDGES; attempt++) {
    const { messages } = await runForkedAgent({
      promptMessages,
      cacheSafeParams,
      overrides: { abortController: controller },
      canUseTool: async () => ({
        behavior: 'deny' as const,
        message: 'Post-turn summary cannot use tools',
        decisionReason: {
          type: 'other' as const,
          reason: 'post_turn_summary',
        },
      }),
      querySource: 'post_turn_summary' as never,
      forkLabel: 'post_turn_summary',
      maxTurns: 1,
      skipCacheWrite: true,
      skipTranscript: true,
    })
    if (signal.aborted) return null

    const text = extractAssistantText(messages)
    if (!text) {
      logForDebugging('[post-turn-summary] empty response, giving up')
      return null
    }
    const parsed = parsePostTurnSummaryResponse(text)
    if (typeof parsed !== 'string') return parsed
    promptMessages.push(
      ...messages.filter(message => message.type === 'assistant'),
      createUserMessage({
        content: `Your response was not valid: ${parsed}. Respond with ONLY the JSON object on a single line, no code fences or prose.`,
      }),
    )
  }

  logForDebugging(
    `[post-turn-summary] gave up after ${MAX_VALIDATION_NUDGES} nudges`,
  )
  return null
}

export function triggerBlockedPostTurnSummary(
  details: Pick<RequiresActionDetails, 'tool_name' | 'action_description'>,
): void {
  if (!isPostTurnSummaryEnabled() || !contextBuilder) return
  const buildContext = contextBuilder
  summaryAbortController?.abort()
  summaryAbortController = new AbortController()
  const signal = summaryAbortController.signal

  void (async () => {
    const startedAt = Date.now()
    try {
      const cacheSafeParams = await buildContext()
      if (signal.aborted) return
      const summary = await generatePostTurnSummary(cacheSafeParams, signal, {
        skipDelay: true,
        blockedHint: details,
      })
      if (!summary || signal.aborted) return
      currentSummary = summary
      notifySessionMetadataChanged({ post_turn_summary: summary })
      logForDebugging(
        `[post-turn-summary] blocked: ${summary.status_category} "${summary.status_detail}" (${Date.now() - startedAt}ms)`,
      )
    } catch (error) {
      if (signal.aborted) return
      logForDebugging(
        `[post-turn-summary] blocked failed: ${errorMessage(error)}`,
      )
      logError(error)
    }
  })()
}

export function triggerPostTurnSummary(
  messages: Message[],
  emit: (message: PostTurnSummaryMessage) => Promise<unknown>,
): void {
  if (!isPostTurnSummaryEnabled()) return
  const assistant = messages.filter(message => message.type === 'assistant').at(-1)
  if (!assistant) return
  const cacheSafeParams = getLastCacheSafeParams()
  if (!cacheSafeParams) {
    logForDebugging(
      '[post-turn-summary] no CacheSafeParams saved, skipping',
    )
    return
  }

  summaryAbortController?.abort()
  summaryAbortController = new AbortController()
  const signal = summaryAbortController.signal
  void (async () => {
    const startedAt = Date.now()
    try {
      const summary = await generatePostTurnSummary(cacheSafeParams, signal)
      if (!summary || signal.aborted) return
      const statusCategory =
        summary.status_category === 'completed'
          ? 'review_ready'
          : summary.status_category
      await emit({
        type: 'system',
        subtype: 'post_turn_summary',
        summarizes_uuid: assistant.uuid,
        status_category: statusCategory,
        status_detail: summary.status_detail,
        title: summary.title,
        needs_action: summary.needs_action,
        uuid: randomUUID(),
        session_id: getSessionId(),
      })
      currentSummary = { ...summary, status_category: statusCategory }
      notifySessionMetadataChanged({ post_turn_summary: currentSummary })
      logForDebugging(
        `[post-turn-summary] ${statusCategory} "${summary.status_detail}" (${Date.now() - startedAt}ms)`,
      )
    } catch (error) {
      if (signal.aborted) return
      logForDebugging(`[post-turn-summary] failed: ${errorMessage(error)}`)
      logError(error)
    }
  })()
}
