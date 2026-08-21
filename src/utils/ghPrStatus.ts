import { execFileNoThrow } from './execFileNoThrow.js'
import { getBranch, getDefaultBranch, getIsGit } from './git.js'
import { memoizeWithTTLAsync } from './memoize.js'
import { jsonParse } from './slowOperations.js'

export type PrReviewState =
  | 'approved'
  | 'pending'
  | 'changes_requested'
  | 'draft'
  | 'merged'
  | 'closed'

export type PrStatus = {
  number: number
  url: string
  reviewState: PrReviewState
}

export type PrCheckSummary = {
  passed: number
  failed: number
  pending: number
}

export type PrDetails = {
  number: number
  title: string
  state: 'MERGED' | 'CLOSED' | 'DRAFT' | 'OPEN'
  checks: PrCheckSummary
  review: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  mergeable: boolean
  mergeStateStatus: string
  additions: number
  deletions: number
}

const GH_TIMEOUT_MS = 5000

/**
 * Derive review state from GitHub API values.
 * Draft PRs always show as 'draft' regardless of reviewDecision.
 * reviewDecision can be: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or empty string.
 */
export function deriveReviewState(
  isDraft: boolean,
  reviewDecision: string,
): PrReviewState {
  if (isDraft) return 'draft'
  switch (reviewDecision) {
    case 'APPROVED':
      return 'approved'
    case 'CHANGES_REQUESTED':
      return 'changes_requested'
    default:
      return 'pending'
  }
}

/**
 * Fetch PR status for the current branch using `gh pr view`.
 * Returns null on any failure (gh not installed, no PR, not in git repo, etc).
 * Also returns null if the PR's head branch is the default branch (e.g., main/master).
 */
export async function fetchPrStatus(): Promise<PrStatus | null> {
  const isGit = await getIsGit()
  if (!isGit) return null

  // Skip on the default branch — `gh pr view` returns the most recently
  // merged PR there, which is misleading.
  const [branch, defaultBranch] = await Promise.all([
    getBranch(),
    getDefaultBranch(),
  ])
  if (branch === defaultBranch) return null

  const { stdout, code } = await execFileNoThrow(
    'gh',
    [
      'pr',
      'view',
      '--json',
      'number,url,reviewDecision,isDraft,headRefName,state',
    ],
    { timeout: GH_TIMEOUT_MS, preserveOutputOnError: false },
  )

  if (code !== 0 || !stdout.trim()) return null

  try {
    const data = jsonParse(stdout) as {
      number: number
      url: string
      reviewDecision: string
      isDraft: boolean
      headRefName: string
      state: string
    }

    // Don't show PR status for PRs from the default branch (e.g., main, master)
    // This can happen when someone opens a PR from main to another branch
    if (
      data.headRefName === defaultBranch ||
      data.headRefName === 'main' ||
      data.headRefName === 'master'
    ) {
      return null
    }

    // Don't show PR status for merged or closed PRs — `gh pr view` returns
    // the most recently associated PR for a branch, which may be merged/closed.
    // The status line should only display open PRs.
    if (data.state === 'MERGED' || data.state === 'CLOSED') {
      return null
    }

    return {
      number: data.number,
      url: data.url,
      reviewState: deriveReviewState(data.isDraft, data.reviewDecision),
    }
  } catch {
    return null
  }
}

export function summarizePrChecks(
  checks:
    | Array<{
        conclusion?: string | null
        state?: string | null
        status?: string | null
      }>
    | null
    | undefined,
): PrCheckSummary {
  let passed = 0
  let failed = 0
  let pending = 0
  for (const check of checks ?? []) {
    const conclusion = (check.conclusion ?? check.state)?.toUpperCase()
    if (
      conclusion === 'SUCCESS' ||
      conclusion === 'NEUTRAL' ||
      conclusion === 'SKIPPED'
    ) {
      passed++
    } else if (conclusion === 'FAILURE' || conclusion === 'ERROR') {
      failed++
    } else if (
      conclusion == null ||
      conclusion === 'ACTION_REQUIRED' ||
      conclusion === 'PENDING' ||
      conclusion === 'EXPECTED' ||
      check.status?.toUpperCase() !== 'COMPLETED'
    ) {
      pending++
    } else {
      failed++
    }
  }
  return { passed, failed, pending }
}

export const fetchPrDetails = memoizeWithTTLAsync(
  async (prUrl: string): Promise<PrDetails | null> => {
    const { stdout, code } = await execFileNoThrow(
      'gh',
      [
        'pr',
        'view',
        prUrl,
        '--json',
        'number,title,state,isDraft,statusCheckRollup,reviewDecision,mergeStateStatus,additions,deletions',
      ],
      { timeout: GH_TIMEOUT_MS, preserveOutputOnError: false },
    )
    if (code !== 0 || !stdout.trim()) return null
    try {
      const data = jsonParse(stdout) as {
        number: number
        title: string
        state: string
        isDraft: boolean
        statusCheckRollup?: Array<{
          conclusion?: string | null
          state?: string | null
          status?: string | null
        }>
        reviewDecision?: string | null
        mergeStateStatus: string
        additions: number
        deletions: number
      }
      const review =
        data.reviewDecision === 'APPROVED' ||
        data.reviewDecision === 'CHANGES_REQUESTED' ||
        data.reviewDecision === 'REVIEW_REQUIRED'
          ? data.reviewDecision
          : null
      return {
        number: data.number,
        title: data.title,
        state:
          data.state === 'MERGED'
            ? 'MERGED'
            : data.state === 'CLOSED'
              ? 'CLOSED'
              : data.isDraft
                ? 'DRAFT'
                : 'OPEN',
        checks: summarizePrChecks(data.statusCheckRollup),
        review,
        mergeable:
          data.mergeStateStatus === 'CLEAN' ||
          data.mergeStateStatus === 'HAS_HOOKS' ||
          data.mergeStateStatus === 'UNSTABLE',
        mergeStateStatus: data.mergeStateStatus,
        additions: data.additions,
        deletions: data.deletions,
      }
    } catch {
      return null
    }
  },
  30_000,
)
