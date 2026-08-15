import { COMMON_HELP_ARGS } from '../../constants/xml.js'
import type { LocalCommandCall } from '../../types/command.js'
import {
  getCanonicalName,
  getDefaultMainLoopModelSetting,
} from '../../utils/model/model.js'
import { executeEffort, HELP, showCurrentEffort } from './effort.js'

export const call: LocalCommandCall = async (args, context) => {
  const argument = args.trim()
  if (COMMON_HELP_ARGS.includes(argument)) {
    return { type: 'text', value: HELP }
  }
  if (argument === 'current' || argument === 'status') {
    const state = context.getAppState()
    const model = getCanonicalName(
      state.mainLoopModelForSession ??
        state.mainLoopModel ??
        getDefaultMainLoopModelSetting(),
    )
    const { message } = showCurrentEffort(state.effortValue, model)
    return { type: 'text', value: message }
  }
  if (!argument) {
    return {
      type: 'text',
      value: 'Usage: /effort <low|medium|high|xhigh|max|auto>',
    }
  }

  const result = executeEffort(argument)
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
