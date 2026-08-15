import React from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import { logEvent } from '../../services/analytics/index.js'
import { refreshAndGetAwsCredentials } from '../auth.js'
import { getAWSRegion, isEnvTruthy } from '../envUtils.js'
import { getProxyFetchOptions } from '../proxy.js'
import { logForDebugging } from '../debug.js'
import { getBedrockInferenceProfiles } from './bedrock.js'
import { ALL_MODEL_CONFIGS, type ModelKey } from './configs.js'
import { getMarketingNameForModel } from './model.js'
import { getAPIProvider } from './providers.js'

export type BedrockModelTier = 'sonnet' | 'opus' | 'haiku'

export type BedrockUpgradeCandidate = {
  tier: BedrockModelTier
  envVar: string
  fromKey: ModelKey
  fromMarketingName: string
  toKey: ModelKey
  toMarketingName: string
  toBedrockId: string
}

export type BedrockDefaultFallback = {
  tier: BedrockModelTier
  envVar: string
  defaultKey: ModelKey
  defaultName: string
  fallbackKey: ModelKey
  fallbackName: string
  fallbackBedrockId: string
}

const MODEL_KEYS = Object.keys(ALL_MODEL_CONFIGS) as ModelKey[]
const TIER_CONFIG: Record<
  BedrockModelTier,
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

function tierForKey(key: string): BedrockModelTier | undefined {
  if (key.startsWith('sonnet')) return 'sonnet'
  if (key.startsWith('opus')) return 'opus'
  if (key.startsWith('haiku')) return 'haiku'
  return undefined
}

function normalizeBedrockId(id: string): string {
  const lastSlash = id.lastIndexOf('/')
  const value = lastSlash === -1 ? id : id.slice(lastSlash + 1)
  return value.replace(/^(?:us|eu|apac|global)\./, '')
}

function keyForBedrockId(id: string): ModelKey | undefined {
  const normalized = normalizeBedrockId(id)
  return MODEL_KEYS.find(
    key => normalizeBedrockId(ALL_MODEL_CONFIGS[key].bedrock) === normalized,
  )
}

function findProfile(profiles: string[], firstPartyId: string) {
  return profiles.find(profile => profile.includes(firstPartyId))
}

export function upgradeKey(candidate: {
  fromKey: string
  toKey: string
}): string {
  return `${candidate.fromKey}-to-${candidate.toKey}`
}

/** Source owner for the model-upgrade Bedrock one-token availability probe. */
export async function probeBedrockModelAvailability(
  model: string,
  tier: BedrockModelTier,
): Promise<boolean> {
  try {
    const [{ AnthropicBedrock }] = await Promise.all([
      import('@anthropic-ai/bedrock-sdk'),
    ])
    const base = {
      awsRegion:
        tier === 'haiku' && process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
          ? process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
          : getAWSRegion(),
      maxRetries: 0,
      timeout: 8000,
      fetchOptions: getProxyFetchOptions({ forAnthropicAPI: true }),
    }
    let client
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      client = new AnthropicBedrock({
        ...base,
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
            ...base,
            awsAccessKey: credentials.accessKeyId,
            awsSecretKey: credentials.secretAccessKey,
            awsSessionToken: credentials.sessionToken,
          })
        : new AnthropicBedrock({
            ...base,
            ...(skipAuth && { skipAuth: true }),
          })
    }
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

export async function findBedrockUpgradeCandidates(): Promise<
  BedrockUpgradeCandidate[]
> {
  if (getAPIProvider() !== 'bedrock') return []
  if (isEnvTruthy(process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)) return []
  const stale: Array<{
    tier: BedrockModelTier
    envVar: string
    pinnedRaw: string
    pinnedKey: ModelKey
    defaultKey: ModelKey
  }> = []
  for (const tier of Object.keys(TIER_CONFIG) as BedrockModelTier[]) {
    const config = TIER_CONFIG[tier]
    let envVar: string | undefined
    let raw: string | undefined
    let pinnedKey: ModelKey | undefined
    for (const candidate of config.envVarPriority) {
      const value = process.env[candidate]
      if (!value || value.includes('application-inference-profile')) continue
      const key = keyForBedrockId(value)
      if (!key || tierForKey(key) !== tier || key === config.defaultKey) continue
      envVar = candidate
      raw = value
      pinnedKey = key
      break
    }
    if (!envVar || !raw || !pinnedKey) continue
    if (MODEL_KEYS.indexOf(pinnedKey) >= MODEL_KEYS.indexOf(config.defaultKey)) {
      continue
    }
    stale.push({
      tier,
      envVar,
      pinnedRaw: raw,
      pinnedKey,
      defaultKey: config.defaultKey,
    })
  }
  if (stale.length === 0) return []
  let profiles: string[]
  try {
    profiles = await getBedrockInferenceProfiles()
  } catch {
    return []
  }
  const candidates: BedrockUpgradeCandidate[] = []
  for (const item of stale) {
    const toConfig = ALL_MODEL_CONFIGS[item.defaultKey]
    const toBedrockId = findProfile(profiles, toConfig.firstParty)
    if (!toBedrockId) continue
    const fromMarketingName = getMarketingNameForModel(
      ALL_MODEL_CONFIGS[item.pinnedKey].firstParty,
    )
    const toMarketingName = getMarketingNameForModel(toConfig.firstParty)
    if (!fromMarketingName || !toMarketingName) continue
    candidates.push({
      tier: item.tier,
      envVar: item.envVar,
      fromKey: item.pinnedKey,
      fromMarketingName,
      toKey: item.defaultKey,
      toMarketingName,
      toBedrockId,
    })
  }
  logEvent('tengu_bedrock_upgrade_check', {
    stale_tiers: String(candidates.length),
  })
  const accessible = await Promise.all(
    candidates.map(async candidate => {
      const ok = await probeBedrockModelAvailability(
        candidate.toBedrockId,
        candidate.tier,
      )
      logEvent('tengu_bedrock_probe_result', {
        tier: candidate.tier,
        model_id: candidate.toBedrockId,
        accessible: String(ok),
      })
      return ok ? candidate : null
    }),
  )
  const accessibleCandidates = accessible.filter(
    (candidate): candidate is BedrockUpgradeCandidate => candidate !== null,
  )
  logForDebugging(
    `[bedrock-upgrade] tiersWithPin=${stale.length} candidates=${accessibleCandidates.length}`,
  )
  return accessibleCandidates
}

function previousKey(
  key: ModelKey,
  tier: BedrockModelTier,
): ModelKey | undefined {
  const index = MODEL_KEYS.indexOf(key)
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = MODEL_KEYS[cursor]!
    if (tierForKey(candidate) === tier) return candidate
  }
  return undefined
}

export async function checkBedrockDefaultAvailability(): Promise<
  BedrockDefaultFallback[]
> {
  if (getAPIProvider() !== 'bedrock') return []
  if (isEnvTruthy(process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)) return []
  const unpinned: Array<{
    tier: BedrockModelTier
    envVar: string
    defaultKey: ModelKey
  }> = []
  for (const tier of Object.keys(TIER_CONFIG) as BedrockModelTier[]) {
    const config = TIER_CONFIG[tier]
    if (
      config.envVarPriority.some(name => {
        const value = process.env[name]
        if (!value) return false
        const key = keyForBedrockId(value)
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
  logEvent('tengu_bedrock_default_check', {
    unpinned_tiers: String(unpinned.length),
  })
  let profiles: string[]
  try {
    profiles = await getBedrockInferenceProfiles()
  } catch {
    return []
  }
  const values = await Promise.all(
    unpinned.map(async item => {
      const defaultConfig = ALL_MODEL_CONFIGS[item.defaultKey]
      const defaultId = findProfile(profiles, defaultConfig.firstParty)
      if (!defaultId) return null
      const defaultWorks = await probeBedrockModelAvailability(
        defaultId,
        item.tier,
      )
      logEvent('tengu_bedrock_probe_result', {
        tier: item.tier,
        model_id: defaultId,
        accessible: String(defaultWorks),
      })
      if (defaultWorks) return null
      const fallbackKey = previousKey(item.defaultKey, item.tier)
      if (!fallbackKey) return null
      const fallbackConfig = ALL_MODEL_CONFIGS[fallbackKey]
      const fallbackBedrockId = findProfile(
        profiles,
        fallbackConfig.firstParty,
      )
      if (!fallbackBedrockId) return null
      if (
        !(await probeBedrockModelAvailability(
          fallbackBedrockId,
          item.tier,
        ))
      ) {
        return null
      }
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
        fallbackBedrockId,
      }
    }),
  )
  const fallbacks = values.filter(
    (value): value is BedrockDefaultFallback => value !== null,
  )
  logForDebugging(
    `[bedrock-fallback] unpinnedTiers=${unpinned.length} fallbacks=${fallbacks.length}`,
  )
  return fallbacks
}

export function BedrockModelUpgradeDialog({
  tierLabel,
  fromName,
  toName,
  toBedrockId,
  onDone,
}: {
  tierLabel: string
  fromName: string
  toName: string
  toBedrockId: string
  onDone(accepted: boolean): void
}) {
  return (
    <Dialog
      title={`Newer ${tierLabel} model available`}
      color="permission"
      onCancel={() => onDone(false)}
    >
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            Currently pinned: <Text bold>{fromName}</Text>
          </Text>
          <Text>
            Latest available: <Text bold>{toName}</Text>{' '}
            <Text dimColor>({toBedrockId})</Text>
          </Text>
        </Box>
        <Text>
          Update settings to use {toName}?{' '}
          <Text dimColor>Claude Code will restart to apply.</Text>
        </Text>
        <Select
          defaultValue="yes"
          defaultFocusValue="yes"
          options={[
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ]}
          onChange={value => onDone(value === 'yes')}
          onCancel={() => onDone(false)}
        />
      </Box>
    </Dialog>
  )
}
