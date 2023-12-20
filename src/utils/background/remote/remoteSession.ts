import type { SDKMessage } from 'src/entrypoints/agentSdkTypes.js'
import axios from 'axios'
import { checkGate_CACHED_OR_BLOCKING } from '../../../services/analytics/growthbook.js'
import { isPolicyAllowed } from '../../../services/policyLimits/index.js'
import { getCwd } from '../../cwd.js'
import { logForDebugging } from '../../debug.js'
import { detectCurrentRepositoryWithHost } from '../../detectRepository.js'
import { isEnvTruthy } from '../../envUtils.js'
import { errorMessage } from '../../errors.js'
import { findGitRoot } from '../../git.js'
import { getSettings_DEPRECATED } from '../../settings/settings.js'
import { fetchEnvironments } from '../../teleport/environments.js'
import type { TodoList } from '../../todo/types.js'
import {
  checkGithubAppInstalled,
  checkIsInGitRepo,
  checkNeedsClaudeAiLogin,
} from './preconditions.js'

/**
 * Background remote session type for managing teleport sessions
 */
export type BackgroundRemoteSession = {
  id: string
  command: string
  startTime: number
  status: 'starting' | 'running' | 'completed' | 'failed' | 'killed'
  todoList: TodoList
  title: string
  type: 'remote_session'
  log: SDKMessage[]
}

export type RemoteSourceViability = {
  cloneViable: boolean
  bundleSeedEnabled: boolean
}

/**
 * Resolve how a remote session can receive the current repository.  Ultraplan
 * starts this while its confirmation dialog is opening so the UI does not add
 * another network round trip after the user confirms.
 */
export async function getRemoteSourceViability(): Promise<RemoteSourceViability> {
  const [repository, bundleSeedGate] = await Promise.all([
    detectCurrentRepositoryWithHost(),
    checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled'),
  ])
  const bundleSeedEnabled =
    findGitRoot(getCwd()) !== null &&
    (isEnvTruthy(process.env.CCR_ENABLE_BUNDLE) || bundleSeedGate)
  if (!bundleSeedEnabled) return { cloneViable: false, bundleSeedEnabled }
  return {
    cloneViable:
      repository !== null &&
      (repository.host !== 'github.com' ||
        (await checkGithubAppInstalled(repository.owner, repository.name))),
    bundleSeedEnabled,
  }
}

/**
 * Precondition failures for background remote sessions
 */
export type BackgroundRemoteSessionPrecondition =
  | { type: 'not_logged_in' }
  | { type: 'not_in_git_repo' }
  | { type: 'no_git_remote' }
  | { type: 'github_app_not_installed' }
  | { type: 'policy_blocked' }

/**
 * Checks eligibility for creating a background remote session
 * Returns an array of failed preconditions (empty array means all checks passed)
 *
 * @returns Array of failed preconditions
 */
export async function checkBackgroundRemoteSessionEligibility({
  allowBundle = false,
}: {
  allowBundle?: boolean
} = {}): Promise<BackgroundRemoteSessionPrecondition[]> {
  const errors: BackgroundRemoteSessionPrecondition[] = []

  // Check policy first - if blocked, no need to check other preconditions
  if (!isPolicyAllowed('allow_remote_sessions')) {
    errors.push({ type: 'policy_blocked' })
    return errors
  }

  const [needsLogin, repository] = await Promise.all([
    checkNeedsClaudeAiLogin(),
    detectCurrentRepositoryWithHost(),
  ])

  let environments: Awaited<ReturnType<typeof fetchEnvironments>> | null = null

  if (needsLogin) {
    errors.push({ type: 'not_logged_in' })
  } else {
    try {
      environments = await fetchEnvironments()
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        errors.push({ type: 'not_logged_in' })
      } else {
        logForDebugging(
          `fetchRemoteEnvironmentsForEligibility failed: ${errorMessage(error)}`,
        )
      }
    }
  }

  const configuredDefaultId =
    getSettings_DEPRECATED()?.remote?.defaultEnvironmentId
  const configuredDefaultIsByoc =
    configuredDefaultId !== undefined &&
    environments !== null &&
    environments.some(
      environment =>
        environment.environment_id === configuredDefaultId &&
        environment.kind === 'byoc',
    )

  // When bundle seeding is on, in-git-repo is enough — CCR can seed from
  // a local bundle. No GitHub remote or app needed. Same gate as
  // teleport.tsx bundleSeedGateOn.
  const bundleSeedGateOn =
    allowBundle &&
    (isEnvTruthy(process.env.CCR_FORCE_BUNDLE) ||
      isEnvTruthy(process.env.CCR_ENABLE_BUNDLE) ||
      (await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled')))

  if (!(await checkIsInGitRepo())) {
    errors.push({ type: 'not_in_git_repo' })
  } else if (bundleSeedGateOn && findGitRoot(getCwd()) !== null) {
    // has .git/, bundle will work — skip remote+app checks
  } else if (repository === null) {
    errors.push({ type: 'no_git_remote' })
  } else if (!configuredDefaultIsByoc && repository.host === 'github.com') {
    const hasGithubApp = await checkGithubAppInstalled(
      repository.owner,
      repository.name,
    )
    if (!hasGithubApp) {
      errors.push({ type: 'github_app_not_installed' })
    }
  }

  return errors
}
