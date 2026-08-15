import figures from 'figures'
import React, { useEffect, useRef, useState } from 'react'
import { getSessionId } from '../../bootstrap/state.js'
import { getReplBridgeHandle } from '../../bridge/replBridgeHandle.js'
import { updatePullRequestSubscription } from '../../bridge/sessionSubscriptions.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { LoadingState } from '../../components/design-system/LoadingState.js'
import { getOauthConfig } from '../../constants/oauth.js'
import { Box, Text } from '../../ink.js'
import Link from '../../ink/components/Link.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { ToolUseContext } from '../../Tool.js'
import { createTaskStateBase, generateTaskId } from '../../Task.js'
import {
  checkRemoteAgentEligibility,
  formatPreconditionError,
  getRemoteTaskSessionUrl,
  registerRemoteAgentTask,
} from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import type {
  InProcessTeammateTaskState,
  TeammateIdentity,
} from '../../tasks/InProcessTeammateTask/types.js'
import { isInProcessTeammateTask } from '../../tasks/InProcessTeammateTask/types.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { createAbortController } from '../../utils/abortController.js'
import { getClaudeAIOAuthTokens } from '../../utils/auth.js'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
import { errorMessage } from '../../utils/errors.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import {
  getBranch,
  getDefaultBranch,
  hasUnpushedCommits,
} from '../../utils/git.js'
import { createTeammateContext } from '../../utils/teammateContext.js'
import { registerTask } from '../../utils/task/framework.js'
import {
  archiveRemoteSession,
  teleportToRemote,
} from '../../utils/teleport.js'
import { startInProcessTeammate } from '../../utils/swarm/inProcessRunner.js'

type AutofixStatus =
  | 'checking'
  | 'spawning'
  | 'subscribing'
  | 'spawning-local'

const STATUS_MESSAGES: Record<AutofixStatus, string> = {
  checking: 'Detecting open PR for current branch…',
  spawning: 'Spawning remote autofix session…',
  subscribing: 'Turning on autofix…',
  'spawning-local': 'Spawning background autofix agent…',
}

type PullRequestInfo = {
  number: number
  state: string
  url: string
  headRefName: string
}

function isPullRequestInfo(value: unknown): value is PullRequestInfo {
  if (!value || typeof value !== 'object') return false
  return (
    'number' in value &&
    typeof value.number === 'number' &&
    'state' in value &&
    typeof value.state === 'string' &&
    'url' in value &&
    typeof value.url === 'string' &&
    'headRefName' in value &&
    typeof value.headRefName === 'string'
  )
}

function normalizeAgentPermissionMode(
  mode: ToolUseContext['getAppState'] extends () => infer State
    ? State extends { toolPermissionContext: { mode: infer Mode } }
      ? Mode
      : never
    : never,
) {
  if (mode === 'plan' || mode === 'dontAsk') return 'default' as const
  return mode
}

/**
 * The target carries the local Remote Control implementation but keeps its
 * rollout gate closed. Keeping the branch source-visible makes the webhook
 * subscription lifecycle recoverable without enabling it prematurely.
 */
function shouldUseLocalRemoteControlAutofix(): boolean {
  return false
}

function spawnLocalAutofixAgent(
  prompt: string,
  target: string,
  context: ToolUseContext & LocalJSXCommandContext,
): { taskId: string; abortController: AbortController } {
  const taskId = generateTaskId('in_process_teammate')
  const abortController = createAbortController()
  const identity: TeammateIdentity = {
    agentId: taskId,
    agentName: 'autofix-pr',
    teamName: '_autofix',
    color: undefined,
    planModeRequired: false,
    parentSessionId: getSessionId(),
  }
  const task: InProcessTeammateTaskState = {
    ...createTaskStateBase(
      taskId,
      'in_process_teammate',
      `autofix-pr: monitoring ${target}`,
    ),
    type: 'in_process_teammate',
    status: 'running',
    identity,
    prompt,
    abortController,
    awaitingPlanApproval: false,
    permissionMode: normalizeAgentPermissionMode(
      context.getAppState().toolPermissionContext.mode,
    ),
    isIdle: false,
    shutdownRequested: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    pendingUserMessages: [],
    messages: [],
  }
  task.unregisterCleanup = registerCleanup(async () => {
    abortController.abort()
  })
  registerTask(task, context.setAppState)
  startInProcessTeammate({
    identity,
    taskId,
    prompt,
    teammateContext: createTeammateContext({ ...identity, abortController }),
    toolUseContext: { ...context, messages: [] },
    abortController,
    allowPermissionPrompts: true,
  })
  return { taskId, abortController }
}

function AutofixPr({
  onDone,
  context,
  args,
}: {
  onDone: LocalJSXCommandOnDone
  context: ToolUseContext & LocalJSXCommandContext
  args: string
}): React.ReactNode {
  const [status, setStatus] = useState<AutofixStatus>('checking')
  const [pullRequest, setPullRequest] = useState<{
    ref: string
    url: string
  } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const remoteSessionId = useRef<string | null>(null)
  const cancelled = useRef(false)
  const localAbortController = useRef<AbortController | null>(null)

  useEffect(() => {
    // The public command currently supplies only a freeform prompt. Keep the
    // target's structured launch fields in telemetry so future callers that
    // provide explicit PR/repository inputs retain the same event shape.
    const explicitPrNumber: number | undefined = undefined
    const repoPath: string | undefined = undefined
    const customInstructionCommands: string[] = []
    const isStopRequest = args === 'stop' || args === 'off'
    const customPrompt = args
    logEvent('tengu_autofix_pr_started', {
      action: 'start',
      has_pr_number: String(explicitPrNumber !== undefined),
      has_repo_path: String(repoPath !== undefined),
    })

    const fail = (message: string, result: string): void => {
      if (cancelled.current) return
      logEvent('tengu_autofix_pr_result', {
        result:
          result as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      setFailure(`Autofix PR failed: ${message}`)
    }

    void (async () => {
      void isStopRequest

      try {
        const [branch, defaultBranch, eligibility, unpushed] =
          await Promise.all([
            getBranch(),
            getDefaultBranch(),
            checkRemoteAgentEligibility(),
            hasUnpushedCommits(),
          ])

        if (explicitPrNumber === undefined && branch === defaultBranch) {
          fail(
            `cannot run on the default branch (${defaultBranch}). Check out a feature branch first.`,
            'on_default_branch',
          )
          return
        }
        if (!eligibility.eligible) {
          const reasons = eligibility.errors
            .map(formatPreconditionError)
            .join('\n')
          fail(`can't start autofix —\n${reasons}`, 'not_eligible')
          return
        }

        const launchMode = 'auto'
        const useLocalRemoteControl =
          launchMode === 'remote_control' &&
          shouldUseLocalRemoteControlAutofix()
        const ghArgs = ['pr', 'view', '--json', 'number,state,url,headRefName']
        const result = await execFileNoThrow('gh', ghArgs, {
          timeout: 10_000,
          preserveOutputOnError: true,
          abortSignal: context.abortController.signal,
        })
        if (result.code !== 0 || !result.stdout.trim()) {
          if (result.error?.includes('ENOENT')) {
            fail('gh CLI is required but not found.', 'gh_not_found')
          } else if (result.error) {
            fail(`gh pr view failed: ${result.error}`, 'gh_failed')
          } else {
            fail(
              explicitPrNumber !== undefined
                ? `couldn't find PR #${explicitPrNumber} in this repo.`
                : `no open PR found for branch "${branch}". Create a PR first, then retry.`,
              'no_open_pr',
            )
          }
          return
        }

        let info: PullRequestInfo
        let owner: string
        let repo: string
        let outcomeBranch: string
        try {
          const parsed: unknown = JSON.parse(result.stdout)
          if (!isPullRequestInfo(parsed)) throw new Error('invalid PR payload')
          info = parsed
          if (info.state === 'MERGED' || info.state === 'CLOSED') {
            fail(
              `PR #${info.number} is ${info.state.toLowerCase()}. Autofix requires an open PR.`,
              'pr_not_open',
            )
            return
          }
          const match = info.url.match(/\/([^/]+)\/([^/]+)\/pull\//)
          if (!match?.[1] || !match[2]) {
            fail(`unexpected PR URL format: ${info.url}`, 'bad_pr_url')
            return
          }
          owner = match[1]
          repo = match[2]
          outcomeBranch =
            explicitPrNumber !== undefined ? info.headRefName : branch
        } catch {
          fail(
            `no open PR found for branch "${branch}". Create a PR first, then retry.`,
            'no_open_pr',
          )
          return
        }

        if (cancelled.current) return
        setPullRequest({ ref: `${owner}/${repo}#${info.number}`, url: info.url })
        const repoName = `${owner}/${repo}`
        const customInstructions =
          customInstructionCommands.length > 0
            ? ` Run ${customInstructionCommands.join(' and ')} for custom instructions on how to autofix.`
            : ''
        const prompt =
          customPrompt ||
          (useLocalRemoteControl
            ? `You're monitoring PR #${info.number} in ${repoName}. Wait for CI failures or review comments to arrive as notifications, then investigate and push fixes directly to the PR branch.${customInstructions} Do not check the PR now — just acknowledge you're ready and complete this turn.`
            : `You're monitoring PR #${info.number} in ${repoName}. When CI failures or review comments arrive as notifications, investigate and push fixes directly to the PR branch.${customInstructions} Start by checking the current PR status.`)

        if (useLocalRemoteControl) {
          setStatus('spawning-local')
          const bridge = getReplBridgeHandle()
          if (!bridge?.subscribePR || !bridge.getPRWebhookTarget) {
            fail(
              'Remote Control disconnected before subscribe.',
              'rc_disconnected',
            )
            return
          }
          const target = `${repoName}#${info.number}`
          const existing = bridge.getPRWebhookTarget()
          if (existing) {
            const sameTarget =
              existing.repo === repoName &&
              existing.prNumber === info.number
            const existingTask = context.getAppState().tasks[existing.agentId]
            const isRunning =
              isInProcessTeammateTask(existingTask) &&
              existingTask.status === 'running'
            if (!sameTarget) {
              fail(
                `already monitoring ${existing.repo}#${existing.prNumber}. Run /autofix-pr stop first.`,
                'rc_already_monitoring_other',
              )
              return
            }
            if (isRunning) {
              logEvent('tengu_autofix_pr_result', { result: 'success_rc' })
              onDone(`Already monitoring ${target} in background · press ↓ to view`, {
                display: 'system',
              })
              return
            }
          }
          const local = spawnLocalAutofixAgent(prompt, target, context)
          localAbortController.current = local.abortController
          if (cancelled.current) {
            local.abortController.abort()
            return
          }
          const subscribed = await bridge.subscribePR(
            repoName,
            info.number,
            local.taskId,
          )
          if (cancelled.current) {
            if (subscribed) void bridge.unsubscribePR?.(repoName, info.number)
            return
          }
          if (!subscribed) {
            local.abortController.abort()
            localAbortController.current = null
            fail(
              "couldn't subscribe the Remote Control session to PR events.",
              'rc_subscribe_failed',
            )
            return
          }
          const warning = unpushed
            ? '\nWARNING: You have unpushed local commits, run git push so the PR reflects them'
            : ''
          localAbortController.current = null
          logEvent('tengu_autofix_pr_result', { result: 'success_rc' })
          onDone(
            `Monitoring ${target} in background · press ↓ to view${warning}`,
            { display: 'system' },
          )
          return
        }

        setStatus('spawning')
        let bundleFailure: string | undefined
        const session = await teleportToRemote({
          initialMessage: prompt,
          source: 'autofix_pr',
          branchName: outcomeBranch,
          reuseOutcomeBranch: outcomeBranch,
          title: `Autofix PR: ${owner}/${repo}#${info.number} (${outcomeBranch})`,
          useDefaultEnvironment: true,
          signal: context.abortController.signal,
          githubPr: { owner, repo, number: info.number },
          onBundleFail: message => {
            bundleFailure = message
          },
        })
        if (!session) {
          fail(
            bundleFailure ?? 'remote session creation failed.',
            'session_create_failed',
          )
          return
        }
        remoteSessionId.current = session.id
        if (cancelled.current) {
          void archiveRemoteSession(session.id)
          return
        }

        setStatus('subscribing')
        const subscribed = await updatePullRequestSubscription(
          'subscribe',
          session.id,
          repoName,
          info.number,
          getOauthConfig().BASE_API_URL,
          () => getClaudeAIOAuthTokens()?.accessToken,
        )
        if (cancelled.current) return

        registerRemoteAgentTask({
          remoteTaskType: 'autofix-pr',
          session: { id: session.id, title: session.title },
          command: prompt,
          isLongRunning: true,
          remoteTaskMetadata: { owner, repo, prNumber: info.number },
          context: { ...context, abortController: new AbortController() },
        })
        const sessionUrl = getRemoteTaskSessionUrl(session.id)
        const warnings: string[] = []
        if (!subscribed) {
          warnings.push('WARNING: Failed to turn on autofix for this PR')
        }
        if (unpushed) {
          warnings.push(
            'WARNING: You have unpushed local commits, run git push so the remote session sees them',
          )
        }
        const warningText =
          warnings.length > 0 ? `\n${warnings.join('\n')}` : ''
        remoteSessionId.current = null
        logEvent('tengu_autofix_pr_result', { result: 'success' })
        onDone(
          `Spawned remote autofix PR session on ${outcomeBranch} (PR #${info.number})${warningText}\n  ${figures.arrowRight} ${sessionUrl}`,
        )
      } catch (error) {
        fail(errorMessage(error), 'exception')
      }
    })()

    return () => {
      cancelled.current = true
      if (remoteSessionId.current) {
        void archiveRemoteSession(remoteSessionId.current)
      }
      localAbortController.current?.abort()
    }
  }, [args, context, onDone])

  const close = (): void => {
    if (failure) {
      onDone(failure)
      return
    }
    cancelled.current = true
    logEvent('tengu_autofix_pr_result', { result: 'cancelled' })
    context.abortController.abort()
    onDone('Autofix PR cancelled')
  }

  useKeybinding(
    'confirm:yes',
    () => {
      if (failure) onDone(failure)
    },
    { context: 'Confirmation', isActive: failure !== null },
  )

  return (
    <Dialog
      title="Autofix PR"
      subtitle="Monitor and autofix any issues with the current PR"
      onCancel={close}
      hideInputGuide
    >
      <Box flexDirection="column" gap={1} marginBottom={1}>
        {failure ? (
          <>
            <Text color="error">{failure}</Text>
            <Text dimColor>
              <KeyboardShortcutHint shortcut="Esc/Enter" action="close" />
            </Text>
          </>
        ) : (
          <>
            <LoadingState message={STATUS_MESSAGES[status]} />
            {pullRequest && (
              <Text dimColor>
                PR: <Link url={pullRequest.url}>{pullRequest.ref}</Link>
              </Text>
            )}
            <Text dimColor>
              <KeyboardShortcutHint shortcut="Esc" action="cancel" />
            </Text>
          </>
        )}
      </Box>
    </Dialog>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  return <AutofixPr onDone={onDone} context={context} args={args.trim()} />
}
