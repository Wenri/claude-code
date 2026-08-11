import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandResult } from '../../types/command.js'
import { formatTokens } from '../../utils/format.js'
import { logEvent } from '../../services/analytics/index.js'
import {
  isAutoCompactEnabled,
  parseAutoCompactWindow,
  resolveAutoCompactWindow,
} from '../../services/compact/autoCompact.js'
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
        : ' (auto)'
  const capped =
    configured > window
      ? ` · capped to ${formatTokens(window)} by model`
      : ''
  const lines = [
    source === 'auto'
      ? 'Auto-compact window: auto'
      : `Auto-compact window: ${formatTokens(configured)} tokens${sourceText}${capped}`,
  ]
  if (!isAutoCompactEnabled()) {
    lines.push('Auto-compact is currently disabled (see /config)')
  }
  lines.push(
    "Auto-compact summarizes the conversation when context usage approaches this limit. The actual threshold is the minimum of this setting and your model's maximum context window.",
    'The auto setting picks a window tuned for your model and is strongly recommended for the best cost and performance.',
  )
  if (source !== 'auto') {
    lines.push(
      'Overriding auto may result in high token usage, especially when resuming long sessions.',
    )
  }
  return lines.join('\n')
}

export function applyAutoCompactWindow(
  rawValue: string,
  context: ToolUseContext,
): string {
  const model = context.options.mainLoopModel
  if (resolveAutoCompactWindow(model, undefined).source === 'env') {
    return 'CLAUDE_CODE_AUTO_COMPACT_WINDOW is set and takes precedence. Unset it to change this setting.'
  }

  const normalized = rawValue.trim().toLowerCase()
  const parsed =
    normalized === 'reset' ||
    normalized === 'unset' ||
    normalized === 'default'
      ? 'auto'
      : parseAutoCompactWindow(normalized)
  if (parsed === undefined) {
    return `Couldn't parse '${rawValue}'. Expected 'auto' or 100k–1M tokens (e.g. 500k, 200000, or 200 as shorthand)`
  }
  const value = parsed === 'auto' ? undefined : parsed

  const { error } = updateSettingsForSource('userSettings', {
    autoCompactWindow: value,
  })
  if (error) return `Couldn't save setting: ${error.message}`

  const mergedValue = getInitialSettings().autoCompactWindow
  const { window, source } = resolveAutoCompactWindow(model, mergedValue)
  const overrideActive = source === 'env' || mergedValue !== value
  const appStateValue = overrideActive ? mergedValue : value
  context.setAppState(previous =>
    previous.autoCompactWindow === appStateValue
      ? previous
      : { ...previous, autoCompactWindow: appStateValue },
  )
  logEvent('tengu_autocompact_command', {
    action: parsed === 'auto' ? 'auto' : 'set',
    ...(value !== undefined ? { tokens: value } : {}),
  })

  if (parsed === 'auto') {
    return overrideActive
      ? `Auto-compact window set to auto in settings, but a higher-priority override is active (${formatTokens(window)} tokens)`
      : 'Auto-compact window set to auto'
  }

  let suffix = ''
  if (overrideActive) {
    suffix = `, but a higher-priority override is active (${formatTokens(window)} tokens)`
  } else if (window < value!) {
    suffix = ` (capped to model limit of ${formatTokens(window)})`
  }
  return `Auto-compact window set to ${formatTokens(parsed)} tokens${suffix}`
}

export async function call(
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> {
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
