import { getXtversionName, isXtermJs } from './terminal.js'

export type ScrollConfig = {
  useDecayCurve: boolean
  useAdaptiveDrain: boolean
  base: number
  xtermJs: boolean
  termProgram: string
  termProgramVersion: string
  wheelFlood: boolean
  xtversion: string
  wtSession: boolean
  scrollSpeedEnv: string
  platform: NodeJS.Platform
}

let cachedScrollConfig: ScrollConfig | undefined

function parseTermProgramVersion(version: string | undefined): number | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '')
  if (!match) return null
  return (
    Number(match[1]) * 1_000_000 +
    Number(match[2]) * 1_000 +
    Number(match[3])
  )
}

function hasCursorWheelFlood(): boolean {
  if (process.env.CURSOR_TRACE_ID !== undefined) return true
  if (process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('cursor')) return true
  if (process.env.TERM_PROGRAM !== 'vscode') return false
  const version = parseTermProgramVersion(process.env.TERM_PROGRAM_VERSION)
  return version !== null && version >= 1_092_000 && version < 1_105_000
}

export function readScrollSpeedBase(
  xtermJs = false,
  wheelFlood = false,
): number {
  const defaultBase =
    !wheelFlood &&
    (xtermJs || process.platform === 'win32' || process.env.WT_SESSION)
      ? 3
      : 1
  const raw = process.env.CLAUDE_CODE_SCROLL_SPEED
  if (!raw) return defaultBase
  const value = Number.parseFloat(raw)
  return Number.isNaN(value) || value <= 0
    ? defaultBase
    : Math.min(value, 20)
}

export function getScrollConfig(): ScrollConfig {
  const detectedVersion = getXtversionName()
  const xtversion = detectedVersion ?? '(no reply)'
  if (cachedScrollConfig?.xtversion === xtversion) return cachedScrollConfig

  const xtermJs = isXtermJs()
  const wheelFlood = hasCursorWheelFlood()
  const wtSession = Boolean(process.env.WT_SESSION)
  const platform = process.platform
  cachedScrollConfig = {
    useDecayCurve:
      !wheelFlood && (xtermJs || platform === 'win32' || wtSession),
    useAdaptiveDrain: !wheelFlood && xtermJs,
    base: readScrollSpeedBase(xtermJs, wheelFlood),
    xtermJs,
    termProgram: process.env.TERM_PROGRAM ?? 'unset',
    termProgramVersion: process.env.TERM_PROGRAM_VERSION ?? 'unset',
    wheelFlood,
    xtversion,
    wtSession,
    scrollSpeedEnv: process.env.CLAUDE_CODE_SCROLL_SPEED ?? 'unset',
    platform,
  }
  return cachedScrollConfig
}
