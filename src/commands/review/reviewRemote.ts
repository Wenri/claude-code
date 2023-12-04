import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { fetchUltrareviewPreflight } from '../../services/api/ultrareviewQuota.js'
import type { TaskContext } from '../../Task.js'
import {
  checkRemoteAgentEligibility,
  formatPreconditionError,
  getRemoteTaskSessionUrl,
  registerRemoteAgentTask,
} from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { getDefaultBranch, gitExe } from '../../utils/git.js'
import { teleportToRemote } from '../../utils/teleport.js'
import { isRepoTooLargeForBundle } from '../../utils/teleport/gitBundle.js'
import {
  getUltrareviewConfig,
  getUltrareviewCostNote,
  getUltrareviewDurationNote,
  getUltrareviewModel,
  isUltrareviewEnabled,
} from './ultrareviewEnabled.js'

export type RemoteReviewScope =
  | { mode: 'pr'; prNumber: string }
  | {
      mode: 'branch'
      baseBranch: string
      mergeBaseSha: string
      diffStat: string
    }

export type RemoteReviewScopeResult =
  | { ok: true; scope: RemoteReviewScope }
  | { ok: false; error: string }

export type OverageGate =
  | { kind: 'proceed'; billingNote: string }
  | {
      kind: 'blocked'
      reason: string
      message: string
      actionUrl: string | null
    }
  | { kind: 'needs-confirm'; body: string; billingNote: string }

export type RemoteReviewLaunchResult = {
  launched: boolean
  blocks: ContentBlockParam[]
  sessionId?: string
  sessionUrl?: string
}

export type UltrareviewLaunchResult =
  | { status: 'error'; message: string }
  | {
      status: 'blocked'
      message: string
      actionUrl: string | null
    }
  | { status: 'needs-confirm'; body: string; billingNote: string }
  | {
      status: 'launched'
      sessionId: string
      sessionUrl: string
      message: string
      billingNote: string
    }

let sessionOverageConfirmed = false

export function confirmOverage(): void {
  sessionOverageConfirmed = true
}

export async function prepareRemoteReviewScope(
  args: string,
): Promise<RemoteReviewScopeResult> {
  const trimmed = args.trim()
  if (/^\d+$/.test(trimmed)) {
    return { ok: true, scope: { mode: 'pr', prNumber: trimmed } }
  }

  if (await isRepoTooLargeForBundle()) {
    logEvent('tengu_review_remote_precondition_failed', {})
    return {
      ok: false,
      error:
        'Repo is too large to bundle. Push a PR and use `/ultrareview <PR#>` instead.',
    }
  }

  const baseBranch = (await getDefaultBranch()) || 'main'
  const mergeBase = (ref: string) =>
    execFileNoThrow(gitExe(), ['merge-base', ref, 'HEAD'], {
      preserveOutputOnError: false,
    })

  let { stdout, code } = await mergeBase(`origin/${baseBranch}`)
  if (code !== 0) {
    const fallback = await mergeBase(baseBranch)
    stdout = fallback.stdout
    code = fallback.code
  }
  const mergeBaseSha = stdout.trim()
  if (code !== 0 || !mergeBaseSha) {
    logEvent('tengu_review_remote_precondition_failed', {})
    return {
      ok: false,
      error: `Could not find merge-base with ${baseBranch}. Make sure you're in a git repo with a ${baseBranch} branch.`,
    }
  }

  const { stdout: diffStat, code: diffCode } = await execFileNoThrow(
    gitExe(),
    ['diff', '--shortstat', mergeBaseSha],
    { preserveOutputOnError: false },
  )
  if (diffCode === 0 && !diffStat.trim()) {
    logEvent('tengu_review_remote_precondition_failed', {})
    return {
      ok: false,
      error: `It doesn't look like you have any new commits or changes to review against your ${baseBranch} branch. Stage or commit them first?`,
    }
  }

  return {
    ok: true,
    scope: {
      mode: 'branch',
      baseBranch,
      mergeBaseSha,
      diffStat: diffStat.trim(),
    },
  }
}

export async function checkOverageGate(): Promise<OverageGate> {
  const preflight = await fetchUltrareviewPreflight()
  if (!preflight) return { kind: 'proceed', billingNote: '' }

  const billingNote = preflight.billing_note ?? ''
  switch (preflight.action) {
    case 'proceed':
      return { kind: 'proceed', billingNote }
    case 'blocked':
      return {
        kind: 'blocked',
        reason: preflight.blocked?.reason ?? 'server',
        message:
          preflight.blocked?.message ??
          'Ultrareview is unavailable for your organization.',
        actionUrl: preflight.blocked?.action_url ?? null,
      }
    case 'confirm':
      if (sessionOverageConfirmed) {
        return { kind: 'proceed', billingNote }
      }
      return {
        kind: 'needs-confirm',
        body: `This review bills as Extra Usage (${getUltrareviewCostNote()}).`,
        billingNote,
      }
  }
}

function failedLaunch(message: string): RemoteReviewLaunchResult {
  return {
    launched: false,
    blocks: [{ type: 'text', text: message }],
  }
}

export async function launchRemoteReview(
  scope: RemoteReviewScope,
  context: TaskContext,
  billingNote?: string,
): Promise<RemoteReviewLaunchResult | null> {
  const eligibility = await checkRemoteAgentEligibility()
  if (!eligibility.eligible && eligibility.errors.length > 0) {
    logEvent('tengu_review_remote_precondition_failed', {
      precondition_errors: eligibility.errors
        .map(error => error.type)
        .join(
          ',',
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    const reasons = eligibility.errors.map(formatPreconditionError).join('\n')
    return failedLaunch(`Ultrareview cannot launch:\n${reasons}`)
  }

  const config = getUltrareviewConfig()
  const positiveInteger = (
    value: unknown,
    fallback: number,
    max?: number,
  ): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
    const integer = Math.floor(value)
    if (integer <= 0) return fallback
    return max !== undefined && integer > max ? fallback : integer
  }
  const model = getUltrareviewModel()
  const commonEnvVars = {
    BUGHUNTER_DRY_RUN: '1',
    BUGHUNTER_FLEET_SIZE: String(
      positiveInteger(config?.fleet_size, 5, 20),
    ),
    BUGHUNTER_MAX_DURATION: String(
      positiveInteger(config?.max_duration_minutes, 10, 25),
    ),
    BUGHUNTER_AGENT_TIMEOUT: String(
      positiveInteger(config?.agent_timeout_seconds, 600, 1800),
    ),
    BUGHUNTER_TOTAL_WALLCLOCK: String(
      positiveInteger(config?.total_wallclock_minutes, 22, 27),
    ),
    ...(model && { BUGHUNTER_MODEL: model }),
    ...(process.env.BUGHUNTER_DEV_BUNDLE_B64 && {
      BUGHUNTER_DEV_BUNDLE_B64: process.env.BUGHUNTER_DEV_BUNDLE_B64,
    }),
  }

  const CODE_REVIEW_ENV_ID = 'env_011111111111111111111113'
  let session
  let command: string
  let target: string
  let diffStat = ''

  if (scope.mode === 'pr') {
    const repo = await detectCurrentRepositoryWithHost()
    if (!repo || repo.host !== 'github.com') {
      logEvent('tengu_review_remote_precondition_failed', {})
      return null
    }
    session = await teleportToRemote({
      initialMessage: null,
      source: 'ultrareview',
      description: `ultrareview: ${repo.owner}/${repo.name}#${scope.prNumber}`,
      signal: context.abortController.signal,
      branchName: `refs/pull/${scope.prNumber}/head`,
      environmentId: CODE_REVIEW_ENV_ID,
      tags: ['ultrareview'],
      environmentVariables: {
        BUGHUNTER_PR_NUMBER: scope.prNumber,
        BUGHUNTER_REPOSITORY: `${repo.owner}/${repo.name}`,
        ...commonEnvVars,
      },
    })
    command = `/ultrareview ${scope.prNumber}`
    target = `${repo.owner}/${repo.name}#${scope.prNumber}`
  } else {
    const { baseBranch, mergeBaseSha } = scope
    diffStat = scope.diffStat
    let bundleFailure: string | undefined
    session = await teleportToRemote({
      initialMessage: null,
      source: 'ultrareview',
      description: `ultrareview: ${baseBranch}`,
      signal: context.abortController.signal,
      useBundle: true,
      bundleBaseRef: mergeBaseSha,
      environmentId: CODE_REVIEW_ENV_ID,
      tags: ['ultrareview'],
      environmentVariables: {
        BUGHUNTER_BASE_BRANCH: mergeBaseSha,
        ...commonEnvVars,
      },
      onBundleFail: message => {
        bundleFailure = message
      },
    })
    if (!session) {
      logEvent('tengu_review_remote_teleport_failed', {})
      return failedLaunch(
        bundleFailure ??
          'Repo is too large. Push a PR and use `/ultrareview <PR#>` instead.',
      )
    }
    command = '/ultrareview'
    target = baseBranch
  }

  if (!session) {
    logEvent('tengu_review_remote_teleport_failed', {})
    return null
  }

  registerRemoteAgentTask({
    remoteTaskType: 'ultrareview',
    session,
    command,
    context,
    isRemoteReview: true,
  })
  logEvent('tengu_review_remote_launched', {})

  const sessionUrl = getRemoteTaskSessionUrl(session.id)
  const billingPrefix = billingNote?.trim()
    ? `${billingNote.trim()}\n`
    : ''
  const scopeSuffix = diffStat ? `\nScope: ${diffStat}` : ''
  return {
    launched: true,
    sessionId: session.id,
    sessionUrl,
    blocks: [
      {
        type: 'text',
        text: `${billingPrefix}Ultrareview launched for ${target} (${getUltrareviewDurationNote()}, runs in the cloud). Track: ${sessionUrl}${scopeSuffix}`,
      },
    ],
  }
}

export async function launchUltrareview(
  args: string,
  options: { confirm?: boolean; context: TaskContext },
): Promise<UltrareviewLaunchResult> {
  if (!isUltrareviewEnabled()) {
    return { status: 'error', message: 'Ultrareview is currently unavailable.' }
  }

  const prepared = await prepareRemoteReviewScope(args)
  if (!prepared.ok) return { status: 'error', message: prepared.error }

  const gate = await checkOverageGate()
  if (gate.kind === 'blocked') {
    logEvent('tengu_review_overage_blocked', { reason: gate.reason })
    return {
      status: 'blocked',
      message: gate.message,
      actionUrl: gate.actionUrl,
    }
  }
  if (gate.kind === 'needs-confirm') {
    if (!options.confirm) {
      return {
        status: 'needs-confirm',
        body: gate.body,
        billingNote: gate.billingNote,
      }
    }
    confirmOverage()
  }

  const launched = await launchRemoteReview(
    prepared.scope,
    options.context,
    gate.billingNote,
  )
  const message =
    launched?.blocks
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim() || 'Failed to launch remote review session.'
  if (!launched?.launched || !launched.sessionId || !launched.sessionUrl) {
    return { status: 'error', message }
  }
  return {
    status: 'launched',
    sessionId: launched.sessionId,
    sessionUrl: launched.sessionUrl,
    message,
    billingNote: gate.billingNote,
  }
}
