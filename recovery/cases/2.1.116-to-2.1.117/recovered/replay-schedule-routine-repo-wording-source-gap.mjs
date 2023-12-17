#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_INPUT_FILE = Object.freeze({
  path: 'src/skills/bundled/scheduleRemoteAgents.ts',
  bytes: 20343,
  sha256: 'a56e4851d911623452908a4ece4e070f192bddae3a62dd73c69b16badac32527',
})

export const TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OUTPUT_FILE = Object.freeze({
  path: 'src/skills/bundled/scheduleRemoteAgents.ts',
  bytes: 20343,
  sha256: '2c910d2554429acdb001bbf3e22369a2fd38f0ed1be4101a086d728d16108444',
})

const TARGET_FRAGMENT_EVIDENCE =
  'target117-schedule-routine-repo-wording-target-fragment'
const REPLAY_EVIDENCE =
  'target117-schedule-routine-repo-wording-source-replay-test'

export const TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20368`,
      targetIndex: 20368,
      paths: Object.freeze(['src/skills/bundled/scheduleRemoteAgents.ts']),
      declarations: Object.freeze(['registerScheduleRemoteAgentsSkill']),
      evidenceIds: Object.freeze([TARGET_FRAGMENT_EVIDENCE, REPLAY_EVIDENCE]),
      behavior:
        'The complete authenticated Target117 schedule skill registration owns the GitHub-App fallback note; its no-web-setup branch names the scheduled work a routine, while preserving the target URL, repository interpolation, feature gate, and sibling web-setup branch.',
    }),
  ])

const INPUT_ANCHOR = 'if your trigger needs this repo.'
const OUTPUT_ANCHOR = 'if your routine needs this repo.'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function recoverSource(input) {
  const source = input.toString('utf8')
  const first = source.indexOf(INPUT_ANCHOR)
  if (
    first === -1 ||
    source.indexOf(INPUT_ANCHOR, first + INPUT_ANCHOR.length) !== -1
  ) {
    throw new Error('schedule routine repository wording: expected one anchor')
  }
  return Buffer.from(
    `${source.slice(0, first)}${OUTPUT_ANCHOR}${source.slice(first + INPUT_ANCHOR.length)}`,
  )
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_INPUT_FILE.path.slice(4),
  )
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error('schedule routine repository wording path escapes source root')
  }
  return filename
}

export function applyTarget117ScheduleRoutineRepoWordingSourceRecovery({
  sourceRoot,
} = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (
    descriptorsEqual(
      actual,
      TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OUTPUT_FILE,
    )
  ) {
    return Object.freeze({
      status: 'already-recovered',
      ownerOverrides:
        TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OWNER_OVERRIDES.length,
      file: TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OUTPUT_FILE,
    })
  }
  if (
    !descriptorsEqual(
      actual,
      TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_INPUT_FILE,
    )
  ) {
    throw new Error(
      `Refusing non-target schedule routine repository wording recovery: ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = recoverSource(input)
  const recovered = descriptor(output)
  if (
    !descriptorsEqual(
      recovered,
      TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `Recovered schedule routine repository wording descriptor mismatch: ${recovered.bytes}/${recovered.sha256}`,
    )
  }
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (
    !descriptorsEqual(
      written,
      TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OUTPUT_FILE,
    )
  ) {
    throw new Error(
      `Written schedule routine repository wording descriptor mismatch: ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    ownerOverrides:
      TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OWNER_OVERRIDES.length,
    file: TARGET117_SCHEDULE_ROUTINE_REPO_WORDING_OUTPUT_FILE,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117ScheduleRoutineRepoWordingSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
