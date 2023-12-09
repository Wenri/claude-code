import type { Command } from '../../commands.js'

const releaseNotes: Command = {
  description: 'View release notes',
  name: 'release-notes',
  requires: { ink: true },
  type: 'local-jsx',
  load: () => import('./release-notes.js'),
}

export default releaseNotes
