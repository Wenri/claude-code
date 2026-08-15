import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'

export type BashRerunAliases = {
  map: Map<string, string>
  nextId: number
}

export function createBashRerunAliases(): BashRerunAliases {
  return { map: new Map(), nextId: 1 }
}

export function isBashRerunEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_velvet_anchor', false)
}

export function assignBashRerunAlias(
  aliases: BashRerunAliases,
  command: string,
): string {
  const alias = `b${aliases.nextId++}`
  aliases.map.set(alias, command)
  return alias
}

export function resolveBashRerunAlias(
  aliases: BashRerunAliases | undefined,
  alias: string,
): { command: string; error?: undefined } | { command?: undefined; error: string } {
  const command = aliases?.map.get(alias)
  if (command !== undefined) return { command }
  const valid = aliases ? Array.from(aliases.map.keys()) : []
  const choices = valid.length > 0 ? valid.join(', ') : 'none'
  return {
    error: `Unknown rerun alias '${alias}'. Valid aliases this session: ${choices}. Provide {command: "..."} instead.`,
  }
}

export function formatBashRerunFooter(alias: string): string {
  return `[rerun: ${alias}]`
}
