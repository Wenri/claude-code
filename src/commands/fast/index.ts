import type { Command } from '../../commands.js'
import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeEnabled,
} from '../../utils/fastMode.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'

const fast = {
  type: 'local-jsx',
  name: 'fast',
  get description() {
    return `Toggle fast mode (${FAST_MODE_MODEL_DISPLAY} only)`
  },
  isEnabled: () => isFastModeEnabled(),
  get isHidden() {
    return !isFastModeEnabled()
  },
  argumentHint: '[on|off]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  requires: { ink: true },
  thinClientDispatch: 'control-request',
  load: () => import('./fast.js'),
} satisfies Command

export const fastNonInteractive = {
  type: 'local',
  name: 'fast',
  supportsNonInteractive: true,
  get description() {
    return `Toggle fast mode (${FAST_MODE_MODEL_DISPLAY} only)`
  },
  argumentHint: '[on|off]',
  load: () => import('./fast-noninteractive.js'),
} satisfies Command

export default fast
