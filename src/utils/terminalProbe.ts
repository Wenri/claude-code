import {
  getXtversionName,
  isSynchronizedOutputSupported,
} from '../ink/terminal.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { env } from './env.js'
import { getRendererEntryPath, isTmuxControlMode } from './fullscreen.js'

let terminalProbeLogged = false

export function logTerminalProbe(): void {
  if (terminalProbeLogged) return
  terminalProbeLogged = true
  const multiplexer = process.env.TMUX
    ? isTmuxControlMode()
      ? 'tmux_cc'
      : 'tmux'
    : process.env.ZELLIJ != null
      ? 'zellij'
      : process.env.STY
        ? 'screen'
        : 'none'
  logEvent('tengu_terminal_probe', {
    xtversion: (getXtversionName() ??
      'no_reply') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    term_program_version: (process.env.TERM_PROGRAM_VERSION ??
      'unset') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    is_ssh: env.isSSH(),
    multiplexer:
      multiplexer as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    term_rows: process.stdout.rows ?? 0,
    term_cols: process.stdout.columns ?? 0,
    dec2026_allowlist: isSynchronizedOutputSupported(),
    renderer_entry_path:
      getRendererEntryPath() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
}

export function _resetTerminalProbeForTesting(): void {
  terminalProbeLogged = false
}
