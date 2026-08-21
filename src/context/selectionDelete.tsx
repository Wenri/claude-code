import React, { createContext, useContext, useMemo, useRef } from 'react'
import type { SelectionState } from '../ink/selection.js'

type SelectionDeleteHandler = (selection: SelectionState) => boolean

type SelectionDeleteContextValue = {
  setHandler(handler: SelectionDeleteHandler | null): void
  tryDelete(selection: SelectionState): boolean
}

const SelectionDeleteContext = createContext<SelectionDeleteContextValue>({
  setHandler: () => {},
  tryDelete: () => false,
})

export function SelectionDeleteProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const handlerRef = useRef<SelectionDeleteHandler | null>(null)
  const value = useMemo<SelectionDeleteContextValue>(
    () => ({
      setHandler: handler => {
        handlerRef.current = handler
      },
      tryDelete: selection => handlerRef.current?.(selection) ?? false,
    }),
    [],
  )
  return (
    <SelectionDeleteContext.Provider value={value}>
      {children}
    </SelectionDeleteContext.Provider>
  )
}

export function useSelectionDelete(): SelectionDeleteContextValue {
  return useContext(SelectionDeleteContext)
}
