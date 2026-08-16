import { readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import isEqual from 'lodash-es/isEqual.js'
import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import { z } from 'zod/v4'
import { getAnthropicApiKey } from '../auth.js'
import { logForDebugging } from '../debug.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import { safeParseJSON } from '../json.js'
import { lazySchema } from '../lazySchema.js'
import { isEssentialTrafficOnly } from '../privacyLevel.js'
import { getProxyFetchOptions } from '../proxy.js'
import { jsonStringify } from '../slowOperations.js'
import { getClaudeCodeUserAgent } from '../userAgent.js'
import type { ModelOption } from './modelOptions.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from './providers.js'

const GATEWAY_DISCOVERY_TIMEOUT_MS = 3000

const GatewayModelSchema = lazySchema(() =>
  z
    .object({
      id: z.string(),
      display_name: z.string().optional(),
    })
    .strip(),
)

const GatewayModelCacheSchema = lazySchema(() =>
  z.object({
    baseUrl: z.string(),
    fetchedAt: z.number(),
    models: z.array(GatewayModelSchema()),
  }),
)

type GatewayModelCache = z.infer<
  ReturnType<typeof GatewayModelCacheSchema>
>

function isGatewayDiscoveryEligible(): boolean {
  if (getAPIProvider() !== 'firstParty') return false
  if (isFirstPartyAnthropicBaseUrl()) return false
  if (!process.env.ANTHROPIC_BASE_URL) return false
  return true
}

function getCacheDir(): string {
  return join(getClaudeConfigHomeDir(), 'cache')
}

function getCachePath(): string {
  return join(getCacheDir(), 'gateway-models.json')
}

// Keyed on cache path so tests that set CLAUDE_CONFIG_DIR get a fresh read.
const loadCache = memoize(
  (path: string): GatewayModelCache | null => {
    try {
      // eslint-disable-next-line custom-rules/no-sync-fs -- memoized; model options are synchronous
      const raw = readFileSync(path, 'utf-8')
      const parsed = GatewayModelCacheSchema().safeParse(
        safeParseJSON(raw, false),
      )
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  },
  path => path,
)

export function getGatewayModelOptions(): ModelOption[] {
  if (!isGatewayDiscoveryEligible()) return []
  const cached = loadCache(getCachePath())
  if (
    !cached ||
    cached.baseUrl !== process.env.ANTHROPIC_BASE_URL
  ) {
    return []
  }
  return cached.models.map(model => ({
    value: model.id,
    label: model.display_name || model.id,
    description: 'From gateway',
  }))
}

export async function refreshGatewayModels(): Promise<void> {
  if (!isGatewayDiscoveryEligible()) return
  if (isEssentialTrafficOnly()) return

  try {
    const baseUrl = process.env.ANTHROPIC_BASE_URL
    if (!baseUrl) return

    const authToken = process.env.ANTHROPIC_AUTH_TOKEN
    const apiKey = getAnthropicApiKey()
    if (!authToken && !apiKey) return

    const customHeaders: Record<string, string> = {}
    for (const line of (
      process.env.ANTHROPIC_CUSTOM_HEADERS ?? ''
    ).split(/\r?\n/)) {
      const separator = line.indexOf(':')
      if (separator <= 0) continue
      const name = line.slice(0, separator).trim()
      const value = line.slice(separator + 1).trim()
      if (name && value) customHeaders[name] = value
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/v1/models?limit=1000`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...(authToken
          ? { Authorization: `Bearer ${authToken}` }
          : apiKey
            ? { 'x-api-key': apiKey }
            : {}),
        'anthropic-version': '2023-06-01',
        'User-Agent': getClaudeCodeUserAgent(),
        ...customHeaders,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(GATEWAY_DISCOVERY_TIMEOUT_MS),
      ...getProxyFetchOptions({ url }),
    })
    if (!response.ok) {
      logForDebugging(
        `[gatewayDiscovery] non-OK status ${response.status}`,
      )
      return
    }

    const body = await response.json()
    const parsed = z
      .object({ data: z.array(GatewayModelSchema()) })
      .safeParse(body)
    if (!parsed.success) {
      logForDebugging(
        '[gatewayDiscovery] response body failed validation',
      )
      return
    }

    const models = parsed.data.data.filter(model =>
      /^(claude|anthropic)/i.test(model.id),
    )
    if (models.length === 0) {
      logForDebugging(
        '[gatewayDiscovery] 0 usable models after filter',
      )
      return
    }

    const cachePath = getCachePath()
    const cached = loadCache(cachePath)
    if (
      cached &&
      cached.baseUrl === baseUrl &&
      isEqual(cached.models, models)
    ) {
      return
    }

    await mkdir(getCacheDir(), { recursive: true })
    await writeFile(
      cachePath,
      jsonStringify({ baseUrl, fetchedAt: Date.now(), models }),
      { encoding: 'utf-8', mode: 0o600 },
    )
    loadCache.cache.delete(cachePath)
    logForDebugging(
      `[gatewayDiscovery] cached ${models.length} models`,
    )
  } catch (error) {
    logForDebugging(
      `[gatewayDiscovery] fetch failed: ${error instanceof Error ? error.message : 'unknown'}`,
    )
  }
}
