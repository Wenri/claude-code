import type { Command } from '../../commands.js'

const proTrialExpired = {
  type: 'local-jsx',
  name: 'pro-trial-expired',
  description: 'Options shown when the Pro plan Claude Code trial has ended',
  isEnabled: () => false,
  isHidden: true,
  load: () => import('./pro-trial-expired.js'),
} satisfies Command

export default proTrialExpired
