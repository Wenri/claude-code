#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.123-to-2.1.124')
const semanticRoot = path.join(caseRoot, 'semantic')
const outputPath = path.join(semanticRoot, 'obligations.json')
const directEvidencePath = path.join(semanticRoot, 'direct-evidence.json')
const knownDeltaProofPath = path.join(
  caseRoot,
  'structural/known-delta-proof.json',
)
const provenancePath = path.join(caseRoot, 'evidence/provenance.json')
const releaseAbsencePath = path.join(
  caseRoot,
  'evidence/RELEASE-2.1.124-ABSENCE.json',
)
const directTestPath = path.join(
  repo,
  'recovery/test/recovery-2.1.124-direct-evidence.test.mjs',
)
const focusedTestPaths = Object.fromEntries(
  fs
    .readdirSync(path.join(repo, 'recovery/test'))
    .filter(
      name =>
        /^recovery-2\.1\.124-.*\.test\.mjs$/.test(name) &&
        name !== 'recovery-2.1.124-direct-evidence.test.mjs',
    )
    .sort()
    .map(name => [
      name
        .replace(/^recovery-2\.1\.124-/, '')
        .replace(/\.test\.mjs$/, ''),
      path.join(repo, 'recovery/test', name),
    ]),
)
if (!Object.hasOwn(focusedTestPaths, 'semantic-delta')) {
  throw new Error('focused tests must include semantic delta')
}
const sourcePathsPath = path.join(
  caseRoot,
  'recovered/source-freeze/source-paths.txt',
)
const baseCommit = '338d170737e8294c489481bc2e8fac52d8ce5f85'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function gitBlobSha1(value) {
  return crypto
    .createHash('sha1')
    .update(`blob ${value.length}\0`)
    .update(value)
    .digest('hex')
}

function occurrences(contents, fragment) {
  assert(fragment.length > 0, 'cannot count an empty fragment')
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function metadata(filename) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(repo, filename),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function sameCaseEvidencePath(relative, label) {
  assert(
    typeof relative === 'string' &&
      relative.startsWith('evidence/') &&
      !relative.split('/').some(part => part === '' || part === '.' || part === '..'),
    `${label}: unsafe case-relative evidence path`,
  )
  const filename = path.join(caseRoot, relative)
  const status = fs.lstatSync(filename)
  assert(
    status.isFile() && !status.isSymbolicLink(),
    `${label}: evidence must be a regular file`,
  )
  return filename
}

function changedSourcePaths() {
  if (fs.existsSync(sourcePathsPath)) {
    const lines = fs
      .readFileSync(sourcePathsPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
    return new Set(lines.map(line => line.split('\t').at(-1)))
  }
  const value = execFileSync(
    'git',
    ['diff', '--name-only', `${baseCommit}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
  return new Set(value.trim().split('\n').filter(Boolean))
}

const directEvidence = JSON.parse(fs.readFileSync(directEvidencePath, 'utf8'))
const directEvidenceMetadata = metadata(directEvidencePath)
const knownDeltaProof = JSON.parse(fs.readFileSync(knownDeltaProofPath, 'utf8'))
const knownDeltaProofMetadata = metadata(knownDeltaProofPath)
const clusterInventory = knownDeltaProof.knownDelta?.clusterInventory
const changedPaths = changedSourcePaths()
const directIds = directEvidence.rows.map(row => row.id)
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
const releaseAbsence = JSON.parse(fs.readFileSync(releaseAbsencePath, 'utf8'))
const fullChangelogPath = sameCaseEvidencePath(
  releaseAbsence.changelog?.fullSnapshot?.path,
  'full public changelog',
)
const tagRefsPath = sameCaseEvidencePath(
  releaseAbsence.tag?.refs?.path,
  'public Git tag refs',
)
const fullChangelog = fs.readFileSync(fullChangelogPath)

assert(directEvidence.schemaVersion === 1, 'direct evidence schema')
assert(directEvidence.release === '2.1.124', 'direct evidence release')
assert(directEvidence.rows.length === directEvidence.rowCount, 'direct rows')
assert(new Set(directIds).size === directIds.length, 'unique direct row IDs')
assert(
  JSON.stringify(Object.keys(focusedTestPaths)) ===
    JSON.stringify(
      [...new Set(directEvidence.rows.flatMap(row => row.focusedTests))].sort(),
    ),
  'focused test files differ from exact direct-evidence bindings',
)
assert(
  directEvidence.categoryCounts.official === undefined &&
    directEvidence.rows.every(row => row.category !== 'official'),
  'hidden-only direct-evidence category partition',
)
assert(directEvidence.changedSourcePathCount > 0, 'changed source paths')
assert(directEvidence.rowCount > 0, 'hidden direct evidence rows')
assert(
  knownDeltaProof.schemaVersion === 1 &&
    knownDeltaProof.case === '2.1.123-to-2.1.124' &&
    knownDeltaProof.release === '2.1.124' &&
    knownDeltaProof.complete === true &&
    clusterInventory?.schemaVersion === 1 &&
    clusterInventory.totalClusters === 205 &&
    Array.isArray(clusterInventory.direct) &&
    Array.isArray(clusterInventory.accountingOnly),
  'known-delta semantic cluster inventory',
)
const allClusterIds = [
  ...clusterInventory.direct.flatMap(entry => entry.clusterIds),
  ...clusterInventory.accountingOnly.flatMap(entry => entry.clusterIds),
].sort((left, right) => left - right)
assert(
  new Set(allClusterIds).size === 205 &&
    JSON.stringify(allClusterIds) === JSON.stringify(
      Array.from({ length: 205 }, (_, index) => index + 1),
    ),
  'semantic cluster partition is exactly 1..205',
)
assert(
  directEvidence.inputs.some(entry =>
    JSON.stringify(entry) === JSON.stringify(knownDeltaProofMetadata)) &&
    JSON.stringify(directEvidence.clusterInventory?.proof) ===
      JSON.stringify(knownDeltaProofMetadata) &&
    directEvidence.clusterInventory?.totalClusters === 205,
  'direct evidence pins the known-delta cluster inventory',
)
const clusterByRowId = new Map(
  clusterInventory.direct.map(entry => [entry.rowId, entry]),
)
assert(clusterByRowId.size === clusterInventory.direct.length,
  'unique semantic cluster row IDs')
assert(
  JSON.stringify([...clusterByRowId.keys()].sort()) ===
    JSON.stringify(directIds.slice().sort()),
  'semantic cluster rows and direct evidence rows differ',
)
for (const row of directEvidence.rows) {
  const semantic = clusterByRowId.get(row.id)
  assert(
    JSON.stringify(row.semanticClusterIds) ===
        JSON.stringify(semantic.clusterIds) &&
      JSON.stringify(row.semanticClusterBindings) ===
        JSON.stringify(semantic.clusterBindings) &&
      JSON.stringify(row.semanticTargetWitnesses) ===
        JSON.stringify(semantic.targetWitnesses),
    `${row.id}: semantic cluster binding`,
  )
}
assert(
  provenance.schemaVersion === 1 &&
    provenance.release === '2.1.124' &&
    provenance.publicReleaseAbsence?.path ===
      path.relative(caseRoot, releaseAbsencePath).replaceAll('\\', '/') &&
    provenance.publicReleaseAbsence?.bytes ===
      fs.statSync(releaseAbsencePath).size &&
    provenance.publicReleaseAbsence?.sha256 ===
      sha256(fs.readFileSync(releaseAbsencePath)) &&
    JSON.stringify(provenance.publicReleaseAbsence?.tag) ===
      JSON.stringify(releaseAbsence.tag) &&
    JSON.stringify(provenance.publicReleaseAbsence?.changelog) ===
      JSON.stringify(releaseAbsence.changelog),
  'public-release absence provenance',
)
assert(
  releaseAbsence.schemaVersion === 1 &&
    releaseAbsence.kind === 'authenticated-public-release-absence' &&
    releaseAbsence.release === '2.1.124' &&
    releaseAbsence.tag?.name === 'v2.1.124' &&
    releaseAbsence.tag?.present === false &&
    releaseAbsence.changelog?.heading === '## 2.1.124' &&
    releaseAbsence.changelog?.present === false &&
    releaseAbsence.changelog?.bulletCount === 0 &&
    occurrences(fullChangelog.toString('utf8'), '## 2.1.124') === 0,
  'authenticated public-release absence witness',
)

const testMetadata = metadata(directTestPath)
const testSource = fs.readFileSync(directTestPath, 'utf8')
assert(
  testSource.includes(directEvidenceMetadata.sha256),
  'direct test must pin the direct catalog SHA-256',
)
assert(
  testSource.replaceAll('_', '').includes(String(directEvidenceMetadata.bytes)),
  'direct test must pin the direct catalog byte length',
)

function sourceRemovals(row) {
  return row.sourcePathAbsences.flatMap(absence =>
    absence.paths.map(sourcePath => ({
      path: sourcePath,
      fragment: absence.fragment,
      sha256: absence.sha256,
    })),
  )
}

function obligation(row) {
  const adjacent = row.targetFragments.some(
    fragment => fragment.baselineCount !== fragment.targetCount,
  )
  const removals = sourceRemovals(row)
  const fileAbsences = row.sourceFileAbsences ?? []
  const assertedPaths = new Set([
    ...row.sourceAssertions.map(entry => entry.path),
    ...removals.map(entry => entry.path),
    ...fileAbsences.map(entry => entry.path),
  ])
  const retainedSourcePaths = [...assertedPaths]
    .filter(sourcePath => !changedPaths.has(sourcePath))
    .sort()
  return {
    id: row.obligationId,
    classification: adjacent
      ? 'source-localized-adjacent'
      : 'source-localized-inherited',
    releaseBullets:
      row.category === 'official' ? [row.releaseBullet] : [],
    category: row.category,
    ...(row.category !== 'official' ? { hidden: true } : {}),
    rationale: `${row.id}: ${row.rationale}`,
    targetFragments: row.targetFragments,
    ...(row.targetAbsences.length > 0
      ? { targetAbsences: row.targetAbsences }
      : {}),
    sourceAssertions: row.sourceAssertions,
    sourceAbsences: row.sourceAbsences ?? [],
    ...(removals.length > 0 ? { sourceRemovals: removals } : {}),
    ...(fileAbsences.length > 0 ? { sourceFileAbsences: fileAbsences } : {}),
    testIds: ['adjacent', ...(row.focusedTests ?? [])],
    catalogBinding: {
      ...directEvidenceMetadata,
      rawId: row.id,
      rowSha256: sha256(Buffer.from(JSON.stringify(row))),
      kind: row.evidenceKind,
    },
    semanticClusterIds: row.semanticClusterIds,
    semanticClusterBindings: row.semanticClusterBindings,
    localizationBasis: 'authenticated-behavior-test',
    localizationBoundary:
      'The pinned direct-evidence test loads this exact catalog identity and verifies this row’s authenticated adjacent-bundle counts, exact source fragment hashes and counts, row-scoped fragment absences, and authenticated deleted-file identities.',
    retainedSourcePaths,
  }
}

const obligations = directEvidence.rows.map(obligation)
assert(obligations.length === directEvidence.rowCount, 'obligation total')
assert(
  new Set(obligations.map(value => value.id)).size === obligations.length,
  'unique obligation IDs',
)
assert(
  obligations.filter(value => value.releaseBullets.length > 0).length === 0,
  'zero official obligations',
)
assert(
  obligations.every(value =>
    value.category !== 'official' &&
      value.releaseBullets.length === 0 &&
      value.hidden === true,
  ),
  'every zero-bullet obligation is hidden',
)
assert(
  obligations.every(value => value.classification.startsWith('source-localized-')),
  'all obligations source localized',
)

const output = {
  schemaVersion: 1,
  releaseBulletCount: 0,
  officialReleaseAbsenceEvidence: {
    release: '2.1.124',
    tag: 'v2.1.124',
    heading: '## 2.1.124',
    bulletCount: 0,
    bullets: [],
    provenance: metadata(provenancePath),
    absenceArtifact: metadata(releaseAbsencePath),
    fullChangelog: metadata(fullChangelogPath),
    tagRefs: metadata(tagRefsPath),
  },
  releaseBulletEvidence: [],
  sourceAliases: {
    'src/commands/advisor.ts': 'src/commands/advisor/advisor.tsx',
    'src/utils/autoModeDenials.ts': 'src/context/recentDenials.tsx',
  },
  directEvidenceCatalog: {
    ...directEvidenceMetadata,
    rowCount: directEvidence.rowCount,
    rowIdsSha256: sha256(Buffer.from(`${directIds.join('\n')}\n`)),
  },
  semanticClusterInventory: {
    ...directEvidence.clusterInventory,
    directRowIdsSha256: sha256(Buffer.from(`${directIds.join('\n')}\n`)),
  },
  testCatalog: [
    {
      id: 'adjacent',
      ...testMetadata,
      evidence: [
        {
          ...directEvidenceMetadata,
          rowCount: directEvidence.rowCount,
          testPinsIdentity: true,
          relation: 'loaded-and-exactly-verified-by-this-test',
        },
      ],
    },
    ...Object.entries(focusedTestPaths).map(([id, filename]) => ({
      id,
      ...metadata(filename),
    })),
  ],
  obligations,
}

const catalogTestIds = new Set(output.testCatalog.map(row => row.id))
const usedTestIds = new Set(obligations.flatMap(row => row.testIds))
assert(
  obligations.every(row => row.testIds.every(id => catalogTestIds.has(id))),
  'every obligation test binding resolves to the frozen catalog',
)
assert(
  [...catalogTestIds].every(id => usedTestIds.has(id)),
  'every focused 2.1.124 suite is consumed by at least one obligation',
)

fs.mkdirSync(semanticRoot, { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
const value = fs.readFileSync(outputPath)
console.log(
  JSON.stringify({
    status: '2.1.124-semantic-obligations-built',
    path: path.relative(repo, outputPath),
    bytes: value.length,
    sha256: sha256(value),
    obligations: obligations.length,
    official: obligations.filter(value => value.releaseBullets.length === 1)
      .length,
    hidden: obligations.filter(value => value.hidden === true).length,
    sourceLocalizedAdjacent: obligations.filter(
      value => value.classification === 'source-localized-adjacent',
    ).length,
    sourceLocalizedInherited: obligations.filter(
      value => value.classification === 'source-localized-inherited',
    ).length,
    sourceRemovals: obligations.reduce(
      (sum, value) => sum + (value.sourceRemovals?.length ?? 0),
      0,
    ),
    sourceBoundary: fs.existsSync(sourcePathsPath)
      ? 'frozen-source-paths'
      : `git-diff-${baseCommit}-to-HEAD`,
  }),
)
