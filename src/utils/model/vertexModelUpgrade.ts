import { logEvent } from '../../services/analytics/index.js'
import { refreshGcpCredentialsIfNeeded } from '../auth.js'
import { getVertexRegionForModel, isEnvTruthy } from '../envUtils.js'
import { getProxyFetchOptions } from '../proxy.js'
import { ALL_MODEL_CONFIGS, type ModelKey } from './configs.js'
import {
  firstPartyNameToCanonical,
  getMarketingNameForModel,
} from './model.js'
import { getAPIProvider } from './providers.js'
import { logForDebugging } from '../debug.js'

export type VertexModelTier = 'sonnet' | 'opus' | 'haiku'

export type VertexUpgradeCandidate = {
  tier: VertexModelTier
  envVar: string
  pinnedKey: ModelKey
  defaultKey: ModelKey
  fromKey: ModelKey
  fromMarketingName: string
  toKey: ModelKey
  toMarketingName: string
  toVertexId: string
}

export type VertexDefaultFallback = {
  tier: VertexModelTier
  envVar: string
  defaultKey: ModelKey
  defaultName: string
  fallbackKey: ModelKey
  fallbackName: string
  fallbackVertexId: string
}

const MODEL_KEYS = Object.keys(ALL_MODEL_CONFIGS) as ModelKey[]
const TIER_CONFIG: Record<
  VertexModelTier,
  { envVarPriority: string[]; defaultKey: ModelKey }
> = {
  sonnet: {
    envVarPriority: ['ANTHROPIC_DEFAULT_SONNET_MODEL'],
    defaultKey: 'sonnet45',
  },
  opus: {
    envVarPriority: ['ANTHROPIC_DEFAULT_OPUS_MODEL'],
    defaultKey: 'opus46',
  },
  haiku: {
    envVarPriority: [
      'ANTHROPIC_SMALL_FAST_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    ],
    defaultKey: 'haiku45',
  },
}

function tierForKey(key: string): VertexModelTier | undefined {
  if (key.startsWith('sonnet')) return 'sonnet'
  if (key.startsWith('opus')) return 'opus'
  if (key.startsWith('haiku')) return 'haiku'
  return undefined
}

function keyForVertexId(id: string): ModelKey | undefined {
  const canonical = firstPartyNameToCanonical(id)
  return MODEL_KEYS.find(
    key =>
      firstPartyNameToCanonical(ALL_MODEL_CONFIGS[key].firstParty) ===
      canonical,
  )
}

export function vertexUpgradeKey(candidate: {
  fromKey: string
  toKey: string
}): string {
  return `${candidate.fromKey}-to-${candidate.toKey}`
}

export async function findVertexUpgradeCandidates(): Promise<
  VertexUpgradeCandidate[]
> {
  if (getAPIProvider() !== 'vertex') return []
  if (isEnvTruthy(process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)) return []

  const stale: Array<{
    tier: VertexModelTier
    envVar: string
    pinnedKey: ModelKey
    defaultKey: ModelKey
  }> = []
  for (const tier of Object.keys(TIER_CONFIG) as VertexModelTier[]) {
    const config = TIER_CONFIG[tier]
    let envVar: string | undefined
    let pinnedKey: ModelKey | undefined
    for (const candidate of config.envVarPriority) {
      const value = process.env[candidate]
      if (!value) continue
      const key = keyForVertexId(value)
      if (!key || tierForKey(key) !== tier || key === config.defaultKey) {
        continue
      }
      envVar = candidate
      pinnedKey = key
      break
    }
    if (!envVar || !pinnedKey) continue
    if (
      MODEL_KEYS.indexOf(pinnedKey) >=
      MODEL_KEYS.indexOf(config.defaultKey)
    ) {
      continue
    }
    stale.push({
      tier,
      envVar,
      pinnedKey,
      defaultKey: config.defaultKey,
    })
  }
  if (stale.length === 0) return []

  logEvent('tengu_vertex_upgrade_check', {
    stale_tiers: String(stale.length),
  })
  const values = await Promise.all(
    stale.map(async candidate => {
      const toVertexId = ALL_MODEL_CONFIGS[candidate.defaultKey].vertex
      const accessible = await probeVertexModel(toVertexId)
      logEvent('tengu_vertex_probe_result', {
        tier: candidate.tier,
        model_id: toVertexId,
        accessible: String(accessible),
      })
      if (!accessible) return null
      const fromMarketingName = getMarketingNameForModel(
        ALL_MODEL_CONFIGS[candidate.pinnedKey].firstParty,
      )
      const toMarketingName = getMarketingNameForModel(
        ALL_MODEL_CONFIGS[candidate.defaultKey].firstParty,
      )
      if (!fromMarketingName || !toMarketingName) return null
      return {
        ...candidate,
        fromKey: candidate.pinnedKey,
        fromMarketingName,
        toKey: candidate.defaultKey,
        toMarketingName,
        toVertexId,
      }
    }),
  )
  const candidates = values.filter(
    (candidate): candidate is VertexUpgradeCandidate => candidate !== null,
  )
  logForDebugging(
    `[vertex-upgrade] tiersWithPin=${stale.length} candidates=${candidates.length}`,
  )
  return candidates
}

function previousKey(
  key: ModelKey,
  tier: VertexModelTier,
): ModelKey | undefined {
  const index = MODEL_KEYS.indexOf(key)
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = MODEL_KEYS[cursor]!
    if (tierForKey(candidate) === tier) return candidate
  }
  return undefined
}

export async function checkVertexDefaultAvailability(): Promise<
  VertexDefaultFallback[]
> {
  if (getAPIProvider() !== 'vertex') return []
  if (isEnvTruthy(process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)) return []

  const unpinned: Array<{
    tier: VertexModelTier
    envVar: string
    defaultKey: ModelKey
  }> = []
  for (const tier of Object.keys(TIER_CONFIG) as VertexModelTier[]) {
    const config = TIER_CONFIG[tier]
    if (
      config.envVarPriority.some(name => {
        const value = process.env[name]
        if (!value) return false
        const key = keyForVertexId(value)
        if (!key) return true
        return tierForKey(key) === tier
      })
    ) {
      continue
    }
    unpinned.push({
      tier,
      envVar: config.envVarPriority.at(-1)!,
      defaultKey: config.defaultKey,
    })
  }
  if (unpinned.length === 0) return []

  logEvent('tengu_vertex_default_check', {
    unpinned_tiers: String(unpinned.length),
  })
  const values = await Promise.all(
    unpinned.map(async item => {
      const defaultConfig = ALL_MODEL_CONFIGS[item.defaultKey]
      const defaultWorks = await probeVertexModel(defaultConfig.vertex)
      logEvent('tengu_vertex_probe_result', {
        tier: item.tier,
        model_id: defaultConfig.vertex,
        accessible: String(defaultWorks),
      })
      if (defaultWorks) return null
      const fallbackKey = previousKey(item.defaultKey, item.tier)
      if (!fallbackKey) return null
      const fallbackConfig = ALL_MODEL_CONFIGS[fallbackKey]
      if (!(await probeVertexModel(fallbackConfig.vertex))) return null
      const defaultName = getMarketingNameForModel(defaultConfig.firstParty)
      const fallbackName = getMarketingNameForModel(
        fallbackConfig.firstParty,
      )
      if (!defaultName || !fallbackName) return null
      return {
        ...item,
        defaultName,
        fallbackKey,
        fallbackName,
        fallbackVertexId: fallbackConfig.vertex,
      }
    }),
  )
  const fallbacks = values.filter(
    (value): value is VertexDefaultFallback => value !== null,
  )
  logForDebugging(
    `[vertex-fallback] unpinnedTiers=${unpinned.length} fallbacks=${fallbacks.length}`,
  )
  return fallbacks
}

export async function probeVertexModel(model: string): Promise<boolean> {
  try {
    const [{ AnthropicVertex }, { GoogleAuth }] = await Promise.all([
      import('@anthropic-ai/vertex-sdk'),
      import('google-auth-library'),
    ])
    const skipAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)
    if (!skipAuth) await refreshGcpCredentialsIfNeeded()

    const projectEnvironment =
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.gcloud_project ||
      process.env.google_cloud_project
    const credentialFile =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.google_application_credentials
    const fallbackProject =
      projectEnvironment || credentialFile
        ? undefined
        : process.env.ANTHROPIC_VERTEX_PROJECT_ID
    const googleAuth = skipAuth
      ? ({
          getClient: () => ({ getRequestHeaders: () => ({}) }),
        } as unknown as InstanceType<typeof GoogleAuth>)
      : new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          ...(fallbackProject ? { projectId: fallbackProject } : {}),
        })

    const client = new AnthropicVertex({
      region: getVertexRegionForModel(model),
      googleAuth,
      maxRetries: 0,
      timeout: 8000,
      fetchOptions: getProxyFetchOptions(),
    })
    await client.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    })
    return true
  } catch (error) {
    if ((error as { status?: number })?.status === 429) return true
    return false
  }
}
