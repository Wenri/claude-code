import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { POWERSHELL_TOOL_NAME } from '../../tools/PowerShellTool/toolName.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../envUtils.js'
import { getPlatform } from '../platform.js'

export const SHELL_TOOL_NAMES: string[] = [BASH_TOOL_NAME, POWERSHELL_TOOL_NAME]

/**
 * Runtime gate for PowerShellTool. Windows uses a gradual rollout, with the
 * environment variable as an explicit opt-in or opt-out. Other platforms are
 * opt-in only and require CLAUDE_CODE_USE_POWERSHELL_TOOL=1.
 *
 * Used by tools.ts (tool-list visibility), processBashCommand (! routing),
 * and promptShellExecution (skill frontmatter routing) so the gate is
 * consistent across all paths that invoke PowerShellTool.call().
 */
export function isPowerShellToolEnabled(): boolean {
  const envValue = process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL
  if (getPlatform() !== 'windows') return isEnvTruthy(envValue)
  if (isEnvTruthy(envValue)) return true
  if (isEnvDefinedFalsy(envValue)) return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_ridge', false)
}
