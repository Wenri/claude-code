import type { Command } from '../../commands.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'

const autofixPrCommand = {
  type: 'local-jsx',
  name: 'autofix-pr',
  description: 'Monitor and autofix any issues with the current PR',
  argumentHint: undefined,
  isEnabled: () =>
    isClaudeAISubscriber() && isPolicyAllowed('allow_remote_sessions'),
  get isHidden() {
    return (
      !isClaudeAISubscriber() || !isPolicyAllowed('allow_remote_sessions')
    )
  },
  async load() {
    return import('./autofix-pr.js')
  },
  userFacingName() {
    return 'autofix-pr'
  },
} satisfies Command

export default autofixPrCommand
