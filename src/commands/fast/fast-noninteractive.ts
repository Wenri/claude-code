import type { LocalCommandCall } from '../../types/command.js'
import {
  isFastModeEnabled,
  prefetchFastModeStatus,
} from '../../utils/fastMode.js'
import { handleFastModeShortcut } from './fastModeShared.js'

export const call: LocalCommandCall = async (args, context) => {
  if (!isFastModeEnabled()) {
    return { type: 'text', value: 'Fast mode is not available.' }
  }

  await prefetchFastModeStatus()
  const arg = args.trim().toLowerCase()
  let enable: boolean
  if (arg === 'on') {
    enable = true
  } else if (arg === 'off') {
    enable = false
  } else if (arg === '') {
    enable = !context.getAppState().fastMode
  } else {
    return {
      type: 'text',
      value: `Unknown argument "${arg}". Use: /fast [on|off]`,
    }
  }

  return {
    type: 'text',
    value: await handleFastModeShortcut(
      enable,
      context.getAppState,
      context.setAppState,
      'bridge',
    ),
  }
}
