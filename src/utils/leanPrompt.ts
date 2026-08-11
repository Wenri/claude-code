import memoize from 'lodash-es/memoize.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isEnvTruthy } from './envUtils.js'
import { getCanonicalName } from './model/model.js'

export const isLeanPromptEnabled = memoize((model?: string): boolean => {
  if (!model || getCanonicalName(model) !== 'claude-opus-4-7') return false
  if (isEnvTruthy(process.env.CLAUDE_CODE_LEAN_PROMPT)) return true
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_vellum_lantern', false)
})
