import { isInputModeCharacter } from 'src/components/PromptInput/inputModes.js'
import { useNotifications } from 'src/context/notifications.js'
import { markBackslashReturnUsed } from '../commands/terminalSetup/terminalSetup.js'
import {
  getLatestKill,
  getNextYank,
  type KillRingStore,
  useKillRing,
} from '../context/killRing.js'
import { addToHistory } from '../history.js'
import type { KeyboardEvent } from '../ink/events/keyboard-event.js'
import type {
  InlineGhostText,
  TextInputState,
} from '../types/textInputTypes.js'
import {
  Cursor,
} from '../utils/Cursor.js'
import { env } from '../utils/env.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import type { ImageDimensions } from '../utils/imageResizer.js'
import { isModifierPressed, prewarmModifiers } from '../utils/modifiers.js'
import { useDoublePress } from './useDoublePress.js'

type MaybeCursor = void | Cursor
type InputHandler = (input: string) => MaybeCursor
type InputMapper = (input: string) => MaybeCursor
const NOOP_HANDLER: InputHandler = () => {}
const IGNORED_KEY_NAMES = new Set([
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
function mapInput(input_map: Array<[string, InputHandler]>): InputMapper {
  const map = new Map(input_map)
  return function (input: string): MaybeCursor {
    return (map.get(input) ?? NOOP_HANDLER)(input)
  }
}

export type UseTextInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  onExit?: () => void
  onExitMessage?: (show: boolean, key?: string) => void
  onLeftArrowOnEmpty?: () => void
  onLeftArrowOnEmptyMessage?: (show: boolean) => void
  onHistoryUp?: () => void
  onHistoryDown?: () => void
  onHistoryReset?: () => void
  onClearInput?: () => void
  focus?: boolean
  mask?: string
  multiline?: boolean
  cursorChar: string
  highlightPastedText?: boolean
  invert: (text: string) => string
  themeText: (text: string) => string
  columns: number
  onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
  disableCursorMovementForUpDownKeys?: boolean
  disableEscapeDoublePress?: boolean
  maxVisibleLines?: number
  externalOffset: number
  onOffsetChange: (offset: number) => void
  inputFilter?: (input: string, event: KeyboardEvent) => string
  inlineGhostText?: InlineGhostText
  dim?: (text: string) => string
  selectionAnchor?: number | null
  selectionLinewise?: boolean
  killRing?: KillRingStore
}

export function useTextInput({
  value: originalValue,
  onChange,
  onSubmit,
  onExit,
  onExitMessage,
  onLeftArrowOnEmpty,
  onLeftArrowOnEmptyMessage,
  onHistoryUp,
  onHistoryDown,
  onHistoryReset,
  onClearInput,
  mask = '',
  multiline = false,
  cursorChar,
  invert,
  columns,
  onImagePaste: _onImagePaste,
  disableCursorMovementForUpDownKeys = false,
  disableEscapeDoublePress = false,
  maxVisibleLines,
  externalOffset,
  onOffsetChange,
  inputFilter,
  inlineGhostText,
  dim,
  selectionAnchor,
  selectionLinewise = false,
  killRing: killRingOverride,
}: UseTextInputProps): TextInputState {
  const defaultKillRing = useKillRing()
  const killRing = killRingOverride ?? defaultKillRing
  // Pre-warm the modifiers module for Apple Terminal (has internal guard, safe to call multiple times)
  if (env.terminal === 'Apple_Terminal') {
    prewarmModifiers()
  }

  const offset = externalOffset
  const setOffset = onOffsetChange
  let cursor = Cursor.fromText(originalValue, columns, offset)
  let submitted = false
  const { addNotification, removeNotification } = useNotifications()

  const handleCtrlC = useDoublePress(
    show => {
      onExitMessage?.(show, 'Ctrl-C')
    },
    () => onExit?.(),
    () => {
      if (originalValue) {
        onChange('')
        setOffset(0)
        onHistoryReset?.()
      }
    },
  )

  // NOTE(keybindings): This escape handler is intentionally NOT migrated to the keybindings system.
  // It's a text-level double-press escape for clearing input, not an action-level keybinding.
  // Double-press Esc clears the input and saves to history - this is text editing behavior,
  // not dialog dismissal, and needs the double-press safety mechanism.
  const handleEscape = useDoublePress(
    (show: boolean) => {
      if (!originalValue || !show) {
        return
      }
      addNotification({
        key: 'escape-again-to-clear',
        text: 'Esc again to clear',
        priority: 'immediate',
        timeoutMs: 1000,
      })
    },
    () => {
      // Remove the "Esc again to clear" notification immediately
      removeNotification('escape-again-to-clear')
      onClearInput?.()
      if (originalValue) {
        // Track double-escape usage for feature discovery
        // Save to history before clearing
        if (originalValue.trim() !== '') {
          addToHistory(originalValue)
        }
        onChange('')
        setOffset(0)
        onHistoryReset?.()
      }
    },
  )

  const handleEmptyCtrlD = useDoublePress(
    show => {
      if (originalValue !== '') {
        return
      }
      onExitMessage?.(show, 'Ctrl-D')
    },
    () => {
      if (originalValue !== '') {
        return
      }
      onExit?.()
    },
  )

  const handleEmptyLeft = useDoublePress(
    show => onLeftArrowOnEmptyMessage?.(show),
    () => onLeftArrowOnEmpty?.(),
  )

  function handleCtrlD(): MaybeCursor {
    if (cursor.text === '') {
      // When input is empty, handle double-press
      handleEmptyCtrlD()
      return cursor
    }
    // When input is not empty, delete forward like iPython
    return cursor.del()
  }

  function killToLineEnd(): Cursor {
    const { cursor: newCursor, killed } = cursor.deleteToLineEnd()
    killRing.dispatch({ type: 'kill', text: killed, direction: 'append' })
    return newCursor
  }

  function killToLineStart(): Cursor {
    const { cursor: newCursor, killed } = cursor.deleteToLineStart()
    killRing.dispatch({ type: 'kill', text: killed, direction: 'prepend' })
    if (killed.length >= 3) {
      addNotification({
        key: 'kill-paste-hint',
        text: 'Ctrl+Y to paste deleted text',
        priority: 'immediate',
        timeoutMs: 5000,
      })
    }
    return newCursor
  }

  function killWordBefore(): Cursor {
    const { cursor: newCursor, killed } = cursor.deleteWordBefore()
    killRing.dispatch({ type: 'kill', text: killed, direction: 'prepend' })
    return newCursor
  }

  function yank(): Cursor {
    const text = getLatestKill(killRing.state)
    if (text.length > 0) {
      const startOffset = cursor.offset
      const newCursor = cursor.insert(text)
      killRing.dispatch({ type: 'yank', start: startOffset, length: text.length })
      return newCursor
    }
    return cursor
  }

  function handleYankPop(): Cursor {
    const popResult = getNextYank(killRing.state)
    if (!popResult) {
      return cursor
    }
    const { text, start, length } = popResult
    killRing.dispatch({ type: 'yankPop' })
    // Replace the previously yanked text with the new one
    const before = cursor.text.slice(0, start)
    const after = cursor.text.slice(start + length)
    const newText = before + text + after
    const newOffset = start + text.length
    killRing.dispatch({ type: 'updateYankLength', length: text.length })
    return Cursor.fromText(newText, columns, newOffset)
  }

  const handleCtrl = mapInput([
    ['a', () => cursor.startOfLogicalLine()],
    ['b', () => cursor.left()],
    ['c', () => {
      handleCtrlC()
      return cursor
    }],
    ['d', handleCtrlD],
    ['e', () => cursor.endOfLogicalLine()],
    ['f', () => cursor.right()],
    ['h', () => cursor.deleteTokenBefore() ?? cursor.backspace()],
    ['k', killToLineEnd],
    ['n', () => downOrHistoryDown()],
    ['p', () => upOrHistoryUp()],
    ['u', killToLineStart],
    ['w', killWordBefore],
    ['y', yank],
  ])

  const handleMeta = mapInput([
    ['b', () => cursor.prevWord()],
    ['f', () => cursor.nextWord()],
    ['d', () => cursor.deleteWordAfter()],
    ['y', handleYankPop],
  ])

  function handleEnter(event: KeyboardEvent) {
    if (
      multiline &&
      cursor.offset > 0 &&
      cursor.text[cursor.offset - 1] === '\\'
    ) {
      // Track that the user has used backslash+return
      markBackslashReturnUsed()
      return cursor.backspace().insert('\n')
    }
    // Meta+Enter or Shift+Enter inserts a newline
    if (event.meta || event.shift) {
      return cursor.insert('\n')
    }
    // Apple Terminal doesn't support custom Shift+Enter keybindings,
    // so we use native macOS modifier detection to check if Shift is held
    if (env.terminal === 'Apple_Terminal' && isModifierPressed('shift')) {
      return cursor.insert('\n')
    }
    if (onSubmit) {
      onSubmit(cursor.text)
      submitted = true
    }
    return cursor
  }

  function upOrHistoryUp() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryUp?.()
      return cursor
    }
    // Try to move by wrapped lines first
    const cursorUp = cursor.up()
    if (!cursorUp.equals(cursor)) {
      return cursorUp
    }

    // If we can't move by wrapped lines and this is multiline input,
    // try to move by logical lines (to handle paragraph boundaries)
    if (multiline) {
      const cursorUpLogical = cursor.upLogicalLine()
      if (!cursorUpLogical.equals(cursor)) {
        return cursorUpLogical
      }
    }

    // Can't move up at all - trigger history navigation
    onHistoryUp?.()
    return cursor
  }
  function downOrHistoryDown() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryDown?.()
      return cursor
    }
    // Try to move by wrapped lines first
    const cursorDown = cursor.down()
    if (!cursorDown.equals(cursor)) {
      return cursorDown
    }

    // If we can't move by wrapped lines and this is multiline input,
    // try to move by logical lines (to handle paragraph boundaries)
    if (multiline) {
      const cursorDownLogical = cursor.downLogicalLine()
      if (!cursorDownLogical.equals(cursor)) {
        return cursorDownLogical
      }
    }

    // Can't move down at all - trigger history navigation
    onHistoryDown?.()
    return cursor
  }

  function mapKey(event: KeyboardEvent): InputMapper {
    switch (event.name) {
      case 'escape':
        return () => {
          if (disableEscapeDoublePress) return
          handleEscape()
          return cursor
        }
      case 'left':
        if (event.superKey) return () => cursor.startOfLine()
        if (event.ctrl || event.meta || event.fn) {
          return () => cursor.prevWord()
        }
        if (onLeftArrowOnEmpty && !event.shift && cursor.text === '') {
          return () => {
            if (onLeftArrowOnEmptyMessage) handleEmptyLeft()
            else onLeftArrowOnEmpty()
            return cursor
          }
        }
        return () => cursor.left()
      case 'right':
        if (event.superKey) return () => cursor.endOfLine()
        if (event.ctrl || event.meta || event.fn) {
          return () => cursor.nextWord()
        }
        return () => cursor.right()
      case 'up':
        if (event.shift || event.ctrl || event.meta) return NOOP_HANDLER
        return upOrHistoryUp
      case 'down':
        if (event.shift || event.ctrl || event.meta) return NOOP_HANDLER
        return downOrHistoryDown
      case 'backspace':
        if (event.superKey) return killToLineStart
        return event.meta || event.ctrl
          ? killWordBefore
          : () => cursor.deleteTokenBefore() ?? cursor.backspace()
      case 'delete':
        if (event.superKey || event.meta) return killToLineEnd
        return () => cursor.del()
      case 'home':
        if (event.ctrl) return NOOP_HANDLER
        return () => cursor.startOfLine()
      case 'end':
        if (event.ctrl) return NOOP_HANDLER
        return () => cursor.endOfLine()
      case 'pagedown':
        if (isFullscreenEnvEnabled() || event.ctrl) return NOOP_HANDLER
        return () => cursor.endOfLine()
      case 'pageup':
        if (isFullscreenEnvEnabled() || event.ctrl) return NOOP_HANDLER
        return () => cursor.startOfLine()
      case 'return':
        if (event.ctrl) return NOOP_HANDLER
        return () => handleEnter(event)
      case 'enter':
        return () => cursor.insert('\n')
      case 'tab':
        return NOOP_HANDLER
    }

    if (event.ctrl) return handleCtrl
    if (event.meta) return handleMeta
    if (IGNORED_KEY_NAMES.has(event.name)) return NOOP_HANDLER
    return function (input: string) {
      if (input.length === 0) return
      if (cursor.isAtStart() && isInputModeCharacter(input)) {
        return cursor.insert(input).left()
      }
      return cursor.insert(input)
    }
  }

  // Check if this is a kill command (Ctrl+K, Ctrl+U, Ctrl+W, or Meta+Backspace/Delete)
  function isKillKey(event: KeyboardEvent): boolean {
    if (
      event.ctrl &&
      (event.key === 'k' || event.key === 'u' || event.key === 'w')
    ) {
      return true
    }
    if (
      event.name === 'backspace' &&
      (event.meta || event.superKey || event.ctrl)
    ) return true
    return event.name === 'delete' && (event.meta || event.superKey)
  }

  // Check if this is a yank command (Ctrl+Y or Alt+Y)
  function isYankKey(event: KeyboardEvent): boolean {
    return (event.ctrl || event.meta) && event.key === 'y'
  }

  function handleKeyDown(event: KeyboardEvent): void {
    // Note: Image paste shortcut (chat:imagePaste) is handled via useKeybindings in PromptInput

    // Apply filter if provided
    const input = event.key
    const filteredInput = inputFilter ? inputFilter(input, event) : input

    // If the input was filtered out, do nothing
    if (filteredInput === '' && input !== '') {
      event.preventDefault()
      return
    }

    if (!isKillKey(event) && !isYankKey(event)) {
      killRing.dispatch({ type: 'interrupt' })
    }

    const nextCursor = mapKey(event)(filteredInput)
    if (nextCursor) {
      event.preventDefault()
      if (!cursor.equals(nextCursor)) {
        if (cursor.text !== nextCursor.text) {
          onChange(nextCursor.text)
        }
        setOffset(nextCursor.offset)
      }
    }
    if (submitted) {
      submitted = false
      cursor = Cursor.fromText('', columns, 0)
    }
  }

  // Prepare ghost text for rendering - validate insertPosition matches current
  // cursor offset to prevent stale ghost text from a previous keystroke causing
  // a one-frame jitter (ghost text state is updated via useEffect after render)
  const ghostTextForRender =
    inlineGhostText && dim && inlineGhostText.insertPosition === offset
      ? { text: inlineGhostText.text, dim }
      : undefined

  const cursorPos = cursor.getPosition()

  return {
    handleKeyDown,
    renderedValue: cursor.render(
      cursorChar,
      mask,
      invert,
      ghostTextForRender,
      maxVisibleLines,
      selectionAnchor ?? undefined,
      selectionLinewise,
    ),
    offset,
    setOffset,
    cursorLine: cursorPos.line - cursor.getViewportStartLine(maxVisibleLines),
    cursorColumn: cursorPos.column,
    viewportCharOffset: cursor.getViewportCharOffset(maxVisibleLines),
    viewportCharEnd: cursor.getViewportCharEnd(maxVisibleLines),
  }
}
