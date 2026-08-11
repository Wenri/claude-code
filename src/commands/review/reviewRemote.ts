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
import { getCwd } from '../../utils/cwd.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { getBranch, getDefaultBranch, gitExe } from '../../utils/git.js'
import { checkIsInGitRepo } from '../../utils/background/remote/preconditions.js'
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
  | { mode: 'pr'; prNumber: string; repo: string }
  | {
      mode: 'branch'
      headBranch: string
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
  taskId?: string
  title?: string
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
      taskId: string
      title: string
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
  if (!(await checkIsInGitRepo())) {
    logEvent('tengu_review_remote_precondition_failed', {})
    return {
      ok: false,
      error: `/ultrareview needs a git repository so it can clone your code into a cloud sandbox, but ${getCwd()} is not inside one. Run "git init" here to create a repository, or cd into an existing one.`,
    }
  }

  const trimmed = args.trim()
  if (/^\d+$/.test(trimmed)) {
    const repo = await detectCurrentRepositoryWithHost()
    if (!repo) {
      logEvent('tengu_review_remote_precondition_failed', {})
      return {
        ok: false,
        error:
          '/ultrareview <PR#> needs a GitHub remote so it knows which repository the PR is in. If this project is not on GitHub yet, run "gh repo create --source=. --push" to create one; if a GitHub repo already exists, run "git remote add origin REPO_URL". Or run /ultrareview with no argument to review your current branch instead.',
      }
    }
    if (repo.host !== 'github.com') {
      logEvent('tengu_review_remote_precondition_failed', {})
      return {
        ok: false,
        error: `PR mode only supports github.com repositories — this remote is on ${repo.host}. Run \`/ultrareview\` (no number) to review your current branch instead.`,
      }
    }
    return {
      ok: true,
      scope: {
        mode: 'pr',
        prNumber: trimmed,
        repo: `${repo.owner}/${repo.name}`,
      },
    }
  }

  if (await isRepoTooLargeForBundle()) {
    logEvent('tengu_review_remote_precondition_failed', {})
    return {
      ok: false,
      error:
        'Repo is too large to bundle. Push a PR and use `/ultrareview <PR#>` instead.',
    }
  }

  if (trimmed) {
    const branchExists = async (ref: string): Promise<boolean> =>
      (
        await execFileNoThrow(
          gitExe(),
          ['rev-parse', '--verify', '--quiet', ref],
          { preserveOutputOnError: false },
        )
      ).code === 0

    if (
      !(await branchExists(`origin/${trimmed}`)) &&
      !(await branchExists(trimmed))
    ) {
      logEvent('tengu_review_remote_precondition_failed', {})
      return {
        ok: false,
        error: `"${trimmed}" is not a branch in this repo. /ultrareview takes a PR number, a branch name, or no argument (reviews your current branch). Try /ultrareview by itself.`,
      }
    }
  }

  const baseBranch = trimmed || (await getDefaultBranch()) || 'main'
  const headBranch = (await getBranch()) || 'HEAD'
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
    const hint = trimmed
      ? `Make sure ${baseBranch} exists locally or on origin (try \`git fetch origin ${baseBranch}\`).`
      : `Pass the base branch explicitly (e.g. \`/ultrareview develop\`) or make sure you're in a git repo with a ${baseBranch} branch.`
    return {
      ok: false,
      error: `Could not find merge-base with ${baseBranch}. ${hint}`,
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
      headBranch,
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
  const eligibility = await checkRemoteAgentEligibility({ allowBundle: true })
  if (!eligibility.eligible && eligibility.errors.length > 0) {
    logEvent('tengu_review_remote_precondition_failed', {
      precondition_errors: eligibility.errors
        .map(error => error.type)
        .join(
          ',',
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    const reasons = eligibility.errors
      .map(error => {
        if (error.type === 'not_in_git_repo') {
          return `/ultrareview needs a git repository so it can clone your code into a cloud sandbox, but ${getCwd()} is not inside one. Run "git init" here to create a repository, or cd into an existing one.`
        }
        if (error.type === 'no_git_remote') {
          return '/ultrareview needs a GitHub remote so it can clone this repository into the cloud. If this project is not on GitHub yet, run "gh repo create --source=. --push" to create one; if a GitHub repo already exists, run "git remote add origin REPO_URL && git push -u origin HEAD".'
        }
        return formatPreconditionError(error)
      })
      .join('\n')
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
  let createFailure: string | undefined

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
      onCreateFail: message => {
        createFailure = message
      },
    })
    command = `/ultrareview ${scope.prNumber}`
    target = `${repo.owner}/${repo.name}#${scope.prNumber}`
  } else {
    const { headBranch, baseBranch, mergeBaseSha } = scope
    diffStat = scope.diffStat
    let bundleFailure: string | undefined
    session = await teleportToRemote({
      initialMessage: null,
      source: 'ultrareview',
      description: `ultrareview: ${headBranch}`,
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
      onCreateFail: message => {
        createFailure = message
      },
    })
    if (!session) {
      logEvent('tengu_review_remote_teleport_failed', {})
      return failedLaunch(
        bundleFailure ??
          (createFailure
            ? `Ultrareview could not start the remote session: ${createFailure}`
            : 'Repo is too large. Push a PR and use `/ultrareview <PR#>` instead.'),
      )
    }
    command = '/ultrareview'
    target =
      headBranch === baseBranch
        ? headBranch
        : `${headBranch} → ${baseBranch}`
  }

  if (!session) {
    logEvent('tengu_review_remote_teleport_failed', {})
    if (createFailure) {
      return failedLaunch(
        `Ultrareview could not start the remote session: ${createFailure}`,
      )
    }
    return null
  }

  const { taskId } = registerRemoteAgentTask({
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
    taskId,
    title: session.title,
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

  if (!options.confirm) {
    const scopePreview =
      prepared.scope.mode === 'pr'
        ? `Reviewing PR ${prepared.scope.repo}#${prepared.scope.prNumber}`
        : `Reviewing current branch against ${prepared.scope.baseBranch}\nScope: ${prepared.scope.diffStat}`
    return {
      status: 'needs-confirm',
      body: `${scopePreview}\n${getUltrareviewDurationNote()} · Est. cost ${getUltrareviewCostNote()} USD`,
      billingNote: gate.billingNote,
    }
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
    taskId: launched.taskId!,
    title: launched.title!,
    message,
    billingNote: gate.billingNote,
  }
}
