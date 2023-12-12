import type { Command } from '../../commands.js'

const daemon = {
  type: 'local-jsx',
  name: 'daemon',
  description:
    'Manage background services: assistants, scheduled tasks, and remote control',
  immediate: true,
  requires: { ink: true },
  load: () => import('./daemon.js'),
} satisfies Command

export default daemon
