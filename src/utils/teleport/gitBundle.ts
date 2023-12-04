/**
 * Git bundle creation + upload for CCR seed-bundle seeding.
 *
 * Flow:
 *   1. git stash create → update-ref refs/seed/stash (makes it reachable)
 *   2. git bundle create --all (packs refs/seed/stash + its objects)
 *   3. Upload to /v1/files
 *   4. Cleanup refs/seed/stash (don't pollute user's repo)
 *   5. Caller sets seed_bundle_file_id on SessionContext
 */

import { stat, unlink } from 'fs/promises'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { type FilesApiConfig, uploadFile } from '../../services/api/filesApi.js'
import { getCwd } from '../cwd.js'
import { logForDebugging } from '../debug.js'
import { execFileNoThrowWithCwd } from '../execFileNoThrow.js'
import { findGitRoot, gitExe } from '../git.js'
import { generateTempFilePath } from '../tempfile.js'

// Tunable via tengu_ccr_bundle_max_bytes.
const DEFAULT_BUNDLE_MAX_BYTES = 100 * 1024 * 1024

function getBundleMaxBytes(): number {
  return (
    getFeatureValue_CACHED_MAY_BE_STALE<number | null>(
      'tengu_ccr_bundle_max_bytes',
      null,
    ) ?? DEFAULT_BUNDLE_MAX_BYTES
  )
}

type BundleScope = 'all' | 'head' | 'squashed'

export type BundleUploadResult =
  | {
      success: true
      fileId: string
      bundleSizeBytes: number
      scope: BundleScope
      hasWip: boolean
    }
  | { success: false; error: string; failReason?: BundleFailReason }

type BundleFailReason =
  | 'git_error'
  | 'too_large'
  | 'empty_repo'
  | 'stash_failed'
  | 'no_changes'

type BundleCreateResult =
  | { ok: true; size: number; scope: BundleScope }
  | { ok: false; error: string; failReason: BundleFailReason }

async function getPackedRepositoryStats(
  gitRoot: string,
  signal?: AbortSignal,
): Promise<{ sizeBytes: number | null; inPackCount: number | null }> {
  const result = await execFileNoThrowWithCwd(
    gitExe(),
    ['count-objects', '-v'],
    { cwd: gitRoot, abortSignal: signal },
  )
  if (result.code !== 0) {
    return { sizeBytes: null, inPackCount: null }
  }
  const sizePack = result.stdout.match(/^size-pack:\s*(\d+)/m)
  const inPack = result.stdout.match(/^in-pack:\s*(\d+)/m)
  return {
    sizeBytes: sizePack ? Number(sizePack[1]) * 1024 : null,
    inPackCount: inPack ? Number(inPack[1]) : null,
  }
}

/**
 * Fast rejection for repositories whose packed object database is too large
 * even for the squashed bundle fallback. Used by /ultrareview before showing
 * a launch dialog that cannot succeed.
 */
export async function isRepoTooLargeForBundle(options?: {
  cwd?: string
  signal?: AbortSignal
}): Promise<boolean> {
  const gitRoot = findGitRoot(options?.cwd ?? getCwd())
  if (!gitRoot) return false
  const { sizeBytes, inPackCount } = await getPackedRepositoryStats(
    gitRoot,
    options?.signal,
  )
  if (sizeBytes === null) return false
  const maxBytes = getBundleMaxBytes()
  return (
    sizeBytes > 3 * maxBytes &&
    (sizeBytes > 100 * maxBytes ||
      (inPackCount !== null && inPackCount > 5_000_000))
  )
}

// Bundle --all → HEAD → squashed-root. HEAD drops side branches/tags but
// keeps full current-branch history. Squashed-root is a single parentless
// commit of HEAD's tree (or the stash tree if WIP exists) — no history,
// just the snapshot. Receiver needs refs/seed/root handling for that tier.
async function _bundleWithFallback(
  gitRoot: string,
  bundlePath: string,
  maxBytes: number,
  hasStash: boolean,
  signal: AbortSignal | undefined,
  baseRef?: string,
): Promise<BundleCreateResult> {
  // --all picks up refs/seed/stash; HEAD needs it explicit.
  const extra = hasStash ? ['refs/seed/stash'] : []
  const mkBundle = (base: string) =>
    execFileNoThrowWithCwd(
      gitExe(),
      ['bundle', 'create', bundlePath, base, ...extra],
      { cwd: gitRoot, abortSignal: signal },
    )

  const { sizeBytes, inPackCount } = await getPackedRepositoryStats(
    gitRoot,
    signal,
  )
  const skipAll = sizeBytes !== null && sizeBytes > maxBytes
  const skipHead = sizeBytes !== null && sizeBytes > 3 * maxBytes
  const skipSquashed =
    sizeBytes !== null &&
    skipHead &&
    (sizeBytes > 100 * maxBytes ||
      (inPackCount !== null && inPackCount > 5_000_000))

  if (skipAll && sizeBytes !== null) {
    logForDebugging(
      `[gitBundle] size-pack ${(sizeBytes / 1024 / 1024).toFixed(0)}MB > ${(maxBytes / 1024 / 1024).toFixed(0)}MB cap; skipping --all${skipHead ? ' and HEAD' : ''}${skipSquashed ? ' and squashed' : ''}`,
    )
  } else {
    const allResult = await mkBundle('--all')
    if (allResult.code !== 0) {
      return {
        ok: false,
        error: `git bundle create --all failed (${allResult.code}): ${allResult.stderr.slice(0, 200)}`,
        failReason: 'git_error',
      }
    }
    const { size: allSize } = await stat(bundlePath)
    if (allSize <= maxBytes) {
      return { ok: true, size: allSize, scope: 'all' }
    }
    logForDebugging(
      `[gitBundle] --all bundle is ${(allSize / 1024 / 1024).toFixed(1)}MB (> ${(maxBytes / 1024 / 1024).toFixed(0)}MB), retrying HEAD-only`,
    )
  }

  if (!skipHead) {
    const headResult = await mkBundle('HEAD')
    if (headResult.code !== 0) {
      return {
        ok: false,
        error: `git bundle create HEAD failed (${headResult.code}): ${headResult.stderr.slice(0, 200)}`,
        failReason: 'git_error',
      }
    }
    const { size: headSize } = await stat(bundlePath)
    if (headSize <= maxBytes) {
      return { ok: true, size: headSize, scope: 'head' }
    }
    logForDebugging(
      `[gitBundle] HEAD bundle is ${(headSize / 1024 / 1024).toFixed(1)}MB, retrying squashed-root`,
    )
  }

  if (skipSquashed) {
    return {
      ok: false,
      error:
        'Repo is too large to bundle. Please setup GitHub on https://claude.ai/code',
      failReason: 'too_large',
    }
  }

  // Last resort: squash to a single parentless commit. Uses the stash tree
  // when WIP exists (bakes uncommitted changes in — can't bundle the stash
  // ref separately since its parents would drag history back).
  const treeRef = hasStash ? 'refs/seed/stash^{tree}' : 'HEAD^{tree}'
  const parentArgs: string[] = []
  if (baseRef) {
    const [treeResult, baseTreeResult] = await Promise.all(
      [treeRef, `${baseRef}^{tree}`].map(ref =>
        execFileNoThrowWithCwd(gitExe(), ['rev-parse', ref], {
          cwd: gitRoot,
          abortSignal: signal,
        }),
      ),
    )
    if (
      treeResult?.code === 0 &&
      treeResult.stdout.trim() === baseTreeResult?.stdout.trim()
    ) {
      return {
        ok: false,
        error:
          "It doesn't look like you have any new commits or changes to review. Stage or commit them first?",
        failReason: 'no_changes',
      }
    }
    const baseCommit = await execFileNoThrowWithCwd(
      gitExe(),
      ['commit-tree', `${baseRef}^{tree}`, '-m', 'seed-base'],
      { cwd: gitRoot, abortSignal: signal },
    )
    if (baseCommit.code === 0) {
      parentArgs.push('-p', baseCommit.stdout.trim())
    } else {
      logForDebugging(
        `[gitBundle] baseRef commit-tree failed (${baseCommit.code}), squashing without parent: ${baseCommit.stderr.slice(0, 200)}`,
      )
    }
  }
  const commitTree = await execFileNoThrowWithCwd(
    gitExe(),
    ['commit-tree', treeRef, ...parentArgs, '-m', 'seed'],
    { cwd: gitRoot, abortSignal: signal },
  )
  if (commitTree.code !== 0) {
    return {
      ok: false,
      error: `git commit-tree failed (${commitTree.code}): ${commitTree.stderr.slice(0, 200)}`,
      failReason: 'git_error',
    }
  }
  const squashedSha = commitTree.stdout.trim()
  await execFileNoThrowWithCwd(
    gitExe(),
    ['update-ref', 'refs/seed/root', squashedSha],
    { cwd: gitRoot },
  )
  const squashResult = await execFileNoThrowWithCwd(
    gitExe(),
    ['bundle', 'create', bundlePath, 'refs/seed/root'],
    { cwd: gitRoot, abortSignal: signal },
  )
  if (squashResult.code !== 0) {
    return {
      ok: false,
      error: `git bundle create refs/seed/root failed (${squashResult.code}): ${squashResult.stderr.slice(0, 200)}`,
      failReason: 'git_error',
    }
  }
  const { size: squashSize } = await stat(bundlePath)
  if (squashSize <= maxBytes) {
    return { ok: true, size: squashSize, scope: 'squashed' }
  }

  return {
    ok: false,
    error:
      'Repo is too large to bundle. Please setup GitHub on https://claude.ai/code',
    failReason: 'too_large',
  }
}

// Bundle the repo and upload to Files API; return file_id for
// seed_bundle_file_id. --all → HEAD → squashed-root fallback chain.
// Tracked WIP via stash create → refs/seed/stash (or baked into the
// squashed tree); untracked not captured.
export async function createAndUploadGitBundle(
  config: FilesApiConfig,
  opts?: { cwd?: string; signal?: AbortSignal; baseRef?: string },
): Promise<BundleUploadResult> {
  const workdir = opts?.cwd ?? getCwd()
  const gitRoot = findGitRoot(workdir)
  if (!gitRoot) {
    return { success: false, error: 'Not in a git repository' }
  }

  // Sweep stale refs from a crashed prior run before --all bundles them.
  // Runs before the empty-repo check so it's never skipped by an early return.
  for (const ref of ['refs/seed/stash', 'refs/seed/root']) {
    await execFileNoThrowWithCwd(gitExe(), ['update-ref', '-d', ref], {
      cwd: gitRoot,
    })
  }

  // `git bundle create` refuses to create an empty bundle (exit 128), and
  // `stash create` fails with "You do not have the initial commit yet".
  // Check for any refs (not just HEAD) so orphan branches with commits
  // elsewhere still bundle — `--all` packs those refs regardless of HEAD.
  const refCheck = await execFileNoThrowWithCwd(
    gitExe(),
    ['for-each-ref', '--count=1', 'refs/'],
    { cwd: gitRoot },
  )
  if (refCheck.code === 0 && refCheck.stdout.trim() === '') {
    logEvent('tengu_ccr_bundle_upload', {
      outcome:
        'empty_repo' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return {
      success: false,
      error: 'Repository has no commits yet',
      failReason: 'empty_repo',
    }
  }

  // stash create writes a dangling commit — doesn't touch refs/stash or
  // the working tree. Untracked files intentionally excluded.
  const stashResult = await execFileNoThrowWithCwd(
    gitExe(),
    ['stash', 'create'],
    { cwd: gitRoot, abortSignal: opts?.signal },
  )
  // exit 0 + empty stdout = nothing to stash. A failure with an existing
  // HEAD is fatal because proceeding would silently omit local changes.
  const wipStashSha = stashResult.code === 0 ? stashResult.stdout.trim() : ''
  const hasWip = wipStashSha !== ''
  if (stashResult.code !== 0) {
    logForDebugging(
      `[gitBundle] git stash create failed (${stashResult.code}): ${stashResult.stderr.slice(0, 200)}`,
    )
    const head = await execFileNoThrowWithCwd(
      gitExe(),
      ['rev-parse', '--verify', 'HEAD'],
      { cwd: gitRoot },
    )
    if (head.code === 0) {
      logEvent('tengu_ccr_bundle_upload', {
        outcome:
          'stash_failed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      return {
        success: false,
        error: `Could not capture uncommitted changes (git stash create: ${stashResult.stderr.trim()}). Run \`git add .\` or commit, then retry.`,
        failReason: 'stash_failed',
      }
    }
  } else if (hasWip) {
    logForDebugging(`[gitBundle] Captured WIP as stash ${wipStashSha}`)
    // env-runner reads the SHA via bundle list-heads refs/seed/stash.
    await execFileNoThrowWithCwd(
      gitExe(),
      ['update-ref', 'refs/seed/stash', wipStashSha],
      { cwd: gitRoot },
    )
  }

  const bundlePath = generateTempFilePath('ccr-seed', '.bundle')

  // git leaves a partial file on nonzero exit (e.g. empty-repo 128).
  try {
    const maxBytes = getBundleMaxBytes()

    const bundle = await _bundleWithFallback(
      gitRoot,
      bundlePath,
      maxBytes,
      hasWip,
      opts?.signal,
      opts?.baseRef,
    )

    if (!bundle.ok) {
      logForDebugging(`[gitBundle] ${bundle.error}`)
      logEvent('tengu_ccr_bundle_upload', {
        outcome:
          bundle.failReason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        max_bytes: maxBytes,
      })
      return {
        success: false,
        error: bundle.error,
        failReason: bundle.failReason,
      }
    }

    // Fixed relativePath so CCR can locate it.
    const upload = await uploadFile(bundlePath, '_source_seed.bundle', config, {
      signal: opts?.signal,
    })

    if (!upload.success) {
      logEvent('tengu_ccr_bundle_upload', {
        outcome:
          'failed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      return { success: false, error: upload.error }
    }

    logForDebugging(
      `[gitBundle] Uploaded ${upload.size} bytes as file_id ${upload.fileId}`,
    )
    logEvent('tengu_ccr_bundle_upload', {
      outcome:
        'success' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      size_bytes: upload.size,
      scope:
        bundle.scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      has_wip: hasWip,
    })
    return {
      success: true,
      fileId: upload.fileId,
      bundleSizeBytes: upload.size,
      scope: bundle.scope,
      hasWip,
    }
  } finally {
    try {
      await unlink(bundlePath)
    } catch {
      logForDebugging(`[gitBundle] Could not delete ${bundlePath} (non-fatal)`)
    }
    // Always delete — also sweeps a stale ref from a crashed prior run.
    // update-ref -d on a missing ref exits 0.
    for (const ref of ['refs/seed/stash', 'refs/seed/root']) {
      await execFileNoThrowWithCwd(gitExe(), ['update-ref', '-d', ref], {
        cwd: gitRoot,
      })
    }
  }
}
