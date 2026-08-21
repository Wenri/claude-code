import { getXtversionName, isXtermJs } from './terminal.js'

export type ScrollConfig = {
  useDecayCurve: boolean
  useAdaptiveDrain: boolean
  base: number
  xtermJs: boolean
  termProgram: string
  xtversion: string
  wtSession: boolean
  scrollSpeedEnv: string
  platform: NodeJS.Platform
}

let cachedConfig: ScrollConfig | undefined

/**
 * Resolve the wheel input and renderer drain policy from one shared terminal
 * snapshot. The XTVERSION probe completes asynchronously, so refresh the
 * cached snapshot when that value changes.
 */
export function getScrollConfig(): ScrollConfig {
  const rawXtversion = getXtversionName()
  const xtversion = rawXtversion ?? '(no reply)'
  if (cachedConfig?.xtversion === xtversion) return cachedConfig

  const xtermJs = isXtermJs()
  const wtSession = Boolean(process.env.WT_SESSION)
  const platform = process.platform
  cachedConfig = {
    useDecayCurve: xtermJs || platform === 'win32' || wtSession,
    useAdaptiveDrain: xtermJs,
    base: readScrollSpeedBase(xtermJs),
    xtermJs,
    termProgram: process.env.TERM_PROGRAM ?? 'unset',
    xtversion,
    wtSession,
    scrollSpeedEnv: process.env.CLAUDE_CODE_SCROLL_SPEED ?? 'unset',
    platform,
  }
  return cachedConfig
}

function readScrollSpeedBase(xtermJs: boolean): number {
  const defaultBase =
    xtermJs || process.platform === 'win32' || process.env.WT_SESSION ? 3 : 1
  const raw = process.env.CLAUDE_CODE_SCROLL_SPEED
  if (!raw) return defaultBase
  const parsed = parseFloat(raw)
  return Number.isNaN(parsed) || parsed <= 0
    ? defaultBase
    : Math.min(parsed, 20)
}
