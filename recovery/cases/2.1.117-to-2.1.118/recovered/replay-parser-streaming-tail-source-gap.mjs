#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_PARSER_STREAMING_TAIL_INPUT_FILE = Object.freeze({
  path: 'src/ink/termio/parser.ts',
  bytes: 11830,
  sha256: 'fc3a931b54107b28bb0fa85a9e4535291322d8b98b6e2004b1635b65b472ff05',
})

export const TARGET118_PARSER_STREAMING_TAIL_OUTPUT_FILE = Object.freeze({
  path: 'src/ink/termio/parser.ts',
  bytes: 13799,
  sha256: '308ffee875beb4ba029a27588eaa609b5410f289a568a63602fbc727b0b01135',
})

export const TARGET118_PARSER_STREAMING_TAIL_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:7401`,
    targetIndex: 7401,
    paths: Object.freeze(['src/ink/termio/parser.ts']),
    evidenceIds: Object.freeze([
      'target118-parser-streaming-tail-target-fragment',
      'target118-parser-streaming-tail-source-replay-test',
      'target118-parser-streaming-tail-source-ast-test',
    ]),
    behavior:
      'The authenticated Target118 Parser introduces an optional forOutput mode, a bounded streaming grapheme tail, explicit flush/reset semantics, BEL-aware tail handling, split-surrogate recovery, and ZWJ/regional-indicator continuation protection. The exact authored owner is src/ink/termio/parser.ts, not the coarse sgr.ts attribution.',
  }),
])

const CLASS_START = 'export class Parser {'
const PROCESS_SEQUENCE_START =
  '  private processSequence(seq: string): Action[] {'

const RECOVERED_CLASS_PREFIX = `export class Parser {
  private tokenizer: Tokenizer
  private forOutput: boolean
  private tail = ''

  constructor(options?: { forOutput?: boolean }) {
    this.forOutput = options?.forOutput ?? false
    this.tokenizer = createTokenizer({ forOutput: this.forOutput })
  }

  style: TextStyle = defaultStyle()
  inLink = false
  linkUrl: string | undefined

  flush(): Action[] {
    if (!this.tail) return []
    const actions = this.processText(this.tail, false)
    this.tail = ''
    return actions
  }

  reset(): void {
    this.tail = ''
    this.tokenizer.reset()
    this.style = defaultStyle()
    this.inLink = false
    this.linkUrl = undefined
  }

  /** Feed input and get resulting actions */
  feed(input: string): Action[] {
    const tokens = this.tokenizer.feed(input)
    const actions: Action[] = []

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]!
      if (token.type === 'text') {
        const text = this.tail + token.value
        this.tail = ''
        const holdTail = this.forOutput && index === tokens.length - 1
        actions.push(...this.processText(text, holdTail))
      } else {
        if (this.tail) {
          actions.push(...this.processText(this.tail, false))
          this.tail = ''
        }
        actions.push(...this.processSequence(token.value))
      }
    }

    return actions
  }

  private processText(text: string, holdTail: boolean): Action[] {
    const style = this.style
    if (text.indexOf('\\x07') === -1) {
      const graphemes = [...segmentGraphemes(text)]
      this.holdTail(graphemes, holdTail)
      return graphemes.length > 0 ? [{ type: 'text', graphemes, style }] : []
    }

    const actions: Action[] = []
    for (const part of text.split('\\x07')) {
      if (part) {
        const graphemes = [...segmentGraphemes(part)]
        if (graphemes.length > 0) {
          actions.push({ type: 'text', graphemes, style })
        }
      }
      actions.push({ type: 'bell' })
    }
    actions.pop()
    const lastAction = actions.at(-1)
    if (lastAction?.type === 'text') {
      this.holdTail(lastAction.graphemes, holdTail)
      if (lastAction.graphemes.length === 0) actions.pop()
    }
    return actions
  }

  private holdTail(graphemes: Grapheme[], holdTail: boolean): void {
    if (!holdTail || graphemes.length === 0) return

    const lastGrapheme = graphemes.at(-1)!
    const lastCodeUnit = lastGrapheme.value.charCodeAt(
      lastGrapheme.value.length - 1,
    )
    if (lastCodeUnit < 32) return

    this.tail = lastGrapheme.value
    graphemes.pop()

    if (
      lastCodeUnit >= 0xd800 &&
      lastCodeUnit <= 0xdbff &&
      graphemes.length > 0
    ) {
      this.tail = graphemes.pop()!.value + this.tail
    }

    while (graphemes.length > 0 && this.tail.length <= 64) {
      const previous = graphemes.at(-1)!.value
      const previousCodeUnit = previous.charCodeAt(previous.length - 1)
      const previousCodePoint =
        previousCodeUnit >= 0xdc00 && previousCodeUnit <= 0xdfff
          ? previous.codePointAt(previous.length - 2)
          : previousCodeUnit
      if (
        previousCodePoint === 8205 ||
        (previousCodePoint !== undefined &&
          previousCodePoint >= 127462 &&
          previousCodePoint <= 127487)
      ) {
        this.tail = previous + this.tail
        graphemes.pop()
      } else {
        break
      }
    }
  }

`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

export function buildTarget118ParserStreamingTailOutput(input) {
  const classStart = input.indexOf(CLASS_START)
  const nextClassStart = input.indexOf(CLASS_START, classStart + 1)
  const processSequenceStart = input.indexOf(
    PROCESS_SEQUENCE_START,
    classStart,
  )
  if (
    classStart < 0 ||
    nextClassStart >= 0 ||
    processSequenceStart < classStart
  ) {
    throw new Error(
      `${CASE_NAME}: parser replay requires one exact Parser declaration and processSequence boundary`,
    )
  }
  return (
    input.slice(0, classStart) +
    RECOVERED_CLASS_PREFIX +
    input.slice(processSequenceStart)
  )
}

export function applyTarget118ParserStreamingTailSourceRecovery({ sourceRoot }) {
  const filename = path.join(
    sourceRoot,
    TARGET118_PARSER_STREAMING_TAIL_INPUT_FILE.path.replace(/^src\//, ''),
  )
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    actual.bytes === TARGET118_PARSER_STREAMING_TAIL_OUTPUT_FILE.bytes &&
    actual.sha256 === TARGET118_PARSER_STREAMING_TAIL_OUTPUT_FILE.sha256
  ) {
    return { status: 'already-recovered', files: [] }
  }
  if (
    actual.bytes !== TARGET118_PARSER_STREAMING_TAIL_INPUT_FILE.bytes ||
    actual.sha256 !== TARGET118_PARSER_STREAMING_TAIL_INPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: parser streaming-tail replay requires its exact raw or recovered source state`,
    )
  }
  const output = Buffer.from(
    buildTarget118ParserStreamingTailOutput(input.toString()),
  )
  const outputDescriptor = descriptor(output)
  if (
    outputDescriptor.bytes !== TARGET118_PARSER_STREAMING_TAIL_OUTPUT_FILE.bytes ||
    outputDescriptor.sha256 !== TARGET118_PARSER_STREAMING_TAIL_OUTPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: parser streaming-tail replay output differs from its pinned postimage`,
    )
  }
  fs.writeFileSync(filename, output)
  return {
    status: 'recovered',
    files: [TARGET118_PARSER_STREAMING_TAIL_INPUT_FILE.path],
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-parser-streaming-tail-source-gap.mjs --source-root DIR',
    )
  }
  console.log(
    JSON.stringify(
      applyTarget118ParserStreamingTailSourceRecovery({ sourceRoot }),
      null,
      2,
    ),
  )
}
