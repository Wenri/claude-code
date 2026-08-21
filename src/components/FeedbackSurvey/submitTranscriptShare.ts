import axios from 'axios'
import { readFile, stat } from 'fs/promises'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import type { Message } from '../../types/message.js'
import { checkAndRefreshOAuthTokenIfNeeded } from '../../utils/auth.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { buildFeedbackPayload } from '../../utils/feedbackPayload.js'
import { getAuthHeaders, getUserAgent } from '../../utils/http.js'
import { normalizeMessagesForAPI } from '../../utils/messages.js'
import {
  extractAgentIdsFromMessages,
  getTranscriptPath,
  loadSubagentTranscripts,
  MAX_TRANSCRIPT_READ_BYTES,
} from '../../utils/sessionStorage.js'
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js'
import { redactSensitiveInfo, redactSensitiveValue } from '../Feedback.js'

type TranscriptShareResult = {
  success: boolean
  transcriptId?: string
}

export type TranscriptShareTrigger =
  | 'bad_feedback_survey'
  | 'good_feedback_survey'
  | 'frustration'
  | 'memory_survey'

const TRANSCRIPT_ARRAY_FIELDS = new Set(['transcript'])
const TRANSCRIPT_NESTED_ARRAY_FIELDS = new Set(['subagentTranscripts'])

export async function submitTranscriptShare(
  messages: Message[],
  trigger: TranscriptShareTrigger,
  appearanceId: string,
): Promise<TranscriptShareResult> {
  if (!isPolicyAllowed('allow_product_feedback')) {
    return { success: false }
  }

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

    const redactedRawTranscriptJsonl = rawTranscriptJsonl
      ?.split('\n')
      .map(line => {
        if (!line) return line
        try {
          return jsonStringify(redactSensitiveValue(jsonParse(line)))
        } catch {
          return redactSensitiveInfo(line)
        }
      })
      .join('\n')

    const data = {
      ...(redactSensitiveValue({
        trigger,
        version: MACRO.VERSION,
        platform: process.platform,
        transcript,
        subagentTranscripts:
          Object.keys(subagentTranscripts).length > 0
            ? subagentTranscripts
            : undefined,
      }) as Record<string, unknown>),
      rawTranscriptJsonl: redactedRawTranscriptJsonl,
    }

    const payload = buildFeedbackPayload(
      data,
      TRANSCRIPT_ARRAY_FIELDS,
      TRANSCRIPT_NESTED_ARRAY_FIELDS,
      { extraOuterFields: { appearance_id: appearanceId } },
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
      payload,
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
