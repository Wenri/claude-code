import React, {
  createContext,
  type RefObject,
  useContext,
  useLayoutEffect,
  useMemo,
} from 'react'
import type { Key } from '../ink.js'
import {
  type ChordResolveResult,
  getBindingDisplayText,
  resolveKeyWithChordState,
} from './resolver.js'
import { logKeybindingFired } from './keybindingTelemetry.js'
import type {
  KeybindingContextName,
  ParsedBinding,
  ParsedKeystroke,
} from './types.js'

export type KeybindingHandler = () => void | false | Promise<void>

/** Handler registration for action callbacks. */
export type HandlerRegistration = {
  action: string
  context: KeybindingContextName
  handler: KeybindingHandler
  /** True when the centralized DOM dispatcher may invoke this registration. */
  singleKey?: boolean
}

export type PreDispatchHandler = (input: string, key: Key) => boolean | void

type KeybindingContextValue = {
  resolve: (
    input: string,
    key: Key,
    activeContexts: KeybindingContextName[],
  ) => ChordResolveResult
  setPendingChord: (pending: ParsedKeystroke[] | null) => void
  getDisplayText: (
    action: string,
    context: KeybindingContextName,
  ) => string | undefined
  bindings: ParsedBinding[]
  pendingChord: ParsedKeystroke[] | null
  activeContexts: Set<KeybindingContextName>
  registerActiveContext: (context: KeybindingContextName) => void
  unregisterActiveContext: (context: KeybindingContextName) => void
  registerHandler: (registration: HandlerRegistration) => () => void
  invokeAction: (action: string) => boolean
  registerPreDispatch: (handler: PreDispatchHandler) => () => void
}

const KeybindingContext = createContext<KeybindingContextValue | null>(null)

type ProviderProps = {
  bindings: ParsedBinding[]
  pendingChordRef: RefObject<ParsedKeystroke[] | null>
  pendingChord: ParsedKeystroke[] | null
  setPendingChord: (pending: ParsedKeystroke[] | null) => void
  activeContexts: Set<KeybindingContextName>
  registerActiveContext: (context: KeybindingContextName) => void
  unregisterActiveContext: (context: KeybindingContextName) => void
  handlerRegistryRef: RefObject<Map<string, Set<HandlerRegistration>>>
  preDispatchRef: RefObject<Set<PreDispatchHandler>>
  children: React.ReactNode
}

export function KeybindingProvider({
  bindings,
  pendingChordRef,
  pendingChord,
  setPendingChord,
  activeContexts,
  registerActiveContext,
  unregisterActiveContext,
  handlerRegistryRef,
  preDispatchRef,
  children,
}: ProviderProps): React.ReactNode {
  const value = useMemo<KeybindingContextValue>(() => {
    const getDisplayText = (
      action: string,
      context: KeybindingContextName,
    ): string | undefined =>
      getBindingDisplayText(action, context, bindings)

    const registerPreDispatch = (handler: PreDispatchHandler): (() => void) => {
      preDispatchRef.current.add(handler)
      return () => preDispatchRef.current.delete(handler)
    }

    const registerHandler = (
      registration: HandlerRegistration,
    ): (() => void) => {
      const registry = handlerRegistryRef.current
      if (!registry) return () => {}
      if (!registry.has(registration.action)) {
        registry.set(registration.action, new Set())
      }
      registry.get(registration.action)!.add(registration)
      return () => {
        const handlers = registry.get(registration.action)
        if (!handlers) return
        handlers.delete(registration)
        if (handlers.size === 0) registry.delete(registration.action)
      }
    }

    const invokeAction = (action: string): boolean => {
      const registry = handlerRegistryRef.current
      if (!registry) return false
      const handlers = registry.get(action)
      if (!handlers || handlers.size === 0) return false
      for (const registration of handlers) {
        if (activeContexts.has(registration.context)) {
          registration.handler()
          logKeybindingFired(action)
          return true
        }
      }
      return false
    }

    return {
      resolve: (input, key, contexts) =>
        resolveKeyWithChordState(
          input,
          key,
          contexts,
          bindings,
          pendingChordRef.current,
        ),
      setPendingChord,
      getDisplayText,
      bindings,
      pendingChord,
      activeContexts,
      registerActiveContext,
      unregisterActiveContext,
      registerHandler,
      invokeAction,
      registerPreDispatch,
    }
  }, [
    activeContexts,
    bindings,
    handlerRegistryRef,
    pendingChord,
    pendingChordRef,
    preDispatchRef,
    registerActiveContext,
    setPendingChord,
    unregisterActiveContext,
  ])

  return (
    <KeybindingContext.Provider value={value}>
      {children}
    </KeybindingContext.Provider>
  )
}

export function useKeybindingContext(): KeybindingContextValue {
  const context = useContext(KeybindingContext)
  if (!context) {
    throw new Error(
      'useKeybindingContext must be used within KeybindingProvider',
    )
  }
  return context
}

export function useOptionalKeybindingContext(): KeybindingContextValue | null {
  return useContext(KeybindingContext)
}

export function useRegisterKeybindingContext(
  context: KeybindingContextName,
  isActive = true,
): void {
  const keybindingContext = useOptionalKeybindingContext()
  useLayoutEffect(() => {
    if (!keybindingContext || !isActive) return
    keybindingContext.registerActiveContext(context)
    return () => keybindingContext.unregisterActiveContext(context)
  }, [context, isActive, keybindingContext])
}
