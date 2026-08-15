import { randomUUID, type UUID } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, unlink } from 'fs/promises'
import { once } from 'events'
import { createInterface } from 'readline'
import { finished } from 'stream/promises'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import type {
  ContentReplacementEntry,
  Entry,
  LogOption,
  SerializedMessage,
  TranscriptMessage,
} from '../../types/logs.js'
import {
  getProjectDir,
  getTranscriptPath,
  getTranscriptPathForSession,
  isTranscriptMessage,
  saveCustomTitle,
  searchSessionsByCustomTitle,
} from '../../utils/sessionStorage.js'
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js'
import { escapeRegExp } from '../../utils/stringUtils.js'
import { isENOENT, toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'

type TranscriptEntry = TranscriptMessage & {
  forkedFrom?: {
    sessionId: string
    messageUuid: UUID
  }
}

/**
 * Derive a single-line title base from the first user message.
 * Collapses whitespace — multiline first messages (pasted stacks, code)
 * otherwise flow into the saved title and break the resume hint.
 */
export function deriveFirstPrompt(
  firstUserMessage: Extract<SerializedMessage, { type: 'user' }> | undefined,
): string {
  const content = firstUserMessage?.message?.content
  if (!content) return 'Branched conversation'
  const raw =
    typeof content === 'string'
      ? content
      : content.find(
          (block): block is { type: 'text'; text: string } =>
            block.type === 'text',
        )?.text
  if (!raw) return 'Branched conversation'
  return (
    raw.replace(/\s+/g, ' ').trim().slice(0, 100) || 'Branched conversation'
  )
}

/**
 * Creates a fork of the current conversation by copying from the transcript file.
 * Preserves all original metadata (timestamps, gitBranch, etc.) while updating
 * sessionId and adding forkedFrom traceability.
 */
export async function createFork(
  messages: SerializedMessage[],
  customTitle?: string,
  extraMessages?: SerializedMessage[],
): Promise<{
  sessionId: UUID
  title: string | undefined
  forkPath: string
  serializedMessages: SerializedMessage[]
  contentReplacementRecords: ContentReplacementEntry['replacements']
}> {
  const forkSessionId = randomUUID() as UUID
  const originalSessionId = getSessionId()
  const projectDir = getProjectDir(getOriginalCwd())
  const forkSessionPath = getTranscriptPathForSession(forkSessionId)
  const currentTranscriptPath = getTranscriptPath()

  // Ensure project directory exists
  await mkdir(projectDir, { recursive: true, mode: 0o700 })

  // Stream the source transcript so /branch does not materialize large JSONL
  // files. Malformed lines are ignored, matching parseJSONL's behavior.
  let parentUuid: UUID | null = null
  const serializedMessages: SerializedMessage[] = []
  const contentReplacementRecords: ContentReplacementEntry['replacements'] = []
  const input = createReadStream(currentTranscriptPath, { encoding: 'utf8' })
  try {
    await once(input, 'open')
  } catch (error) {
    if (isENOENT(error)) throw new Error('No conversation to branch')
    logError(toError(error))
    throw error
  }

  const output = createWriteStream(forkSessionPath, {
    encoding: 'utf8',
    mode: 0o600,
  })
  let outputError: Error | null = null
  output.on('error', error => {
    outputError = toError(error)
  })
  const lines = createInterface({ input, crlfDelay: Infinity })
  const activeMessageUuids = new Set(messages.map(message => message.uuid))
  const activeTranscriptEntries = new Map<UUID, TranscriptEntry>()
  const cleanupOutput = async (): Promise<void> => {
    output.destroy()
    await unlink(forkSessionPath).catch(() => {})
  }
  const writeLine = async (line: string): Promise<void> => {
    if (outputError) {
      await cleanupOutput()
      throw outputError
    }
    if (!output.write(line)) await once(output, 'drain').catch(() => {})
  }
  let lastMessage: SerializedMessage | null = null
  try {
    for await (const line of lines) {
      if (line.length === 0) continue
      let entry: Entry
      try {
        entry = jsonParse(line) as Entry
      } catch {
        continue
      }
      if (
        isTranscriptMessage(entry) &&
        !entry.isSidechain &&
        activeMessageUuids.has(entry.uuid)
      ) {
        activeTranscriptEntries.set(entry.uuid, entry)
      } else if (
        entry.type === 'content-replacement' &&
        entry.sessionId === originalSessionId
      ) {
        contentReplacementRecords.push(...entry.replacements)
      }
    }
  } catch (error) {
    await cleanupOutput()
    throw error
  } finally {
    lines.close()
    input.destroy()
  }

  for (const message of messages) {
    const entry = activeTranscriptEntries.get(message.uuid)
    if (!entry) continue
    const forkedEntry: TranscriptEntry = {
      ...entry,
      sessionId: forkSessionId,
      parentUuid,
      isSidechain: false,
      forkedFrom: {
        sessionId: originalSessionId,
        messageUuid: entry.uuid,
      },
    }
    const serializedMessage = { ...entry, sessionId: forkSessionId }
    serializedMessages.push(serializedMessage)
    lastMessage = entry
    await writeLine(`${jsonStringify(forkedEntry)}\n`)
    if (entry.type !== 'progress') parentUuid = entry.uuid
  }

  if (lastMessage === null) {
    await cleanupOutput()
    throw new Error('No messages to branch')
  }

  if (extraMessages?.length) {
    for (const message of extraMessages) {
      const serializedMessage: SerializedMessage = {
        ...message,
        cwd: lastMessage.cwd,
        userType: lastMessage.userType,
        entrypoint: lastMessage.entrypoint,
        version: lastMessage.version,
        gitBranch: lastMessage.gitBranch,
        sessionId: forkSessionId,
        timestamp: new Date().toISOString(),
      }
      const forkedMessage: TranscriptEntry = {
        ...serializedMessage,
        parentUuid,
        isSidechain: false,
      }
      serializedMessages.push(serializedMessage)
      await writeLine(`${jsonStringify(forkedMessage)}\n`)
      if (message.type !== 'progress') parentUuid = message.uuid
    }
  }

  if (contentReplacementRecords.length > 0) {
    await writeLine(`${jsonStringify({
      type: 'content-replacement',
      sessionId: forkSessionId,
      replacements: contentReplacementRecords,
    } satisfies ContentReplacementEntry)}\n`)
  }
  output.end()
  await finished(output).catch(() => {})
  if (outputError) {
    await cleanupOutput()
    throw outputError
  }

  return {
    sessionId: forkSessionId,
    title: customTitle,
    forkPath: forkSessionPath,
    serializedMessages,
    contentReplacementRecords,
  }
}

/**
 * Generates a unique fork name by checking for collisions with existing session names.
 * If "baseName (Branch)" already exists, tries "baseName (Branch 2)", "baseName (Branch 3)", etc.
 */
async function getUniqueForkName(baseName: string): Promise<string> {
  const candidateName = `${baseName} (Branch)`

  // Check if this exact name already exists
  const existingWithExactName = await searchSessionsByCustomTitle(
    candidateName,
    { exact: true },
  )

  if (existingWithExactName.length === 0) {
    return candidateName
  }

  // Name collision - find a unique numbered suffix
  // Search for all sessions that start with the base pattern
  const existingForks = await searchSessionsByCustomTitle(`${baseName} (Branch`)

  // Extract existing fork numbers to find the next available
  const usedNumbers = new Set<number>([1]) // Consider " (Branch)" as number 1
  const forkNumberPattern = new RegExp(
    `^${escapeRegExp(baseName)} \\(Branch(?: (\\d+))?\\)$`,
  )

  for (const session of existingForks) {
    const match = session.customTitle?.match(forkNumberPattern)
    if (match) {
      if (match[1]) {
        usedNumbers.add(parseInt(match[1], 10))
      } else {
        usedNumbers.add(1) // " (Branch)" without number is treated as 1
      }
    }
  }

  // Find the next available number
  let nextNumber = 2
  while (usedNumbers.has(nextNumber)) {
    nextNumber++
  }

  return `${baseName} (Branch ${nextNumber})`
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const customTitle = args?.trim() || undefined

  const originalSessionId = getSessionId()

  try {
    const {
      sessionId,
      title,
      forkPath,
      serializedMessages,
      contentReplacementRecords,
    } = await createFork(context.messages, customTitle)

    // Build LogOption for resume
    const now = new Date()
    const firstPrompt = deriveFirstPrompt(
      serializedMessages.find(m => m.type === 'user'),
    )

    // Save custom title - use provided title or firstPrompt as default
    // This ensures /status and /resume show the same session name
    // Always add " (Branch)" suffix to make it clear this is a branched session
    // Handle collisions by adding a number suffix (e.g., " (Branch 2)", " (Branch 3)")
    const baseName = title ?? firstPrompt
    const effectiveTitle = await getUniqueForkName(baseName)
    await saveCustomTitle(sessionId, effectiveTitle, forkPath)

    logEvent('tengu_conversation_forked', {
      message_count: serializedMessages.length,
      has_custom_title: !!title,
    })

    const forkLog: LogOption = {
      date: now.toISOString().split('T')[0]!,
      messages: serializedMessages,
      fullPath: forkPath,
      value: now.getTime(),
      created: now,
      modified: now,
      firstPrompt,
      messageCount: serializedMessages.length,
      isSidechain: false,
      sessionId,
      customTitle: effectiveTitle,
      contentReplacements: contentReplacementRecords,
    }

    // Resume into the fork
    const titleInfo = title ? ` "${title}"` : ''
    const successMessage = `Branched conversation${titleInfo}. You are now in the branch. Use /resume ${originalSessionId} to return to the original.`

    if (context.resume) {
      await context.resume(sessionId, forkLog, 'fork')
      onDone(successMessage, { display: 'system' })
    } else {
      // Fallback if resume not available
      onDone(
        `Branched conversation${titleInfo}. Resume with: /resume ${sessionId}`,
      )
    }

    return null
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred'
    onDone(`Failed to branch conversation: ${message}`)
    return null
  }
}
