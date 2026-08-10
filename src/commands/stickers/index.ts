import type { Command } from '../../commands.js'

const stickers = {
  type: 'local',
  name: 'stickers',
  requires: {},
  description: 'Order Claude Code stickers',
  supportsNonInteractive: false,
  load: () => import('./stickers.js'),
} satisfies Command

export default stickers
