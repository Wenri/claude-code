#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.120-to-2.1.121'
const SOURCE_PATH = 'src/daemon/hub.tsx'

export const TARGET121_DAEMON_HUB_STATUS_READER_INPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 34360,
    sha256:
      '37012eadad08ae7c1ede58917cb847b3a9536c888650d9370b1572782787bcc1',
  }),
])

export const TARGET121_DAEMON_HUB_STATUS_READER_OUTPUT_FILES = Object.freeze([
  Object.freeze({
    path: SOURCE_PATH,
    bytes: 34901,
    sha256:
      'b58e0e85331175a947f36e7ebd832a9cb4f36d01574d85d7058be96f57ebb330',
  }),
])

export const TARGET121_DAEMON_HUB_STATUS_READER_EVIDENCE_IDS = Object.freeze([
  'target121-daemon-hub-status-reader-authenticated-whole-unit',
  'target121-daemon-hub-status-reader-source-replay',
  'target121-daemon-hub-status-reader-runtime-parity',
  'target121-process-start-token-match-retained-dependency',
  'target121-safe-json-parser-retained-dependency',
])

export const TARGET121_DAEMON_HUB_STATUS_READER_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:18380`,
    targetIndex: 18380,
    paths: Object.freeze([SOURCE_PATH]),
    declarations: Object.freeze([
      'DaemonWorkerStatus',
      'readDaemonWorkerStatus',
    ]),
    evidenceIds: TARGET121_DAEMON_HUB_STATUS_READER_EVIDENCE_IDS,
    behavior:
      'readDaemonWorkerStatus safely parses daemon.status.json, validates the status shape and live supervisor PID, and rejects a reused PID when supervisorProcStart does not match the current process birth token. The complete Target121 reader also narrows its read catch, accepts an optional supervisorProcStart for backward compatibility, and restores the matched loadDaemonHubData fail-closed call. The separate u18378 writeDaemonStatus replay is a pinned producer dependency and is intentionally not claimed here.',
  }),
])

const IMPORT_BEFORE =
  "import { logForDebugging } from '../utils/debug.js'"

const IMPORT_AFTER = `${IMPORT_BEFORE}
import { processStartTokenMatches } from '../utils/genericProcessUtils.js'
import { safeParseJSON } from '../utils/json.js'`

const TYPE_BEFORE = `type DaemonWorkerStatus = {
  supervisorPid: number
  workers: Record<string, { pid: number; startedAt: number }>
}`

const TYPE_AFTER = `type DaemonWorkerStatus = {
  supervisorPid: number
  supervisorProcStart?: string
  workers: Record<string, { pid: number; startedAt: number }>
}`

const DECLARATION_BEFORE = `async function readDaemonWorkerStatus(): Promise<DaemonWorkerStatus | null> {
  try {
    const parsed = JSON.parse(
      await readFile(getDaemonStatusPath(), 'utf8'),
    ) as Partial<DaemonWorkerStatus>
    if (
      typeof parsed.supervisorPid !== 'number' ||
      !parsed.workers ||
      typeof parsed.workers !== 'object' ||
      Array.isArray(parsed.workers)
    ) {
      return null
    }
    process.kill(parsed.supervisorPid, 0)
    return parsed as DaemonWorkerStatus
  } catch {
    return null
  }
}`

const DECLARATION_AFTER = `async function readDaemonWorkerStatus(): Promise<DaemonWorkerStatus | null> {
  let raw: string
  try {
    raw = await readFile(getDaemonStatusPath(), 'utf8')
  } catch {
    return null
  }
  const parsed = safeParseJSON(raw, false)
  if (!parsed || typeof parsed !== 'object') return null
  const status = parsed as Partial<DaemonWorkerStatus>
  if (
    typeof status.supervisorPid !== 'number' ||
    typeof status.workers !== 'object' ||
    status.workers === null
  ) {
    return null
  }
  try {
    process.kill(status.supervisorPid, 0)
  } catch {
    return null
  }
  const supervisorProcStart =
    typeof status.supervisorProcStart === 'string'
      ? status.supervisorProcStart
      : undefined
  if (
    !(await processStartTokenMatches(
      status.supervisorPid,
      supervisorProcStart,
    ))
  ) {
    return null
  }
  return parsed as DaemonWorkerStatus
}`

const CALL_BEFORE = '      readDaemonWorkerStatus(),'
const CALL_AFTER = '      readDaemonWorkerStatus().catch(() => null),'

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

export function buildTarget121DaemonHubStatusReaderOutput(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`${SOURCE_PATH} source must be a string`)
  }
  const imported = replaceExactlyOnce(
    source,
    IMPORT_BEFORE,
    IMPORT_AFTER,
    'dependency import anchor',
  )
  const typed = replaceExactlyOnce(
    imported,
    TYPE_BEFORE,
    TYPE_AFTER,
    'DaemonWorkerStatus type',
  )
  const declared = replaceExactlyOnce(
    typed,
    DECLARATION_BEFORE,
    DECLARATION_AFTER,
    'readDaemonWorkerStatus declaration',
  )
  return replaceExactlyOnce(
    declared,
    CALL_BEFORE,
    CALL_AFTER,
    'loadDaemonHubData reader call',
  )
}

export function applyTarget121DaemonHubStatusReaderSourceRecovery({
  sourceRoot,
} = {}) {
  const input = TARGET121_DAEMON_HUB_STATUS_READER_INPUT_FILES[0]
  const output = TARGET121_DAEMON_HUB_STATUS_READER_OUTPUT_FILES[0]
  const filename = sourceFilename(sourceRoot, input.path)
  const current = readRealFile(filename, input.path)
  const actual = descriptor(current)
  if (descriptorsEqual(actual, output)) {
    return { status: 'already-recovered', files: [] }
  }
  if (!descriptorsEqual(actual, input)) {
    throw new Error(
      `${CASE_NAME}: daemon-hub status-reader replay requires exact raw or recovered ${input.path}; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  const recovered = Buffer.from(
    buildTarget121DaemonHubStatusReaderOutput(current.toString('utf8')),
  )
  const recoveredDescriptor = descriptor(recovered)
  if (!descriptorsEqual(recoveredDescriptor, output)) {
    throw new Error(
      `${CASE_NAME}: daemon-hub status-reader replay produced unexpected ${output.path} ${recoveredDescriptor.bytes}/${recoveredDescriptor.sha256}`,
    )
  }
  fs.writeFileSync(filename, recovered)
  return { status: 'recovered', files: [output.path] }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = applyTarget121DaemonHubStatusReaderSourceRecovery({
    sourceRoot: process.argv[2],
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
