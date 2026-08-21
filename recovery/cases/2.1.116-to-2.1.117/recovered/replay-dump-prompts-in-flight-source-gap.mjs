#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_DUMP_PROMPTS_IN_FLIGHT_INPUT_FILE = Object.freeze({
  path: 'src/services/api/dumpPrompts.ts',
  bytes: 7332,
  sha256: 'ca729320f1efe28756d7f18a0c973d686fd954d1311b172013e07dbdcf729baa',
})

export const TARGET117_DUMP_PROMPTS_IN_FLIGHT_OUTPUT_FILE = Object.freeze({
  path: 'src/services/api/dumpPrompts.ts',
  bytes: 7507,
  sha256: '478581314b3fc9e00519d4f7b42fd626ecfc98df0724058ed83f0a27365349ab',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-dump-prompts-in-flight-target-fragments'
const BASELINE_FRAGMENT_EVIDENCE =
  'target116-dump-prompts-without-in-flight-fragments'
const REPLAY_EVIDENCE = 'target117-dump-prompts-in-flight-source-replay-test'

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    declarations: Object.freeze([...override.declarations]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET117_DUMP_PROMPTS_IN_FLIGHT_OWNER_OVERRIDES = Object.freeze([
  freezeOverride({
    key: `${CASE_NAME}:10471`,
    targetIndex: 10471,
    paths: ['src/services/api/dumpPrompts.ts'],
    declarations: ['dumpRequest'],
    evidenceIds: [
      TARGET_FRAGMENT_EVIDENCE,
      BASELINE_FRAGMENT_EVIDENCE,
      REPLAY_EVIDENCE,
    ],
    behavior:
      'Target117 releases the per-session dumpInFlight guard in dumpRequest.finally, including parse and append failures, so later request dumps cannot remain permanently suppressed.',
  }),
  freezeOverride({
    key: `${CASE_NAME}:10472`,
    targetIndex: 10472,
    paths: ['src/services/api/dumpPrompts.ts'],
    declarations: ['DumpState', 'createDumpPromptsFetch'],
    evidenceIds: [
      TARGET_FRAGMENT_EVIDENCE,
      BASELINE_FRAGMENT_EVIDENCE,
      REPLAY_EVIDENCE,
    ],
    behavior:
      'Target117 initializes dumpInFlight false, admits only one pending POST body per session, marks the state before setImmediate, and delegates clearing to dumpRequest.finally.',
  }),
])

const DUMP_STATE_INPUT = `  lastInitFingerprint: string
}`
const DUMP_STATE_OUTPUT = `  lastInitFingerprint: string
  dumpInFlight: boolean
}`

const DUMP_REQUEST_TAIL_INPUT = `  } catch {
    // Ignore parsing errors
  }
}

export function createDumpPromptsFetch`
const DUMP_REQUEST_TAIL_OUTPUT = `  } catch {
    // Ignore parsing errors
  } finally {
    state.dumpInFlight = false
  }
}

export function createDumpPromptsFetch`

const INITIAL_STATE_INPUT = `      lastInitFingerprint: '',
    }`
const INITIAL_STATE_OUTPUT = `      lastInitFingerprint: '',
      dumpInFlight: false,
    }`

const POST_GUARD_INPUT = `    if (init?.method === 'POST' && init.body) {
      timestamp`
const POST_GUARD_OUTPUT = `    if (
      init?.method === 'POST' &&
      init.body &&
      !state.dumpInFlight
    ) {
      state.dumpInFlight = true
      timestamp`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`${label}: expected exactly one input anchor`)
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`
}

function recoverSource(input) {
  let source = input.toString('utf8')
  source = replaceExactlyOnce(
    source,
    DUMP_STATE_INPUT,
    DUMP_STATE_OUTPUT,
    'dump-prompts in-flight state field',
  )
  source = replaceExactlyOnce(
    source,
    DUMP_REQUEST_TAIL_INPUT,
    DUMP_REQUEST_TAIL_OUTPUT,
    'dump-prompts in-flight finally release',
  )
  source = replaceExactlyOnce(
    source,
    INITIAL_STATE_INPUT,
    INITIAL_STATE_OUTPUT,
    'dump-prompts in-flight initial state',
  )
  source = replaceExactlyOnce(
    source,
    POST_GUARD_INPUT,
    POST_GUARD_OUTPUT,
    'dump-prompts in-flight admission guard',
  )
  return Buffer.from(source)
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET117_DUMP_PROMPTS_IN_FLIGHT_INPUT_FILE.path.slice(4),
  )
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('dump-prompts path escapes the supplied source root')
  }
  return filename
}

export function applyTarget117DumpPromptsInFlightSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, TARGET117_DUMP_PROMPTS_IN_FLIGHT_OUTPUT_FILE)) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides:
        TARGET117_DUMP_PROMPTS_IN_FLIGHT_OWNER_OVERRIDES.length,
      file: TARGET117_DUMP_PROMPTS_IN_FLIGHT_OUTPUT_FILE,
    })
  }
  if (!descriptorsEqual(actual, TARGET117_DUMP_PROMPTS_IN_FLIGHT_INPUT_FILE)) {
    throw new Error(
      `Refusing non-target dump-prompts in-flight recovery: ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = recoverSource(input)
  const recovered = descriptor(output)
  if (!descriptorsEqual(recovered, TARGET117_DUMP_PROMPTS_IN_FLIGHT_OUTPUT_FILE)) {
    throw new Error(
      `Recovered dump-prompts in-flight descriptor mismatch: ${recovered.bytes}/${recovered.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (!descriptorsEqual(written, TARGET117_DUMP_PROMPTS_IN_FLIGHT_OUTPUT_FILE)) {
    throw new Error(
      `Written dump-prompts in-flight descriptor mismatch: ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    ownerOverrides: TARGET117_DUMP_PROMPTS_IN_FLIGHT_OWNER_OVERRIDES.length,
    file: TARGET117_DUMP_PROMPTS_IN_FLIGHT_OUTPUT_FILE,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117DumpPromptsInFlightSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
