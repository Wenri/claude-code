import type { Command } from '../../commands.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'

const teleport = {
  type: 'local-jsx',
  name: 'teleport',
  aliases: ['tp'],
  description: 'Resume a Claude Code session from claude.ai',
  isEnabled: () =>
    isClaudeAISubscriber() && isPolicyAllowed('allow_remote_sessions'),
  get isHidden() {
    return (
      !isClaudeAISubscriber() || !isPolicyAllowed('allow_remote_sessions')
    )
  },
  load: () => import('./teleport.js'),
} satisfies Command

export default teleport
