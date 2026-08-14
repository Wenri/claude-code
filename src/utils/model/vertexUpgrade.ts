import type { APIError } from '@anthropic-ai/sdk'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { refreshGcpCredentialsIfNeeded } from '../auth.js'
import { logForDebugging } from '../debug.js'
import {
  getVertexRegionForModel,
  isEnvTruthy,
} from '../envUtils.js'
import {
  ALL_MODEL_CONFIGS,
  type ModelKey,
} from './configs.js'
import {
  firstPartyNameToCanonical,
  getMarketingNameForModel,
} from './model.js'
import { getAPIProvider } from './providers.js'
import type { ModelTier } from './bedrockUpgrade.js'
import {
  buildVertexGoogleAuth,
  getVertexApiBaseUrl,
} from '../../services/api/vertexAuth.js'

type TierConfig = {
  envVarPriority: readonly string[]
  defaultKey: ModelKey
}

const MODEL_KEYS = Object.keys(ALL_MODEL_CONFIGS) as ModelKey[]

const TIER_CONFIGS: Record<ModelTier, TierConfig> = {
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

export type VertexUpgradeCandidate = {
  tier: ModelTier
  envVar: string
  fromKey: ModelKey
  fromMarketingName: string
  toKey: ModelKey
  toMarketingName: string
  toVertexId: string
}

export type VertexFallbackCandidate = {
  tier: ModelTier
  envVar: string
  defaultKey: ModelKey
  defaultName: string
  fallbackKey: ModelKey
  fallbackName: string
  fallbackVertexId: string
}

function tierForKey(key: ModelKey): ModelTier | undefined {
  if (key.startsWith('sonnet')) return 'sonnet'
  if (key.startsWith('opus')) return 'opus'
  if (key.startsWith('haiku')) return 'haiku'
  return undefined
}

function modelKeyForProviderId(modelId: string): ModelKey | undefined {
  const canonical = firstPartyNameToCanonical(modelId)
  for (const key of MODEL_KEYS) {
    if (
      firstPartyNameToCanonical(ALL_MODEL_CONFIGS[key].firstParty) === canonical
    ) {
      return key
    }
  }
  return undefined
}

export function vertexUpgradeKey(candidate: {
  fromKey: ModelKey
  toKey: ModelKey
}): string {
  return `${candidate.fromKey}-to-${candidate.toKey}`
}

export async function findVertexUpgradeCandidates(): Promise<
  VertexUpgradeCandidate[]
> {
  if (getAPIProvider() !== 'vertex') return []
  if (isEnvTruthy(process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)) return []

  const pinnedTiers: Array<{
    tier: ModelTier
    envVar: string
    pinnedKey: ModelKey
    defaultKey: ModelKey
  }> = []

  for (const tier of Object.keys(TIER_CONFIGS) as ModelTier[]) {
    const config = TIER_CONFIGS[tier]
    let envVar: string | undefined
    let pinnedKey: ModelKey | undefined

    for (const candidateEnvVar of config.envVarPriority) {
      const candidateValue = process.env[candidateEnvVar]
      if (!candidateValue) continue
      const candidateKey = modelKeyForProviderId(candidateValue)
      if (
        !candidateKey ||
        tierForKey(candidateKey) !== tier ||
        candidateKey === config.defaultKey
      ) {
        continue
      }
      envVar = candidateEnvVar
      pinnedKey = candidateKey
      break
    }

    if (!envVar || !pinnedKey) continue
    const pinnedIndex = MODEL_KEYS.indexOf(pinnedKey)
    const defaultIndex = MODEL_KEYS.indexOf(config.defaultKey)
    if (pinnedIndex >= defaultIndex) continue

    pinnedTiers.push({
      tier,
      envVar,
      pinnedKey,
      defaultKey: config.defaultKey,
    })
  }

  if (pinnedTiers.length === 0) return []

  logEvent('tengu_vertex_upgrade_check', {
    stale_tiers: String(
      pinnedTiers.length,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  const candidates = (
    await Promise.all(
      pinnedTiers.map(async pinned => {
        const toVertexId = ALL_MODEL_CONFIGS[pinned.defaultKey].vertex
        const accessible = await probeVertexModel(toVertexId)
        logEvent('tengu_vertex_probe_result', {
          tier:
            pinned.tier as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          model_id:
            toVertexId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          accessible: String(
            accessible,
          ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        if (!accessible) return null

        const fromMarketingName = getMarketingNameForModel(
          ALL_MODEL_CONFIGS[pinned.pinnedKey].firstParty,
        )
        const toMarketingName = getMarketingNameForModel(
          ALL_MODEL_CONFIGS[pinned.defaultKey].firstParty,
        )
        if (!fromMarketingName || !toMarketingName) return null

        return {
          tier: pinned.tier,
          envVar: pinned.envVar,
          fromKey: pinned.pinnedKey,
          fromMarketingName,
          toKey: pinned.defaultKey,
          toMarketingName,
          toVertexId,
        } satisfies VertexUpgradeCandidate
      }),
    )
  ).filter((candidate): candidate is VertexUpgradeCandidate => candidate !== null)

  logForDebugging(
    `[vertex-upgrade] tiersWithPin=${pinnedTiers.length} candidates=${candidates.length}`,
  )
  return candidates
}

export async function checkVertexDefaultAvailability(): Promise<
  VertexFallbackCandidate[]
> {
  if (getAPIProvider() !== 'vertex') return []
  if (isEnvTruthy(process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)) return []

  const unpinnedTiers: Array<{
    tier: ModelTier
    envVar: string
    defaultKey: ModelKey
  }> = []

  for (const tier of Object.keys(TIER_CONFIGS) as ModelTier[]) {
    const config = TIER_CONFIGS[tier]
    const pinned = config.envVarPriority.some(envVar => {
      const value = process.env[envVar]
      if (!value) return false
      const key = modelKeyForProviderId(value)
      if (!key) return true
      return tierForKey(key) === tier
    })
    if (pinned) continue

    unpinnedTiers.push({
      tier,
      envVar: config.envVarPriority.at(-1)!,
      defaultKey: config.defaultKey,
    })
  }

  if (unpinnedTiers.length === 0) return []

  logEvent('tengu_vertex_default_check', {
    unpinned_tiers: String(
      unpinnedTiers.length,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  const checked = await Promise.all(
    unpinnedTiers.map(async candidate => {
      const defaultConfig = ALL_MODEL_CONFIGS[candidate.defaultKey]
      const defaultAccessible = await probeVertexModel(defaultConfig.vertex)
      logEvent('tengu_vertex_probe_result', {
        tier:
          candidate.tier as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        model_id:
          defaultConfig.vertex as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        accessible: String(
          defaultAccessible,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      if (defaultAccessible) return null

      const fallbackKey = previousKeyForTier(
        candidate.defaultKey,
        candidate.tier,
      )
      if (!fallbackKey) return null
      const fallbackConfig = ALL_MODEL_CONFIGS[fallbackKey]
      if (!(await probeVertexModel(fallbackConfig.vertex))) return null

      const defaultName = getMarketingNameForModel(defaultConfig.firstParty)
      const fallbackName = getMarketingNameForModel(fallbackConfig.firstParty)
      if (!defaultName || !fallbackName) return null

      return {
        tier: candidate.tier,
        envVar: candidate.envVar,
        defaultKey: candidate.defaultKey,
        defaultName,
        fallbackKey,
        fallbackName,
        fallbackVertexId: fallbackConfig.vertex,
      } satisfies VertexFallbackCandidate
    }),
  )

  const fallbacks = checked.filter(
    (candidate): candidate is VertexFallbackCandidate => candidate !== null,
  )
  logForDebugging(
    `[vertex-fallback] unpinnedTiers=${unpinnedTiers.length} fallbacks=${fallbacks.length}`,
  )
  return fallbacks
}

function previousKeyForTier(
  currentKey: ModelKey,
  tier: ModelTier,
): ModelKey | undefined {
  const currentIndex = MODEL_KEYS.indexOf(currentKey)
  for (let index = currentIndex - 1; index >= 0; index--) {
    const key = MODEL_KEYS[index]!
    if (tierForKey(key) === tier) return key
  }
  return undefined
}

export async function probeVertexModel(modelId: string): Promise<boolean> {
  try {
    const [{ AnthropicVertex }, { getProxyFetchOptions }] = await Promise.all([
      import('@anthropic-ai/vertex-sdk'),
      import('../proxy.js'),
    ])

    const skipAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)
    if (!skipAuth) await refreshGcpCredentialsIfNeeded()

    const hasProjectEnv =
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.gcloud_project ||
      process.env.google_cloud_project
    const hasCredentialsEnv =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.google_application_credentials
    const fallbackProjectId =
      hasProjectEnv || hasCredentialsEnv
        ? undefined
        : process.env.ANTHROPIC_VERTEX_PROJECT_ID
    const googleAuth = await buildVertexGoogleAuth(
      skipAuth ? { kind: 'skip' } : { kind: 'default' },
      fallbackProjectId,
    )
    const region = getVertexRegionForModel(modelId)

    const client = new AnthropicVertex({
      region,
      googleAuth,
      maxRetries: 0,
      timeout: 8_000,
      fetchOptions: getProxyFetchOptions({
        url:
          process.env.ANTHROPIC_VERTEX_BASE_URL ||
          getVertexApiBaseUrl(region),
      }),
    })
    await client.messages.create({
      model: modelId,
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    })
    return true
  } catch (error) {
    if ((error as APIError | undefined)?.status === 429) return true
    return false
  }
}
