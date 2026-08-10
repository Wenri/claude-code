import type { Command } from '../../commands.js'

const theme = {
  type: 'local-jsx',
  name: 'theme',
  requires: { ink: true },
  description: 'Change the theme',
  load: () => import('./theme.js'),
} satisfies Command

export default theme
