import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const CASE_NAME = '2.1.117-to-2.1.118'
const RECOVERED_SOURCE_COMMIT = '351cd4d13f70a564dc2d90f59ab0093dc6fc7b05'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-oauth-profile-source-gap-target-fragment'
const SOURCE_REPLAY_EVIDENCE =
  'target118-oauth-profile-source-gap-source-replay-test'

const FILES = Object.freeze([
  Object.freeze({
    path: 'src/services/oauth/client.ts',
    before: Object.freeze({
      bytes: 18466,
      sha256: 'a235e3ddcecd93b34ddc7791f81df3e6d90a17f323e1b840160f05ba063f2cce',
    }),
    after: Object.freeze({
      bytes: 20355,
      sha256: '0fa1702b5bb443c42920f0c13e4193ca0d5b8d872c207be94b8dae6b7165ab68',
    }),
  }),
  Object.freeze({
    path: 'src/cli/handlers/auth.ts',
    before: Object.freeze({
      bytes: 11377,
      sha256: '6c35b4d8bc1305ac10ff600903a04415c4db194d03dcbd61a4fead8eaaadbf42',
    }),
    after: Object.freeze({
      bytes: 11648,
      sha256: 'ceca43bde473b754d807ad1a8ab45ebdda415b6e1528be87768da2ffdd91b2ef',
    }),
  }),
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function resolveSourceRoot(root) {
  const absolute = path.resolve(root)
  if (fs.existsSync(path.join(absolute, 'services/oauth/client.ts'))) {
    return absolute
  }
  if (fs.existsSync(path.join(absolute, 'src/services/oauth/client.ts'))) {
    return path.join(absolute, 'src')
  }
  throw new Error('Target118 OAuth replay source root is missing src/services/oauth/client.ts')
}

function readRecoveredBlob(file) {
  const result = spawnSync(
    'git',
    ['show', `${RECOVERED_SOURCE_COMMIT}:${file.path}`],
    { cwd: process.cwd(), encoding: null, maxBuffer: 4 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    throw new Error(
      `cannot read pinned Target119 recovery blob ${file.path}: ${String(result.stderr)}`,
    )
  }
  const value = Buffer.from(result.stdout)
  const actual = descriptor(value)
  if (
    actual.bytes !== file.after.bytes ||
    actual.sha256 !== file.after.sha256
  ) {
    throw new Error(`pinned Target119 recovery blob differs for ${file.path}`)
  }
  return value
}

export const TARGET118_OAUTH_PROFILE_REPLAY = Object.freeze({
  case: CASE_NAME,
  sourceCommit: RECOVERED_SOURCE_COMMIT,
  files: FILES,
})

function override(targetIndex, ownerPath, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([ownerPath]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_REPLAY_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET118_OAUTH_PROFILE_OWNER_OVERRIDES = Object.freeze([
  ...[4012, 4016, 4018, 4019, 4020, 4022, 4026, 4033].map(targetIndex =>
    override(
      targetIndex,
      'src/services/oauth/client.ts',
      'The authenticated Target118 OAuth unit belongs to the recovered profile/onboarding account graph, including onboarding flags, trial metadata, profile-source selection, error telemetry, persistence, and equality checks.',
    ),
  ),
  override(
    11686,
    'src/cli/handlers/auth.ts',
    'The authenticated Target118 auth-handler unit persists onboarding flags and trial metadata from the OAuth profile when installing tokens.',
  ),
])

export function applyTarget118OAuthProfileReplay({ sourceRoot }) {
  const resolved = resolveSourceRoot(sourceRoot)
  const states = FILES.map(file => {
    const filename = path.join(resolved, file.path.replace(/^src\//, ''))
    const value = fs.readFileSync(filename)
    const actual = descriptor(value)
    const state =
      actual.bytes === file.before.bytes && actual.sha256 === file.before.sha256
        ? 'before'
        : actual.bytes === file.after.bytes && actual.sha256 === file.after.sha256
          ? 'after'
          : 'unknown'
    return { file, filename, actual, state }
  })
  if (states.every(item => item.state === 'after')) {
    return { state: 'already-recovered', changes: [] }
  }
  if (!states.every(item => item.state === 'before')) {
    throw new Error(
      `Target118 OAuth replay requires one atomic pinned state: ${states
        .map(item => `${item.file.path}=${item.state}:${item.actual.sha256}`)
        .join(', ')}`,
    )
  }
  const writes = states.map(item => ({
    ...item,
    value: readRecoveredBlob(item.file),
  }))
  for (const item of writes) fs.writeFileSync(item.filename, item.value)
  return {
    state: 'recovered',
    changes: writes.map(item => item.file.path),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sourceRoot = process.argv[2]
  if (!sourceRoot) {
    throw new Error('usage: replay-oauth-profile-source-gap.mjs <tree-or-src-root>')
  }
  process.stdout.write(
    `${JSON.stringify(applyTarget118OAuthProfileReplay({ sourceRoot }))}\n`,
  )
}
