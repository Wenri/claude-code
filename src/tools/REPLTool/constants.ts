import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { NOTEBOOK_EDIT_TOOL_NAME } from '../NotebookEditTool/constants.js'
import { POWERSHELL_TOOL_NAME } from '../PowerShellTool/toolName.js'

export const REPL_TOOL_NAME = 'REPL'

/**
 * REPL mode can be forced on/off by CLAUDE_CODE_REPL. Otherwise the rollout
 * applies only to interactive CLI and Remote Control entrypoints; SDK callers
 * continue to receive the direct tool surface.
 */
export function isReplModeEnabled(): boolean {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_REPL)) return false
  if (isEnvTruthy(process.env.CLAUDE_CODE_REPL)) return true
  const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT
  if (entrypoint === 'cli' || entrypoint === 'remote') {
    return getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_slate_harbor',
      false,
    )
  }
  return false
}

/**
 * Tools that are only accessible via REPL when REPL mode is enabled.
 * When REPL mode is on, these tools are hidden from Claude's direct use,
 * forcing Claude to use REPL for batch operations.
 */
export const REPL_ONLY_TOOLS = new Set([
  FILE_READ_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  BASH_TOOL_NAME,
  POWERSHELL_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME,
])
