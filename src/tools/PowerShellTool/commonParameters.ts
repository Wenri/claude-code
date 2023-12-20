/**
 * PowerShell Common Parameters (available on all cmdlets via [CmdletBinding()]).
 * Source: about_CommonParameters (PowerShell docs) + Get-Command output.
 *
 * Shared between pathValidation.ts (merges into per-cmdlet known-param sets)
 * and readOnlyValidation.ts (merges into safeFlags check). Split out to break
 * what would otherwise be an import cycle between those two files.
 *
 * Stored lowercase with leading dash — callers `.toLowerCase()` their input.
 */

export const COMMON_SWITCHES = ['-verbose', '-debug']

export const COMMON_VALUE_PARAMS = [
  '-erroraction',
  '-warningaction',
  '-informationaction',
  '-progressaction',
  '-errorvariable',
  '-warningvariable',
  '-informationvariable',
  '-outvariable',
  '-outbuffer',
  '-pipelinevariable',
  '-ea',
  '-wa',
  '-infa',
  '-proga',
]

export const COMMON_PARAMETERS: ReadonlySet<string> = new Set([
  ...COMMON_SWITCHES,
  ...COMMON_VALUE_PARAMS,
])

const ACTION_PREFERENCE_PARAMETERS = [
  '-erroraction',
  '-warningaction',
  '-informationaction',
  '-progressaction',
]

const ACTION_PREFERENCE_ALIASES = ['-ea', '-wa', '-infa', '-proga']

export const SAFE_ACTION_PREFERENCE_VALUES: ReadonlySet<string> = new Set([
  'silentlycontinue',
  '0',
  'stop',
  '1',
  'continue',
  '2',
  'ignore',
  '4',
])

/** PowerShell permits unambiguous common-parameter abbreviations. */
export function isActionPreferenceParameter(parameter: string): boolean {
  if (parameter.length < 2) return false
  return (
    ACTION_PREFERENCE_ALIASES.includes(parameter) ||
    ACTION_PREFERENCE_PARAMETERS.some(full => full.startsWith(parameter))
  )
}
