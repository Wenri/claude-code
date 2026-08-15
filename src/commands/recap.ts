import type { Command } from '../commands.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { generateAwaySummary } from '../services/awaySummary.js'
import type { LocalCommandCall } from '../types/command.js'

const call: LocalCommandCall = async (_args, context) => {
  const summary = await generateAwaySummary(context.abortController.signal)
  if (summary === null) {
    if (context.abortController.signal.aborted) {
      return { type: 'text', value: 'Recap cancelled.' }
    }
    return {
      type: 'text',
      value:
        'No recap available — needs at least one completed turn, or generation failed.',
    }
  }
  return { type: 'text', value: summary }
}

const recap = {
  type: 'local',
  name: 'recap',
  description: 'Generate a one-line session recap now',
  isEnabled: () =>
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_sedge_lantern', false),
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default recap
