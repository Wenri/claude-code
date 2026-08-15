import type { Command } from '../../commands.js'
import { MODE_COMMAND_MODES } from './availableModes.js'

const mode = {
  type: 'local',
  name: 'mode',
  description: `Set the permission mode (${MODE_COMMAND_MODES.join(', ')})`,
  argumentHint: '<mode>',
  supportsNonInteractive: true,
  isEnabled: () => false,
  get isHidden() {
    return true
  },
  load: () => import('./mode.js'),
} satisfies Command

export default mode
