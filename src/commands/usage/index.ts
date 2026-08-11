import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'

export const usage = {
  type: 'local-jsx',
  name: 'usage',
  aliases: ['cost', 'stats'],
  requires: { ink: true },
  description: 'Show session cost, plan usage, and activity stats',
  thinClientDispatch: 'control-request',
  load: () => import('./usage.js'),
} satisfies Command

export const usageNonInteractive = {
  type: 'local',
  name: 'usage',
  aliases: ['cost', 'stats'],
  supportsNonInteractive: true,
  description: 'Show the total cost and duration of the current session',
  isEnabled: () => getIsNonInteractiveSession(),
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  load: () => import('../cost/cost.js'),
} satisfies Command
