#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CASE_NAME = '2.1.116-to-2.1.117'
const PROTOCOL_PATH = 'src/daemon/protocol.ts'

const TARGET_RUNTIME_EVIDENCE =
  'target117-daemon-protocol-authenticated-complete-schema-unit'
const BOUNDED_DONOR_EVIDENCE =
  'target117-daemon-protocol-bounded-target118-source-derivation'
const SOURCE_REPLAY_EVIDENCE =
  'target117-daemon-protocol-fail-closed-source-replay-test'

export const TARGET117_DAEMON_PROTOCOL_SOURCE = String.raw`import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'

export const PROTOCOL_VERSION = 1
export const MIN_PROTOCOL_VERSION = 1
export const SHORT_ID_RE = /^[a-f0-9]{8}$/
export const DETACH_SEQUENCE = '\x1B_cc-daemon-detach\x1B\\'

export const DispatchSchema = lazySchema(() =>
  z.object({
    proto: z.number().int().min(MIN_PROTOCOL_VERSION).max(PROTOCOL_VERSION),
    short: z.string().regex(SHORT_ID_RE),
    nonce: z.string().regex(SHORT_ID_RE).optional(),
    sessionId: z.string(),
    createdAt: z.number(),
    source: z.enum(['shell', 'slash', 'fleet', 'respawn']),
    cwd: z.string(),
    launch: z.discriminatedUnion('mode', [
      z.object({
        mode: z.literal('prompt'),
        args: z.array(z.string()),
      }),
      z.object({
        mode: z.literal('resume'),
        sessionId: z.string(),
        fork: z.boolean(),
        flagArgs: z.array(z.string()),
      }),
    ]),
    env: z.record(z.string(), z.string()).default({}),
    worktree: z
      .object({
        path: z.string(),
        ownershipToken: z.string(),
      })
      .optional(),
    isolation: z.enum(['none', 'worktree']).default('none'),
    respawnFlags: z.array(z.string()).default([]),
    agent: z.string().optional(),
    routine: z.string().optional(),
    seed: z
      .object({
        intent: z.string(),
        name: z.string().optional(),
      })
      .optional(),
    cols: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
  }),
)

export type Dispatch = z.infer<ReturnType<typeof DispatchSchema>>

export const WorkerRecordSchema = lazySchema(() =>
  z.object({
    pid: z.number(),
    procStart: z.string().optional(),
    sessionId: z.string(),
    rendezvousSock: z.string(),
    ptySock: z.string().optional(),
    messagingSock: z.string().optional(),
    startedAt: z.number(),
    attempt: z.number(),
    cwd: z.string(),
    worktreePath: z.string().optional(),
    dispatch: DispatchSchema(),
  }),
)

export type WorkerRecord = z.infer<ReturnType<typeof WorkerRecordSchema>>

export const ManifestSchema = lazySchema(() =>
  z.object({
    proto: z.number().int().min(MIN_PROTOCOL_VERSION).max(PROTOCOL_VERSION),
    supervisorPid: z.number(),
    updatedAt: z.number(),
    workers: z.record(z.string(), WorkerRecordSchema()),
  }),
)

export type Manifest = z.infer<ReturnType<typeof ManifestSchema>>

export const ControlMessageSchema = lazySchema(() => {
  const short = z.string().regex(SHORT_ID_RE)
  const proto = z
    .number()
    .int()
    .min(MIN_PROTOCOL_VERSION)
    .max(PROTOCOL_VERSION)

  return z.discriminatedUnion('op', [
    z.object({ proto, op: z.literal('ping') }),
    z.object({ proto, op: z.literal('nudge') }),
    z.object({
      proto,
      op: z.literal('await-ack'),
      short,
      nonce: short.optional(),
      timeoutMs: z.number(),
    }),
    z.object({
      proto,
      op: z.literal('dispatch'),
      d: DispatchSchema(),
      timeoutMs: z.number(),
    }),
    z.object({ proto, op: z.literal('list') }),
    z.object({ proto, op: z.literal('has'), short }),
    z.object({
      proto,
      op: z.literal('kill'),
      short,
      signal: z.enum(['SIGTERM', 'SIGKILL']).optional(),
    }),
    z.object({ proto, op: z.literal('reply'), short, text: z.string() }),
    z.object({
      proto,
      op: z.literal('subscribe'),
      short,
      tail: z.number().optional(),
    }),
    z.object({
      proto,
      op: z.literal('attach'),
      short,
      cols: z.number().int().min(1),
      rows: z.number().int().min(1),
      attachId: z.string().optional(),
    }),
    z.object({
      proto,
      op: z.literal('resize'),
      short,
      cols: z.number().int().min(1),
      rows: z.number().int().min(1),
      attachId: z.string().optional(),
    }),
    z.object({ proto, op: z.literal('ensure-spare'), cwd: z.string() }),
    z.object({
      proto,
      op: z.literal('permission-response'),
      short,
      requestId: z.string(),
      allow: z.boolean(),
    }),
  ])
})

export type ControlMessage = z.infer<ReturnType<typeof ControlMessageSchema>>

export const SettledJobSchema = lazySchema(() =>
  z.object({
    short: z.string().regex(SHORT_ID_RE),
    sessionId: z.string(),
    name: z.string().optional(),
    intent: z.string(),
    outcome: z.enum(['done', 'failed', 'crashed', 'killed']),
    cwd: z.string(),
    worktreePath: z.string().optional(),
    startedAt: z.number(),
    settledAt: z.number(),
    attempts: z.number(),
  }),
)

export type SettledJob = z.infer<ReturnType<typeof SettledJobSchema>>
`

export const TARGET117_DAEMON_PROTOCOL_FILE = Object.freeze({
  path: PROTOCOL_PATH,
  raw: null,
  postimage: Object.freeze({
    bytes: 4606,
    sha256: '1d1fb726e2b1c0659b763825aa09098ad169da08eb303ad152d3908e90a72d26',
  }),
})

export const TARGET118_DAEMON_PROTOCOL_DONOR = Object.freeze({
  bytes: 4709,
  sha256: 'e4e549ee88077b853c8d5088313fdb3c8313b674988a128b198b4b31fc40f973',
})

export const TARGET117_DAEMON_PROTOCOL_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17480`,
    targetIndex: 17480,
    paths: Object.freeze([PROTOCOL_PATH]),
    declarations: Object.freeze([
      'DispatchSchema',
      'WorkerRecordSchema',
      'ManifestSchema',
      'ControlMessageSchema',
      'SettledJobSchema',
    ]),
    evidenceIds: Object.freeze([
      TARGET_RUNTIME_EVIDENCE,
      BOUNDED_DONOR_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior:
      'Target117 daemon protocol retains procStart in WorkerRecord and adds optional attachId correlation to both attach and resize control messages. The complete five-schema source module is bounded from the authenticated Target118 donor by removing only Target118-only cliVersion and respawn-stale semantics.',
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function descriptorsEqual(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function replaceExactlyOnce(input, before, after, label) {
  const first = input.indexOf(before)
  const second = input.indexOf(before, first + 1)
  if (first < 0 || second >= 0) {
    throw new Error(`${CASE_NAME}: expected one exact ${label}`)
  }
  return input.slice(0, first) + after + input.slice(first + before.length)
}

export function deriveTarget117DaemonProtocolSourceFromTarget118(input) {
  const donor = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const actualDonor = descriptor(donor)
  if (!descriptorsEqual(actualDonor, TARGET118_DAEMON_PROTOCOL_DONOR)) {
    throw new Error(
      `${CASE_NAME}: Target118 daemon protocol donor drift; expected ${TARGET118_DAEMON_PROTOCOL_DONOR.bytes}/${TARGET118_DAEMON_PROTOCOL_DONOR.sha256}, got ${actualDonor.bytes}/${actualDonor.sha256}`,
    )
  }
  let output = donor.toString('utf8')
  output = replaceExactlyOnce(
    output,
    '    cliVersion: z.string().optional(),\n',
    '',
    'Target118-only WorkerRecord cliVersion field',
  )
  output = replaceExactlyOnce(
    output,
    "    z.object({ proto, op: z.literal('respawn-stale'), short }),\n",
    '',
    'Target118-only respawn-stale control variant',
  )
  const result = Buffer.from(output)
  const actual = descriptor(result)
  if (!descriptorsEqual(actual, TARGET117_DAEMON_PROTOCOL_FILE.postimage)) {
    throw new Error(
      `${CASE_NAME}: bounded Target117 protocol derivation drift; got ${actual.bytes}/${actual.sha256}`,
    )
  }
  return output
}

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, PROTOCOL_PATH.slice(4))
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${PROTOCOL_PATH}: escapes source root`)
  }
  return { root, filename }
}

function assertRealDirectory(filename, label) {
  const status = fs.lstatSync(filename)
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${label}: expected a real directory`)
  }
}

function assertExistingDirectoryChain(root, filename) {
  assertRealDirectory(root, 'sourceRoot')
  let current = root
  const relative = path.relative(root, path.dirname(filename))
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) break
    assertRealDirectory(current, path.relative(root, current))
  }
}

function classify(sourceRoot) {
  const { root, filename } = sourceFilename(sourceRoot)
  assertExistingDirectoryChain(root, filename)
  if (!fs.existsSync(filename)) return { root, filename, state: 'raw' }
  const status = fs.lstatSync(filename)
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`${PROTOCOL_PATH}: expected an absent path or real file`)
  }
  const actual = descriptor(fs.readFileSync(filename))
  if (descriptorsEqual(actual, TARGET117_DAEMON_PROTOCOL_FILE.postimage)) {
    return { root, filename, state: 'postimage' }
  }
  throw new Error(
    `${PROTOCOL_PATH}: expected absent raw source or postimage ${TARGET117_DAEMON_PROTOCOL_FILE.postimage.bytes}/${TARGET117_DAEMON_PROTOCOL_FILE.postimage.sha256}, got ${actual.bytes}/${actual.sha256}`,
  )
}

export function applyTarget117DaemonProtocolSourceRecovery({ sourceRoot } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  const file = classify(sourceRoot)
  if (file.state === 'postimage') {
    return Object.freeze({
      caseName: CASE_NAME,
      status: 'already-recovered',
      files: Object.freeze([]),
      ownerOverrides: TARGET117_DAEMON_PROTOCOL_OWNER_OVERRIDES.length,
    })
  }

  const output = Buffer.from(TARGET117_DAEMON_PROTOCOL_SOURCE)
  const actual = descriptor(output)
  if (!descriptorsEqual(actual, TARGET117_DAEMON_PROTOCOL_FILE.postimage)) {
    throw new Error(
      `${PROTOCOL_PATH}: embedded replay drift ${actual.bytes}/${actual.sha256}`,
    )
  }

  fs.mkdirSync(path.dirname(file.filename), { recursive: true })
  assertExistingDirectoryChain(file.root, file.filename)
  const temporary = `${file.filename}.target117-protocol-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temporary, output, { flag: 'wx', mode: 0o644 })
    fs.renameSync(temporary, file.filename)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
  return Object.freeze({
    caseName: CASE_NAME,
    status: 'recovered',
    files: Object.freeze([PROTOCOL_PATH]),
    ownerOverrides: TARGET117_DAEMON_PROTOCOL_OWNER_OVERRIDES.length,
  })
}

function parseArguments(argv) {
  const args = { sourceRoot: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source-root') args.sourceRoot = argv[++index]
    else throw new Error(`unknown argument: ${argv[index]}`)
  }
  return args
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = applyTarget117DaemonProtocolSourceRecovery(
    parseArguments(process.argv.slice(2)),
  )
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
