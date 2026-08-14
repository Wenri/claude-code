import { useContext, useMemo, useSyncExternalStore } from 'react'
import AppContext from '../components/AppContext.js'
import type { DOMElement } from '../dom.js'
import type { FocusDirection } from '../focus.js'

const noopSubscribe = (): (() => void) => () => {}

export function useFocus(): {
  activeElement: DOMElement | null
  focusNext: () => void
  focusPrevious: () => void
  focusDirection: (direction: FocusDirection) => boolean
  focus: (node: DOMElement) => void
  blur: () => void
  subscribe: (listener: () => void) => () => void
} {
  const { focusManager, rootNode } = useContext(AppContext)
  const activeElement = useSyncExternalStore(
    focusManager?.subscribe ?? noopSubscribe,
    () => focusManager?.activeElement ?? null,
  )

  return useMemo(
    () => ({
      activeElement,
      focusNext: () => {
        if (focusManager && rootNode) focusManager.focusNext(rootNode)
      },
      focusPrevious: () => {
        if (focusManager && rootNode) focusManager.focusPrevious(rootNode)
      },
      focusDirection: (direction: FocusDirection) => {
        if (focusManager && rootNode) {
          return focusManager.focusDirection(direction, rootNode)
        }
        return false
      },
      focus: (node: DOMElement) => focusManager?.focus(node),
      blur: () => focusManager?.blur(),
      subscribe: focusManager?.subscribe ?? noopSubscribe,
    }),
    [activeElement, focusManager, rootNode],
  )
}
