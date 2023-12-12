import {
  type TerminalQuerier,
  oscColor,
} from '../ink/terminal-querier.js'
import { subscribeThemeNotifications } from '../ink/theme-notify.js'
import { OSC, wrapForMultiplexer } from '../ink/termio/osc.js'
import { logForDebugging } from './debug.js'
import { isTmuxControlMode } from './fullscreen.js'
import { sleep } from './sleep.js'
import {
  setCachedSystemTheme,
  type SystemTheme,
  themeFromOscColor,
} from './systemTheme.js'

const DEFAULT_MUX_TIMEOUT_MS = 2000

// false means the initial OSC 11 probe was ignored. Avoid repeating that
// round-trip every time the provider remounts; an unsolicited theme-change
// notification still retries it.
let initialProbeSucceeded: boolean | undefined

export function _resetInitialProbeForTesting(): void {
  initialProbeSucceeded = undefined
}

export function watchSystemTheme(
  querier: TerminalQuerier,
  onTheme: (theme: SystemTheme) => void,
  options?: { muxTimeoutMs?: number },
): () => void {
  let currentTheme: SystemTheme | undefined
  let cancelled = false
  let probing = false
  const muxTimeoutMs = options?.muxTimeoutMs ?? DEFAULT_MUX_TIMEOUT_MS
  const throughMultiplexer =
    Boolean(process.env.TMUX || process.env.STY) && !isTmuxControlMode()

  async function probe(): Promise<void> {
    if (probing) return
    probing = true
    try {
      const direct = oscColor(OSC.SET_BG_COLOR)
      const query = throughMultiplexer
        ? { ...direct, request: wrapForMultiplexer(direct.request) }
        : direct
      let response
      let via = throughMultiplexer ? 'dcs' : 'direct'

      if (throughMultiplexer) {
        response = await Promise.race([
          querier.send(query),
          sleep(muxTimeoutMs, undefined, { unref: true }).then(() => undefined),
        ])
        if (!response) {
          if (cancelled) {
            querier.cancel(query)
          } else {
            // Drain the passthrough query, then retry bare. Older tmux/screen
            // configurations may reject DCS passthrough but proxy OSC 11.
            void querier.flush()
            via = 'mux-bare'
            ;[response] = await Promise.all([
              querier.send(direct),
              querier.flush(),
            ])
          }
        }
      } else {
        ;[response] = await Promise.all([
          querier.send(query),
          querier.flush(),
        ])
      }

      if (cancelled) return
      if (!response) {
        logForDebugging(
          `systemTheme: OSC 11 query (via=${via}) got no response`,
          { level: 'debug' },
        )
        initialProbeSucceeded = false
        return
      }

      initialProbeSucceeded = true
      const detected = themeFromOscColor(response.data)
      logForDebugging(
        `systemTheme: OSC 11 response=${response.data} detected=${detected} via=${via}`,
        { level: 'debug' },
      )
      if (detected === undefined || detected === currentTheme) return
      currentTheme = detected
      setCachedSystemTheme(detected)
      onTheme(detected)
    } finally {
      probing = false
    }
  }

  if (initialProbeSucceeded !== false) void probe()
  const unsubscribe = subscribeThemeNotifications(() => void probe())
  return () => {
    cancelled = true
    unsubscribe()
  }
}
