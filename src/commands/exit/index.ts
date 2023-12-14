import type { Command } from '../../commands.js'
import { isBgSession } from '../../utils/concurrentSessions.js'

function getExitDescription(): string {
  return isBgSession()
    ? 'Detach from this background session (it keeps running)'
    : 'Exit the CLI'
}

export const exit = {
  type: 'local-jsx',
  name: 'exit',
  requires: { ink: true },
  aliases: ['quit'],
  get description() {
    return getExitDescription()
  },
  immediate: true,
  load: () => import('./exit.js'),
} satisfies Command

export const exitNonInteractive = {
  type: 'local',
  name: 'exit',
  supportsNonInteractive: true,
  get description() {
    return getExitDescription()
  },
  load: () => import('./exit-noninteractive.js'),
} satisfies Command

export default exit
