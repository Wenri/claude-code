#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_BOOTSTRAP_STATE_EXPORT_INPUT_FILE = Object.freeze({
  path: 'src/bootstrap/state.ts',
  bytes: 62819,
  sha256: 'd378bea8bf7a12640104a55a0462418ad946b4db48d6d505856a9fd45d4ffff8',
})

export const TARGET121_BOOTSTRAP_STATE_EXPORT_OUTPUT_FILE = Object.freeze({
  path: 'src/bootstrap/state.ts',
  bytes: 62894,
  sha256: '14e13db421cec2e5dbc5b21d515ec08f08534d949b82b15f496e4fdb26240f30',
})

const EVIDENCE_IDS = Object.freeze([
  'target121-bootstrap-state-export-target-fragment',
  'target121-bootstrap-state-export-source-replay-test',
  'target121-bootstrap-state-export-source-ast-test',
])

export const TARGET121_BOOTSTRAP_STATE_EXPORT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:370`,
    targetIndex: 370,
    paths: Object.freeze(['src/bootstrap/state.ts']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The authenticated bootstrap export table binds getThinkingTypeOverride and setThinkingTypeOverride to the exact authored STATE.thinkingTypeOverrides accessors and adds a resetStartTime binding whose complete target body assigns Date.now() to STATE.startTime. The bounded replay restores that missing source export beside the state cwd accessors, with executable target/source equivalence frozen by the case-owned test.',
  }),
])

export const TARGET121_BOOTSTRAP_STATE_EXPORT_EVIDENCE_IDS = EVIDENCE_IDS

const SET_CWD_STATE_DECLARATION = `export function setCwdState(cwd: string): void {
  STATE.cwd = cwd.normalize('NFC')
}
`

const RESET_START_TIME_DECLARATION = `
export function resetStartTime(): void {
  STATE.startTime = Date.now()
}
`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

export function buildTarget121BootstrapStateExportOutput(input) {
  const first = input.indexOf(SET_CWD_STATE_DECLARATION)
  const second = input.indexOf(SET_CWD_STATE_DECLARATION, first + 1)
  if (first < 0 || second >= 0 || input.includes(RESET_START_TIME_DECLARATION)) {
    throw new Error(
      `${CASE_NAME}: bootstrap state export replay requires one exact setCwdState declaration and no resetStartTime declaration`,
    )
  }
  return (
    input.slice(0, first) +
    SET_CWD_STATE_DECLARATION +
    RESET_START_TIME_DECLARATION +
    input.slice(first + SET_CWD_STATE_DECLARATION.length)
  )
}

export function applyTarget121BootstrapStateExportSourceRecovery({ sourceRoot }) {
  const filename = path.join(
    sourceRoot,
    TARGET121_BOOTSTRAP_STATE_EXPORT_INPUT_FILE.path.replace(/^src\//, ''),
  )
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    actual.bytes === TARGET121_BOOTSTRAP_STATE_EXPORT_OUTPUT_FILE.bytes &&
    actual.sha256 === TARGET121_BOOTSTRAP_STATE_EXPORT_OUTPUT_FILE.sha256
  ) {
    return { status: 'already-recovered', files: [] }
  }
  if (
    actual.bytes !== TARGET121_BOOTSTRAP_STATE_EXPORT_INPUT_FILE.bytes ||
    actual.sha256 !== TARGET121_BOOTSTRAP_STATE_EXPORT_INPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: bootstrap state export replay requires its exact raw or recovered source state`,
    )
  }

  const output = Buffer.from(
    buildTarget121BootstrapStateExportOutput(input.toString('utf8')),
    'utf8',
  )
  const recovered = descriptor(output)
  if (
    recovered.bytes !== TARGET121_BOOTSTRAP_STATE_EXPORT_OUTPUT_FILE.bytes ||
    recovered.sha256 !== TARGET121_BOOTSTRAP_STATE_EXPORT_OUTPUT_FILE.sha256
  ) {
    throw new Error(
      `${CASE_NAME}: bootstrap state export replay produced unexpected output`,
    )
  }
  fs.writeFileSync(filename, output)
  return {
    status: 'recovered',
    files: [TARGET121_BOOTSTRAP_STATE_EXPORT_OUTPUT_FILE.path],
  }
}
