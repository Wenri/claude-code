import {
  hasUsedBackslashReturn,
  isShiftEnterKeyBindingInstalled,
} from '../../commands/terminalSetup/terminalSetup.js'
import type { Key } from '../../ink.js'
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
    [
      'escape',
      'return',
      'tab',
      'backspace',
      'delete',
      'up',
      'down',
      'left',
      'right',
      'pageup',
      'pagedown',
      'home',
      'end',
    ].includes(event.name)
  ) {
    return false
  }
  return input.length > 0 && !/^\s/.test(input) && !input.startsWith('\x1b')
}

/** Punctuation that attaches to the preceding image/file pill without a gap. */
export function isLeadingPunctuation(input: string): boolean {
  return input.length > 0 && '.,?!:;)]'.includes(input.charAt(0))
}
