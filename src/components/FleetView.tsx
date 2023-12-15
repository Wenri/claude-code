import { createReadStream } from 'fs'
import { randomUUID } from 'crypto'
import chalk from 'chalk'
import figures from 'figures'
import { readdir, stat } from 'fs/promises'
import { createInterface } from 'readline'
import { basename, isAbsolute, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import stripAnsi from 'strip-ansi'
import {
  Box,
  Link,
  Text,
  createRoot,
  useAnimationFrame,
  type Root,
} from '../ink.js'
import { AlternateScreen } from '../ink/components/AlternateScreen.js'
import ScrollBox, {
  type ScrollBoxHandle,
} from '../ink/components/ScrollBox.js'
import type { DOMElement } from '../ink/dom.js'
import type { KeyboardEvent } from '../ink/events/keyboard-event.js'
import type { PasteEvent } from '../ink/events/paste-event.js'
import instances from '../ink/instances.js'
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
import { AutoUpdaterWrapper } from './AutoUpdaterWrapper.js'
import { SearchBox } from './SearchBox.js'
import { Clawd } from './LogoV2/Clawd.js'
import { Byline } from './design-system/Byline.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { PromptInputFooterSuggestions } from './PromptInput/PromptInputFooterSuggestions.js'
import { getDefaultCharacters } from './Spinner/utils.js'
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
  writeJobStateOrder,
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
  DEFAULT_TEMPLATE,
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
import {
  canonicalizePath,
  getProjectDir,
} from '../utils/sessionStoragePortable.js'
import {
  expandPastedTextRefs,
  formatPastedTextRef,
  getPastedTextRefNumLines,
} from '../history.js'
import {
  findCanonicalGitRoot,
  findRepoRemoteSlug,
  getBranch,
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
import { openBrowser, openPath } from '../utils/browser.js'
import { editPromptInEditor } from '../utils/promptEditor.js'
import { tailFile } from '../utils/fsOperations.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import {
  cleanupFleetDrafts,
  deleteFleetDraft,
  loadFleetDraft,
  saveFleetDraft,
  saveFleetDraftSync,
} from '../utils/fleetDraft.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../utils/envUtils.js'
import { isMouseTrackingEnabled, isTmuxControlMode } from '../utils/fullscreen.js'
import {
  AppStateProvider,
  type AppState,
  useAppState,
} from '../state/AppState.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { useSearchInput } from '../hooks/useSearchInput.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import {
  getLogoDisplayData,
  truncatePath,
} from '../utils/logoV2Utils.js'
import { truncateStartToWidth } from '../utils/truncate.js'
import { formatDuration, formatRelativeTime } from '../utils/format.js'
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

const STATE_GROUP_LABELS: Record<StateBucket, string> = {
  review: 'Ready for review',
  blocked: 'Blocked',
  working: 'Working',
  done: 'Done',
}

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
    source: 'fleet',
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

type FleetChild = NonNullable<JobState['children']>[number]

type FleetChildRow = {
  row: FleetChild
  label: string
  status: ActionableSegment[]
  diffStat?: { additions: number; deletions: number }
  color?: PrStatusColor | 'claude'
  sortRank: number
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
    state.children?.filter(child => child.kind !== 'frame').length &&
    state.children
      .filter(child => child.kind !== 'frame')
      .every(child => statuses.get(child.href)?.state === 'MERGED')
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
  if (job.activity === 'failure') return 'blocked'
  if (job.activity === 'stopped') return 'done'
  if (sessionStatus === 'waiting') return 'blocked'
  if (
    job.state.children?.some((child) => {
      const status = statuses?.get(child.href)
      if (status?.state !== 'OPEN') return false
      const color = prStatusColor(status)
      return (
        color === 'error' ||
        (color === 'warning' && status.review !== 'APPROVED')
      )
    })
  ) {
    return 'review'
  }
  if (
    job.state.tempo === 'blocked'
  ) {
    return 'blocked'
  }
  if (job.activity === 'success') return 'done'
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
  firstWord: string
  isSlashQuery: boolean
  atMatch: boolean
  slashMatch: boolean
  templateNames: Set<string>
  repoNames: string[]
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
    firstWord,
    isSlashQuery: slashQuery,
    atMatch: at !== null,
    slashMatch: slash !== null,
    templateNames,
    repoNames,
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

export function effectiveStateSortOrder(state: JobState): number {
  return state.stateSortOrder ?? Date.parse(state.updatedAt)
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
  state: Pick<JobState, 'state' | 'tempo'>,
  activity: JobActivity,
  sessionStatus?: SessionStatus,
): { color?: 'success' | 'inactive' | 'error' | 'warning'; dim: boolean } {
  if (terminalStateActivity(state.state)) {
    if (activity === 'success') return { color: 'success', dim: false }
    if (activity === 'failure') return { color: 'error', dim: false }
    if (activity === 'stopped') return { color: 'inactive', dim: false }
  }
  if (sessionStatus === 'busy') return { color: undefined, dim: false }
  if (state.tempo === 'blocked' || sessionStatus === 'waiting') {
    return { color: 'warning', dim: false }
  }
  return { color: undefined, dim: true }
}

export function pickIcon(
  state: Pick<JobState, 'state' | 'tempo' | 'intent' | 'initialPrompt'>,
  activity?: JobActivity,
  sessionStatus?: SessionStatus,
): string | null {
  if (
    terminalStateActivity(state.state) &&
    state.tempo !== 'active' &&
    sessionStatus === undefined
  ) return '∙'
  if (sessionStatus === 'busy') return null
  const characters = getDefaultCharacters()
  if (isLoopJob(state)) return characters[1] ?? '✢'
  return characters[4] ?? '✻'
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

function isFrameChild(row: FleetChildRow): boolean {
  return row.row.kind === 'frame'
}

function fleetChildRows(
  children: FleetChild[],
  statuses: ReadonlyMap<string, PrStatus | null>,
): FleetChildRow[] {
  const rank: Partial<Record<PrStatusColor, number>> = {
    error: 3,
    warning: 2,
    success: 1,
  }
  return children
    .map(row => {
      if (row.kind === 'frame') {
        return {
          row,
          label: row.id,
          status: [],
          color: 'claude' as const,
          sortRank: 0,
        }
      }
      const status = statuses.get(row.href)
      const rawColor = status ? prStatusColor(status) : undefined
      return {
        row,
        label: status ? `#${status.number} ${status.title}` : `#${row.id}`,
        status: status ? actionableStatus(status) : [],
        diffStat:
          status && status.state !== 'MERGED' && status.state !== 'CLOSED'
            ? { additions: status.additions, deletions: status.deletions }
            : undefined,
        color: status ? childStatusColor(status) : undefined,
        sortRank:
          status?.state === 'OPEN' && rawColor ? (rank[rawColor] ?? 0) : 0,
      }
    })
    .sort((left, right) => right.sortRank - left.sortRank)
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

async function readJobLogTail(job: FleetJob): Promise<string> {
  try {
    const transcript = join(
      getProjectDir(job.state.cwd),
      `${job.state.sessionId}.jsonl`,
    )
    const { content } = await tailFile(transcript, 16_384)
    const summaries = content
      .split('\n')
      .map(summarizeEvent)
      .filter((value): value is string => value !== null)
      .filter((value, index, values) => value !== values[index - 1])
    return summaries.at(-1)?.trim() ?? ''
  } catch {
    return ''
  }
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
      job.state.detail,
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
  preferredGroup?: string,
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
      if (left === preferredGroup && right !== preferredGroup) return -1
      if (right === preferredGroup && left !== preferredGroup) return 1
      return left.localeCompare(right)
    })
    .map(([group, values]) => ({
      group,
      jobs:
        mode === 'state' && group !== 'pinned'
          ? [...values].sort(
              (left, right) =>
                effectiveStateSortOrder(right.state) -
                effectiveStateSortOrder(left.state),
            )
          : sortJobs(values),
    }))
}

function eventAge(timestamp: string): string {
  return formatDuration(Math.max(0, Date.now() - Date.parse(timestamp)), {
    mostSignificantOnly: true,
  })
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
  logEvent('tengu_bg_agent_action', {
    action: 'stop',
    source: 'fleet',
    jobSessionId: knownState.sessionId,
  })
  const stopped = await killJob(short, knownState)
  if (!stopped.confirmed) {
    throw new Error(stopped.error ?? 'worker may still be running')
  }
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

type FleetColumnWidths = {
  label: number
  age: number
}

function cleanFleetText(value: string | undefined): string {
  return (value ?? '')
    .replace(/<(system-reminder|task-notification)>[\s\S]*?(<\/\1>|$)/g, ' ')
    .replace(/<\/?[\w-]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function durationUntil(timestamp: number): string {
  return formatDuration(Math.max(0, timestamp - Date.now()), {
    mostSignificantOnly: true,
  })
}

function fleetJobAge(job: FleetJob, loopNextFireMs?: number | null): string {
  if (loopNextFireMs != null && loopNextFireMs > Date.now()) {
    return `in ${durationUntil(loopNextFireMs)}`
  }
  return eventAge(job.state.createdAt)
}

function fleetResultLink(value: string): string | null {
  const trimmed = value.trim()
  if (/\s/.test(trimmed)) return null
  if (/^https?:\/\//.test(trimmed)) return trimmed
  return isAbsolute(trimmed) ? pathToFileURL(trimmed).href : null
}

const FLEET_SPINNER_FRAMES = [
  ...getDefaultCharacters(),
  ...[...getDefaultCharacters()].reverse(),
]

function FleetSpinner(): React.ReactNode {
  const [, time] = useAnimationFrame(120)
  return FLEET_SPINNER_FRAMES[
    Math.floor(time / 120) % FLEET_SPINNER_FRAMES.length
  ]
}

function renderRenameDraft(
  draft: string,
  cursor: number,
  width: number,
): React.ReactNode {
  const cursorCharacter = draft.slice(cursor, cursor + 1) || ' '
  const suffix = draft.slice(cursor + 1)
  const prefix = truncateStartToWidth(
    draft.slice(0, cursor),
    width - stringWidth(cursorCharacter) - (suffix ? 1 : 0),
  )
  return (
    <>
      <Text>{prefix}</Text>
      <Text inverse>{cursorCharacter}</Text>
      <Text>{suffix}</Text>
    </>
  )
}

function useFleetLabelTransition(
  label: string,
  hasName: boolean,
): { display: string; newLength: number } | null {
  const previous = useRef({ label, hasName })
  const [transition, setTransition] = useState<{
    oldLabel: string
    position: number
  } | null>(null)

  useLayoutEffect(() => {
    if (previous.current.hasName || !hasName) {
      previous.current = { label, hasName }
      return
    }
    const oldLabel = previous.current.label
    previous.current = { label, hasName: true }
    const length = Math.max([...oldLabel].length, [...label].length)
    if (length === 0) return
    let position = 1
    setTransition({ oldLabel, position })
    const interval = setInterval(() => {
      position++
      if (position >= length) {
        setTransition(null)
        clearInterval(interval)
      } else {
        setTransition({ oldLabel, position })
      }
    }, Math.max(16, Math.floor(360 / length)))
    return () => {
      clearInterval(interval)
      setTransition(null)
    }
  }, [hasName, label])

  if (!transition) return null
  const oldCharacters = [...transition.oldLabel]
  const newCharacters = [...label]
  const length = Math.max(oldCharacters.length, newCharacters.length)
  const prefix = newCharacters
    .slice(0, Math.min(transition.position, newCharacters.length))
    .join('')
  const oldRemainder = Array.from(
    { length: Math.max(0, length - transition.position) },
    (_, index) => oldCharacters[transition.position + index] ?? ' ',
  ).join('')
  const gap =
    transition.position > newCharacters.length
      ? ' '.repeat(transition.position - newCharacters.length)
      : ''
  return {
    display: prefix + gap + oldRemainder,
    newLength: prefix.length,
  }
}

function FleetRichText({ value }: { value: string }): React.ReactNode {
  const parts = value.split(/(\*\*.+?\*\*|\+\+.+?\+\+|`[^`]+`)/g)
  return (
    <Text dimColor>
      {parts.map((part, index) => {
        const match = part.match(/^(?:\*\*|\+\+|`)(.+?)(?:\*\*|\+\+|`)$/)
        return match ? <Text key={index} bold>{match[1]}</Text> : part
      })}
    </Text>
  )
}

function FleetDiffStat({
  additions,
  deletions,
}: {
  additions: number
  deletions: number
}): React.ReactNode {
  return (
    <Text dimColor>
      {additions > 0 ? <Text color="diffAddedWord">+{additions}</Text> : null}
      {additions > 0 && deletions > 0 ? ' ' : null}
      {deletions > 0 ? <Text color="diffRemovedWord">-{deletions}</Text> : null}
    </Text>
  )
}

function FleetChildDetailRow({ child }: { child: FleetChildRow }): React.ReactNode {
  return (
    <Box key={child.row.href}>
      <Box width={2} flexShrink={0}>
        {child.color ? (
          <Text color={child.color}>
            {isFrameChild(child) ? '⧉' : figures.circleFilled}
          </Text>
        ) : null}
      </Box>
      <Box flexGrow={1} width={0}>
        <Text wrap="truncate">
          <Link url={child.row.href}>{child.label}</Link>
        </Text>
      </Box>
      {child.diffStat &&
      child.diffStat.additions + child.diffStat.deletions > 0 ? (
        <Box flexShrink={0} paddingLeft={1}>
          <Link url={`${child.row.href}/files`}>
            <FleetDiffStat
              additions={child.diffStat.additions}
              deletions={child.diffStat.deletions}
            />
          </Link>
        </Box>
      ) : null}
      <Box flexShrink={0} paddingLeft={1}>
        {child.status.map((segment, index) => (
          <React.Fragment key={index}>
            {index > 0 ? <Text> </Text> : null}
            <Text color={segment.color} dimColor={!segment.color}>
              {segment.text}
            </Text>
          </React.Fragment>
        ))}
      </Box>
    </Box>
  )
}

function fleetColumnWidths(
  jobs: FleetJob[],
  initialJobId?: string,
): FleetColumnWidths {
  const age = Math.max(
    3,
    ...jobs.map(job => stringWidth(fleetJobAge(job))),
  )
  const label = Math.min(
    40,
    Math.max(
      12,
      ...jobs.map(job => stringWidth(jobLabel(job.state, job.id === initialJobId))),
    ),
  )
  return { age, label }
}

function FleetShortcuts({
  focusedPinned,
  canReorder,
  canRename,
  canPin,
}: {
  focusedPinned: boolean
  canReorder: boolean
  canRename: boolean
  canPin: boolean
}): React.ReactNode {
  const shortcuts: string[] = []
  if (canReorder) shortcuts.push('shift+↑↓ to reorder')
  if (canRename) shortcuts.push('ctrl+r to rename')
  shortcuts.push('ctrl+s to switch views')
  if (canPin) {
    shortcuts.push(`ctrl+t to ${focusedPinned ? 'unpin' : 'pin to top'}`)
  }
  shortcuts.push('? to close')
  const columns: string[][] = []
  for (let index = 0; index < shortcuts.length; index += 2) {
    columns.push(shortcuts.slice(index, index + 2))
  }
  return (
    <Box flexShrink={0} paddingX={2} flexDirection="row" gap={4}>
      {columns.map((column, index) => (
        <Box key={index} flexDirection="column">
          {column.map(shortcut => (
            <Text key={shortcut} dimColor>
              {shortcut}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

function FleetJobInfo({ job }: { job?: FleetJob }): React.ReactNode {
  if (!job) {
    return (
      <Box flexShrink={0} paddingX={2}>
        <Text dimColor>no job focused</Text>
      </Box>
    )
  }
  const state = job.state
  return (
    <Box flexShrink={0} paddingX={2} flexDirection="row" gap={4}>
      <Box flexDirection="column">
        <Text><Text dimColor>backend </Text>{state.backend}</Text>
        <Text><Text dimColor>dir </Text>{getJobDir(job.id)}</Text>
        <Text><Text dimColor>cwd </Text>{state.worktreePath ?? state.cwd}</Text>
      </Box>
      <Box flexDirection="column">
        {state.backend === 'daemon' ? (
          <Text><Text dimColor>shell </Text>claude attach {job.id}</Text>
        ) : null}
        <Text><Text dimColor>session </Text>{state.sessionId}</Text>
        <Text>
          <Text dimColor>version </Text>
          {state.cliVersion === undefined ? (
            <Text dimColor>—</Text>
          ) : state.cliVersion === MACRO.VERSION ? (
            state.cliVersion
          ) : (
            <>
              <Text color="warning">{state.cliVersion}</Text>
              <Text dimColor> · current {MACRO.VERSION}</Text>
            </>
          )}
        </Text>
        <Text>
          <Text dimColor>updated </Text>
          {formatRelativeTime(new Date(state.updatedAt))}
        </Text>
      </Box>
    </Box>
  )
}

function FleetJobRow({
  job,
  isFocused,
  isOrigin,
  logTail,
  status,
  columns,
  loopKickCount,
  loopNextFireMs,
  childRows,
  rename,
  deleteArmed,
  attaching,
}: {
  job: FleetJob
  isFocused: boolean
  isOrigin: boolean
  logTail?: string
  status?: SessionStatus
  columns: FleetColumnWidths
  loopKickCount?: number
  loopNextFireMs?: number | null
  childRows: FleetChildRow[]
  rename?: { draft: string; cursor: number }
  deleteArmed?: { justKilled: boolean }
  attaching: boolean
}): React.ReactNode {
  const terminal = terminalStateActivity(job.state.state)
  const baseStyle = glyphColor(job.state, job.activity, status)
  const color =
    status === 'busy'
      ? baseStyle.color
      : rollupJobColor(
          baseStyle.color,
          childRows
            .filter(child => !isFrameChild(child))
            .map(child => ({ color: child.color as JobColor | undefined })),
        )
  const dimIcon =
    (color === baseStyle.color && baseStyle.dim) ||
    (color === undefined && !isFocused)
  const icon = attaching
    ? undefined
    : deleteArmed?.justKilled
      ? '∙'
      : pickIcon(job.state, terminal ?? job.activity, status)
  const age = fleetJobAge(job, loopNextFireMs)
  const result = job.state.output?.result
  const resultLink = result ? fleetResultLink(result) : null
  const unlinkedResult = resultLink ? undefined : result
  const label = jobLabel(job.state, isOrigin)
  const labelTransition = useFleetLabelTransition(label, Boolean(job.state.name))
  const detail = isOrigin && isFocused
    ? '→ to return'
    : terminal === 'success'
      ? cleanFleetText(unlinkedResult ?? job.state.detail)
      : job.state.tempo === 'active'
        ? cleanFleetText(logTail ?? '') || cleanFleetText(job.state.detail)
        : cleanFleetText(job.state.detail)
  const actionableChildren = childRows.filter(
    child => child.color !== undefined && !isFrameChild(child),
  )
  const prColor = rollupChildColor(
    childRows
      .filter(child => !isFrameChild(child))
      .map(child => ({ color: child.color as PrStatusColor | undefined })),
  )
  const frames = childRows.filter(isFrameChild)
  const frame = childRows.some(child => !isFrameChild(child))
    ? undefined
    : frames.at(-1)

  return (
    <Box>
      <Box width={columns.label + 2} flexShrink={0}>
        <Text dimColor={!isFocused} wrap="truncate">
          <Text color={color} dimColor={dimIcon}>
            {icon ?? <FleetSpinner />}
          </Text>{' '}
          {rename ? (
            renderRenameDraft(rename.draft, rename.cursor, columns.label)
          ) : labelTransition ? (
            <>
              <Text dimColor={!isFocused}>
                {labelTransition.display.slice(0, labelTransition.newLength)}
              </Text>
              <Text dimColor>
                {labelTransition.display.slice(labelTransition.newLength)}
              </Text>
            </>
          ) : resultLink ? (
            <Link url={resultLink}>{label}</Link>
          ) : (
            label
          )}
        </Text>
      </Box>
      <Box flexGrow={1} width={0} paddingLeft={2}>
        {deleteArmed ? (
          <Text color="error" wrap="truncate">
            {deleteArmed.justKilled
              ? 'stopped. ctrl+x again to delete.'
              : 'ctrl+x again to delete'}
          </Text>
        ) : (
          <Text dimColor wrap="truncate">
            {detail}
            {loopKickCount !== undefined && loopKickCount > 0
              ? ` ×${loopKickCount}`
              : ''}
          </Text>
        )}
      </Box>
      <Box flexShrink={0} paddingLeft={1} justifyContent="flex-end">
        {prColor !== undefined && actionableChildren[0] ? (
          <Link url={actionableChildren[0].row.href}>
            <Text color={prColor}>{figures.circleFilled}</Text>
            {actionableChildren.length > 1 ? (
              <Text dimColor> {actionableChildren.length}</Text>
            ) : null}
            <Text> </Text>
          </Link>
        ) : frame ? (
          <Link url={frame.row.href}>
            <Text color="claude">⧉</Text>
            {frames.length > 1 ? <Text dimColor> {frames.length}</Text> : null}
            <Text> </Text>
          </Link>
        ) : null}
        <Box width={columns.age} justifyContent="flex-end">
          <Text dimColor>{age}</Text>
        </Box>
      </Box>
    </Box>
  )
}

function FleetDetail({
  job,
  childRows,
  status,
  isPending,
  deleteArmed,
  onBack,
  onAttach,
  onReply,
  isTerminalFocused,
  replyDrafts,
  replyError,
  onReplyError,
  renaming,
}: {
  job: FleetJob
  childRows: FleetChildRow[]
  status?: SessionStatus
  isPending: boolean
  deleteArmed?: { justKilled: boolean }
  onBack: () => void
  onAttach: () => void
  onReply: (reply: string) => Promise<string | null>
  isTerminalFocused: boolean
  replyDrafts: Map<string, string>
  replyError: string | null
  onReplyError: (error: string | null) => void
  renaming: boolean
}): React.ReactNode {
  useEffect(() => recordFleetAgentAction('peek', job.state), [])
  const inFlight = useRef(false)
  const savedDraft = replyDrafts.get(job.id) ?? ''
  const [mode, setModeState] = useState<'prompt' | 'bash'>(
    savedDraft.startsWith('!') ? 'bash' : 'prompt',
  )
  const modeRef = useRef(mode)
  const setMode = (next: 'prompt' | 'bash'): void => {
    modeRef.current = next
    setModeState(next)
  }
  const {
    query,
    queryRef,
    setQuery,
    cursorOffset,
    setCursorOffset,
    handleKeyDown: handleReplyKeyDown,
    handlePaste,
  } = useSearchInput({
    isActive: true,
    multiline: true,
    backspaceExitsOnEmpty: false,
    initialQuery: savedDraft.startsWith('!') ? savedDraft.slice(1) : savedDraft,
    onExit: () => submitReply(),
    onCancel: onBack,
    onSpaceOnEmpty: mode === 'bash' ? undefined : onBack,
    useLegacyInput: false,
  })

  function submitReply(): void {
    if (inFlight.current) return
    const body = queryRef.current.trim()
    if (!body && modeRef.current === 'prompt') {
      inFlight.current = true
      onAttach()
      return
    }
    if (!body) return
    const outgoing = modeRef.current === 'bash' ? `!${body}` : body
    const previousMode = modeRef.current
    inFlight.current = true
    setQuery('')
    setMode('prompt')
    onReplyError(null)
    replyDrafts.delete(job.id)
    const restore = (): void => {
      if (queryRef.current === '') {
        replyDrafts.set(job.id, outgoing)
        setQuery(body)
      }
      if (modeRef.current === 'prompt') setMode(previousMode)
    }
    void onReply(outgoing)
      .then(result => {
        if (result) {
          restore()
          onReplyError(result)
        }
      })
      .catch(caught => {
        restore()
        onReplyError(errorMessage(caught))
      })
      .finally(() => {
        inFlight.current = false
      })
  }

  useEffect(() => {
    const value = mode === 'bash' ? `!${query}` : query
    if (value) replyDrafts.set(job.id, value)
    else replyDrafts.delete(job.id)
  }, [job.id, mode, query, replyDrafts])

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (renaming) return
    if (modeRef.current === 'prompt') {
      if (event.name === 'right' && !event.shift && !queryRef.current) {
        event.preventDefault()
        if (!inFlight.current) {
          inFlight.current = true
          onAttach()
        }
        return
      }
      if (event.key === '!' && !queryRef.current) {
        event.preventDefault()
        setMode('bash')
        return
      }
    } else if (event.name === 'backspace' && !queryRef.current) {
      event.preventDefault()
      setMode('prompt')
      return
    }
    handleReplyKeyDown(event)
  }

  const childHrefs = childRows.map(child => child.row.href)
  const isChildReference = (value: string): boolean =>
    childHrefs.some(href => {
      const index = value.indexOf(href)
      return (
        index >= 0 &&
        !/\w/.test(value[index + href.length] ?? '') &&
        value.length - href.length < 16
      )
    })
  const outputEntries = job.state.needs
    ? []
    : Object.entries(job.state.output ?? {}).filter(([, value]) =>
        !isChildReference(value),
      )
  const { rows } = useTerminalSize()
  const queryLineBreaks = query ? query.split('\n').length - 1 : 0
  const reservedRows =
    outputEntries.length +
    (job.state.needs ? 1 : 0) +
    queryLineBreaks +
    (replyError ? 1 : 0) +
    1
  const maxChildren = Math.max(
    8,
    rows - 8 - reservedRows,
  )
  const visibleChildren = childRows.slice(0, maxChildren)
  const hiddenChildCount = childRows.length - visibleChildren.length
  const outputNameWidth = Math.max(
    0,
    ...outputEntries.map(([name]) => stringWidth(name)),
  )
  const style = glyphColor(job.state, job.activity, status)
  const hasStructuredContent =
    childRows.length > 0 || outputEntries.length > 0 || Boolean(job.state.needs)

  return (
    <>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={mode === 'bash' ? 'bashBorder' : undefined}
        borderDimColor={mode !== 'bash'}
        paddingX={1}
        minHeight={5}
        width="100%"
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
        onPaste={renaming ? undefined : handlePaste}
      >
        {!hasStructuredContent ? (
          <Text wrap="truncate">
            <Text color={style.color}>{eventAge(job.state.updatedAt)}</Text>{' '}
            {cleanFleetText(job.state.detail)}
          </Text>
        ) : null}
        {visibleChildren.length > 0 ? (
          <Box flexDirection="column">
            {visibleChildren.map(child => (
              <FleetChildDetailRow key={child.row.href} child={child} />
            ))}
            {hiddenChildCount > 0 ? (
              <Box paddingLeft={2}>
                <Text dimColor>… {hiddenChildCount} more</Text>
              </Box>
            ) : null}
          </Box>
        ) : null}
        {outputEntries.length > 0 ? (
          <Box
            flexDirection="column"
            marginTop={visibleChildren.length > 0 ? 1 : 0}
          >
            {outputEntries.map(([name, value]) => (
              <Box key={name}>
                {outputEntries.length > 1 ? (
                  <Box width={outputNameWidth + 2} flexShrink={0}>
                    <Text dimColor>{name}</Text>
                  </Box>
                ) : null}
                <Box flexGrow={1} width={0}>
                  <Text wrap="truncate">
                    <Text color={style.color}>{eventAge(job.state.updatedAt)}</Text>{' '}
                    <FleetRichText value={cleanFleetText(value)} />
                  </Text>
                </Box>
              </Box>
            ))}
          </Box>
        ) : null}
        {job.state.needs ? (
          <Box marginTop={childRows.length > 0 ? 1 : 0}>
            <Text wrap="truncate">
              <Text color={style.color}>{eventAge(job.state.updatedAt)}</Text>{' '}
              <FleetRichText value={cleanFleetText(job.state.needs)} />
            </Text>
          </Box>
        ) : null}
        {/* The remaining space belongs to the reply editor, which stays pinned. */}
        <Box flexGrow={1} />
        <Box marginTop={1}>
          <SearchBox
            query={query}
            cursorOffset={cursorOffset}
            onCursorOffsetChange={setCursorOffset}
            placeholder="reply"
            prefix={mode === 'bash' ? '!' : '❯'}
            prefixColor={mode === 'bash' ? 'bashBorder' : undefined}
            isFocused={!renaming}
            isTerminalFocused={isTerminalFocused}
            width="100%"
            borderless
          />
        </Box>
        {replyError ? (
          <Text color="error" dimColor wrap="truncate">{replyError}</Text>
        ) : null}
      </Box>
      <Box paddingLeft={2}>
        <Text dimColor>
          {renaming ? (
            <Byline>
              <KeyboardShortcutHint shortcut="enter" action="save" />
              <KeyboardShortcutHint shortcut="escape" action="cancel" />
            </Byline>
          ) : (
            <Byline>
              {mode === 'bash' ? <Text color="bashBorder">! for shell mode</Text> : null}
              {(query.trim() || (mode !== 'bash' && !isPending)) ? (
                <KeyboardShortcutHint
                  shortcut="enter"
                  action={query.trim() ? 'send' : needsRespawn(job.state) ? 'resume' : 'open'}
                />
              ) : null}
              <KeyboardShortcutHint
                shortcut={query.trim() || mode === 'bash' ? 'escape' : ' '}
                action="close"
              />
              <KeyboardShortcutHint
                shortcut="ctrl+x"
                action={deleteArmed ? 'confirm' : 'delete'}
              />
            </Byline>
          )}
        </Text>
      </Box>
    </>
  )
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
  useLayoutEffect(() => {
    const ink = instances.get(process.stdout)
    if (!ink) return
    ink.onHyperlinkClick = url => {
      if (url.startsWith('file:')) {
        try {
          void openPath(fileURLToPath(url))
        } catch {}
      } else {
        void openBrowser(url)
      }
    }
    return () => {
      ink.onHyperlinkClick = undefined
    }
  }, [])
  const [draftCwd, setDraftCwd] = useState(rootCwd)
  useEffect(() => {
    let cancelled = false
    void canonicalizePath(rootCwd).then(canonical => {
      if (!cancelled && canonical !== rootCwd) setDraftCwd(canonical)
    })
    return () => {
      cancelled = true
    }
  }, [rootCwd])
  const [jobs, setJobs] = useState<FleetJob[] | null>(lastJobs)
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  const [pendingJobs, setPendingJobs] = useState<FleetJob[]>([])
  const [logTails, setLogTails] = useState<Record<string, string>>({})
  const [statuses, setStatuses] = useState(lastPrStatuses)
  const [sessionStatuses, setSessionStatuses] = useState(lastSessionStatuses)
  const sessionStatusesRef = useRef(sessionStatuses)
  sessionStatusesRef.current = sessionStatuses
  const [renameId, setRenameId] = useState<string | null>(null)
  const [attachingJobId, setAttachingJobId] = useState<string | null>(null)
  const [detail, setDetail] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const {
    query,
    queryRef,
    setQuery,
    cursorOffset: queryCursor,
    setCursorOffset: setQueryCursor,
    handleKeyDown: handleQueryKeyDown,
    handlePaste: handleQueryPasteEvent,
  } = useSearchInput({
    initialQuery,
    isActive: !detail && renameId === null && attachingJobId === null,
    multiline: true,
    onExit: () => {},
    onCancel: jobs === null ? () => onAction({ type: 'done' }) : undefined,
    onSpaceOnEmpty: () => {
      setShowAllSuggestions(false)
      setDetail(current => {
        if (!current && selected) {
          followedJobId.current = selected.id
          followedHeaderGroup.current = null
        }
        return !current
      })
    },
    useLegacyInput: false,
  })
  useEffect(() => {
    const timeout = setTimeout(
      (currentQuery: typeof queryRef, cwd: string) => {
        const value = currentQuery.current
        if (value) void saveFleetDraft(cwd, value)
        else void deleteFleetDraft(cwd)
      },
      300,
      queryRef,
      draftCwd,
    )
    return () => clearTimeout(timeout)
  }, [query, draftCwd, queryRef])
  useEffect(() => {
    setNotice(null)
  }, [query])
  useEffect(
    () =>
      registerCleanup(() => {
        const value = queryRef.current
        if (value) saveFleetDraftSync(draftCwd, value)
      }),
    [draftCwd, queryRef],
  )
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
  const [notice, setNotice] = useState<string | null>(null)
  const isTerminalFocused = useTerminalFocus()
  const { columns: terminalColumns } = useTerminalSize()
  const scrollBoxRef = useRef<ScrollBoxHandle>(null)
  const focusedElementRef = useRef<DOMElement>(null)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void getBranch()
      .then(branch => {
        if (!cancelled) setGitBranch(branch)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
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
  const [deleteArmed, setDeleteArmed] = useState<{
    id: string
    justKilled: boolean
  } | null>(null)
  const [deleteAllArmed, setDeleteAllArmed] = useState<string | null>(null)
  const [exitArmed, setExitArmed] = useState(false)
  const [busy, setBusy] = useState(new Set<string>())
  const focusedJobId = useRef<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)
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
  const stateWriteQueue = useRef(new Map<string, number>())
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushOrderWrites = useCallback(() => {
    const writes = [...writeQueue.current]
    const stateWrites = [...stateWriteQueue.current]
    writeQueue.current.clear()
    stateWriteQueue.current.clear()
    return Promise.all([
      ...writes.map(([id, order]) => writeJobOrder(getJobDir(id), order)),
      ...stateWrites.map(([id, order]) =>
        writeJobStateOrder(getJobDir(id), order),
      ),
    ]).catch(caught => {
      logError(caught)
      setError(`Couldn't save order — ${errorMessage(caught)}`)
    })
  }, [])

  useEffect(
    () => () => {
      if (writeTimer.current) clearTimeout(writeTimer.current)
      void flushOrderWrites()
    },
    [flushOrderWrites],
  )

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
        records.flatMap(
          job =>
            job.state.children
              ?.filter(child => child.kind !== 'frame')
              .map(child => child.href) ?? [],
        ),
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

    const activeJobs = nextJobs.filter(
      job => deriveBand(job.state) !== 'completed',
    )
    const tails = Object.fromEntries(
      await Promise.all(
        activeJobs.map(async job => [job.id, await readJobLogTail(job)] as const),
      ),
    )
    setLogTails(current => {
      const currentKeys = Object.keys(current)
      const nextKeys = Object.keys(tails)
      if (
        currentKeys.length === nextKeys.length &&
        currentKeys.every(key => current[key] === tails[key])
      ) {
        return current
      }
      return tails
    })

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

  useEffect(() => maintainDaemonLease('claude agents'), [])

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
      for (const [id, order] of stateWriteQueue.current) {
        void writeJobStateOrder(getJobDir(id), order)
      }
      writeQueue.current.clear()
      stateWriteQueue.current.clear()
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
    () =>
      groupedJobs(
        filtered,
        statuses,
        sessionStatuses,
        groupMode,
        repoGroup({ cwd: rootCwd }),
      ),
    [filtered, statuses, sessionStatuses, groupMode, rootCwd],
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

  useLayoutEffect(() => {
    if (!focusedElementRef.current) return
    const offset = rows[focus]?.kind === 'header' && focus > 0 ? -1 : 0
    scrollBoxRef.current?.scrollToElement(focusedElementRef.current, offset)
  }, [focus, rows])

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
    if (detail) setReplyError(null)
  }, [detail, selected?.id])

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
    if (
      pendingJobs.some(job => job.id === selected.id || job.id === other.id) ||
      selected.state.backend === 'peer' ||
      other.state.backend === 'peer'
    ) {
      return
    }
    followedJobId.current = selected.id
    followedHeaderGroup.current = null
    const useStateOrder = groupMode === 'state' && selectedGroup !== 'pinned'
    const orderOf = useStateOrder
      ? effectiveStateSortOrder
      : effectiveSortOrder
    const leftOrder = orderOf(selected.state)
    const rightOrder = orderOf(other.state)
    const orders = new Map<string, number>()
    if (leftOrder === rightOrder) {
      const group = visible.filter((job) => {
        if (pendingJobs.some(pending => pending.id === job.id)) return false
        if (selectedGroup === 'pinned') return job.state.pinned
        if (groupMode === 'state') {
          return stateBucket(
            job,
            statuses,
            sessionStatuses.get(job.state.sessionId),
          ) === selectedGroup
        }
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
                : {
                    ...job,
                    state: {
                      ...job.state,
                      [useStateOrder ? 'stateSortOrder' : 'sortOrder']: order,
                    },
                  }
            }),
          )
        : currentJobs,
    )
    const queue = useStateOrder ? stateWriteQueue : writeQueue
    for (const [id, order] of orders) queue.current.set(id, order)
    if (writeTimer.current) clearTimeout(writeTimer.current)
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null
      void flushOrderWrites()
    }, 100)
    setFocus(focus + direction)
  }

  const openJob = (job: FleetJob | undefined) => {
    if (!job || attachingJobId !== null) return
    if (pendingJobs.some(pending => pending.id === job.id)) return
    if (job.state.backend === 'peer') {
      setError("Can't attach — this session is running in another terminal")
      return
    }
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
    if (job.state.backend === 'peer') {
      setError(
        "Can't stop or delete — this session is running in another terminal",
      )
      return
    }
    const band = deriveBand(job.state)
    if (!forceDelete && deleteArmed?.id !== job.id) {
      setDeleteArmed({ id: job.id, justKilled: band !== 'completed' })
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
        .catch(caught => {
          logError(caught)
          setError(`Couldn't stop — ${errorMessage(caught)}`)
          void poll()
        })
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
    setJobs(current => current?.filter(candidate => candidate.id !== job.id) ?? current)
    void deleteBgJob(job.id)
      .then(result => {
        if (!result.removed) {
          throw new Error(result.error ?? 'worker may still be running')
        }
        logEvent('tengu_bg_agent_action', {
          action: 'delete',
          source: 'fleet',
          jobSessionId: job.state.sessionId,
        })
        return poll()
      })
      .catch(caught => {
        logError(caught)
        setError(`Couldn't delete — ${errorMessage(caught)}`)
        void poll()
      })
      .finally(() =>
        setBusy(current => {
          const next = new Set(current)
          next.delete(job.id)
          return next
        }),
      )
  }

  const clearRename = (): void => {
    setRenameId(null)
    setRenameDraft('')
  }
  const {
    query: renameDraft,
    queryRef: renameDraftRef,
    setQuery: setRenameDraft,
    cursorOffset: renameCursor,
    handleKeyDown: handleRenameKeyDown,
    handlePaste: handleRenamePaste,
  } = useSearchInput({
    isActive: renameId !== null,
    backspaceExitsOnEmpty: false,
    onExit: () => {
      const job = (jobs ?? []).find(candidate => candidate.id === renameId)
      const name = renameDraftRef.current.trim()
      clearRename()
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
    },
    onCancel: clearRename,
    useLegacyInput: false,
  })

  const insertQueryText = (text: string): void => {
    const current = queryRef.current
    const next =
      current.slice(0, queryCursor) + text + current.slice(queryCursor)
    setQuery(next)
    setQueryCursor(queryCursor + text.length)
  }

  const handleFleetPaste = (event: PasteEvent): void => {
    if (renameId !== null) {
      handleRenamePaste(event)
      return
    }
    if (showHelp) setShowHelp(false)
    const text = stripAnsi(event.text)
      .replace(/\r\n|\r/g, '\n')
      .replaceAll('\t', '    ')
    const lineCount = getPastedTextRefNumLines(text)
    if (text.length > PASTE_THRESHOLD || lineCount > 2) {
      event.preventDefault()
      const id = nextPasteId.current++
      setPastedContents(current => ({
        ...current,
        [id]: { id, type: 'text', content: text },
      }))
      insertQueryText(formatPastedTextRef(id, lineCount))
      return
    }
    handleQueryPasteEvent(event)
  }

  const sendSelectedReply = async (
    job: FleetJob,
    outgoing: string,
  ): Promise<string | null> => {
    setBusy(current => new Set(current).add(job.id))
    setJobs(current =>
      current?.map(candidate => {
        if (candidate.id !== job.id) return candidate
        const state = optimisticReplyState(candidate.state, outgoing)
        return { ...candidate, state, activity: deriveActivity(state) }
      }) ?? current,
    )
    try {
      let result = await sendJobReply(job.id, outgoing, job.state)
      if (
        result === "That session isn't running — respawn it first" &&
        !outgoing.startsWith('!')
      ) {
        const respawned = await respawnTemplateJob(job.id, {
          knownState: job.state,
          initialPrompt: outgoing,
        })
        result = respawned.ok ? null : respawned.error
      }
      return result
    } finally {
      setBusy(current => {
        const next = new Set(current)
        next.delete(job.id)
        return next
      })
      void poll()
    }
  }

  const handleFleetKeyDown = (event: KeyboardEvent): void => {
    const input = event.key
    const claim = (): void => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const key = {
      escape: event.name === 'escape',
      return: event.name === 'return',
      backspace: event.name === 'backspace',
      delete: event.name === 'delete',
      upArrow: event.name === 'up',
      downArrow: event.name === 'down',
      rightArrow: event.name === 'right',
      tab: event.name === 'tab',
      ctrl: event.ctrl,
      meta: event.meta,
      super: event.superKey,
      shift: event.shift,
    }
    const moveFocus = (direction: -1 | 1): void => {
      setDeleteArmed(null)
      setDeleteAllArmed(null)
      setFocus(current => {
        if (rows.length === 0) return 0
        if (
          dispatchOwnsFocus &&
          (groupMode === 'state' || dispatch?.cwd !== undefined)
        ) {
          return current
        }
        const shouldSkip = dispatchOwnsFocus
          ? (row: FleetListRow | undefined) =>
              row?.kind === 'job' ||
              (row?.kind === 'header' && row.group === 'pinned')
          : detail
            ? (row: FleetListRow | undefined) => row?.kind === 'header'
            : null
        let next = (current + direction + rows.length) % rows.length
        if (shouldSkip) {
          while (next !== current && shouldSkip(rows[next])) {
            next = (next + direction + rows.length) % rows.length
          }
        }
        const row = rows[next]
        if (row?.kind === 'job') {
          followedJobId.current = row.job.id
          followedHeaderGroup.current = null
        } else if (row?.kind === 'header') {
          followedJobId.current = null
          followedHeaderGroup.current = row.group
        } else {
          followedJobId.current = null
          followedHeaderGroup.current = null
        }
        return next
      })
    }
    if (renameId) {
      claim()
      if (key.ctrl && input === 'c') {
        clearRename()
        return
      }
      if (key.upArrow || key.downArrow) return
      handleRenameKeyDown(event)
      return
    }
    if (attachingJobId !== null) {
      claim()
      if (key.ctrl && input === 'c') {
        focusedJobId.current = null
        setAttachingJobId(null)
      }
      return
    }
    if (key.ctrl && input === 'c') {
      claim()
      if (showHelp || showInfo) {
        setShowHelp(false)
        setShowInfo(false)
        return
      }
      if (queryRef.current) setQuery('')
      if (exitArmed) {
        onAction({ type: 'done' })
        return
      }
      setExitArmed(true)
      setTimeout(() => setExitArmed(false), 2_000)
      return
    }
    if (key.escape) {
      claim()
      if (detail) setDetail(false)
      else if (showHelp) setShowHelp(false)
      else if (showInfo) setShowInfo(false)
      else if (showAllSuggestions) setShowAllSuggestions(false)
      else if (queryRef.current) setQuery('')
      else if (deleteArmed || deleteAllArmed) {
        setDeleteArmed(null)
        setDeleteAllArmed(null)
      }
      else onAction({ type: 'done' })
      return
    }
    if (
      showHelp &&
      input !== '?' &&
      !key.upArrow &&
      !key.downArrow &&
      !(key.ctrl && (input === 'p' || input === 'n'))
    ) {
      setShowHelp(false)
    }
    if (
      key.shift &&
      (key.upArrow || key.downArrow) &&
      autocomplete.suggestions.length === 0 &&
      !detail
    ) {
      claim()
      reorder(key.upArrow ? -1 : 1)
      return
    }
    if (key.upArrow || (key.ctrl && input === 'p')) {
      claim()
      if (autocomplete.suggestions.length) {
        setSuggestionFocus(value => Math.max(0, value - 1))
        return
      }
      if (key.upArrow && !detail && queryRef.current.includes('\n')) {
        handleQueryKeyDown(event)
        return
      }
      moveFocus(-1)
      return
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      claim()
      if (autocomplete.suggestions.length) {
        setSuggestionFocus(value =>
          Math.min(autocomplete.suggestions.length - 1, value + 1),
        )
        return
      }
      if (key.downArrow && !detail && queryRef.current.includes('\n')) {
        handleQueryKeyDown(event)
        return
      }
      moveFocus(1)
      return
    }
    if (key.ctrl && input === 's') {
      claim()
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
    if (key.ctrl && input === 'r') {
      claim()
      if (!selected) return
      if (pendingJobs.some(job => job.id === selected.id)) return
      if (selected.state.backend === 'peer' && !selected.state.sock) return
      setRenameId(selected.id)
      setRenameDraft(selected.state.name ?? '')
      return
    }
    if (key.ctrl && input === 'g' && !detail) {
      claim()
      const edited = editPromptInEditor(query, pastedContents)
      if (edited.content !== null && edited.content !== query) {
        setQuery(edited.content)
        setQueryCursor(edited.content.length)
      }
      if (edited.error) setError(edited.error)
      return
    }
    if (key.ctrl && input === 't') {
      claim()
      if (!selected) return
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
    if (detail && key.ctrl && input === 'x') {
      claim()
      if (selected && !pendingJobs.some(job => job.id === selected.id)) {
        stopOrDelete(selected)
      }
      return
    }
    if (detail) return
    if (key.ctrl && input === 'x' && selectedHeader?.jobs.length) {
      claim()
      if (autocomplete.suggestions.length > 0) return
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
    if (key.ctrl && input === 'x') {
      claim()
      if (autocomplete.suggestions.length > 0) return
      if (selected && !pendingJobs.some(job => job.id === selected.id)) {
        stopOrDelete(selected)
      }
      return
    }
    if (key.tab) {
      claim()
      if (!queryRef.current && templates.length) {
        setShowAllSuggestions(value => !value)
        return
      }
      const suggestion =
        autocomplete.suggestions[
          Math.min(suggestionFocus, autocomplete.suggestions.length - 1)
        ]
      if (suggestion) chooseSuggestion(suggestion)
      return
    }
    if (key.rightArrow && !key.shift && !queryRef.current) {
      claim()
      openJob(selected)
      return
    }
    if (
      (key.meta || key.super) &&
      /^[1-9]$/.test(input)
    ) {
      claim()
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
      if (
        !key.shift &&
        (key.meta || queryRef.current[queryCursor - 1] === '\\')
      ) {
        handleQueryKeyDown(event)
        return
      }
      claim()
      const normalizedQuery = queryRef.current.trim().toLowerCase()
      if (
        normalizedQuery === '/exit' ||
        normalizedQuery === '/quit' ||
        ['exit', 'quit', ':q', ':q!', ':wq', ':wq!'].includes(
          normalizedQuery,
        )
      ) {
        onAction({ type: 'done' })
        return
      }
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
      const currentQuery = queryRef.current
      const currentDispatch =
        currentQuery === query
          ? dispatch
          : parsePrRef(currentQuery)
            ? null
            : parseDispatch(
                currentQuery,
                templates,
                repositories,
                routines,
              )
      if (!currentDispatch?.intent && !currentDispatch?.routine) {
        if (currentDispatch?.matched || currentDispatch?.cwd !== undefined) {
          return
        }
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
      const intent = expandPastedTextRefs(
        currentDispatch.intent,
        pastedContents,
      )
      if (!currentDispatch.routine && intent.trim().length < 4) {
        setError(null)
        setNotice('Too short — describe the task')
        return
      }
      setError(null)
      setNotice(null)
      const template: TemplateJob = currentDispatch.template
      const cwd = currentDispatch.cwd ?? activeCwd
      const spare = getPrewarmedJob()
      const canClaim =
        Boolean(spare?.ready) &&
        !currentDispatch.matched &&
        !currentDispatch.routine &&
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
          template: currentDispatch.routine ?? template.name,
          routine: currentDispatch.routine,
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
      const originalQuery = currentQuery
      const originalPastedContents = pastedContents
      setPendingJobs(current => [...current, optimistic])
      queryRef.current = ''
      setQuery('')
      void deleteFleetDraft(draftCwd)
      setQueryCursor(0)
      setPastedContents({})
      void (canClaim
        ? claimPrewarmedJob(intent)
        : dispatchTemplateJob(
            template,
            intent,
            sessionId,
            cwd,
            currentDispatch.routine,
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
          if (currentDispatch.matched) {
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
    if (input === '?' && queryRef.current === '') {
      claim()
      setShowHelp(value => !value)
      logEvent('tengu_bg_agent_action', { action: 'help_toggled' })
      return
    }
    handleQueryKeyDown(event)
  }

  if (jobs === null) {
    return (
      <Box
        tabIndex={0}
        autoFocus
        onKeyDown={handleQueryKeyDown}
        onPaste={handleFleetPaste}
      />
    )
  }

  const suggestionKindLabel: Record<FleetSuggestion['kind'], string> = {
    agent: 'background',
    repo: 'repo',
    skill: 'skill',
    routine: 'routine',
  }
  const suggestionItems = autocomplete.suggestions.map(suggestion => ({
    id: `${suggestion.kind}:${suggestion.name}`,
    displayText: `${suggestion.kind === 'skill' ? '/' : '@'}${suggestion.name}`,
    description: `${suggestionKindLabel[suggestion.kind]} · ${suggestion.description}`,
  }))
  const recognizedMentions = new Set([
    ...autocomplete.templateNames,
    ...autocomplete.repoNames.map(name => name.toLowerCase()),
    ...skills.map(skill => skill.name.toLowerCase()),
    ...routines.map(routine => routine.name.toLowerCase()),
  ])
  const queryHighlights: Array<readonly [number, number]> =
    (dispatch?.matched &&
      autocomplete.firstWord === dispatch.template.name.toLowerCase()) ||
    autocomplete.isSlashQuery
      ? [[0, autocomplete.firstWord.length]]
      : []
  for (const match of query.matchAll(/(?:^|\s)[aso]:/gi)) {
    const end = match.index + match[0].length
    queryHighlights.push([end - 2, end])
  }
  for (const match of query.matchAll(/(?:^|\s)@(\S+)/g)) {
    if (!recognizedMentions.has(match[1]!.toLowerCase())) continue
    const end = match.index + match[0].length
    queryHighlights.push([end - match[1]!.length - 1, end])
  }

  const { version, cwd } = getLogoDisplayData()
  const branchWidth = gitBranch ? stringWidth(gitBranch) + 3 : 0
  const displayedCwd = truncatePath(
    cwd,
    Math.max(terminalColumns - 11 - branchWidth, 10),
  )
  const columnWidths = fleetColumnWidths(visible, initialJobId)
  const hasDispatch = Boolean(dispatch?.intent || dispatch?.routine)
  const dispatchOwnsFocus = Boolean(
    dispatch &&
      (dispatch.intent || dispatch.routine || dispatch.matched || dispatch.cwd !== undefined),
  )
  const dispatchBlocksEnter = Boolean(
    !hasDispatch && (dispatch?.matched || dispatch?.cwd !== undefined),
  )
  const selectedIsPending = Boolean(
    selected && pendingJobs.some(job => job.id === selected.id),
  )
  const activeCount = (jobs ?? []).filter(job => {
    const bucket = stateBucket(
      job,
      statuses,
      sessionStatuses.get(job.state.sessionId),
    )
    return bucket === 'blocked' || bucket === 'working'
  }).length
  const enterAction = hasDispatch
    ? 'dispatch'
    : selected && needsRespawn(selected.state)
      ? 'resume'
      : 'open'
  const canRename = Boolean(
    selected &&
      !selectedIsPending &&
      !(selected.state.backend === 'peer' && !selected.state.sock),
  )
  const canReorder = Boolean(
    selected && (groupMode !== 'state' || selected.state.pinned),
  )
  const selectedChildRows = selected?.state.children
    ? fleetChildRows(selected.state.children, statuses)
    : []

  let rowIndex = 0
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      tabIndex={0}
      autoFocus
      onKeyDown={handleFleetKeyDown}
      onPaste={handleFleetPaste}
      onWheel={event => {
        if (detail) return
        event.preventDefault()
        scrollBoxRef.current?.scrollBy(event.deltaY > 0 ? 3 : -3)
      }}
    >
      <ScrollBox
        ref={scrollBoxRef}
        flexGrow={1}
        flexDirection="column"
        stickyScroll
      >
        <Box gap={2} marginBottom={1}>
          <Clawd />
          <Box flexDirection="column">
            <Text>
              <Text bold>Claude Code</Text>{' '}
              <Text color="claude" bold>Agents</Text>{' '}
              <Text dimColor>v{version}</Text>
            </Text>
            <Text dimColor>
              {[gitBranch, displayedCwd].filter(Boolean).join(' · ')}
            </Text>
            <Text dimColor>
              <Byline>
                {`${jobs.filter(job => deriveBand(job.state) === 'blocked').length} blocked`}
                {`${jobs.filter(job => deriveBand(job.state) === 'active').length} working`}
                {`${jobs.filter(job => deriveBand(job.state) === 'completed').length} done`}
              </Byline>
            </Text>
          </Box>
        </Box>
        {groups.map(({ group, jobs: groupJobs }, groupIndex) => {
          const headerIndex = rowIndex++
          const headerFocused = headerIndex === focus
          const collapsed = collapsedGroups.has(group)
          const focusHeader = (): void => {
            if (headerIndex === focus || detail) return
            followedJobId.current = null
            followedHeaderGroup.current = group
            setFocus(headerIndex)
          }
          const jobRows = collapsed
            ? null
            : groupJobs.map(job => {
                const index = rowIndex++
                const isFocused = index === focus
                const focusJob = (): void => {
                  if (index === focus || detail) return
                  followedHeaderGroup.current = null
                  followedJobId.current = job.id
                  setFocus(index)
                }
                const timeline = lastLoopTimelines.get(job.state.sessionId)
                const childRows = job.state.children
                  ? fleetChildRows(job.state.children, statuses)
                  : []
                return (
                  <Box
                    key={job.id}
                    ref={isFocused ? focusedElementRef : undefined}
                    width="100%"
                    paddingLeft={terminalColumns >= 120 ? 1 : 0}
                    backgroundColor={
                      !dispatchOwnsFocus && isFocused
                        ? 'userMessageBackground'
                        : undefined
                    }
                    onMouseEnter={query || detail ? undefined : focusJob}
                    onClick={event => {
                      if (event.hyperlinkUrl) {
                        event.allowDefault()
                        return
                      }
                      focusJob()
                      openJob(job)
                    }}
                  >
                    <FleetJobRow
                      job={job}
                      isFocused={isFocused}
                      isOrigin={job.id === initialJobId}
                      logTail={logTails[job.id]}
                      status={sessionStatuses.get(job.state.sessionId)}
                      columns={columnWidths}
                      loopKickCount={timeline?.count}
                      loopNextFireMs={timeline?.nextAt}
                      childRows={childRows}
                      rename={
                        renameId === job.id
                          ? { draft: renameDraft, cursor: renameCursor }
                          : undefined
                      }
                      deleteArmed={
                        deleteArmed?.id === job.id || deleteAllArmed === group
                          ? { justKilled: deleteArmed?.justKilled ?? false }
                          : undefined
                      }
                      attaching={attachingJobId === job.id || busy.has(job.id)}
                    />
                  </Box>
                )
              })
          return (
            <React.Fragment key={group}>
              <Box
                ref={headerFocused ? focusedElementRef : undefined}
                marginTop={groupIndex > 0 ? 1 : 0}
                backgroundColor={
                  !dispatchOwnsFocus && headerFocused
                    ? 'userMessageBackground'
                    : undefined
                }
                onMouseEnter={query || detail ? undefined : focusHeader}
                onClick={() => {
                  focusHeader()
                  followedJobId.current = null
                  followedHeaderGroup.current = group
                  setCollapsedGroups(current => {
                    const next = new Set(current)
                    if (next.has(group)) next.delete(group)
                    else next.add(group)
                    return next
                  })
                }}
              >
                <Text bold={headerFocused} dimColor={!headerFocused}>
                  {group === 'pinned'
                    ? 'Pinned'
                    : groupMode === 'state'
                      ? STATE_GROUP_LABELS[group as StateBucket]
                      : repoGroupLabel(group)}
                  {collapsed ? <Text dimColor> {groupJobs.length}</Text> : null}
                </Text>
              </Box>
              {jobRows}
            </React.Fragment>
          )
        })}
        {visible.length === 0 && !query ? (
          <Box paddingLeft={2}>
            <Box flexDirection="column">
              <Text dimColor>
                Agents here keep running even if you close this terminal — hand off a task and check back later.
              </Text>
              <Text dimColor>
                {'Try: paste a link, or "review PR #123 for bugs" · "fix the failing test" · "babysit my PR until CI passes"'}
              </Text>
            </Box>
          </Box>
        ) : null}
      </ScrollBox>
      <Box flexShrink={0} flexDirection="column" marginTop={1}>
        {suggestionItems.length > 0 ? (
          <Box paddingLeft={2} marginBottom={1}>
            <PromptInputFooterSuggestions
              suggestions={suggestionItems}
              selectedSuggestion={Math.min(
                suggestionFocus,
                suggestionItems.length - 1,
              )}
              maxColumnWidth={35}
              noPad
            />
          </Box>
        ) : null}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderLeft={false}
          borderRight={false}
          borderDimColor
        >
          <SearchBox
            query={query}
            cursorOffset={queryCursor}
            onCursorOffsetChange={setQueryCursor}
            placeholder="describe a task for a new session"
            prefix={dispatch ? '❯' : undefined}
            prefixDim={!hasDispatch}
            highlights={queryHighlights}
            isFocused={!detail && renameId === null}
            isTerminalFocused={isTerminalFocused}
            width="100%"
            borderless
          />
        </Box>
      </Box>

      {showHelp && !detail ? (
        <FleetShortcuts
          focusedPinned={selected?.state.pinned ?? false}
          canReorder={canReorder}
          canRename={canRename}
          canPin={canPin && !selectedIsPending}
        />
      ) : showInfo && !detail ? (
        <FleetJobInfo job={selected} />
      ) : (
        <Box flexShrink={0} paddingLeft={2} height={1}>
          {exitArmed ? (
            <Text dimColor>
              Press Ctrl-C again to exit
              {activeCount > 0
                ? ` · ${activeCount} ${activeCount === 1 ? 'agent' : 'agents'} will keep running`
                : ''}
            </Text>
          ) : renameId !== null ? (
            <Text dimColor>
              <Byline>
                <KeyboardShortcutHint shortcut="enter" action="save" />
                <KeyboardShortcutHint shortcut="escape" action="cancel" />
              </Byline>
            </Text>
          ) : deleteArmed || deleteAllArmed ? (
            <Text dimColor>
              <KeyboardShortcutHint shortcut="ctrl+x" action="confirm" />
            </Text>
          ) : error ? (
            <Text color="error" wrap="truncate-end">{error}</Text>
          ) : notice ? (
            <Text dimColor>{notice}</Text>
          ) : !detail && suggestionItems.length === 0 ? (
            <Text dimColor>
              <Byline>
                {((selected && !selectedIsPending) || hasDispatch) &&
                !dispatchBlocksEnter ? (
                  <KeyboardShortcutHint shortcut="enter" action={enterAction} />
                ) : null}
                {selectedHeader && !query ? (
                  <KeyboardShortcutHint
                    shortcut="enter"
                    action={
                      collapsedGroups.has(selectedHeader.group)
                        ? 'expand'
                        : 'collapse'
                    }
                  />
                ) : null}
                {selected && !query ? (
                  <KeyboardShortcutHint shortcut=" " action="reply" />
                ) : null}
                {selected && !selectedIsPending && !query ? (
                  <KeyboardShortcutHint shortcut="ctrl+x" action="delete" />
                ) : selectedHeader?.jobs.length && !dispatchOwnsFocus ? (
                  <KeyboardShortcutHint shortcut="ctrl+x" action="delete all" />
                ) : null}
                {query ? (
                  <KeyboardShortcutHint shortcut="escape" action="clear" />
                ) : (
                  <Text>? for shortcuts</Text>
                )}
              </Byline>
            </Text>
          ) : null}
        </Box>
      )}
      <AutoUpdaterWrapper
        isUpdating={isUpdating}
        onChangeIsUpdating={setIsUpdating}
        showSuccessMessage={true}
        verbose={false}
      />

      {detail && selected ? (
        <Box
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          flexDirection="column"
          opaque
        >
          <FleetDetail
            key={selected.id}
            job={selected}
            childRows={selectedChildRows}
            status={sessionStatuses.get(selected.state.sessionId)}
            isPending={selectedIsPending}
            deleteArmed={
              deleteArmed?.id === selected.id
                ? { justKilled: deleteArmed.justKilled }
                : undefined
            }
            onBack={() => setDetail(false)}
            onAttach={() => {
              setDetail(false)
              openJob(selected)
            }}
            onReply={reply => sendSelectedReply(selected, reply)}
            isTerminalFocused={isTerminalFocused}
            replyDrafts={replyDrafts.current}
            replyError={replyError}
            onReplyError={setReplyError}
            renaming={renameId !== null}
          />
        </Box>
      ) : null}
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
  let initialQuery = await loadFleetDraft(await canonicalizePath(getCwd()))
  void cleanupFleetDrafts()
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
