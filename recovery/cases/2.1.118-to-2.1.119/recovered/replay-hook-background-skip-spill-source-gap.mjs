#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.118-to-2.1.119'
const SOURCE_PATH = 'src/utils/hooks.ts'
const BEFORE = 'shellCommand.background(processId)'
const AFTER = 'shellCommand.background(processId, { skipSpill: true })'

export const TARGET119_HOOK_BACKGROUND_SKIP_SPILL_EVIDENCE_IDS =
  Object.freeze([
    'target119-hook-background-skip-spill-authenticated-units',
    'target119-hook-background-skip-spill-source-replay-test',
    'target119-hook-background-skip-spill-source-ast-test',
  ])

export const TARGET119_HOOK_BACKGROUND_SKIP_SPILL_INPUT = Object.freeze({
  path: SOURCE_PATH,
  bytes: 169841,
  sha256:
    'cfdfc53c05c7d8c0845a305f2a736e24abe22822b12703e782c7c24d7d9dcc11',
})

export const TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OUTPUT = Object.freeze({
  path: SOURCE_PATH,
  bytes: 169862,
  sha256:
    '4947d9e518c5f5a85cb6d6416ee03c4653b6febe69ae00e479a93ac11228db89',
})

export const TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:19143`,
      targetIndex: 19143,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze(['executeInBackground']),
      evidenceIds: TARGET119_HOOK_BACKGROUND_SKIP_SPILL_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 executeInBackground unit differs from its Target118 predecessor only by passing { skipSpill: true } to the registered background ShellCommand path. This preserves the in-memory stdout/stderr buffers needed by hook completion handling; the shifted command-error punctuation residue is exact predecessor syntax. The bounded source replay changes the sole matching call and leaves the asyncRewake path and pending-hook registration unchanged.',
    }),
  ])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function occurrenceCount(source, needle) {
  return source.split(needle).length - 1
}

function sourceFilename(sourceRoot) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const root = fs.realpathSync(path.resolve(sourceRoot))
  const filename = path.resolve(root, SOURCE_PATH.slice('src/'.length))
  const relative = path.relative(root, filename)
  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${CASE_NAME}: hooks source path escapes source root`)
  }
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${CASE_NAME}: ${SOURCE_PATH} must be a regular file`)
  }
  if (fs.realpathSync(filename) !== filename) {
    throw new Error(`${CASE_NAME}: ${SOURCE_PATH} resolves outside its path`)
  }
  return filename
}

export function buildTarget119HookBackgroundSkipSpillOutput(input) {
  const source = input.toString('utf8')
  if (occurrenceCount(source, BEFORE) !== 1) {
    throw new Error(
      `${CASE_NAME}: hook background replay requires one exact raw call`,
    )
  }
  if (occurrenceCount(source, AFTER) !== 0) {
    throw new Error(
      `${CASE_NAME}: hook background replay found a mixed skipSpill state`,
    )
  }
  const output = Buffer.from(source.replace(BEFORE, AFTER))
  const actual = descriptor(output)
  if (!descriptorsEqual(actual, TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OUTPUT)) {
    throw new Error(
      `${CASE_NAME}: hook background postimage drift ${actual.bytes}/${actual.sha256}`,
    )
  }
  return output
}

export function applyTarget119HookBackgroundSkipSpillSourceRecovery({
  sourceRoot,
} = {}) {
  const filename = sourceFilename(sourceRoot)
  const input = fs.readFileSync(filename)
  const actual = descriptor(input)
  if (descriptorsEqual(actual, TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OUTPUT)) {
    return Object.freeze({
      status: 'already-recovered',
      files: Object.freeze([]),
    })
  }
  if (!descriptorsEqual(actual, TARGET119_HOOK_BACKGROUND_SKIP_SPILL_INPUT)) {
    throw new Error(
      `${CASE_NAME}: hook background replay requires exact raw or recovered ${SOURCE_PATH}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const output = buildTarget119HookBackgroundSkipSpillOutput(input)
  fs.writeFileSync(filename, output)
  const written = descriptor(fs.readFileSync(filename))
  if (!descriptorsEqual(written, TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OUTPUT)) {
    throw new Error(
      `${CASE_NAME}: written hook background postimage differs ${written.bytes}/${written.sha256}`,
    )
  }
  return Object.freeze({
    status: 'recovered',
    files: Object.freeze([SOURCE_PATH]),
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceRootIndex = process.argv.indexOf('--source-root')
  const sourceRoot =
    sourceRootIndex >= 0 ? process.argv[sourceRootIndex + 1] : process.argv[2]
  if (!sourceRoot) {
    throw new Error(
      'usage: replay-hook-background-skip-spill-source-gap.mjs --source-root DIR',
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      applyTarget119HookBackgroundSkipSpillSourceRecovery({ sourceRoot }),
      null,
      2,
    )}\n`,
  )
}
