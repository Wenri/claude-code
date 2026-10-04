import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'

export const autocompact = {
  type: 'local-jsx',
  name: 'autocompact',
  description: 'Configure the auto-compact window size',
  isEnabled: () => !getIsNonInteractiveSession(),
  isHidden: false,
  argumentHint: '[tokens|reset]',
  load: () => import('./autocompact.js'),
  userFacingName() {
    return 'autocompact'
  },
} satisfies Command

export const autocompactNonInteractive = {
  type: 'local',
  name: 'autocompact',
  supportsNonInteractive: true,
  description: 'Configure the auto-compact window size',
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  isEnabled() {
    return getIsNonInteractiveSession()
  },
  argumentHint: '[tokens|reset]',
  load: () => import('./autocompact-noninteractive.js'),
  userFacingName() {
    return 'autocompact'
  },
} satisfies Command
