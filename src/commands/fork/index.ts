import type { Command } from '../../commands.js'
import { isForkSubagentEnabled } from '../../tools/AgentTool/forkSubagent.js'

const fork = {
  type: 'local-jsx',
  name: 'fork',
  description: 'Spawn a background agent that inherits the full conversation',
  argumentHint: '<directive>',
  isEnabled: isForkSubagentEnabled,
  load: () => import('./fork.js'),
} satisfies Command

export default fork
