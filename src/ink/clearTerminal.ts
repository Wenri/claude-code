import {
  CURSOR_HOME,
  cursorDown,
  ERASE_LINE,
  ERASE_SCREEN,
  ERASE_SCROLLBACK,
} from './termio/csi.js'

export function getClearTerminalSequence(): string {
  return ERASE_SCREEN + ERASE_SCROLLBACK + CURSOR_HOME
}

export function eraseViewportInPlace(viewportRows: number): string {
  return (
    CURSOR_HOME +
    (ERASE_LINE + cursorDown(1)).repeat(viewportRows) +
    CURSOR_HOME
  )
}

export const clearTerminal = getClearTerminalSequence()
