import type { Command } from '../../commands.js'

const toggleMemory = {
  type: 'local',
  name: 'toggle-memory',
  description: 'Toggle automemory off/on for this session',
  isEnabled: () => false,
  isHidden: false,
  supportsNonInteractive: false,
  thinClientDispatch: 'post-text',
  load: () => import('./toggle-memory.js'),
} satisfies Command

export default toggleMemory
