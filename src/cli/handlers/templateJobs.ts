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
import {
  killJob,
  requestControl,
} from '../../daemon/client.js'
import { PROTOCOL_VERSION } from '../../daemon/protocol.js'
import { logEvent } from '../../services/analytics/index.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { bgSupervisorNoun } from '../../utils/agentsFleet.js'
import { canonicalizePath } from '../../utils/sessionStoragePortable.js'
import { sendToUdsSocket } from '../../utils/udsClient.js'
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
    await rm(jobDir, { recursive: true, force: false }).catch(() => {})
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
    await killJob(short).catch(() => {})
    await rm(jobDir, { recursive: true, force: false }).catch(() => {})
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
  if (knownState?.backend === 'peer') {
    if (!knownState.sock) {
      return "Can't send — that session is running in another terminal"
    }
    try {
      await sendToUdsSocket(knownState.sock, text)
      return null
    } catch (error) {
      return `Couldn't send to that session — ${errorMessage(error)}`
    }
  }
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
  let response = await requestControl({
    proto: PROTOCOL_VERSION,
    op: 'reply',
    short,
    text,
  })
  for (
    let attempt = 0;
    !response.ok && response.code === 'ESTARTING' && attempt < 10;
    attempt++
  ) {
    await new Promise(resolve => setTimeout(resolve, 200))
    response = await requestControl({
      proto: PROTOCOL_VERSION,
      op: 'reply',
      short,
      text,
    })
  }
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
  if (response.code === 'ENOCONN' || response.code === 'ETIMEOUT') {
    return `Couldn't reach the ${bgSupervisorNoun()} — it may be restarting. Press Enter to retry`
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
  const result = await respawnBgJob(short, options)
  return result.ok
    ? { ok: true as const, state: result.state }
    : {
        ok: false as const,
        alive: result.alive ?? false,
        state: result.state,
        error: result.error,
      }
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
      const canonicalCwd = await canonicalizePath(cwd)
      const result = await spawnBgSession(
        ['--agent', 'general-purpose'],
        sessionId,
        'fleet',
        canonicalCwd,
      )
      if (!result.ok) {
        await deleteBgJob(short).catch(() => {})
        return
      }
      if (spareDisabled) {
        await deleteBgJob(short)
        return
      }
      spare = { jobId: short, sessionId, cwd: canonicalCwd, ready: false }
      logForDebugging(`[PERF:bg-spare-spawned] ${short}`)
    } catch {
      await deleteBgJob(short).catch(() => {})
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
  const fallBackToFreshJob = async (
    reason: string,
    detail?: string,
  ): Promise<
    { ok: true; jobId: string } | { ok: false; error: string }
  > => {
    logForDebugging(
      `[bg-spare] claim miss (${reason})${detail ? `: ${detail}` : ''}`,
    )
    logEvent('tengu_bg_spare_claim_fail', { reason })
    if (claimed) {
      const { removed } = await deleteBgJob(claimed.jobId)
      if (!removed) {
        return { ok: false, error: detail ?? 'Background service unreachable' }
      }
    }
    return dispatchTemplateJob(
      { name: 'general-purpose' },
      intent,
      claimed?.sessionId,
      claimed?.cwd,
    )
  }
  if (!claimed) return fallBackToFreshJob('no-spare')
  const state = createInitialJobState({
    template: { name: 'general-purpose' },
    intent,
    detail: intent.replace(/[\r\n]+/g, ' ').slice(0, 80),
    sessionId: claimed.sessionId,
    cwd: claimed.cwd,
    originCwd: claimed.cwd,
  })
  try {
    await writeJobState(getJobDir(claimed.jobId), state)
  } catch (error) {
    return fallBackToFreshJob('state-write', errorMessage(error))
  }
  try {
    const error = await sendJobReply(claimed.jobId, intent, state)
    if (error) {
      return fallBackToFreshJob(
        error === "That session isn't running — respawn it first"
          ? 'enojob'
          : 'reply',
        error,
      )
    }
  } catch (error) {
    return fallBackToFreshJob('reply-throw', errorMessage(error))
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
