import * as React from 'react'
import { useEffect, useRef } from 'react'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getIsInteractive } from '../bootstrap/state.js'
import { useNotifications } from '../context/notifications.js'
import { Link, Text } from '../ink.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import { isEssentialTrafficOnly } from '../utils/privacyLevel.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'

type ClosedIssue = {
  number: number
  title: string
  closedAt: string
}

const GH_TIMEOUT_MS = 5_000
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000
const SEARCH_DAYS = 30
const MAX_VISIBLE_REFRESH_MS = 4_000
const NOTICE_TIMEOUT_MS = 10_000
const ISSUE_URL = 'https://github.com/anthropics/claude-code/issues/'

function cachePath(): string {
  return join(getClaudeConfigHomeDir(), 'cache', 'my-closed-issues.json')
}

function sinceDate(now: number): string {
  return new Date(now - SEARCH_DAYS * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10)
}

async function refreshClosedIssues(): Promise<number | null> {
  if (!getIsInteractive()) return null
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
      `closed:>${sinceDate(now)}`,
      '--json',
      'number,title,closedAt,stateReason',
      '--limit',
      '30',
    ],
    { timeout: GH_TIMEOUT_MS, preserveOutputOnError: false },
  )
  const elapsed = Date.now() - startedAt

  let closedIssues: ClosedIssue[] | null = null
  if (code === 0) {
    try {
      const parsed = jsonParse(stdout) as Array<
        ClosedIssue & { stateReason?: string }
      >
      closedIssues = parsed
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

  if (closedIssues !== null) {
    try {
      const filename = cachePath()
      await mkdir(dirname(filename), { recursive: true })
      await writeFile(filename, jsonStringify(closedIssues), {
        encoding: 'utf-8',
      })
    } catch (error) {
      logError(error)
    }
  }

  const acknowledged = config.closedIssuesAcknowledged ?? []
  let retained = acknowledged
  if (closedIssues !== null) {
    const current = new Set(closedIssues.map(issue => issue.number))
    retained = acknowledged.filter(number => current.has(number))
  }
  const changed =
    retained.length !== acknowledged.length ||
    retained.some((number, index) => number !== acknowledged[index])
  saveGlobalConfig(current => ({
    ...current,
    closedIssuesLastChecked: now,
    ...(changed && { closedIssuesAcknowledged: retained }),
  }))
  return elapsed
}

async function readClosedIssueCache(): Promise<ClosedIssue[]> {
  try {
    const parsed = jsonParse(
      await readFile(cachePath(), { encoding: 'utf-8' }),
    )
    return Array.isArray(parsed) ? (parsed as ClosedIssue[]) : []
  } catch (error) {
    if (!isENOENT(error)) logError(error)
    return []
  }
}

function unacknowledged(issues: ClosedIssue[]): ClosedIssue[] {
  const acknowledged = new Set(
    getGlobalConfig().closedIssuesAcknowledged ?? [],
  )
  return issues.filter(issue => !acknowledged.has(issue.number))
}

function acknowledge(numbers: number[]): void {
  if (numbers.length === 0) return
  const previous = getGlobalConfig().closedIssuesAcknowledged ?? []
  const next = [...new Set([...previous, ...numbers])]
  if (next.length === previous.length) return
  saveGlobalConfig(config => ({
    ...config,
    closedIssuesAcknowledged: next,
  }))
}

function IssueLink({ number }: { number: number }): React.ReactNode {
  return <Link url={`${ISSUE_URL}${number}`}>#{number}</Link>
}

function renderNotice(issues: ClosedIssue[]): React.ReactNode {
  if (issues.length === 1) {
    return <Text color="success">✓ Your issue <IssueLink number={issues[0]!.number} /> has been closed. Thanks for reporting!</Text>
  }
  const links = issues.flatMap((issue, index) => [
    index > 0 ? ', ' : '',
    <IssueLink key={issue.number} number={issue.number} />,
  ])
  return <Text color="success">✓ {issues.length} of your issues have been closed ({links}). Thanks for reporting!</Text>
}

export function ClosedIssueNotice(): React.ReactNode {
  const { addNotification } = useNotifications()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_gouda_loop', false)) {
      return
    }

    let cancelled = false
    const shown: ClosedIssue[] = []
    const show = (issues: ClosedIssue[]) => {
      const existing = new Set(shown.map(issue => issue.number))
      const fresh = issues.filter(issue => !existing.has(issue.number))
      if (fresh.length === 0) return
      shown.push(...fresh)
      addNotification({
        key: 'closed-issue-notice',
        jsx: renderNotice(shown),
        priority: 'low',
        timeoutMs: NOTICE_TIMEOUT_MS,
        fold: (_previous, next) => next,
      })
      acknowledge(fresh.map(issue => issue.number))
    }

    void (async () => {
      const cached = unacknowledged(await readClosedIssueCache())
      if (!cancelled && cached.length > 0) show(cached)

      const elapsed = await refreshClosedIssues()
      if (cancelled || elapsed === null || elapsed > MAX_VISIBLE_REFRESH_MS) {
        return
      }
      const refreshed = unacknowledged(await readClosedIssueCache())
      if (!cancelled && refreshed.length > 0) show(refreshed)
    })().catch(logError)

    return () => {
      cancelled = true
    }
  }, [addNotification])

  return null
}
