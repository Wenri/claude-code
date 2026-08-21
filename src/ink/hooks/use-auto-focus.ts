import { useEffect, type RefObject } from 'react'
import type { DOMElement } from '../dom.js'
import { getFocusManager } from '../focus.js'

/**
 * Give a terminal control focus while it is active and reclaim focus when a
 * temporary descendant (for example, an inline editor) closes.
 */
export function useAutoFocus(
  ref: RefObject<DOMElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled || !ref.current) return

    const focusManager = getFocusManager(ref.current)
    focusManager.focus(ref.current)

    return focusManager.subscribe(() => {
      const element = ref.current
      if (!element || focusManager.activeElement === element) return

      if (!focusManager.activeElement) {
        focusManager.focus(element)
        return
      }

      let parent = element.parentNode
      while (parent) {
        if (parent === focusManager.activeElement) {
          focusManager.focus(element)
          return
        }
        parent = parent.parentNode
      }
    })
  }, [enabled, ref])
}
