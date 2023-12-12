import type { Command } from '../../commands.js'

const background = {
  type: 'local-jsx',
  name: 'background',
  aliases: ['bg'],
  description: 'Continue this session in the background and free the terminal',
  isEnabled: () => true,
  load: () => import('./background.js'),
} satisfies Command

export default background
