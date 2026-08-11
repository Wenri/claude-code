import { getInitialSettings } from '../settings/settings.js'
import {
  isBashToolEnabled,
  isPowerShellToolEnabled,
} from './shellToolUtils.js'

/**
 * Resolve the default shell for input-box `!` commands.
 *
 * Resolution order (docs/design/ps-shell-selection.md §4.2):
 *   an available configured shell → Bash when available → PowerShell.
 */
export function resolveDefaultShell(): 'bash' | 'powershell' {
  const configured = getInitialSettings().defaultShell
  if (configured === 'bash' && !isBashToolEnabled()) return 'powershell'
  if (configured === 'powershell' && !isPowerShellToolEnabled()) return 'bash'
  return configured ?? (isBashToolEnabled() ? 'bash' : 'powershell')
}
