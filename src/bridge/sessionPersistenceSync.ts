import { stat } from 'fs/promises'
import { getSessionId } from '../bootstrap/state.js'
import type { Entry, TranscriptMessage } from '../types/logs.js'
import { asAgentId } from '../types/ids.js'
import { logForDebugging } from '../utils/debug.js'
import { isENOENT } from '../utils/errors.js'
import { readLinesReverse } from '../utils/fsOperations.js'
import { isCompactBoundaryMessage } from '../utils/messages.js'
import {
  getAgentTranscriptPath,
  getTranscriptPathForSession,
  isTranscriptMessage,
} from '../utils/sessionStorage.js'
import { SKIP_PRECOMPACT_THRESHOLD } from '../utils/sessionStoragePortable.js'
import { jsonParse } from '../utils/slowOperations.js'
import type {
  InternalEventReaders,
  InternalEventWriter,
} from './replBridgeTransport.js'

const MAX_AGENT_TRANSCRIPTS = 20

export async function syncLocalTranscriptEvents(
  writer: InternalEventWriter,
  readers: InternalEventReaders,
  agentIds: string[],
): Promise<{ uploadedMain: number; uploadedSubagents: number }> {
  const [mainEvents, subagentEvents] = await Promise.all([
    readers.readMain(),
    readers.readSubagents(),
  ])
  const serverUuids = new Set<string>()
  for (const event of mainEvents ?? []) {
    const uuid = event.payload.uuid
    if (typeof uuid === 'string') serverUuids.add(uuid)
  }
  for (const event of subagentEvents ?? []) {
    const uuid = event.payload.uuid
    if (typeof uuid === 'string') serverUuids.add(uuid)
  }
  logForDebugging(
    `[persistence-sync] Server has ${serverUuids.size} events since compaction`,
  )

  const onWriteError = (error: unknown): void => {
    logForDebugging(`[persistence-sync] Write failed: ${error}`)
  }
  const mainEntries = await collectMissingTranscriptEntries(
    getTranscriptPathForSession(getSessionId()),
    serverUuids,
  )
  for (const entry of mainEntries) {
    void writer('transcript', entry as unknown as Record<string, unknown>, {
      ...(isCompactBoundaryMessage(entry) && { isCompaction: true }),
    }).catch(onWriteError)
  }

  let uploadedSubagents = 0
  for (const { agentId, path } of await getRecentAgentTranscripts(agentIds)) {
    const entries = await collectMissingTranscriptEntries(path, serverUuids)
    for (const entry of entries) {
      void writer('transcript', entry as unknown as Record<string, unknown>, {
        ...(isCompactBoundaryMessage(entry) && { isCompaction: true }),
        agentId,
      }).catch(onWriteError)
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

async function getRecentAgentTranscripts(
  agentIds: string[],
): Promise<Array<{ agentId: string; path: string }>> {
  const candidates = await Promise.all(
    agentIds.map(async agentId => {
      const path = getAgentTranscriptPath(asAgentId(agentId))
      try {
        const info = await stat(path)
        return { agentId, path, size: info.size, mtimeMs: info.mtimeMs }
      } catch {
        return null
      }
    }),
  )
  return candidates
    .filter(candidate => candidate !== null)
    .filter(candidate => candidate.size <= SKIP_PRECOMPACT_THRESHOLD)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_AGENT_TRANSCRIPTS)
}

async function collectMissingTranscriptEntries(
  path: string,
  serverUuids: Set<string>,
): Promise<TranscriptMessage[]> {
  const entries: TranscriptMessage[] = []
  try {
    for await (const line of readLinesReverse(path)) {
      let entry: unknown
      try {
        entry = jsonParse(line)
      } catch {
        continue
      }
      if (!isValidTranscriptEntry(entry)) continue
      if (isCompactBoundaryMessage(entry)) break
      if (!serverUuids.has(entry.uuid)) entries.push(entry)
    }
  } catch (error) {
    if (isENOENT(error)) return []
    throw error
  }
  return entries.reverse()
}

function isValidTranscriptEntry(value: unknown): value is TranscriptMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'uuid' in value &&
    typeof value.uuid === 'string' &&
    isTranscriptMessage(value as Entry)
  )
}
