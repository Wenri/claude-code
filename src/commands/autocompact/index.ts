import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { isAutoCompactConfigurationEnabled } from '../../services/compact/autoCompact.js'

export const autocompact = {
  type: 'local-jsx',
  name: 'autocompact',
  description: 'Configure the auto-compact window size',
  isEnabled: () =>
    isAutoCompactConfigurationEnabled() && !getIsNonInteractiveSession(),
  isHidden: false,
  argumentHint: '[auto|<tokens>]',
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
    return (
      isAutoCompactConfigurationEnabled() && getIsNonInteractiveSession()
    )
  },
  argumentHint: '[auto|<tokens>]',
  load: () => import('./autocompact-noninteractive.js'),
  userFacingName() {
    return 'autocompact'
  },
} satisfies Command
