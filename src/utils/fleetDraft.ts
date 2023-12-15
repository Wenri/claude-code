import { createHash } from 'crypto'
import { mkdir, readFile, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod/v4'
import { getJobsDir } from '../daemon/jobs.js'
import { atomicWriteFile, atomicWriteFileSync } from './atomicWrite.js'
import { safeParseJSON } from './json.js'

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1_000

const draftSchema = z.object({ q: z.string(), ts: z.number() })

function getDraftPath(cwd: string): string {
  const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 8)
  return join(getJobsDir(), `.draft-${hash}`)
}

function serializeDraft(query: string): string {
  return JSON.stringify({ q: query, ts: Date.now() })
}

export async function saveFleetDraft(
  cwd: string,
  query: string,
): Promise<void> {
  try {
    await mkdir(getJobsDir(), { recursive: true })
    await atomicWriteFile(getDraftPath(cwd), serializeDraft(query))
  } catch {}
}

export function saveFleetDraftSync(cwd: string, query: string): void {
  try {
    atomicWriteFileSync(getDraftPath(cwd), serializeDraft(query))
  } catch {}
}

export async function deleteFleetDraft(cwd: string): Promise<void> {
  await unlink(getDraftPath(cwd)).catch(() => {})
}

export async function loadFleetDraft(cwd: string): Promise<string | undefined> {
  let parsed: ReturnType<typeof draftSchema.safeParse>
  try {
    parsed = draftSchema.safeParse(
      safeParseJSON(await readFile(getDraftPath(cwd), 'utf8')),
    )
  } catch {
    return
  }
  if (!parsed.success) return
  const { q: query, ts } = parsed.data
  if (!query || Date.now() - ts > DRAFT_MAX_AGE_MS) return
  return query
}

export async function cleanupFleetDrafts(): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(getJobsDir())
  } catch {
    return
  }
  const now = Date.now()
  await Promise.all(
    entries
      .filter(entry => entry.startsWith('.draft-'))
      .map(async entry => {
        const path = join(getJobsDir(), entry)
        try {
          const parsed = draftSchema.safeParse(
            safeParseJSON(await readFile(path, 'utf8')),
          )
          if (parsed.success && now - parsed.data.ts <= DRAFT_MAX_AGE_MS) return
        } catch {}
        await unlink(path).catch(() => {})
      }),
  )
}
