#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'
const SOURCE_PATH = 'src/commands/rename/rename.ts'

export const TARGET121_RENAME_GENERATED_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 3779,
    sha256:
      'f953d225b55aacbaab611c90562e790c41d28d5cc4b49a1af8d4af172935037b',
  }),
])

export const TARGET121_RENAME_GENERATED_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 3892,
    sha256:
      'e7b1c4d61f87c6bc215b4c9857cd6bb20bc03315c4b70d1a16438ade682800ae',
  }),
])

const EVIDENCE_IDS = Object.freeze([
  'target121-rename-generated-whole-unit-proof',
  'target121-rename-generated-source-replay-test',
  'target121-rename-generated-runtime-parity-test',
])

export const TARGET121_RENAME_GENERATED_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17014`,
    targetIndex: 17014,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze(['performRename']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'performRename records whether the requested name was generated from an empty argument, explicitly persists the daemon job rename with user origin, and returns isGenerated with the successful name.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:17015`,
    targetIndex: 17015,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze(['call']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      'The rename command call consumes performRename isGenerated and emits renameSystemReminder only for an explicit user-supplied name, avoiding a false user-named reminder for an automatically generated title.',
  }),
])

export const TARGET121_RENAME_GENERATED_EVIDENCE_IDS = EVIDENCE_IDS

const TRANSFORMS = Object.freeze([
  Object.freeze({
    label: 'performRename result contract',
    before: '): Promise<{ message: string; newName?: string }> {',
    after:
      '): Promise<{ message: string; newName?: string; isGenerated?: boolean }> {',
  }),
  Object.freeze({
    label: 'generated-name gate',
    before: `  let newName: string
  if (!args || args.trim() === '') {`,
    after: `  const isGenerated = !args || args.trim() === ''
  let newName: string
  if (isGenerated) {`,
  }),
  Object.freeze({
    label: 'explicit daemon rename origin',
    before: '  await renameJob(sessionId, newName)',
    after: "  await renameJob(sessionId, newName, 'user')",
  }),
  Object.freeze({
    label: 'generated-name result',
    before:
      '  return { message: `Session renamed to: ${newName}`, newName }',
    after:
      '  return { message: `Session renamed to: ${newName}`, newName, isGenerated }',
  }),
  Object.freeze({
    label: 'call result destructuring',
    before:
      '  const { message, newName } = await performRename(args, context)',
    after:
      '  const { message, newName, isGenerated } = await performRename(args, context)',
  }),
  Object.freeze({
    label: 'explicit-name reminder gate',
    before:
      '    metaMessages: newName ? [renameSystemReminder(newName)] : undefined,',
    after: `    metaMessages:
      newName && !isGenerated ? [renameSystemReminder(newName)] : undefined,`,
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

function replaceExactlyOnce(source, before, after, label) {
  const count = occurrenceCount(source, before)
  if (count !== 1) {
    throw new Error(`${CASE_NAME}: ${label} expected one anchor, got ${count}`)
  }
  return source.replace(before, () => after)
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const root = fs.realpathSync(path.resolve(sourceRoot))
  const filename = path.resolve(root, sourcePath.replace(/^src\//, ''))
  const relative = path.relative(root, filename)
  if (
    !sourcePath.startsWith('src/') ||
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${sourcePath}: escapes the supplied source root`)
  }
  return filename
}

function readRealFile(filename, sourcePath) {
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${sourcePath}: expected a real source file`)
  }
  if (fs.realpathSync(filename) !== filename) {
    throw new Error(`${sourcePath}: source path resolves through a symlink`)
  }
  return fs.readFileSync(filename)
}

export function buildTarget121RenameGeneratedOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`${SOURCE_PATH} source must be a string`)
  }
  return TRANSFORMS.reduce(
    (current, transform) =>
      replaceExactlyOnce(
        current,
        transform.before,
        transform.after,
        transform.label,
      ),
    source,
  )
}

export function applyTarget121RenameGeneratedSourceRecovery({ sourceRoot } = {}) {
  const input = TARGET121_RENAME_GENERATED_INPUT_FILES[0]
  const output = TARGET121_RENAME_GENERATED_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: rename generated-name replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121RenameGeneratedOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: rename generated-name replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121RenameGeneratedSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
