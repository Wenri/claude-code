#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.122-to-2.1.123')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const draft = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'manifest.non-source-draft.json'), 'utf8'),
)
const freeze = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'freeze-index.json'), 'utf8'),
)
const specs = JSON.parse(
  fs.readFileSync(path.join(repo, 'recovery/2.1.123-direct-evidence-specs.json'), 'utf8'),
)
const provenance = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'evidence/provenance.json'), 'utf8'),
)
const wrapperMembers = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'package-members.json'), 'utf8'),
)
const platformMembers = JSON.parse(
  fs.readFileSync(
    path.join(caseRoot, 'binary-extraction/native-package-members.json'),
    'utf8',
  ),
)

assert(draft.schemaVersion === 4, 'draft schema')
assert(draft.case === '2.1.122-to-2.1.123', 'draft case')
assert(draft.releaseAdjacency.baseline === '2.1.122', 'draft baseline')
assert(draft.releaseAdjacency.target === '2.1.123', 'draft target')
assert(draft.recoveryScope.sourceClosurePending === true, 'source remains pending')
assert(draft.recoveryScope.semanticClosurePending === true, 'semantic proof remains pending')
assert(draft.generatedRecovery.attribution.unaccountedTargetUtf16 === 0,
  'generated attribution gap')
assert(draft.generatedRecovery.readableDiff.comparisonInvariantHashesEqual === true,
  'readable diff invariant')
assert(provenance.publicationAdjacency.targetIsNextPublishedVersion === true,
  'registry publication adjacency')
assert(provenance.publicationAdjacency.skippedVersionsAbsent === true,
  'registry skipped-version closure')
assert(provenance.git.immediateParentTagged === true, 'tag parent adjacency')
assert(provenance.git.previousReleaseCommit === provenance.git.parent,
  'tag parent is v2.1.122')
assert(provenance.git.commitsSincePreviousReleaseTag === 1,
  'one public commit between tags')
assert(
  JSON.stringify(provenance.git.publicDiff.paths) === JSON.stringify(['CHANGELOG.md']),
  'public tag diff is changelog-only',
)
for (const [label, report, metadata] of [
  ['wrapper', wrapperMembers, provenance.npm.wrapper],
  ['linux-x64', platformMembers, provenance.npm.linuxX64],
]) {
  assert(report.summary.complete === true, `${label}: complete tar inventory`)
  assert(report.artifacts.target.sha1 === metadata.registryShasum,
    `${label}: registry SHA-1`)
  assert(report.artifacts.target.integrity === metadata.registryIntegrity,
    `${label}: registry SHA-512`)
  assert(report.artifacts.target.sha256 === metadata.tarballSha256,
    `${label}: acquired SHA-256`)
  assert(report.artifacts.target.authentication.shasumVerified === true,
    `${label}: SHA-1 authenticated`)
  assert(report.artifacts.target.authentication.integrityVerified === true,
    `${label}: SHA-512 authenticated`)
  assert(report.artifacts.target.authentication.registrySignature.verified === true,
    `${label}: npm ECDSA signature authenticated`)
  assert(
    report.artifacts.target.authentication.registrySignature.keyId ===
      provenance.npm.registryKey.keyid,
    `${label}: live registry key identity`,
  )
}
assert(freeze.case === draft.case, 'freeze case')
assert(freeze.summary.files === freeze.files.length, 'freeze file count')
for (const entry of freeze.files) {
  const value = fs.readFileSync(path.join(caseRoot, entry.path))
  assert(value.length === entry.bytes, `${entry.path}: frozen bytes`)
  assert(sha256(value) === entry.sha256, `${entry.path}: frozen SHA-256`)
}
assert(specs.case === draft.case, 'spec case')
assert(specs.release === '2.1.123', 'spec release')
assert(specs.complete === false, 'provisional specs must fail closed')
assert(specs.rows.length === 1, 'the official row is provisionally enumerated')
assert(specs.rows[0].id === 'B01' && specs.rows[0].category === 'official',
  'the provisional catalog contains exactly official row B01')
assert(specs.rows.every(row => row.status === 'pending-source-recovery'),
  'no provisional row may claim verification')
assert(
  !fs.existsSync(path.join(caseRoot, 'manifest.json')) &&
    !fs.existsSync(path.join(caseRoot, 'semantic/direct-evidence.json')),
  'provisional checkpoint must not contain final proof outputs',
)

console.log(JSON.stringify({
  status: '2.1.123-provisional-proof-state-verified',
  frozenFiles: freeze.summary.files,
  officialRows: specs.rows.length,
  sourceClosurePending: true,
  semanticClosurePending: true,
}))
