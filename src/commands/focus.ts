import type { Command } from '../commands.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'

const focus = {
  type: 'local-jsx',
  name: 'focus',
  requires: { ink: true },
  description:
    'Toggle focus view (show only your prompt, a tool summary, and the final response)',
  isEnabled: isFullscreenEnvEnabled,
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(onDone, context) {
        const enabled = !context.getAppState().briefTranscript
        context.setAppState(previous =>
          previous.briefTranscript === enabled
            ? previous
            : { ...previous, briefTranscript: enabled },
        )
        if (getGlobalConfig().briefTranscript !== enabled) {
          saveGlobalConfig(previous => ({
            ...previous,
            briefTranscript: enabled,
          }))
        }
        onDone(enabled ? 'Focus view enabled' : 'Focus view disabled', {
          display: 'system',
        })
        return null
      },
    }),
} satisfies Command

export default focus
