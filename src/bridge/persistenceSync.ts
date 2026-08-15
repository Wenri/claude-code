import { stat } from 'fs/promises'
import type { InternalEvent } from '../cli/transports/ccrClient.js'
import type { Entry, TranscriptMessage } from '../types/logs.js'
import type { AgentId } from '../types/ids.js'
import { logForDebugging } from '../utils/debug.js'
import { isFsInaccessible } from '../utils/errors.js'
import { readLinesReverse } from '../utils/fsOperations.js'
import {
  getAgentTranscriptPath,
  getTranscriptPath,
  isTranscriptMessage,
} from '../utils/sessionStorage.js'
import { SKIP_PRECOMPACT_THRESHOLD } from '../utils/sessionStoragePortable.js'
import { isCompactBoundaryMessage } from '../utils/messages.js'

export type InternalEventWriter = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { isCompaction?: boolean; agentId?: string },
) => Promise<void>

export type InternalEventReaders = {
  readMain(): Promise<InternalEvent[] | null>
  readSubagents(): Promise<InternalEvent[] | null>
}

const MAX_RECENT_SUBAGENT_TRANSCRIPTS = 20

/**
 * Bring a newly connected CCR transport up to date from the local transcript
 * before installing it as the live persistence writer. Server UUIDs are
 * removed so reconnecting cannot duplicate events already accepted by CCR.
 */
export async function syncPersistence(
  writeInternalEvent: InternalEventWriter,
  readers: InternalEventReaders,
  subagentIds: string[],
): Promise<{ uploadedMain: number; uploadedSubagents: number }> {
  const [mainEvents, subagentEvents] = await Promise.all([
    readers.readMain(),
    readers.readSubagents(),
  ])
  const serverEventIds = new Set<string>()
  for (const event of mainEvents ?? []) {
    const uuid = event.payload.uuid
    if (typeof uuid === 'string') serverEventIds.add(uuid)
  }
  for (const event of subagentEvents ?? []) {
    const uuid = event.payload.uuid
    if (typeof uuid === 'string') serverEventIds.add(uuid)
  }

  logForDebugging(
    `[persistence-sync] Server has ${serverEventIds.size} events since compaction`,
  )
  const onWriteFailure = (error: unknown): void => {
    logForDebugging(`[persistence-sync] Write failed: ${error}`)
  }

  const mainEntries = await readLocalAfterCompaction(
    getTranscriptPath(),
    serverEventIds,
  )
  for (const entry of mainEntries) {
    void writeInternalEvent('transcript', entry, {
      ...(isCompactBoundaryMessage(entry) && { isCompaction: true }),
    }).catch(onWriteFailure)
  }

  let uploadedSubagents = 0
  for (const { agentId, path } of await selectRecentSubagentTranscripts(
    subagentIds,
  )) {
    const entries = await readLocalAfterCompaction(path, serverEventIds)
    for (const entry of entries) {
      void writeInternalEvent('transcript', entry, {
        ...(isCompactBoundaryMessage(entry) && { isCompaction: true }),
        agentId,
      }).catch(onWriteFailure)
    }
    uploadedSubagents += entries.length
  }

  logForDebugging(
    `[persistence-sync] Uploaded ${mainEntries.length} main + ${uploadedSubagents} subagent entries`,
  )
  return {
    uploadedMain: mainEntries.length,
    uploadedSubagents,
  }
}

async function selectRecentSubagentTranscripts(
  agentIds: string[],
): Promise<Array<{ agentId: string; path: string }>> {
  const candidates = await Promise.all(
    agentIds.map(async agentId => {
      const path = getAgentTranscriptPath(agentId as AgentId)
      try {
        const file = await stat(path)
        return {
          agentId,
          path,
          size: file.size,
          mtimeMs: file.mtimeMs,
        }
      } catch {
        return null
      }
    }),
  )

  return candidates
    .filter(candidate => candidate !== null)
    .filter(candidate => candidate.size <= SKIP_PRECOMPACT_THRESHOLD)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_RECENT_SUBAGENT_TRANSCRIPTS)
}

async function readLocalAfterCompaction(
  path: string,
  serverEventIds: Set<string>,
): Promise<TranscriptMessage[]> {
  const entries: TranscriptMessage[] = []
  try {
    for await (const line of readLinesReverse(path)) {
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch {
        continue
      }
      if (!isPersistableTranscriptMessage(value)) continue
      if (isCompactBoundaryMessage(value)) break
      if (!serverEventIds.has(value.uuid)) entries.push(value)
    }
  } catch (error) {
    if (isFsInaccessible(error)) return []
    throw error
  }
  return entries.reverse()
}

function isPersistableTranscriptMessage(
  value: unknown,
): value is TranscriptMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'uuid' in value &&
    typeof value.uuid === 'string' &&
    isTranscriptMessage(value as Entry)
  )
}
