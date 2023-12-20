import type { Command } from '../../commands.js'

const loops = {
  type: 'local-jsx',
  name: 'loops',
  description: 'List, create, and delete recurring loops and stop-hooks',
  immediate: true,
  isEnabled: () => false,
  load: () => import('./loops.js'),
} satisfies Command

export default loops
