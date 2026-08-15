import { useSyncExternalStore } from 'react'
import { createStore } from '../state/store.js'

const promptInputStore = createStore({ value: '' })

/** Subscribe to the prompt value without making the REPL its state owner. */
export function usePromptInputValue(): string {
  return useSyncExternalStore(
    promptInputStore.subscribe,
    () => promptInputStore.getState().value,
    () => promptInputStore.getState().value,
  )
}

/** A narrow subscription for consumers that only care whether input is empty. */
export function useIsPromptInputEmpty(): boolean {
  return useSyncExternalStore(
    promptInputStore.subscribe,
    () => promptInputStore.getState().value === '',
    () => promptInputStore.getState().value === '',
  )
}

export function getPromptInputValue(): string {
  return promptInputStore.getState().value
}

export function setPromptInputValue(value: string): void {
  promptInputStore.setState(previous =>
    previous.value === value ? previous : { value },
  )
}
