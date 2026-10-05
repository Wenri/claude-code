import { readFile, stat } from 'fs/promises'
import { getSessionId } from '../bootstrap/state.js'
import type { AgentId } from '../types/ids.js'
import type { TranscriptMessage } from '../types/logs.js'
import { logForDebugging } from '../utils/debug.js'
import { isENOENT } from '../utils/errors.js'
import { isCompactBoundaryMessage } from '../utils/messages.js'
import {
  getAgentTranscriptPath,
  getTranscriptPathForSession,
} from '../utils/sessionStorage.js'
import { SKIP_PRECOMPACT_THRESHOLD } from '../utils/sessionStoragePortable.js'
import { jsonParse } from '../utils/slowOperations.js'
import type { ReplBridgeTransport } from './replBridgeTransport.js'

type InternalEventWriter = ReturnType<
  NonNullable<ReplBridgeTransport['getInternalEventWriter']>
>
type InternalEventReaders = ReturnType<
  NonNullable<ReplBridgeTransport['getInternalEventReaders']>
>

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
  for (const agentId of agentIds) {
    const entries = await collectMissingTranscriptEntries(
      getAgentTranscriptPath(agentId as AgentId),
      serverUuids,
    )
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
  return { uploadedMain: mainEntries.length, uploadedSubagents }
}

async function collectMissingTranscriptEntries(
  path: string,
  serverUuids: Set<string>,
): Promise<TranscriptMessage[]> {
  let size: number
  try {
    size = (await stat(path)).size
  } catch (error) {
    if (isENOENT(error)) return []
    throw error
  }
  if (size > SKIP_PRECOMPACT_THRESHOLD) {
    logForDebugging(
      `[persistence-sync] Skipping ${path} — ${size} bytes exceeds ${SKIP_PRECOMPACT_THRESHOLD} threshold`,
    )
    return []
  }
  let contents: string
  try {
    contents = await readFile(path, 'utf8')
  } catch (error) {
    if (isENOENT(error)) return []
    throw error
  }
  const lines = contents.split('\n').filter(Boolean)
  const entries: TranscriptMessage[] = []
  let lastCompactBoundary = -1
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line) continue
    let entry: unknown
    try {
      entry = jsonParse(line)
    } catch {
      continue
    }
    if (!isValidTranscriptEntry(entry)) continue
    entries.push(entry)
    if (isCompactBoundaryMessage(entry)) lastCompactBoundary = entries.length - 1
  }
  return entries
    .slice(lastCompactBoundary + 1)
    .filter(entry => !serverUuids.has(entry.uuid))
}

function isValidTranscriptEntry(value: unknown): value is TranscriptMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    VALID_TRANSCRIPT_TYPES.has(value.type as string) &&
    'uuid' in value &&
    typeof value.uuid === 'string'
  )
}

const VALID_TRANSCRIPT_TYPES = new Set(['user', 'assistant', 'attachment', 'system'])
