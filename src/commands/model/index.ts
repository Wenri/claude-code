import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'
import { getMainLoopModel, renderModelName } from '../../utils/model/model.js'

const model = {
  type: 'local-jsx',
  name: 'model',
  get description() {
    return `Set the AI model for Claude Code (currently ${renderModelName(getMainLoopModel())})`
  },
  argumentHint: '[model]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  requires: { ink: true },
  thinClientDispatch: 'control-request',
  load: () => import('./model.js'),
} satisfies Command

export const modelNonInteractive = {
  type: 'local',
  name: 'model',
  supportsNonInteractive: true,
  description: 'Set the AI model for Claude Code',
  argumentHint: '<model>',
  load: () => import('./model-noninteractive.js'),
} satisfies Command

export default model
