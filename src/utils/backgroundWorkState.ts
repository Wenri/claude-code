export type BackgroundWorkState = {
  tasks: number
  queued: number
  kinds: string[]
}

let backgroundWorkState: BackgroundWorkState = {
  tasks: 0,
  queued: 0,
  kinds: [],
}

export function setBackgroundWorkState(state: BackgroundWorkState): void {
  backgroundWorkState = state
}

export function getBackgroundWorkState(): BackgroundWorkState {
  return backgroundWorkState
}
