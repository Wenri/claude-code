import axios from 'axios'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'

type RegistryServer = {
  server?: {
    remotes?: Array<{ url: string }>
  }
}

type LegacyRegistryResponse = {
  servers?: RegistryServer[]
  metadata?: { nextCursor?: string }
}

type DirectoryServer = {
  type?: string
  remote?: { url?: string }
}

type DirectoryResponse = {
  servers?: DirectoryServer[]
  next_cursor?: string | null
}

// URLs stripped of query string and trailing slash — matches the normalization
// done by getLoggingSafeMcpBaseUrl so direct Set.has() lookup works.
const officialRegistryState: { urls: Set<string> | undefined } = {
  urls: undefined,
}

const DEFAULT_DIRECTORY_VISIBILITY = [
  'commercial',
  'gsuite',
  'enterprise',
  'health',
]
const MAX_DIRECTORY_PAGES = 20

function normalizeUrl(url: string): string | undefined {
  try {
    const u = new URL(url)
    u.search = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

function getDirectoryVisibility(): string[] {
  const configured = getFeatureValue_CACHED_MAY_BE_STALE<unknown>(
    'tengu_mcp_directory_visibility',
    DEFAULT_DIRECTORY_VISIBILITY,
  )
  return Array.isArray(configured) &&
    configured.every(value => typeof value === 'string')
    ? configured.filter(value => value.length > 0)
    : DEFAULT_DIRECTORY_VISIBILITY
}

async function fetchLegacyRegistryUrls(
  visibility: string[],
): Promise<Set<string>> {
  const urls = new Set<string>()
  const visibilityParam = visibility.join(',')
  let cursor: string | undefined

  for (let page = 0; page < MAX_DIRECTORY_PAGES; page++) {
    const params = new URLSearchParams({
      version: 'latest',
      limit: '100',
      visibility: visibilityParam,
    })
    if (cursor) params.set('cursor', cursor)
    const response = await axios.get<LegacyRegistryResponse>(
      `https://api.anthropic.com/mcp-registry/v0/servers?${params}`,
      { timeout: 5000 },
    )
    for (const entry of response.data.servers ?? []) {
      for (const remote of entry.server?.remotes ?? []) {
        const normalized = normalizeUrl(remote.url)
        if (normalized) urls.add(normalized)
      }
    }
    cursor = response.data.metadata?.nextCursor
    if (!cursor) break
  }

  return urls
}

async function fetchDirectoryBffUrls(
  visibility: string[],
): Promise<Set<string>> {
  const urls = new Set<string>()
  const visibilityParam = visibility.join(',')
  let cursor: string | undefined

  for (let page = 0; page < MAX_DIRECTORY_PAGES; page++) {
    const params = new URLSearchParams({
      limit: '500',
      visibility: visibilityParam,
    })
    if (cursor) params.set('cursor', cursor)
    const response = await axios.get<DirectoryResponse>(
      `https://api.anthropic.com/api/directory/servers?${params}`,
      { timeout: 5000 },
    )
    for (const server of response.data.servers ?? []) {
      if (server.type !== 'remote') continue
      const remoteUrl = server.remote?.url
      if (!remoteUrl) continue
      const normalized = normalizeUrl(remoteUrl)
      if (normalized) urls.add(normalized)
    }
    cursor = response.data.next_cursor ?? undefined
    if (!cursor) break
  }

  return urls
}

/**
 * Fire-and-forget fetch of the official MCP registry.
 * Populates officialUrls for isOfficialMcpUrl lookups.
 */
export async function prefetchOfficialMcpUrls(): Promise<void> {
  if (isEssentialTrafficOnly()) return

  const useDirectoryBff = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_mcp_directory_bff',
    false,
  )
  const source = useDirectoryBff ? 'bff' : 'legacy'
  const visibility = getDirectoryVisibility()
  if (visibility.length === 0) {
    officialRegistryState.urls = new Set()
    logEvent('tengu_mcp_registry_fetch', {
      source:
        source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      success: true,
      url_count: 0,
      duration_ms: 0,
      empty_visibility: true,
    })
    return
  }

  const startedAt = Date.now()
  try {
    const urls = useDirectoryBff
      ? await fetchDirectoryBffUrls(visibility)
      : await fetchLegacyRegistryUrls(visibility)
    officialRegistryState.urls = urls
    logForDebugging(
      `[mcp-registry] Loaded ${urls.size} official MCP URLs (${source})`,
    )
    logEvent('tengu_mcp_registry_fetch', {
      source:
        source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      success: true,
      url_count: urls.size,
      duration_ms: Date.now() - startedAt,
    })
  } catch (error) {
    logForDebugging(`Failed to fetch MCP registry: ${errorMessage(error)}`, {
      level: 'error',
    })
    logEvent('tengu_mcp_registry_fetch', {
      source:
        source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      success: false,
      url_count: 0,
      duration_ms: Date.now() - startedAt,
    })
  }
}

/**
 * Returns true iff the given (already-normalized via getLoggingSafeMcpBaseUrl)
 * URL is in the official MCP registry. Undefined registry → false (fail-closed).
 */
export function isOfficialMcpUrl(normalizedUrl: string): boolean {
  return officialRegistryState.urls?.has(normalizedUrl) ?? false
}

export function resetOfficialMcpUrlsForTesting(): void {
  officialRegistryState.urls = undefined
}
