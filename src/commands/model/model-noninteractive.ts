import type {
  LocalCommandResult,
  LocalJSXCommandContext,
} from '../../commands.js'
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { MODEL_ALIASES } from '../../utils/model/aliases.js'
import { changeModel, renderCurrentModel } from './model.js'

const USAGE = `Usage: /model <name>. Available: ${MODEL_ALIASES.join(', ')}, default, or a full model ID.`

export async function call(
  args: string,
  context: LocalJSXCommandContext,
): Promise<LocalCommandResult> {
  const input = args.trim()
  if (!input || COMMON_INFO_ARGS.includes(input)) {
    return {
      type: 'text',
      value: `${renderCurrentModel(context.getAppState())}\n${USAGE}`,
    }
  }
  if (COMMON_HELP_ARGS.includes(input)) {
    return { type: 'text', value: USAGE }
  }
  logEvent('tengu_model_command_inline', {
    args: input as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  return {
    type: 'text',
    value: (await changeModel(input, context.getAppState, context.setAppState))
      .message,
  }
}
