import { useCallback, useEffect, useRef } from 'react'
import type { InputEvent } from '../ink/events/input-event.js'
import { type Key, useInput } from '../ink.js'
import { useOptionalKeybindingContext } from './KeybindingContext.js'
import { logKeybindingFired } from './keybindingTelemetry.js'
import { isKeybindingsDomEnabled } from './keybindingsDom.js'
import type { KeybindingContextName } from './types.js'

type Options = {
  context?: KeybindingContextName
  isActive?: boolean
}

const noopInputHandler = (): void => {}

export function useKeybinding(
  action: string,
  handler: () => void | false | Promise<void>,
  options: Options = {},
): void {
  const { context = 'Global', isActive = true } = options
  const keybindingContext = useOptionalKeybindingContext()

  useEffect(() => {
    if (!keybindingContext || !isActive) return
    return keybindingContext.registerHandler({
      action,
      context,
      handler,
      singleKey: true,
    })
  }, [action, context, handler, isActive, keybindingContext])

  const handleInput = useCallback(
    (input: string, key: Key, event: InputEvent) => {
      if (!keybindingContext) return
      const contextsToCheck: KeybindingContextName[] = [
        ...keybindingContext.activeContexts,
        context,
        'Global',
      ]
      const result = keybindingContext.resolve(
        input,
        key,
        [...new Set(contextsToCheck)],
      )

      switch (result.type) {
        case 'match':
          keybindingContext.setPendingChord(null)
          if (result.action === action && handler() !== false) {
            logKeybindingFired(result.action)
            event.stopImmediatePropagation()
          }
          break
        case 'chord_started':
          keybindingContext.setPendingChord(result.pending)
          event.stopImmediatePropagation()
          break
        case 'chord_cancelled':
          keybindingContext.setPendingChord(null)
          break
        case 'unbound':
          keybindingContext.setPendingChord(null)
          break
        case 'none':
          break
      }
    },
    [action, context, handler, keybindingContext],
  )

  useInput(isKeybindingsDomEnabled() ? noopInputHandler : handleInput, {
    isActive,
  })
}

export function useKeybindings(
  handlers: Record<string, () => void | false | Promise<void>>,
  options: Options = {},
): void {
  const { context = 'Global', isActive = true } = options
  const keybindingContext = useOptionalKeybindingContext()

  useEffect(() => {
    if (!keybindingContext || !isActive) return
    const unregisterFns: Array<() => void> = []
    for (const [action, handler] of Object.entries(handlers)) {
      unregisterFns.push(
        keybindingContext.registerHandler({
          action,
          context,
          handler,
          singleKey: true,
        }),
      )
    }
    return () => {
      for (const unregister of unregisterFns) unregister()
    }
  }, [context, handlers, isActive, keybindingContext])

  const handleInput = useCallback(
    (input: string, key: Key, event: InputEvent) => {
      if (!keybindingContext) return
      const contextsToCheck: KeybindingContextName[] = [
        ...keybindingContext.activeContexts,
        context,
        'Global',
      ]
      const result = keybindingContext.resolve(
        input,
        key,
        [...new Set(contextsToCheck)],
      )

      switch (result.type) {
        case 'match': {
          keybindingContext.setPendingChord(null)
          if (result.action in handlers) {
            const handler = handlers[result.action]
            if (handler && handler() !== false) {
              logKeybindingFired(result.action)
              event.stopImmediatePropagation()
            }
          }
          break
        }
        case 'chord_started':
          keybindingContext.setPendingChord(result.pending)
          event.stopImmediatePropagation()
          break
        case 'chord_cancelled':
          keybindingContext.setPendingChord(null)
          break
        case 'unbound':
          keybindingContext.setPendingChord(null)
          break
        case 'none':
          break
      }
    },
    [context, handlers, keybindingContext],
  )

  useInput(isKeybindingsDomEnabled() ? noopInputHandler : handleInput, {
    isActive,
  })
}

export function usePreDispatch(
  handler: (input: string, key: Key) => boolean | void,
  { isActive = true }: Pick<Options, 'isActive'> = {},
): void {
  const keybindingContext = useOptionalKeybindingContext()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!isActive || !keybindingContext) return
    return keybindingContext.registerPreDispatch((input, key) =>
      handlerRef.current(input, key),
    )
  }, [isActive, keybindingContext])

  useInput(
    isKeybindingsDomEnabled()
      ? noopInputHandler
      : (input, key, event) => {
          if (handlerRef.current(input, key) === true) {
            event.stopImmediatePropagation()
          }
        },
    { isActive },
  )
}

/**
 * Run a handler before ordinary single-key keybinding dispatch.
 *
 * The direct input subscription preserves behavior outside the DOM-event
 * route, while the provider registration gives the focus-aware dispatcher the
 * same chance to consume the event before action resolution.
 */
export function useKeybindingPreDispatch(
  handler: (input: string, key: Key) => boolean | void,
  { isActive = true }: Pick<Options, 'isActive'> = {},
): void {
  const keybindingContext = useOptionalKeybindingContext()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!isActive || !keybindingContext) return
    return keybindingContext.registerPreDispatch((input, key) =>
      handlerRef.current(input, key),
    )
  }, [isActive, keybindingContext])

  useInput(
    (input, key, event) => {
      if (handlerRef.current(input, key) === true) {
        event.stopImmediatePropagation()
      }
    },
    { isActive },
  )
}
