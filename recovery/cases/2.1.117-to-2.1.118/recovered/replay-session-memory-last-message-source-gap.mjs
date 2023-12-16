#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/services/SessionMemory/sessionMemory.ts'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

export const TARGET118_SESSION_MEMORY_LAST_MESSAGE_INPUT = Object.freeze({
  path: OWNER_PATH,
  bytes: 16561,
  sha256: '44919a725fc87d7f375cf35ba4ddfe9158c8acaa4d8e0b17055605fa6135e6d1',
})

export const TARGET118_SESSION_MEMORY_LAST_MESSAGE_OUTPUT = Object.freeze({
  path: OWNER_PATH,
  bytes: 16547,
  sha256: 'b1cd7740e752757018eba5e68d5d67280f90ae7f5daa051845291e1da12c0c27',
})

const BEFORE = `  const lastMessage = messages[messages.length - 1]
  const usage = lastMessage ? getTokenUsage(lastMessage) : undefined
  const config = getSessionMemoryConfig()
  logEvent('tengu_session_memory_extraction',`

const AFTER = `  const lastMessage = messages.at(-1)
  const usage = lastMessage ? getTokenUsage(lastMessage) : undefined
  const config = getSessionMemoryConfig()
  logEvent('tengu_session_memory_extraction',`

export const TARGET118_SESSION_MEMORY_LAST_MESSAGE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20770`,
      targetIndex: 20770,
      paths: Object.freeze([OWNER_PATH]),
      evidenceIds: Object.freeze([
        'target118-session-memory-last-message-target-fragment',
        'target118-session-memory-last-message-source-replay-test',
      ]),
      behavior:
        'The authenticated Target118 session-memory extraction hook reads the last message with Array.prototype.at(-1) before recording usage telemetry; the historical semantic owner is recovered from the stale length-index expression to that exact target behavior.',
    }),
  ])

function occurrenceCount(source, needle) {
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count += 1
    offset += needle.length
  }
  return count
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, OWNER_PATH.slice('src/'.length))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${OWNER_PATH}: escapes source root`)
  }
  return filename
}

function stateOf(input) {
  const actual = descriptor(input)
  if (
    actual.bytes === TARGET118_SESSION_MEMORY_LAST_MESSAGE_INPUT.bytes &&
    actual.sha256 === TARGET118_SESSION_MEMORY_LAST_MESSAGE_INPUT.sha256
  ) {
    return 'raw'
  }
  if (
    actual.bytes === TARGET118_SESSION_MEMORY_LAST_MESSAGE_OUTPUT.bytes &&
    actual.sha256 === TARGET118_SESSION_MEMORY_LAST_MESSAGE_OUTPUT.sha256
  ) {
    return 'postimage'
  }
  throw new Error(
    `${OWNER_PATH}: unknown preimage ${actual.bytes}/${actual.sha256}`,
  )
}

export function buildTarget118SessionMemoryLastMessageOutput(input) {
  if (occurrenceCount(input, BEFORE) !== 1 || occurrenceCount(input, AFTER) !== 0) {
    throw new Error(`${OWNER_PATH}: last-message telemetry anchor differs`)
  }
  return input.replace(BEFORE, AFTER)
}

export function applyTarget118SessionMemoryLastMessageReplay({ sourceRoot }) {
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const state = stateOf(input)
  if (state === 'postimage') {
    return Object.freeze({ status: 'already-recovered', changed: false })
  }
  const output = Buffer.from(
    buildTarget118SessionMemoryLastMessageOutput(input.toString('utf8')),
  )
  const actual = descriptor(output)
  if (
    actual.bytes !== TARGET118_SESSION_MEMORY_LAST_MESSAGE_OUTPUT.bytes ||
    actual.sha256 !== TARGET118_SESSION_MEMORY_LAST_MESSAGE_OUTPUT.sha256
  ) {
    throw new Error(
      `${OWNER_PATH}: replay produced ${actual.bytes}/${actual.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  return Object.freeze({ status: 'recovered', changed: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-session-memory-last-message-source-gap.mjs <source-root>',
    )
  }
  console.log(applyTarget118SessionMemoryLastMessageReplay({ sourceRoot }))
}
