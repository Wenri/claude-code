import type { Command } from '../../commands.js'

export const exit = {
  type: 'local-jsx',
  name: 'exit',
  requires: { ink: true },
  aliases: ['quit'],
  description: 'Exit the CLI (in a background session: detach or stop)',
  immediate: true,
  load: () => import('./exit.js'),
} satisfies Command

export const exitNonInteractive = {
  type: 'local',
  name: 'exit',
  supportsNonInteractive: true,
  description: 'Exit the CLI (in a background session: detach or stop)',
  load: () => import('./exit-noninteractive.js'),
} satisfies Command

export default exit
