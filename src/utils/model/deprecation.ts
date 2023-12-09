/**
 * Model deprecation utilities
 *
 * Contains information about deprecated models and their retirement dates.
 */

import { getCanonicalName, isLegacyModelRemapEnabled } from './model.js'
import { type APIProvider, getAPIProvider } from './providers.js'

type DeprecatedModelInfo = {
  isDeprecated: true
  modelName: string
  retirementDate: string | null
  remappedTo: string | null
}

type NotDeprecatedInfo = {
  isDeprecated: false
}

type DeprecationInfo = DeprecatedModelInfo | NotDeprecatedInfo

type DeprecationEntry = {
  /** Human-readable model name */
  modelName: string
  /** Retirement dates by provider (null = not deprecated for that provider) */
  retirementDates: Record<APIProvider, string | null>
  /** Replacement description when the model is transparently remapped. */
  remappedTo?: string
}

/**
 * Deprecated models and their retirement dates by provider.
 * Keys are canonical model IDs and are matched exactly.
 */
const DEPRECATED_MODELS: Record<string, DeprecationEntry> = {
  'claude-opus-4-1': {
    modelName: 'Claude Opus 4.1',
    retirementDates: {
      firstParty: null,
      bedrock: null,
      vertex: null,
      foundry: null,
      anthropicAws: null,
      mantle: null,
    },
    remappedTo: 'the latest Opus',
  },
  'claude-opus-4-0': {
    modelName: 'Claude Opus 4',
    retirementDates: {
      firstParty: 'June 15, 2026',
      bedrock: 'May 31, 2026',
      vertex: 'September 14, 2026',
      foundry: null,
      anthropicAws: null,
      mantle: null,
    },
    remappedTo: 'the latest Opus',
  },
  'claude-sonnet-4-0': {
    modelName: 'Claude Sonnet 4',
    retirementDates: {
      firstParty: 'June 15, 2026',
      bedrock: 'October 14, 2026',
      vertex: 'September 14, 2026',
      foundry: null,
      anthropicAws: null,
      mantle: null,
    },
  },
  'claude-3-opus': {
    modelName: 'Claude 3 Opus',
    retirementDates: {
      firstParty: 'January 5, 2026',
      bedrock: 'January 15, 2026',
      vertex: 'January 5, 2026',
      foundry: 'January 5, 2026',
      anthropicAws: null,
      mantle: null,
    },
  },
  'claude-3-7-sonnet': {
    modelName: 'Claude 3.7 Sonnet',
    retirementDates: {
      firstParty: 'February 19, 2026',
      bedrock: 'April 28, 2026',
      vertex: 'May 11, 2026',
      foundry: 'February 19, 2026',
      anthropicAws: null,
      mantle: null,
    },
  },
  'claude-3-5-haiku': {
    modelName: 'Claude 3.5 Haiku',
    retirementDates: {
      firstParty: 'February 19, 2026',
      bedrock: null,
      vertex: null,
      foundry: null,
      anthropicAws: null,
      mantle: null,
    },
  },
}

const LEGACY_OPUS_MODELS = new Set([
  'claude-opus-4-0',
  'claude-opus-4-1',
])

/**
 * Check if a model is deprecated and get its deprecation info.
 */
function getDeprecatedModelInfo(modelId: string): DeprecationInfo {
  const canonicalModel = getCanonicalName(modelId.replace(/\[1m\]$/i, ''))
  const provider = getAPIProvider()
  const isRemapped =
    provider === 'firstParty' &&
    LEGACY_OPUS_MODELS.has(canonicalModel) &&
    isLegacyModelRemapEnabled()

  for (const [model, value] of Object.entries(DEPRECATED_MODELS)) {
    const retirementDate = value.retirementDates[provider]
    if (canonicalModel === model && (retirementDate || isRemapped)) {
      return {
        isDeprecated: true,
        modelName: value.modelName,
        retirementDate,
        remappedTo: isRemapped ? (value.remappedTo ?? null) : null,
      }
    }
  }

  return { isDeprecated: false }
}

/**
 * Get a deprecation warning message for a model, or null if not deprecated.
 */
export function getModelDeprecationWarning(
  modelId: string | null,
): string | null {
  if (!modelId) {
    return null
  }

  const info = getDeprecatedModelInfo(modelId)
  if (!info.isDeprecated) {
    return null
  }

  if (info.remappedTo) {
    return `⚠ ${info.modelName} has been updated to ${info.remappedTo}.`
  }

  if (info.retirementDate) {
    const date = new Date(info.retirementDate)
    const retirementWording =
      !Number.isNaN(date.getTime()) && date < new Date()
        ? 'was retired on'
        : 'will be retired on'
    return `⚠ ${info.modelName} ${retirementWording} ${info.retirementDate}. Consider switching to a newer model.`
  }

  return null
}
