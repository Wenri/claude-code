import { mkdir, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { execFileNoThrow } from './execFileNoThrow.js'
import { logForDebugging } from './debug.js'
import { atomicWriteFile } from './atomicWrite.js'

export type PrState = 'OPEN' | 'CLOSED' | 'MERGED' | 'DRAFT'
export type PrReview =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REVIEW_REQUIRED'
  | null

export interface PrStatus {
  number: number
  title: string
  state: PrState
  checks: { passed: number; failed: number; pending: number }
  review: PrReview
  mergeable: boolean
  mergeStateStatus: string
  additions: number
  deletions: number
}

export type PrStatusColor =
  | 'merged'
  | 'inactive'
  | 'error'
  | 'success'
  | 'warning'

export function prStatusColor(status: PrStatus): PrStatusColor {
  switch (status.state) {
    case 'MERGED':
      return 'merged'
    case 'CLOSED':
    case 'DRAFT':
      return 'inactive'
    case 'OPEN':
      if (
        status.checks.failed > 0 ||
        status.review === 'CHANGES_REQUESTED' ||
        status.mergeStateStatus === 'DIRTY' ||
        status.mergeStateStatus === 'BEHIND'
      ) {
        return 'error'
      }
      if (
        status.checks.pending === 0 &&
        status.mergeable &&
        status.review !== 'REVIEW_REQUIRED'
      ) {
        return 'success'
      }
      return 'warning'
  }
}

function countRestChecks(
  checks: Array<{
    conclusion?: string | null
    state?: string | null
    status?: string | null
  }> | null,
) {
  let passed = 0
  let failed = 0
  let pending = 0
  for (const check of checks ?? []) {
    const state = (check.conclusion ?? check.state)?.toUpperCase()
    if (state === 'SUCCESS' || state === 'NEUTRAL' || state === 'SKIPPED') {
      passed++
    } else if (state === 'FAILURE' || state === 'ERROR') failed++
    else if (
      state == null ||
      state === 'ACTION_REQUIRED' ||
      state === 'PENDING' ||
      state === 'EXPECTED' ||
      check.status?.toUpperCase() !== 'COMPLETED'
    ) {
      pending++
    } else failed++
  }
  return { passed, failed, pending }
}

function normalizeRestPr(value: Record<string, unknown>): PrStatus {
  return {
    number: value.number as number,
    title: value.title as string,
    state:
      value.state === 'MERGED'
        ? 'MERGED'
        : value.state === 'CLOSED'
          ? 'CLOSED'
          : value.isDraft
            ? 'DRAFT'
            : 'OPEN',
    checks: countRestChecks(
      value.statusCheckRollup as Parameters<typeof countRestChecks>[0],
    ),
    review:
      value.reviewDecision === 'APPROVED' ||
      value.reviewDecision === 'CHANGES_REQUESTED' ||
      value.reviewDecision === 'REVIEW_REQUIRED'
        ? value.reviewDecision
        : null,
    mergeable:
      value.mergeStateStatus === 'CLEAN' ||
      value.mergeStateStatus === 'HAS_HOOKS' ||
      value.mergeStateStatus === 'UNSTABLE',
    mergeStateStatus: String(value.mergeStateStatus ?? ''),
    additions: Number(value.additions ?? 0),
    deletions: Number(value.deletions ?? 0),
  }
}

const singleCache = new Map<
  string,
  { at: number; value: Promise<PrStatus | null> }
>()

async function fetchSingle(url: string): Promise<PrStatus | null> {
  const { stdout, code } = await execFileNoThrow(
    'gh',
    [
      'pr',
      'view',
      url,
      '--json',
      'number,title,state,isDraft,statusCheckRollup,reviewDecision,mergeStateStatus,additions,deletions',
    ],
    { timeout: 5_000, preserveOutputOnError: false },
  )
  if (code !== 0 || !stdout.trim()) return null
  try {
    return normalizeRestPr(JSON.parse(stdout) as Record<string, unknown>)
  } catch {
    return null
  }
}

export function fetchPrStatus(url: string): Promise<PrStatus | null> {
  const cached = singleCache.get(url)
  if (cached && Date.now() - cached.at < 30_000) return cached.value
  const value = fetchSingle(url).catch(() => null)
  singleCache.set(url, { at: Date.now(), value })
  return value
}

const PR_URL =
  /^https:\/\/([\w.-]+)\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\b/

export interface ParsedPrUrl {
  url: string
  host: string
  owner: string
  repo: string
  num: number
}

export function parsePrUrl(url: string): ParsedPrUrl | null {
  const match = url.match(PR_URL)
  if (!match) return null
  return {
    url,
    host: match[1],
    owner: match[2],
    repo: match[3],
    num: Number(match[4]),
  }
}

export function formatPrUrl(url: string, template?: string): string {
  if (!template) return url
  const parsed = parsePrUrl(url)
  if (!parsed) return url
  return template
    .replaceAll('{host}', parsed.host)
    .replaceAll('{owner}', parsed.owner)
    .replaceAll('{repo}', parsed.repo)
    .replaceAll('{number}', String(parsed.num))
    .replaceAll('{url}', url)
}

const GRAPHQL_FRAGMENT = `fragment pr on PullRequest {
  number title state isDraft additions deletions
  reviewDecision mergeStateStatus
  commits(last:1){nodes{commit{statusCheckRollup{
    state
    contexts(first:0){
      checkRunCountsByState{state count}
      statusContextCountsByState{state count}
    }
  }}}}
}`

type Count = { state: string; count: number }

function countGraphqlChecks(checkRuns?: Count[], statuses?: Count[]) {
  let passed = 0
  let failed = 0
  let pending = 0
  for (const { state, count } of checkRuns ?? []) {
    switch (state) {
      case 'SUCCESS':
      case 'NEUTRAL':
      case 'SKIPPED':
        passed += count
        break
      case 'FAILURE':
      case 'CANCELLED':
      case 'TIMED_OUT':
      case 'STALE':
      case 'STARTUP_FAILURE':
        failed += count
        break
      case 'ACTION_REQUIRED':
      case 'IN_PROGRESS':
      case 'QUEUED':
      case 'PENDING':
      case 'WAITING':
      case 'REQUESTED':
      case 'COMPLETED':
        pending += count
        break
      default:
        failed += count
    }
  }
  for (const { state, count } of statuses ?? []) {
    if (state === 'SUCCESS') passed += count
    else if (state === 'FAILURE' || state === 'ERROR') failed += count
    else pending += count
  }
  return { passed, failed, pending }
}

function normalizeGraphqlPr(value: Record<string, any>): PrStatus {
  const rollup = value.commits.nodes[0]?.commit.statusCheckRollup ?? null
  return {
    number: value.number,
    title: value.title,
    state:
      value.state === 'MERGED'
        ? 'MERGED'
        : value.state === 'CLOSED'
          ? 'CLOSED'
          : value.isDraft
            ? 'DRAFT'
            : 'OPEN',
    checks: countGraphqlChecks(
      rollup?.contexts?.checkRunCountsByState,
      rollup?.contexts?.statusContextCountsByState,
    ),
    review:
      value.reviewDecision === 'APPROVED' ||
      value.reviewDecision === 'CHANGES_REQUESTED' ||
      value.reviewDecision === 'REVIEW_REQUIRED'
        ? value.reviewDecision
        : null,
    mergeable: ['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(
      value.mergeStateStatus,
    ),
    mergeStateStatus: value.mergeStateStatus,
    additions: value.additions,
    deletions: value.deletions,
  }
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const groups = new Map<string, T[]>()
  for (const value of values) {
    const name = key(value)
    const group = groups.get(name)
    if (group) group.push(value)
    else groups.set(name, [value])
  }
  return groups
}

let rateLimitedUntil = 0
let lastCacheJson = ''

function cachePath(): string {
  return join(getClaudeConfigHomeDir(), 'gh-pr-status-cache.json')
}

async function persistCache(statuses: Map<string, PrStatus | null>) {
  const value: Record<string, PrStatus> = {}
  for (const [url, status] of statuses) if (status) value[url] = status
  const json = JSON.stringify(value)
  if (json === '{}' || json === lastCacheJson) return
  lastCacheJson = json
  const path = cachePath()
  await mkdir(dirname(path), { recursive: true })
  await atomicWriteFile(path, json)
}

export async function readPrStatusCache(): Promise<Map<string, PrStatus>> {
  try {
    return new Map(Object.entries(JSON.parse(await readFile(cachePath(), 'utf8'))))
  } catch {
    return new Map()
  }
}

export async function fetchPrStatuses(urls: string[]): Promise<{
  statuses: Map<string, PrStatus | null>
  rateLimit: { cost: number; remaining: number; resetAt: string } | null
  unbatched: string[]
}> {
  const statuses = new Map<string, PrStatus | null>()
  const unbatched: string[] = []
  let rateLimit: { cost: number; remaining: number; resetAt: string } | null =
    null
  if (!urls.length || Date.now() < rateLimitedUntil) {
    for (const url of urls) statuses.set(url, null)
    return { statuses, rateLimit, unbatched }
  }
  const parsed: ParsedPrUrl[] = []
  for (const url of urls) {
    const value = parsePrUrl(url)
    if (value) parsed.push(value)
    else if (/\/pull\/\d+/.test(url)) unbatched.push(url)
  }
  parsed.sort((left, right) => left.url.localeCompare(right.url))
  for (const [host, hostPrs] of groupBy(parsed, (pr) => pr.host)) {
    for (let offset = 0; offset < hostPrs.length; offset += 40) {
      const chunk = hostPrs.slice(offset, offset + 40)
      const aliases = new Map<string, string>()
      const repositories = [...groupBy(chunk, (pr) => `${pr.owner}/${pr.repo}`)].map(
        ([repository, prs], repoIndex) => {
          const [owner, repo] = repository.split('/')
          const queries = prs
            .map((pr, prIndex) => {
              const alias = `p${repoIndex}_${prIndex}`
              aliases.set(alias, pr.url)
              return `${alias}: pullRequest(number: ${pr.num}) { ...pr }`
            })
            .join(' ')
          return `r${repoIndex}: repository(owner:"${owner}", name:"${repo}") { ${queries} }`
        },
      )
      const query = `${GRAPHQL_FRAGMENT}\nquery { rateLimit{cost remaining resetAt} ${repositories.join(' ')} }`
      const result = await execFileNoThrow(
        'gh',
        [
          'api',
          'graphql',
          '--hostname',
          host,
          '--cache',
          '30s',
          '-F',
          'query=@-',
        ],
        {
          timeout: 10_000,
          input: query,
          stdin: 'pipe',
          preserveOutputOnError: true,
        },
      )
      let response: any = null
      if (result.stdout.trim()) {
        try {
          response = JSON.parse(result.stdout)
        } catch {}
      }
      if (!response?.data) {
        if (/rate limit/i.test(result.stderr) || /rate limit/i.test(result.stdout)) {
          rateLimitedUntil = Date.now() + 60_000
          logForDebugging(
            `[ghPrStatus] GitHub rate-limited on ${host}; backing off 60s`,
            { level: 'warn' },
          )
          for (const pr of chunk) statuses.set(pr.url, null)
        } else {
          logForDebugging(
            `[ghPrStatus] batch query failed on ${host} (exit ${result.code}); falling back per-URL`,
          )
          for (const pr of chunk) unbatched.push(pr.url)
        }
        continue
      }
      if (response.data.rateLimit) {
        rateLimit = response.data.rateLimit
        if (rateLimit && rateLimit.remaining < 50) {
          rateLimitedUntil =
            Date.parse(rateLimit.resetAt) || Date.now() + 60_000
        }
      }
      for (const [repoAlias, repository] of Object.entries(response.data)) {
        if (!repoAlias.startsWith('r') || !repository || typeof repository !== 'object' || 'cost' in repository) continue
        for (const [prAlias, value] of Object.entries(repository)) {
          const url = aliases.get(prAlias)
          if (!url) continue
          statuses.set(
            url,
            value &&
              typeof value === 'object' &&
              'number' in value &&
              typeof value.number === 'number' &&
              'state' in value &&
              typeof value.state === 'string'
              ? normalizeGraphqlPr(value as Record<string, any>)
              : null,
          )
        }
      }
      for (const url of aliases.values()) {
        if (!statuses.has(url)) statuses.set(url, null)
      }
    }
  }
  await persistCache(statuses).catch(() => {})
  return { statuses, rateLimit, unbatched }
}
