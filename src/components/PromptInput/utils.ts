import {
  hasUsedBackslashReturn,
  isShiftEnterKeyBindingInstalled,
} from '../../commands/terminalSetup/terminalSetup.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { env } from '../../utils/env.js'
import { getConfigValue } from '../../utils/settings/configSettings.js'
/**
 * Helper function to check if vim mode is currently enabled
 * @returns boolean indicating if vim mode is active
 */
export function isVimModeEnabled(): boolean {
  return getConfigValue('editorMode', 'normal').value === 'vim'
}

export function getNewlineInstructions(): string {
  // Apple Terminal on macOS uses native modifier key detection for Shift+Enter
  if (env.terminal === 'Apple_Terminal' && process.platform === 'darwin') {
    return 'shift + ⏎ for newline'
  }

  // For iTerm2 and VSCode, show Shift+Enter instructions if installed
  if (isShiftEnterKeyBindingInstalled()) {
    return 'shift + ⏎ for newline'
  }

  // Otherwise show backslash+return instructions
  return hasUsedBackslashReturn()
    ? '\\⏎ for newline'
    : 'backslash (\\) + return (⏎) for newline'
}

/**
 * True when the keystroke is a printable character that does not begin
 * with whitespace — i.e., a normal letter/digit/symbol the user typed.
 * Used to gate the lazy space inserted after an image pill.
 */
export function isNonSpacePrintable(
  input: string,
  event: KeyboardEvent,
): boolean {
  if (
    event.ctrl ||
    event.meta ||
    event.name === 'escape' ||
    event.name === 'return' ||
    event.name === 'tab' ||
    event.name === 'backspace' ||
    event.name === 'delete' ||
    event.name === 'up' ||
    event.name === 'down' ||
    event.name === 'left' ||
    event.name === 'right' ||
    event.name === 'pageup' ||
    event.name === 'pagedown' ||
    event.name === 'home' ||
    event.name === 'end'
  ) {
    return false
  }
  return input.length > 0 && !/^\s/.test(input) && !input.startsWith('\x1b')
}
