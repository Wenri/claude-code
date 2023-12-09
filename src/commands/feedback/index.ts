import type { Command } from '../../commands.js'

const feedback = {
  aliases: ['bug'],
  type: 'local-jsx',
  name: 'feedback',
  requires: { ink: true },
  description: `Submit feedback about Claude Code`,
  argumentHint: '[report]',
  isEnabled: () => true,
  load: () => import('./feedback.js'),
} satisfies Command

export default feedback
