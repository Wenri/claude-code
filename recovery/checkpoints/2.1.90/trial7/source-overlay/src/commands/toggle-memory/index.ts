import type { Command } from '../../commands.js'
// Reconstructed direct initializer dependencies, in official target order.
import '../../bootstrap/state.js'
import '../../memdir/paths.js'

const toggleMemory = {
  type: 'local',
  name: 'toggle-memory',
  description: 'Toggle automemory off/on for this session',
  isEnabled: () => false,
  isHidden: false,
  supportsNonInteractive: false,
  load: () => import('./toggle-memory.js'),
  userFacingName() { return 'toggle-memory' },
} satisfies Command

export default toggleMemory
