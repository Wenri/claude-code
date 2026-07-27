export const KEEP_MARKETPLACE_ON_FAILURE_ENV =
  'CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE'

export const DANGEROUS_DIRECTORY_ADDITION = '.husky'

export const IPCONFIG_READ_ONLY_FLAGS = ['/all', '/allcompartments']

function isTruthyEnvironmentValue(value) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase().trim())
}

export function marketplacePullDisposition({
  pullExitCode,
  keepOnFailure,
}) {
  if (pullExitCode === 0) return 'updated'
  if (isTruthyEnvironmentValue(keepOnFailure)) return 'keep-existing'
  return 'reclone'
}

export function createRateLimitOptionsGate() {
  let hasOpened = false
  return () => {
    if (hasOpened) return false
    hasOpened = true
    return true
  }
}
