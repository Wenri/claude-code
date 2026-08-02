import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isEnvTruthy } from '../envUtils.js'
import { ALL_MODEL_CONFIGS, type ModelConfig } from './configs.js'

export type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'anthropicAws'
  | 'mantle'

export function getAPIProvider(): APIProvider {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
      ? 'foundry'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_ANTHROPIC_AWS)
        ? 'anthropicAws'
        : isEnvTruthy(process.env.CLAUDE_CODE_USE_MANTLE)
          ? 'mantle'
          : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
            ? 'vertex'
            : 'firstParty'
}

export function getSecondaryAPIProvider(): APIProvider | null {
  if (
    getAPIProvider() === 'bedrock' &&
    isEnvTruthy(process.env.CLAUDE_CODE_USE_MANTLE)
  ) {
    return 'mantle'
  }
  return null
}

export function isMantleModelId(model: string): boolean {
  return (
    model.startsWith('anthropic.') && !/-v\d+(?::\d+)?$/.test(model)
  )
}

function findModelConfig(model: string): ModelConfig | undefined {
  return Object.values(ALL_MODEL_CONFIGS).find(config =>
    Object.values(config).some(modelId => modelId === model),
  )
}

export function getAPIProviderForModel(model?: string): APIProvider {
  const primaryProvider = getAPIProvider()
  if (!model) return primaryProvider

  const secondaryProvider = getSecondaryAPIProvider()
  if (!secondaryProvider) return primaryProvider

  if (secondaryProvider === 'mantle' && isMantleModelId(model)) {
    return secondaryProvider
  }

  const config = findModelConfig(model)
  if (
    config &&
    config[primaryProvider] === null &&
    config[secondaryProvider] !== null
  ) {
    return secondaryProvider
  }
  return primaryProvider
}

export function isFirstPartyCompatibleAPIProvider(
  provider: APIProvider = getAPIProvider(),
): boolean {
  return (
    provider === 'firstParty' ||
    provider === 'anthropicAws' ||
    provider === 'foundry' ||
    provider === 'mantle'
  )
}

export function isDirectAnthropicAPIProvider(
  provider: APIProvider = getAPIProvider(),
): boolean {
  return provider === 'firstParty' || provider === 'anthropicAws'
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
