import type {
  LocalCommandResult,
  LocalJSXCommandContext,
} from '../../commands.js'
import {
  getDefaultMainLoopModelSetting,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'
import {
  EFFORT_HELP_TEXT,
  executeEffort,
  showCurrentEffort,
} from './effort.js'

const COMMON_HELP_ARGS = ['help', '-h', '--help']
export async function call(
  args: string,
  context: LocalJSXCommandContext,
): Promise<LocalCommandResult> {
  const arg = args.trim()
  if (COMMON_HELP_ARGS.includes(arg)) {
    return { type: 'text', value: EFFORT_HELP_TEXT }
  }
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
