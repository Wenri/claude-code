#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'
const SOURCE_PATH = 'src/daemon/main.ts'

export const TARGET121_DAEMON_STATUS_PROC_START_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 51364,
    sha256:
      'e63ff7e680a226f93c6953a0a6a096e8846982cc9f5fd705a5809ad7a7a6155a',
  }),
])

export const TARGET121_DAEMON_STATUS_PROC_START_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 51036,
    sha256:
      'cb91eacf512342a4b70e01cb135eba59e621124795856eb5b4ea4762e2c5bc7c',
  }),
])

export const TARGET121_DAEMON_STATUS_PROC_START_EVIDENCE_IDS = Object.freeze([
  'target121-daemon-status-writer-authenticated-whole-unit',
  'target121-daemon-status-writer-source-replay',
  'target121-daemon-status-writer-runtime-parity',
  'target121-current-process-start-token-retained-dependency',
])

export const TARGET121_DAEMON_STATUS_PROC_START_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:18378`,
    targetIndex: 18378,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze(['writeDaemonStatus']),
    evidenceIds: TARGET121_DAEMON_STATUS_PROC_START_EVIDENCE_IDS,
    behavior:
      'writeDaemonStatus persists supervisorPid, the cached current-process birth token as supervisorProcStart, writtenAt, and the live worker map in one best-effort daemon.status.json write. The authenticated Target121 declaration replaces Target120\'s temporary-file/rename sequence as a complete unit; the bounded replay restores that entire declaration and its retained getCurrentProcessStartToken import. The downstream status reader is a separate structural unit and is intentionally not claimed here.',
  }),
])

const IMPORT_BEFORE =
  "import { getProcessStartTokenAsync } from '../utils/genericProcessUtils.js'"

const IMPORT_AFTER = `import {
  getCurrentProcessStartToken,
  getProcessStartTokenAsync,
} from '../utils/genericProcessUtils.js'`

const DECLARATION_BEFORE = `async function writeDaemonStatus(
  workers: Record<string, { pid: number; startedAt: number }>,
): Promise<void> {
  const path = getDaemonStatusPath()
  const temporary = \`${'${path}'}.tmp.${'${process.pid}'}\`
  const status = {
    supervisorPid: process.pid,
    writtenAt: Date.now(),
    workers,
  }
  try {
    await writeFile(temporary, JSON.stringify(status, null, 2), 'utf8')
    try {
      await rename(temporary, path)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EXDEV') throw error
      await unlink(path).catch(() => {})
      await rename(temporary, path)
    }
  } catch {
    await unlink(temporary).catch(() => {})
  }
}`

const DECLARATION_AFTER = `async function writeDaemonStatus(
  workers: Record<string, { pid: number; startedAt: number }>,
): Promise<void> {
  const status = {
    supervisorPid: process.pid,
    supervisorProcStart: getCurrentProcessStartToken(),
    writtenAt: Date.now(),
    workers,
  }
  try {
    await writeFile(getDaemonStatusPath(), JSON.stringify(status, null, 2))
  } catch {}
}`

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
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

export function buildTarget121DaemonStatusProcStartOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`${SOURCE_PATH} source must be a string`)
  }
  const imported = replaceExactlyOnce(
    source,
    IMPORT_BEFORE,
    IMPORT_AFTER,
    'genericProcessUtils import',
  )
  return replaceExactlyOnce(
    imported,
    DECLARATION_BEFORE,
    DECLARATION_AFTER,
    'writeDaemonStatus declaration',
  )
}

export function applyTarget121DaemonStatusProcStartSourceRecovery({
  sourceRoot,
} = {}) {
  const input = TARGET121_DAEMON_STATUS_PROC_START_INPUT_FILES[0]
  const output = TARGET121_DAEMON_STATUS_PROC_START_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: daemon-status proc-start replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121DaemonStatusProcStartOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: daemon-status proc-start replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121DaemonStatusProcStartSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
