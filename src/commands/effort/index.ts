import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'

const effort = {
  type: 'local-jsx',
  name: 'effort',
  description: 'Set effort level for model usage',
  argumentHint: '[low|medium|high|xhigh|max|auto]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  requires: { ink: true },
  thinClientDispatch: 'control-request',
  load: () => import('./effort.js'),
} satisfies Command

export const effortNonInteractive = {
  type: 'local',
  name: 'effort',
  supportsNonInteractive: true,
  description: 'Set effort level for model usage',
  argumentHint: '<low|medium|high|xhigh|max|auto>',
  load: () => import('./effort-noninteractive.js'),
} satisfies Command

export default effort
