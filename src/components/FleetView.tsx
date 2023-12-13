import { createReadStream } from 'fs'
import { randomUUID } from 'crypto'
import chalk from 'chalk'
import { readdir, stat } from 'fs/promises'
import { createInterface } from 'readline'
import { basename, isAbsolute, join } from 'path'
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import stripAnsi from 'strip-ansi'
import { Box, Text, createRoot, useInput, type Root } from '../ink.js'
import { AlternateScreen } from '../ink/components/AlternateScreen.js'
import {
  DISABLE_KITTY_KEYBOARD,
  DISABLE_MODIFY_OTHER_KEYS,
  ENABLE_KITTY_KEYBOARD,
  ENABLE_MODIFY_OTHER_KEYS,
} from '../ink/termio/csi.js'
import { ENTER_ALT_SCREEN, EXIT_ALT_SCREEN } from '../ink/termio/dec.js'
import { OSC, osc } from '../ink/termio/osc.js'
import { supportsExtendedKeys } from '../ink/terminal.js'
import { clearTerminal } from '../ink/clearTerminal.js'
import { stringWidth } from '../ink/stringWidth.js'
import { useTerminalFocus } from '../ink/hooks/use-terminal-focus.js'
import TextInput from './TextInput.js'
import { AutoUpdaterWrapper } from './AutoUpdaterWrapper.js'
import { ThemeProvider } from './design-system/ThemeProvider.js'
import {
  getJobDir,
  isSettledJob,
  readAllJobs,
  readJobState,
  renameJob,
  setJobPinned,
  terminalStateActivity,
  writeJobState,
  writeJobOrder,
  type JobRecord,
  type JobState,
} from '../daemon/jobs.js'
import { killJob, listLiveJobs } from '../daemon/client.js'
import {
  attachJob,
  deleteBgJob,
} from '../cli/bg.js'
import {
  claimPrewarmedJob,
  dispatchTemplateJob,
  getPrewarmedJob,
  markPrewarmedJobReady,
  prewarmTemplateJob,
  respawnTemplateJob,
  sendJobReply,
  stopPrewarming,
  type TemplateJob,
} from '../cli/handlers/templateJobs.js'
import { getSkillToolCommands } from '../commands.js'
import { resolveLauncher } from '../commands/update/update.js'
import {
  getActiveAgentsFromList,
  getAgentDefinitionsWithOverrides,
  isCustomAgent,
} from '../tools/AgentTool/loadAgentsDir.js'
import { getProjectDir } from '../utils/sessionStoragePortable.js'
import {
  expandPastedTextRefs,
  formatPastedTextRef,
  getPastedTextRefNumLines,
} from '../history.js'
import {
  findCanonicalGitRoot,
  findRepoRemoteSlug,
} from '../utils/git.js'
import { getCwd } from '../utils/cwd.js'
import {
  getLastInteractionTime,
  resetInteractionBaseline,
} from '../bootstrap/state.js'
import {
  clearFleetViewHeartbeat,
  listAllLiveSessions,
} from '../utils/concurrentSessions.js'
import { sendControlToUdsSocket } from '../utils/udsClient.js'
import { maintainDaemonLease } from '../daemon/client.js'
import { logEvent } from '../services/analytics/index.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import { relaunch } from '../utils/relaunch.js'
import {
  getGlobalConfig,
  saveGlobalConfig,
  type PastedContent,
} from '../utils/config.js'
import { PASTE_THRESHOLD } from '../utils/imagePaste.js'
import { editPromptInEditor } from '../utils/promptEditor.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../utils/envUtils.js'
import { isMouseTrackingEnabled, isTmuxControlMode } from '../utils/fullscreen.js'
import {
  AppStateProvider,
  type AppState,
  useAppState,
} from '../state/AppState.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  fetchPrStatus,
  fetchPrStatuses,
  prStatusColor,
  readPrStatusCache,
  type PrStatus,
  type PrStatusColor,
} from '../utils/prStatus.js'

const CONTROL_RE = /[\x00-\x08\x0E-\x1F\x7F-\x9F]/g
export const AUTO_RELAUNCH_UNFOCUSED_MS = 3_600_000
export const AUTO_RELAUNCH_MIN_INTERVAL_MS = 21_600_000
export const AUTO_RELAUNCH_ENV_KEY = 'CLAUDE_AGENTS_AUTO_RELAUNCHED_AT'
const DEFAULT_TEMPLATE: FleetTemplate = {
  name: 'general-purpose',
  description: 'General-purpose background agent',
}

function shouldUseFleetAlternateScreen(): boolean {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_NO_FLICKER)) return false
  if (isEnvTruthy(process.env.CLAUDE_CODE_NO_FLICKER)) return true
  return !isTmuxControlMode()
}

function enterFleetTerminal(): string {
  return (
    ENTER_ALT_SCREEN +
    clearTerminal +
    (supportsExtendedKeys()
      ? DISABLE_KITTY_KEYBOARD +
        ENABLE_KITTY_KEYBOARD +
        ENABLE_MODIFY_OTHER_KEYS
      : '')
  )
}

function leaveFleetTerminal(): string {
  return DISABLE_KITTY_KEYBOARD + EXIT_ALT_SCREEN + DISABLE_MODIFY_OTHER_KEYS
}

export type JobActivity =
  | 'success'
  | 'failure'
  | 'stopped'
  | 'flowing'
  | 'slowing'
  | 'stuck'

export type JobBand = 'active' | 'blocked' | 'completed'
export type SessionStatus = 'busy' | 'idle' | 'waiting' | undefined
export type StateBucket = 'review' | 'blocked' | 'working' | 'done'
export type JobColor = PrStatusColor | 'failure' | 'stopped' | undefined

export interface FleetJob extends JobRecord {
  activity: JobActivity
}

type FleetListRow =
  | { kind: 'header'; group: string; jobs: FleetJob[] }
  | { kind: 'job'; group: string; job: FleetJob }

export interface FleetTemplate {
  name: string
  description?: string
  initialPrompt?: string
}

function recordFleetAgentAction(
  action: string,
  state: JobState,
  extra?: Record<string, boolean | number | string>,
): void {
  logEvent('tengu_bg_agent_action', {
    action,
    jobSessionId: state.sessionId,
    agent: state.template,
    jobState: state.state,
    tempo: state.tempo,
    ...extra,
  })
}

export interface FleetRoutine {
  name: string
  description?: string
}

export interface FleetSuggestion {
  kind: 'agent' | 'routine' | 'repo' | 'skill'
  name: string
  description: string
}

export interface ParsedDispatch {
  template: FleetTemplate
  intent: string
  matched: boolean
  cwd?: string
  routine?: string
}

export interface ParsedQuery {
  template?: string
  state?: string
  output?: string
  pr?: string
  text: string
}

export interface ActionableSegment {
  text: string
  color?: PrStatusColor
}

export type FleetAction =
  | { type: 'done' }
  | {
      type: 'open'
      job: FleetJob
      query?: string
      groupMode: 'directory' | 'state'
      jobs: FleetJob[] | null
      loopKicks: Map<string, { mtimeMs: number; count: number; nextAt: number | null }>
      statuses: Map<string, SessionStatus>
      statusesTs: number
      freshDispatch?: boolean
      respawnResult?: Awaited<ReturnType<typeof respawnTemplateJob>>
    }
  | { type: 'logs'; job: FleetJob }

let lastJobs: FleetJob[] | null = null
let lastPrStatuses = new Map<string, PrStatus | null>()
let lastLoopTimelines = new Map<
  string,
  { mtimeMs: number; count: number; nextAt: number | null }
>()
let lastGroupMode: 'directory' | 'state' = 'directory'
let lastSessionStatuses = new Map<string, SessionStatus>()
let lastSessionStatusesTs = 0
const repositoryCache = new Map<string, Record<string, string>>()
const templateCache = new Map<string, FleetTemplate[]>()
const skillCache = new Map<string, FleetSuggestion[]>()

/** Remove entries whose keys no longer belong to the live key set. */
export function pruneMap<K, V>(map: Map<K, V>, keys: Set<K>): Map<K, V> {
  let next: Map<K, V> | undefined
  for (const key of map.keys()) {
    if (!keys.has(key)) (next ??= new Map(map)).delete(key)
  }
  return next ?? map
}

export function jobLabel(state: JobState, current = false): string {
  if (state.name) {
    return state.name.replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim()
  }
  const words = state.intent
    .replace(CONTROL_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  if (words.length === 0) {
    if (current) return 'current session'
    return state.template.replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim()
  }
  const candidate =
    words.length > 3 ? `${words.slice(0, 3).join(' ')}…` : words.join(' ')
  if (stringWidth(candidate) <= 25) return candidate
  let result = ''
  let width = 0
  for (const character of candidate) {
    const characterWidth = stringWidth(character)
    if (width + characterWidth > 24) break
    result += character
    width += characterWidth
  }
  return `${result}…`
}

export function deriveActivity(
  state: JobState,
  statuses?: ReadonlyMap<string, PrStatus | null>,
): JobActivity {
  const terminal = terminalStateActivity(state.state)
  if (terminal && state.tempo !== 'active') return terminal
  if (
    statuses &&
    state.tempo !== 'active' &&
    state.template === DEFAULT_TEMPLATE.name &&
    state.children?.length &&
    state.children.every((child) => statuses.get(child.href)?.state === 'MERGED')
  ) {
    return 'success'
  }
  const multiplier = state.tempo === 'active' ? 1 : 5
  const elapsed = Date.now() - Date.parse(state.updatedAt)
  if (elapsed < multiplier * 3 * 60_000) return 'flowing'
  if (elapsed < multiplier * 15 * 60_000) return 'slowing'
  return 'stuck'
}

export function deriveBand(state: JobState): JobBand {
  if (isSettledJob(state)) return 'completed'
  if (state.tempo === 'blocked') return 'blocked'
  return 'active'
}

export function stateBucket(
  job: FleetJob,
  statuses?: ReadonlyMap<string, PrStatus | null>,
  sessionStatus?: SessionStatus,
): StateBucket {
  if (sessionStatus === 'busy') return 'working'
  if (
    job.state.children?.some((child) => {
      const status = statuses?.get(child.href)
      return status?.state === 'OPEN' && prStatusColor(status) !== 'success'
    })
  ) {
    return 'review'
  }
  if (
    job.state.tempo === 'blocked' ||
    job.activity === 'failure' ||
    sessionStatus === 'waiting'
  ) {
    return 'blocked'
  }
  if (job.activity === 'success' || job.activity === 'stopped') return 'done'
  return 'working'
}

export function needsRespawn(state: JobState): boolean {
  const terminal = terminalStateActivity(state.state)
  return (terminal === 'failure' || terminal === 'stopped') && isSettledJob(state)
}

export function parseQuery(value: string): ParsedQuery {
  let template: string | undefined
  let state: string | undefined
  let output: string | undefined
  let pr: string | undefined
  const text: string[] = []
  for (const token of value.trim().split(/\s+/)) {
    const lower = token.toLowerCase()
    if (lower.startsWith('a:')) template = lower.slice(2) || undefined
    else if (lower.startsWith('s:')) state = lower.slice(2) || undefined
    else if (lower.startsWith('o:')) output = lower.slice(2)
    else if (parsePrRef(token)) pr = parsePrRef(token) ?? undefined
    else text.push(token)
  }
  return { template, state, output, pr, text: text.join(' ').toLowerCase() }
}

export function parsePrRef(value: string): string | null {
  const trimmed = value.trim()
  if (/\s/.test(trimmed)) return null
  return (
    (/^#(\d+)$/.exec(trimmed) ?? /\/pull\/(\d+)(?!\d)/.exec(trimmed))?.[1] ??
    null
  )
}

export function jobMatchesPr(state: JobState, number: string): boolean {
  const pattern = new RegExp(`/pull/${number}(?!\\d)`)
  return (
    Boolean(
      state.children?.some(
        (child) => child.id === number || pattern.test(child.href),
      ),
    ) ||
    Object.values(state.output ?? {}).some((value) =>
      pattern.test(String(value)),
    )
  )
}

function templateName(template: FleetTemplate): string {
  return template.name
}

export function parseDispatch(
  value: string,
  templates: FleetTemplate[],
  repositories: Record<string, string> = {},
  routines: FleetRoutine[] = [],
): ParsedDispatch | null {
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('a:') || lower.startsWith('s:') || lower.startsWith('o:')) {
    return null
  }
  let taggedTemplate: FleetTemplate | undefined
  let cwd: string | undefined
  let routine: string | undefined
  const repositoryNames = Object.keys(repositories)
  const withoutTags = trimmed
    .replace(/(?:^|\s)@(\S+)/g, (match, rawName: string) => {
      const name = rawName.toLowerCase()
      const foundTemplate = templates.find(
        (template) => templateName(template).toLowerCase() === name,
      )
      if (foundTemplate) {
        taggedTemplate ??= foundTemplate
        return ''
      }
      const foundRoutine = routines.find(
        (candidate) => candidate.name.toLowerCase() === name,
      )
      if (foundRoutine) {
        routine ??= foundRoutine.name
        return ''
      }
      const foundRepository = repositoryNames.find(
        (candidate) => candidate.toLowerCase() === name,
      )
      if (foundRepository) {
        cwd ??= repositories[foundRepository]
        return ''
      }
      return match
    })
    .trim()
  const space = withoutTags.search(/\s/)
  const first = (space < 0 ? withoutTags : withoutTags.slice(0, space)).toLowerCase()
  const leadingTemplate = taggedTemplate
    ? undefined
    : templates.find((template) => templateName(template).toLowerCase() === first)
  if (leadingTemplate) {
    return {
      template: leadingTemplate,
      intent: space < 0 ? '' : withoutTags.slice(space + 1).trim(),
      matched: true,
      cwd,
      routine,
    }
  }
  if (taggedTemplate) {
    return {
      template: taggedTemplate,
      intent: withoutTags,
      matched: true,
      cwd,
      routine,
    }
  }
  return {
    template: DEFAULT_TEMPLATE,
    intent: withoutTags,
    matched: false,
    cwd,
    routine,
  }
}

export function extractRepoCwd(
  value: string,
  repositories: Record<string, string>,
  routines: FleetRoutine[] = [],
): string | undefined {
  const routineNames = new Set(routines.map((routine) => routine.name.toLowerCase()))
  const names = Object.keys(repositories)
  for (const match of value.matchAll(/(?:^|\s)@(\S+)/g)) {
    const name = match[1].toLowerCase()
    if (routineNames.has(name)) continue
    const repository = names.find((candidate) => candidate.toLowerCase() === name)
    if (repository) return repositories[repository]
  }
  return undefined
}

function compactDescription(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function templateSuggestion(template: FleetTemplate): FleetSuggestion {
  return {
    kind: 'agent',
    name: template.name,
    description: compactDescription(template.description),
  }
}

function byAgentRecency(left: FleetTemplate, right: FleetTemplate): number {
  const lastUsed = getGlobalConfig().agentLastUsed ?? {}
  const leftUsed = lastUsed[left.name] ?? 0
  const rightUsed = lastUsed[right.name] ?? 0
  return rightUsed - leftUsed || left.name.localeCompare(right.name)
}

function replaceTrailingSuggestion(
  value: string,
  prefix: '@' | '/',
  name: string,
): string {
  return value.replace(/[@/]\S*$/, () => `${prefix}${name} `)
}

/** Exact Fleet dispatch autocomplete routing: @ agents/routines/repos, / skills. */
export function fleetSuggestions(
  value: string,
  templates: FleetTemplate[],
  routines: FleetRoutine[],
  repositories: Record<string, string>,
  skills: FleetSuggestion[],
  dispatch: ParsedDispatch | null,
  showAll: boolean,
): {
  atMatch: boolean
  slashMatch: boolean
  suggestions: FleetSuggestion[]
} {
  const firstWord = value.trimStart().split(/\s/, 1)[0].toLowerCase()
  const slashQuery = firstWord.startsWith('/')
  const at = value.match(/(?:^|\s)@(\S*)$/)
  const atPrefix = at?.[1]?.toLowerCase()
  const priorRepo = Boolean(
    at &&
      extractRepoCwd(
        value.slice(0, Math.max(0, value.length - at[0].length)),
        repositories,
        templates,
      ),
  )
  const templateNames = new Set(templates.map(template => template.name.toLowerCase()))
  const repoNames = Object.keys(repositories).filter(
    name => !templateNames.has(name.toLowerCase()) && !/\s/.test(name),
  )
  const byName = <T extends { name: string }>(left: T, right: T) =>
    left.name.localeCompare(right.name)
  const atSuggestions: FleetSuggestion[] =
    atPrefix === undefined
      ? []
      : [
          ...templates
            .filter(template => template.name.toLowerCase().startsWith(atPrefix))
            .sort(byAgentRecency)
            .map(templateSuggestion),
          ...routines
            .filter(routine => routine.name.toLowerCase().startsWith(atPrefix))
            .sort(byName)
            .map(routine => ({
              kind: 'routine' as const,
              name: routine.name,
              description: compactDescription(routine.description),
            })),
          ...(priorRepo
            ? []
            : repoNames
                .filter(name => name.toLowerCase().startsWith(atPrefix))
                .sort((left, right) => left.localeCompare(right))
                .map(name => ({
                  kind: 'repo' as const,
                  name,
                  description: repositories[name],
                }))),
        ]
  const slash = value.match(/(?:^|\s)\/(\S*)$/)
  const slashPrefix = slash?.[1]?.toLowerCase()
  const slashSuggestions =
    slashPrefix === undefined
      ? []
      : skills
          .filter(skill => skill.name.toLowerCase().startsWith(slashPrefix))
          .sort(byName)
  const leading: FleetSuggestion[] = slashQuery
    ? []
    : [
        ...templates
          .filter(template => template.name.toLowerCase().startsWith(firstWord))
          .sort(byAgentRecency)
          .map(templateSuggestion),
        ...routines
          .filter(routine => routine.name.toLowerCase().startsWith(firstWord))
          .sort(byName)
          .map(routine => ({
            kind: 'routine' as const,
            name: routine.name,
            description: compactDescription(routine.description),
          })),
        ...repoNames
          .filter(name => name.toLowerCase().startsWith(firstWord))
          .sort((left, right) => left.localeCompare(right))
          .map(name => ({
            kind: 'repo' as const,
            name,
            description: repositories[name],
          })),
        ...skills
          .filter(skill => skill.name.toLowerCase().startsWith(firstWord))
          .sort(byName),
      ]
  return {
    atMatch: at !== null,
    slashMatch: slash !== null,
    suggestions: !dispatch
      ? []
      : at
        ? atSuggestions
        : slash
          ? slashSuggestions
          : showAll && !value
            ? [...templates].sort(byAgentRecency).map(templateSuggestion)
            : !dispatch.matched && firstWord && !value.includes(' ')
              ? leading
              : [],
  }
}

async function loadRepositories(cwd: string): Promise<Record<string, string>> {
  const cached = repositoryCache.get(cwd)
  if (cached) return cached
  let entries
  try {
    entries = await readdir(cwd, { withFileTypes: true })
  } catch {
    return {}
  }
  const pairs = await Promise.all(
    entries
      .filter(
        entry =>
          (entry.isDirectory() || entry.isSymbolicLink()) &&
          !entry.name.startsWith('.') &&
          !/\s/.test(entry.name),
      )
      .map(async entry => {
        const candidate = join(cwd, entry.name)
        try {
          await stat(join(candidate, '.git'))
          return [entry.name, candidate] as const
        } catch {
          return null
        }
      }),
  )
  const result = Object.fromEntries(pairs.filter(pair => pair !== null))
  repositoryCache.set(cwd, result)
  return result
}

async function loadTemplates(cwd: string): Promise<FleetTemplate[]> {
  const cached = templateCache.get(cwd)
  if (cached) return cached
  const { allAgents } = await getAgentDefinitionsWithOverrides(cwd)
  const result = getActiveAgentsFromList(allAgents)
    .filter(isCustomAgent)
    .map(agent => ({
      name: agent.agentType,
      description: agent.whenToUse,
      initialPrompt: agent.initialPrompt,
    }))
  templateCache.set(cwd, result)
  return result
}

async function loadSkills(cwd: string): Promise<FleetSuggestion[]> {
  const cached = skillCache.get(cwd)
  if (cached) return cached
  const result = (await getSkillToolCommands(cwd)).map(skill => ({
    kind: 'skill' as const,
    name: skill.name,
    description: compactDescription(skill.description ?? ''),
  }))
  skillCache.set(cwd, result)
  return result
}

export function spawnOrigin(state: Pick<JobState, 'originCwd' | 'cwd'>): string {
  if (state.originCwd) return state.originCwd
  const match = state.cwd.match(/^(.+?)[/\\]\.claude[/\\]worktrees[/\\]/)
  return match ? match[1] : state.cwd
}

export function repoGroup(state: Pick<JobState, 'originCwd' | 'cwd'>): string {
  const origin = spawnOrigin(state)
  const canonical = findCanonicalGitRoot(origin)
  return (canonical ? findRepoRemoteSlug(canonical) : null) ?? canonical ?? origin
}

export function repoGroupLabel(group: string): string {
  if (isAbsolute(group) || group.includes('\\')) return basename(group)
  return group.split('/').slice(1).join('/') || group
}

export function effectiveSortOrder(state: JobState): number {
  return state.sortOrder ?? Date.parse(state.createdAt)
}

export function sortJobs<T extends { state: JobState }>(jobs: T[]): T[] {
  return [...jobs].sort(
    (left, right) => effectiveSortOrder(left.state) - effectiveSortOrder(right.state),
  )
}

export function seedLastJobs(jobs: JobRecord[]): void {
  lastJobs = sortJobs(
    jobs.map((job) => ({ ...job, activity: deriveActivity(job.state) })),
  )
}

export function isLoopJob(state: Pick<JobState, 'intent' | 'initialPrompt'>): boolean {
  const loop = (value?: string) =>
    value?.trim().toLowerCase().startsWith('/loop') ?? false
  return loop(state.intent) || loop(state.initialPrompt)
}

export function glyphColor(
  state: Pick<JobState, 'tempo'>,
  activity: JobActivity,
  sessionStatus?: SessionStatus,
): { color?: 'success' | 'inactive' | 'error'; dim: boolean } {
  if (activity === 'success') return { color: 'success', dim: false }
  if (activity === 'failure' || activity === 'stopped') {
    return { color: 'inactive', dim: false }
  }
  if (sessionStatus === 'busy') return { color: undefined, dim: false }
  if (state.tempo === 'blocked' || sessionStatus === 'waiting') {
    return { color: 'error', dim: false }
  }
  return { color: undefined, dim: true }
}

export function pickIcon(
  state: Pick<JobState, 'tempo' | 'intent' | 'initialPrompt'>,
  activity?: JobActivity,
  sessionStatus?: SessionStatus,
): string | null {
  if (activity && state.tempo !== 'active') {
    if (activity === 'success') return '✻'
    if (activity === 'failure' || activity === 'stopped') return '∙'
  }
  if (sessionStatus === 'busy') return null
  if (isLoopJob(state)) return '✢'
  return '✻'
}

export function rollupJobColor(
  color: JobColor,
  children: Array<{ color?: JobColor }>,
): JobColor {
  const rank: Partial<Record<NonNullable<JobColor>, number>> = {
    error: 2,
    warning: 1,
  }
  let result = color
  let resultRank = color ? (rank[color] ?? 0) : 0
  for (const child of children) {
    if (child.color === undefined) continue
    const childRank = rank[child.color] ?? 0
    if (childRank > resultRank) {
      result = child.color
      resultRank = childRank
    }
  }
  return result
}

export function childStatusColor(status: PrStatus): PrStatusColor {
  const color = prStatusColor(status)
  return color === 'error' ? 'warning' : color
}

export function rollupChildColor(
  children: Array<{ color?: PrStatusColor }>,
): PrStatusColor | undefined {
  const rank: Partial<Record<PrStatusColor, number>> = {
    warning: 2,
    success: 1,
    inactive: 0,
  }
  let result: PrStatusColor | undefined
  let resultRank = -1
  for (const child of children) {
    if (child.color === undefined) continue
    const childRank = rank[child.color] ?? 0
    if (childRank > resultRank) {
      result = child.color
      resultRank = childRank
    }
  }
  return result
}

export function actionableStatus(status: PrStatus): ActionableSegment[] {
  if (status.state === 'MERGED') return [{ text: 'merged', color: 'merged' }]
  if (status.state === 'CLOSED') return [{ text: 'closed', color: 'inactive' }]
  const result: ActionableSegment[] = []
  const { failed, pending, passed } = status.checks
  const total = failed + pending + passed
  if (failed > 0) result.push({ text: `✘ ${failed}/${total}`, color: 'error' })
  else if (pending > 0) result.push({ text: `${passed}/${total}`, color: 'warning' })
  else if (total > 0) result.push({ text: '✔', color: 'success' })
  switch (status.review) {
    case 'APPROVED':
      result.push({ text: 'approved', color: 'success' })
      break
    case 'CHANGES_REQUESTED':
      result.push({ text: '✘', color: 'error' })
      break
    case 'REVIEW_REQUIRED':
      result.push({ text: 'needs review' })
      break
    case null:
      break
  }
  if (result.length === 0) {
    result.push({ text: status.state.toLowerCase(), color: childStatusColor(status) })
  }
  return result
}

export function summarizeEvent(line: string): string | null {
  try {
    const event = JSON.parse(line) as {
      type?: string
      message?: { content?: string | Array<Record<string, unknown>> }
    }
    const content = event.message?.content
    if (event.type === 'assistant' && Array.isArray(content)) {
      const text = content.find((item) => item.type === 'text')?.text
      if (typeof text === 'string' && text) return text
      const tool = content.find((item) => item.type === 'tool_use')
      if (tool) {
        const input = tool.input as Record<string, unknown> | undefined
        if (
          tool.name === 'REPL' &&
          typeof input?.description === 'string' &&
          input.description
        ) {
          return `REPL ${input.description}`
        }
        if (typeof tool.name === 'string') {
          const description =
            typeof input?.description === 'string' ? ` ${input.description}` : ''
          return `${tool.name}${description}`
        }
      }
    }
    if (event.type === 'user') {
      const text =
        typeof content === 'string'
          ? content
          : content?.find((item) => item.type === 'text')?.text
      if (typeof text === 'string' && text) {
        return `> ${text.replace(/\s+/g, ' ').trim()}`
      }
    }
  } catch {}
  return null
}

async function scanLoopTimeline(
  path: string,
): Promise<{ count: number; nextAt: number | null }> {
  let count = 0
  const recent: number[] = []
  const input = createInterface({
    input: createReadStream(path, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })
  for await (const line of input) {
    if (!line.includes('"subtype":"scheduled_task_fire"')) continue
    const match = line.match(/"timestamp":"([^"]+)"/)
    if (!match) continue
    const timestamp = Date.parse(match[1])
    if (!Number.isFinite(timestamp)) continue
    count++
    recent.push(timestamp)
    if (recent.length > 7) recent.shift()
  }
  if (recent.length < 2) return { count, nextAt: null }
  const intervals = recent
    .slice(1)
    .map((timestamp, index) => timestamp - recent[index])
    .sort((left, right) => left - right)
  const nextAt = recent.at(-1)! + intervals[Math.floor(intervals.length / 2)]
  return { count, nextAt: nextAt > Date.now() ? nextAt : null }
}

function matchesQuery(job: FleetJob, query: ParsedQuery): boolean {
  if (
    query.template &&
    !job.state.template.toLowerCase().startsWith(query.template)
  ) {
    return false
  }
  if (query.pr && !jobMatchesPr(job.state, query.pr)) return false
  if (
    query.output !== undefined &&
    !Object.values(job.state.output ?? {}).some((value) =>
      String(value).toLowerCase().includes(query.output!),
    )
  ) {
    return false
  }
  if (
    query.state &&
    !job.state.state.toLowerCase().startsWith(query.state) &&
    !deriveBand(job.state).startsWith(query.state)
  ) {
    return false
  }
  if (query.text) {
    const haystack = [
      job.state.name,
      job.state.intent,
      ...Object.values(job.state.output ?? {}),
    ]
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(query.text)) return false
  }
  return true
}

function groupedJobs(
  jobs: FleetJob[],
  statuses: ReadonlyMap<string, PrStatus | null>,
  sessions: ReadonlyMap<string, SessionStatus>,
  mode: 'directory' | 'state',
): Array<{ group: string; jobs: FleetJob[] }> {
  const groups = new Map<string, FleetJob[]>()
  for (const job of jobs) {
    const group = job.state.pinned
      ? 'pinned'
      : mode === 'state'
        ? stateBucket(job, statuses, sessions.get(job.state.sessionId))
        : repoGroup(job.state)
    const existing = groups.get(group)
    if (existing) existing.push(job)
    else groups.set(group, [job])
  }
  const stateRank = ['review', 'blocked', 'working', 'done']
  return [...groups]
    .sort(([left], [right]) => {
      if (left === 'pinned' || right === 'pinned') {
        return Number(right === 'pinned') - Number(left === 'pinned')
      }
      if (mode === 'state') return stateRank.indexOf(left) - stateRank.indexOf(right)
      return left.localeCompare(right)
    })
    .map(([group, values]) => ({ group, jobs: sortJobs(values) }))
}

function eventAge(timestamp: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function optimisticReplyState(state: JobState, text: string): JobState {
  return {
    ...state,
    detail: text.replace(/[\r\n]+/g, ' ').slice(0, 80),
    tempo: 'active',
    needs: undefined,
    output: null,
    updatedAt: new Date().toISOString(),
  }
}

async function stopFleetJob(short: string, knownState: JobState): Promise<void> {
  if (knownState.backend === 'peer') return
  await killJob(short, knownState)
  const current = await readJobState(getJobDir(short))
  if (!current || isSettledJob(current)) return
  const now = new Date().toISOString()
  await writeJobState(getJobDir(short), {
    ...current,
    state: 'stopped',
    detail: 'stopped',
    tempo: 'idle',
    updatedAt: now,
    firstTerminalAt: current.firstTerminalAt ?? now,
  })
}

export function FleetView({
  onAction,
  initialJobId,
  initialQuery = '',
  initialError,
  initialGroupMode,
}: {
  onAction: (action: FleetAction) => void
  initialJobId?: string
  initialQuery?: string
  initialError?: string
  initialGroupMode?: 'directory' | 'state'
}): React.ReactNode {
  const rootCwd = getCwd()
  const [jobs, setJobs] = useState<FleetJob[] | null>(lastJobs)
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  const [pendingJobs, setPendingJobs] = useState<FleetJob[]>([])
  const [statuses, setStatuses] = useState(lastPrStatuses)
  const [sessionStatuses, setSessionStatuses] = useState(lastSessionStatuses)
  const sessionStatusesRef = useRef(sessionStatuses)
  sessionStatusesRef.current = sessionStatuses
  const [query, setQuery] = useState(initialQuery)
  const queryRef = useRef(query)
  queryRef.current = query
  const [queryCursor, setQueryCursor] = useState(initialQuery.length)
  const [pastedContents, setPastedContents] = useState<
    Record<number, PastedContent>
  >({})
  const nextPasteId = useRef(1)
  const [focus, setFocus] = useState(0)
  const followedJobId = useRef<string | null>(initialJobId ?? null)
  const followedHeaderGroup = useRef<string | null>(null)
  const initialFocusAttempts = useRef(0)
  const [groupMode, setGroupMode] = useState(
    initialGroupMode ?? getGlobalConfig().fleetViewGroupMode ?? lastGroupMode,
  )
  const groupModeRef = useRef(groupMode)
  groupModeRef.current = groupMode
  const [collapsedGroups, setCollapsedGroups] = useState(new Set<string>())
  const [error, setError] = useState<string | null>(initialError ?? null)
  const isTerminalFocused = useTerminalFocus()
  const updateAvailable = useAppState(
    state => state.autoUpdaterResult?.status === 'success',
  )
  const [isUpdating, setIsUpdating] = useState(false)
  const handleUpdate = useCallback((mode: 'auto' | 'manual') => {
    logEvent('tengu_bg_agent_action', {
      action: `fleetview_update_${mode}`,
    })
    void resolveLauncher()
      .then(launcher => {
        if (
          mode === 'auto' &&
          Date.now() - getLastInteractionTime() < AUTO_RELAUNCH_UNFOCUSED_MS
        ) {
          return
        }
        return relaunch({
          launcher,
          args: ['agents'],
          env:
            mode === 'auto'
              ? { [AUTO_RELAUNCH_ENV_KEY]: String(Date.now()) }
              : undefined,
          preSpawn: () =>
            process.stdout.write(
              chalk.dim(
                `\nSwitching from ${MACRO.VERSION} to latest…\n\n`,
              ),
            ),
        })
      })
      .catch(caught => {
        logError(caught)
        if (mode === 'manual') {
          setError(
            `Couldn't switch to the latest build — ${errorMessage(caught)}`,
          )
        }
      })
  }, [])

  useEffect(() => {
    if (!updateAvailable || isTerminalFocused) return
    const previousRelaunch =
      Number(process.env[AUTO_RELAUNCH_ENV_KEY]) || 0
    if (Date.now() - previousRelaunch < AUTO_RELAUNCH_MIN_INTERVAL_MS) return
    const timer = setInterval(
      (relaunchUpdate: typeof handleUpdate) => {
        if (
          Date.now() - getLastInteractionTime() < AUTO_RELAUNCH_UNFOCUSED_MS
        ) {
          return
        }
        relaunchUpdate('auto')
      },
      AUTO_RELAUNCH_UNFOCUSED_MS,
      handleUpdate,
    )
    return () => clearInterval(timer)
  }, [updateAvailable, isTerminalFocused, handleUpdate])
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null)
  const [deleteAllArmed, setDeleteAllArmed] = useState<string | null>(null)
  const [exitArmed, setExitArmed] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [busy, setBusy] = useState(new Set<string>())
  const [attachingJobId, setAttachingJobId] = useState<string | null>(null)
  const focusedJobId = useRef<string | null>(null)
  const [detail, setDetail] = useState(false)
  const [reply, setReply] = useState('')
  const [replyCursor, setReplyCursor] = useState(0)
  const [replyMode, setReplyMode] = useState<'prompt' | 'bash'>('prompt')
  const [replyError, setReplyError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const replyDrafts = useRef(new Map<string, string>())
  const [repositories, setRepositories] = useState(
    () => repositoryCache.get(rootCwd) ?? {},
  )
  const [templateMap, setTemplateMap] = useState(
    () => new Map<string, FleetTemplate[]>(),
  )
  const [skillMap, setSkillMap] = useState(
    () => new Map<string, FleetSuggestion[]>(),
  )
  const [activeCwd, setActiveCwd] = useState(rootCwd)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [suggestionFocus, setSuggestionFocus] = useState(0)
  const writeQueue = useRef(new Map<string, number>())
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!deleteArmed) return
    const timer = setTimeout(() => setDeleteArmed(null), 2_000)
    return () => clearTimeout(timer)
  }, [deleteArmed])

  const poll = useCallback(async () => {
    const live = await listLiveJobs().catch(() => new Set<string>())
    const records = await readAllJobs(live)
    const urls = [
      ...new Set(
        records.flatMap((job) => job.state.children?.map((child) => child.href) ?? []),
      ),
    ]
    const activeUrls = urls.filter((url) => {
      const state = lastPrStatuses.get(url)?.state
      return state !== 'MERGED' && state !== 'CLOSED'
    })
    if (activeUrls.length) void (async () => {
      let fetched: Map<string, PrStatus | null>
      if (
        getFeatureValue_CACHED_MAY_BE_STALE(
          'tengu_fleetview_pr_batch',
          true,
        )
      ) {
        const batch = await fetchPrStatuses(activeUrls)
        fetched = batch.statuses
        for (const url of batch.unbatched) {
          fetched.set(url, await fetchPrStatus(url))
        }
      } else {
        fetched = new Map(
          await Promise.all(
            activeUrls.map(async url => [url, await fetchPrStatus(url)] as const),
          ),
        )
      }
      const next = new Map(lastPrStatuses)
      let changed = false
      for (const [url, status] of fetched) {
        const previous = next.get(url)
        if (
          previous?.state !== status?.state ||
          previous?.title !== status?.title ||
          previous?.review !== status?.review ||
          previous?.mergeable !== status?.mergeable ||
          previous?.mergeStateStatus !== status?.mergeStateStatus ||
          previous?.checks.passed !== status?.checks.passed ||
          previous?.checks.failed !== status?.checks.failed ||
          previous?.checks.pending !== status?.checks.pending ||
          previous?.additions !== status?.additions ||
          previous?.deletions !== status?.deletions
        ) {
          next.set(url, status)
          changed = true
        }
      }
      lastPrStatuses = pruneMap(next, new Set(urls))
      if (changed) setStatuses(lastPrStatuses)
    })()
    const nextJobs = sortJobs(
      records.map((job) => ({
        ...job,
        activity: deriveActivity(job.state, lastPrStatuses),
      })),
    )
    lastJobs = nextJobs
    setJobs(nextJobs)

    const loops = nextJobs.filter((job) => isLoopJob(job.state))
    await Promise.all(
      loops.map(async (job) => {
        const transcript = join(
          getProjectDir(job.state.cwd),
          `${job.state.sessionId}.jsonl`,
        )
        const info = await stat(transcript).catch(() => null)
        if (!info) return
        const cached = lastLoopTimelines.get(job.state.sessionId)
        if (cached?.mtimeMs === info.mtimeMs) return
        const timeline = await scanLoopTimeline(transcript).catch(() => null)
        if (timeline) {
          lastLoopTimelines.set(job.state.sessionId, {
            mtimeMs: info.mtimeMs,
            ...timeline,
          })
        }
      }),
    )
    lastLoopTimelines = pruneMap(
      lastLoopTimelines,
      new Set(loops.map((job) => job.state.sessionId)),
    )
  }, [])

  useEffect(() => {
    void readPrStatusCache().then((cached) => {
      if (!lastPrStatuses.size) {
        lastPrStatuses = new Map(cached)
        setStatuses(lastPrStatuses)
      }
    })
    void poll()
    const timer = setInterval(() => void poll(), 2_000)
    return () => clearInterval(timer)
  }, [poll])

  useEffect(() => {
    logForDebugging('[PERF:bg-remount-end]')
  }, [])

  useEffect(() => {
    if (!jobs) return
    saveGlobalConfig(current => {
      const previous = current.agentLastUsed ?? {}
      let changed = false
      const next = { ...previous }
      for (const job of jobs) {
        if (job.state.template === DEFAULT_TEMPLATE.name) continue
        if (previous[job.state.template] !== undefined) continue
        const createdAt = Date.parse(job.state.createdAt)
        if (!Number.isFinite(createdAt)) continue
        if (createdAt > (next[job.state.template] ?? 0)) {
          next[job.state.template] = createdAt
          changed = true
        }
      }
      return changed ? { ...current, agentLastUsed: next } : current
    })
  }, [jobs])

  useEffect(maintainDaemonLease, [])

  useEffect(() => {
    void prewarmTemplateJob(rootCwd, true)
  }, [rootCwd])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const sessions = await listAllLiveSessions().catch(() => [])
      const next = new Map<string, SessionStatus>()
      for (const session of sessions) {
        if (!session.sessionId) continue
        if (
          session.status === 'busy' ||
          session.status === 'idle' ||
          session.status === 'waiting'
        ) {
          next.set(session.sessionId, session.status)
        }
      }
      const spare = getPrewarmedJob()
      if (spare && sessions.some(session => session.sessionId === spare.sessionId)) {
        markPrewarmedJobReady(spare.sessionId)
      }
      if (!cancelled) {
        lastSessionStatuses = next
        lastSessionStatusesTs = Date.now()
        setSessionStatuses(next)
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadRepositories(rootCwd).then(value => {
      if (!cancelled && Object.keys(value).length) setRepositories(value)
    })
    return () => {
      cancelled = true
    }
  }, [rootCwd])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      loadTemplates(activeCwd).catch(() => []),
      loadSkills(activeCwd).catch(() => []),
    ]).then(([templates, skills]) => {
      if (cancelled) return
      setTemplateMap(current => new Map(current).set(activeCwd, templates))
      setSkillMap(current => new Map(current).set(activeCwd, skills))
    })
    return () => {
      cancelled = true
    }
  }, [activeCwd])

  useEffect(
    () => () => {
      if (writeTimer.current) clearTimeout(writeTimer.current)
      for (const [id, order] of writeQueue.current) {
        void writeJobOrder(getJobDir(id), order)
      }
      writeQueue.current.clear()
    },
    [],
  )

  const rootTemplates = useMemo(
    () => [DEFAULT_TEMPLATE, ...(templateMap.get(rootCwd) ?? [])],
    [rootCwd, templateMap],
  )
  const templates = useMemo(() => {
    const local = [DEFAULT_TEMPLATE, ...(templateMap.get(activeCwd) ?? [])]
    const names = new Set(local.map(template => template.name.toLowerCase()))
    return [
      ...local,
      ...rootTemplates.filter(template => !names.has(template.name.toLowerCase())),
    ]
  }, [activeCwd, rootTemplates, templateMap])
  const routines = useMemo<FleetRoutine[]>(() => [], [])
  const skills = skillMap.get(activeCwd) ?? skillMap.get(rootCwd) ?? []
  const prTarget = parsePrRef(query)
  const prTargetJob = prTarget
    ? (jobs ?? []).find(job => jobMatchesPr(job.state, prTarget))
    : undefined
  const dispatch = useMemo(
    () =>
      prTargetJob ? null : parseDispatch(query, templates, repositories, routines),
    [prTargetJob, query, repositories, routines, templates],
  )
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  const autocomplete = useMemo(
    () =>
      fleetSuggestions(
        query,
        templates,
        routines,
        repositories,
        skills,
        dispatch,
        showAllSuggestions,
      ),
    [
      dispatch,
      query,
      repositories,
      routines,
      showAllSuggestions,
      skills,
      templates,
    ],
  )
  const filtered = useMemo(() => {
    const persisted = jobs ?? []
    const optimistic = pendingJobs.filter(
      pending => !persisted.some(job => job.id === pending.id),
    )
    const allJobs = optimistic.length ? sortJobs([...optimistic, ...persisted]) : persisted
    if (dispatch) return allJobs
    const parsed = parseQuery(query)
    return allJobs.filter(job => matchesQuery(job, parsed))
  }, [dispatch, jobs, pendingJobs, query])

  useEffect(() => {
    if (!jobs?.length || !pendingJobs.length) return
    const persisted = new Set(jobs.map(job => job.id))
    setPendingJobs(current => current.filter(job => !persisted.has(job.id)))
  }, [jobs, pendingJobs.length])
  const groups = useMemo(
    () => groupedJobs(filtered, statuses, sessionStatuses, groupMode),
    [filtered, statuses, sessionStatuses, groupMode],
  )
  const visible = useMemo(() => groups.flatMap((group) => group.jobs), [groups])
  const rows = useMemo<FleetListRow[]>(
    () =>
      groups.flatMap(({ group, jobs: groupJobs }) => [
        { kind: 'header' as const, group, jobs: groupJobs },
        ...(collapsedGroups.has(group)
          ? []
          : groupJobs.map(job => ({ kind: 'job' as const, group, job }))),
      ]),
    [collapsedGroups, groups],
  )
  const focusedRow = rows[Math.min(focus, Math.max(0, rows.length - 1))]
  const selected = focusedRow?.kind === 'job' ? focusedRow.job : undefined
  focusedJobId.current = selected?.id ?? null
  const selectedHeader = focusedRow?.kind === 'header' ? focusedRow : undefined
  const canPin = Boolean(
    selected && !pendingJobs.some(job => job.id === selected.id),
  )
  useLayoutEffect(() => {
    if (followedHeaderGroup.current) {
      const index = rows.findIndex(
        row => row.kind === 'header' && row.group === followedHeaderGroup.current,
      )
      if (index >= 0 && index !== focus) setFocus(index)
      if (index < 0 || rows[index + 1]?.group !== followedHeaderGroup.current) {
        followedHeaderGroup.current = null
      }
      return
    }
    if (!followedJobId.current) return
    const index = rows.findIndex(
      row => row.kind === 'job' && row.job.id === followedJobId.current,
    )
    if (index < 0) {
      followedJobId.current = null
      return
    }
    if (index !== focus) {
      logForDebugging(
        `[FV-poll] follow re-pin moved focus: was=${focus} now=${index} followId=${followedJobId.current}`,
      )
      setFocus(index)
    }
  })

  useEffect(() => {
    const tagged = extractRepoCwd(query, repositories, templates)
    const next =
      tagged ??
      (selected
        ? spawnOrigin(selected.state)
        : selectedHeader?.jobs[0]
          ? spawnOrigin(selectedHeader.jobs[0].state)
          : rootCwd)
    setActiveCwd(current => (current === next ? current : next))
  }, [query, repositories, rootCwd, selected, selectedHeader, templates])

  useEffect(() => {
    setSuggestionFocus(0)
    if (query) setShowAllSuggestions(false)
  }, [activeCwd, query])

  useEffect(() => {
    if (!detail || !selected) return
    const draft = replyDrafts.current.get(selected.id) ?? ''
    setReply(draft.startsWith('!') ? draft.slice(1) : draft)
    setReplyCursor(draft.startsWith('!') ? draft.length - 1 : draft.length)
    setReplyMode(draft.startsWith('!') ? 'bash' : 'prompt')
    setReplyError(null)
  }, [detail, selected?.id])

  useEffect(() => {
    if (!detail || !selected) return
    const value = replyMode === 'bash' ? `!${reply}` : reply
    if (value) replyDrafts.current.set(selected.id, value)
    else replyDrafts.current.delete(selected.id)
  }, [detail, reply, replyMode, selected?.id])

  useEffect(() => {
    if (initialFocusAttempts.current >= 2 || !jobs) return
    initialFocusAttempts.current++
    const defaultFocus =
      rows[1]?.kind === 'job' && spawnOrigin(rows[1].job.state) === rootCwd
        ? 1
        : 0
    if (!initialJobId) {
      initialFocusAttempts.current = 2
      setFocus(defaultFocus)
      return
    }
    const index = rows.findIndex(
      row => row.kind === 'job' && row.job.id === initialJobId,
    )
    if (index >= 0) {
      initialFocusAttempts.current = 2
      followedJobId.current = initialJobId
      setFocus(index)
    }
  }, [initialJobId, jobs, rootCwd, rows])

  useEffect(() => {
    setFocus(current => Math.min(current, Math.max(0, rows.length - 1)))
    if (detail && !selected) setDetail(false)
  }, [detail, rows.length, selected])

  const reorder = (direction: -1 | 1) => {
    const currentRow = rows[focus]
    const otherRow = rows[focus + direction]
    if (currentRow?.kind !== 'job' || otherRow?.kind !== 'job') return
    if (currentRow.group !== otherRow.group) return
    const selected = currentRow.job
    const other = otherRow.job
    const selectedGroup = currentRow.group
    followedJobId.current = selected.id
    followedHeaderGroup.current = null
    if (groupMode === 'state' && selectedGroup !== 'pinned') return
    const leftOrder = effectiveSortOrder(selected.state)
    const rightOrder = effectiveSortOrder(other.state)
    const orders = new Map<string, number>()
    if (leftOrder === rightOrder) {
      const group = visible.filter((job) => {
        if (selectedGroup === 'pinned') return job.state.pinned
        return repoGroup(job.state) === selectedGroup
      })
      group.forEach((job, index) => orders.set(job.id, index))
      const selectedOrder = orders.get(selected.id)!
      orders.set(selected.id, orders.get(other.id)!)
      orders.set(other.id, selectedOrder)
    } else {
      orders.set(selected.id, rightOrder)
      orders.set(other.id, leftOrder)
    }
    setJobs((currentJobs) =>
      currentJobs
        ? sortJobs(
            currentJobs.map((job) => {
              const order = orders.get(job.id)
              return order === undefined
                ? job
                : { ...job, state: { ...job.state, sortOrder: order } }
            }),
          )
        : currentJobs,
    )
    for (const [id, order] of orders) writeQueue.current.set(id, order)
    if (writeTimer.current) clearTimeout(writeTimer.current)
    writeTimer.current = setTimeout(() => {
      const writes = [...writeQueue.current]
      writeQueue.current.clear()
      void Promise.all(
        writes.map(([id, order]) => writeJobOrder(getJobDir(id), order)),
      ).catch((caught) => setError(String(caught)))
    }, 100)
    setFocus(focus + direction)
  }

  const openJob = (job: FleetJob | undefined) => {
    if (!job || attachingJobId !== null) return
    if (pendingJobs.some(pending => pending.id === job.id)) return
    if (job.state.backend === 'peer') return
    setAttachingJobId(job.id)
    setError(null)
    const knownAlive =
      Date.now() - lastSessionStatusesTs < 1_500 &&
      sessionStatusesRef.current.get(job.state.sessionId) !== undefined
        ? true
        : undefined
    focusedJobId.current = job.id
    void respawnTemplateJob(job.id, {
      knownState: job.state,
      knownAlive,
    }).then(respawnResult => {
      if (focusedJobId.current !== job.id) return
      setAttachingJobId(null)
      if (respawnResult.ok || respawnResult.alive) {
        onAction({
          type: 'open',
          job,
          query: dispatchRef.current === null ? queryRef.current : undefined,
          groupMode: groupModeRef.current,
          jobs: jobsRef.current,
          loopKicks: lastLoopTimelines,
          statuses: sessionStatusesRef.current,
          statusesTs: lastSessionStatusesTs,
          respawnResult,
        })
      } else {
        setError(respawnResult.error)
      }
    })
  }

  const chooseSuggestion = (suggestion: FleetSuggestion) => {
    const prefix = suggestion.kind === 'skill' ? '/' : '@'
    setQuery(value =>
      autocomplete.atMatch || autocomplete.slashMatch
        ? replaceTrailingSuggestion(value, prefix, suggestion.name)
        : `${prefix}${suggestion.name} `,
    )
    setShowAllSuggestions(false)
    setSuggestionFocus(0)
  }

  const stopOrDelete = (job: FleetJob, forceDelete = false): void => {
    const band = deriveBand(job.state)
    if (!forceDelete && deleteArmed !== job.id) {
      setDeleteArmed(job.id)
      if (band === 'completed') return
      const now = new Date().toISOString()
      setJobs(current =>
        current?.map(candidate =>
          candidate.id === job.id
            ? {
                ...candidate,
                state: {
                  ...candidate.state,
                  state: 'stopped',
                  detail: 'stopped',
                  tempo: 'idle',
                  updatedAt: now,
                  firstTerminalAt: candidate.state.firstTerminalAt ?? now,
                },
                activity: 'stopped',
              }
            : candidate,
        ) ?? current,
      )
      setBusy(current => new Set(current).add(job.id))
      void stopFleetJob(job.id, job.state)
        .then(poll)
        .catch(caught => setError(String(caught)))
        .finally(() =>
          setBusy(current => {
            const next = new Set(current)
            next.delete(job.id)
            return next
          }),
        )
      return
    }
    setDeleteArmed(null)
    setBusy(current => new Set(current).add(job.id))
    logEvent('tengu_bg_agent_action', { action: 'delete' })
    setJobs(current => current?.filter(candidate => candidate.id !== job.id) ?? current)
    void deleteBgJob(job.id)
      .then(poll)
      .catch(caught => setError(String(caught)))
      .finally(() =>
        setBusy(current => {
          const next = new Set(current)
          next.delete(job.id)
          return next
        }),
      )
  }

  const insertQueryText = (text: string): void => {
    setQuery(value =>
      value.slice(0, queryCursor) + text + value.slice(queryCursor),
    )
    setQueryCursor(queryCursor + text.length)
  }

  const handleQueryPaste = (rawText: string): void => {
    const text = stripAnsi(rawText)
      .replace(/\r\n|\r/g, '\n')
      .replaceAll('\t', '    ')
    const lineCount = getPastedTextRefNumLines(text)
    if (text.length > PASTE_THRESHOLD || lineCount > 2) {
      const id = nextPasteId.current++
      setPastedContents(current => ({
        ...current,
        [id]: { id, type: 'text', content: text },
      }))
      insertQueryText(formatPastedTextRef(id, lineCount))
      return
    }
    insertQueryText(text)
  }

  const submitReply = (value: string): void => {
    if (!selected) return
    const text = value.trim()
    if (!text && replyMode === 'prompt') {
      openJob(selected)
      return
    }
    if (!text) return
    const mode = replyMode
    const outgoing = mode === 'bash' ? `!${text}` : text
    replyDrafts.current.delete(selected.id)
    setReply('')
    setReplyCursor(0)
    setReplyMode('prompt')
    setReplyError(null)
    setBusy(current => new Set(current).add(selected.id))
    setJobs(current =>
      current?.map(job => {
        if (job.id !== selected.id) return job
        const state = optimisticReplyState(job.state, outgoing)
        return { ...job, state, activity: deriveActivity(state) }
      }) ?? current,
    )
    void sendJobReply(selected.id, outgoing, selected.state)
      .then(async result => {
        if (
          result === "That session isn't running — respawn it first" &&
          mode === 'prompt'
        ) {
          const respawned = await respawnTemplateJob(selected.id, {
            knownState: selected.state,
            initialPrompt: outgoing,
          })
          return respawned.ok ? null : respawned.error
        }
        return result
      })
      .then(result => {
        if (result) {
          replyDrafts.current.set(selected.id, outgoing)
          setReply(outgoing.startsWith('!') ? outgoing.slice(1) : outgoing)
          setReplyCursor(outgoing.startsWith('!') ? outgoing.length - 1 : outgoing.length)
          setReplyMode(outgoing.startsWith('!') ? 'bash' : 'prompt')
          setReplyError(result)
        }
        return poll()
      })
      .catch(caught => setReplyError(String(caught)))
      .finally(() =>
        setBusy(current => {
          const next = new Set(current)
          next.delete(selected.id)
          return next
        }),
      )
  }

  useInput((input, key) => {
    if (renameId) {
      if (key.escape || (key.ctrl && input === 'c')) {
        setRenameId(null)
        setRenameDraft('')
        return
      }
      if (key.return) {
        const job = (jobs ?? []).find(candidate => candidate.id === renameId)
        const name = renameDraft.trim()
        setRenameId(null)
        setRenameDraft('')
        if (!job || !name) return
        const now = new Date().toISOString()
        setJobs(current =>
          current?.map(candidate =>
            candidate.state.sessionId === job.state.sessionId
              ? {
                  ...candidate,
                  state: {
                    ...candidate.state,
                    name,
                    ...(candidate.state.backend === 'peer' ? { intent: name } : {}),
                    updatedAt: now,
                  },
                }
              : candidate,
          ) ?? current,
        )
        if (job.state.backend === 'peer') {
          if (job.state.sock) {
            void sendControlToUdsSocket(job.state.sock, {
              action: 'rename',
              name,
            }).catch(caught => {
              logForDebugging(`[fleetview] peer rename failed: ${String(caught)}`)
              void poll()
            })
          }
        } else {
          void renameJob(job.state.sessionId, name).catch(caught =>
            setError(String(caught)),
          )
        }
        return
      }
      if (key.backspace || key.delete) {
        setRenameDraft(value => value.slice(0, -1))
        return
      }
      if (!key.ctrl && !key.meta && !key.super && input) {
        setRenameDraft(value => value + input)
      }
      return
    }
    if (attachingJobId !== null) {
      if (key.ctrl && input === 'c') {
        focusedJobId.current = null
        setAttachingJobId(null)
      }
      return
    }
    if (key.ctrl && input === 'c') {
      if (exitArmed) {
        onAction({ type: 'done' })
        return
      }
      setExitArmed(true)
      if (query) setQuery('')
      setTimeout(() => setExitArmed(false), 2_000)
      return
    }
    if (detail) {
      if (key.ctrl && input === 'x' && selected) {
        stopOrDelete(selected)
        return
      }
      if (key.escape || (input === ' ' && !reply && replyMode === 'prompt')) {
        setDetail(false)
        setReplyError(null)
        return
      }
      if (key.rightArrow && !reply && replyMode === 'prompt') {
        if (selected) openJob(selected)
        return
      }
      // The focused shared TextInput owns editing, paste, cursor movement,
      // multiline insertion, and submission in detail mode.
      return
    }
    if (key.escape) {
      if (showAllSuggestions) setShowAllSuggestions(false)
      else if (query) setQuery('')
      else onAction({ type: 'done' })
      return
    }
    if (input === '?' && !query) {
      setShowHelp(value => !value)
      logEvent('tengu_bg_agent_action', { action: 'help_toggled' })
      return
    }
    if (key.shift && key.upArrow) return reorder(-1)
    if (key.shift && key.downArrow) return reorder(1)
    if (key.upArrow || (key.ctrl && input === 'p')) {
      if (autocomplete.suggestions.length) {
        setSuggestionFocus(value => Math.max(0, value - 1))
        return
      }
      followedHeaderGroup.current = null
      followedJobId.current = null
      setFocus((value) => Math.max(0, value - 1))
      return
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      if (autocomplete.suggestions.length) {
        setSuggestionFocus(value =>
          Math.min(autocomplete.suggestions.length - 1, value + 1),
        )
        return
      }
      followedHeaderGroup.current = null
      followedJobId.current = null
      setFocus((value) => Math.min(Math.max(0, rows.length - 1), value + 1))
      return
    }
    if (key.ctrl && input === 's') {
      followedJobId.current = selected?.id ?? null
      followedHeaderGroup.current = null
      setGroupMode((mode) => {
        lastGroupMode = mode === 'directory' ? 'state' : 'directory'
        saveGlobalConfig(current => ({
          ...current,
          fleetViewGroupMode: lastGroupMode,
        }))
        return lastGroupMode
      })
      return
    }
    if (key.ctrl && input === 'r' && selected) {
      if (selected.state.backend === 'peer' && !selected.state.sock) return
      setRenameId(selected.id)
      setRenameDraft(selected.state.name ?? '')
      return
    }
    if (key.ctrl && input === 'g') {
      const edited = editPromptInEditor(query, pastedContents)
      if (edited.content !== null && edited.content !== query) {
        setQuery(edited.content)
        setQueryCursor(edited.content.length)
      }
      if (edited.error) setError(edited.error)
      return
    }
    if (key.ctrl && input === 'x' && selectedHeader?.jobs.length) {
      if (deleteAllArmed !== selectedHeader.group) {
        setDeleteAllArmed(selectedHeader.group)
        setTimeout(() => setDeleteAllArmed(null), 2_000)
        return
      }
      setDeleteAllArmed(null)
      for (const job of selectedHeader.jobs) {
        if (job.state.backend !== 'peer') stopOrDelete(job, true)
      }
      return
    }
    if (key.ctrl && input === 't' && selected) {
      if (pendingJobs.some(job => job.id === selected.id)) return
      if (selected.state.backend === 'peer') {
        setError("Can't pin a session that's running in another terminal")
        return
      }
      followedJobId.current = selected.id
      followedHeaderGroup.current = null
      const pinned = !selected.state.pinned
      if (pinned) {
        setCollapsedGroups(current => {
          if (!current.has('pinned')) return current
          const next = new Set(current)
          next.delete('pinned')
          return next
        })
      }
      setJobs((current) =>
        current?.map((job) =>
          job.id === selected.id
            ? { ...job, state: { ...job.state, pinned } }
            : job,
        ) ?? current,
      )
      void setJobPinned(selected.id, pinned).catch((caught) =>
        setError(String(caught)),
      )
      return
    }
    if (input === 'l' && !query && selected) {
      onAction({ type: 'logs', job: selected })
      return
    }
    if (input === 'r' && !query && selected && needsRespawn(selected.state)) {
      setBusy((current) => new Set(current).add(selected.id))
      void respawnTemplateJob(selected.id, { knownState: selected.state })
        .then((result) => {
          if (!result.ok) setError(result.error)
          return poll()
        })
        .finally(() =>
          setBusy((current) => {
            const next = new Set(current)
            next.delete(selected.id)
            return next
          }),
        )
      return
    }
    if (key.ctrl && input === 'x' && !query && selected) {
      stopOrDelete(selected)
      return
    }
    if (input === ' ' && !query && selected) {
      recordFleetAgentAction('peek', selected.state)
      followedJobId.current = selected.id
      followedHeaderGroup.current = null
      setDetail(true)
      return
    }
    if (key.tab) {
      const suggestion =
        autocomplete.suggestions[
          Math.min(suggestionFocus, autocomplete.suggestions.length - 1)
        ]
      if (suggestion) chooseSuggestion(suggestion)
      else if (!query && templates.length) setShowAllSuggestions(value => !value)
      return
    }
    if (key.rightArrow && !query && selected) {
      openJob(selected)
      return
    }
    if (
      (key.meta || key.super) &&
      /^[1-9]$/.test(input) &&
      !query
    ) {
      let ordinal = Number(input)
      const origin = selected
        ? spawnOrigin(selected.state)
        : selectedHeader?.jobs[0]
          ? spawnOrigin(selectedHeader.jobs[0].state)
          : rootCwd
      const quick = rows.find(row => {
        if (row.kind !== 'job' || spawnOrigin(row.job.state) !== origin) return false
        ordinal--
        return ordinal === 0
      })
      if (quick?.kind === 'job') openJob(quick.job)
      return
    }
    if (key.return) {
      if (key.meta || query[queryCursor - 1] === '\\') return
      const suggestion =
        autocomplete.suggestions[
          Math.min(suggestionFocus, autocomplete.suggestions.length - 1)
        ]
      if (suggestion) {
        chooseSuggestion(suggestion)
        return
      }
      if (prTargetJob) {
        openJob(prTargetJob)
        return
      }
      if (!query.trim()) {
        if (selectedHeader) {
          followedHeaderGroup.current = selectedHeader.group
          followedJobId.current = null
          setCollapsedGroups(current => {
            const next = new Set(current)
            if (next.has(selectedHeader.group)) next.delete(selectedHeader.group)
            else next.add(selectedHeader.group)
            return next
          })
        } else if (selected) openJob(selected)
        return
      }
      if (!dispatch || (!dispatch.intent && !dispatch.routine)) return
      const intent = expandPastedTextRefs(dispatch.intent, pastedContents)
      if (!dispatch.routine && intent.trim().length < 4) {
        setError('Too short — describe the task')
        return
      }
      setError(null)
      const template: TemplateJob = dispatch.template
      const cwd = dispatch.cwd ?? activeCwd
      const spare = getPrewarmedJob()
      const canClaim =
        Boolean(spare?.ready) &&
        !dispatch.matched &&
        !dispatch.routine &&
        spare?.cwd === cwd &&
        intent.length <= 800 &&
        !intent.includes('\n')
      const sessionId = canClaim ? spare!.sessionId : randomUUID()
      const optimistic: FleetJob = {
        id: sessionId.slice(0, 8),
        state: {
          state: 'working',
          detail: intent.replace(/[\r\n]+/g, ' ').slice(0, 80),
          tempo: 'active',
          output: null,
          children: null,
          linkScanOffset: 0,
          template: dispatch.routine ?? template.name,
          routine: dispatch.routine,
          intent,
          initialPrompt: template.initialPrompt,
          sessionId,
          cwd,
          originCwd: cwd,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          firstTerminalAt: null,
          backend: 'daemon',
        },
        activity: 'flowing',
      }
      const originalQuery = query
      const originalPastedContents = pastedContents
      setPendingJobs(current => [...current, optimistic])
      queryRef.current = ''
      setQuery('')
      setQueryCursor(0)
      setPastedContents({})
      void (canClaim
        ? claimPrewarmedJob(intent)
        : dispatchTemplateJob(
            template,
            intent,
            sessionId,
            cwd,
            dispatch.routine,
          )
      ).then((result) => {
        if (canClaim) void prewarmTemplateJob(rootCwd)
        if (!result.ok) {
          setPendingJobs(current => current.filter(job => job.id !== optimistic.id))
          setError(result.error)
          if (!queryRef.current) {
            setQuery(originalQuery)
            setQueryCursor(originalQuery.length)
            setPastedContents(originalPastedContents)
          }
        } else {
          if (dispatch.matched) {
            saveGlobalConfig(current => {
              const now = Date.now()
              const previous = current.agentLastUsed?.[template.name]
              if (previous !== undefined && now - previous < 60_000) return current
              return {
                ...current,
                agentLastUsed: {
                  ...current.agentLastUsed,
                  [template.name]: now,
                },
              }
            })
          }
          if (key.shift) {
            const opened: FleetJob = {
              ...optimistic,
              id: result.jobId,
              state: {
                ...optimistic.state,
                sessionId,
              },
            }
            onAction({
              type: 'open',
              job: opened,
              groupMode,
              jobs: jobsRef.current,
              loopKicks: lastLoopTimelines,
              statuses: sessionStatusesRef.current,
              statusesTs: lastSessionStatusesTs,
              freshDispatch: true,
            })
          }
        }
        void poll()
      })
      return
    }
    // The shared TextInput below owns ordinary task-query editing and paste.
  })

  let rowIndex = 0
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold>Claude agents</Text>
        <Text dimColor>
          {groupMode === 'directory' ? 'by directory' : 'by state'} · ctrl+s switch
        </Text>
      </Box>
      {renameId ? (
        <Text dimColor>rename› {renameDraft}</Text>
      ) : (
        <Box>
          <Text dimColor>task› </Text>
          <TextInput
            value={query}
            onChange={value => {
              queryRef.current = value
              setQuery(value)
            }}
            cursorOffset={queryCursor}
            onChangeCursorOffset={setQueryCursor}
            columns={Math.max(20, (process.stdout.columns ?? 80) - 8)}
            placeholder="describe a task for a new session"
            focus={!detail}
            showCursor={!detail}
            multiline
            disableEscapeDoublePress
            onPaste={handleQueryPaste}
            inputFilter={(value, key) =>
              key.ctrl || key.escape ? '' : value
            }
          />
        </Box>
      )}
      {showHelp && !detail ? (
        <Text dimColor>
          enter attach · space peek · l logs · r respawn · x stop/rm{canPin ? ' · ctrl+t pin' : ''} · shift+↑↓ reorder · ctrl+s group
        </Text>
      ) : null}
      {autocomplete.suggestions.length > 0 ? (
        <Box flexDirection="column" paddingLeft={2}>
          {autocomplete.suggestions.slice(0, 8).map((suggestion, index) => (
            <Text key={`${suggestion.kind}:${suggestion.name}`}>
              {index === suggestionFocus ? '❯' : ' '}{' '}
              {suggestion.kind === 'skill' ? '/' : '@'}{suggestion.name}{' '}
              <Text dimColor>
                {suggestion.kind} · {suggestion.description}
              </Text>
            </Text>
          ))}
        </Box>
      ) : null}
      {error ? <Text color="warning">{error}</Text> : null}
      {jobs === null ? <Text dimColor>loading…</Text> : null}
      {jobs !== null && visible.length === 0 ? (
        query ? (
          <Text dimColor>no matching agents</Text>
        ) : (
          <Box flexDirection="column" paddingLeft={2}>
            <Text dimColor>
              Agents here keep running even if you close this terminal — hand off a task and check back later.
            </Text>
            <Text dimColor>
              {'Try: paste a link, or "review PR #123 for bugs" · "fix the failing test" · "babysit my PR until CI passes"'}
            </Text>
          </Box>
        )
      ) : null}
      {groups.map(({ group, jobs: groupJobs }) => {
        const headerIndex = rowIndex++
        const headerSelected = headerIndex === focus
        const collapsed = collapsedGroups.has(group)
        return (
          <Box key={group} flexDirection="column">
            <Text bold={headerSelected} dimColor={!headerSelected}>
              {headerSelected ? '❯ ' : '  '}
              {group === 'pinned'
                ? 'Pinned'
                : groupMode === 'state'
                  ? group[0].toUpperCase() + group.slice(1)
                  : repoGroupLabel(group)}
              {collapsed ? ` ${groupJobs.length}` : ''}
            </Text>
          {!collapsed ? groupJobs.map((job) => {
            const index = rowIndex++
            const selectedRow = index === focus
            const sessionStatus = sessionStatuses.get(job.state.sessionId)
            const icon = pickIcon(job.state, job.activity, sessionStatus)
            const style = glyphColor(job.state, job.activity, sessionStatus)
            const timeline = lastLoopTimelines.get(job.state.sessionId)
            const next =
              timeline?.nextAt && timeline.nextAt > Date.now()
                ? ` · next ${eventAge(new Date(timeline.nextAt).toISOString())}`
                : ''
            const childRows = (job.state.children ?? []).map((child) => {
              const status = statuses.get(child.href)
              return status
                ? `#${status.number} ${actionableStatus(status)
                    .map((segment) => segment.text)
                    .join(' ')}`
                : `#${child.id}`
            })
            return (
              <Box key={job.id} flexDirection="column">
                <Text
                  color={style.color}
                  dimColor={style.dim}
                  bold={selectedRow}
                >
                  {selectedRow ? '❯' : ' '} {job.state.pinned ? '★' : icon ?? '◉'}{' '}
                  {jobLabel(job.state)} · {job.id} · {job.activity} ·{' '}
                  {eventAge(job.state.updatedAt)}{next}
                  {busy.has(job.id) ? ' · updating…' : ''}
                </Text>
                {selectedRow && job.state.detail ? (
                  <Text dimColor>    {job.state.detail}</Text>
                ) : null}
                {selectedRow
                  ? childRows.slice(0, 8).map((row) => (
                      <Text key={row} dimColor>
                        {'    '}{row}
                      </Text>
                    ))
                  : null}
                {selectedRow && childRows.length > 8 ? (
                  <Text dimColor>    … {childRows.length - 8} more</Text>
                ) : null}
              </Box>
            )
          }) : null}
          </Box>
        )
      })}
      {detail && selected ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={replyMode === 'bash' ? 'warning' : undefined}
          paddingX={1}
        >
          <Text bold>{jobLabel(selected.state)} · {selected.id}</Text>
          {selected.state.needs ? (
            <Text color="warning">needs: {selected.state.needs}</Text>
          ) : null}
          {(selected.state.children ?? []).slice(0, 8).map(child => {
            const status = statuses.get(child.href)
            return (
              <Text key={child.href} dimColor>
                #{status?.number ?? child.id}{status?.title ? ` ${status.title}` : ''}
                {status ? ` · ${actionableStatus(status).map(part => part.text).join(' ')}` : ''}
              </Text>
            )
          })}
          {!selected.state.needs
            ? Object.entries(selected.state.output ?? {}).map(([name, value]) => (
                <Text key={name} dimColor>
                  {Object.keys(selected.state.output ?? {}).length > 1 ? `${name} ` : ''}
                  {eventAge(selected.state.updatedAt)} {String(value)}
                </Text>
              ))
            : null}
          {!selected.state.needs &&
          !(selected.state.children?.length || Object.keys(selected.state.output ?? {}).length) ? (
            <Text dimColor>
              {eventAge(selected.state.updatedAt)} {selected.state.detail}
            </Text>
          ) : null}
          <Box>
            <Text>{replyMode === 'bash' ? 'bash› ' : 'reply› '}</Text>
            <TextInput
              value={reply}
              onChange={setReply}
              onSubmit={submitReply}
              cursorOffset={replyCursor}
              onChangeCursorOffset={setReplyCursor}
              columns={Math.max(20, (process.stdout.columns ?? 80) - 8)}
              placeholder="type a reply · blank enter attaches"
              focus
              showCursor
              multiline
              disableEscapeDoublePress
              onPaste={rawText => {
                const text = stripAnsi(rawText)
                  .replace(/\r\n|\r/g, '\n')
                  .replaceAll('\t', '    ')
                setReply(value =>
                  value.slice(0, replyCursor) +
                  text +
                  value.slice(replyCursor),
                )
                setReplyCursor(replyCursor + text.length)
              }}
              inputFilter={(value, key) => {
                if (key.ctrl || key.escape) return ''
                if (replyMode === 'prompt' && value === '!' && !reply) {
                  setReplyMode('bash')
                  return ''
                }
                if (replyMode === 'bash' && key.backspace && !reply) {
                  setReplyMode('prompt')
                  return ''
                }
                return value
              }}
            />
          </Box>
          {replyError ? <Text color="error">{replyError}</Text> : null}
        </Box>
      ) : null}
      <Text dimColor>
        {exitArmed
          ? `Press Ctrl-C again to exit${visible.filter(job => !isSettledJob(job.state)).length ? ` · ${visible.filter(job => !isSettledJob(job.state)).length} ${visible.filter(job => !isSettledJob(job.state)).length === 1 ? 'agent' : 'agents'} will keep running` : ''}`
          : renameId
            ? 'enter save · escape cancel'
            : deleteAllArmed
              ? 'ctrl+x confirm delete all'
              : detail
                ? 'enter send/attach · ! bash · ctrl+x delete · esc/space back'
                : `↑↓ move · enter attach/dispatch · space peek · tab complete · l logs · r respawn · ctrl+x stop/delete · ctrl+r rename${canPin ? ' · ctrl+t pin' : ''} · shift+↑↓ reorder · esc exit`}
      </Text>
      <AutoUpdaterWrapper
        isUpdating={isUpdating}
        onChangeIsUpdating={setIsUpdating}
        showSuccessMessage={true}
        verbose={false}
      />
    </Box>
  )
}

export async function mountFleetView(root: Root): Promise<void> {
  logEvent('tengu_bg_agent_action', { action: 'list_open' })
  let currentRoot = root
  let appState: AppState | undefined
  const alternateScreen = shouldUseFleetAlternateScreen()
  let initialJobId = process.env.CLAUDE_AGENTS_SELECT
  delete process.env.CLAUDE_AGENTS_SELECT
  let initialQuery: string | undefined
  let initialError: string | undefined
  try {
    for (;;) {
      const action = await new Promise<FleetAction>((resolve) => {
        const view = (
          <AppStateProvider
            initialState={appState}
            onChangeAppState={({ newState }) => {
              appState = newState
            }}
          >
            <ThemeProvider>
              <FleetView
                onAction={resolve}
                initialJobId={initialJobId}
                initialQuery={initialQuery}
                initialError={initialError}
                initialGroupMode={lastGroupMode}
              />
            </ThemeProvider>
          </AppStateProvider>
        )
        currentRoot.render(
          alternateScreen ? (
            <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>
              {view}
            </AlternateScreen>
          ) : (
            view
          ),
        )
      })
      if (!alternateScreen) currentRoot.render(null)
      currentRoot.unmount()
      if (action.type === 'done') return
      const unregisterTerminalRestore = alternateScreen
        ? registerCleanup(async () => {
            process.stdout.write(leaveFleetTerminal())
          })
        : () => {}
      if (alternateScreen) {
        process.stdout.write(
          `${enterFleetTerminal()}\n  \x1B[2mOpening ${jobLabel(
            action.job.state,
            action.job.id === initialJobId,
          )}…\x1B[0m\n`,
        )
      }
      initialJobId = action.job.id
      initialQuery = undefined
      initialError = undefined
      if (action.type === 'logs') {
        await (await import('../cli/bg.js')).logsHandler(action.job.id)
        if (alternateScreen) process.stdout.write(enterFleetTerminal())
        currentRoot = await createRoot({ exitOnCtrlC: false })
        logForDebugging('[PERF:bg-remount-start]')
        unregisterTerminalRestore()
        continue
      }

      initialQuery = action.query
      lastGroupMode = action.groupMode
      lastJobs = action.jobs
      lastLoopTimelines = action.loopKicks
      lastSessionStatuses = action.statuses
      lastSessionStatusesTs = action.statusesTs

      const openingAt = Date.now()
      const respawn =
        action.respawnResult ??
        (await respawnTemplateJob(
          action.job.id,
          action.freshDispatch
            ? undefined
            : {
                knownState: action.job.state,
                knownAlive:
                  Date.now() - action.statusesTs < 1_500 &&
                  action.statuses.has(action.job.state.sessionId),
              },
        ).catch(caught => ({
          ok: false as const,
          alive: false,
          error: `Couldn't respawn — ${String(caught)}`,
        })))
      logForDebugging(
        `[FV-attach] respawnJob ${action.job.id}: ok=${respawn.ok} alive=${
          !respawn.ok && respawn.alive
        } err=${respawn.ok ? '' : respawn.error}`,
      )
      if (respawn.ok || respawn.alive) {
        recordFleetAgentAction('attach', action.job.state)
        process.stdout.write(
          osc(OSC.SET_TITLE_AND_ICON, jobLabel(action.job.state, true)),
        )
        const attachedAt = Date.now()
        let attached = await attachJob(action.job.id)
        if (attached.kind === 'error' && attached.orphaned) {
          const forced = await respawnTemplateJob(action.job.id, {
            force: true,
            knownState: action.job.state,
          }).catch(caught => ({
            ok: false as const,
            alive: false,
            error: `Couldn't respawn — ${String(caught)}`,
          }))
          if (forced.ok) attached = await attachJob(action.job.id)
          else attached = { kind: 'error', msg: forced.error }
        }
        if (attached.kind === 'error') initialError = attached.msg
        recordFleetAgentAction('detach', action.job.state, {
          attachDurationMs: Date.now() - attachedAt,
        })
        logForDebugging(
          `[FV-attach] attachJob returned after ${Date.now() - openingAt}ms — remounting list`,
        )
      } else {
        initialError = respawn.error
      }
      resetInteractionBaseline()
      if (alternateScreen) process.stdout.write(enterFleetTerminal())
      currentRoot = await createRoot({ exitOnCtrlC: false })
      logForDebugging('[PERF:bg-remount-start]')
      unregisterTerminalRestore()
    }
  } finally {
    await Promise.all([
      stopPrewarming().catch(() => {}),
      clearFleetViewHeartbeat().catch(() => {}),
    ])
  }
}

export function _resetRemountCachesForTesting(): void {
  lastPrStatuses.clear()
  lastLoopTimelines.clear()
  lastJobs = null
  lastGroupMode = 'directory'
  lastSessionStatuses.clear()
  lastSessionStatusesTs = 0
  repositoryCache.clear()
  templateCache.clear()
  skillCache.clear()
}
