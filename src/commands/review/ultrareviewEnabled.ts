import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'

export type UltrareviewConfig = Record<string, unknown> & {
  enabled?: boolean
  cost_note?: string
  duration_note?: string
  model?: string
}

export function getUltrareviewConfig(): UltrareviewConfig | null {
  return getFeatureValue_CACHED_MAY_BE_STALE<UltrareviewConfig | null>(
    'tengu_review_bughunter_config',
    null,
  )
}

export function getUltrareviewCostNote(): string {
  const value = getUltrareviewConfig()?.cost_note
  return typeof value === 'string' && value.length > 0 ? value : '$10-$20'
}

export function getUltrareviewDurationNote(): string {
  const value = getUltrareviewConfig()?.duration_note
  return typeof value === 'string' && value.length > 0
    ? value
    : '~10–20 min'
}

export function getUltrareviewModel(): string | undefined {
  const value = getUltrareviewConfig()?.model
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function isUltrareviewEnabled(): boolean {
  return getUltrareviewConfig()?.enabled === true
}
