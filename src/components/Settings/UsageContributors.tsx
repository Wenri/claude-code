import React, { Suspense, use, useMemo, useState } from 'react'
import { readdir, stat } from 'fs/promises'
import { extname, join } from 'path'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isENOENT } from '../../utils/errors.js'
import { readLineBuffers } from '../../utils/fsOperations.js'
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
  attributionAgent?: string
  attributionSkill?: string
  attributionPlugin?: string
}

type BehaviorStat = { key: BehaviorKey; cost: number; count: number }
type AttributionStat = { name: string; pct: number }
type WindowStats = {
  totalCost: number
  requestCount: number
  sessionCount: number
  behaviors: BehaviorStat[]
  agents: AttributionStat[]
  skills: AttributionStat[]
  plugins: AttributionStat[]
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
  agents: [],
  skills: [],
  plugins: [],
}
const MAX_FILE_BYTES = 200 * 1024 * 1024
const FILE_BATCH_SIZE = 4
const MIN_SIGNIFICANT_PERCENT = 10
const encoder = new TextEncoder()
const ASSISTANT = encoder.encode('"type":"assistant"')
const USAGE = encoder.encode('"usage":{')
const TIMESTAMP = encoder.encode('"timestamp":"')
const SESSION_ID = encoder.encode('"sessionId":"')
const MODEL = encoder.encode('"model":"')
const REQUEST_ID = encoder.encode('"requestId":"')
const MESSAGE_ID = encoder.encode('"id":"')
const MESSAGE_PREFIX = encoder.encode('msg_')
const UUID = encoder.encode('"uuid":"')
const INPUT_TOKENS = encoder.encode('"input_tokens":')
const OUTPUT_TOKENS = encoder.encode('"output_tokens":')
const CACHE_CREATE_TOKENS = encoder.encode('"cache_creation_input_tokens":')
const CACHE_READ_TOKENS = encoder.encode('"cache_read_input_tokens":')
const SIDECHAIN_COMPACT = encoder.encode('"isSidechain":true')
const SIDECHAIN_SPACED = encoder.encode('"isSidechain": true')
const ATTRIBUTION = encoder.encode('"attribution')
const ATTRIBUTION_AGENT = encoder.encode('"attributionAgent":"')
const ATTRIBUTION_SKILL = encoder.encode('"attributionSkill":"')
const ATTRIBUTION_PLUGIN = encoder.encode('"attributionPlugin":"')

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
  const dayHasResults = dayStats.length > 0 || hasAttribution(result.day)
  const weekHasResults = weekStats.length > 0 || hasAttribution(result.week)
  const hasResults =
    result.oversizedFiles.length === 0 &&
    (dayHasResults || weekHasResults)
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

  if (!dayHasResults && !weekHasResults) return null
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
        {behaviors.length === 0 && !hasAttribution(stats) ? (
          <Text dimColor>
            Nothing over {MIN_SIGNIFICANT_PERCENT}% in this period — try the
            other window.
          </Text>
        ) : (
          <>
            {behaviors.map(stat => (
              <BehaviorRow
                key={stat.key}
                stat={stat}
                totalCost={stats.totalCost}
                maxWidth={maxWidth}
              />
            ))}
            <AttributionInsight
              top={stats.agents[0]}
              maxWidth={maxWidth}
              headline={(percent, name) =>
                `${percent}% of your usage came from subagents under "${name}"`
              }
              body="If this runs frequently, consider configuring its subagents with a cheaper model or tightening their prompts."
            />
            <AttributionInsight
              top={stats.skills[0]}
              maxWidth={maxWidth}
              headline={(percent, name) =>
                `${percent}% of your usage came from /${name}`
              }
              body="Heavy skills can be scoped down or run with a cheaper model via skill frontmatter."
            />
            <AttributionInsight
              top={stats.plugins[0]}
              maxWidth={maxWidth}
              headline={(percent, name) =>
                `${percent}% of your usage came from plugin "${name}"`
              }
              body="Review what this plugin contributes — its agents, skills, and MCP tools all count toward your limit."
            />
            {!hasAttribution(stats) ? (
              <Box flexDirection="column">
                <Text bold>Skills, subagents, and plugins</Text>
                <Text dimColor wrap="wrap">
                  No attribution data yet · accumulates as you use Claude
                </Text>
              </Box>
            ) : (
              <>
                <AttributionTable
                  title="Skills"
                  rows={stats.skills}
                  label={name => `/${name}`}
                />
                <AttributionTable title="Subagents" rows={stats.agents} />
                <AttributionTable title="Plugins" rows={stats.plugins} />
              </>
            )}
          </>
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

function AttributionInsight({
  top,
  maxWidth,
  headline,
  body,
}: {
  top?: AttributionStat
  maxWidth: number
  headline: (percent: number, name: string) => string
  body: string
}) {
  if (!top || top.pct < MIN_SIGNIFICANT_PERCENT) return null
  return (
    <Box flexDirection="column" width={maxWidth}>
      <Text wrap="wrap">{headline(top.pct, top.name)}</Text>
      <Box paddingLeft={1}>
        <Text dimColor wrap="wrap">
          {body}
        </Text>
      </Box>
    </Box>
  )
}

function AttributionTable({
  title,
  rows,
  label,
}: {
  title: string
  rows: AttributionStat[]
  label?: (name: string) => string
}) {
  if (rows.length === 0) return null
  const visible = rows.slice(0, 8)
  const remaining = rows.length - visible.length
  return (
    <Box flexDirection="column">
      <Box width={34} justifyContent="space-between">
        <Text>{title}</Text>
        <Text dimColor>% of usage</Text>
      </Box>
      {visible.map(row => (
        <Box key={row.name}>
          <Box width={28}>
            <Text dimColor wrap="truncate-end">
              {label ? label(row.name) : row.name}
            </Text>
          </Box>
          <Box width={6} justifyContent="flex-end">
            <Text dimColor>{row.pct}%</Text>
          </Box>
        </Box>
      ))}
      {remaining > 0 && <Text dimColor>… {remaining} more</Text>}
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

function hasAttribution(stats: WindowStats): boolean {
  return (
    stats.agents.length > 0 ||
    stats.skills.length > 0 ||
    stats.plugins.length > 0
  )
}

async function scanUsageContributors(): Promise<ScanResult> {
  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000
  const dayStart = Date.now() - 24 * 60 * 60 * 1000
  const projectsDir = getProjectsDir()
  let projects: string[]
  try {
    projects = await readdir(projectsDir)
  } catch (error) {
    if (isENOENT(error)) {
      return { day: EMPTY_STATS, week: EMPTY_STATS, oversizedFiles: [] }
    }
    throw error
  }
  const files = (
    await Promise.all(projects.map(project => findTranscriptFiles(join(projectsDir, project))))
  ).flat()
  const day = createAccumulator()
  const week = createAccumulator()
  const seen = new Set<string>()
  const oversizedFiles: string[] = []
  for (let index = 0; index < files.length; index += FILE_BATCH_SIZE) {
    const batch = files.slice(index, index + FILE_BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(file => readUsageRecords(file, weekStart)),
    )
    batchResults.forEach((result, resultIndex) => {
      if (result === 'oversized') {
        const file = batch[resultIndex]
        if (file) oversizedFiles.push(file)
      } else {
        for (const record of result) {
          if (record.uuid) {
            if (seen.has(record.uuid)) continue
            seen.add(record.uuid)
          }
          addRecord(week, record)
          if (record.ts >= dayStart) addRecord(day, record)
        }
      }
    })
  }
  return {
    day: finalizeAccumulator(day),
    week: finalizeAccumulator(week),
    oversizedFiles,
  }
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
  const records: UsageRecord[] = []
  try {
    for await (const line of readLineBuffers(file)) {
      const record = parseUsageRecord(line, 0, line.length, cutoff)
      if (record) records.push(record)
    }
  } catch (error) {
    if (isENOENT(error)) return records
    throw error
  }
  return records
}

function indexOfWithin(
  line: Buffer,
  needle: Uint8Array,
  start: number,
  end: number,
): number {
  const offset = line.subarray(start, end).indexOf(needle)
  return offset < 0 ? -1 : start + offset
}

function extractQuoted(
  line: Buffer,
  prefix: Uint8Array,
  start: number,
  end: number,
): string | undefined {
  const index = indexOfWithin(line, prefix, start, end)
  if (index < 0) return undefined
  const valueStart = index + prefix.length
  let valueEnd = valueStart
  while (valueEnd < end && line[valueEnd] !== 0x22) valueEnd++
  return line.toString('utf8', valueStart, valueEnd)
}

function extractMessageId(
  line: Buffer,
  start: number,
  end: number,
): string | undefined {
  let position = start
  while (true) {
    position = indexOfWithin(line, MESSAGE_ID, position, end)
    if (position < 0) return undefined
    const valueStart = position + MESSAGE_ID.length
    if (
      indexOfWithin(
        line,
        MESSAGE_PREFIX,
        valueStart,
        valueStart + MESSAGE_PREFIX.length,
      ) === valueStart
    ) {
      let valueEnd = valueStart
      while (valueEnd < end && line[valueEnd] !== 0x22) valueEnd++
      return line.toString('utf8', valueStart, valueEnd)
    }
    position = valueStart
  }
}

function extractNumber(
  line: Buffer,
  prefix: Uint8Array,
  start: number,
  end: number,
): number {
  const index = indexOfWithin(line, prefix, start, end)
  if (index < 0) return 0
  let position = index + prefix.length
  let value = 0
  while (
    position < end &&
    line[position]! >= 0x30 &&
    line[position]! <= 0x39
  ) {
    value = value * 10 + line[position]! - 0x30
    position++
  }
  return value
}

function parseUsageRecord(
  line: Buffer,
  start: number,
  end: number,
  cutoff: number,
): UsageRecord | undefined {
  if (indexOfWithin(line, ASSISTANT, start, end) < 0) return undefined
  if (indexOfWithin(line, USAGE, start, end) < 0) return undefined
  const timestamp = extractQuoted(line, TIMESTAMP, start, end)
  const sessionId = extractQuoted(line, SESSION_ID, start, end)
  if (!timestamp || !sessionId) return undefined
  const ts = Date.parse(timestamp)
  if (Number.isNaN(ts) || ts < cutoff) return undefined
  const uncached = extractNumber(line, INPUT_TOKENS, start, end)
  const output = extractNumber(line, OUTPUT_TOKENS, start, end)
  const cacheCreate = extractNumber(line, CACHE_CREATE_TOKENS, start, end)
  const cached = extractNumber(line, CACHE_READ_TOKENS, start, end)
  if (uncached + output + cacheCreate + cached === 0) return undefined
  const hasAttribution = indexOfWithin(line, ATTRIBUTION, start, end) >= 0
  return {
    ts,
    sessionId,
    cached,
    cacheCreate,
    uncached,
    output,
    isSubagent:
      indexOfWithin(line, SIDECHAIN_COMPACT, start, end) >= 0 ||
      indexOfWithin(line, SIDECHAIN_SPACED, start, end) >= 0,
    modelTier: modelTier(extractQuoted(line, MODEL, start, end)),
    uuid:
      extractQuoted(line, REQUEST_ID, start, end) ??
      extractMessageId(line, start, end) ??
      extractQuoted(line, UUID, start, end) ??
      '',
    ...(hasAttribution && {
      attributionAgent: extractQuoted(line, ATTRIBUTION_AGENT, start, end),
      attributionSkill: extractQuoted(line, ATTRIBUTION_SKILL, start, end),
      attributionPlugin: extractQuoted(line, ATTRIBUTION_PLUGIN, start, end),
    }),
  }
}

function modelTier(model?: string): number {
  if (!model) return 3
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

type UsageAccumulator = {
  totalCost: number
  requestCount: number
  cacheMissCost: number
  cacheMissCount: number
  longContextCost: number
  longContextCount: number
  sessions: Map<
    string,
    { cost: number; subCost: number; subCount: number; hours: Set<number> }
  >
  buckets: Map<
    number,
    { sessionIds: Set<string>; cost: number; count: number }
  >
  byAgent: Map<string, number>
  bySkill: Map<string, number>
  byPlugin: Map<string, number>
}

function createAccumulator(): UsageAccumulator {
  return {
    totalCost: 0,
    requestCount: 0,
    cacheMissCost: 0,
    cacheMissCount: 0,
    longContextCost: 0,
    longContextCount: 0,
    sessions: new Map(),
    buckets: new Map(),
    byAgent: new Map(),
    bySkill: new Map(),
    byPlugin: new Map(),
  }
}

function addAttribution(
  values: Map<string, number>,
  name: string | undefined,
  cost: number,
): void {
  if (name) values.set(name, (values.get(name) ?? 0) + cost)
}

function addRecord(accumulator: UsageAccumulator, record: UsageRecord): void {
  const cost = estimatedCost(record)
  accumulator.totalCost += cost
  accumulator.requestCount++
  if (record.attributionAgent) {
    addAttribution(
      accumulator.byAgent,
      record.attributionSkill ?? record.attributionAgent,
      cost,
    )
  } else {
    addAttribution(accumulator.bySkill, record.attributionSkill, cost)
  }
  addAttribution(accumulator.byPlugin, record.attributionPlugin, cost)

  const inputTokens = record.cached + record.cacheCreate + record.uncached
  if (record.uncached > 100_000) {
    accumulator.cacheMissCost += cost
    accumulator.cacheMissCount++
  }
  if (inputTokens > 150_000) {
    accumulator.longContextCost += cost
    accumulator.longContextCount++
  }
  let session = accumulator.sessions.get(record.sessionId)
  if (!session) {
    session = { cost: 0, subCost: 0, subCount: 0, hours: new Set() }
    accumulator.sessions.set(record.sessionId, session)
  }
  session.cost += cost
  if (record.isSubagent) {
    session.subCost += cost
    session.subCount++
  }
  session.hours.add(Math.floor(record.ts / (60 * 60 * 1000)))

  const bucketKey = Math.floor(record.ts / (5 * 60 * 1000))
  let bucket = accumulator.buckets.get(bucketKey)
  if (!bucket) {
    bucket = { sessionIds: new Set(), cost: 0, count: 0 }
    accumulator.buckets.set(bucketKey, bucket)
  }
  bucket.sessionIds.add(record.sessionId)
  bucket.cost += cost
  bucket.count++
}

function finalizeAccumulator(accumulator: UsageAccumulator): WindowStats {
  let highParallelCost = 0
  let highParallelCount = 0
  for (const bucket of accumulator.buckets.values()) {
    if (bucket.sessionIds.size >= 4) {
      highParallelCost += bucket.cost
      highParallelCount += bucket.count
    }
  }
  let subagentCost = 0
  let subagentCount = 0
  let cronCost = 0
  let cronCount = 0
  for (const session of accumulator.sessions.values()) {
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
    {
      key: 'cache_miss',
      cost: accumulator.cacheMissCost,
      count: accumulator.cacheMissCount,
    },
    {
      key: 'long_context',
      cost: accumulator.longContextCost,
      count: accumulator.longContextCount,
    },
    { key: 'subagent_heavy', cost: subagentCost, count: subagentCount },
    { key: 'high_parallel', cost: highParallelCost, count: highParallelCount },
    { key: 'cron', cost: cronCost, count: cronCount },
  ]
  behaviors.sort((left, right) => right.cost - left.cost)
  return {
    totalCost: accumulator.totalCost,
    requestCount: accumulator.requestCount,
    sessionCount: accumulator.sessions.size,
    behaviors,
    agents: summarizeAttribution(accumulator.byAgent, accumulator.totalCost),
    skills: summarizeAttribution(accumulator.bySkill, accumulator.totalCost),
    plugins: summarizeAttribution(accumulator.byPlugin, accumulator.totalCost),
  }
}

function summarizeAttribution(
  values: Map<string, number>,
  totalCost: number,
): AttributionStat[] {
  if (values.size === 0 || totalCost === 0) return []
  return [...values.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name, cost]) => ({
      name,
      pct: Math.round((cost / totalCost) * 100),
    }))
    .filter(value => value.pct > 0)
}
