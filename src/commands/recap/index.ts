import type { Command } from '../../commands.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'

const recap = {
  type: 'local',
  name: 'recap',
  description: 'Generate a one-line session recap now',
  isEnabled: () =>
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_sedge_lantern', true),
  supportsNonInteractive: false,
  thinClientDispatch: 'post-text',
  load: () => import('./recap.js'),
} satisfies Command

export default recap
