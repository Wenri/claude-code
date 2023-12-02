import type { Command } from '../../commands.js'

const update = {
  type: 'local',
  name: 'update',
  description: 'Switch to the latest version (conversation continues)',
  supportsNonInteractive: false,
  isEnabled: () => false,
  isHidden: true,
  load: () => import('./update.js'),
} satisfies Command

export default update
