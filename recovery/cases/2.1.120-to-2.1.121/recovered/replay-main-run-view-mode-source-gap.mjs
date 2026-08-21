#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MAIN_RUN_VIEW_MODE_EVIDENCE_IDS = Object.freeze([
  'target121-main-run-authenticated-whole-unit',
  'target121-main-run-view-mode-retained-lineage',
  'target121-main-run-view-mode-source-replay',
  'target121-main-run-u22106-partition-classification',
])

export const TARGET121_MAIN_RUN_VIEW_MODE_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/main.tsx',
    bytes: 816314,
    sha256: 'c4e91aae36588101d8280ac6375cdae4f7981361480ad53b93a4dfb19b87ed33',
  }),
])

export const TARGET121_MAIN_RUN_VIEW_MODE_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: 'src/main.tsx',
    bytes: 816530,
    sha256: '13589f838f55a46b5eeaa551acd450ee5bdcd1fcd8e71578039e6a03d77d54c9',
  }),
])

// This evidence object deliberately names only the first adjacency-cohesive
// residue cluster.  The rest of u22106 is classified by the companion fixture
// and remains outside this bounded source replay.
export const TARGET121_MAIN_RUN_VIEW_MODE_OWNER_EVIDENCE = Object.freeze({
  key: `${CASE_NAME}:22106:view-mode`,
  targetIndex: 22106,
  paths: Object.freeze(['src/main.tsx']),
  declarations: Object.freeze(['run']),
  residues: Object.freeze([
    Object.freeze({
      literalKind: 'property',
      value: 'viewMode',
      start: 13792763,
      end: 13792771,
      targetOccurrenceNumber: 4,
    }),
    Object.freeze({
      literalKind: 'string',
      value: 'focus',
      start: 13792780,
      end: 13792787,
      targetOccurrenceNumber: 17,
    }),
  ]),
  evidenceIds: TARGET121_MAIN_RUN_VIEW_MODE_EVIDENCE_IDS,
  behavior:
    'The complete authenticated Target120 u22004 and Target121 u22106 main run functions carry the same identifier-normalized viewMode/focus initialization and briefTranscript consumer. The recovered Target121 main.tsx omits that retained logic. This bounded replay restores only the adjacent viewMode/focus cluster and its single briefTranscript consumer; all other u22106 production residues remain separately classified and deferred.',
})

const OLD_INITIAL_VIEW_STATE = `    // Extract these separately so they can be modified if needed
    let outputFormat = options.outputFormat;
    let inputFormat = options.inputFormat;
    let verbose = options.verbose ?? getConfigValue('verbose', false).value;
    let print = options.print;`

const NEW_INITIAL_VIEW_STATE = `    // Extract these separately so they can be modified if needed
    let outputFormat = options.outputFormat;
    let inputFormat = options.inputFormat;
    const viewMode = getInitialSettings().viewMode;
    const initialBriefTranscript = viewMode ? viewMode === 'focus' : getGlobalConfig().briefTranscript ?? false;
    let verbose = options.verbose ?? (viewMode ? viewMode === 'verbose' : initialBriefTranscript ? false : getConfigValue('verbose', false).value);
    let print = options.print;`

const OLD_BRIEF_TRANSCRIPT_CONSUMER =
  `      briefTranscript: (verbose ?? false) ? false : getGlobalConfig().briefTranscript ?? false,`

const NEW_BRIEF_TRANSCRIPT_CONSUMER =
  `      briefTranscript: (verbose ?? false) ? false : initialBriefTranscript,`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
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

export function buildTarget121MainRunViewModeOutput(mainSource) {
  return replaceExactly(
    replaceExactly(
      mainSource,
      OLD_INITIAL_VIEW_STATE,
      NEW_INITIAL_VIEW_STATE,
      'main run initial view state',
    ),
    OLD_BRIEF_TRANSCRIPT_CONSUMER,
    NEW_BRIEF_TRANSCRIPT_CONSUMER,
    'main run briefTranscript consumer',
  )
}

export function applyTarget121MainRunViewModeSourceRecovery({ sourceRoot }) {
  const input = TARGET121_MAIN_RUN_VIEW_MODE_INPUT_FILES[0]
  const output = TARGET121_MAIN_RUN_VIEW_MODE_OUTPUT_FILES[0]
  const filename = path.join(sourceRoot, input.path.replace(/^src\//, ''))
  const raw = fs.readFileSync(filename)
  const actual = descriptor(raw)
  if (matches(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!matches(actual, input)) {
    throw new Error(
      `${CASE_NAME}: main run view-mode replay requires its exact raw or recovered source state`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121MainRunViewModeOutput(raw.toString('utf8')),
    'utf8',
  )
  if (!matches(descriptor(recovered), output)) {
    throw new Error(
      `${CASE_NAME}: main run view-mode replay produced unexpected source`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}
