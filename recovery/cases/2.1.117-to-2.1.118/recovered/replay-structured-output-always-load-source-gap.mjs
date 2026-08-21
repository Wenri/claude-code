#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.117-to-2.1.118'
const SOURCE_PATH = 'src/utils/hooks/hookHelpers.ts'
const BEFORE = `  return {
    ...SyntheticOutputTool,
    inputSchema: hookResponseSchema(),`
const AFTER = `  return {
    ...SyntheticOutputTool,
    alwaysLoad: true,
    inputSchema: hookResponseSchema(),`

export const TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18210`,
      targetIndex: 18210,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['createStructuredOutputTool']),
      evidenceIds: Object.freeze([
        'target118-structured-output-always-load-target-fragment',
        'target118-structured-output-always-load-source-replay-test',
        'target118-structured-output-always-load-source-ast-test',
      ]),
      behavior:
        'The authenticated Target118 structured-output verification tool is permanently available through alwaysLoad: true, while retaining the exact hook response schema, JSON schema, and mandatory final-call prompt. The bounded replay adds only that property to createStructuredOutputTool so hook verification cannot be deferred by ToolSearch.',
    }),
  ])

export const TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_INPUT_FILE = Object.freeze({
  path: SOURCE_PATH,
  bytes: 2521,
  sha256: '95c39cede6f072b12f9b4400b2aa618d838a0b7e2cce474108a4b576d73108db',
})

export const TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_OUTPUT_FILE =
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 2543,
    sha256:
      'd99b31db8487d9546f125fd2e866cc2209cf7ba04f8be85e6cd5547fc6b8c890',
  })

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function matches(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

export function buildTarget118StructuredOutputAlwaysLoadOutput(source) {
  const first = source.indexOf(BEFORE)
  const second = source.indexOf(BEFORE, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: structured-output replay anchor differs`)
  }
  return source.slice(0, first) + AFTER + source.slice(first + BEFORE.length)
}

export function applyTarget118StructuredOutputAlwaysLoadSourceRecovery({
  sourceRoot,
}) {
  const filename = path.join(sourceRoot, SOURCE_PATH.replace(/^src\//, ''))
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${CASE_NAME}: ${SOURCE_PATH} must be a real file`)
  }
  const input = fs.readFileSync(filename)
  const state = descriptor(input)
  if (matches(state, TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_OUTPUT_FILE)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!matches(state, TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_INPUT_FILE)) {
    throw new Error(
      `${CASE_NAME}: structured-output replay requires its exact raw or recovered source state`,
    )
  }
  const output = Buffer.from(
    buildTarget118StructuredOutputAlwaysLoadOutput(input.toString('utf8')),
  )
  if (
    !matches(
      descriptor(output),
      TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `${CASE_NAME}: structured-output replay produced unexpected source`,
    )
  }
  const temporary = `${filename}.recovery-tmp-${process.pid}`
  fs.writeFileSync(temporary, output, { flag: 'wx', mode: stat.mode })
  try {
    fs.renameSync(temporary, filename)
  } catch (error) {
    fs.rmSync(temporary, { force: true })
    throw error
  }
  return {
    status: 'recovered',
    files: [
      {
        path: SOURCE_PATH,
        before: TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_INPUT_FILE,
        after: TARGET118_STRUCTURED_OUTPUT_ALWAYS_LOAD_OUTPUT_FILE,
      },
    ],
  }
}
