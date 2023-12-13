import chalk from 'chalk'
import { REMOTE_REVIEW_PROGRESS_TAG } from '../../constants/xml.js'
import type { SDKMessage } from '../../entrypoints/agentSdkTypes.js'
import { isPolicyAllowed, waitForPolicyLimitsToLoad } from '../../services/policyLimits/index.js'
import { extractReviewTagFromLog } from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { launchUltrareview } from '../../commands/review/reviewRemote.js'
import { getUltrareviewDurationNote } from '../../commands/review/ultrareviewEnabled.js'
import { createAbortController } from '../../utils/abortController.js'
import { checkAndRefreshOAuthTokenIfNeeded } from '../../utils/auth.js'
import { errorMessage } from '../../utils/errors.js'
import { jsonParse } from '../../utils/slowOperations.js'
import { exitWithError } from '../../utils/process.js'
import { sleep } from '../../utils/sleep.js'
import { isTransientNetworkError } from '../../utils/teleport/api.js'
import { pollRemoteSessionEvents } from '../../utils/teleport.js'

const POLL_INTERVAL_MS = 3000
const DEFAULT_TIMEOUT_MINUTES = 30
const MAX_CONSECUTIVE_FAILURES = 5

const SEVERITY_ICONS: Record<string, string> = {
  normal: '🔴',
  nit: '🟡',
  pre_existing: '🟣',
}

type ReviewFinding = {
  severity?: string
  file_path?: string
  start_line?: number
  end_line?: number
  pr_comment?: string
}

function writeDimLine(message: string): void {
  process.stderr.write(`${chalk.dim(message)}\n`)
}

function getReviewError(payload: string): string | null {
  try {
    const parsed: unknown = jsonParse(payload)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const error = (parsed as { error?: unknown }).error
      if (typeof error === 'string') return error
    }
  } catch {}
  return null
}

function extractReviewProgress(stdout: string): string | null {
  const openTag = `<${REMOTE_REVIEW_PROGRESS_TAG}>`
  const closeTag = `</${REMOTE_REVIEW_PROGRESS_TAG}>`
  const closeIndex = stdout.lastIndexOf(closeTag)
  const openIndex =
    closeIndex === -1 ? -1 : stdout.lastIndexOf(openTag, closeIndex)
  if (openIndex === -1 || closeIndex <= openIndex) return null

  try {
    const progress = jsonParse(
      stdout.slice(openIndex + openTag.length, closeIndex),
    ) as {
      stage?: string
      bugs_found?: number
      bugs_verified?: number
      bugs_refuted?: number
    }
    const stage = progress.stage ?? 'running'
    const found = progress.bugs_found ?? 0
    const verified = progress.bugs_verified ?? 0
    const refuted = progress.bugs_refuted ?? 0
    return `${stage} — ${found} found, ${verified} verified, ${refuted} refuted`
  } catch {
    return null
  }
}

async function pollForReview(
  sessionId: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let cursor: string | null = null
  let consecutiveFailures = 0
  const events: SDKMessage[] = []
  let lastProgress = ''

  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('aborted')
    try {
      const response = await pollRemoteSessionEvents(sessionId, cursor)
      cursor = response.lastEventId
      consecutiveFailures = 0

      if (response.sessionStatus === 'archived') {
        if (response.newEvents.length > 0) events.push(...response.newEvents)
        return (
          extractReviewTagFromLog(events) ??
          '{"error":"remote session was archived before producing output"}'
        )
      }

      if (response.newEvents.length > 0) {
        events.push(...response.newEvents)
        for (const event of response.newEvents) {
          if (
            event.type === 'system' &&
            (event.subtype === 'hook_progress' ||
              event.subtype === 'hook_response')
          ) {
            const progress = extractReviewProgress(event.stdout)
            if (progress && progress !== lastProgress) {
              lastProgress = progress
              writeDimLine(`  ${progress}`)
            }
          }
        }
        const review = extractReviewTagFromLog(events)
        if (review) return review
      }
    } catch (error) {
      if (signal.aborted || !isTransientNetworkError(error)) throw error
      consecutiveFailures++
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(
          'lost connection to the remote session after repeated retries',
        )
      }
    }
    await sleep(POLL_INTERVAL_MS, signal)
  }

  throw new Error(
    `remote session exceeded ${Math.round(timeoutMs / 60_000)} minutes`,
  )
}

function formatReviewFindings(payload: string): string {
  let parsed: unknown
  try {
    parsed = jsonParse(payload)
  } catch {
    return payload
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return 'Review complete — no findings.'
  }

  const findings = parsed as ReviewFinding[]
  const count = findings.length
  const lines = [
    chalk.bold(`Review complete — ${count} finding${count === 1 ? '' : 's'}`),
    '',
  ]
  for (const finding of findings) {
    const icon = SEVERITY_ICONS[finding.severity ?? 'normal'] ?? '🔴'
    const filePath = finding.file_path ?? '?'
    const startLine = finding.start_line ?? 0
    const endLine = finding.end_line ?? startLine
    const location =
      startLine === endLine
        ? `${filePath}:${startLine}`
        : `${filePath}:${startLine}-${endLine}`
    const comment = (finding.pr_comment ?? '').trim()
    const detailsIndex = comment.indexOf('\n\n')
    const summary =
      detailsIndex === -1 ? comment : comment.slice(0, detailsIndex)
    const details =
      detailsIndex === -1 ? '' : comment.slice(detailsIndex + 2)

    lines.push(`${icon} ${chalk.bold(location)}`)
    if (summary) lines.push(summary)
    if (details) {
      lines.push('')
      lines.push(details)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

export async function ultrareviewHandler(
  target: string,
  options: { json?: boolean; timeout?: string },
): Promise<void> {
  const exitOnEarlySigint = () => process.exit(130)
  process.once('SIGINT', exitOnEarlySigint)

  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_sessions')) {
    exitWithError(
      "Remote sessions are disabled by your organization's policy.",
    )
  }

  await checkAndRefreshOAuthTokenIfNeeded().catch(() => {})

  const requestedTimeout = Number(options.timeout)
  const timeoutMinutes =
    Number.isFinite(requestedTimeout) && requestedTimeout > 0
      ? requestedTimeout
      : DEFAULT_TIMEOUT_MINUTES
  const abortController = createAbortController()
  const launched = await launchUltrareview(target, {
    confirm: true,
    skipTaskRegistration: true,
    context: { abortController },
  })

  if (launched.status !== 'launched') {
    const action =
      launched.status === 'blocked' && launched.actionUrl
        ? `\n  → ${launched.actionUrl}`
        : ''
    exitWithError(
      `Ultrareview could not launch: ${'message' in launched ? launched.message : launched.body}${action}`,
    )
  }

  writeDimLine(launched.message)
  writeDimLine(`View live progress in the browser: ${launched.sessionUrl}`)
  writeDimLine(`Waiting for findings (${getUltrareviewDurationNote()})…`)

  process.removeListener('SIGINT', exitOnEarlySigint)
  process.once('SIGINT', () => {
    writeDimLine(
      `\nCancelled. The remote review is still running — view it at ${launched.sessionUrl}`,
    )
    process.exit(130)
  })

  let payload: string
  try {
    payload = await pollForReview(
      launched.sessionId,
      abortController.signal,
      timeoutMinutes * 60 * 1000,
    )
  } catch (error) {
    exitWithError(
      `Ultrareview failed: ${errorMessage(error)}\nSession: ${launched.sessionUrl}`,
    )
  }

  const reviewError = getReviewError(payload)
  if (options.json) {
    process.stdout.write(`${payload}\n`)
    process.exit(reviewError ? 1 : 0)
  }
  if (reviewError) {
    exitWithError(
      `Review failed: ${reviewError}\nSession: ${launched.sessionUrl}`,
    )
  }
  process.stdout.write(`${formatReviewFindings(payload)}\n`)
  process.exit(0)
}
