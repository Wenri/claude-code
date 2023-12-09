/**
 * ESC Sequence Parser
 *
 * Handles simple escape sequences: ESC + one or two characters
 */

import type { Action } from './types.js'

/**
 * Parse a simple ESC sequence
 *
 * @param chars - Characters after ESC (not including ESC itself)
 */
export function parseEsc(chars: string): Action | null {
  if (chars.length === 0) return null

  const first = chars[0]!

  // Full reset (RIS)
  if (first === 'c') {
    return { type: 'reset' }
  }

  // Cursor save (DECSC)
  if (first === '7') {
    return { type: 'cursor', action: { type: 'save' } }
  }

  // Cursor restore (DECRC)
  if (first === '8') {
    return { type: 'cursor', action: { type: 'restore' } }
  }

  // Index (IND)
  if (first === 'D') {
    return { type: 'scroll', action: { type: 'index' } }
  }

  // Reverse index (RI)
  if (first === 'M') {
    return { type: 'scroll', action: { type: 'reverseIndex' } }
  }

  // Next line (NEL)
  if (first === 'E') {
    return { type: 'cursor', action: { type: 'nextLine', count: 1 } }
  }

  // Horizontal tab set (HTS)
  if (first === 'H') {
    return null // Tab stop, not commonly needed
  }

  // Charset selection (ESC ( X, ESC ) X, etc.) - silently ignore
  if ('()'.includes(first) && chars.length >= 2) {
    return null
  }

  // Unknown
  return { type: 'unknown', sequence: `\x1b${chars}` }
}
