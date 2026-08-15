import {
  API_IMAGE_MAX_BASE64_SIZE,
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_WIDTH,
  IMAGE_TARGET_RAW_SIZE,
} from '../constants/apiLimits.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { resolveAntModel } from './model/antModels.js'
import { getCanonicalName, getMainLoopModel } from './model/model.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from './model/providers.js'

export type ImageLimits = {
  maxWidth: number
  maxHeight: number
  maxBase64Size: number
  targetRawSize: number
}

export type ImageLimitOverrides = Partial<ImageLimits>

export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  maxWidth: IMAGE_MAX_WIDTH,
  maxHeight: IMAGE_MAX_HEIGHT,
  maxBase64Size: API_IMAGE_MAX_BASE64_SIZE,
  targetRawSize: IMAGE_TARGET_RAW_SIZE,
}

const FIRST_PARTY_EXTENDED_MAX_BASE64_SIZE = 10 * 1024 * 1024

const MODEL_IMAGE_LIMIT_OVERRIDES: Record<string, ImageLimitOverrides> = {
  'claude-opus-4-7': { maxWidth: 2576, maxHeight: 2576 },
}

function getProviderMaxBase64Size(): number {
  if (
    getAPIProvider() === 'firstParty' &&
    isFirstPartyAnthropicBaseUrl() &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_crimson_vector', false)
  ) {
    return FIRST_PARTY_EXTENDED_MAX_BASE64_SIZE
  }
  return DEFAULT_IMAGE_LIMITS.maxBase64Size
}

/**
 * Resolve the image constraints for a model and provider. Keep this lookup at
 * the edge of each image-processing call so model changes made during a
 * session take effect without restarting the client.
 */
export function getImageLimits(model: string): ImageLimits {
  const providerMaxBase64Size = getProviderMaxBase64Size()
  const override =
    resolveAntModel(model)?.imageLimits ??
    MODEL_IMAGE_LIMIT_OVERRIDES[getCanonicalName(model)]

  if (!override) {
    if (providerMaxBase64Size === DEFAULT_IMAGE_LIMITS.maxBase64Size) {
      return DEFAULT_IMAGE_LIMITS
    }
    return {
      ...DEFAULT_IMAGE_LIMITS,
      maxBase64Size: providerMaxBase64Size,
      targetRawSize: (providerMaxBase64Size * 3) / 4,
    }
  }

  const maxBase64Size = override.maxBase64Size ?? providerMaxBase64Size
  return {
    maxWidth: override.maxWidth ?? DEFAULT_IMAGE_LIMITS.maxWidth,
    maxHeight: override.maxHeight ?? DEFAULT_IMAGE_LIMITS.maxHeight,
    maxBase64Size,
    targetRawSize: override.targetRawSize ?? (maxBase64Size * 3) / 4,
  }
}

export function getCurrentImageLimits(): ImageLimits {
  return getImageLimits(getMainLoopModel())
}
