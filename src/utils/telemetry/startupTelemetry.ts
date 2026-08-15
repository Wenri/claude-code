import {
  DEFAULT_GLOBAL_CONFIG,
  GLOBAL_CONFIG_KEYS,
  type GlobalConfig,
} from '../config.js'

const ENV_EXCLUSIONS = new Set(['CLAUDE_CODE_ENTRYPOINT'])

const CONFIG_EXCLUSIONS = new Set<keyof GlobalConfig>([
  'tipsHistory',
  'installMethod',
  'shiftEnterKeyBindingInstalled',
  'hasUsedBackslashReturn',
  'hasCompletedClaudeInChromeOnboarding',
  'remoteDialogSeen',
  'lspRecommendationIgnoredCount',
  'autoUpdates',
  'autoUpdatesProtectedForNative',
])

export function collectSetEnvVars(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const result: string[] = []
  for (const key in env) {
    if (
      (key.startsWith('CLAUDE_CODE_') || key.startsWith('ANTHROPIC_')) &&
      !ENV_EXCLUSIONS.has(key) &&
      env[key] !== undefined &&
      env[key] !== ''
    ) {
      result.push(key)
    }
  }
  return result.sort()
}

export function collectNonDefaultSettings(config: GlobalConfig): string[] {
  const result: string[] = []
  for (const key of GLOBAL_CONFIG_KEYS) {
    if (CONFIG_EXCLUSIONS.has(key)) continue
    const value = config[key]
    const defaultValue = DEFAULT_GLOBAL_CONFIG[key]
    if (value === undefined || isDefaultValue(value, defaultValue)) continue
    result.push(key)
  }
  return result
}

export function collectExplicitCliFlags(
  options: Record<string, unknown>,
  getOptionValueSource: (key: string) => string | undefined,
): string[] {
  const result: string[] = []
  for (const key in options) {
    if (getOptionValueSource(key) === 'cli') result.push(key)
  }
  return result.sort()
}

function isDefaultValue(value: unknown, defaultValue: unknown): boolean {
  if (value === defaultValue) return true
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length === 0
  }
  return false
}
