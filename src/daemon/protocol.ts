import { z } from 'zod/v4'
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
    cliVersion: z.string().optional(),
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
    z.object({ proto, op: z.literal('respawn-stale'), short }),
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
