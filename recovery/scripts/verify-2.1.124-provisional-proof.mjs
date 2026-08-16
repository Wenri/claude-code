#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.123-to-2.1.124')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function pinnedCaseEvidence(record, label) {
  assert(
    record &&
      typeof record.path === 'string' &&
      record.path.startsWith('evidence/') &&
      !record.path.split('/').some(
        part => part === '' || part === '.' || part === '..',
      ),
    `${label}: unsafe evidence path`,
  )
  const filename = path.join(caseRoot, record.path)
  const status = fs.lstatSync(filename)
  assert(
    status.isFile() && !status.isSymbolicLink(),
    `${label}: expected a regular file`,
  )
  const value = fs.readFileSync(filename)
  assert(value.length === record.bytes, `${label}: byte length`)
  assert(sha256(value) === record.sha256, `${label}: SHA-256`)
  return value
}

const draft = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'manifest.non-source-draft.json'), 'utf8'),
)
const freeze = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'freeze-index.json'), 'utf8'),
)
const specs = JSON.parse(
  fs.readFileSync(path.join(repo, 'recovery/2.1.124-direct-evidence-specs.json'), 'utf8'),
)
const provenance = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'evidence/provenance.json'), 'utf8'),
)
const releaseAbsencePath = path.join(
  caseRoot,
  'evidence/RELEASE-2.1.124-ABSENCE.json',
)
const releaseAbsenceBytes = fs.readFileSync(releaseAbsencePath)
const releaseAbsence = JSON.parse(releaseAbsenceBytes)
const wrapperMembers = JSON.parse(
  fs.readFileSync(path.join(caseRoot, 'package-members.json'), 'utf8'),
)
const platformMembers = JSON.parse(
  fs.readFileSync(
    path.join(caseRoot, 'binary-extraction/native-package-members.json'),
    'utf8',
  ),
)
const knownDeltaProofRecord = draft.generatedRecovery?.structural?.knownDeltaProof
assert(
  knownDeltaProofRecord?.path === 'structural/known-delta-proof.json',
  'known-delta proof path',
)
const knownDeltaProofBytes = fs.readFileSync(
  path.join(caseRoot, knownDeltaProofRecord.path),
)
assert(
  knownDeltaProofBytes.length === knownDeltaProofRecord.bytes &&
    sha256(knownDeltaProofBytes) === knownDeltaProofRecord.sha256,
  'known-delta proof identity',
)
const knownDeltaProof = JSON.parse(knownDeltaProofBytes)
const semanticClusterInventory = knownDeltaProof.knownDelta?.clusterInventory
assert(
  semanticClusterInventory?.schemaVersion === 1 &&
    semanticClusterInventory.totalClusters === 205 &&
    Array.isArray(semanticClusterInventory.direct) &&
    Array.isArray(semanticClusterInventory.accountingOnly),
  'semantic cluster inventory identity',
)
const semanticClusterIds = [
  ...semanticClusterInventory.direct.flatMap(entry => entry.clusterIds),
  ...semanticClusterInventory.accountingOnly.flatMap(entry => entry.clusterIds),
].sort((left, right) => left - right)

assert(draft.schemaVersion === 4, 'draft schema')
assert(draft.case === '2.1.123-to-2.1.124', 'draft case')
assert(draft.releaseAdjacency.baseline === '2.1.123', 'draft baseline')
assert(draft.releaseAdjacency.target === '2.1.124', 'draft target')
assert(
  draft.releaseAdjacency.publicGitReleaseTagPresent === false &&
    draft.releaseAdjacency.publicChangelogSectionPresent === false &&
    draft.releaseAdjacency.publicReleaseAbsence ===
      'evidence/RELEASE-2.1.124-ABSENCE.json',
  'draft public-release absence binding',
)
assert(draft.recoveryScope.sourceClosurePending === true, 'source remains pending')
assert(draft.recoveryScope.semanticClosurePending === true, 'semantic proof remains pending')
assert(draft.generatedRecovery.attribution.unaccountedTargetUtf16 === 0,
  'generated attribution gap')
assert(draft.generatedRecovery.readableDiff.comparisonInvariantHashesEqual === true,
  'readable diff invariant')
assert(
  knownDeltaProof.complete === true &&
    knownDeltaProof.case === draft.case &&
    knownDeltaProof.release === '2.1.124' &&
    semanticClusterInventory?.schemaVersion === 1 &&
    semanticClusterInventory.totalClusters === 205 &&
    new Set(semanticClusterIds).size === 205 &&
    JSON.stringify(semanticClusterIds) === JSON.stringify(
      Array.from({ length: 205 }, (_, index) => index + 1),
    ) &&
    draft.generatedRecovery.structural.semanticClusterInventory
      ?.totalClusters === 205 &&
    draft.generatedRecovery.structural.semanticClusterInventory?.status ===
      'complete-partition-source-bindings-pending',
  'complete provisional semantic cluster partition',
)
assert(provenance.publicationAdjacency.targetIsNextPublishedVersion === true,
  'registry publication adjacency')
assert(provenance.publicationAdjacency.skippedVersionsAbsent === true,
  'registry skipped-version closure')
assert(
  provenance.publicReleaseAbsence?.path ===
      'evidence/RELEASE-2.1.124-ABSENCE.json' &&
    provenance.publicReleaseAbsence?.bytes === releaseAbsenceBytes.length &&
    provenance.publicReleaseAbsence?.sha256 === sha256(releaseAbsenceBytes) &&
    JSON.stringify(provenance.publicReleaseAbsence?.tag) ===
      JSON.stringify(releaseAbsence.tag) &&
    JSON.stringify(provenance.publicReleaseAbsence?.changelog) ===
      JSON.stringify(releaseAbsence.changelog),
  'provenance pins exact public-release absence evidence',
)
assert(
  releaseAbsence.schemaVersion === 1 &&
    releaseAbsence.kind === 'authenticated-public-release-absence' &&
    releaseAbsence.release === '2.1.124' &&
    releaseAbsence.tag?.name === 'v2.1.124' &&
    releaseAbsence.tag?.present === false &&
    releaseAbsence.changelog?.heading === '## 2.1.124' &&
    releaseAbsence.changelog?.present === false &&
    releaseAbsence.changelog?.bulletCount === 0,
  'authenticated public GitHub release absence',
)
const tagRefs = pinnedCaseEvidence(
  releaseAbsence.tag.refs,
  'public Git tag refs',
).toString('utf8')
const fullChangelog = pinnedCaseEvidence(
  releaseAbsence.changelog.fullSnapshot,
  'full public changelog',
).toString('utf8')
assert(
  !tagRefs.split('\n').some(
    line =>
      line.endsWith('\trefs/tags/v2.1.124') ||
      line.endsWith('\trefs/tags/v2.1.124^{}'),
  ),
  'v2.1.124 tag is absent from pinned refs',
)
assert(
  !fullChangelog.split(/\r?\n/).includes('## 2.1.124'),
  '2.1.124 heading is absent from pinned changelog',
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
assert(specs.release === '2.1.124', 'spec release')
assert(specs.complete === false, 'provisional specs must fail closed')
assert(specs.rows.length === 0, 'zero official rows are provisionally enumerated')
assert(specs.rows.every(row => row.status === 'pending-source-recovery'),
  'no provisional row may claim verification')
assert(
  !fs.existsSync(path.join(caseRoot, 'manifest.json')) &&
    !fs.existsSync(path.join(caseRoot, 'semantic/direct-evidence.json')),
  'provisional checkpoint must not contain final proof outputs',
)

console.log(JSON.stringify({
  status: '2.1.124-provisional-proof-state-verified',
  frozenFiles: freeze.summary.files,
  officialRows: 0,
  sourceClosurePending: true,
  semanticClosurePending: true,
}))
