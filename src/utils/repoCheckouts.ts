import isEqual from 'lodash-es/isEqual.js'
import { sep } from 'path'
import { getCwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { errorMessage } from './errors.js'
import {
  addWatchedRepo,
  getCachedBranchForRepo,
  onRepoBranchChange,
} from './git/gitFilesystem.js'
import { jsonParse } from './slowOperations.js'

type RepoPathMap = Map<string, string>

let repoCheckouts: RepoPathMap | null = null
let repoBaseRefs: RepoPathMap | null = null
let reportMetadata:
  | ((metadata: { current_branches: Record<string, string | null> }) => void)
  | null = null
let lastBranches: Record<string, string | null> = {}

function parseRepoPathMap(value: string | undefined): RepoPathMap {
  const result = new Map<string, string>()
  if (!value) return result

  try {
    const parsed = jsonParse(value)
    if (parsed && typeof parsed === 'object') {
      for (const [name, path] of Object.entries(parsed)) {
        if (typeof path === 'string') result.set(name, path)
      }
    }
  } catch (error) {
    logForDebugging(
      `[repo-checkouts] Failed to parse env map: ${errorMessage(error)}`,
      { level: 'error' },
    )
  }
  return result
}

export function getRepoCheckouts(): RepoPathMap {
  if (repoCheckouts) return repoCheckouts
  const configured = process.env.CLAUDE_CODE_REPO_CHECKOUTS
  repoCheckouts = configured
    ? parseRepoPathMap(configured)
    : new Map([['', getCwd()]])
  return repoCheckouts
}

export function getRepoBaseRefs(): RepoPathMap {
  if (repoBaseRefs) return repoBaseRefs
  repoBaseRefs = parseRepoPathMap(process.env.CLAUDE_CODE_BASE_REFS)
  return repoBaseRefs
}

export function getRepoNameForPath(path: string): string | undefined {
  for (const [name, checkout] of getRepoCheckouts()) {
    if (path === checkout || path.startsWith(checkout + sep)) return name
  }
  return undefined
}

export async function initializeRepoBranchWatcher(
  onMetadata: (metadata: {
    current_branches: Record<string, string | null>
  }) => void,
): Promise<void> {
  reportMetadata = onMetadata
  for (const [, checkout] of getRepoCheckouts()) {
    await addWatchedRepo(checkout)
  }
  onRepoBranchChange(() => void refreshRepoBranches())
}

export async function refreshRepoBranches(): Promise<void> {
  const branches: Record<string, string | null> = {}
  for (const [name, checkout] of getRepoCheckouts()) {
    const branch = await getCachedBranchForRepo(checkout)
    if (branch !== undefined) branches[name] = branch
  }
  if (isEqual(branches, lastBranches)) return
  lastBranches = branches
  reportMetadata?.({ current_branches: branches })
}
