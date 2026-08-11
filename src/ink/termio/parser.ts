/**
 * ANSI Parser - Semantic Action Generator
 *
 * A streaming parser for ANSI escape sequences that produces semantic actions.
 * Uses the tokenizer for escape sequence boundary detection, then interprets
 * each sequence to produce structured actions.
 *
 * Key design decisions:
 * - Streaming: can process input incrementally
 * - Semantic output: produces structured actions, not string tokens
 * - Style tracking: maintains current text style state
 */

import { getGraphemeSegmenter } from '../../utils/intl.js'
import { stringWidth } from '../stringWidth.js'
import { C0 } from './ansi.js'
import { CSI, CURSOR_STYLES, ERASE_DISPLAY, ERASE_LINE_REGION } from './csi.js'
import { DEC } from './dec.js'
import { parseEsc } from './esc.js'
import { parseOSC } from './osc.js'
import { applySGR } from './sgr.js'
import { createTokenizer, type Token, type Tokenizer } from './tokenize.js'
import type { Action, Grapheme, TextStyle } from './types.js'
import { defaultStyle } from './types.js'

// =============================================================================
// Grapheme Utilities
// =============================================================================

function* segmentGraphemes(str: string): Generator<Grapheme> {
  let isAscii = true
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 32 || code >= 127) {
      isAscii = false
      break
    }
  }

  if (isAscii) {
    for (let i = 0; i < str.length; i++) {
      yield { value: str[i]!, width: 1 }
    }
    return
  }

  for (const { segment } of getGraphemeSegmenter().segment(str)) {
    if (segment.length === 1) {
      const code = segment.charCodeAt(0)
      if (code >= 32 && code < 127) {
        yield { value: segment, width: 1 }
        continue
      }
    }
    yield { value: segment, width: Math.max(1, stringWidth(segment)) }
  }
}

// =============================================================================
// Sequence Parsing
// =============================================================================

function parseCSIParams(paramStr: string): number[] {
  if (paramStr === '') return []
  return paramStr.split(/[;:]/).map(s => (s === '' ? 0 : parseInt(s, 10)))
}

function parsePrivateMode(param: number, enabled: boolean): Action | null {
  if (param === DEC.CURSOR_VISIBLE) {
    return {
      type: 'cursor',
      action: enabled ? { type: 'show' } : { type: 'hide' },
    }
  }
  if (param === DEC.ALT_SCREEN_CLEAR || param === DEC.ALT_SCREEN) {
    return { type: 'mode', action: { type: 'alternateScreen', enabled } }
  }
  if (param === DEC.BRACKETED_PASTE) {
    return { type: 'mode', action: { type: 'bracketedPaste', enabled } }
  }
  if (param === DEC.MOUSE_NORMAL) {
    return {
      type: 'mode',
      action: { type: 'mouseTracking', mode: enabled ? 'normal' : 'off' },
    }
  }
  if (param === DEC.MOUSE_BUTTON) {
    return {
      type: 'mode',
      action: { type: 'mouseTracking', mode: enabled ? 'button' : 'off' },
    }
  }
  if (param === DEC.MOUSE_ANY) {
    return {
      type: 'mode',
      action: { type: 'mouseTracking', mode: enabled ? 'any' : 'off' },
    }
  }
  if (param === DEC.FOCUS_EVENTS) {
    return { type: 'mode', action: { type: 'focusEvents', enabled } }
  }
  return null
}

/** Parse a raw CSI sequence (e.g., "\x1b[31m") into an action */
function parseCSI(rawSequence: string): Action | Action[] | null {
  const inner = rawSequence.slice(2)
  if (inner.length === 0) return null

  const finalByte = inner.charCodeAt(inner.length - 1)
  const beforeFinal = inner.slice(0, -1)

  let privateMode = ''
  let paramStr = beforeFinal
  let intermediate = ''

  if (beforeFinal.length > 0 && '?>=<'.includes(beforeFinal[0]!)) {
    privateMode = beforeFinal[0]!
    paramStr = beforeFinal.slice(1)
  }

  if (paramStr.length > 0) {
    const lastParamCode = paramStr.charCodeAt(paramStr.length - 1)
    if (!(lastParamCode >= 0x30 && lastParamCode <= 0x3b)) {
      const intermediateMatch = paramStr.match(/([^0-9;:]+)$/)
      if (intermediateMatch) {
        intermediate = intermediateMatch[1]!
        paramStr = paramStr.slice(0, -intermediate.length)
      }
    }
  }

  // SGR (Select Graphic Rendition)
  if (finalByte === CSI.SGR && privateMode === '') {
    return { type: 'sgr', params: paramStr }
  }

  const params = parseCSIParams(paramStr)
  const p0 = params[0] ?? 1
  const p1 = params[1] ?? 1

  // Cursor movement
  if (finalByte === CSI.CUU) {
    return {
      type: 'cursor',
      action: { type: 'move', direction: 'up', count: p0 },
    }
  }
  if (finalByte === CSI.CUD || finalByte === CSI.VPR) {
    return {
      type: 'cursor',
      action: { type: 'move', direction: 'down', count: p0 },
    }
  }
  if (finalByte === CSI.CUF || finalByte === CSI.HPR) {
    return {
      type: 'cursor',
      action: { type: 'move', direction: 'forward', count: p0 },
    }
  }
  if (finalByte === CSI.CUB) {
    return {
      type: 'cursor',
      action: { type: 'move', direction: 'back', count: p0 },
    }
  }
  if (finalByte === CSI.CNL) {
    return { type: 'cursor', action: { type: 'nextLine', count: p0 } }
  }
  if (finalByte === CSI.CPL) {
    return { type: 'cursor', action: { type: 'prevLine', count: p0 } }
  }
  if (finalByte === CSI.CHA || finalByte === CSI.HPA) {
    return { type: 'cursor', action: { type: 'column', col: p0 } }
  }
  if (finalByte === CSI.CUP || finalByte === CSI.HVP) {
    return { type: 'cursor', action: { type: 'position', row: p0, col: p1 } }
  }
  if (finalByte === CSI.VPA) {
    return { type: 'cursor', action: { type: 'row', row: p0 } }
  }

  // Erase
  if (finalByte === CSI.ED) {
    const region = ERASE_DISPLAY[params[0] ?? 0] ?? 'toEnd'
    return { type: 'erase', action: { type: 'display', region } }
  }
  if (finalByte === CSI.EL) {
    const region = ERASE_LINE_REGION[params[0] ?? 0] ?? 'toEnd'
    return { type: 'erase', action: { type: 'line', region } }
  }
  if (finalByte === CSI.ECH) {
    return { type: 'erase', action: { type: 'chars', count: p0 } }
  }

  // Insert/Delete
  if (finalByte === CSI.IL) {
    return { type: 'edit', action: { type: 'insertLines', count: p0 } }
  }
  if (finalByte === CSI.DL) {
    return { type: 'edit', action: { type: 'deleteLines', count: p0 } }
  }
  if (finalByte === CSI.ICH) {
    return { type: 'edit', action: { type: 'insertChars', count: p0 } }
  }
  if (finalByte === CSI.DCH) {
    return { type: 'edit', action: { type: 'deleteChars', count: p0 } }
  }

  // Scroll
  if (finalByte === CSI.SU) {
    return { type: 'scroll', action: { type: 'up', count: p0 } }
  }
  if (finalByte === CSI.SD) {
    return { type: 'scroll', action: { type: 'down', count: p0 } }
  }
  if (finalByte === CSI.DECSTBM) {
    return {
      type: 'scroll',
      action: { type: 'setRegion', top: p0, bottom: params[1] ?? 0 },
    }
  }

  // Cursor save/restore
  if (finalByte === CSI.SCOSC) {
    return { type: 'cursor', action: { type: 'save' } }
  }
  if (finalByte === CSI.SCORC) {
    return { type: 'cursor', action: { type: 'restore' } }
  }

  // Cursor style
  if (finalByte === CSI.DECSCUSR && intermediate === ' ') {
    const styleInfo = CURSOR_STYLES[p0] ?? CURSOR_STYLES[0]!
    return { type: 'cursor', action: { type: 'style', ...styleInfo } }
  }

  // Private modes
  if (privateMode === '?' && (finalByte === CSI.SM || finalByte === CSI.RM)) {
    const enabled = finalByte === CSI.SM
    const actions: Action[] = []
    for (const param of params) {
      const action = parsePrivateMode(param, enabled)
      if (action) actions.push(action)
    }
    return actions.length > 0
      ? actions
      : { type: 'unknown', sequence: rawSequence }
  }

  return { type: 'unknown', sequence: rawSequence }
}

/**
 * Identify the type of escape sequence from its raw form.
 */
function identifySequence(
  seq: string,
): 'csi' | 'osc' | 'esc' | 'ss3' | 'unknown' {
  if (seq.length < 2) return 'unknown'
  if (seq.charCodeAt(0) !== C0.ESC) return 'unknown'

  const second = seq.charCodeAt(1)
  if (second === 0x5b) return 'csi' // [
  if (second === 0x5d) return 'osc' // ]
  if (second === 0x4f) return 'ss3' // O
  return 'esc'
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parser class - maintains state for streaming/incremental parsing
 *
 * Usage:
 * ```typescript
 * const parser = new Parser()
 * const actions1 = parser.feed('partial\x1b[')
 * const actions2 = parser.feed('31mred')  // state maintained internally
 * ```
 */
export class Parser {
  private tokenizer: Tokenizer = createTokenizer({ forOutput: true })

  style: TextStyle = defaultStyle()
  inLink = false
  linkUrl: string | undefined

  reset(): void {
    this.tokenizer.reset()
    this.style = defaultStyle()
    this.inLink = false
    this.linkUrl = undefined
  }

  /** Feed input and get resulting actions */
  feed(input: string): Action[] {
    const tokens = this.tokenizer.feed(input)
    const actions: Action[] = []

    for (const token of tokens) {
      const tokenActions = this.processToken(token)
      actions.push(...tokenActions)
    }

    return actions
  }

  private processToken(token: Token): Action[] {
    switch (token.type) {
      case 'text':
        return this.processText(token.value)

      case 'sequence':
        return this.processSequence(token.value)
    }
  }

  private processText(text: string): Action[] {
    const style = this.style
    if (text.indexOf('\x07') === -1) {
      const graphemes = [...segmentGraphemes(text)]
      return graphemes.length > 0 ? [{ type: 'text', graphemes, style }] : []
    }

    const actions: Action[] = []
    for (const part of text.split('\x07')) {
      if (part) {
        const graphemes = [...segmentGraphemes(part)]
        if (graphemes.length > 0) {
          actions.push({ type: 'text', graphemes, style })
        }
      }
      actions.push({ type: 'bell' })
    }
    actions.pop()
    return actions
  }

  private processSequence(seq: string): Action[] {
    const seqType = identifySequence(seq)

    switch (seqType) {
      case 'csi': {
        const action = parseCSI(seq)
        if (!action) return []
        if (Array.isArray(action)) return action
        if (action.type === 'sgr') {
          this.style = applySGR(action.params, this.style)
          return []
        }
        return [action]
      }

      case 'osc': {
        // Extract OSC content (between ESC ] and terminator)
        let content = seq.slice(2)
        // Remove terminator (BEL or ESC \)
        if (content.endsWith('\x07')) {
          content = content.slice(0, -1)
        } else if (content.endsWith('\x1b\\')) {
          content = content.slice(0, -2)
        }

        const action = parseOSC(content)
        if (action) {
          if (action.type === 'link') {
            if (action.action.type === 'start') {
              this.inLink = true
              this.linkUrl = action.action.url
            } else {
              this.inLink = false
              this.linkUrl = undefined
            }
          }
          return [action]
        }
        return []
      }

      case 'esc': {
        const escContent = seq.slice(1)
        const action = parseEsc(escContent)
        if (action?.type === 'reset') {
          this.style = defaultStyle()
          this.inLink = false
          this.linkUrl = undefined
        }
        return action ? [action] : []
      }

      case 'ss3':
        // SS3 sequences are typically cursor keys in application mode
        // For output parsing, treat as unknown
        return [{ type: 'unknown', sequence: seq }]

      default:
        return [{ type: 'unknown', sequence: seq }]
    }
  }
}
