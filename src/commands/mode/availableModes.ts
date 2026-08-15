import { PERMISSION_MODES } from '../../utils/permissions/PermissionMode.js'

export type ModeCommandMode = Exclude<
  (typeof PERMISSION_MODES)[number],
  'bypassPermissions'
>

export const MODE_COMMAND_MODES = PERMISSION_MODES.filter(
  (mode): mode is ModeCommandMode =>
    mode !== 'bypassPermissions',
)
