import { appendFile, mkdir, open } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod/v4'
import { getSessionId } from '../bootstrap/state.js'
import { logEvent } from '../services/analytics/index.js'
import {
  getCacheControl,
  should1hCacheTTL,
} from '../services/api/claude.js'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { getSmallFastModel } from '../utils/model/model.js'
import { permissionBlockSignal } from '../utils/permissionBlockSignal.js'
import {
  cacheAiTitle,
  getTranscriptPath,
  saveAgentName,
  worktreeStateSignal,
} from '../utils/sessionStorage.js'
import { sideQuery } from '../utils/sideQuery.js'
import {
  isBgSession,
  isFleetViewWatching,
  updateSessionActivity,
  updateSessionName,
} from '../utils/concurrentSessions.js'
import {
  getCurrentJobShort,
  getJobDir,
  isSettledJob,
  isTerminalState,
  readAllJobs,
  readJobState,
  writeJobState,
  type JobState,
} from '../daemon/jobs.js'
import { sendRv } from '../daemon/rendezvous.js'
import { sleep } from '../utils/sleep.js'

export const LINK_SCAN_MAX_BYTES = 4_194_304
const CLASSIFY_DEBOUNCE_MS = 15_000
const DETAIL_MAX = 180
const TAIL_MAX = 2_000
const NAME_RETRIES = 3
const SIDE_QUERY_TOKEN_OVERHEAD = 2_048
const IS_RESUME = process.argv.some(
  argument =>
    argument === '-c' ||
    argument === '--continue' ||
    argument === '-r' ||
    argument === '--resume' ||
    argument.startsWith('--resume=') ||
    argument.startsWith('-r='),
)

export type ClassifierEngine = 'llm' | 'heuristic'
export type ClassifiedState = {
  state: string
  detail: string
  tempo: 'active' | 'idle' | 'blocked'
  needs?: string
  output: Record<string, string>
  source: 'preclassify' | 'heuristic' | 'llm' | 'midturn'
}

type Preclassification = Omit<ClassifiedState, 'source'> & { branch: string }

const terminalStates = new Set(['done', 'failed', 'stopped'])
const validStates = new Set(['working', 'blocked', 'done', 'failed'])
const validOutputKeys = new Set(['result'])

function truncate(value: string, max = DETAIL_MAX): string {
  if (value.length <= max) return value
  let end = max - 1
  const preceding = value.charCodeAt(end - 1)
  if (preceding >= 0xd800 && preceding <= 0xdbff) end--
  return `${value.slice(0, end)}…`
}

function insideFence(text: string, position: number): boolean {
  let fence: string | null = null
  let fenceLength = 0
  let cursor = 0
  while (cursor < position) {
    const backticks = text.indexOf('```', cursor)
    const tildes = text.indexOf('~~~', cursor)
    const next =
      backticks === -1
        ? tildes
        : tildes === -1
          ? backticks
          : Math.min(backticks, tildes)
    if (next === -1 || next >= position) break
    const character = text[next]
    let before = next - 1
    let spaces = 0
    while (before >= 0 && text[before] === ' ' && spaces < 3) {
      before--
      spaces++
    }
    const lineStart = before < 0 || text[before] === '\n'
    let length = 3
    cursor = next + 3
    while (text[cursor] === character) {
      cursor++
      length++
    }
    if (!lineStart) continue
    if (fence === null) {
      fence = character
      fenceLength = length
    } else if (fence === character && length >= fenceLength) {
      fence = null
      fenceLength = 0
    }
  }
  return fence !== null
}

const failedMarker = /(?:^|\n)\s*failed\s*[:—–-]\s*(.{3,200}?)(?=\n|$)/gi
const blockedMarker = /(?:^|\n)\s*blocked\s*[:—–-]\s*(.{3,200}?)(?=\n|$)/gi
const imBlockedMarker = /\bI'?m blocked\s*[:—–-]\s*(.{3,200}?)(?=\n|$)/gi

function latestMarker(text: string, tail: string, offset: number) {
  let latest:
    | { state: 'failed' | 'blocked'; capture: string; index: number; end: number }
    | undefined
  for (const [state, regex] of [
    ['failed', failedMarker],
    ['blocked', blockedMarker],
    ['blocked', imBlockedMarker],
  ] as const) {
    regex.lastIndex = 0
    for (const match of tail.matchAll(regex)) {
      if (insideFence(text, offset + (match.index ?? 0))) continue
      if (!latest || (match.index ?? 0) > latest.index) {
        latest = {
          state,
          capture: match[1].trim(),
          index: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length,
        }
      }
    }
  }
  return latest
}

export function closingShape(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return 'empty'
  if (insideFence(trimmed, trimmed.length)) return 'code-fence'
  const tail = trimmed.slice(-800)
  const offset = trimmed.length - tail.length
  for (const match of tail.matchAll(/(?:^|\n)\s*result:\s*\S/gi)) {
    if (!insideFence(trimmed, offset + (match.index ?? 0))) return 'result-line'
  }
  for (const match of tail.matchAll(/(?:^|\n)\s*failed:\s*\S/gi)) {
    if (!insideFence(trimmed, offset + (match.index ?? 0))) return 'failed-line'
  }
  if (/[?？]\s*$/.test(trimmed)) return 'trailing-q'
  if (/(?:^|\n)\s*(?:[-*•]|\d+\.|[|])\s/.test(trimmed.slice(-200))) {
    return 'list-or-table'
  }
  return 'declarative'
}

export function preclassify(text: string): Preclassification | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const tail = trimmed.slice(-800)
  const tailOffset = trimmed.length - tail.length
  let resultMatch: RegExpMatchArray | undefined
  for (const match of tail.matchAll(/(?:^|\n)\s*result:\s*(.+?)\s*(?:\n|$)/gi)) {
    if (!insideFence(trimmed, tailOffset + (match.index ?? 0))) resultMatch = match
  }
  let afterResult = tail
  let offset = tailOffset
  if (resultMatch) {
    const end = (resultMatch.index ?? 0) + resultMatch[0].length
    afterResult = tail.slice(end)
    offset = tailOffset + end
  }
  const marker = latestMarker(trimmed, afterResult, offset)
  if (resultMatch && !marker) {
    const result = truncate(resultMatch[1])
    const next = [...afterResult.matchAll(/(?:^|\n)\s*next:\s*\S/gi)].some(
      (match) => !insideFence(trimmed, offset + (match.index ?? 0)),
    )
    return {
      branch: next ? 'result-then-next' : 'result-marker',
      state: next ? 'working' : 'done',
      tempo: 'idle',
      detail: result,
      output: { result },
    }
  }
  if (marker?.state === 'failed') {
    return {
      branch: 'failed-marker',
      state: 'failed',
      tempo: 'idle',
      detail: truncate(marker.capture),
      output: {},
    }
  }
  if (marker?.state === 'blocked') {
    const following = afterResult.slice(marker.end)
    if (following.split(/\n\s*\n/).filter((part) => part.trim()).length >= 3) {
      return null
    }
    const disclaimed =
      /\bnothing (?:needed|required) from you\b|\bno(?: user)? action (?:needed|required)\b/i.test(
        afterResult,
      )
    if (!disclaimed) {
      const needs = truncate(marker.capture)
      return {
        branch: 'blocked-marker',
        state: 'blocked',
        tempo: 'blocked',
        needs,
        detail: needs,
        output: {},
      }
    }
    if (resultMatch) {
      const result = truncate(resultMatch[1])
      return {
        branch: 'blocked-disclaimed',
        state: 'done',
        tempo: 'idle',
        detail: result,
        output: { result },
      }
    }
    return null
  }
  if (/[?？]\s*$/.test(tail) && tail.replace(/[?？\s]+$/, '').length >= 4) {
    const sentence = Math.max(
      tail.lastIndexOf('\n'),
      tail.lastIndexOf('. '),
      tail.lastIndexOf('! '),
      tail.lastIndexOf('? ', tail.length - 2),
    )
    if (!insideFence(trimmed, tailOffset + sentence)) {
      const needs = truncate(tail.slice(sentence + 1).trim())
      return {
        branch: 'trailing-q',
        state: 'blocked',
        tempo: 'blocked',
        needs,
        detail: needs,
        output: {},
      }
    }
  }
  const sentence = Math.max(
    0,
    tail.lastIndexOf('. '),
    tail.lastIndexOf('! '),
    tail.lastIndexOf('? '),
    tail.lastIndexOf('\n'),
  )
  const last = tail.slice(sentence).replace(/^[.!?\s]+/, '')
  const fenced = insideFence(trimmed, tailOffset + sentence)
  const waitingExternal =
    /\b(?:waiting (?:for|on)|pending)\s+(?:the\s+)?(?:CI|build|tests?|reviewer|deploy(?:ment)?|workflow|checks?|rollout|merge queue)\b/i.exec(
      last,
    )
  if (waitingExternal && !fenced) {
    return {
      branch: 'wait-external',
      state: 'working',
      tempo: 'idle',
      detail: truncate(waitingExternal[0]),
      output: {},
    }
  }
  const awaitingUser =
    /\b(?:awaiting|waiting (?:for|on)|pending)\s+(?:your\s+(?:feedback|input|decision|response|approval|direction|guidance|go-ahead)|you\b|the user\b)/i.exec(
      last,
    )
  if (awaitingUser && !fenced) {
    const needs = truncate(last.slice(awaitingUser.index).trim())
    return {
      branch: 'awaiting-user',
      state: 'blocked',
      tempo: 'blocked',
      needs,
      detail: needs,
      output: {},
    }
  }
  const ask =
    /\b(please (?:run|provide|confirm|clarify|choose|let me know)|let me know (?:which|what|how|when)|which (?:option|approach|one)|should I (?:proceed|continue|use))\b/i.exec(
      last,
    )
  if (ask && !fenced) {
    const needs = truncate(last.slice(ask.index).trim())
    return {
      branch: 'ask-verb',
      state: 'blocked',
      tempo: 'blocked',
      needs,
      detail: needs,
      output: {},
    }
  }
  if (
    !fenced &&
    /\b(not logged in|please run \/login|authentication failed|invalid api key|oauth token (?:expired|revoked)|credit balance (?:is )?too low|usage limit reached|mcp (?:server )?(?:authentication|auth|authorization|unauthorized)|mcp (?:server )?(?:credential|token) (?:missing|expired|invalid)|401 unauthorized|403 forbidden|token (?:has )?expired|bad credentials|gh auth login|gcloud auth login|aws (?:sso )?login)\b/i.test(
      last,
    )
  ) {
    return {
      branch: 'auth-prose',
      state: 'blocked',
      tempo: 'blocked',
      needs: truncate(last),
      detail: 'authentication required',
      output: {},
    }
  }
  const workingVerb =
    /^(?:Let me (?!know\b)|(?:I(?:'?ll| will) |I'?m going to |Going to )(?!need\b|require\b|wait\b|leave\b|hold\b|skip\b|stop\b)|Proceeding |Moving (?:on|to)\b|Continuing |Starting |Trying |Checking |Looking |Searching |Reading |Investigating |Running |Re-?running |Building |Rebuilding |Installing |Fetching |Applying |Fixing |Patching |Updating |Adding |Removing |Deleting |Importing |Refactoring |Rewriting |Writing |Grepping |Scanning |Wrapping |Switching |Testing |Verifying |Regenerating |Pushing |Pulling )/i
  const delayed =
    /\b(?:once |when |after |until |as soon as )(?:you|it|the|that|this|they)\b|\bagain in\b|\bcheck back\b|\bin ~?\d+\s*(?:s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:ours?|rs?)?)\b|\bthen\.?\s*$|\bwhichever you\b|\bhold(?:ing)? for your\b|\b(?:to|and) wait for\b|\bgive it (?:more |some )?time\b|\bif (?:you(?:'d| want| prefer| need|'re)?|that(?:'s| helps| works)?|useful|needed|helpful|desired)\b|\b(?:isn'?t|not|won'?t) going to work\b/i
  if (!fenced && workingVerb.test(last) && !delayed.test(last)) {
    return {
      branch: 'working-verb',
      state: 'working',
      tempo: 'active',
      detail: truncate(last),
      output: {},
    }
  }
  if (
    !fenced &&
    /^(?:(?:\*\*)?[1-9]\d* (?:agent|cron|task|fork|job|worker|PR|check)s? (?:in flight|remaining|active|still (?:running|working)|pending|running|launched)\b|(?:Continuous )?(?:[Ll]oop|[Cc]rons?|[Bb]abysit) (?:active|healthy|continuing|running|will keep|continues)\b|Waiting for (?:the )?(?:agent|cron|task|fork|worker|job|remaining|them)s?\b|Agents? will report back\b|Waiting\.?$)/.test(
      last,
    )
  ) {
    return {
      branch: 'agents-status',
      state: 'working',
      tempo: 'idle',
      detail: truncate(last),
      output: {},
    }
  }
  if (
    !fenced &&
    /^(?:I will|I'll|Will) (?:check back|re-?check|poll|look again|retry|re-?run|try again) (?:(?:when|once|after|until) (?!your?\b)|in\b|again\b)/i.test(
      last,
    )
  ) {
    return {
      branch: 'will-check-back',
      state: 'working',
      tempo: 'idle',
      detail: truncate(last),
      output: {},
    }
  }
  for (const [branch, regex, state, tempo] of [
    [
      'cant-proceed',
      /^I (?:can(?:'?t|not)|am unable to) (?:proceed|continue|make (?:any )?progress|complete|fix this)\b/i,
      'blocked',
      'blocked',
    ],
    [
      'giving-up',
      /^(?:Giving up|I(?:'m| am) giving up|The task is not actionable)\b/i,
      'failed',
      'idle',
    ],
    [
      'pushed-committed',
      /^(?:Pushed (?:to `|`[0-9a-f]{7,})|Committed as `?[0-9a-f]{7,}\b|Commit: `?[0-9a-f]{7,}\b|(?:Opened|Created) PR #?\d)/,
      'done',
      'idle',
    ],
    ['ready-for', /^Ready (?:for review|to (?:upload|merge|ship|land))\b/, 'done', 'idle'],
    ['verdict-marker', /^VERDICT: (?:PASS|FAIL)\b/, 'done', 'idle'],
    [
      'please-do-x',
      /^Please (?:start|run|provide|grant|export|add|install|configure|give me|paste|point me|set (?:the |up |`?[A-Z][A-Z0-9_]+\b))/,
      'blocked',
      'blocked',
    ],
    [
      'stopping-here',
      /^(?:Stopping here|I've stopped here|Parked (?:the|this) branch|Paused here)(?:\.|$| —| -| until| pending| since| because)/i,
      'blocked',
      'blocked',
    ],
  ] as const) {
    if (!fenced && regex.test(last)) {
      const detail = truncate(last)
      return {
        branch,
        state,
        tempo,
        detail,
        ...(tempo === 'blocked' ? { needs: detail } : {}),
        output:
          state === 'done' &&
          (branch === 'pushed-committed' || branch === 'verdict-marker')
            ? { result: detail }
            : {},
      }
    }
  }
  return null
}

function heuristic(text: string): Preclassification {
  const detail = text
    .split('\n')
    .map((line) => line.trim())
    .findLast(Boolean)
  return {
    branch: 'heuristic',
    state: 'working',
    tempo: 'idle',
    detail: detail ? truncate(detail) : '—',
    output: {},
  }
}

const responseSchema = z.object({
  state: z.string().nullish(),
  detail: z.string().nullish(),
  tempo: z.string().nullish(),
  needs: z.string().nullish(),
  output: z.record(z.string(), z.unknown()).nullish(),
})

function parseResponse(text: string): z.infer<typeof responseSchema> | null {
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  try {
    const parsed = responseSchema.safeParse(
      JSON.parse(unfenced.slice(start, end + 1)),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function normalize(
  value: z.infer<typeof responseSchema>,
  previous: string,
  fallback?: Preclassification | null,
): Omit<ClassifiedState, 'source'> {
  const state =
    typeof value.state === 'string' && validStates.has(value.state)
      ? value.state
      : (fallback?.state ?? previous)
  const tempo = terminalStates.has(state)
    ? 'idle'
    : value.tempo === 'active' ||
        value.tempo === 'idle' ||
        value.tempo === 'blocked'
      ? value.tempo
      : (fallback?.tempo ?? 'active')
  const output: Record<string, string> = {}
  const candidate = value.output ?? fallback?.output
  if (candidate && typeof candidate === 'object') {
    for (const [key, raw] of Object.entries(candidate)) {
      if (validOutputKeys.has(key) && typeof raw === 'string' && raw) {
        output[key] = truncate(raw)
      }
    }
  }
  const needs =
    typeof value.needs === 'string' && value.needs
      ? value.needs
      : tempo === 'blocked'
        ? fallback?.needs
        : undefined
  return {
    state,
    detail:
      typeof value.detail === 'string' && value.detail
        ? value.detail
        : (fallback?.detail ?? ''),
    tempo,
    needs,
    output,
  }
}

const STATE_DESCRIPTIONS = {
  working:
    'actively progressing on the task — narrating plans, calling tools, or writing code; no pending question for the user',
  blocked:
    'the last message ends on a direct question or explicit request for the user ("want me to…?", "which do you prefer?", "approve this?") — nothing will happen until the user replies',
  done: 'the task the user asked for is fully delivered and there is no further work the agent plans to do — not just a progress update, not "almost done", not "let me know what you think"',
  failed:
    'the agent has given up or hit something unrecoverable — missing credential, broken build it cannot fix, wrong repo, task impossible as framed; distinct from blocked (user can unblock) and done (succeeded)',
}

const stateDescriptions = Object.entries(STATE_DESCRIPTIONS)
  .map(([state, description]) => `  "${state}": ${description}`)
  .join('\n')

const CLASSIFIER_EXAMPLES = `EXAMPLES (message → classification):

"Reading config files to understand the setup."
→ {"state":"working","detail":"reading config files","tempo":"active","output":{}}

"I found the bug in auth.ts:42. Want me to fix it or just report?"
→ {"state":"blocked","detail":"found bug, awaiting direction","tempo":"blocked","needs":"Want me to fix it or just report?","output":{}}

"PR opened: https://github.com/acme/repo/pull/123\\nresult: fixed auth race in auth.ts, PR #123"
→ {"state":"done","detail":"opened PR #123","tempo":"idle","output":{"result":"fixed auth race in auth.ts, PR #123"}}

"I can't proceed — the repo requires GITHUB_TOKEN and it's not set."
→ {"state":"blocked","detail":"missing GITHUB_TOKEN","tempo":"blocked","needs":"set GITHUB_TOKEN env var","output":{}}

"Can't run the tests — needs the openapi.yaml file which isn't in this checkout. Stopping here."
→ {"state":"blocked","detail":"missing openapi.yaml","tempo":"blocked","needs":"provide config/openapi.yaml","output":{}}
  ("stopping" + names a specific missing resource → blocked, not failed)

"The build is broken on main and I can't reproduce locally. Giving up."
→ {"state":"failed","detail":"cannot reproduce build failure","tempo":"idle","output":{}}
  (no specific resource would unblock; exhausted approaches → failed)

"Tests pass. Let me know if you want me to also update the docs."
→ {"state":"done","detail":"tests pass","tempo":"idle","output":{"result":"tests pass"}}
  (offer of optional extra work ≠ blocked; the ask is satisfied)

"Waiting for CI to finish (~8 min)."
→ {"state":"working","detail":"waiting for CI","tempo":"idle","output":{}}

"API Error: 401 Invalid API key · Please run /login"
→ {"state":"blocked","detail":"authentication failed","tempo":"blocked","needs":"run /login","output":{}}`

const CLASSIFIER_PROMPT = `You are a background-agent state classifier. Given the tail of an agent's assistant-message transcript, return JSON describing the agent's current state.

STATES — the agent can cycle between non-terminals (working↔blocked) or land on a terminal (done/failed):
${stateDescriptions}

Only change state if the tail clearly indicates a transition. When uncertain, keep current — stale-correct beats wrong. Don't jump backward unless the job explicitly restarted.

DISAMBIGUATION:
  • Tail ends on a question to the user → "blocked" (even if prior work finished). Exception: "let me know if you want X too" after delivering the ask is an optional offer → "done".
  • Agent asks the user to RUN something it can't (auth login, interactive CLI, provide a secret) → "blocked", needs = the command/value.
  • Agent says it's waiting on CI/build/external process it started → "working" with tempo:"idle" (not blocked — no user action unblocks it).
  • Agent hit an error but is retrying/investigating → "working".
  • Agent stopped and names a SPECIFIC missing thing the user could supply (file, env var, credential, OTP, path, decision) → "blocked", even if phrased as "can't proceed" / "stopping here". Test: would handing the user that one thing unblock it? Yes → blocked.
  • Agent stopped and the task is structurally impossible (wrong repo, feature doesn't exist, premise false, tried everything) → "failed".
  • API/auth/infra error text → "blocked" (transient or user-fixable), needs = the fix. Never "failed" for these. Covers: Anthropic API ("401", "/login", "rate limited", "overloaded", "529", "credit balance", "usage limit"); MCP servers (OAuth token expired/revoked, vault credential missing, MCP auth/unauthorized); external services (GitHub "bad credentials", GitLab PAT, "gh auth login", "gcloud auth login", "aws sso login", Stripe 401, Slack token); any prose naming a specific re-auth step.
  • Scope notes, caveats, or follow-up offers AFTER a committed deliverable ("out of scope", "happy to also X if you want", "note: Y is untested") → "done". The deliverable shipped; the note is FYI.

${CLASSIFIER_EXAMPLES}

OUTPUT:
  • "state": one of working/blocked/done/failed
  • "detail": one concise line describing what the agent is doing
  • "tempo": "active" (model working) / "idle" (external — CI, reviewer, timer) / "blocked" (you — can't proceed without your reply)
  • "needs": when tempo="blocked", the exact question or command the user should act on, copied verbatim from the tail. Omit otherwise.
  • "output.result": one-sentence headline naming a finished deliverable (direct answer, URL/path the agent PRODUCED, command the user should run next). Max ${DETAIL_MAX} chars, first sentence verbatim. If the tail has \`result:\` on its own line, that line IS the result. Omit ({}) when still working, or when the "outcome" is just "done"/"finished" with no info, or when it restates the ask/state/detail.

Respond with ONLY this JSON, no code fences:
{"state":"<name>","detail":"<one-line>","tempo":"<active|idle|blocked>","needs":"<when-blocked>","output":{...}}`

function classifierInput(options: {
  tail: string
  prev: string
  latestAsk: string
  toolSummary: string
  minsInState: number
}): string {
  return `Current state: ${options.prev} (for ${options.minsInState}m)\nTool calls so far: ${options.toolSummary || 'none'}${
    options.latestAsk ? `\nUser's most recent ask: "${options.latestAsk}"` : ''
  }\n\nAssistant message tail (last ${options.tail.length} chars):\n${options.tail}`
}

export async function classify(
  tail: string,
  previous: string,
  latestAsk: string,
  toolSummary: string,
  minsInState: number,
  engine: ClassifierEngine,
): Promise<ClassifiedState | null> {
  const started = Date.now()
  const preclassified = preclassify(tail)
  let path: 'preclassify' | 'heuristic' | 'llm' | 'apiError'
  let result: ClassifiedState | null
  let attempts = 0
  let usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  }
  if (preclassified) {
    path = 'preclassify'
    result = {
      ...normalize({}, previous, preclassified),
      source: 'preclassify',
    }
  } else if (engine === 'heuristic') {
    path = 'heuristic'
    result = { ...normalize({}, previous, heuristic(tail)), source: 'heuristic' }
  } else {
    path = 'apiError'
    const input = classifierInput({
      tail: tail.slice(-TAIL_MAX),
      prev: previous,
      latestAsk,
      toolSummary,
      minsInState,
    })
    let parsed: z.infer<typeof responseSchema> | null = null
    for (let retry = 0; retry < 2 && !parsed; retry++) {
      attempts = retry + 1
      try {
        const response = await sideQuery({
          querySource: 'agent_classifier',
          model: getSmallFastModel(),
          max_tokens: 1_024 + SIDE_QUERY_TOKEN_OVERHEAD,
          maxRetries: 3,
          skipSystemPromptPrefix: true,
          system: [
            {
              type: 'text',
              text: CLASSIFIER_PROMPT,
              cache_control: getCacheControl({
                ttl: should1hCacheTTL('agent_classifier') ? '1h' : undefined,
              }),
            },
          ],
          messages: [
            {
              role: 'user',
              content:
                retry === 0
                  ? input
                  : `${input}\n\nPrevious response was not valid JSON. Respond with ONLY the JSON object, nothing else.`,
            },
          ],
        })
        path = 'llm'
        if (response.usage) {
          usage = {
            input_tokens: usage.input_tokens + response.usage.input_tokens,
            output_tokens: usage.output_tokens + response.usage.output_tokens,
            cache_read_input_tokens:
              usage.cache_read_input_tokens +
              (response.usage.cache_read_input_tokens ?? 0),
            cache_creation_input_tokens:
              usage.cache_creation_input_tokens +
              (response.usage.cache_creation_input_tokens ?? 0),
          }
        }
        const text = response.content.find((block) => block.type === 'text')
        const raw = text?.type === 'text' ? text.text.trim() : ''
        if (!raw) {
          logForDebugging(
            `[classifier] no text block in response, types=${response.content.map(block => block.type).join(',')}`,
          )
          continue
        }
        parsed = parseResponse(raw)
      } catch (error) {
        logForDebugging(`[classifier] sideQuery failed: ${String(error)}`)
        break
      }
    }
    result = parsed
      ? { ...normalize(parsed, previous), source: 'llm' }
      : null
  }
  logEvent('tengu_bg_classify', {
    path,
    branch:
      preclassified?.branch ?? (path === 'heuristic' ? 'heuristic' : 'none'),
    closingShape: closingShape(tail),
    prevState: previous,
    newState: result?.state ?? 'null',
    stateChanged: result !== null && result.state !== previous,
    minsInPrevState: Math.round(minsInState),
    durationMs: Date.now() - started,
    tailChars: tail.length,
    ...(path === 'llm'
      ? {
          attempts,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadInputTokens: usage.cache_read_input_tokens,
          cacheCreationInputTokens: usage.cache_creation_input_tokens,
        }
      : {}),
  })
  return result
}

export type ClassifierJobState = {
  prevState: string
  prevStateSince: number
  accumulatedOutputs: Record<string, string>
  lastClassifyAt: number
  capturedIntent: string
  inFlight: Promise<void> | null
  nameInFlight: boolean
  dispatchEmitted: boolean
  latestAsk: string
  kicked: boolean
  lastMsgCount: number
  permissionBridgeSubscribed: boolean
  bridgeWriteChain: Promise<void>
  lastEmittedDetail: string
  onClassified?: (classification: ClassifiedState, midturn: boolean) => void
}

export function createClassifierJobState(): ClassifierJobState {
  return {
    prevState: '',
    prevStateSince: Date.now(),
    accumulatedOutputs: {},
    lastClassifyAt: 0,
    capturedIntent: '',
    inFlight: null,
    nameInFlight: false,
    dispatchEmitted: false,
    latestAsk: '',
    kicked: false,
    lastMsgCount: 0,
    permissionBridgeSubscribed: false,
    bridgeWriteChain: Promise.resolve(),
    lastEmittedDetail: '',
  }
}

function stripSystemReminder(text: string): string {
  const end = text.lastIndexOf('</system-reminder>')
  return (end >= 0 ? text.slice(end + 18) : text).trim()
}

export function captureIntent(
  state: ClassifierJobState,
  text: string | undefined,
): string {
  if (state.capturedIntent || !text) return state.capturedIntent
  state.capturedIntent = stripSystemReminder(text)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500)
  return state.capturedIntent
}

export function captureLatestAsk(
  state: ClassifierJobState,
  text: string | undefined,
): void {
  if (!text) return
  state.latestAsk = stripSystemReminder(text)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300)
}

function emitDispatch(state: ClassifierJobState, template: string): void {
  if (!isBgSession() || state.dispatchEmitted) return
  state.dispatchEmitted = true
  if (IS_RESUME) return
  logEvent('tengu_bg_agent_dispatch', {
    agent: template,
    source: process.env.CLAUDE_BG_SOURCE ?? 'shell',
    intentLength: state.capturedIntent.length,
  })
}

const emptyInFlight = { tasks: 0, queued: 0, kinds: [] as string[] }

async function writeStateAndNotify(
  jobDir: string,
  state: JobState,
  patch: Record<string, unknown>,
): Promise<void> {
  await writeJobState(jobDir, state)
  if (Object.keys(patch).length) sendRv({ type: 'state', patch })
}

export function markTurnActive(
  state: ClassifierJobState,
  short: string,
  prompt?: string,
): void {
  ensurePermissionBridge(state)
  if (state.kicked) return
  state.kicked = true
  state.bridgeWriteChain = state.bridgeWriteChain
    .then(async () => {
      const jobDir = getJobDir(short)
      const current = await readJobState(jobDir)
      if (!current || current.tempo === 'active') return
      if (isSettledJob(current) && !prompt) return
      const now = new Date().toISOString()
      await writeStateAndNotify(
        jobDir,
        {
          ...current,
          tempo: 'active',
          inFlight: emptyInFlight,
          needs: undefined,
          output: null,
          updatedAt: now,
        },
        { tempo: 'active', needs: '' },
      )
      if (prompt) {
        await appendFile(
          join(jobDir, 'timeline.jsonl'),
          `${JSON.stringify({
            at: now,
            state: current.state,
            detail: truncate(stripSystemReminder(prompt), 200),
            text: '',
          })}\n`,
          'utf8',
        ).catch(() => {})
      }
    })
    .catch(() => {})
}

export function markTurnAborted(
  state: ClassifierJobState,
  short: string,
): void {
  state.kicked = false
  state.bridgeWriteChain = state.bridgeWriteChain
    .then(async () => {
      const jobDir = getJobDir(short)
      const current = await readJobState(jobDir)
      if (!current || current.tempo !== 'active') return
      await writeStateAndNotify(
        jobDir,
        {
          ...current,
          tempo: 'idle',
          inFlight: undefined,
          updatedAt: new Date().toISOString(),
        },
        { tempo: 'idle' },
      )
    })
    .catch(() => {})
}

export async function setPermissionBlock(
  short: string,
  needs: string | null,
): Promise<void> {
  const jobDir = getJobDir(short)
  const first = await readJobState(jobDir)
  if (!first) return
  if (needs) {
    if (isTerminalState(first.state)) return
    if (first.tempo === 'blocked' && first.needs === needs) return
  } else if (first.tempo !== 'blocked') return
  const latest = (await readJobState(jobDir)) ?? first
  if (needs) {
    if (isTerminalState(latest.state)) return
    if (latest.tempo === 'blocked' && latest.needs === needs) return
  } else if (latest.tempo !== 'blocked') {
    return
  }
  await writeStateAndNotify(
    jobDir,
    {
      ...latest,
      tempo: needs ? 'blocked' : 'active',
      inFlight: emptyInFlight,
      needs: needs ?? undefined,
      updatedAt: new Date().toISOString(),
    },
    { tempo: needs ? 'blocked' : 'active', needs: needs ?? '' },
  )
}

export function apiFailureClassification(
  type:
    | 'authentication_failed'
    | 'billing_error'
    | 'rate_limit'
    | 'server_error'
    | 'invalid_request'
    | 'max_output_tokens'
    | 'unknown'
    | undefined,
  detail = '',
): { state: 'blocked' | 'failed'; needs: string } | null {
  switch (type) {
    case 'authentication_failed':
      return { state: 'blocked', needs: 'login required — run /login' }
    case 'billing_error':
      return { state: 'blocked', needs: 'usage limit reached — check plan' }
    case 'rate_limit':
      return { state: 'blocked', needs: 'rate limited — wait and retry' }
    case 'server_error':
      return { state: 'blocked', needs: 'API unavailable — retry' }
    case 'invalid_request':
      return /\b(too long|too large|exceeds|token limit|prompt is too long)\b/i.test(
        detail,
      )
        ? { state: 'blocked', needs: 'request too large — /compact or trim' }
        : { state: 'blocked', needs: 'invalid API request — see detail' }
    case 'max_output_tokens':
      return null
    case undefined:
      return { state: 'blocked', needs: 'API error — see detail' }
    case 'unknown':
    default:
      return { state: 'failed', needs: 'API error' }
  }
}

export async function markApiFailure(
  state: ClassifierJobState,
  short: string,
  type: Parameters<typeof apiFailureClassification>[0],
  message: string,
): Promise<void> {
  const classification = apiFailureClassification(type, message)
  if (!classification) return
  const detail = truncate(message.replace(/\s+/g, ' ').trim(), 160)
  const needs = `${classification.needs}${detail ? ` · ${detail}` : ''}`
  state.bridgeWriteChain = state.bridgeWriteChain
    .then(async () => {
      const jobDir = getJobDir(short)
      const current = await readJobState(jobDir)
      if (!current || isSettledJob(current)) return
      const now = new Date().toISOString()
      const tempo = classification.state === 'failed' ? 'idle' : 'blocked'
      await writeStateAndNotify(
        jobDir,
        {
          ...current,
          state: classification.state,
          detail,
          tempo,
          inFlight: emptyInFlight,
          needs: classification.state === 'failed' ? undefined : needs,
          updatedAt: now,
          firstTerminalAt:
            classification.state === 'failed' && !current.firstTerminalAt
              ? now
              : current.firstTerminalAt,
        },
        {
          state: classification.state,
          detail,
          tempo,
          needs: classification.state === 'failed' ? '' : needs,
        },
      )
      await appendFile(
        join(jobDir, 'timeline.jsonl'),
        `${JSON.stringify({
          at: now,
          state: classification.state,
          detail,
          text: detail,
        })}\n`,
        'utf8',
      ).catch(() => {})
    })
    .catch(() => {})
  await state.bridgeWriteChain
  state.prevState = classification.state
  state.kicked = false
}

export function summarizeToolCalls(
  messages: Array<{ message?: { content?: unknown } }>,
): string {
  const counts = new Map<string, number>()
  for (const wrapper of messages) {
    const content = wrapper.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (
        block &&
        typeof block === 'object' &&
        'type' in block &&
        block.type === 'tool_use' &&
        'name' in block &&
        typeof block.name === 'string'
      ) {
        counts.set(block.name, (counts.get(block.name) ?? 0) + 1)
      }
    }
  }
  return [...counts]
    .map(([name, count]) => (count > 1 ? `${name}×${count}` : name))
    .join(', ')
}

function assistantText(messages: Array<{ message?: { content?: unknown } }>) {
  const parts: string[] = []
  for (const wrapper of messages) {
    const content = wrapper.message?.content
    if (typeof content === 'string') parts.push(content)
    else if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'text' &&
          'text' in block &&
          typeof block.text === 'string'
        ) {
          parts.push(block.text)
        }
      }
    }
  }
  return parts.join('\n\n')
}

function latestToolDetail(
  messages: Array<{ message?: { content?: unknown } }>,
): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const content = messages[index]?.message?.content
    if (!Array.isArray(content)) continue
    const tool = content.findLast(
      block =>
        block !== null &&
        typeof block === 'object' &&
        'type' in block &&
        block.type === 'tool_use',
    ) as
      | { name?: unknown; input?: Record<string, unknown> }
      | undefined
    if (!tool || typeof tool.name !== 'string') continue
    const input = tool.input
    const description =
      typeof input?.description === 'string'
        ? input.description
        : typeof input?.command === 'string'
          ? input.command
          : typeof input?.file_path === 'string'
            ? input.file_path
            : typeof input?.pattern === 'string'
              ? input.pattern
              : ''
    return description
      ? `${tool.name} · ${truncate(description.replace(/[\r\n]+/g, ' '), 80)}`
      : tool.name
  }
  return 'working'
}

async function generateJobName(
  jobDir: string,
  intent: string,
  agentContext?: string,
): Promise<void> {
  const records = await readAllJobs().catch(() => [])
  const taken = new Set(
    records
      .filter(record => !isTerminalState(record.state.state) && record.state.name)
      .map(record => record.state.name!),
  )
  let candidate = ''
  for (let attempt = 0; attempt < NAME_RETRIES; attempt++) {
    const avoid = taken.size
      ? `\n\nAvoid these (already taken): ${[...taken].join(', ')}`
      : ''
    const response = await sideQuery({
      querySource: 'agent_classifier',
      model: getSmallFastModel(),
      max_tokens: 32 + SIDE_QUERY_TOKEN_OVERHEAD,
      maxRetries: 1,
      messages: [
        {
          role: 'user',
          content: `2-4 word lowercase label for this job.
User: "${truncate(intent, 300)}"${agentContext ? `\nAgent: "${truncate(agentContext, 300)}"` : ''}

Include the MOST SPECIFIC identifier (component/file/feature). Skip generic
verbs like fix/add/update. Respond with ONLY the label.${avoid}`,
        },
      ],
    }).catch(() => null)
    const text = response?.content.find(block => block.type === 'text')
    if (!text || text.type !== 'text') return
    candidate = truncate(text.text.trim().toLowerCase(), 40)
    if (!candidate) return
    if (!taken.has(candidate)) break
    taken.add(candidate)
  }
  if (!candidate || taken.has(candidate)) return
  const current = await readJobState(jobDir)
  if (!current || current.name) return
  const now = new Date().toISOString()
  await writeStateAndNotify(
    jobDir,
    { ...current, name: candidate, nameSource: 'auto', updatedAt: now },
    { name: candidate },
  )
  cacheAiTitle(candidate)
  void updateSessionName(candidate)
  void saveAgentName(getSessionId(), candidate, getTranscriptPath(), 'auto')
}

export async function classifyAndPush(
  state: ClassifierJobState,
  short: string,
  template: string,
  fallbackIntent: string,
  messages: Array<{ message?: { content?: unknown } }>,
  toolActive: boolean,
  engine: ClassifierEngine,
  midturn = false,
): Promise<void> {
  emitDispatch(state, template)
  if (state.inFlight) {
    await Promise.race([
      state.inFlight.catch(() => {}),
      sleep(60_000, undefined, { unref: true }),
    ])
  }
  const task = (async () => {
    const jobDir = getJobDir(short)
    const before = await readJobState(jobDir)
    if (
      before &&
      isSettledJob(before) &&
      messages.length === state.lastMsgCount
    ) {
      return
    }
    if (before && isTerminalState(before.state)) {
      state.prevState = ''
      state.prevStateSince = Date.parse(before.updatedAt) || Date.now()
    } else if (before && before.state !== state.prevState) {
      state.prevState = before.state
      state.prevStateSince = Date.parse(before.updatedAt) || Date.now()
    }
    const text = assistantText(messages)
    const classified = midturn
      ? before?.tempo === 'blocked'
        ? null
        : ({
          state: 'working',
          detail: latestToolDetail(messages),
          tempo: 'active',
          output: {},
          source: 'midturn',
        } satisfies ClassifiedState)
      : await classify(
          text,
          state.prevState || 'working',
          state.latestAsk,
          summarizeToolCalls(messages),
          Math.round((Date.now() - state.prevStateSince) / 60_000),
          engine,
        )
    if (!classified) return
    if (toolActive) {
      if (isTerminalState(classified.state)) {
        classified.state = state.prevState || 'working'
      }
      if (classified.tempo !== 'active') classified.tempo = 'active'
    }
    if (classified.state !== state.prevState) {
      state.prevState = classified.state
      state.prevStateSince = Date.now()
    }
    state.accumulatedOutputs = classified.output
    state.onClassified?.(classified, midturn)
    if (!isBgSession()) {
      state.lastMsgCount = messages.length
      if (isFleetViewWatching()) {
        await updateSessionActivity({
          state: classified.state,
          detail: classified.detail,
          tempo: isTerminalState(classified.state) ? 'idle' : classified.tempo,
          needs:
            classified.tempo === 'blocked' ? classified.needs : undefined,
        })
      }
      return
    }
    state.lastMsgCount = messages.length
    await mkdir(jobDir, { recursive: true }).catch(() => {})
    const current = (await readJobState(jobDir)) ?? before
    if (
      current &&
      isSettledJob(current) &&
      current.updatedAt !== before?.updatedAt
    ) {
      return
    }
    const transcriptPath = getTranscriptPath()
    const linkOffset =
      current?.linkScanPath && current.linkScanPath !== transcriptPath
        ? 0
        : (current?.linkScanOffset ?? 0)
    const scanned = await scanLinkRecords(
      transcriptPath,
      current?.children ?? null,
      linkOffset,
    )
    const latest = (await readJobState(jobDir)) ?? current
    const now = new Date().toISOString()
    const terminal = isTerminalState(classified.state)
    const firstTerminal = terminal && !latest?.firstTerminalAt
    if (firstTerminal) {
      logEvent('tengu_bg_agent_terminal', {
        agent: template,
        outcome: classified.state,
        durationMs: latest
          ? Date.now() - Date.parse(latest.createdAt)
          : 0,
        classifySource: classified.source,
      })
    }
    const preserveBlock =
      latest?.tempo === 'blocked' && latest.updatedAt !== before?.updatedAt
    const tempo = terminal ? 'idle' : preserveBlock ? 'blocked' : classified.tempo
    const needs = terminal
      ? undefined
      : preserveBlock
        ? latest?.needs
        : classified.tempo === 'blocked'
          ? classified.needs
          : undefined
    await writeStateAndNotify(
      jobDir,
      {
        state: classified.state,
        detail: classified.detail,
        tempo,
        inFlight: emptyInFlight,
        needs,
        output:
          Object.keys(classified.output).length > 0 ? classified.output : null,
        children: scanned.children,
        linkScanOffset: scanned.linkScanOffset,
        linkScanPath: transcriptPath,
        template,
        routine: latest?.routine,
        respawnFlags: latest?.respawnFlags ?? [],
        intent: latest?.intent ?? fallbackIntent ?? state.capturedIntent,
        initialPrompt: latest?.initialPrompt,
        name: latest?.name,
        nameSource: latest?.nameSource,
        sessionId: latest?.sessionId ?? getSessionId(),
        resumeSessionId: getSessionId(),
        cliVersion: MACRO.VERSION,
        cwd: current?.cwd ?? getCwd(),
        ...worktreeOwnershipFields(
          scanned.worktree as Parameters<typeof worktreeOwnershipFields>[0],
          latest ?? undefined,
        ),
        originCwd: latest?.originCwd,
        bridgeSessionId: latest?.bridgeSessionId,
        bridgeSessionSeq: latest?.bridgeSessionSeq,
        backend: latest?.backend ?? 'daemon',
        createdAt: latest?.createdAt ?? now,
        updatedAt: now,
        firstTerminalAt:
          firstTerminal
            ? now
            : (latest?.firstTerminalAt ?? null),
      },
      {
        state: classified.state,
        detail: classified.detail,
        tempo,
        needs: needs ?? '',
      },
    )
    await appendFile(
      join(jobDir, 'timeline.jsonl'),
      `${JSON.stringify({
        at: now,
        state: classified.state,
        detail: classified.detail,
        text: text.slice(-4_000),
      })}\n`,
      'utf8',
    ).catch(() => {})
    const intent = current?.intent || fallbackIntent || state.capturedIntent
    if (
      !current?.name &&
      intent &&
      engine === 'llm' &&
      !state.nameInFlight
    ) {
      const firstAssistantText = messages
        .map(message => assistantText([message]))
        .find(Boolean)
      const toolSummary = firstAssistantText ? '' : summarizeToolCalls(messages)
      const context = truncate(
        (firstAssistantText ?? (toolSummary ? `[calling ${toolSummary}]` : ''))
          .replace(/\s+/g, ' ')
          .trim(),
        500,
      )
      state.nameInFlight = true
      void generateJobName(jobDir, intent, context)
        .catch(() => {})
        .finally(() => {
          state.nameInFlight = false
        })
    }
    logForDebugging(
      `[classifier] ${state.prevState} · ${classified.detail}${needs ? ` · needs: ${needs}` : ''}`,
    )
  })()
  state.inFlight = task
  try {
    await task
  } finally {
    if (state.inFlight === task) state.inFlight = null
    state.kicked = false
  }
}

export function classifyAndPushDebounced(
  state: ClassifierJobState,
  short: string,
  template: string,
  messages: Array<{ message?: { content?: unknown } }>,
  toolActive: boolean,
  engine: ClassifierEngine,
): void {
  if (!state.kicked) {
    state.kicked = true
    void (async () => {
      const jobDir = getJobDir(short)
      const current = await readJobState(jobDir)
      if (!current || current.tempo === 'active') return
      if (isSettledJob(current)) return
      await writeStateAndNotify(
        jobDir,
        {
          ...current,
          tempo: 'active',
          inFlight: emptyInFlight,
          needs: undefined,
          output: null,
          updatedAt: new Date().toISOString(),
        },
        { tempo: 'active', needs: '' },
      )
    })().catch(() => {})
  }
  const now = Date.now()
  if (now - state.lastClassifyAt < CLASSIFY_DEBOUNCE_MS || state.inFlight) return
  state.lastClassifyAt = now
  void classifyAndPush(
    state,
    short,
    template,
    state.capturedIntent,
    messages,
    toolActive,
    engine,
    true,
  ).catch(() => {})
}

export function worktreeOwnershipFields(
  worktree:
    | {
        worktreePath: string
        worktreeBranch?: string
        hookBased?: boolean
        enteredExisting?: boolean
      }
    | null
    | undefined,
  previous?: JobState,
) {
  if (worktree === undefined) {
    return {
      worktreePath: previous?.worktreePath,
      worktreeBranch: previous?.worktreeBranch,
      worktreeHookBased: previous?.worktreeHookBased,
    }
  }
  if (worktree === null || worktree.enteredExisting) {
    return {
      worktreePath: undefined,
      worktreeBranch: undefined,
      worktreeHookBased: undefined,
    }
  }
  return {
    worktreePath: worktree.worktreePath,
    worktreeBranch: worktree.worktreeBranch,
    worktreeHookBased: worktree.hookBased,
  }
}

export async function setWorktreeOwnership(
  short: string,
  worktree: Parameters<typeof worktreeOwnershipFields>[0],
): Promise<void> {
  const jobDir = getJobDir(short)
  const current = await readJobState(jobDir)
  if (!current) return
  const fields = worktreeOwnershipFields(worktree, current)
  if (
    fields.worktreePath === current.worktreePath &&
    fields.worktreeBranch === current.worktreeBranch &&
    fields.worktreeHookBased === current.worktreeHookBased
  ) {
    return
  }
  await writeStateAndNotify(
    jobDir,
    { ...current, ...fields, updatedAt: new Date().toISOString() },
    {},
  )
}

export async function scanLinkRecords(
  transcriptPath: string,
  existing: JobState['children'],
  offset: number,
): Promise<{
  children: JobState['children']
  linkScanOffset: number
  worktree?: unknown
}> {
  let file
  try {
    file = await open(transcriptPath, 'r')
  } catch {
    return { children: existing, linkScanOffset: offset }
  }
  let scanOffset = offset
  try {
    const { size } = await file.stat()
    if (size === offset) return { children: existing, linkScanOffset: size }
    scanOffset = size < offset ? 0 : offset
    if (size - scanOffset > LINK_SCAN_MAX_BYTES) {
      scanOffset = size - LINK_SCAN_MAX_BYTES
    }
    const buffer = Buffer.alloc(size - scanOffset)
    await file.read(buffer, 0, buffer.length, scanOffset)
    const newline = buffer.lastIndexOf(10)
    if (newline < 0) return { children: existing, linkScanOffset: scanOffset }
    const links = new Map((existing ?? []).map((child) => [child.href, child]))
    let worktree: unknown
    for (const line of buffer.toString('utf8', 0, newline).split('\n')) {
      const prLink = line.includes('"pr-link"')
      const worktreeState = line.includes('"worktree-state"')
      if (!prLink && !worktreeState) continue
      try {
        const record = JSON.parse(line) as Record<string, unknown>
        if (record.type === 'pr-link' && typeof record.prUrl === 'string') {
          links.set(record.prUrl, {
            id: String(record.prNumber ?? record.prUrl),
            href: record.prUrl,
          })
        } else if (record.type === 'worktree-state') {
          worktree = record.worktreeSession ?? null
        }
      } catch {}
    }
    return {
      children: links.size ? [...links.values()] : existing,
      linkScanOffset: scanOffset + newline + 1,
      worktree,
    }
  } catch (error) {
    logForDebugging(`[classifier] scanLinkRecords error: ${String(error)}`)
    return { children: existing, linkScanOffset: scanOffset }
  } finally {
    await file.close().catch(() => {})
  }
}

export function ensurePermissionBridge(state: ClassifierJobState): void {
  if (state.permissionBridgeSubscribed) return
  state.permissionBridgeSubscribed = true
  permissionBlockSignal.subscribe(needs => {
    if (!isBgSession()) return
    const short = getCurrentJobShort()
    state.bridgeWriteChain = state.bridgeWriteChain.then(() =>
      setPermissionBlock(short, needs).catch(() => {}),
    )
  })
  worktreeStateSignal.subscribe(worktree => {
    if (!isBgSession()) return
    const short = getCurrentJobShort()
    state.bridgeWriteChain = state.bridgeWriteChain.then(() =>
      setWorktreeOwnership(short, worktree).catch(() => {}),
    )
  })
}
