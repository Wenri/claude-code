import type { Command } from '../../commands.js'
import {
  ADVISOR_MODEL_OPTIONS,
  canUserConfigureAdvisor,
} from '../../utils/advisor.js'

export default {
  type: 'local-jsx',
  name: 'advisor',
  description:
    'Configure the Advisor Tool to consult a stronger model for guidance at key moments during a task',
  argumentHint: `[${[...ADVISOR_MODEL_OPTIONS, 'off'].join('|')}]`,
  isEnabled: () => canUserConfigureAdvisor(),
  get isHidden() {
    return !canUserConfigureAdvisor()
  },
  load: () => import('./advisor.js'),
} satisfies Command
