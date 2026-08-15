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

let cachedScrollConfig: ScrollConfig | undefined

export function readScrollSpeedBase(xtermJs = false): number {
  const defaultBase =
    xtermJs || process.platform === 'win32' || process.env.WT_SESSION ? 3 : 1
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
  const wtSession = Boolean(process.env.WT_SESSION)
  const platform = process.platform
  cachedScrollConfig = {
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
  return cachedScrollConfig
}
