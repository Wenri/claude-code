import type { Command } from '../commands.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import { getInitialSettings } from '../utils/settings/settings.js'

const FULLSCREEN_REQUIRED =
  'Focus view needs the fullscreen renderer. Run /tui fullscreen to switch (this restarts and resumes your session), or set CLAUDE_CODE_NO_FLICKER=1 and restart.'

const focus = {
  type: 'local-jsx',
  name: 'focus',
  requires: { ink: true },
  description:
    'Toggle focus view (show only your prompt, a tool summary, and the final response)',
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(onDone, context) {
        if (!isFullscreenEnvEnabled()) {
          const configuredFocus =
            (getInitialSettings() as { viewMode?: string }).viewMode === 'focus'
          if (configuredFocus) {
            onDone(
              `Focus view is set by "viewMode": "focus" in settings.json — remove it there and restart Claude Code to turn it off. ${FULLSCREEN_REQUIRED}`,
              { display: 'system' },
            )
            return null
          }
          if (
            context.getAppState().briefTranscript ||
            getGlobalConfig().briefTranscript
          ) {
            context.setAppState(previous =>
              previous.briefTranscript
                ? { ...previous, briefTranscript: false }
                : previous,
            )
            if (getGlobalConfig().briefTranscript) {
              saveGlobalConfig(previous => ({
                ...previous,
                briefTranscript: false,
              }))
            }
            onDone(`Focus view disabled. ${FULLSCREEN_REQUIRED}`, {
              display: 'system',
            })
            return null
          }
          onDone(FULLSCREEN_REQUIRED, { display: 'system' })
          return null
        }
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
