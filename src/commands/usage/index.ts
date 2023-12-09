import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'usage',
  requires: { ink: true },
  description: 'Show plan usage limits',
  availability: ['claude-ai'],
  load: () => import('./usage.js'),
} satisfies Command
