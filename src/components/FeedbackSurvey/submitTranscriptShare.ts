import axios from 'axios'
import { readFile, stat } from 'fs/promises'
import type { Message } from '../../types/message.js'
import { checkAndRefreshOAuthTokenIfNeeded } from '../../utils/auth.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { getAuthHeaders, getUserAgent } from '../../utils/http.js'
import { normalizeMessagesForAPI } from '../../utils/messages.js'
import {
  extractAgentIdsFromMessages,
  getTranscriptPath,
  loadSubagentTranscripts,
  MAX_TRANSCRIPT_READ_BYTES,
} from '../../utils/sessionStorage.js'
import { serializeWrappedContent } from '../../utils/wrappedContentSerializer.js'
import { redactSensitiveInfo } from '../Feedback.js'

type TranscriptShareResult = {
  success: boolean
  transcriptId?: string
}

export type TranscriptShareTrigger =
  | 'bad_feedback_survey'
  | 'good_feedback_survey'
  | 'frustration'
  | 'memory_survey'

function sanitizeFeedbackValue(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitiveInfo(value)
  if (Array.isArray(value)) return value.map(sanitizeFeedbackValue)
  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, fieldValue] of Object.entries(value)) {
      if (typeof fieldValue === 'string') {
        const prefix = `${key}: `
        const withPrefix = redactSensitiveInfo(prefix + fieldValue)
        sanitized[key] = withPrefix.startsWith(prefix)
          ? withPrefix.slice(prefix.length)
          : redactSensitiveInfo(fieldValue)
      } else {
        sanitized[key] = sanitizeFeedbackValue(fieldValue)
      }
    }
    return sanitized
  }
  return value
}

export async function submitTranscriptShare(
  messages: Message[],
  trigger: TranscriptShareTrigger,
  appearanceId: string,
): Promise<TranscriptShareResult> {
  try {
    logForDebugging('Collecting transcript for sharing', { level: 'info' })

    const transcript = normalizeMessagesForAPI(messages)

    // Collect subagent transcripts
    const agentIds = extractAgentIdsFromMessages(messages)
    const subagentTranscripts = await loadSubagentTranscripts(agentIds)

    // Read raw JSONL transcript (with size guard to prevent OOM)
    let rawTranscriptJsonl: string | undefined
    try {
      const transcriptPath = getTranscriptPath()
      const { size } = await stat(transcriptPath)
      if (size <= MAX_TRANSCRIPT_READ_BYTES) {
        rawTranscriptJsonl = await readFile(transcriptPath, 'utf-8')
      } else {
        logForDebugging(
          `Skipping raw transcript read: file too large (${size} bytes)`,
          { level: 'warn' },
        )
      }
    } catch {
      // File may not exist
    }

    const sanitizedRawTranscript = rawTranscriptJsonl
      ?.split('\n')
      .map(line => {
        if (!line) return line
        try {
          return JSON.stringify(sanitizeFeedbackValue(JSON.parse(line)))
        } catch {
          return redactSensitiveInfo(line)
        }
      })
      .join('\n')
    const data = {
      ...(sanitizeFeedbackValue({
        trigger,
        version: MACRO.VERSION,
        platform: process.platform,
        transcript,
        subagentTranscripts:
          Object.keys(subagentTranscripts).length > 0
            ? subagentTranscripts
            : undefined,
      }) as Record<string, unknown>),
      rawTranscriptJsonl: sanitizedRawTranscript,
    }

    const body = serializeWrappedContent(
      data,
      new Set(['transcript']),
      new Set(['subagentTranscripts']),
      {
        extraOuterFields: { appearance_id: appearanceId },
      },
    )

    await checkAndRefreshOAuthTokenIfNeeded()

    const authResult = getAuthHeaders()
    if (authResult.error) {
      return { success: false }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': getUserAgent(),
      ...authResult.headers,
    }

    const response = await axios.post(
      'https://api.anthropic.com/api/claude_code_shared_session_transcripts',
      body,
      {
        headers,
        timeout: 30000,
      },
    )

    if (response.status === 200 || response.status === 201) {
      const result = response.data
      logForDebugging('Transcript shared successfully', { level: 'info' })
      return {
        success: true,
        transcriptId: result?.transcript_id,
      }
    }

    return { success: false }
  } catch (err) {
    logForDebugging(errorMessage(err), {
      level: 'error',
    })
    return { success: false }
  }
}
