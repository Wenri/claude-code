import { readFile } from 'fs/promises'
import { basename, join } from 'path'
import { z } from 'zod/v4'
import { logForDebugging } from '../utils/debug.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'
import { safeParseJSON } from '../utils/json.js'
import { lazySchema } from '../utils/lazySchema.js'

export const STATE_FILE = 'state.json'

export const JobStateSchema = lazySchema(() =>
  z
    .object({
      state: z.string(),
      detail: z.string(),
      tempo: z.enum(['active', 'idle', 'blocked']).optional(),
      inFlight: z
        .object({
          tasks: z.number(),
          queued: z.number(),
          kinds: z.array(z.string()),
        })
        .optional(),
      needs_you: z.boolean().optional(),
      needs: z.string().optional(),
      output: z.record(z.string(), z.string()).nullable().default(null),
      children: z
        .array(
          z.object({
            id: z.string(),
            href: z.string(),
          }),
        )
        .nullable()
        .default(null),
      linkScanOffset: z.number().default(0),
      linkScanPath: z.string().optional(),
      template: z.string(),
      routine: z.string().optional(),
      intent: z.string(),
      initialPrompt: z.string().optional(),
      name: z.string().optional(),
      sessionId: z.string(),
      cliVersion: z.string().optional(),
      cwd: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      firstTerminalAt: z.string().nullable().default(null),
      worktreePath: z.string().optional(),
      worktreeBranch: z.string().optional(),
      worktreeHookBased: z.boolean().optional(),
      originCwd: z.string().optional(),
      backend: z.enum(['daemon', 'peer']).default('daemon'),
      sock: z.string().optional(),
      pid: z.number().optional(),
      sortOrder: z.number().optional(),
      pinned: z.boolean().optional(),
    })
    .transform(({ needs_you, ...rest }) => ({
      ...rest,
      tempo: rest.tempo ?? (needs_you ? 'blocked' : 'idle'),
    })),
)

export type JobState = z.infer<ReturnType<typeof JobStateSchema>>

export function getJobsDir(): string {
  return join(getClaudeConfigHomeDir(), 'jobs')
}

export function getJobDir(id: string): string {
  return join(getJobsDir(), id)
}

export async function readJobState(jobDir: string): Promise<JobState | null> {
  try {
    const [rawState, rawOrder] = await Promise.all([
      readFile(join(jobDir, STATE_FILE), 'utf-8'),
      readFile(join(jobDir, 'order'), 'utf-8').catch(() => null),
    ])
    const result = JobStateSchema().safeParse(safeParseJSON(rawState))
    if (!result.success) {
      logForDebugging(
        `[jobs] skipping ${basename(jobDir)}: state.json schema validation failed — ${result.error.message}`,
        { level: 'warn' },
      )
      return null
    }

    const order = rawOrder !== null ? Number(rawOrder) : undefined
    let state = result.data
    if (Number.isFinite(order)) state = { ...state, sortOrder: order }
    return state
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(
        `[jobs] skipping ${basename(jobDir)}: state.json read/parse failed — ${error instanceof Error ? error.message : String(error)}`,
        { level: 'warn' },
      )
    }
    return null
  }
}
