import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))

const BASELINE_BYTES = 13_720_987
const BASELINE_SHA256 =
  '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef'
const TARGET_BYTES = 13_784_743
const TARGET_SHA256 =
  'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function loadBundle(environmentNames, expectedBytes, expectedSha256) {
  const filename = environmentNames
    .map(name => process.env[name])
    .find(Boolean)
  assert.ok(filename, `${environmentNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expectedBytes, `${filename}: byte length`)
  assert.equal(sha256(bytes), expectedSha256, `${filename}: SHA-256`)
  return bytes.toString('utf8')
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function assertSourceFragments(relativePath, fragments) {
  const contents = compact(source(relativePath))
  for (const fragment of fragments) {
    assert.equal(
      contents.includes(compact(fragment)),
      true,
      `${relativePath}: ${fragment}`,
    )
  }
}

test('authenticates inherited team-memory semantics in both adjacent bundles', () => {
  const baseline = loadBundle(
    ['CLAUDE_CODE_2_1_119_BUNDLE', 'CLAUDE_2_1_119_CLI_INNER'],
    BASELINE_BYTES,
    BASELINE_SHA256,
  )
  const target = loadBundle(
    ['CLAUDE_CODE_2_1_120_BUNDLE', 'CLAUDE_2_1_120_CLI_INNER'],
    TARGET_BYTES,
    TARGET_SHA256,
  )

  const inheritedWitnesses = [
    ['soft-delete request field', 'soft_delete_keys', 1],
    ['server tombstone response field', 'deletedEntries', 7],
    ['soft-delete telemetry', 'files_soft_deleted', 1],
    ['tombstone-reap telemetry', 'files_reaped', 2],
    ['server error-code telemetry', 'server_error_code', 3],
    ['session tombstone state', 'tombstonedKeys', 5],
    ['trusted disk guard', 'diskTrusted', 3],
    ['initial reap telemetry', 'initial_files_reaped', 1],
    ['group ACL suppression', 'team_memory_group_acl_denied', 1],
    ['unlink recovery guidance', 'recoverable via file deletion', 1],
    [
      'inaccessible-directory safeguard',
      'team-memory-sync: team dir inaccessible \\u2014 suppressing soft-delete',
      1,
    ],
    ['tombstone reap failure', 'failed to reap tombstoned', 1],
    ['404 structured code', '404, code=', 1],
  ]

  for (const [name, fragment, expectedCount] of inheritedWitnesses) {
    assert.equal(
      occurrences(baseline, fragment),
      expectedCount,
      `${name}: 2.1.119`,
    )
    assert.equal(
      occurrences(target, fragment),
      expectedCount,
      `${name}: 2.1.120`,
    )
  }
})

test('recovers the response schema, repo-bound state, and bounded server errors', () => {
  assertSourceFragments('src/services/teamMemorySync/types.ts', [
    'deletedEntries: z.record(z.string(), z.number()).optional()',
    'export const TeamMemoryErrorSchema',
    'serverMessage?: string',
    'serverErrorCode?: string',
    'serverErrorType?: string',
    'filesSoftDeleted?: number',
  ])
  assertSourceFragments('src/services/teamMemorySync/index.ts', [
    'const MAX_SERVER_ERROR_FIELD_LENGTH = 256',
    'export function createSyncState(repoSlug: string)',
    'repoSlug, lastKnownChecksum: null',
    'pulled: false',
    'tombstonedKeys: new Set()',
    'function extractServerErrorMetadata(data: unknown)',
    'truncateServerErrorField(serverError.message)',
    'truncateServerErrorField(serverError.type)',
    'extractAxiosServerErrorMetadata(error)',
    "status === 403 ? 'forbidden' : 'auth'",
    '404, code=${serverErrorCode ?? \'none\'}',
  ])
})

test('recovers trusted soft deletion, tombstone reaping, and conflict convergence', () => {
  assertSourceFragments('src/services/teamMemorySync/index.ts', [
    "entry.name.startsWith('.')",
    "entry.name.endsWith('.md')",
    "entry.name.endsWith('.txt')",
    'diskKeys.add(relPath)',
    "if (code === 'EACCES' || code === 'EPERM') diskTrusted = false",
    'body.soft_delete_keys = [...softDeleteKeys]',
    'async function reapRemoteTombstones',
    'await unlink(validatedPath)',
    'const filesReaped = await reapRemoteTombstones(deletedEntries)',
    'state.tombstonedKeys = new Set(Object.keys(deletedEntries))',
    'for (const key of unwrittenKeys) state.serverChecksums.delete(key)',
    'state.pulled = true',
    'const repoSlug = state.repoSlug',
    'if (state.pulled && diskTrusted)',
    'if (!diskKeys.has(key)) softDeleteKeys.push(key)',
    'if (state.tombstonedKeys.has(key)) continue',
    'if (deltaCount === 0 && softDeleteKeys.length === 0)',
    'if (batches.length === 0) batches.push({})',
    'const batchSoftDeleteKeys = batchIndex === 0 ? softDeleteKeys : []',
    'filesSoftDeleted += batchSoftDeleteKeys.length',
    'const previouslyKnownServerKeys = new Set(state.serverChecksums.keys())',
    'previouslyKnownServerKeys.has(key) || diskKeys.has(key)',
    'localHashes.delete(key)',
    'state.tombstonedKeys.add(key)',
    'files_reaped: outcome.filesReaped',
    'files_soft_deleted: outcome.filesSoftDeleted',
    'server_error_code:',
    'server_message:',
    'server_error_type:',
  ])

  const index = source('src/services/teamMemorySync/index.ts')
  assert.equal(index.includes('File deletions do NOT propagate'), false)
  assert.equal(index.includes('const repoSlug = await getGithubRepo()'), false)
})

test('recovers watcher ownership, reap reporting, and safe suppression', () => {
  assertSourceFragments('src/services/teamMemorySync/watcher.ts', [
    "export const UNLINK_RECOVERABLE_REASONS = new Set([ 'http_413', 'team_memory_too_many_entries', ])",
    'pushSuppressedReason = result.serverErrorCode ??',
    "result.serverErrorCode === 'team_memory_group_acl_denied'",
    "result.serverErrorCode === 'team_memory_group_acl_unconfigured'",
    "'Team memory is restricted to specific groups for your organization.'",
    "? ' (recoverable via file deletion)'",
    'if (!UNLINK_RECOVERABLE_REASONS.has(pushSuppressedReason)) return',
    'syncState = createSyncState(repoSlug)',
    'pullResult.filesWritten > 0 || pullResult.filesReaped > 0',
    'initialFilesReaped = pullResult.filesReaped',
    'initial_files_reaped: initialFilesReaped',
    'server_message:',
    'server_error_code:',
    'server_error_type:',
  ])
})
