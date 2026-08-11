import { generateAwaySummary } from '../../services/awaySummary.js'
import type { LocalCommandCall } from '../../types/command.js'

export const call: LocalCommandCall = async (_args, context) => {
  const result = await generateAwaySummary(context.abortController.signal)

  switch (result.kind) {
    case 'ok':
    case 'api-error':
      return { type: 'text', value: result.text }
    case 'no-turn':
      return {
        type: 'text',
        value: 'Nothing to recap yet — send a message first.',
      }
    case 'aborted':
      return { type: 'text', value: 'Recap cancelled.' }
    case 'failed':
      return {
        type: 'text',
        value: "Couldn't generate a recap. Run with --debug for details.",
      }
  }
}
