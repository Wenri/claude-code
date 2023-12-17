#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.118-to-2.1.119'
const SOURCE_PATH = 'src/services/mcp/client.ts'

const EVIDENCE_IDS = Object.freeze([
  'target119-mcp-terminal-error-boundary-target-fragment',
  'target119-mcp-terminal-error-boundary-source-replay-test',
  'target119-mcp-terminal-error-boundary-source-ast-test',
])

export const TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:14849`,
      targetIndex: 14849,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['isTerminalConnectionError']),
      evidenceIds: EVIDENCE_IDS,
      behavior:
        'The authenticated Target119 MCP terminal-error predicate treats AbortError as terminal and recognizes terminated only as a complete word, alongside the retained socket, timeout, and SSE reconnect errors. The bounded replay updates the local predicate and its sole Error-valued caller atomically.',
    }),
  ])

export const TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_INPUT_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 127256,
    sha256:
      '548f706f021294b8df7297543bed667041477afeaf63672949f212fb1b9b74fe',
  })

export const TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_OUTPUT_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 127336,
    sha256:
      'f5830de75f5aa9d143489ff498f9e4368f27b36f750967b6e5a87e5babaac474',
  })

const PREDICATE_HEAD_INPUT = `      const isTerminalConnectionError = (msg: string): boolean => {
        return (`
const PREDICATE_HEAD_OUTPUT = `      const isTerminalConnectionError = (error: Error): boolean => {
        if (error.name === 'AbortError') return true
        const msg = error.message
        return (`
const TERMINATED_INPUT = "          msg.includes('terminated') ||"
const TERMINATED_OUTPUT = "          /\\bterminated\\b/.test(msg) ||"
const CALL_INPUT = '          if (isTerminalConnectionError(error.message)) {'
const CALL_OUTPUT = '          if (isTerminalConnectionError(error)) {'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function matches(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactly(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: ${label} replay anchor differs`)
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

export function buildTarget119McpTerminalErrorBoundaryOutput(source) {
  return replaceExactly(
    replaceExactly(
      replaceExactly(
        source,
        PREDICATE_HEAD_INPUT,
        PREDICATE_HEAD_OUTPUT,
        'terminal predicate signature',
      ),
      TERMINATED_INPUT,
      TERMINATED_OUTPUT,
      'terminated word boundary',
    ),
    CALL_INPUT,
    CALL_OUTPUT,
    'terminal predicate Error caller',
  )
}

export function applyTarget119McpTerminalErrorBoundarySourceRecovery({
  sourceRoot,
}) {
  const filename = path.join(sourceRoot, SOURCE_PATH.replace(/^src\//, ''))
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${CASE_NAME}: ${SOURCE_PATH} must be a real file`)
  }
  const input = fs.readFileSync(filename)
  const state = descriptor(input)
  if (matches(state, TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_OUTPUT_FILE)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!matches(state, TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_INPUT_FILE)) {
    throw new Error(
      `${CASE_NAME}: MCP terminal-error replay requires its exact raw or recovered source state`,
    )
  }
  const output = Buffer.from(
    buildTarget119McpTerminalErrorBoundaryOutput(input.toString('utf8')),
  )
  if (!matches(descriptor(output), TARGET119_MCP_TERMINAL_ERROR_BOUNDARY_OUTPUT_FILE)) {
    throw new Error(
      `${CASE_NAME}: MCP terminal-error replay produced unexpected source`,
    )
  }
  fs.writeFileSync(filename, output)
  return { status: 'recovered', files: [SOURCE_PATH] }
}
