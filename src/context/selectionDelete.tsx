import React, { createContext, useContext, useRef } from 'react'
import type { SelectionState } from '../ink/selection.js'

type SelectionDeleteHandler = (selection: SelectionState) => boolean

export type SelectionDeleteContextValue = {
  setHandler: (handler: SelectionDeleteHandler | null) => void
  tryDelete: (selection: SelectionState) => boolean
}

const SelectionDeleteContext = createContext<SelectionDeleteContextValue>({
  setHandler: () => {},
  tryDelete: () => false,
})

/**
 * Connects the app-wide selection key handler to the currently mounted text
 * input. The handler itself stays input-owned because only PromptInput knows
 * how its wrapped screen coordinates map back to string offsets.
 */
export function SelectionDeleteProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const handlerRef = useRef<SelectionDeleteHandler | null>(null)
  const valueRef = useRef<SelectionDeleteContextValue | null>(null)

  if (valueRef.current === null) {
    valueRef.current = {
      setHandler: handler => {
        handlerRef.current = handler
      },
      tryDelete: selection => handlerRef.current?.(selection) ?? false,
    }
  }

  return (
    <SelectionDeleteContext.Provider value={valueRef.current}>
      {children}
    </SelectionDeleteContext.Provider>
  )
}

export function useSelectionDelete(): SelectionDeleteContextValue {
  return useContext(SelectionDeleteContext)
}
