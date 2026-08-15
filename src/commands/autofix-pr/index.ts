import type { Command } from '../../commands.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'

const autofixPr = {
  type: 'local-jsx',
  name: 'autofix-pr',
  description:
    'Spawn a remote Claude Code session that monitors and autofixes the current PR',
  isEnabled: () =>
    isClaudeAISubscriber() && isPolicyAllowed('allow_remote_sessions'),
  get isHidden() {
    return (
      !isClaudeAISubscriber() || !isPolicyAllowed('allow_remote_sessions')
    )
  },
  load: () => import('./autofix-pr.js'),
  userFacingName: () => 'autofix-pr',
} satisfies Command

export default autofixPr
