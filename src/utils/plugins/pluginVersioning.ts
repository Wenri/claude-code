/**
 * Plugin Version Calculation Module
 *
 * Handles version calculation for plugins from various sources.
 * Versions are used for versioned cache paths and update detection.
 *
 * Version sources (in order of preference):
 * 1. Explicit version from plugin.json
 * 2. Git commit SHA (for git/github sources)
 * 3. Fallback timestamp for local sources
 */

import { createHash } from 'crypto'
import * as semver from 'semver'
import { logForDebugging } from '../debug.js'
import { isEnvTruthy } from '../envUtils.js'
import { execFileNoThrow } from '../execFileNoThrow.js'
import { getHeadForDir } from '../git/gitFilesystem.js'
import type { PluginManifest, PluginSource } from './schemas.js'

const GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
}

const GIT_SSH_ARGS = [
  '-c',
  'core.sshCommand=ssh -o BatchMode=yes -o StrictHostKeyChecking=yes',
]

const PLUGIN_VERSION_TAG_SEPARATOR = '--v'

export function makePluginVersionTag(
  pluginName: string,
  version: string,
): string {
  return `${pluginName}${PLUGIN_VERSION_TAG_SEPARATOR}${version}`
}

export type ResolvedGitTag = {
  version: string
  ref: string
  sha: string
}

/**
 * Calculate the version for a plugin based on its source.
 *
 * Version sources (in order of priority):
 * 1. plugin.json version field (highest priority)
 * 2. Provided version (typically from marketplace entry)
 * 3. Git commit SHA from install path
 * 4. 'unknown' as last resort
 *
 * @param pluginId - Plugin identifier (e.g., "plugin@marketplace")
 * @param source - Plugin source configuration (used for git-subdir path hashing)
 * @param manifest - Optional plugin manifest with version field
 * @param installPath - Optional path to installed plugin (for git SHA extraction)
 * @param providedVersion - Optional version from marketplace entry or caller
 * @param gitCommitSha - Optional pre-resolved git SHA (for sources like
 *   git-subdir where the clone is discarded and the install path has no .git)
 * @returns Version string (semver, short SHA, or 'unknown')
 */
export async function calculatePluginVersion(
  pluginId: string,
  source: PluginSource,
  manifest?: PluginManifest,
  installPath?: string,
  providedVersion?: string,
  gitCommitSha?: string,
): Promise<string> {
  // 1. Use explicit version from plugin.json if available
  if (manifest?.version) {
    logForDebugging(
      `Using manifest version for ${pluginId}: ${manifest.version}`,
    )
    return manifest.version
  }

  // 2. Use provided version (typically from marketplace entry)
  if (providedVersion) {
    logForDebugging(
      `Using provided version for ${pluginId}: ${providedVersion}`,
    )
    return providedVersion
  }

  // 3. Use pre-resolved git SHA if caller captured it before discarding the clone
  if (gitCommitSha) {
    const shortSha = gitCommitSha.substring(0, 12)
    if (typeof source === 'object' && source.source === 'git-subdir') {
      // Encode the subdir path in the version so cache keys differ when
      // marketplace.json's `path` changes but the monorepo SHA doesn't.
      // Without this, two plugins at different subdirs of the same commit
      // collide at cache/<m>/<p>/<sha>/ and serve each other's trees.
      //
      // Normalization MUST match the squashfs cron byte-for-byte:
      //   1. backslash → forward slash
      //   2. strip one leading `./`
      //   3. strip all trailing `/`
      //   4. UTF-8 sha256, first 8 hex chars
      // See api/…/plugins_official_squashfs/job.py _validate_subdir().
      const normPath = source.path
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\/+$/, '')
      const pathHash = createHash('sha256')
        .update(normPath)
        .digest('hex')
        .substring(0, 8)
      const v = `${shortSha}-${pathHash}`
      logForDebugging(
        `Using git-subdir SHA+path version for ${pluginId}: ${v} (path=${normPath})`,
      )
      return v
    }
    logForDebugging(`Using pre-resolved git SHA for ${pluginId}: ${shortSha}`)
    return shortSha
  }

  // 4. Try to get git SHA from install path
  if (installPath) {
    const sha = await getGitCommitSha(installPath)
    if (sha) {
      const shortSha = sha.substring(0, 12)
      logForDebugging(`Using git SHA for ${pluginId}: ${shortSha}`)
      return shortSha
    }
  }

  // 5. Return 'unknown' as last resort
  logForDebugging(`No version found for ${pluginId}, using 'unknown'`)
  return 'unknown'
}

/**
 * Get the git commit SHA for a directory.
 *
 * @param dirPath - Path to directory (should be a git repository)
 * @returns Full commit SHA or null if not a git repo
 */
export function getGitCommitSha(dirPath: string): Promise<string | null> {
  return getHeadForDir(dirPath)
}

function githubRepoToUrl(repo: string): string {
  return isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)
    ? `https://github.com/${repo}.git`
    : `git@github.com:${repo}.git`
}

/**
 * Return the remote URL used to resolve plugin-scoped version tags.
 * Non-git sources cannot satisfy git tag constraints.
 */
export function getGitUrlForVersionResolution(
  source: PluginSource,
): string | null {
  if (typeof source === 'string') return null
  switch (source.source) {
    case 'github':
      return githubRepoToUrl(source.repo)
    case 'url':
      return source.url
    case 'git-subdir':
      return /^[a-zA-Z0-9-_.]+\/[a-zA-Z0-9-_.]+$/.test(source.url)
        ? githubRepoToUrl(source.url)
        : source.url
    default:
      return null
  }
}

function isSafeGitUrl(url: string): boolean {
  if (/^git@[a-zA-Z0-9.-]+:/.test(url)) return true
  try {
    return ['https:', 'http:', 'file:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

/**
 * Resolve the highest plugin-scoped git tag satisfying a semver range.
 *
 * Plugin tags use `${pluginName}--v${version}`. Annotated tags produce two
 * ls-remote rows; the peeled `^{}` row wins so the returned SHA is the commit
 * rather than the tag object.
 */
export async function resolveVersionRange(
  gitUrl: string,
  pluginName: string,
  range: string,
  lookupCache?: Map<string, Promise<string>>,
): Promise<ResolvedGitTag | null> {
  if (!isSafeGitUrl(gitUrl)) {
    logForDebugging(`resolveVersionRange: rejected unsafe URL ${gitUrl}`)
    return null
  }

  let lookup = lookupCache?.get(gitUrl)
  if (lookup === undefined) {
    lookup = execFileNoThrow(
      'git',
      [...GIT_SSH_ARGS, 'ls-remote', '--tags', '--', gitUrl],
      { env: { ...process.env, ...GIT_ENV } },
    ).then(result =>
      result.code !== 0
        ? Promise.reject(new Error(`ls-remote exit ${result.code}`))
        : result.stdout,
    )
    lookupCache?.set(gitUrl, lookup)
  }

  let output: string
  try {
    output = await lookup
  } catch (error) {
    logForDebugging(
      `resolveVersionRange: ls-remote failed for ${gitUrl}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }

  const prefix = `${pluginName}${PLUGIN_VERSION_TAG_SEPARATOR}`
  const tags = new Map<string, ResolvedGitTag>()
  for (const line of output.split('\n')) {
    const separator = line.indexOf('\t')
    if (separator === -1) continue

    const sha = line.slice(0, separator)
    const remoteRef = line.slice(separator + 1)
    if (!remoteRef.startsWith('refs/tags/')) continue

    let tag = remoteRef.slice('refs/tags/'.length)
    const isPeeled = tag.endsWith('^{}')
    if (isPeeled) tag = tag.slice(0, -3)
    if (!tag.startsWith(prefix)) continue

    const version = semver.clean(tag.slice(prefix.length))
    if (version === null) continue
    if (!isPeeled && tags.has(tag)) continue
    tags.set(tag, { version, ref: tag, sha })
  }

  if (tags.size === 0) return null
  const candidates = [...tags.values()]
  const version = semver.maxSatisfying(
    candidates.map(candidate => candidate.version),
    range,
  )
  if (version === null) return null
  return candidates.find(candidate => candidate.version === version) ?? null
}

/**
 * Extract version from a versioned cache path.
 *
 * Given a path like `~/.claude/plugins/cache/marketplace/plugin/1.0.0`,
 * extracts and returns `1.0.0`.
 *
 * @param installPath - Full path to plugin installation
 * @returns Version string from path, or null if not a versioned path
 */
export function getVersionFromPath(installPath: string): string | null {
  // Versioned paths have format: .../plugins/cache/marketplace/plugin/version/
  const parts = installPath.split('/').filter(Boolean)

  // Find 'cache' index to determine depth
  const cacheIndex = parts.findIndex(
    (part, i) => part === 'cache' && parts[i - 1] === 'plugins',
  )

  if (cacheIndex === -1) {
    return null
  }

  // Versioned path has 3 components after 'cache': marketplace/plugin/version
  const componentsAfterCache = parts.slice(cacheIndex + 1)
  if (componentsAfterCache.length >= 3) {
    return componentsAfterCache[2] || null
  }

  return null
}

/**
 * Check if a path is a versioned plugin path.
 *
 * @param path - Path to check
 * @returns True if path follows versioned structure
 */
export function isVersionedPath(path: string): boolean {
  return getVersionFromPath(path) !== null
}
