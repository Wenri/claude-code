import axios from 'axios'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { OAUTH_BETA_HEADER, getOauthConfig } from '../constants/oauth.js'
import type { Message } from '../types/message.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  isUsing3PServices,
} from '../utils/auth.js'
import { getGlobalConfig } from '../utils/config.js'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
import { gitExe } from '../utils/git.js'
import { isHumanTurn } from '../utils/messagePredicates.js'
import {
  getAssistantMessageText,
  getUserMessageText,
} from '../utils/messages.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { jsonParse } from '../utils/slowOperations.js'
import { getClaudeCodeUserAgent } from '../utils/userAgent.js'
import { getCompanion } from './companion.js'
import type { Companion } from './types.js'

const OBSERVER_THROTTLE_MS = 30_000
const REACTION_HISTORY_LIMIT = 3
const LARGE_DIFF_LINE_LIMIT = 80

const TEST_FAILURE_RE =
  /\b[1-9]\d* (failed|failing)\b|\btests? failed\b|^FAIL(ED)?\b| ✗ | ✘ /im
const ERROR_RE =
  /\berror:|\bexception\b|\btraceback\b|\bpanicked at\b|\bfatal:|exit code [1-9]/i

let lastReactionAt = 0
let observedMessageCount = 0
const reactionHistory: string[] = []

type ReactionReason = 'test-fail' | 'error' | 'large-diff' | 'turn' | 'hatch' | 'pet'

async function requestReaction(
  companion: Companion,
  transcript: string,
  reason: ReactionReason,
  recent: string[],
  addressed: boolean,
  signal: AbortSignal,
): Promise<string | null> {
  if (getAPIProvider() !== 'firstParty') return null
  if (isUsing3PServices()) return null

  const organizationUuid = getGlobalConfig().oauthAccount?.organizationUuid
  if (!organizationUuid) return null

  try {
    await checkAndRefreshOAuthTokenIfNeeded()
    const accessToken = getClaudeAIOAuthTokens()?.accessToken
    if (!accessToken) return null

    const url = `${getOauthConfig().BASE_API_URL}/api/organizations/${organizationUuid}/claude_code/buddy_react`
    const response = await axios.post(
      url,
      {
        name: companion.name.slice(0, 32),
        personality: companion.personality.slice(0, 200),
        species: companion.species,
        rarity: companion.rarity,
        stats: companion.stats,
        transcript: transcript.slice(0, 5000),
        reason,
        recent: recent.map(item => item.slice(0, 200)),
        addressed,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'anthropic-beta': OAUTH_BETA_HEADER,
          'User-Agent': getClaudeCodeUserAgent(),
        },
        timeout: 10_000,
        signal,
      },
    )
    return response.data.reaction?.trim() || null
  } catch (error) {
    logForDebugging(`[buddy] api failed: ${error}`)
    return null
  }
}

export function buildBuddyTranscript(
  messages: Message[],
  latestToolOutput: string,
): string {
  const lines: string[] = []
  for (const message of messages.slice(-12)) {
    if (message.type !== 'user' && message.type !== 'assistant') continue
    if (message.isMeta) continue
    const text =
      message.type === 'user'
        ? getUserMessageText(message)
        : getAssistantMessageText(message)
    if (text) {
      lines.push(
        `${message.type === 'user' ? 'user' : 'claude'}: ${text.slice(0, 300)}`,
      )
    }
  }
  if (latestToolOutput) {
    lines.push(`[tool output]\n${latestToolOutput.slice(-1000)}`)
  }
  return lines.join('\n')
}

export function collectBuddyToolOutput(messages: Message[]): string {
  const output: string[] = []
  for (const message of messages) {
    if (message.type !== 'user') continue
    const content = message.message.content
    if (typeof content === 'string') continue
    for (const block of content) {
      if (block.type !== 'tool_result') continue
      if (typeof block.content === 'string') {
        output.push(block.content)
      } else if (Array.isArray(block.content)) {
        for (const item of block.content) {
          if (item.type === 'text') output.push(item.text)
        }
      }
    }
  }
  return output.join('\n')
}

export function classifyBuddyReaction(
  output: string,
): Exclude<ReactionReason, 'turn' | 'hatch' | 'pet'> | null {
  if (!output) return null
  if (TEST_FAILURE_RE.test(output)) return 'test-fail'
  if (ERROR_RE.test(output)) return 'error'
  if (/^(@@ |diff )/m.test(output)) {
    const changedLines = output.match(/^[+-](?![+-])/gm)?.length ?? 0
    if (changedLines > LARGE_DIFF_LINE_LIMIT) return 'large-diff'
  }
  return null
}

export function wasBuddyAddressed(messages: Message[], name: string): boolean {
  const lastUserMessage = messages.findLast(isHumanTurn)
  if (!lastUserMessage) return false
  const text = getUserMessageText(lastUserMessage) ?? ''
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escapedName}\\b`, 'i').test(text)
}

function rememberReaction(reaction: string): void {
  reactionHistory.push(reaction)
  if (reactionHistory.length > REACTION_HISTORY_LIMIT) reactionHistory.shift()
}

export function getLastBuddyReaction(): string | undefined {
  return reactionHistory.at(-1)
}

export function fireCompanionObserver(
  messages: Message[],
  onReaction: (reaction: string) => void,
): void {
  const companion = getCompanion()
  if (!companion || getGlobalConfig().companionMuted) {
    observedMessageCount = messages.length
    return
  }

  const addressed = wasBuddyAddressed(messages, companion.name)
  const newToolOutput = collectBuddyToolOutput(
    messages.slice(observedMessageCount),
  )
  observedMessageCount = messages.length
  const recentToolOutput = collectBuddyToolOutput(messages.slice(-12))
  const specialReason = addressed ? null : classifyBuddyReaction(newToolOutput)
  const reason = specialReason ?? 'turn'
  const now = Date.now()
  if (
    !addressed &&
    !specialReason &&
    now - lastReactionAt < OBSERVER_THROTTLE_MS
  ) {
    return
  }

  const transcript = buildBuddyTranscript(messages, recentToolOutput)
  if (!transcript.trim()) return
  lastReactionAt = now
  void requestReaction(
    companion,
    transcript,
    reason,
    reactionHistory,
    addressed,
    AbortSignal.timeout(10_000),
  ).then(reaction => {
    if (!reaction) return
    rememberReaction(reaction)
    onReaction(reaction)
  })
}

export function fireCompanionHatchObserver(
  companion: Companion,
  onReaction: (reaction: string) => void,
): void {
  if (getGlobalConfig().companionMuted) return
  lastReactionAt = Date.now()
  void getBuddyProjectContext()
    .then(context =>
      requestReaction(
        companion,
        context || '(fresh project, nothing to see yet)',
        'hatch',
        [],
        false,
        AbortSignal.timeout(10_000),
      ),
    )
    .then(reaction => {
      if (!reaction) return
      rememberReaction(reaction)
      onReaction(reaction)
    })
    .catch(() => {})
}

export function fireCompanionPetObserver(
  onReaction: (reaction: string) => void,
): void {
  const companion = getCompanion()
  if (!companion) return
  lastReactionAt = Date.now()
  void requestReaction(
    companion,
    '(you were just petted)',
    'pet',
    reactionHistory,
    false,
    AbortSignal.timeout(10_000),
  ).then(reaction => {
    if (!reaction) return
    rememberReaction(reaction)
    onReaction(reaction)
  })
}

export async function getBuddyProjectContext(): Promise<string> {
  const cwd = getCwd()
  const [packageResult, gitResult] = await Promise.allSettled([
    readFile(join(cwd, 'package.json'), 'utf-8'),
    execFileNoThrow(
      gitExe(),
      ['--no-optional-locks', 'log', '--oneline', '-n', '3'],
      { preserveOutputOnError: false, useCwd: true },
    ),
  ])
  const context: string[] = []
  if (packageResult.status === 'fulfilled') {
    try {
      const packageJson = jsonParse(packageResult.value) as {
        name?: string
        description?: string
      }
      if (packageJson.name) {
        context.push(
          `project: ${packageJson.name}${packageJson.description ? ` — ${packageJson.description}` : ''}`,
        )
      }
    } catch {}
  }
  if (gitResult.status === 'fulfilled') {
    const recentCommits = gitResult.value.stdout.trim()
    if (recentCommits) context.push(`recent commits:\n${recentCommits}`)
  }
  return context.join('\n')
}
