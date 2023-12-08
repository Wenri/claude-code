import React, { Suspense, use, useMemo, useState } from 'react'
import { readdir, readFile, stat } from 'fs/promises'
import { extname, join } from 'path'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getSubscriptionType } from '../../utils/auth.js'
import { isENOENT } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { getProjectsDir } from '../../utils/sessionStorage.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { Byline } from '../design-system/Byline.js'

type BehaviorKey =
  | 'cache_miss'
  | 'long_context'
  | 'subagent_heavy'
  | 'high_parallel'
  | 'cron'

type UsageRecord = {
  ts: number
  sessionId: string
  cached: number
  cacheCreate: number
  uncached: number
  output: number
  isSubagent: boolean
  modelTier: number
  uuid: string
}

type BehaviorStat = { key: BehaviorKey; cost: number; count: number }
type WindowStats = {
  totalCost: number
  requestCount: number
  sessionCount: number
  behaviors: BehaviorStat[]
}
type ScanResult = {
  day: WindowStats
  week: WindowStats
  oversizedFiles: string[]
}

const EMPTY_STATS: WindowStats = {
  totalCost: 0,
  requestCount: 0,
  sessionCount: 0,
  behaviors: [],
}
const MAX_FILE_BYTES = 200 * 1024 * 1024
const FILE_BATCH_SIZE = 16
const MIN_SIGNIFICANT_PERCENT = 10
const TIMESTAMP_RE = /"timestamp":"([^"]+)"/
const SESSION_ID_RE = /"sessionId":"([^"]+)"/
const MODEL_RE = /"model":"([^"]+)"/
const REQUEST_ID_RE = /"requestId":"([^"]+)"/
const MESSAGE_ID_RE = /"id":"(msg_[^"]+)"/
const UUID_RE = /"uuid":"([^"]+)"/
const INPUT_TOKENS_RE = /"input_tokens":(\d+)/
const OUTPUT_TOKENS_RE = /"output_tokens":(\d+)/
const CACHE_CREATE_TOKENS_RE = /"cache_creation_input_tokens":(\d+)/
const CACHE_READ_TOKENS_RE = /"cache_read_input_tokens":(\d+)/

const behaviorCopy: Record<
  BehaviorKey,
  { headline: (percent: number) => string; body: string }
> = {
  cache_miss: {
    headline: percent =>
      `${percent}% of your usage hit a >100k-token cache miss`,
    body:
      'Uncached input is expensive, and often happens when sending a message to a session that has gone idle. /compact before stepping away keeps the cold-start small.',
  },
  long_context: {
    headline: percent =>
      `${percent}% of your usage was at >150k context`,
    body:
      'Longer sessions are more expensive even when cached. /compact mid-task, /clear when switching to new tasks.',
  },
  subagent_heavy: {
    headline: percent =>
      `${percent}% of your usage came from subagent-heavy sessions`,
    body:
      'Each subagent runs its own requests. Be deliberate about spawning them — and consider configuring a cheaper model for simpler subagents.',
  },
  high_parallel: {
    headline: percent =>
      `${percent}% of your usage was while 4+ sessions ran in parallel`,
    body:
      "All sessions share one limit. If you don't need them all at once, queueing uses it more evenly.",
  },
  cron: {
    headline: percent =>
      `${percent}% of your usage came from sessions active for 8+ hours`,
    body:
      'These are often background/loop sessions. Continuous usage can add up quickly so make sure it is intentional.',
  },
}

export function UsageContributors({
  maxWidth,
}: {
  maxWidth: number
}): React.ReactNode {
  if (
    !getFeatureValue_CACHED_MAY_BE_STALE('tengu_birch_compass', false)
  ) {
    return null
  }
  const subscriptionType = getSubscriptionType()
  if (subscriptionType !== 'pro' && subscriptionType !== 'max') return null
  return <UsageContributorsSuspense maxWidth={maxWidth} />
}

function UsageContributorsSuspense({ maxWidth }: { maxWidth: number }) {
  const [scanPromise] = useState(() =>
    scanUsageContributors().catch(error => {
      logError(error as Error)
      return { day: EMPTY_STATS, week: EMPTY_STATS, oversizedFiles: [] }
    }),
  )
  const fallback = (
    <Box flexDirection="column">
      <UsageContributorsHeading />
      <Box marginTop={1}>
        <Text dimColor>Scanning local sessions…</Text>
      </Box>
    </Box>
  )
  return (
    <Suspense fallback={fallback}>
      <UsageContributorsResult
        maxWidth={maxWidth}
        scanPromise={scanPromise}
      />
    </Suspense>
  )
}

function UsageContributorsResult({
  maxWidth,
  scanPromise,
}: {
  maxWidth: number
  scanPromise: Promise<ScanResult>
}) {
  const result = use(scanPromise)
  const [period, setPeriod] = useState<'day' | 'week'>('day')
  const dayStats = significantBehaviors(result.day)
  const weekStats = significantBehaviors(result.week)
  const hasResults =
    result.oversizedFiles.length === 0 &&
    (dayStats.length > 0 || weekStats.length > 0)
  const handlers = useMemo(
    () => ({
      'settings:periodDay': () => setPeriod('day'),
      'settings:periodWeek': () => setPeriod('week'),
    }),
    [],
  )
  useKeybindings(handlers, { context: 'Settings', isActive: hasResults })

  if (result.oversizedFiles.length > 0) {
    return (
      <Box flexDirection="column">
        <UsageContributorsHeading />
        <Box marginTop={1} flexDirection="column">
          <Text color="error" wrap="wrap">
            Cannot compute breakdown — {result.oversizedFiles.length} session
            file(s) exceed 200MB and would skew results:
          </Text>
          {result.oversizedFiles.slice(0, 3).map(path => (
            <Text key={path} dimColor wrap="truncate-start">
              {path}
            </Text>
          ))}
          {result.oversizedFiles.length > 3 && (
            <Text dimColor>
              …and {result.oversizedFiles.length - 3} more
            </Text>
          )}
        </Box>
      </Box>
    )
  }

  if (dayStats.length === 0 && weekStats.length === 0) return null
  const stats = period === 'day' ? result.day : result.week
  const behaviors = significantBehaviors(stats)
  return (
    <Box flexDirection="column">
      <UsageContributorsHeading />
      <Box marginTop={1}>
        <Text dimColor wrap="wrap">
          Last {period === 'day' ? '24h' : '7d'} · these are independent
          characteristics of your usage, not a breakdown
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column" gap={1}>
        {behaviors.length === 0 ? (
          <Text dimColor>
            Nothing over {MIN_SIGNIFICANT_PERCENT}% in this period — try the
            other window.
          </Text>
        ) : (
          behaviors.map(stat => (
            <BehaviorRow
              key={stat.key}
              stat={stat}
              totalCost={stats.totalCost}
              maxWidth={maxWidth}
            />
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          <Byline>
            <ConfigurableShortcutHint
              action="settings:periodDay"
              context="Settings"
              fallback="d"
              description="day"
            />
            <ConfigurableShortcutHint
              action="settings:periodWeek"
              context="Settings"
              fallback="w"
              description="week"
            />
          </Byline>
        </Text>
      </Box>
    </Box>
  )
}

function UsageContributorsHeading() {
  return (
    <Box flexDirection="column">
      <Text bold wrap="wrap">
        What's contributing to your limits usage?
      </Text>
      <Text dimColor wrap="wrap">
        Approximate, based on local sessions on this machine — does not include
        other devices or claude.ai
      </Text>
    </Box>
  )
}

function BehaviorRow({
  stat,
  totalCost,
  maxWidth,
}: {
  stat: BehaviorStat
  totalCost: number
  maxWidth: number
}) {
  const copy = behaviorCopy[stat.key]
  const percent = Math.round((stat.cost / totalCost) * 100)
  return (
    <Box flexDirection="column" width={maxWidth}>
      <Text wrap="wrap">{copy.headline(percent)}</Text>
      <Box paddingLeft={1}>
        <Text dimColor wrap="wrap">
          {copy.body}
        </Text>
      </Box>
    </Box>
  )
}

function significantBehaviors(stats: WindowStats): BehaviorStat[] {
  if (stats.totalCost === 0) return []
  return stats.behaviors.filter(
    behavior =>
      (behavior.cost / stats.totalCost) * 100 >= MIN_SIGNIFICANT_PERCENT,
  )
}

async function scanUsageContributors(): Promise<ScanResult> {
  const { records, oversizedFiles } = await scanRecentUsageRecords(7)
  const dayStart = Date.now() - 24 * 60 * 60 * 1000
  return {
    day: summarizeRecords(records.filter(record => record.ts >= dayStart)),
    week: summarizeRecords(records),
    oversizedFiles,
  }
}

async function scanRecentUsageRecords(days: number): Promise<{
  records: UsageRecord[]
  oversizedFiles: string[]
}> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const projectsDir = getProjectsDir()
  let projects: string[]
  try {
    projects = await readdir(projectsDir)
  } catch (error) {
    if (isENOENT(error)) return { records: [], oversizedFiles: [] }
    throw error
  }
  const files = (
    await Promise.all(projects.map(project => findTranscriptFiles(join(projectsDir, project))))
  ).flat()
  const records: UsageRecord[] = []
  const oversizedFiles: string[] = []
  for (let index = 0; index < files.length; index += FILE_BATCH_SIZE) {
    const batch = files.slice(index, index + FILE_BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(file => readUsageRecords(file, cutoff)),
    )
    batchResults.forEach((result, resultIndex) => {
      if (result === 'oversized') {
        const file = batch[resultIndex]
        if (file) oversizedFiles.push(file)
      } else {
        records.push(...result)
      }
    })
  }
  return { records: dedupeRecords(records), oversizedFiles }
}

async function findTranscriptFiles(projectDir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(projectDir, { withFileTypes: true })
  } catch (error) {
    if (isENOENT(error)) return []
    throw error
  }
  const files: string[] = []
  const sessionDirectories: string[] = []
  for (const entry of entries) {
    if (entry.isFile() && extname(entry.name) === '.jsonl') {
      files.push(join(projectDir, entry.name))
    } else if (entry.isDirectory()) {
      sessionDirectories.push(entry.name)
    }
  }
  const subagentFiles = await Promise.all(
    sessionDirectories.map(async sessionDirectory => {
      const directory = join(projectDir, sessionDirectory, 'subagents')
      try {
        return (await readdir(directory, { recursive: true }))
          .filter(path => extname(path) === '.jsonl')
          .map(path => join(directory, path))
      } catch (error) {
        if (isENOENT(error)) return []
        throw error
      }
    }),
  )
  return [...files, ...subagentFiles.flat()]
}

async function readUsageRecords(
  file: string,
  cutoff: number,
): Promise<UsageRecord[] | 'oversized'> {
  let fileStat
  try {
    fileStat = await stat(file)
  } catch (error) {
    if (isENOENT(error)) return []
    throw error
  }
  if (!fileStat.isFile() || fileStat.mtimeMs < cutoff) return []
  if (fileStat.size > MAX_FILE_BYTES) return 'oversized'
  let content: string
  try {
    content = await readFile(file, 'utf8')
  } catch (error) {
    if (isENOENT(error)) return []
    throw error
  }
  const records: UsageRecord[] = []
  let position = 0
  while (position < content.length) {
    let end = content.indexOf('\n', position)
    if (end === -1) end = content.length
    const line = content.slice(position, end)
    position = end + 1
    if (!line.includes('"type":"assistant"') || !line.includes('"usage":{')) {
      continue
    }
    const timestamp = TIMESTAMP_RE.exec(line)?.[1]
    const sessionId = SESSION_ID_RE.exec(line)?.[1]
    if (!timestamp || !sessionId) continue
    const ts = Date.parse(timestamp)
    if (Number.isNaN(ts) || ts < cutoff) continue
    const uncached = Number(INPUT_TOKENS_RE.exec(line)?.[1] ?? 0)
    const output = Number(OUTPUT_TOKENS_RE.exec(line)?.[1] ?? 0)
    const cacheCreate = Number(
      CACHE_CREATE_TOKENS_RE.exec(line)?.[1] ?? 0,
    )
    const cached = Number(
      CACHE_READ_TOKENS_RE.exec(line)?.[1] ?? 0,
    )
    if (uncached + output + cacheCreate + cached === 0) continue
    const model = MODEL_RE.exec(line)?.[1] ?? ''
    records.push({
      ts,
      sessionId,
      cached,
      cacheCreate,
      uncached,
      output,
      isSubagent:
        line.includes('"isSidechain":true') ||
        line.includes('"isSidechain": true'),
      modelTier: modelTier(model),
      uuid:
        REQUEST_ID_RE.exec(line)?.[1] ??
        MESSAGE_ID_RE.exec(line)?.[1] ??
        UUID_RE.exec(line)?.[1] ??
        '',
    })
  }
  return records
}

function dedupeRecords(records: UsageRecord[]): UsageRecord[] {
  const seen = new Set<string>()
  return records.filter(record => {
    if (!record.uuid) return true
    if (seen.has(record.uuid)) return false
    seen.add(record.uuid)
    return true
  })
}

function modelTier(model: string): number {
  const normalized = model.toLowerCase()
  if (normalized.includes('opus')) return 5
  if (normalized.includes('haiku')) return 1
  return 3
}

function estimatedCost(record: UsageRecord): number {
  return (
    (record.cached +
      record.uncached * 10 +
      record.cacheCreate * 12.5 +
      record.output * 50) *
    record.modelTier
  )
}

function summarizeRecords(records: UsageRecord[]): WindowStats {
  let totalCost = 0
  let cacheMissCost = 0
  let cacheMissCount = 0
  let longContextCost = 0
  let longContextCount = 0
  const sessions = new Map<
    string,
    { cost: number; subCost: number; subCount: number; hours: Set<number> }
  >()
  const windows = new Map<
    number,
    { sessionIds: Set<string>; cost: number; count: number }
  >()

  for (const record of records) {
    const cost = estimatedCost(record)
    totalCost += cost
    const inputTokens = record.cached + record.cacheCreate + record.uncached
    if (record.uncached > 100_000) {
      cacheMissCost += cost
      cacheMissCount++
    }
    if (inputTokens > 150_000) {
      longContextCost += cost
      longContextCount++
    }
    let session = sessions.get(record.sessionId)
    if (!session) {
      session = { cost: 0, subCost: 0, subCount: 0, hours: new Set() }
      sessions.set(record.sessionId, session)
    }
    session.cost += cost
    if (record.isSubagent) {
      session.subCost += cost
      session.subCount++
    }
    session.hours.add(Math.floor(record.ts / (60 * 60 * 1000)))

    const windowKey = Math.floor(record.ts / (5 * 60 * 1000))
    let window = windows.get(windowKey)
    if (!window) {
      window = { sessionIds: new Set(), cost: 0, count: 0 }
      windows.set(windowKey, window)
    }
    window.sessionIds.add(record.sessionId)
    window.cost += cost
    window.count++
  }

  let highParallelCost = 0
  let highParallelCount = 0
  for (const window of windows.values()) {
    if (window.sessionIds.size >= 4) {
      highParallelCost += window.cost
      highParallelCount += window.count
    }
  }
  let subagentCost = 0
  let subagentCount = 0
  let cronCost = 0
  let cronCount = 0
  for (const session of sessions.values()) {
    if (
      session.subCount >= 3 ||
      (session.cost > 0 && session.subCost / session.cost > 0.5)
    ) {
      subagentCost += session.cost
      subagentCount++
    }
    if (session.hours.size >= 8) {
      cronCost += session.cost
      cronCount++
    }
  }
  const behaviors: BehaviorStat[] = [
    { key: 'cache_miss', cost: cacheMissCost, count: cacheMissCount },
    { key: 'long_context', cost: longContextCost, count: longContextCount },
    { key: 'subagent_heavy', cost: subagentCost, count: subagentCount },
    { key: 'high_parallel', cost: highParallelCost, count: highParallelCount },
    { key: 'cron', cost: cronCost, count: cronCount },
  ]
  behaviors.sort((left, right) => right.cost - left.cost)
  return {
    totalCost,
    requestCount: records.length,
    sessionCount: sessions.size,
    behaviors,
  }
}
