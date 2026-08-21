#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_2_1_126,
  RELEASE_2_1_126_GENERATED_INPUTS,
  assertRelease21126TopologyFrozen,
} from '../lib/release-2.1.126-input-contract.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.124-to-2.1.126')
const semanticRoot = path.join(caseRoot, 'semantic')
const outputPath = path.join(semanticRoot, 'obligations.json')
const directEvidencePath = path.join(semanticRoot, 'direct-evidence.json')
const knownDeltaProofPath = path.join(
  caseRoot,
  'structural/known-delta-proof.json',
)
const provenancePath = path.join(caseRoot, 'evidence/provenance.json')
const releasePresencePath = path.join(
  caseRoot,
  RELEASE_2_1_126.officialReleasePresence,
)
const skippedAbsencePath = path.join(
  caseRoot,
  RELEASE_2_1_126.skippedRegistryAbsence,
)
const changelogPath = path.join(caseRoot, RELEASE_2_1_126.officialSection)
const directTestPath = path.join(
  repo,
  'recovery/test/recovery-2.1.126-direct-evidence.test.mjs',
)
const priorObligationsPath = path.join(
  repo,
  'recovery/cases/2.1.123-to-2.1.124/semantic/obligations.json',
)
const sourcePathsPath = path.join(
  caseRoot,
  'recovered/source-freeze/source-paths.txt',
)
const baseCommit = RELEASE_2_1_126.baseRevision
const semanticTopology = RELEASE_2_1_126_GENERATED_INPUTS.semanticTopology

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
    path: path.relative(repo, filename).replaceAll('\\', '/'),
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
    return new Set(
      fs.readFileSync(sourcePathsPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => line.split('\t').at(-1)),
    )
  }
  const value = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', `${baseCommit}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
  return new Set(value.trim().split('\n').filter(Boolean))
}

function sourceRemovals(row) {
  return row.sourcePathAbsences.flatMap(absence =>
    absence.paths.map(sourcePath => ({
      path: sourcePath,
      fragment: absence.fragment,
      sha256: absence.sha256,
    })),
  )
}

assertRelease21126TopologyFrozen()

const focusedTestPaths = Object.fromEntries(
  fs.readdirSync(path.join(repo, 'recovery/test'))
    .filter(name =>
      /^recovery-2\.1\.126-.*\.test\.mjs$/.test(name) &&
        name !== 'recovery-2.1.126-direct-evidence.test.mjs')
    .sort()
    .map(name => [
      name
        .replace(/^recovery-2\.1\.126-/, '')
        .replace(/\.test\.mjs$/, ''),
      path.join(repo, 'recovery/test', name),
    ]),
)
assert(
  JSON.stringify(Object.keys(focusedTestPaths)) === JSON.stringify([
    'active-semantics',
    'retained-redraw',
    'semantic-delta',
  ]) &&
    Object.keys(focusedTestPaths).length === semanticTopology.focusedTestCount,
  'focused tests differ from the frozen active-semantics topology',
)

const directEvidence = JSON.parse(fs.readFileSync(directEvidencePath, 'utf8'))
const directEvidenceMetadata = metadata(directEvidencePath)
const knownDeltaProof = JSON.parse(fs.readFileSync(knownDeltaProofPath, 'utf8'))
const knownDeltaProofMetadata = metadata(knownDeltaProofPath)
const clusterInventory = knownDeltaProof.knownDelta?.clusterInventory
const releaseBulletClassification =
  knownDeltaProof.knownDelta?.releaseBulletClassification
const changedPaths = changedSourcePaths()
const directIds = directEvidence.rows.map(row => row.id)
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
const releasePresence = JSON.parse(fs.readFileSync(releasePresencePath, 'utf8'))
const skippedAbsence = JSON.parse(fs.readFileSync(skippedAbsencePath, 'utf8'))
const fullChangelogPath = sameCaseEvidencePath(
  releasePresence.changelog?.fullSnapshot?.path,
  'full public changelog',
)
const tagRefsPath = sameCaseEvidencePath(
  releasePresence.tag?.refs?.path,
  'public Git tag refs',
)
const sectionPath = sameCaseEvidencePath(
  releasePresence.changelog?.section?.path,
  'official release section',
)
const fullChangelog = fs.readFileSync(fullChangelogPath)
const sectionChangelog = fs.readFileSync(sectionPath)
const bulletTexts = sectionChangelog.toString('utf8')
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))

assert(
  directEvidence.schemaVersion === 1 &&
    directEvidence.case === RELEASE_2_1_126.case &&
    directEvidence.release === RELEASE_2_1_126.target &&
    directEvidence.complete === true &&
    directEvidence.rows.length === directEvidence.rowCount &&
    new Set(directIds).size === directIds.length,
  'direct-evidence catalog identity',
)
assert(
  JSON.stringify(Object.keys(focusedTestPaths)) === JSON.stringify(
    [...new Set(directEvidence.rows.flatMap(row => row.focusedTests))].sort(),
  ),
  'focused test files differ from exact active direct-evidence bindings',
)
assert(
  directEvidence.categoryCounts.official > 0 &&
    directEvidence.changedSourcePathCount ===
      semanticTopology.changedSourcePathCount &&
    JSON.stringify([...changedPaths].sort()) === JSON.stringify(
      RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.changedSourcePaths,
    ),
  'direct-evidence official/source topology',
)
assert(
  knownDeltaProof.schemaVersion === 1 &&
    knownDeltaProof.case === RELEASE_2_1_126.case &&
    knownDeltaProof.release === RELEASE_2_1_126.target &&
    knownDeltaProof.complete === true &&
    clusterInventory?.schemaVersion === 1 &&
    clusterInventory.totalClusters === semanticTopology.totalClusters &&
    Array.isArray(clusterInventory.direct) &&
    Array.isArray(clusterInventory.accountingOnly) &&
    Array.isArray(clusterInventory.supportBindings) &&
    clusterInventory.supportBindings.length ===
      semanticTopology.supportSourcePathCount &&
    Array.isArray(clusterInventory.targetRetainedRepairs) &&
    clusterInventory.targetRetainedRepairs.length ===
      semanticTopology.retainedSourceRepairPathCount,
  'known-delta semantic cluster inventory',
)
const allClusterIds = [
  ...clusterInventory.direct.flatMap(entry => entry.clusterIds),
  ...clusterInventory.accountingOnly.flatMap(entry => entry.clusterIds),
].sort((left, right) => left - right)
assert(
  new Set(allClusterIds).size === semanticTopology.totalClusters &&
    JSON.stringify(allClusterIds) === JSON.stringify(Array.from(
      { length: semanticTopology.totalClusters },
      (_, index) => index + 1,
    )),
  'semantic cluster partition is the exact frozen range',
)
assert(
  releaseBulletClassification?.total === RELEASE_2_1_126.officialBulletCount &&
    JSON.stringify(releaseBulletClassification.activeAdjacent) ===
      JSON.stringify([10, 17, 18]) &&
    releaseBulletClassification.baselineRetained.length === 30 &&
    JSON.stringify(releaseBulletClassification.hiddenAdjacentRows) ===
      JSON.stringify(['effort-settings-persistence']) &&
    JSON.stringify(releaseBulletClassification.retainedSourceRepairRows) ===
      JSON.stringify(['ctrl-l-redraw']),
  'release-bullet adjacent/non-active/hidden classification',
)
assert(
  directEvidence.inputs.some(entry =>
    JSON.stringify(entry) === JSON.stringify(knownDeltaProofMetadata)) &&
    JSON.stringify(directEvidence.clusterInventory?.proof) ===
      JSON.stringify(knownDeltaProofMetadata) &&
    directEvidence.clusterInventory?.totalClusters ===
      semanticTopology.totalClusters &&
    directEvidence.clusterInventory?.supportBindingCount ===
      clusterInventory.supportBindings.length &&
    directEvidence.clusterInventory?.supportSourcePathCount ===
      clusterInventory.supportBindings.length &&
    directEvidence.clusterInventory?.supportBindingsSha256 === sha256(
      Buffer.from(`${JSON.stringify(clusterInventory.supportBindings)}\n`),
    ) &&
    directEvidence.clusterInventory?.targetRetainedRepairCount ===
      clusterInventory.targetRetainedRepairs.length &&
    directEvidence.clusterInventory?.targetRetainedRepairsSha256 === sha256(
      Buffer.from(`${JSON.stringify(clusterInventory.targetRetainedRepairs)}\n`),
    ),
  'direct evidence pins the known-delta cluster inventory',
)

const clusterByRowId = new Map(
  clusterInventory.direct.map(entry => [entry.rowId, entry]),
)
const activeCatalogRows = directEvidence.rows.filter(row =>
  row.retained !== true)
assert(
  clusterByRowId.size === clusterInventory.direct.length &&
    JSON.stringify(activeCatalogRows.map(row => row.semanticRowId ?? row.id).sort()) ===
      JSON.stringify([...clusterByRowId.keys()].sort()),
  'active direct rows differ from the semantic cluster inventory',
)
for (const row of activeCatalogRows) {
  const semantic = clusterByRowId.get(row.semanticRowId ?? row.id)
  assert(
    semantic !== undefined &&
      JSON.stringify(row.semanticClusterIds) ===
        JSON.stringify(semantic.clusterIds) &&
      JSON.stringify(row.semanticClusterBindings) ===
        JSON.stringify(semantic.clusterBindings) &&
      JSON.stringify(row.semanticTargetWitnesses) ===
        JSON.stringify(semantic.targetWitnesses),
    `${row.id}: active semantic cluster binding`,
  )
}
const sourceRepairRows = directEvidence.rows.filter(row =>
  row.targetRetainedSourceRepair !== undefined)
const retainedRows = directEvidence.rows.filter(row =>
  row.retained === true && row.targetRetainedSourceRepair === undefined)
assert(
  retainedRows.length + sourceRepairRows.length ===
    releaseBulletClassification.baselineRetained.length,
  'every proof-classified non-active official bullet has a disposition',
)
const proofRepairByBullet = new Map(
  clusterInventory.targetRetainedRepairs.flatMap(repair =>
    repair.releaseBullets.map(releaseBullet => [releaseBullet, repair])),
)
assert(
  proofRepairByBullet.size === sourceRepairRows.length &&
    sourceRepairRows.every(row => {
      const repair = proofRepairByBullet.get(row.releaseBullets[0])
      const changedRepairPaths = [
        ...new Set(row.sourceAssertions
          .map(assertion => assertion.path)
          .filter(sourcePath => changedPaths.has(sourcePath))),
      ].sort()
      return repair?.rowId === 'ctrl-l-redraw' &&
        row.id === 'B23' &&
        JSON.stringify(row.releaseBullets) === JSON.stringify([23]) &&
        JSON.stringify(changedRepairPaths) === JSON.stringify(repair.sourcePaths) &&
        JSON.stringify(row.focusedTests) === JSON.stringify(repair.testIds) &&
        JSON.stringify(row.targetFragments.map(fragment => fragment.text).sort()) ===
          JSON.stringify(repair.bundleSemantics.fragments
            .map(fragment => fragment.text).sort())
    }),
  'direct evidence target-retained repair differs from semantic proof',
)
for (const row of retainedRows) {
  assert(
    row.category === 'official' &&
      row.evidenceKind === 'reviewed-inherited-baseline-row-evidence' &&
      row.semanticClusterIds === undefined &&
      row.sourceChangeSupport === undefined &&
      row.inheritedBaselineEvidence?.rowIds?.length > 0 &&
      row.inheritedBaselineEvidence?.focusedTests?.length > 0 &&
      row.targetFragments.every(fragment =>
        fragment.baselineCount > 0 &&
          fragment.baselineCount === fragment.targetCount),
    `${row.id}: retained baseline evidence`,
  )
}
for (const row of sourceRepairRows) {
  assert(
    row.category === 'official' &&
      row.evidenceKind === 'target-retained-source-repair' &&
      row.retained === true &&
      row.inheritedBaselineEvidence === undefined &&
      row.semanticClusterIds === undefined &&
      row.sourceChangeSupport === undefined &&
      typeof row.targetRetainedSourceRepair.observedBehavior === 'string' &&
      row.targetRetainedSourceRepair.observedBehavior.length >= 20 &&
      JSON.stringify(row.targetRetainedSourceRepair.testIds) ===
        JSON.stringify(['retained-redraw']) &&
      JSON.stringify(row.focusedTests) ===
        JSON.stringify(['retained-redraw']) &&
      row.targetFragments.every(fragment =>
        fragment.baselineCount > 0 &&
          fragment.baselineCount === fragment.targetCount),
    `${row.id}: authenticated target-retained source repair`,
  )
}

assert(
  releasePresence.schemaVersion === 1 &&
    releasePresence.kind === 'authenticated-public-release-presence' &&
    releasePresence.release === RELEASE_2_1_126.target &&
    releasePresence.tag?.name === 'v2.1.126' &&
    releasePresence.tag?.present === true &&
    releasePresence.changelog?.heading === '## 2.1.126' &&
    releasePresence.changelog?.present === true &&
    releasePresence.changelog?.bulletCount ===
      RELEASE_2_1_126.officialBulletCount &&
    releasePresence.changelog.section.bytes === sectionChangelog.length &&
    releasePresence.changelog.section.sha256 === sha256(sectionChangelog) &&
    releasePresence.changelog.fullSnapshot.bytes === fullChangelog.length &&
    releasePresence.changelog.fullSnapshot.sha256 === sha256(fullChangelog) &&
    releasePresence.changelog.fullSnapshot.gitBlobSha1 ===
      gitBlobSha1(fullChangelog) &&
    occurrences(fullChangelog.toString('utf8'), sectionChangelog.toString('utf8')) === 1,
  'authenticated public-release presence witness',
)
assert(
  path.resolve(sectionPath) === path.resolve(changelogPath) &&
    bulletTexts.length === RELEASE_2_1_126.officialBulletCount &&
    bulletTexts.every(text => text.length > 0),
  'authenticated official release bullet inventory',
)
assert(
  skippedAbsence.schemaVersion === 1 &&
    skippedAbsence.kind === 'authoritative-npm-registry-version-absence' &&
    skippedAbsence.release === '2.1.125' &&
    JSON.stringify(skippedAbsence.semanticVersionGap) === JSON.stringify({
      baseline: '2.1.124',
      skipped: ['2.1.125'],
      target: '2.1.126',
    }) &&
    skippedAbsence.publishedAdjacency?.targetIsNextPublishedVersion === true &&
    skippedAbsence.publishedAdjacency?.skippedVersionsAbsent === true &&
    skippedAbsence.packages?.length === 2 &&
    skippedAbsence.packages.every(entry =>
      entry.packument?.skippedVersionPresent === false &&
        entry.packument?.skippedPublicationTimePresent === false &&
        entry.missingVersionEndpoint?.httpStatus === 404),
  'authenticated skipped-version absence witness',
)
assert(
  provenance.schemaVersion === 1 &&
    provenance.release === RELEASE_2_1_126.target &&
    provenance.publicReleasePresence?.path ===
      RELEASE_2_1_126.officialReleasePresence &&
    provenance.publicReleasePresence?.bytes ===
      fs.statSync(releasePresencePath).size &&
    provenance.publicReleasePresence?.sha256 ===
      sha256(fs.readFileSync(releasePresencePath)) &&
    JSON.stringify(provenance.publicReleasePresence?.tag) ===
      JSON.stringify(releasePresence.tag) &&
    JSON.stringify(provenance.publicReleasePresence?.changelog) ===
      JSON.stringify(releasePresence.changelog) &&
    provenance.npm?.skippedVersionAbsence?.path ===
      RELEASE_2_1_126.skippedRegistryAbsence &&
    provenance.npm.skippedVersionAbsence.bytes ===
      fs.statSync(skippedAbsencePath).size &&
    provenance.npm.skippedVersionAbsence.sha256 ===
      sha256(fs.readFileSync(skippedAbsencePath)) &&
    provenance.publicationAdjacency?.targetIsNextPublishedVersion === true &&
    provenance.publicationAdjacency?.skippedVersionsAbsent === true,
  'public-release presence and skipped-version provenance',
)

const testMetadata = metadata(directTestPath)
const testSource = fs.readFileSync(directTestPath, 'utf8')
assert(
  testSource.includes(directEvidenceMetadata.sha256) &&
    testSource.replaceAll('_', '').includes(String(directEvidenceMetadata.bytes)),
  'direct test must pin the final direct catalog identity',
)

const priorObligations = JSON.parse(
  fs.readFileSync(priorObligationsPath, 'utf8'),
)
assert(
  priorObligations.schemaVersion === 1 &&
    Array.isArray(priorObligations.testCatalog),
  'sealed baseline obligation/test catalog',
)
const priorTestById = new Map(
  priorObligations.testCatalog.map(entry => [entry.id, entry]),
)
assert(priorTestById.size === priorObligations.testCatalog.length,
  'sealed baseline test IDs are unique')
const inheritedTestIds = [
  ...new Set(retainedRows.flatMap(row =>
    row.inheritedBaselineEvidence.focusedTests)),
].sort()
const baselineTestId = id => `baseline-2-1-124-${id}`
const priorObligationsMetadata = metadata(priorObligationsPath)
const inheritedTestCatalog = inheritedTestIds.map(id => {
  const entry = priorTestById.get(id)
  assert(entry !== undefined, `missing sealed baseline test: ${id}`)
  const current = metadata(path.join(repo, entry.path))
  assert(
    current.bytes === entry.bytes && current.sha256 === entry.sha256,
    `${id}: sealed baseline test identity`,
  )
  return {
    id: baselineTestId(id),
    ...current,
    inheritedFrom: {
      release: RELEASE_2_1_126.baseline,
      priorTestId: id,
      priorObligations: priorObligationsMetadata,
    },
  }
})

function obligation(row) {
  const retained = row.retained === true
  const sourceRepair = row.targetRetainedSourceRepair !== undefined
  const inheritedRetained = retained && !sourceRepair
  const adjacent = row.targetFragments.some(
    fragment => fragment.baselineCount !== fragment.targetCount,
  )
  assert(
    retained ? !adjacent : adjacent,
    `${row.id}: adjacent/non-active evidence classification`,
  )
  const removals = sourceRemovals(row)
  const fileAbsences = row.sourceFileAbsences ?? []
  const assertedPaths = new Set([
    ...row.sourceAssertions.map(entry => entry.path),
    ...removals.map(entry => entry.path),
    ...fileAbsences.map(entry => entry.path),
  ])
  const retainedSourcePaths = retained
    ? [...assertedPaths]
        .filter(sourcePath => !changedPaths.has(sourcePath))
        .sort()
    : [...assertedPaths]
        .filter(sourcePath => !changedPaths.has(sourcePath))
        .sort()
  return {
    id: row.obligationId,
    classification: retained
      ? 'source-localized-inherited'
      : 'source-localized-adjacent',
    releaseBullets: row.releaseBullets ?? [],
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
    testIds: sourceRepair
      ? ['adjacent', ...row.focusedTests].sort()
      : inheritedRetained
        ? [
            'adjacent',
            ...row.inheritedBaselineEvidence.focusedTests.map(baselineTestId),
          ].sort()
        : ['adjacent', ...(row.focusedTests ?? [])].sort(),
    catalogBinding: {
      ...directEvidenceMetadata,
      rawId: row.id,
      rowSha256: sha256(Buffer.from(JSON.stringify(row))),
      kind: row.evidenceKind,
    },
    ...(sourceRepair
      ? { targetRetainedSourceRepair: row.targetRetainedSourceRepair }
      : inheritedRetained
        ? { inheritedBaselineEvidence: row.inheritedBaselineEvidence }
        : {
            semanticClusterIds: row.semanticClusterIds,
            semanticClusterBindings: row.semanticClusterBindings,
          }),
    localizationBasis: 'authenticated-behavior-test',
    localizationBoundary: inheritedRetained
            ? 'The pinned adjacent direct-evidence test verifies unchanged positive bundle counts and exact current source witnesses, while inherited bindings pin the sealed 2.1.124 rows and focused test identities.'
            : sourceRepair
              ? 'The pinned retained-redraw and adjacent direct-evidence tests verify byte-identical target behavior, the repaired source handler, and the unchanged shortcut callsite without assigning the repair an adjacent semantic cluster.'
            : 'The pinned direct-evidence test loads this exact catalog identity and verifies this row’s authenticated adjacent-bundle counts, exact source fragment hashes and counts, row-scoped fragment absences, and authenticated deleted-file identities.',
    retainedSourcePaths,
  }
}

const obligations = directEvidence.rows.map(obligation)
const coveredBullets = obligations
  .flatMap(value => value.releaseBullets)
  .sort((left, right) => left - right)
assert(
  obligations.length === directEvidence.rowCount &&
    new Set(obligations.map(value => value.id)).size === obligations.length &&
    JSON.stringify(coveredBullets) === JSON.stringify(Array.from(
      { length: RELEASE_2_1_126.officialBulletCount },
      (_, index) => index + 1,
    )),
  'obligations cover every authenticated release bullet exactly once',
)
assert(
    obligations.filter(value => value.classification ===
      'source-localized-inherited').length ===
        retainedRows.length + sourceRepairRows.length &&
    obligations.filter(value => value.classification ===
      'source-localized-adjacent').length === clusterInventory.direct.length &&
    obligations.filter(value => value.hidden === true).length === 1,
  'adjacent/retained/source-repair/hidden obligation partition',
)

const output = {
  schemaVersion: 1,
  releaseBulletCount: RELEASE_2_1_126.officialBulletCount,
  officialReleaseEvidence: {
    provenance: metadata(provenancePath),
    fullChangelog: metadata(fullChangelogPath),
    sectionArtifact: metadata(changelogPath),
    presenceArtifact: metadata(releasePresencePath),
    tagRefs: metadata(tagRefsPath),
    skippedVersionAbsenceArtifact: metadata(skippedAbsencePath),
    section: RELEASE_2_1_126.target,
    bulletCount: RELEASE_2_1_126.officialBulletCount,
    bullets: bulletTexts,
  },
  releaseBulletEvidence: bulletTexts.map((text, index) => ({
    number: index + 1,
    text,
    sha256: sha256(Buffer.from(text)),
  })),
  releaseBulletClassification,
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
    directRowIdsSha256: sha256(Buffer.from(`${[
      ...clusterByRowId.keys(),
    ].sort().join('\n')}\n`)),
  },
  nonActiveOfficialEvidence: {
    proofClassifiedCount: releaseBulletClassification.baselineRetained.length,
    inheritedRetainedCount: retainedRows.length,
    targetRetainedSourceRepairCount: sourceRepairRows.length,
    priorObligations: priorObligationsMetadata,
    inheritedTestIds,
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
    ...inheritedTestCatalog,
  ],
  obligations,
}

const catalogTestIds = new Set(output.testCatalog.map(row => row.id))
const usedTestIds = new Set(obligations.flatMap(row => row.testIds))
assert(
  catalogTestIds.size === output.testCatalog.length &&
    obligations.every(row => row.testIds.every(id => catalogTestIds.has(id))) &&
    [...catalogTestIds].every(id => usedTestIds.has(id)),
  'every current and inherited test is resolved and consumed',
)

fs.mkdirSync(semanticRoot, { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
const value = fs.readFileSync(outputPath)
console.log(JSON.stringify({
  status: '2.1.126-semantic-obligations-built',
  path: path.relative(repo, outputPath),
  bytes: value.length,
  sha256: sha256(value),
  obligations: obligations.length,
  official: obligations.filter(value => value.releaseBullets.length > 0).length,
  hidden: obligations.filter(value => value.hidden === true).length,
  sourceLocalizedAdjacent: obligations.filter(value =>
    value.classification === 'source-localized-adjacent').length,
  sourceLocalizedInherited: obligations.filter(value =>
    value.classification === 'source-localized-inherited').length,
  targetRetainedSourceRepair: sourceRepairRows.length,
  releaseBullets: coveredBullets.length,
  sourceBoundary: fs.existsSync(sourcePathsPath)
    ? 'frozen-source-paths'
    : `git-diff-${baseCommit}-to-HEAD`,
}))
