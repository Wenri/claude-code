import { randomUUID } from 'crypto'
import { mkdir, rm } from 'fs/promises'
import {
  createInitialJobState,
  getJobDir,
  isTerminalState,
  readJobState,
  writeJobState,
  type JobState,
} from '../../daemon/jobs.js'
import { requestControl } from '../../daemon/client.js'
import { listLiveJobs } from '../../daemon/client.js'
import { PROTOCOL_VERSION } from '../../daemon/protocol.js'
import { logEvent } from '../../services/analytics/index.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  deleteBgJob,
  respawnBgJob,
  spawnBgSession,
} from '../bg.js'

export interface TemplateJob {
  name: string
  description?: string
  initialPrompt?: string
}

export async function dispatchTemplateJob(
  template: TemplateJob,
  intent: string,
  sessionId = randomUUID(),
  cwd = process.cwd(),
  routine?: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  logForDebugging('[PERF:bg-dispatch-start]')
  const short = sessionId.slice(0, 8)
  const jobDir = getJobDir(short)
  try {
    await mkdir(jobDir, { recursive: true })
    await writeJobState(
      jobDir,
      createInitialJobState({
        template: routine
          ? { name: routine }
          : {
              name: template.name,
              initialPrompt: template.initialPrompt,
            },
        routine,
        intent,
        ...(routine && !intent
          ? { tempo: 'idle' as const, detail: '(idle — waiting for trigger)' }
          : {}),
        sessionId,
        cwd,
        originCwd: cwd,
      }),
    )
  } catch (error) {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {})
    return { ok: false, error: `Couldn't create the job — ${String(error)}` }
  }
  const selector = routine
    ? ['--routine', routine]
    : ['--agent', template.name]
  const result = await spawnBgSession(
    intent ? [...selector, '--', intent] : selector,
    sessionId,
    'fleet',
    cwd,
  )
  if (!result.ok) {
    await deleteBgJob(short)
    return result
  }
  logForDebugging('[PERF:bg-dispatch-end]')
  return { ok: true, jobId: short }
}

export async function sendJobReply(
  short: string,
  text: string,
  knownState?: JobState,
): Promise<string | null> {
  const jobDir = getJobDir(short)
  const state = knownState ?? (await readJobState(jobDir))
  if (state) {
    await writeJobState(jobDir, {
      ...state,
      detail: text.replace(/[\r\n]+/g, ' ').slice(0, 80),
      tempo: 'active',
      needs: undefined,
      output: null,
      updatedAt: new Date().toISOString(),
    }).catch(() => {})
  }
  const response = await requestControl({
    proto: PROTOCOL_VERSION,
    op: 'reply',
    short,
    text,
  })
  if (response.ok) {
    logEvent('tengu_bg_agent_action', {
      action: 'reply',
      agent: state?.template ?? 'unknown',
      wasTerminal: state ? isTerminalState(state.state) : false,
      daemon: true,
    })
    return null
  }
  if (state) await writeJobState(jobDir, state).catch(() => {})
  if (response.code === 'ENOJOB') {
    return "That session isn't running — respawn it first"
  }
  if (response.code === 'ENOCONN') {
    return "Couldn't reach the daemon — it may be restarting. Press Enter to retry"
  }
  return `Couldn't send your message — ${response.error}`
}

export async function respawnTemplateJob(
  short: string,
  options?: {
    knownAlive?: boolean
    knownState?: JobState
    force?: boolean
    initialPrompt?: string
  },
) {
  if (options?.knownAlive && options.knownState && !options.force) {
    return {
      ok: false as const,
      alive: true,
      state: options.knownState,
      error: `Session ${short} is already running`,
    }
  }
  const state = options?.knownState ?? (await readJobState(getJobDir(short)))
  if (!state) {
    return {
      ok: false as const,
      alive: false,
      error: "Can't respawn — that job's saved state is missing",
    }
  }
  if (!options?.force && (await listLiveJobs()).has(short)) {
    return {
      ok: false as const,
      alive: true,
      state,
      error: `Session ${short} is already running`,
    }
  }
  const result = await respawnBgJob(short, state, options?.initialPrompt)
  return result.ok
    ? { ok: true as const, state: result.state }
    : { ok: false as const, alive: false, error: result.error }
}

export { deleteBgJob as deleteTemplateJob }

interface SpareJob {
  jobId: string
  sessionId: string
  cwd: string
  ready: boolean
}

let spare: SpareJob | null = null
let spawningSpare: Promise<void> | null = null
let spareDisabled = false

export function getPrewarmedJob(): SpareJob | null {
  return spare
}

export function markPrewarmedJobReady(sessionId: string): void {
  if (spare?.sessionId === sessionId) spare.ready = true
}

export async function prewarmTemplateJob(
  cwd: string,
  force = false,
): Promise<void> {
  if (force) spareDisabled = false
  if (spare || spawningSpare || spareDisabled) return
  const sessionId = randomUUID()
  const short = sessionId.slice(0, 8)
  logForDebugging(`[PERF:bg-spare-start] ${short}`)
  spawningSpare = (async () => {
    try {
      const result = await spawnBgSession(
        ['--agent', 'general-purpose'],
        sessionId,
        'fleet',
        cwd,
      )
      if (!result.ok) {
        await rm(getJobDir(short), { recursive: true, force: true }).catch(
          () => {},
        )
        return
      }
      if (spareDisabled) {
        await deleteBgJob(short)
        return
      }
      spare = { jobId: short, sessionId, cwd, ready: false }
      logForDebugging(`[PERF:bg-spare-spawned] ${short}`)
    } finally {
      spawningSpare = null
    }
  })()
  await spawningSpare
}

export async function claimPrewarmedJob(
  intent: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  logForDebugging('[PERF:bg-claim-start]')
  const claimed = spare
  spare = null
  if (!claimed) {
    return {
      ok: false,
      error: "The pre-warmed session wasn't ready — press Enter to try again",
    }
  }
  const state = createInitialJobState({
    template: { name: 'general-purpose' },
    intent,
    detail: intent.replace(/[\r\n]+/g, ' ').slice(0, 80),
    sessionId: claimed.sessionId,
    cwd: claimed.cwd,
    originCwd: claimed.cwd,
  })
  await writeJobState(getJobDir(claimed.jobId), state).catch(async (error) => {
    await deleteBgJob(claimed.jobId)
    throw error
  })
  const error = await sendJobReply(claimed.jobId, intent, state)
  if (error) {
    await deleteBgJob(claimed.jobId)
    return {
      ok: false,
      error:
        error === "That session isn't running — respawn it first"
          ? "The pre-warmed session wasn't ready — press Enter to try again"
          : error,
    }
  }
  logForDebugging('[PERF:bg-claim-end]')
  return { ok: true, jobId: claimed.jobId }
}

export async function stopPrewarming(): Promise<void> {
  spareDisabled = true
  if (spawningSpare) await spawningSpare.catch(() => {})
  const current = spare
  spare = null
  if (current) await deleteBgJob(current.jobId)
}

export function jobNeedsRespawn(state: JobState): boolean {
  return isTerminalState(state.state) && state.tempo !== 'active'
}
