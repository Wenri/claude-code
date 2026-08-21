import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget118OAuthProfileReplay,
  TARGET118_OAUTH_PROFILE_OWNER_OVERRIDES,
  TARGET118_OAUTH_PROFILE_REPLAY,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-oauth-profile-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, 'recovery/test/recovery-2.1.118-oauth-profile-source-gap.json'),
    'utf8',
  ),
)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function gitBlob(commit, filename) {
  const result = spawnSync('git', ['show', `${commit}:${filename}`], {
    cwd: root,
    encoding: null,
    maxBuffer: 4 * 1024 * 1024,
  })
  assert.equal(result.status, 0, String(result.stderr))
  return Buffer.from(result.stdout)
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
}

test('Target118 OAuth profile fixture and replay contract are exact', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  assert.equal(fixture.summary.units, 9)
  assert.equal(fixture.summary.residues, 53)
  assert.equal(fixture.summary.ownerFiles, 2)
  assert.equal(new Set(fixture.rows.map(row => row.targetIndex)).size, 9)
  assert.equal(
    sha256(JSON.stringify(fixture.rows.map(row => row.targetIndex))),
    fixture.summary.indicesSha256,
  )
  assert.equal(
    sha256(JSON.stringify(fixture.rows.flatMap(row => row.residues))),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    TARGET118_OAUTH_PROFILE_OWNER_OVERRIDES.map(row => row.targetIndex),
    fixture.rows.map(row => row.targetIndex),
  )
  assert.deepEqual(TARGET118_OAUTH_PROFILE_REPLAY.files, fixture.inputs.files)
})

test('authenticated Target118 bundle pins every OAuth profile unit and residue', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const bundle = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(bundle), fixture.inputs.targetBundle)
  for (const row of fixture.rows) {
    const slice = bundle.subarray(row.target.start, row.target.end)
    assert.equal(slice.length, row.target.bytes, `u${row.targetIndex}: bytes`)
    assert.equal(sha256(slice), row.target.sourceHash, `u${row.targetIndex}: hash`)
    for (const residue of row.residues) {
      const [, , start, end] = residue
      assert(start >= row.target.start, `u${row.targetIndex}: residue start`)
      assert(end <= row.target.end, `u${row.targetIndex}: residue end`)
    }
  }
})

test('bounded Target119 source recovery exactly restores Target118 OAuth behavior', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'target118-oauth-'))
  try {
    for (const expected of fixture.inputs.files) {
      const filename = path.join(temporary, expected.path)
      fs.mkdirSync(path.dirname(filename), { recursive: true })
      const raw = gitBlob(
        'bd846a24e3886322888f02b9f747c132a4a32314',
        expected.path,
      )
      assert.deepEqual(descriptor(raw), expected.before)
      fs.writeFileSync(filename, raw)
    }
    const first = applyTarget118OAuthProfileReplay({ sourceRoot: temporary })
    assert.equal(first.state, 'recovered')
    assert.deepEqual(first.changes.sort(), fixture.inputs.files.map(row => row.path).sort())
    for (const expected of fixture.inputs.files) {
      const value = fs.readFileSync(path.join(temporary, expected.path))
      assert.deepEqual(descriptor(value), expected.after)
    }
    assert.deepEqual(applyTarget118OAuthProfileReplay({ sourceRoot: temporary }), {
      state: 'already-recovered',
      changes: [],
    })

    const oauth = fs.readFileSync(
      path.join(temporary, 'src/services/oauth/client.ts'),
      'utf8',
    )
    for (const declaration of [
      'export async function refreshOAuthToken(',
      'export async function fetchProfileInfo(',
      'export async function populateOAuthAccountInfoIfNeeded(',
      'export function storeOAuthAccountInfo(',
    ]) {
      assert(oauth.includes(declaration), declaration)
    }
    for (const marker of [
      'ccOnboardingFlags',
      'claudeCodeTrialEndsAt',
      'claudeCodeTrialDurationDays',
      'JSON.stringify(current.oauthAccount?.ccOnboardingFlags)',
      'oauthAccount: { ...current.oauthAccount, ...accountInfo }',
    ]) {
      assert(oauth.includes(marker), marker)
    }
    const auth = fs.readFileSync(
      path.join(temporary, 'src/cli/handlers/auth.ts'),
      'utf8',
    )
    assert(auth.includes('export async function installOAuthTokens('))
    assert(auth.includes('profile.organization.cc_onboarding_flags ?? {}'))
    assert(auth.includes('profile.organization.claude_code_trial_ends_at ?? null'))
    assert(
      auth.includes(
        'profile.organization.claude_code_trial_duration_days ?? null',
      ),
    )
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('Target118 OAuth source root and coverage are exact recovered postimages', () => {
  const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  if (sourceRoot) {
    for (const expected of fixture.inputs.files) {
      const filename = path.join(sourceRoot, expected.path.replace(/^src\//, ''))
      assert.deepEqual(descriptor(fs.readFileSync(filename)), expected.after, expected.path)
    }
    assert.deepEqual(applyTarget118OAuthProfileReplay({ sourceRoot }), {
      state: 'already-recovered',
      changes: [],
    })
  }

  const coverage = readCoverage()
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  for (const expected of TARGET118_OAUTH_PROFILE_OWNER_OVERRIDES) {
    const row = rows.get(expected.targetIndex)
    assert(row, `missing coverage u${expected.targetIndex}`)
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.deepEqual(row.ownerIds.map(id => owners.get(id)), [...expected.paths])
    for (const evidenceId of expected.evidenceIds) {
      assert(row.evidenceIds.includes(evidenceId), `u${expected.targetIndex}:${evidenceId}`)
    }
  }
})
