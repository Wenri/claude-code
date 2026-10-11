import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandResult } from '../../types/command.js'
import { logEvent } from '../../services/analytics/index.js'
import {
  isAutoCompactEnabled,
  parseAutoCompactWindow,
  resolveAutoCompactWindow,
} from '../../services/compact/autoCompact.js'
import { formatTokens } from '../../utils/format.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

function describeAutoCompactWindow(
  model: string,
  configuredWindow?: number,
): string {
  const { window, configured, source } = resolveAutoCompactWindow(
    model,
    configuredWindow,
  )
  const sourceText =
    source === 'env'
      ? ' (from CLAUDE_CODE_AUTO_COMPACT_WINDOW)'
      : source === 'settings'
        ? ' (from settings)'
        : ' (model default)'
  const capped =
    configured > window
      ? ` · capped to ${formatTokens(window)} by model`
      : ''
  const lines = [
    `Auto-compact window: ${formatTokens(configured)} tokens${sourceText}${capped}`,
  ]
  if (!isAutoCompactEnabled()) {
    lines.push('Auto-compact is currently disabled (see /config)')
  }
  lines.push(
    "Auto-compact summarizes the conversation when context usage approaches this limit. The actual threshold is the minimum of this setting and your model's context window.",
  )
  return lines.join('\n')
}

export function applyAutoCompactWindow(
  rawValue: string,
  context: ToolUseContext,
): string {
  if (process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW) {
    return 'CLAUDE_CODE_AUTO_COMPACT_WINDOW is set and takes precedence. Unset it to change this setting.'
  }

  const model = context.options.mainLoopModel
  const normalized = rawValue.trim().toLowerCase()
  const reset =
    normalized === 'reset' ||
    normalized === 'unset' ||
    normalized === 'default'
  const value = reset ? undefined : parseAutoCompactWindow(normalized)
  if (!reset && value === undefined) {
    return `Invalid argument: ${rawValue}. Expected 100k–1M tokens (e.g. 500k, 200000, or 200 as shorthand) or 'reset'`
  }

  updateSettingsForSource('userSettings', { autoCompactWindow: value })
  context.setAppState(previous =>
    previous.autoCompactWindow === value
      ? previous
      : { ...previous, autoCompactWindow: value },
  )
  logEvent('tengu_autocompact_command', {
    action: reset ? 'reset' : 'set',
    ...(value !== undefined && { tokens: value }),
  })

  const mergedValue = getInitialSettings().autoCompactWindow
  const { window, source } = resolveAutoCompactWindow(model, mergedValue)
  const overrideActive = source === 'env' || mergedValue !== value
  if (reset) {
    return overrideActive
      ? `Auto-compact window reset in settings, but a higher-priority override is active (${formatTokens(window)} tokens)`
      : 'Auto-compact window reset to model default'
  }

  let suffix = ''
  if (overrideActive) {
    suffix = `, but a higher-priority override is active (${formatTokens(window)} tokens)`
  } else if (window < value!) {
    suffix = ` (capped to model limit of ${formatTokens(window)})`
  }
  return `Auto-compact window set to ${formatTokens(value!)} tokens${suffix}`
}

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const value = args.trim()
  if (!value) {
    return {
      type: 'text',
      value: describeAutoCompactWindow(
        context.options.mainLoopModel,
        context.getAppState().autoCompactWindow,
      ),
    }
  }
  return { type: 'text', value: applyAutoCompactWindow(value, context) }
}
