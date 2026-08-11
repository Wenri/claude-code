import type { Command } from '../../commands.js'

export const rename = {
  type: 'local-jsx',
  name: 'rename',
  aliases: ['name'],
  requires: { ink: true },
  description: 'Rename the current conversation',
  immediate: true,
  argumentHint: '[name]',
  load: () => import('./rename.js'),
} satisfies Command

export const renameNonInteractive = {
  type: 'local',
  name: 'rename',
  aliases: ['name'],
  supportsNonInteractive: true,
  description: 'Rename the current conversation',
  argumentHint: '[name]',
  load: () => import('./rename-noninteractive.js'),
} satisfies Command

export default rename
