import {
  COMMON_HELP_ARGS,
  COMMON_INFO_ARGS,
} from '../../constants/xml.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { LocalCommandCall } from '../../types/command.js'
import { MODEL_ALIASES } from '../../utils/model/aliases.js'
import {
  executeModelChange,
  renderCurrentModel,
} from './modelCommand.js'

const USAGE = `Usage: /model <name>. Available: ${MODEL_ALIASES.join(', ')}, default, or a full model ID.`

export const call: LocalCommandCall = async (args, context) => {
  const argument = args.trim()
  if (!argument || COMMON_INFO_ARGS.includes(argument)) {
    return {
      type: 'text',
      value: `${renderCurrentModel(context.getAppState())}\n${USAGE}`,
    }
  }
  if (COMMON_HELP_ARGS.includes(argument)) {
    return { type: 'text', value: USAGE }
  }
  logEvent('tengu_model_command_inline', {
    args: argument as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  return {
    type: 'text',
    value: (
      await executeModelChange(
        argument,
        context.getAppState,
        context.setAppState,
      )
    ).message,
  }
}
