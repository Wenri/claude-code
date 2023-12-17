#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_TERMINAL_TOKENIZER_INPUT_FILE = Object.freeze({
  path: 'src/ink/termio/tokenize.ts',
  bytes: 9284,
  sha256: '227dfde6faa53250aa1c71a407ebb4b5cceaddb6f99ab52fb6ea33c749ba1735',
})

export const TARGET117_TERMINAL_TOKENIZER_OUTPUT_FILE = Object.freeze({
  path: 'src/ink/termio/tokenize.ts',
  bytes: 11167,
  sha256: '079d4a9254c835d4f081454d2ca732a91ab33334184a93faffdf2f5418a96067',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-terminal-tokenizer-string-controls-target-fragment'
const REPLAY_EVIDENCE =
  'target117-terminal-tokenizer-string-controls-source-replay-test'

export const TARGET117_TERMINAL_TOKENIZER_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:6828`,
    targetIndex: 6828,
    paths: Object.freeze(['src/ink/termio/tokenize.ts']),
    declarations: Object.freeze(['tokenize']),
    evidenceIds: Object.freeze([TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE]),
    behavior:
      'Target117 extends the terminal tokenizer with PM/SOS/legacy-SOS string states, BEL-resistant termination, CAN/SUB cancellation, DEL/control preservation, and bounded X10 escape handling. This rejects the false ink/colorize.ts owner and deliberately excludes the later Target118 forOutput parameter and x10Mouse string-state guards.',
  }),
])

const STATE_INPUT = `  | 'dcs'
  | 'apc'`
const STATE_OUTPUT = `  | 'dcs'
  | 'apc'
  | 'pm'
  | 'sos'`

const OPTIONS_INPUT = `type TokenizerOptions = {
  /**
   * Treat \`CSI M\` as an X10 mouse event prefix and consume 3 payload bytes.
   * Only enable for stdin input — \`\\x1b[M\` is also CSI DL (Delete Lines) in
   * output streams, and enabling this there swallows display text. Default false.
   */
  x10Mouse?: boolean
}
`
const OPTIONS_OUTPUT = `${OPTIONS_INPUT}
const INCOMPLETE_X10_MOUSE_RE = /^\\[M[\\x60-\\x7f][\\x20-\\uffff]?$/
`

const GROUND_INPUT = `        if (code === C0.ESC) {
          flushText()
          seqStart = i
          result.state = 'escape'
          i++
        } else {
          i++
        }`
const GROUND_OUTPUT = `        if (code === C0.ESC) {
          flushText()
          seqStart = i
          result.state = 'escape'
          i++
        } else if (code === C0.DEL) {
          if (INCOMPLETE_X10_MOUSE_RE.test(data.slice(textStart, i))) {
            i++
          } else {
            flushText()
            i++
            tokens.push({ type: 'text', value: '\\x7f' })
            textStart = i
          }
        } else if (code < 32 && data.length < 64) {
          flushText()
          i++
          if (code === C0.CR && data.charCodeAt(i) === C0.LF) i++
          tokens.push({ type: 'text', value: String.fromCharCode(code) })
          textStart = i
        } else {
          i++
        }`

const STRING_STATE_INPUT = `        } else if (code === ESC_TYPE.APC) {
          result.state = 'apc'
          i++
        } else if (code === 0x4f) {`
const STRING_STATE_OUTPUT = `        } else if (code === ESC_TYPE.APC) {
          result.state = 'apc'
          i++
        } else if (code === ESC_TYPE.PM) {
          result.state = 'pm'
          i++
        } else if (code === ESC_TYPE.SOS || code === 0x6b /* k */) {
          result.state = 'sos'
          i++
        } else if (code === 0x4f) {`

const X10_WHITESPACE_INPUT = `        } else if (isCSIIntermediate(code)) {
          // Intermediate byte (e.g., ESC ( for charset) - continue buffering`
const X10_WHITESPACE_OUTPUT = `        } else if (
          x10Mouse &&
          (code === 0x20 /* space */ ||
            code === C0.CR ||
            code === C0.LF ||
            code === C0.HT)
        ) {
          i++
          tokens.push({ type: 'text', value: data.slice(seqStart, i) })
          result.state = 'ground'
          textStart = i
        } else if (isCSIIntermediate(code)) {
          // Intermediate byte (e.g., ESC ( for charset) - continue buffering`

const ESCAPE_DEL_INPUT = `        } else if (isEscFinal(code)) {
          // Two-character escape sequence`
const ESCAPE_DEL_OUTPUT = `        } else if (code === C0.DEL) {
          i++
          tokens.push({ type: 'text', value: data.slice(seqStart, i) })
          result.state = 'ground'
          textStart = i
        } else if (isEscFinal(code)) {
          // Two-character escape sequence`

const ESCAPE_CONTROL_INPUT = `        } else {
          // Invalid - treat ESC as text
          result.state = 'ground'
          textStart = seqStart
        }
        break

      case 'escapeIntermediate':`
const ESCAPE_CONTROL_OUTPUT = `        } else if (code < 32) {
          i++
          tokens.push({ type: 'text', value: data.slice(seqStart, i) })
          result.state = 'ground'
          textStart = i
        } else {
          // Invalid - treat ESC as text
          result.state = 'ground'
          textStart = seqStart
        }
        break

      case 'escapeIntermediate':`

const TERMINATION_INPUT = `      case 'dcs':
      case 'apc':
        if (code === C0.BEL) {
          i++
          emitSequence(data.slice(seqStart, i))
        } else if (
          code === C0.ESC &&
          i + 1 < data.length &&
          data.charCodeAt(i + 1) === ESC_TYPE.ST
        ) {
          i += 2
          emitSequence(data.slice(seqStart, i))
        } else {
          i++
        }
        break`
const TERMINATION_OUTPUT = `      case 'dcs':
      case 'apc':
      case 'pm':
      case 'sos':
        if (
          code === C0.BEL &&
          result.state !== 'pm' &&
          result.state !== 'sos'
        ) {
          i++
          emitSequence(data.slice(seqStart, i))
        } else if (code === C0.ESC && i + 1 < data.length) {
          if (data.charCodeAt(i + 1) === ESC_TYPE.ST) {
            i += 2
            emitSequence(data.slice(seqStart, i))
          } else {
            emitSequence(data.slice(seqStart, i))
            seqStart = i
            result.state = 'escape'
            i++
          }
        } else if (code === C0.CAN || code === C0.SUB) {
          i++
          emitSequence(data.slice(seqStart, i))
        } else {
          i++
        }
        break`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function assertDescriptor(value, expected, label) {
  const actual = descriptor(value)
  if (!descriptorsEqual(actual, expected)) {
    throw new Error(
      `${label}: expected ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}`,
    )
  }
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`${label}: expected exactly one input anchor`)
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

function transformTokenizer(input) {
  let source = input.toString('utf8')
  for (const [before, after, label] of [
    [STATE_INPUT, STATE_OUTPUT, 'PM/SOS state union'],
    [OPTIONS_INPUT, OPTIONS_OUTPUT, 'incomplete X10 mouse sentinel'],
    [GROUND_INPUT, GROUND_OUTPUT, 'ground-state controls'],
    [STRING_STATE_INPUT, STRING_STATE_OUTPUT, 'PM/SOS escape states'],
    [X10_WHITESPACE_INPUT, X10_WHITESPACE_OUTPUT, 'X10 whitespace escape'],
    [ESCAPE_DEL_INPUT, ESCAPE_DEL_OUTPUT, 'escape DEL preservation'],
    [ESCAPE_CONTROL_INPUT, ESCAPE_CONTROL_OUTPUT, 'escape C0 preservation'],
    [TERMINATION_INPUT, TERMINATION_OUTPUT, 'string-state termination'],
  ]) {
    source = replaceExactlyOnce(source, before, after, label)
  }
  return Buffer.from(source)
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET117_TERMINAL_TOKENIZER_INPUT_FILE.path.slice(4),
  )
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('terminal tokenizer path escapes the supplied source root')
  }
  return filename
}

export function applyTarget117TerminalTokenizerStringControlsSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)

  if (descriptorsEqual(actual, TARGET117_TERMINAL_TOKENIZER_OUTPUT_FILE)) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides: TARGET117_TERMINAL_TOKENIZER_OWNER_OVERRIDES.length,
      files: Object.freeze([TARGET117_TERMINAL_TOKENIZER_OUTPUT_FILE]),
    })
  }
  if (!descriptorsEqual(actual, TARGET117_TERMINAL_TOKENIZER_INPUT_FILE)) {
    throw new Error(
      `Refusing non-target terminal-tokenizer recovery: ${actual.bytes}/${actual.sha256}`,
    )
  }

  const output = transformTokenizer(input)
  assertDescriptor(
    output,
    TARGET117_TERMINAL_TOKENIZER_OUTPUT_FILE,
    'recovered terminal tokenizer',
  )
  fs.writeFileSync(filename, output)
  assertDescriptor(
    fs.readFileSync(filename),
    TARGET117_TERMINAL_TOKENIZER_OUTPUT_FILE,
    'written terminal tokenizer',
  )
  return Object.freeze({
    status: 'recovered',
    ownerOverrides: TARGET117_TERMINAL_TOKENIZER_OWNER_OVERRIDES.length,
    files: Object.freeze([TARGET117_TERMINAL_TOKENIZER_OUTPUT_FILE]),
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117TerminalTokenizerStringControlsSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
