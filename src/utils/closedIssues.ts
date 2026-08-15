import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { getGlobalConfig, saveGlobalConfig } from './config.js'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { isENOENT } from './errors.js'
import { execFileNoThrow } from './execFileNoThrow.js'
import { logError } from './log.js'
import { isEssentialTrafficOnly } from './privacyLevel.js'
import { jsonParse, jsonStringify } from './slowOperations.js'

export type ClosedIssue = {
  number: number
  title: string
  closedAt: string
}

const GH_TIMEOUT_MS = 5_000
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000
const LOOKBACK_DAYS = 30

function getClosedIssuesCachePath(): string {
  return join(getClaudeConfigHomeDir(), 'cache', 'my-closed-issues.json')
}

function getLookbackDate(now: number): string {
  return new Date(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10)
}

export async function refreshClosedIssues(): Promise<number | null> {
  if (getIsNonInteractiveSession()) return null
  if (isEssentialTrafficOnly()) return null

  const config = getGlobalConfig()
  const now = Date.now()
  if (now - (config.closedIssuesLastChecked ?? 0) < CHECK_INTERVAL_MS) {
    return null
  }

  const startedAt = now
  const { stdout, code } = await execFileNoThrow(
    'gh',
    [
      'issue',
      'list',
      '-R',
      'anthropics/claude-code',
      '--author',
      '@me',
      '--state',
      'closed',
      '--search',
      `closed:>${getLookbackDate(now)}`,
      '--json',
      'number,title,closedAt,stateReason',
      '--limit',
      '30',
    ],
    { timeout: GH_TIMEOUT_MS, preserveOutputOnError: false },
  )
  const durationMs = Date.now() - startedAt

  let issues: ClosedIssue[] | null = null
  if (code === 0) {
    try {
      issues = (
        jsonParse(stdout) as Array<ClosedIssue & { stateReason?: string }>
      )
        .filter(issue => issue.stateReason === 'COMPLETED')
        .map(issue => ({
          number: issue.number,
          title: issue.title,
          closedAt: issue.closedAt,
        }))
    } catch (error) {
      logError(error)
    }
  }

  if (issues !== null) {
    try {
      const cachePath = getClosedIssuesCachePath()
      await mkdir(dirname(cachePath), { recursive: true })
      await writeFile(cachePath, jsonStringify(issues), { encoding: 'utf-8' })
    } catch (error) {
      logError(error)
    }
  }

  const acknowledged = config.closedIssuesAcknowledged ?? []
  let retainedAcknowledgements = acknowledged
  if (issues !== null) {
    const currentIssueNumbers = new Set(issues.map(issue => issue.number))
    retainedAcknowledgements = acknowledged.filter(number =>
      currentIssueNumbers.has(number),
    )
  }
  const acknowledgementsChanged =
    retainedAcknowledgements.length !== acknowledged.length ||
    retainedAcknowledgements.some(
      (number, index) => number !== acknowledged[index],
    )
  saveGlobalConfig(previous => ({
    ...previous,
    closedIssuesLastChecked: now,
    ...(acknowledgementsChanged && {
      closedIssuesAcknowledged: retainedAcknowledgements,
    }),
  }))
  return durationMs
}

export async function readCachedClosedIssues(): Promise<ClosedIssue[]> {
  try {
    const value = jsonParse(
      await readFile(getClosedIssuesCachePath(), { encoding: 'utf-8' }),
    )
    return Array.isArray(value) ? value : []
  } catch (error) {
    if (!isENOENT(error)) logError(error)
    return []
  }
}

export function getUnacknowledgedClosedIssues(
  issues: ClosedIssue[],
): ClosedIssue[] {
  const acknowledged = new Set(getGlobalConfig().closedIssuesAcknowledged ?? [])
  return issues.filter(issue => !acknowledged.has(issue.number))
}

export function acknowledgeClosedIssues(issues: ClosedIssue[]): void {
  if (issues.length === 0) return
  const acknowledged = getGlobalConfig().closedIssuesAcknowledged ?? []
  const next = [...new Set([...acknowledged, ...issues.map(issue => issue.number)])]
  if (next.length === acknowledged.length) return
  saveGlobalConfig(previous => ({
    ...previous,
    closedIssuesAcknowledged: next,
  }))
}
