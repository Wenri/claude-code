import React, { useCallback, useState } from 'react'
import type { KeyboardEvent } from '../ink/events/keyboard-event.js'
import type { VimInputState, VimMode } from '../types/textInputTypes.js'
import { Cursor } from '../utils/Cursor.js'
import { lastGrapheme } from '../utils/intl.js'
import {
  executeIndent,
  executeJoin,
  executeOpenLine,
  executeOperatorFind,
  executeOperatorMotion,
  executeOperatorTextObj,
  executeReplace,
  executeToggleCase,
  executeVisualCase,
  executeVisualIndent,
  executeVisualJoin,
  executeVisualOperator,
  executeVisualPaste,
  executeVisualReplace,
  executeX,
  replayVisualCase,
  replayVisualChange,
  replayVisualIndent,
  replayVisualOperator,
  replayVisualPaste,
  replayVisualReplace,
  type OperatorContext,
} from '../vim/operators.js'
import {
  type TransitionContext,
  transition,
  transitionVisual,
} from '../vim/transitions.js'
import {
  createInitialPersistentState,
  createInitialVimState,
  type PersistentState,
  type RecordedChange,
  type VisualKind,
  type VimState,
} from '../vim/types.js'
import { type UseTextInputProps, useTextInput } from './useTextInput.js'

type UseVimInputProps = Omit<UseTextInputProps, 'inputFilter'> & {
  onModeChange?: (mode: VimMode) => void
  onUndo?: () => void
  inputFilter?: UseTextInputProps['inputFilter']
}

const IGNORED_VIM_KEY_NAMES = new Set([
  'backspace',
  'delete',
  'tab',
  'home',
  'end',
  'pageup',
  'pagedown',
  'insert',
  'clear',
  'enter',
  'center',
  'undefined',
  'mouse',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
])

export function useVimInput(props: UseVimInputProps): VimInputState {
  const vimStateRef = React.useRef<VimState>(createInitialVimState())
  const [mode, setMode] = useState<VimMode>('INSERT')
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)

  const persistentRef = React.useRef<PersistentState>(
    createInitialPersistentState(),
  )

  const { onModeChange, inputFilter } = props
  const textInput = useTextInput({
    ...props,
    selectionAnchor,
    selectionLinewise: mode === 'VISUAL LINE',
    inputFilter: (input, event) => {
      const filtered = inputFilter ? inputFilter(input, event) : input
      const state = vimStateRef.current
      if (
        state.mode === 'INSERT' &&
        !event.ctrl &&
        !event.meta &&
        [...input].length === 1
      ) {
        vimStateRef.current = {
          mode: 'INSERT',
          insertedText: state.insertedText + filtered,
        }
      }
      return filtered
    },
  })

  const switchToInsertMode = useCallback(
    (offset?: number): void => {
      if (offset !== undefined) {
        textInput.setOffset(offset)
      }
      vimStateRef.current = { mode: 'INSERT', insertedText: '' }
      setMode('INSERT')
      setSelectionAnchor(null)
      onModeChange?.('INSERT')
    },
    [textInput, onModeChange],
  )

  const switchToNormalMode = useCallback((): void => {
    const current = vimStateRef.current
    if (current.mode === 'INSERT') {
      const lastChange = persistentRef.current.lastChange
      if (lastChange?.type === 'visualOp' && lastChange.op === 'change') {
        persistentRef.current.lastChange = {
          type: 'visualChange',
          span: lastChange.span,
          linewise: lastChange.linewise,
          text: current.insertedText,
        }
      } else if (current.insertedText) {
        persistentRef.current.lastChange = {
          type: 'insert',
          text: current.insertedText,
        }
      }

      // Vim behavior: move cursor left by 1 when exiting insert mode
      // (unless at beginning of line or at offset 0)
      const offset = textInput.offset
      if (offset > 0 && props.value[offset - 1] !== '\n') {
        textInput.setOffset(offset - 1)
      }
    }

    vimStateRef.current = { mode: 'NORMAL', command: { type: 'idle' } }
    setMode('NORMAL')
    setSelectionAnchor(null)
    onModeChange?.('NORMAL')
  }, [onModeChange, textInput, props.value])

  const switchToVisualMode = useCallback(
    (anchor: number, kind: VisualKind): void => {
      vimStateRef.current = {
        mode: 'VISUAL',
        kind,
        anchor,
        command: { type: 'idle' },
      }
      const nextMode = kind === 'line' ? 'VISUAL LINE' : 'VISUAL'
      setMode(nextMode)
      setSelectionAnchor(anchor)
      onModeChange?.(nextMode)
    },
    [onModeChange],
  )

  function createOperatorContext(
    cursor: Cursor,
    isReplay: boolean = false,
  ): OperatorContext {
    return {
      cursor,
      text: props.value,
      setText: (newText: string) => props.onChange(newText),
      setOffset: (offset: number) => textInput.setOffset(offset),
      enterInsert: (offset: number) => switchToInsertMode(offset),
      getRegister: () => persistentRef.current.register,
      setRegister: (content: string, linewise: boolean) => {
        persistentRef.current.register = content
        persistentRef.current.registerIsLinewise = linewise
      },
      getLastFind: () => persistentRef.current.lastFind,
      setLastFind: (type, char) => {
        persistentRef.current.lastFind = { type, char }
      },
      recordChange: isReplay
        ? () => {}
        : (change: RecordedChange) => {
            persistentRef.current.lastChange = change
          },
    }
  }

  function replayLastChange(): void {
    const change = persistentRef.current.lastChange
    if (!change) return

    const cursor = Cursor.fromText(props.value, props.columns, textInput.offset)
    const ctx = createOperatorContext(cursor, true)

    switch (change.type) {
      case 'insert':
        if (change.text) {
          const newCursor = cursor.insert(change.text)
          props.onChange(newCursor.text)
          textInput.setOffset(newCursor.offset)
        }
        break

      case 'x':
        executeX(change.count, ctx)
        break

      case 'replace':
        executeReplace(change.char, change.count, ctx)
        break

      case 'toggleCase':
        executeToggleCase(change.count, ctx)
        break

      case 'indent':
        executeIndent(change.dir, change.count, ctx)
        break

      case 'join':
        executeJoin(change.count, ctx)
        break

      case 'openLine':
        executeOpenLine(change.direction, ctx)
        break

      case 'operator':
        executeOperatorMotion(change.op, change.motion, change.count, ctx)
        break

      case 'operatorFind':
        executeOperatorFind(
          change.op,
          change.find,
          change.char,
          change.count,
          ctx,
        )
        break

      case 'operatorTextObj':
        executeOperatorTextObj(
          change.op,
          change.scope,
          change.objType,
          change.count,
          ctx,
        )
        break

      case 'visualOp':
        replayVisualOperator(change.op, change.span, change.linewise, ctx)
        break

      case 'visualReplace':
        replayVisualReplace(
          change.char,
          change.span,
          change.linewise,
          ctx,
        )
        break

      case 'visualCase':
        replayVisualCase(
          change.caseOp,
          change.span,
          change.linewise,
          ctx,
        )
        break

      case 'visualPaste':
        replayVisualPaste(
          change.content,
          change.span,
          change.linewise,
          ctx,
        )
        break

      case 'visualIndent':
        replayVisualIndent(change.dir, change.count, change.lines, ctx)
        break

      case 'visualChange':
        replayVisualChange(change.span, change.linewise, change.text, ctx)
        break
    }
  }

  function processNormalSequence(sequence: string): void {
    let text = props.value
    let offset = textInput.offset
    const chars = [...sequence]

    for (let index = 0; index < chars.length; index++) {
      const state = vimStateRef.current
      if (state.mode === 'INSERT') {
        const remaining = chars.slice(index).join('')
        const nextCursor = Cursor.fromText(
          text,
          props.columns,
          offset,
        ).insert(remaining)
        props.onChange(nextCursor.text)
        textInput.setOffset(nextCursor.offset)
        vimStateRef.current = {
          mode: 'INSERT',
          insertedText: state.insertedText + remaining,
        }
        return
      }
      if (state.mode !== 'NORMAL') return

      const input = chars[index]!
      if (
        (input === 'v' || input === 'V') &&
        (state.command.type === 'idle' || state.command.type === 'count')
      ) {
        switchToVisualMode(offset, input === 'V' ? 'line' : 'char')
        return
      }

      const cursor = Cursor.fromText(text, props.columns, offset)
      const ctx: TransitionContext = {
        ...createOperatorContext(cursor, false),
        text,
        setText: newText => {
          text = newText
          props.onChange(newText)
        },
        setOffset: newOffset => {
          offset = newOffset
          textInput.setOffset(newOffset)
        },
        enterInsert: newOffset => {
          offset = newOffset
          switchToInsertMode(newOffset)
        },
        onDotRepeat: replayLastChange,
      }
      const result = transition(state.command, input, ctx)
      result.execute?.()
      if (vimStateRef.current.mode === 'NORMAL') {
        if (result.next) {
          vimStateRef.current = { mode: 'NORMAL', command: result.next }
        } else if (result.execute) {
          vimStateRef.current = { mode: 'NORMAL', command: { type: 'idle' } }
        }
      }
    }
  }

  function handleVimInput(event: KeyboardEvent): void {
    const state = vimStateRef.current
    const input = event.key
    const cursor = Cursor.fromText(props.value, props.columns, textInput.offset)
    const applyInputFilter = (): void => {
      inputFilter?.(event.key, event)
    }

    if (event.ctrl || event.meta) {
      if (state.mode === 'VISUAL') {
        applyInputFilter()
        switchToNormalMode()
        event.preventDefault()
        return
      }
      textInput.handleKeyDown(event)
      return
    }

    // NOTE(keybindings): This escape handler is intentionally NOT migrated to the keybindings system.
    // It's vim's standard INSERT->NORMAL mode switch - a vim-specific behavior that should not be
    // configurable via keybindings. Vim users expect Esc to always exit INSERT mode.
    if (event.name === 'escape' && state.mode === 'INSERT') {
      applyInputFilter()
      switchToNormalMode()
      if (!props.disableEscapeDoublePress) event.preventDefault()
      return
    }

    // Escape in NORMAL mode cancels any pending command (replace, operator, etc.)
    if (event.name === 'escape' && state.mode === 'NORMAL') {
      applyInputFilter()
      vimStateRef.current = { mode: 'NORMAL', command: { type: 'idle' } }
      if (!props.disableEscapeDoublePress) event.preventDefault()
      return
    }

    if (event.name === 'escape' && state.mode === 'VISUAL') {
      applyInputFilter()
      if (state.command.type !== 'idle') {
        vimStateRef.current = { ...state, command: { type: 'idle' } }
      } else {
        switchToNormalMode()
      }
      if (!props.disableEscapeDoublePress) event.preventDefault()
      return
    }

    // Pass Enter to base handler outside visual mode (allows submission from NORMAL)
    if (event.name === 'return' && state.mode !== 'VISUAL') {
      textInput.handleKeyDown(event)
      return
    }

    if (state.mode === 'INSERT') {
      // Track inserted text for dot-repeat
      if (event.name === 'backspace' || event.name === 'delete') {
        if (state.insertedText.length > 0) {
          vimStateRef.current = {
            mode: 'INSERT',
            insertedText: state.insertedText.slice(
              0,
              -(lastGrapheme(state.insertedText).length || 1),
            ),
          }
        }
      }
      textInput.handleKeyDown(event)
      return
    }

    if (state.mode === 'VISUAL') {
      const ctx: TransitionContext = {
        ...createOperatorContext(cursor, false),
        onUndo: props.onUndo,
        onDotRepeat: replayLastChange,
      }
      const expectsMotion =
        state.command.type === 'idle' || state.command.type === 'count'

      let vimInput = input
      if (event.name === 'left') vimInput = expectsMotion ? 'h' : ''
      else if (event.name === 'right') vimInput = expectsMotion ? 'l' : ''
      else if (event.name === 'up') vimInput = expectsMotion ? 'k' : ''
      else if (event.name === 'down') vimInput = expectsMotion ? 'j' : ''
      else if (event.name === 'return') vimInput = expectsMotion ? 'j' : '\n'
      else if (event.name === 'backspace') vimInput = expectsMotion ? 'h' : ''
      else if (event.name === 'delete') {
        vimInput =
          expectsMotion && state.command.type !== 'count' ? 'x' : ''
      } else if (input === '' || IGNORED_VIM_KEY_NAMES.has(event.name)) {
        event.preventDefault()
        return
      } else if ([...input].length > 1) {
        event.preventDefault()
        return
      }

      applyInputFilter()
      const result = transitionVisual(state.command, vimInput, ctx)
      const linewise = state.kind === 'line'
      if ('next' in result) {
        result.move?.()
        vimStateRef.current = {
          mode: 'VISUAL',
          kind: state.kind,
          anchor: state.anchor,
          command: result.next,
        }
      } else if (result.exit === 'operator') {
        executeVisualOperator(
          result.op,
          state.anchor,
          ctx,
          linewise || result.forceLinewise === true,
        )
        if (vimStateRef.current.mode === 'VISUAL') switchToNormalMode()
      } else if (result.exit === 'replace') {
        executeVisualReplace(result.char, state.anchor, ctx, linewise)
        switchToNormalMode()
      } else if (result.exit === 'case') {
        executeVisualCase(result.op, state.anchor, ctx, linewise)
        switchToNormalMode()
      } else if (result.exit === 'paste') {
        executeVisualPaste(state.anchor, ctx, linewise)
        switchToNormalMode()
      } else if (result.exit === 'join') {
        executeVisualJoin(state.anchor, ctx)
        switchToNormalMode()
      } else if (result.exit === 'indent') {
        executeVisualIndent(result.dir, result.count, state.anchor, ctx)
        switchToNormalMode()
      } else if (result.exit === 'swap') {
        const oldCursor = cursor.offset
        textInput.setOffset(state.anchor)
        vimStateRef.current = {
          mode: 'VISUAL',
          kind: state.kind,
          anchor: oldCursor,
          command: { type: 'idle' },
        }
        setSelectionAnchor(oldCursor)
      } else if (result.exit === 'selectRange') {
        const newCursor =
          result.end > result.start
            ? cursor.measuredText.prevOffset(result.end)
            : result.start
        textInput.setOffset(newCursor)
        vimStateRef.current = {
          mode: 'VISUAL',
          kind: state.kind,
          anchor: result.start,
          command: { type: 'idle' },
        }
        setSelectionAnchor(result.start)
      } else {
        const nextKind: VisualKind = result.key === 'V' ? 'line' : 'char'
        if (nextKind === state.kind) switchToNormalMode()
        else switchToVisualMode(state.anchor, nextKind)
      }
      event.preventDefault()
      return
    }

    if (state.mode !== 'NORMAL') return

    // In idle state, delegate arrow keys to base handler for cursor movement
    // and history fallback (upOrHistoryUp / downOrHistoryDown)
    if (
      state.command.type === 'idle' &&
      (event.name === 'up' || event.name === 'down') &&
      !event.shift
    ) {
      textInput.handleKeyDown(event)
      return
    }

    applyInputFilter()
    const ctx: TransitionContext = {
      ...createOperatorContext(cursor, false),
      onUndo: props.onUndo,
      onDotRepeat: replayLastChange,
    }

    if (state.command.type === 'idle') {
      if (input === 'j' && cursor.down().equals(cursor)) {
        if (!props.multiline || cursor.downLogicalLine().equals(cursor)) {
          props.onHistoryDown?.()
          event.preventDefault()
          return
        }
      }
      if (input === 'k' && cursor.up().equals(cursor)) {
        if (!props.multiline || cursor.upLogicalLine().equals(cursor)) {
          props.onHistoryUp?.()
          event.preventDefault()
          return
        }
      }
    }

    // Backspace/Delete are only mapped in motion-expecting states. In
    // literal-char states (replace, find, operatorFind), mapping would turn
    // r+Backspace into "replace with h" and df+Delete into "delete to next x".
    // Delete additionally skips count state: in vim, N<Del> removes a count
    // digit rather than executing Nx; we don't implement digit removal but
    // should at least not turn a cancel into a destructive Nx.
    const expectsMotion =
      state.command.type === 'idle' ||
      state.command.type === 'count' ||
      state.command.type === 'operator' ||
      state.command.type === 'operatorCount'

    // Map arrow keys to vim motions in NORMAL mode
    let vimInput = input
    if (event.name === 'left') vimInput = 'h'
    else if (event.name === 'right') vimInput = 'l'
    else if (event.name === 'up') vimInput = 'k'
    else if (event.name === 'down') vimInput = 'j'
    else if (expectsMotion && event.name === 'backspace') vimInput = 'h'
    else if (
      expectsMotion &&
      state.command.type !== 'count' &&
      event.name === 'delete'
    )
      vimInput = 'x'
    else if (input === '' || IGNORED_VIM_KEY_NAMES.has(event.name)) return
    else if ([...input].length > 1) {
      processNormalSequence(input)
      event.preventDefault()
      return
    }

    if (
      (vimInput === 'v' || vimInput === 'V') &&
      (state.command.type === 'idle' || state.command.type === 'count')
    ) {
      switchToVisualMode(
        cursor.offset,
        vimInput === 'V' ? 'line' : 'char',
      )
      return
    }

    const result = transition(state.command, vimInput, ctx)

    if (result.execute) {
      result.execute()
    }

    // Update command state (only if execute didn't switch to INSERT)
    if (vimStateRef.current.mode === 'NORMAL') {
      if (result.next) {
        vimStateRef.current = { mode: 'NORMAL', command: result.next }
      } else if (result.execute) {
        vimStateRef.current = { mode: 'NORMAL', command: { type: 'idle' } }
      }
    }

    if (
      input === '?' &&
      state.mode === 'NORMAL' &&
      state.command.type === 'idle'
    ) {
      props.onChange('?')
    }
    event.preventDefault()
  }

  const setModeExternal = useCallback(
    (newMode: VimMode) => {
      if (newMode === 'INSERT') {
        vimStateRef.current = { mode: 'INSERT', insertedText: '' }
        setSelectionAnchor(null)
      } else if (newMode === 'NORMAL') {
        vimStateRef.current = { mode: 'NORMAL', command: { type: 'idle' } }
        setSelectionAnchor(null)
      } else {
        const kind = newMode === 'VISUAL LINE' ? 'line' : 'char'
        const anchor = textInput.offset
        vimStateRef.current = {
          mode: 'VISUAL',
          kind,
          anchor,
          command: { type: 'idle' },
        }
        setSelectionAnchor(anchor)
      }
      setMode(newMode)
      onModeChange?.(newMode)
    },
    [onModeChange, textInput.offset],
  )

  return {
    ...textInput,
    handleKeyDown: handleVimInput,
    mode,
    setMode: setModeExternal,
  }
}
