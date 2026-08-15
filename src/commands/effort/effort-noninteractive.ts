import type {
  LocalCommandResult,
  LocalJSXCommandContext,
} from '../../commands.js'
import {
  getDefaultMainLoopModelSetting,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'
import { executeEffort, showCurrentEffort } from './effort.js'

const COMMON_HELP_ARGS = ['help', '-h', '--help']
const HELP =
  'Usage: /effort [low|medium|high|xhigh|max|auto]\n\nEffort levels:\n- low: Quick, straightforward implementation\n- medium: Balanced approach with standard testing\n- high: Comprehensive implementation with extensive testing\n- xhigh: Extended reasoning with thorough analysis (Opus 4.7 only)\n- max: Maximum capability with deepest reasoning (Opus 4.6/4.7 only)\n- auto: Use the default effort level for your model'

export async function call(
  args: string,
  context: LocalJSXCommandContext,
): Promise<LocalCommandResult> {
  const arg = args.trim()
  if (COMMON_HELP_ARGS.includes(arg)) return { type: 'text', value: HELP }
  if (arg === 'current' || arg === 'status') {
    const state = context.getAppState()
    const model = parseUserSpecifiedModel(
      state.mainLoopModelForSession ??
        state.mainLoopModel ??
        getDefaultMainLoopModelSetting(),
    )
    return {
      type: 'text',
      value: showCurrentEffort(state.effortValue, model).message,
    }
  }
  if (!arg) {
    return {
      type: 'text',
      value: 'Usage: /effort <low|medium|high|xhigh|max|auto>',
    }
  }

  const result = executeEffort(arg)
  if (result.effortUpdate) {
    const value = result.effortUpdate.value
    context.setAppState(previous =>
      previous.effortValue === value
        ? previous
        : { ...previous, effortValue: value },
    )
  }
  return { type: 'text', value: result.message }
}
