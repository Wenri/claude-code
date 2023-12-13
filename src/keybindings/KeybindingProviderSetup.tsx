/** Keybinding provider setup, chord routing, and DOM event dispatch. */
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useNotifications } from '../context/notifications.js'
import type { DOMElement } from '../ink/dom.js'
import type { KeyboardEvent } from '../ink/events/keyboard-event.js'
import type { InputEvent } from '../ink/events/input-event.js'
import type { WheelEvent } from '../ink/events/wheel-event.js'
import { getFocusManager } from '../ink/focus.js'
import { Box, type Key, useInput } from '../ink.js'
import { count } from '../utils/array.js'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'
import { plural } from '../utils/stringUtils.js'
import {
  type HandlerRegistration,
  KeybindingProvider,
  type PreDispatchHandler,
  useOptionalKeybindingContext,
} from './KeybindingContext.js'
import { logKeybindingFired } from './keybindingTelemetry.js'
import { isKeybindingsDomEnabled } from './keybindingsDom.js'
import {
  initializeKeybindingWatcher,
  type KeybindingsLoadResult,
  loadKeybindingsSyncWithWarnings,
  subscribeToKeybindingChanges,
} from './loadUserBindings.js'
import { resolveKeyWithChordState } from './resolver.js'
import type {
  KeybindingContextName,
  ParsedBinding,
  ParsedKeystroke,
} from './types.js'

const CHORD_TIMEOUT_MS = 1000
const noopInputHandler = (): void => {}

type Props = { children: React.ReactNode }

function useKeybindingWarnings(
  warnings: KeybindingsLoadResult['warnings'],
  isReload: boolean,
): void {
  const { addNotification, removeNotification } = useNotifications()
  useEffect(() => {
    if (warnings.length === 0) {
      removeNotification('keybinding-config-warning')
      return
    }
    const errorCount = count(warnings, warning => warning.severity === 'error')
    const warnCount = count(warnings, warning => warning.severity === 'warning')
    let message: string
    if (errorCount > 0 && warnCount > 0) {
      message = `Found ${errorCount} keybinding ${plural(errorCount, 'error')} and ${warnCount} ${plural(warnCount, 'warning')}`
    } else if (errorCount > 0) {
      message = `Found ${errorCount} keybinding ${plural(errorCount, 'error')}`
    } else {
      message = `Found ${warnCount} keybinding ${plural(warnCount, 'warning')}`
    }
    addNotification({
      key: 'keybinding-config-warning',
      text: `${message} · /doctor for details`,
      color: errorCount > 0 ? 'error' : 'warning',
      priority: errorCount > 0 ? 'immediate' : 'high',
      timeoutMs: 60_000,
    })
  }, [addNotification, isReload, removeNotification, warnings])
}

export function KeybindingSetup({ children }: Props): React.ReactNode {
  if (useOptionalKeybindingContext()) return children
  return <KeybindingSetupInner>{children}</KeybindingSetupInner>
}

function KeybindingSetupInner({ children }: Props): React.ReactNode {
  const [{ bindings, warnings }, setLoadResult] =
    useState<KeybindingsLoadResult>(() => {
      const result = loadKeybindingsSyncWithWarnings()
      logForDebugging(
        `[keybindings] KeybindingSetup initialized with ${result.bindings.length} bindings, ${result.warnings.length} warnings`,
      )
      return result
    })
  const [isReload, setIsReload] = useState(false)
  useKeybindingWarnings(warnings, isReload)

  const pendingChordRef = useRef<ParsedKeystroke[] | null>(null)
  const [pendingChord, setPendingChordState] = useState<
    ParsedKeystroke[] | null
  >(null)
  const chordTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const handlerRegistryRef = useRef(
    new Map<string, Set<HandlerRegistration>>(),
  )
  const activeContextsRef = useRef<Set<KeybindingContextName>>(new Set())
  const preDispatchRef = useRef<Set<PreDispatchHandler>>(new Set())

  const registerActiveContext = useCallback(
    (context: KeybindingContextName) => activeContextsRef.current.add(context),
    [],
  )
  const unregisterActiveContext = useCallback(
    (context: KeybindingContextName) =>
      activeContextsRef.current.delete(context),
    [],
  )
  const clearChordTimeout = useCallback(() => {
    if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current)
    chordTimeoutRef.current = null
  }, [])
  const setPendingChord = useCallback(
    (pending: ParsedKeystroke[] | null) => {
      clearChordTimeout()
      if (pending !== null) {
        chordTimeoutRef.current = setTimeout(
          (pendingRef, setPending) => {
            logForDebugging('[keybindings] Chord timeout - cancelling')
            pendingRef.current = null
            setPending(null)
          },
          CHORD_TIMEOUT_MS,
          pendingChordRef,
          setPendingChordState,
        )
      }
      pendingChordRef.current = pending
      setPendingChordState(pending)
    },
    [clearChordTimeout],
  )

  useEffect(() => {
    void initializeKeybindingWatcher()
    const unsubscribe = subscribeToKeybindingChanges(result => {
      setIsReload(true)
      setLoadResult(result)
      logForDebugging(
        `[keybindings] Reloaded: ${result.bindings.length} bindings, ${result.warnings.length} warnings`,
      )
    })
    return () => {
      unsubscribe()
      clearChordTimeout()
    }
  }, [clearChordTimeout])

  const interceptor = (
    <ChordInterceptor
      bindings={bindings}
      pendingChordRef={pendingChordRef}
      setPendingChord={setPendingChord}
      activeContexts={activeContextsRef.current}
      handlerRegistryRef={handlerRegistryRef}
      preDispatchRef={preDispatchRef}
    >
      {isKeybindingsDomEnabled() ? children : undefined}
    </ChordInterceptor>
  )

  return (
    <KeybindingProvider
      bindings={bindings}
      pendingChordRef={pendingChordRef}
      pendingChord={pendingChord}
      setPendingChord={setPendingChord}
      activeContexts={activeContextsRef.current}
      registerActiveContext={registerActiveContext}
      unregisterActiveContext={unregisterActiveContext}
      handlerRegistryRef={handlerRegistryRef}
      preDispatchRef={preDispatchRef}
    >
      {isKeybindingsDomEnabled() ? (
        interceptor
      ) : (
        <>
          {interceptor}
          {children}
        </>
      )}
    </KeybindingProvider>
  )
}

type ChordInterceptorProps = {
  bindings: ParsedBinding[]
  pendingChordRef: React.RefObject<ParsedKeystroke[] | null>
  setPendingChord: (pending: ParsedKeystroke[] | null) => void
  activeContexts: Set<KeybindingContextName>
  handlerRegistryRef: React.RefObject<
    Map<string, Set<HandlerRegistration>>
  >
  preDispatchRef: React.RefObject<Set<PreDispatchHandler>>
  children?: React.ReactNode
}

const DOM_KEY_NAMES: Record<string, keyof Key> = {
  up: 'upArrow',
  down: 'downArrow',
  left: 'leftArrow',
  right: 'rightArrow',
  pagedown: 'pageDown',
  pageup: 'pageUp',
  wheelup: 'wheelUp',
  wheeldown: 'wheelDown',
  home: 'home',
  end: 'end',
  return: 'return',
  escape: 'escape',
  tab: 'tab',
  backspace: 'backspace',
  delete: 'delete',
}

function keyboardEventToInput(event: KeyboardEvent): {
  input: string
  key: Key
} {
  const mapped = DOM_KEY_NAMES[event.name]
  const key: Key = {
    upArrow: mapped === 'upArrow',
    downArrow: mapped === 'downArrow',
    leftArrow: mapped === 'leftArrow',
    rightArrow: mapped === 'rightArrow',
    pageDown: mapped === 'pageDown',
    pageUp: mapped === 'pageUp',
    wheelUp: mapped === 'wheelUp',
    wheelDown: mapped === 'wheelDown',
    home: mapped === 'home',
    end: mapped === 'end',
    return: mapped === 'return',
    escape: mapped === 'escape',
    tab: mapped === 'tab',
    backspace: mapped === 'backspace',
    delete: mapped === 'delete',
    ctrl: event.ctrl,
    shift: event.shift,
    fn: event.fn,
    super: event.superKey,
    meta: event.meta || mapped === 'escape',
  }
  return {
    input:
      event.name === 'enter'
        ? '\n'
        : [...event.key].length === 1
          ? event.key
          : '',
    key,
  }
}

function stopDOMEvent(event: KeyboardEvent | WheelEvent): void {
  event.preventDefault()
  event.stopImmediatePropagation()
}

function ChordInterceptor({
  bindings,
  pendingChordRef,
  setPendingChord,
  activeContexts,
  handlerRegistryRef,
  preDispatchRef,
  children,
}: ChordInterceptorProps): React.ReactNode {
  const dispatch = useCallback(
    (
      input: string,
      key: Key,
      stop: () => void,
      domDispatch: boolean,
    ): void => {
      const registry = handlerRegistryRef.current
      const handlerContexts = new Set<KeybindingContextName>()
      if (registry) {
        for (const handlers of registry.values()) {
          for (const registration of handlers) {
            handlerContexts.add(registration.context)
          }
        }
      }
      const contexts: KeybindingContextName[] = [
        ...handlerContexts,
        ...activeContexts,
        'Global',
      ]
      const wasInChord = pendingChordRef.current !== null
      const result = resolveKeyWithChordState(
        input,
        key,
        contexts,
        bindings,
        pendingChordRef.current,
      )

      chordResolution: switch (result.type) {
        case 'chord_started':
          setPendingChord(result.pending)
          stop()
          return
        case 'chord_cancelled':
          setPendingChord(null)
          stop()
          return
        case 'unbound':
          setPendingChord(null)
          if (wasInChord) {
            stop()
            return
          }
          break chordResolution
        case 'match':
          setPendingChord(null)
          if (wasInChord) {
            const handlers = registry?.get(result.action)
            if (handlers) {
              for (const registration of handlers) {
                registration.handler()
                logKeybindingFired(result.action)
                stop()
                break
              }
            }
            return
          }
          break chordResolution
        case 'none':
          break chordResolution
      }

      if (!domDispatch || !registry) return

      for (const preDispatch of preDispatchRef.current) {
        try {
          if (preDispatch(input, key) === true) {
            stop()
            return
          }
        } catch (error) {
          logError(error)
        }
      }

      const resolvedByContext = new Map<
        KeybindingContextName,
        string | null
      >()
      for (const handlers of registry.values()) {
        for (const registration of handlers) {
          if (!registration.singleKey) continue
          let action = resolvedByContext.get(registration.context)
          if (action === undefined) {
            const resolved = resolveKeyWithChordState(
              input,
              key,
              [...activeContexts, registration.context, 'Global'],
              bindings,
              null,
            )
            action = resolved.type === 'match' ? resolved.action : null
            resolvedByContext.set(registration.context, action)
          }
          if (action === registration.action) {
            if (registration.handler() !== false) {
              logKeybindingFired(action)
              stop()
              return
            }
          }
        }
      }
    },
    [
      activeContexts,
      bindings,
      handlerRegistryRef,
      pendingChordRef,
      preDispatchRef,
      setPendingChord,
    ],
  )

  const handleLegacyInput = useCallback(
    (input: string, key: Key, event: InputEvent) => {
      if ((key.wheelUp || key.wheelDown) && pendingChordRef.current === null) {
        return
      }
      dispatch(input, key, () => event.stopImmediatePropagation(), false)
    },
    [dispatch, pendingChordRef],
  )
  useInput(
    isKeybindingsDomEnabled() ? noopInputHandler : handleLegacyInput,
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const { input, key } = keyboardEventToInput(event)
      dispatch(input, key, () => stopDOMEvent(event), true)
    },
    [dispatch],
  )
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const key: Key = {
        upArrow: false,
        downArrow: false,
        leftArrow: false,
        rightArrow: false,
        pageDown: false,
        pageUp: false,
        wheelUp: event.deltaY < 0,
        wheelDown: event.deltaY > 0,
        home: false,
        end: false,
        return: false,
        escape: false,
        tab: false,
        backspace: false,
        delete: false,
        ctrl: event.ctrl,
        shift: event.shift,
        meta: event.meta,
        fn: false,
        super: false,
      }
      dispatch('', key, () => stopDOMEvent(event), true)
    },
    [dispatch],
  )

  const rootRef = useRef<DOMElement | null>(null)
  useLayoutEffect(() => {
    if (!isKeybindingsDomEnabled() || !rootRef.current) return
    const focusManager = getFocusManager(rootRef.current)
    const ensureFocus = (): void => {
      if (rootRef.current && focusManager.activeElement === null) {
        focusManager.focus(rootRef.current)
      }
    }
    ensureFocus()
    return focusManager.subscribe(ensureFocus)
  }, [])

  if (isKeybindingsDomEnabled()) {
    return (
      <Box
        ref={rootRef}
        tabIndex={-1}
        flexDirection="column"
        flexGrow={1}
        onKeyDownCapture={handleKeyDown}
        onWheelCapture={handleWheel}
      >
        {children}
      </Box>
    )
  }
  return <>{children}</>
}
