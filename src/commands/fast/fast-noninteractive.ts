import type {
  LocalCommandResult,
  LocalJSXCommandContext,
} from '../../commands.js'
import {
  isFastModeEnabled,
  prefetchFastModeStatus,
} from '../../utils/fastMode.js'
import { handleFastModeShortcut } from './fast.js'

export async function call(
  args: string,
  context: LocalJSXCommandContext,
): Promise<LocalCommandResult> {
  if (!isFastModeEnabled()) {
    return { type: 'text', value: 'Fast mode is not available.' }
  }

  await prefetchFastModeStatus()
  const arg = args.trim().toLowerCase()
  let enable: boolean
  if (arg === 'on') enable = true
  else if (arg === 'off') enable = false
  else if (arg === '') enable = !context.getAppState().fastMode
  else {
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
