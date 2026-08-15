// Auto mode state functions — lives in its own module so callers can
// conditionally require() it on feature('TRANSCRIPT_CLASSIFIER').

export type AutoModeState = {
  active: boolean
  flagCli: boolean
  // Set by the async verifyAutoModeGateAccess check when it
  // reads a fresh tengu_auto_mode_config.enabled === 'disabled' from GrowthBook.
  // Used by isAutoModeGateEnabled() to block SDK/explicit re-entry after kick-out.
  circuitBroken: boolean
}

export function createAutoModeState(): AutoModeState {
  return {
    active: false,
    flagCli: false,
    circuitBroken: false,
  }
}

let globalAutoModeState = createAutoModeState()

export function setAutoModeActive(active: boolean): void {
  globalAutoModeState.active = active
}

export function isAutoModeActive(): boolean {
  return globalAutoModeState.active
}

export function setAutoModeFlagCli(passed: boolean): void {
  globalAutoModeState.flagCli = passed
}

export function getAutoModeFlagCli(): boolean {
  return globalAutoModeState.flagCli
}

export function setAutoModeCircuitBroken(broken: boolean): void {
  globalAutoModeState.circuitBroken = broken
}

export function isAutoModeCircuitBroken(): boolean {
  return globalAutoModeState.circuitBroken
}

export function _setGlobalAutoModeStateForTesting(state: AutoModeState): void {
  globalAutoModeState = state
}
