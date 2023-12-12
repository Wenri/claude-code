import type { Command } from '../../commands.js'
import { isBgSession } from '../../utils/concurrentSessions.js'

const description =
  'Stop this background session; transcript and worktree are kept'

const stop = {
  type: 'local-jsx',
  name: 'stop',
  description,
  immediate: true,
  isEnabled: isBgSession,
  requires: { ink: true },
  load: () => import('./stop.js'),
} satisfies Command

export const stopNonInteractive = {
  type: 'local',
  name: 'stop',
  supportsNonInteractive: true,
  description,
  isEnabled: isBgSession,
  load: () => import('./stop-noninteractive.js'),
} satisfies Command

export default stop
