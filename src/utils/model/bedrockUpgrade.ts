import type { APIError } from '@anthropic-ai/sdk'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import {
  refreshAndGetAwsCredentials,
} from '../auth.js'
import { logForDebugging } from '../debug.js'
import { getAWSRegion, isEnvTruthy } from '../envUtils.js'
import { findFirstMatch, getBedrockInferenceProfiles } from './bedrock.js'
import {
  ALL_MODEL_CONFIGS,
  type ModelKey,
} from './configs.js'
import {
  firstPartyNameToCanonical,
  getMarketingNameForModel,
} from './model.js'
import { getAPIProvider } from './providers.js'

export type ModelTier = 'sonnet' | 'opus' | 'haiku'

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

export type BedrockUpgradeCandidate = {
  tier: ModelTier
  envVar: string
  fromKey: ModelKey
  fromMarketingName: string
  toKey: ModelKey
  toMarketingName: string
  toBedrockId: string
}

export type BedrockFallbackCandidate = {
  tier: ModelTier
  envVar: string
  defaultKey: ModelKey
  defaultName: string
  fallbackKey: ModelKey
  fallbackName: string
  fallbackBedrockId: string
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

export function upgradeKey(candidate: {
  fromKey: ModelKey
  toKey: ModelKey
}): string {
  return `${candidate.fromKey}-to-${candidate.toKey}`
}

export async function findBedrockUpgradeCandidates(): Promise<
  BedrockUpgradeCandidate[]
> {
  if (getAPIProvider() !== 'bedrock') return []
  if (isEnvTruthy(process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)) return []

  const pinnedTiers: Array<{
    tier: ModelTier
    envVar: string
    pinnedRaw: string
    pinnedKey: ModelKey
    defaultKey: ModelKey
  }> = []

  for (const tier of Object.keys(TIER_CONFIGS) as ModelTier[]) {
    const config = TIER_CONFIGS[tier]
    let envVar: string | undefined
    let pinnedRaw: string | undefined
    let pinnedKey: ModelKey | undefined

    for (const candidateEnvVar of config.envVarPriority) {
      const candidateValue = process.env[candidateEnvVar]
      if (!candidateValue) continue
      if (candidateValue.includes('application-inference-profile')) continue

      const candidateKey = modelKeyForProviderId(candidateValue)
      if (
        !candidateKey ||
        tierForKey(candidateKey) !== tier ||
        candidateKey === config.defaultKey
      ) {
        continue
      }

      envVar = candidateEnvVar
      pinnedRaw = candidateValue
      pinnedKey = candidateKey
      break
    }

    if (!envVar || !pinnedRaw || !pinnedKey) continue

    const pinnedIndex = MODEL_KEYS.indexOf(pinnedKey)
    const defaultIndex = MODEL_KEYS.indexOf(config.defaultKey)
    if (pinnedIndex >= defaultIndex) continue

    pinnedTiers.push({
      tier,
      envVar,
      pinnedRaw,
      pinnedKey,
      defaultKey: config.defaultKey,
    })
  }

  if (pinnedTiers.length === 0) return []

  let profiles: string[]
  try {
    profiles = await getBedrockInferenceProfiles()
  } catch {
    return []
  }

  const candidates: BedrockUpgradeCandidate[] = []
  for (const pinned of pinnedTiers) {
    const targetFirstParty = ALL_MODEL_CONFIGS[pinned.defaultKey].firstParty
    const targetBedrockId = findFirstMatch(profiles, targetFirstParty)
    if (!targetBedrockId) continue

    const fromMarketingName = getMarketingNameForModel(
      ALL_MODEL_CONFIGS[pinned.pinnedKey].firstParty,
    )
    const toMarketingName = getMarketingNameForModel(targetFirstParty)
    if (!fromMarketingName || !toMarketingName) continue

    candidates.push({
      tier: pinned.tier,
      envVar: pinned.envVar,
      fromKey: pinned.pinnedKey,
      fromMarketingName,
      toKey: pinned.defaultKey,
      toMarketingName,
      toBedrockId: targetBedrockId,
    })
  }

  logEvent('tengu_bedrock_upgrade_check', {
    stale_tiers: String(
      candidates.length,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  const accessibleCandidates = (
    await Promise.all(
      candidates.map(async candidate => {
        const accessible = await probeBedrockModel(
          candidate.toBedrockId,
          candidate.tier,
        )
        logEvent('tengu_bedrock_probe_result', {
          tier:
            candidate.tier as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          model_id:
            candidate.toBedrockId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          accessible: String(
            accessible,
          ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return accessible ? candidate : null
      }),
    )
  ).filter((candidate): candidate is BedrockUpgradeCandidate => candidate !== null)

  logForDebugging(
    `[bedrock-upgrade] tiersWithPin=${pinnedTiers.length} candidates=${accessibleCandidates.length}`,
  )
  return accessibleCandidates
}

export async function checkBedrockDefaultAvailability(): Promise<
  BedrockFallbackCandidate[]
> {
  if (getAPIProvider() !== 'bedrock') return []
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

  logEvent('tengu_bedrock_default_check', {
    unpinned_tiers: String(
      unpinnedTiers.length,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  let profiles: string[]
  try {
    profiles = await getBedrockInferenceProfiles()
  } catch {
    return []
  }

  const checked = await Promise.all(
    unpinnedTiers.map(async candidate => {
      const defaultConfig = ALL_MODEL_CONFIGS[candidate.defaultKey]
      const defaultBedrockId = findFirstMatch(
        profiles,
        defaultConfig.firstParty,
      )
      if (!defaultBedrockId) return null

      const defaultAccessible = await probeBedrockModel(
        defaultBedrockId,
        candidate.tier,
      )
      logEvent('tengu_bedrock_probe_result', {
        tier:
          candidate.tier as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        model_id:
          defaultBedrockId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
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
      const fallbackBedrockId = findFirstMatch(
        profiles,
        fallbackConfig.firstParty,
      )
      if (!fallbackBedrockId) return null
      if (!(await probeBedrockModel(fallbackBedrockId, candidate.tier))) {
        return null
      }

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
        fallbackBedrockId,
      } satisfies BedrockFallbackCandidate
    }),
  )

  const fallbacks = checked.filter(
    (candidate): candidate is BedrockFallbackCandidate => candidate !== null,
  )
  logForDebugging(
    `[bedrock-fallback] unpinnedTiers=${unpinnedTiers.length} fallbacks=${fallbacks.length}`,
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

export async function probeBedrockModel(
  modelId: string,
  tier: ModelTier,
): Promise<boolean> {
  try {
    const [{ AnthropicBedrock }, { getProxyFetchOptions: getFetchOptions }] =
      await Promise.all([
        import('@anthropic-ai/bedrock-sdk'),
        import('../proxy.js'),
      ])

    const baseOptions = {
      awsRegion:
        tier === 'haiku' && process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
          ? process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
          : getAWSRegion(),
      maxRetries: 0,
      timeout: 8_000,
      fetchOptions: getFetchOptions(),
    }

    let client: InstanceType<typeof AnthropicBedrock>
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      client = new AnthropicBedrock({
        ...baseOptions,
        apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
      })
    } else {
      const skipAuth = isEnvTruthy(
        process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH,
      )
      const credentials = skipAuth
        ? null
        : await refreshAndGetAwsCredentials()
      client = credentials
        ? new AnthropicBedrock({
            ...baseOptions,
            awsAccessKey: credentials.accessKeyId,
            awsSecretKey: credentials.secretAccessKey,
            awsSessionToken: credentials.sessionToken,
          })
        : new AnthropicBedrock({
            ...baseOptions,
            ...(skipAuth && { skipAuth: true }),
          })
    }

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
