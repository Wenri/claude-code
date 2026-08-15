import type { ToolPermissionContext } from '../../Tool.js'
import type { LocalCommandCall } from '../../types/command.js'
import {
  permissionModeTitle,
  type PermissionMode,
} from '../../utils/permissions/PermissionMode.js'
import { setPermissionMode } from '../../utils/permissions/permissionSetup.js'
import { MODE_COMMAND_MODES } from './availableModes.js'

const USAGE = `Usage: /mode <${MODE_COMMAND_MODES.join('|')}>`

type PermissionContextSetter = (
  updater: (previous: ToolPermissionContext) => ToolPermissionContext,
) => void

export const call: LocalCommandCall = async (args, context) => {
  const mode = args.trim()
  const currentContext = context.getAppState().toolPermissionContext

  if (mode === '') {
    return {
      type: 'text',
      value: `Current mode: ${currentContext.mode} (${permissionModeTitle(currentContext.mode)})\n${USAGE}`,
    }
  }
  if (mode === 'bypassPermissions') {
    return {
      type: 'text',
      value:
        'bypassPermissions is not available via /mode. Use the local TUI (shift+tab) instead.',
    }
  }
  if (
    !MODE_COMMAND_MODES.includes(
      mode as (typeof MODE_COMMAND_MODES)[number],
    )
  ) {
    return { type: 'text', value: `Unknown mode "${mode}". ${USAGE}` }
  }

  const setToolPermissionContext = (
    context as typeof context & {
      setToolPermissionContext: PermissionContextSetter
    }
  ).setToolPermissionContext
  const result = setPermissionMode(
    mode as PermissionMode,
    currentContext,
    setToolPermissionContext,
  )
  if (!result.ok) return { type: 'text', value: result.error }
  return {
    type: 'text',
    value: `Permission mode set to ${result.mode} (${permissionModeTitle(result.mode)})`,
  }
}
