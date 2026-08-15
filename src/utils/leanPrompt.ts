import memoize from 'lodash-es/memoize.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js'
import { getCanonicalName } from './model/model.js'

export const isLeanPromptEnabled = memoize((model?: string): boolean => {
  if (!model || getCanonicalName(model) !== 'claude-opus-4-7') return false
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT)) {
    return false
  }
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_vellum_lantern', false)
})
