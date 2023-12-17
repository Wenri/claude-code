#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CASE_NAME = '2.1.118-to-2.1.119'
const SOURCE_PATH = 'src/utils/binaryCheck.ts'

export const TARGET119_BINARY_COMMAND_VALIDATION_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 1466,
    sha256:
      'bfc8cacb7ef1a2e71ce8f5c189ed5797de81471d4a450dae31b958a2265cc020',
  }),
])

export const TARGET119_BINARY_COMMAND_VALIDATION_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 1848,
    sha256:
      'ad80d6326374704d5e009f7a04702121ba36fc7f7140f0813ed070d438b9d3c6',
  }),
])

export const TARGET119_BINARY_COMMAND_VALIDATION_EVIDENCE_IDS = Object.freeze([
  'target119-binary-command-validation-authenticated-target-fragment',
  'target119-binary-command-validation-source-replay-test',
  'target119-binary-command-validation-source-ast-test',
])

export const TARGET119_BINARY_COMMAND_VALIDATION_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20977`,
      targetIndex: 20977,
      paths: Object.freeze([SOURCE_PATH]),
      declarations: Object.freeze([
        'SAFE_BINARY_NAME_PATTERN',
        'isBinaryInstalled',
      ]),
      evidenceIds: TARGET119_BINARY_COMMAND_VALIDATION_EVIDENCE_IDS,
      behavior:
        'Binary lookup rejects unsafe command names before consulting the cache or PATH. Windows accepts drive and backslash syntax through the platform-specific pattern; Unix retains the narrower slash-safe pattern.',
    }),
  ])

const IMPORT_ANCHOR = "import { logForDebugging } from './debug.js'\n"
const IMPORT_OUTPUT = `${IMPORT_ANCHOR}import { getPlatform } from './platform.js'\n`
const CACHE_ANCHOR =
  '// Session cache to avoid repeated checks\nconst binaryCache = new Map<string, boolean>()\n'
const CACHE_OUTPUT = `${CACHE_ANCHOR}const SAFE_BINARY_NAME_PATTERN =
  getPlatform() === 'windows'
    ? /^[A-Za-z0-9/\\\\][A-Za-z0-9_.+:\\\\?/-]*$/
    : /^[A-Za-z0-9/][A-Za-z0-9_.+/-]*$/
`
const TRIM_ANCHOR = '  const trimmedCommand = command.trim()\n\n'
const TRIM_OUTPUT = `${TRIM_ANCHOR}  if (!SAFE_BINARY_NAME_PATTERN.test(trimmedCommand)) {
    logForDebugging(
      \`[binaryCheck] Rejected command with unsafe characters: '\${trimmedCommand}'\`,
    )
    return false
  }

`

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function descriptorsEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1
  if (count !== 1) {
    throw new Error(`${CASE_NAME}: ${label} expected one anchor, got ${count}`)
  }
  return source.replace(before, () => after)
}

function sourceFilename(sourceRoot) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const root = fs.realpathSync(path.resolve(sourceRoot))
  const filename = path.resolve(root, SOURCE_PATH.slice(4))
  const relative = path.relative(root, filename)
  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${SOURCE_PATH}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${SOURCE_PATH}: expected a real source file`)
  }
  if (fs.realpathSync(filename) !== filename) {
    throw new Error(`${SOURCE_PATH}: source path resolves through a symlink`)
  }
  return fs.readFileSync(filename)
}

export function buildTarget119BinaryCommandValidationOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`${SOURCE_PATH} source must be a string`)
  }
  const withImport = replaceExactlyOnce(
    source,
    IMPORT_ANCHOR,
    IMPORT_OUTPUT,
    'platform import',
  )
  const withPattern = replaceExactlyOnce(
    withImport,
    CACHE_ANCHOR,
    CACHE_OUTPUT,
    'safe command pattern',
  )
  return replaceExactlyOnce(
    withPattern,
    TRIM_ANCHOR,
    TRIM_OUTPUT,
    'pre-cache validation guard',
  )
}

export function applyTarget119BinaryCommandValidationSourceRecovery({
  sourceRoot,
} = {}) {
  const input = TARGET119_BINARY_COMMAND_VALIDATION_INPUT_FILES[0]
  const output = TARGET119_BINARY_COMMAND_VALIDATION_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot)
  const current = readRealFile(filename)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: binary validation replay requires exact raw or recovered ${SOURCE_PATH}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget119BinaryCommandValidationOutput(current.toString('utf8')),
  )
  if (!descriptorsEqual(descriptor(recovered), output)) {
    throw new Error(
      `${CASE_NAME}: binary validation replay produced an unexpected ${SOURCE_PATH}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [SOURCE_PATH] }
}
