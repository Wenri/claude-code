#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { summarizeSourceTree } from '../../../scripts/verify-source-lineage.mjs'

const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_INDEX = 19589

const TARGET_FRAGMENT_EVIDENCE =
  'target118-sessions-owner-source-gap-target-fragment'
const SOURCE_AST_EVIDENCE =
  'target118-sessions-owner-source-gap-source-ast-test'

function freezeRecord(record) {
  return Object.freeze({ ...record })
}

function freezeOverride(override) {
  return Object.freeze({
    ...override,
    paths: Object.freeze([...override.paths]),
    evidenceIds: Object.freeze([...override.evidenceIds]),
  })
}

export const TARGET118_SESSIONS_SOURCE_TREE = freezeRecord({
  files: 2022,
  bytes: 31570676,
  manifestSha256:
    'c91ebcc114cbe577e4ffe43801e6014ade8e26d27271f57b0af1ce8ce9ff3d59',
})

export const TARGET118_SESSIONS_SOURCE_FILE = freezeRecord({
  path: 'src/remote/SessionsWebSocket.ts',
  bytes: 11946,
  sha256:
    '5d87121a7d82ac40696423ce49ff158a044b10476633c84351f71924f9097258',
})

export const TARGET118_SESSIONS_OWNER_OVERRIDES = Object.freeze([
  freezeOverride({
    key: `${CASE_NAME}:${TARGET_INDEX}`,
    targetIndex: TARGET_INDEX,
    paths: [TARGET118_SESSIONS_SOURCE_FILE.path],
    evidenceIds: [TARGET_FRAGMENT_EVIDENCE, SOURCE_AST_EVIDENCE],
    behavior:
      'The complete target118 SessionsWebSocket class is owned by the exact historical remote/SessionsWebSocket.ts class declaration; the provisional PromptInput owner is a coarse insertion neighbor.',
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function publicTreeSummary(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function sameTreeSummary(actual, expected) {
  return (
    actual.files === expected.files &&
    actual.bytes === expected.bytes &&
    actual.manifestSha256 === expected.manifestSha256
  )
}

function sourceFilename(sourceRoot, sourcePath) {
  if (!sourcePath.startsWith('src/')) {
    throw new Error(`${sourcePath}: source path must start with src/`)
  }
  const relative = sourcePath.slice('src/'.length)
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative.split('/').some(part => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`${sourcePath}: unsafe source path`)
  }
  const filename = path.resolve(sourceRoot, ...relative.split('/'))
  const prefix = `${path.resolve(sourceRoot)}${path.sep}`
  if (!filename.startsWith(prefix)) {
    throw new Error(`${sourcePath}: source path escapes source root`)
  }
  return filename
}

function verifySourceFile(sourceRoot) {
  const expected = TARGET118_SESSIONS_SOURCE_FILE
  const filename = sourceFilename(sourceRoot, expected.path)
  const status = fs.lstatSync(filename)
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${expected.path}: expected a real source file`)
  }
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (bytes.length !== expected.bytes || digest !== expected.sha256) {
    throw new Error(
      `${expected.path}: expected ${expected.bytes}/${expected.sha256}, ` +
        `got ${bytes.length}/${digest}`,
    )
  }
  return { ...expected, action: 'verified-unchanged' }
}

export function applyTarget118SessionsOwnerReplay({ sourceRoot }) {
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new Error('sourceRoot must be a non-empty path string')
  }
  const resolvedSourceRoot = path.resolve(sourceRoot)
  const tree = summarizeSourceTree(resolvedSourceRoot)
  if (!sameTreeSummary(tree, TARGET118_SESSIONS_SOURCE_TREE)) {
    throw new Error(
      `Refusing to replay against non-target118 source tree: got ` +
        `${tree.files}/${tree.bytes}/${tree.manifestSha256}`,
    )
  }
  const file = verifySourceFile(resolvedSourceRoot)
  return {
    case: CASE_NAME,
    status: 'already-represented',
    sourceRoot: resolvedSourceRoot,
    before: publicTreeSummary(tree),
    after: publicTreeSummary(tree),
    ownerOverrides: TARGET118_SESSIONS_OWNER_OVERRIDES.length,
    files: [file],
  }
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--source-root') {
    throw new Error(
      'Usage: replay-sessions-owner-source-gap.mjs --source-root DIR',
    )
  }
  return { sourceRoot: argv[1] }
}

function main() {
  const result = applyTarget118SessionsOwnerReplay(
    parseArguments(process.argv.slice(2)),
  )
  console.log(JSON.stringify(result, null, 2))
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
