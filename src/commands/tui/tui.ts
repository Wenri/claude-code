import { logEvent } from '../../services/analytics/index.js'
import { getScrollConfig } from '../../ink/scroll-config.js'
import type { LocalCommandCall } from '../../types/command.js'
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js'
import { relaunch } from '../../utils/relaunch.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

const RENDERERS = ['default', 'fullscreen'] as const

export const call: LocalCommandCall = async args => {
  const value = args.trim().toLowerCase()

  if (value === '') {
    const current =
      getInitialSettings().tui ??
      (isFullscreenEnvEnabled() ? 'fullscreen' : 'default')
    return {
      type: 'text',
      value: `Current renderer: ${current}. Usage: /tui <${RENDERERS.join('|')}>`,
    }
  }

  if (!RENDERERS.includes(value as (typeof RENDERERS)[number])) {
    return {
      type: 'text',
      value: `Unknown renderer "${value}". Usage: /tui <${RENDERERS.join('|')}>`,
    }
  }

  const renderer = value as (typeof RENDERERS)[number]
  const fullscreen = renderer === 'fullscreen'
  const from = isFullscreenEnvEnabled() ? 'fullscreen' : 'default'
  if (fullscreen === isFullscreenEnvEnabled()) {
    return {
      type: 'text',
      value: `Already using the ${renderer} renderer.`,
    }
  }

  const { error } = updateSettingsForSource('userSettings', { tui: renderer })
  if (error) {
    return { type: 'text', value: `Failed to save setting: ${error.message}` }
  }

  const scrollConfig = getScrollConfig()
  logEvent('tengu_tui_command', {
    fullscreen,
    from,
    to: renderer,
    session_age_ms: Math.round(process.uptime() * 1000),
    bounce:
      process.env.CLAUDE_CODE_TUI_JUST_SWITCHED === 'fullscreen' &&
      renderer === 'default',
    scroll_decay_curve: scrollConfig.useDecayCurve,
    scroll_base: scrollConfig.base,
    scroll_xtermjs: scrollConfig.xtermJs,
  })
  return relaunch({
    freshIfNoTranscript: true,
    env: { CLAUDE_CODE_TUI_JUST_SWITCHED: renderer },
    dropEnv: [
      'CLAUDE_CODE_NO_FLICKER',
      'CLAUDE_CODE_FORCE_FULLSCREEN_UPSELL',
    ],
  })
}
