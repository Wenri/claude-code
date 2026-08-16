#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.123-to-2.1.124')
const outputPath = path.join(caseRoot, 'semantic/direct-evidence.json')
const specsPath = path.join(repo, 'recovery/2.1.124-direct-evidence-specs.json')
const releaseAbsencePath = path.join(
  caseRoot,
  'evidence/RELEASE-2.1.124-ABSENCE.json',
)
const provenancePath = path.join(caseRoot, 'evidence/provenance.json')
const knownDeltaProofPath = path.join(
  caseRoot,
  'structural/known-delta-proof.json',
)
const baselinePath = process.env.CLAUDE_CODE_2_1_123_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_124_BUNDLE
const baseRevision = '338d170737e8294c489481bc2e8fac52d8ce5f85'
const expectedClusterCount = 205
const accountingReasons = new Set([
  'dependency',
  'exact-relocation',
  'identifier-only',
  'initializer-linkage',
  'metadata',
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

function bundleRecord(text, baseline, target) {
  const value = Buffer.from(text)
  return {
    text,
    bytes: value.length,
    sha256: sha256(value),
    baselineCount: occurrences(baseline, text),
    targetCount: occurrences(target, text),
  }
}

function sourceRecord(assertion) {
  assert(
    typeof assertion.path === 'string' && assertion.path.startsWith('src/'),
    `unsafe source assertion path: ${assertion.path}`,
  )
  assert(
    typeof assertion.fragment === 'string' && assertion.fragment.length > 0,
    `${assertion.path}: empty source fragment`,
  )
  const filename = path.join(repo, assertion.path)
  const source = fs.readFileSync(filename, 'utf8')
  const count = occurrences(source, assertion.fragment)
  assert(count > 0, `${assertion.path}: absent source fragment`)
  const value = Buffer.from(assertion.fragment)
  return {
    path: assertion.path,
    fragment: assertion.fragment,
    bytes: value.length,
    sha256: sha256(value),
    count,
  }
}

function sourcePathAbsenceRecord(absence) {
  assert(Array.isArray(absence.paths) && absence.paths.length > 0,
    `source absence has no paths: ${absence.fragment}`)
  assert(typeof absence.fragment === 'string' && absence.fragment.length > 0,
    'source absence has an empty fragment')
  const paths = [...new Set(absence.paths)].sort()
  assert(paths.length === absence.paths.length, 'duplicate source-absence path')
  const count = paths.reduce((sum, relative) => {
    assert(relative.startsWith('src/'), `unsafe source absence path: ${relative}`)
    return sum + occurrences(
      fs.readFileSync(path.join(repo, relative), 'utf8'),
      absence.fragment,
    )
  }, 0)
  assert(count === 0, `source absence is present: ${absence.fragment}`)
  const value = Buffer.from(absence.fragment)
  return {
    paths,
    fragment: absence.fragment,
    bytes: value.length,
    sha256: sha256(value),
    count,
  }
}

function sourceFileAbsenceRecord(relative) {
  assert(
    typeof relative === 'string' && relative.startsWith('src/'),
    `unsafe deleted source path: ${relative}`,
  )
  const filename = path.resolve(repo, relative)
  assert(
    filename.startsWith(`${path.resolve(repo, 'src')}${path.sep}`),
    `deleted source path escapes src: ${relative}`,
  )
  assert(
    !fs.existsSync(filename),
    `deleted source path still exists: ${relative}`,
  )
  const baseValue = execFileSync(
    'git',
    ['show', `${baseRevision}:${relative}`],
    { cwd: repo, maxBuffer: 32 * 1024 * 1024 },
  )
  return {
    path: relative,
    baseBytes: baseValue.length,
    baseSha256: sha256(baseValue),
  }
}

function changedSourcePaths() {
  return changedSourceRows().map(row => row.path)
}

function changedSourceRows() {
  return execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${baseRevision}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, sourcePath] = line.split('\t')
      assert(['A', 'M', 'D'].includes(status),
        `unsupported source status: ${line}`)
      return { status, path: sourcePath }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

function deletedSourcePaths() {
  return execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${baseRevision}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => line.split('\t'))
    .filter(([status]) => status === 'D')
    .map(([, relative]) => relative)
    .sort()
}

const specs = JSON.parse(fs.readFileSync(specsPath, 'utf8'))
assert(specs.schemaVersion === 1, 'direct spec schema')
assert(specs.case === '2.1.123-to-2.1.124', 'direct spec case')
assert(specs.release === '2.1.124', 'direct spec release')
assert(specs.complete === true, 'direct spec is still provisional')
for (const [key, value] of Object.entries(specs.coverageDeclarations ?? {})) {
  assert(value === true, `coverage declaration remains false: ${key}`)
}
assert(baselinePath, 'CLAUDE_CODE_2_1_123_BUNDLE must be set')
assert(targetPath, 'CLAUDE_CODE_2_1_124_BUNDLE must be set')

const knownDeltaProof = JSON.parse(
  fs.readFileSync(knownDeltaProofPath, 'utf8'),
)
const clusterInventory = knownDeltaProof.knownDelta?.clusterInventory
assert(
  knownDeltaProof.schemaVersion === 1 &&
    knownDeltaProof.case === '2.1.123-to-2.1.124' &&
    knownDeltaProof.release === '2.1.124' &&
    knownDeltaProof.complete === true &&
    clusterInventory?.schemaVersion === 1 &&
    clusterInventory.totalClusters === expectedClusterCount &&
    Array.isArray(clusterInventory.direct) &&
    clusterInventory.direct.length > 0 &&
    Array.isArray(clusterInventory.accountingOnly) &&
    clusterInventory.accountingOnly.length > 0,
  'known-delta semantic cluster inventory',
)
const directClusters = clusterInventory.direct.flatMap(entry => entry.clusterIds)
const accountingOnlyClusters = clusterInventory.accountingOnly.flatMap(
  entry => entry.clusterIds,
)
const allClusters = [...directClusters, ...accountingOnlyClusters]
  .sort((left, right) => left - right)
assert(
  allClusters.every(clusterId => Number.isSafeInteger(clusterId)) &&
    new Set(allClusters).size === expectedClusterCount &&
    JSON.stringify(allClusters) === JSON.stringify(
      Array.from({ length: expectedClusterCount }, (_, index) => index + 1),
    ),
  'semantic cluster inventory must partition exactly 1..205',
)
for (const entry of clusterInventory.direct) {
  assert(entry.retained === undefined || entry.retained === false,
    `${entry.rowId ?? 'direct cluster'}: retained bypass is forbidden`)
  assert(
    Array.isArray(entry.targetWitnesses) &&
      entry.targetWitnesses.length > 0 &&
      entry.targetWitnesses.every(witness =>
        witness.kind === 'literal' &&
          typeof witness.value === 'string' &&
          witness.value.length > 0 &&
          Number.isSafeInteger(witness.count) &&
          witness.count > 0),
    `${entry.rowId ?? 'direct cluster'}: exact literal target witnesses`,
  )
}
for (const [index, entry] of clusterInventory.accountingOnly.entries()) {
  assert(accountingReasons.has(entry.reason),
    `accounting-only group ${index + 1}: invalid reason`)
  assert(
    entry.evidence &&
      typeof entry.evidence === 'object' &&
      !Array.isArray(entry.evidence) &&
      Object.keys(entry.evidence).length > 0,
    `accounting-only group ${index + 1}: empty evidence`,
  )
}
const clusterPartitionSha256 = sha256(Buffer.from(`${[
  ...directClusters.map(clusterId => `direct\t${clusterId}`),
  ...accountingOnlyClusters.map(clusterId => `accounting-only\t${clusterId}`),
].sort().join('\n')}\n`))
assert(
  JSON.stringify(specs.clusterInventory?.proof) ===
      JSON.stringify(metadata(knownDeltaProofPath)) &&
    specs.clusterInventory?.totalClusters === expectedClusterCount &&
    specs.clusterInventory?.directGroups === clusterInventory.direct.length &&
    specs.clusterInventory?.directClusters === directClusters.length &&
    specs.clusterInventory?.accountingOnlyGroups ===
      clusterInventory.accountingOnly.length &&
    specs.clusterInventory?.accountingOnlyClusters ===
      accountingOnlyClusters.length &&
    specs.clusterInventory?.partitionSha256 === clusterPartitionSha256,
  'direct specs pin the complete semantic cluster inventory',
)
assert(
  JSON.stringify(specs.changedSourceRows) === JSON.stringify(changedSourceRows()),
  'direct specs changed-source boundary',
)

const baselineBytes = fs.readFileSync(baselinePath)
const targetBytes = fs.readFileSync(targetPath)
assert(baselineBytes.length === 13_949_576, 'baseline byte length')
assert(
  sha256(baselineBytes) ===
    '59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd',
  'baseline SHA-256',
)
assert(targetBytes.length === 13_980_928, 'target byte length')
assert(
  sha256(targetBytes) ===
    'dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590',
  'target SHA-256',
)
const baseline = baselineBytes.toString('utf8')
const target = targetBytes.toString('utf8')
const releaseAbsence = JSON.parse(fs.readFileSync(releaseAbsencePath, 'utf8'))
assert(
  releaseAbsence.kind === 'authenticated-public-release-absence' &&
    releaseAbsence.release === '2.1.124' &&
    releaseAbsence.tag?.present === false &&
    releaseAbsence.changelog?.present === false &&
    releaseAbsence.changelog?.bulletCount === 0,
  'authenticated public-release absence',
)
const fullChangelogPath = sameCaseEvidencePath(
  releaseAbsence.changelog?.fullSnapshot?.path,
  'full public changelog',
)
const tagRefsPath = sameCaseEvidencePath(
  releaseAbsence.tag?.refs?.path,
  'public Git tag refs',
)
assert(
  JSON.stringify(releaseAbsence.changelog.fullSnapshot) === JSON.stringify({
    ...metadata(fullChangelogPath),
    path: path.relative(caseRoot, fullChangelogPath).replaceAll('\\', '/'),
    gitBlobSha1: releaseAbsence.changelog.fullSnapshot.gitBlobSha1,
  }) &&
    JSON.stringify(releaseAbsence.tag.refs) === JSON.stringify({
      ...metadata(tagRefsPath),
      path: path.relative(caseRoot, tagRefsPath).replaceAll('\\', '/'),
    }),
  'public-release absence audit input identities',
)
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
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
  'public-release absence provenance binding',
)

const focusedTestIds = new Set(
  fs.readdirSync(path.join(repo, 'recovery/test'))
    .filter(name =>
      /^recovery-2\.1\.124-.*\.test\.mjs$/.test(name) &&
      name !== 'recovery-2.1.124-direct-evidence.test.mjs')
    .map(name => name
      .replace(/^recovery-2\.1\.124-/, '')
      .replace(/\.test\.mjs$/, '')),
)
assert(focusedTestIds.has('semantic-delta'),
  'focused tests must include semantic delta')
const officialIds = specs.rows
  .filter(row => row.category === 'official')
  .map(row => row.id)
assert(JSON.stringify(officialIds) === JSON.stringify([]),
  'hidden-only release must not contain official specs')
assert(new Set(specs.rows.map(row => row.id)).size === specs.rows.length,
  'direct spec IDs are unique')
const clusterDirectByRow = new Map(
  clusterInventory.direct.map(entry => [entry.rowId, entry]),
)
assert(clusterDirectByRow.size === clusterInventory.direct.length,
  'semantic cluster direct row IDs are unique')
assert(
  JSON.stringify([...clusterDirectByRow.keys()].sort()) ===
    JSON.stringify(specs.rows.map(row => row.id).sort()),
  'direct spec rows differ from semantic cluster direct rows',
)

const rows = specs.rows.map(spec => {
  const semantic = clusterDirectByRow.get(spec.id)
  assert(semantic !== undefined, `${spec.id}: no semantic cluster binding`)
  assert(
    JSON.stringify(spec.semanticClusterIds) ===
        JSON.stringify(semantic.clusterIds) &&
      JSON.stringify(spec.semanticTargetWitnesses) ===
        JSON.stringify(semantic.targetWitnesses) &&
      JSON.stringify(spec.targetFragments) ===
        JSON.stringify(semantic.targetWitnesses.map(witness => witness.value)) &&
      JSON.stringify(spec.focusedTests) === JSON.stringify(semantic.testIds) &&
      JSON.stringify(spec.sourcePathAbsences) ===
        JSON.stringify(semantic.sourcePathAbsences ?? []) &&
      JSON.stringify(spec.sourceFileAbsences) ===
        JSON.stringify(semantic.sourceFileAbsences ?? []),
    `${spec.id}: semantic cluster binding differs from known-delta proof`,
  )
  const specSourcePaths = [...new Set([
    ...spec.sourceAssertions.map(assertion => assertion.path),
    ...spec.sourcePathAbsences.flatMap(absence => absence.paths),
    ...spec.sourceFileAbsences,
  ])].sort()
  assert(
    JSON.stringify(specSourcePaths) === JSON.stringify(semantic.sourcePaths),
    `${spec.id}: source owners differ from known-delta proof`,
  )
  assert(spec.status === 'verified', `${spec.id}: status is not verified`)
  assert(Array.isArray(spec.targetFragments) && spec.targetFragments.length > 0,
    `${spec.id}: no bundle witness`)
  assert(Array.isArray(spec.sourceAssertions) && spec.sourceAssertions.length > 0,
    `${spec.id}: no source witness`)
  assert(Array.isArray(spec.focusedTests) && spec.focusedTests.length > 0,
    `${spec.id}: no focused test`)
  assert(spec.focusedTests.every(id => focusedTestIds.has(id)),
    `${spec.id}: unknown focused test binding`)
  const targetFragments = spec.targetFragments.map(text =>
    bundleRecord(text, baseline, target))
  for (const [index, witness] of spec.semanticTargetWitnesses.entries()) {
    if (witness.count !== undefined) {
      assert(
        targetFragments[index].targetCount === witness.count,
        `${spec.id}: target witness count`,
      )
    }
  }
  assert(targetFragments.some(fragment => fragment.targetCount > 0),
    `${spec.id}: target bundle witness is absent`)
  const changed = targetFragments.some(
    fragment => fragment.baselineCount !== fragment.targetCount)
  assert(spec.retained !== true, `${spec.id}: retained bypass is forbidden`)
  assert(changed, `${spec.id}: no adjacent evidence`)
  const releaseBullet = spec.category === 'official' ? Number(spec.id.slice(1)) : null
  const title = spec.title
  assert(typeof title === 'string' && title.length > 0, `${spec.id}: title`)
  return {
    id: spec.id,
    obligationId: spec.obligationId ??
      (releaseBullet === null
        ? `${spec.category}-${spec.id.toLowerCase()}`
        : `official-2-1-124-b${String(releaseBullet).padStart(2, '0')}`),
    category: spec.category,
    ...(releaseBullet === null ? {} : { releaseBullet }),
    title,
    rationale: spec.rationale,
    evidenceKind: 'reviewed-row-scoped-direct-evidence',
    semanticClusterIds: spec.semanticClusterIds,
    semanticTargetWitnesses: spec.semanticTargetWitnesses,
    focusedTests: [...new Set(spec.focusedTests)].sort(),
    targetFragments,
    targetAbsences: targetFragments.filter(fragment => fragment.targetCount === 0),
    sourceAssertions: spec.sourceAssertions.map(sourceRecord),
    sourceAbsences: [],
    sourcePathAbsences: (spec.sourcePathAbsences ?? []).map(sourcePathAbsenceRecord),
    sourceFileAbsences: (spec.sourceFileAbsences ?? []).map(
      sourceFileAbsenceRecord,
    ),
  }
})

const assertedPaths = new Set(rows.flatMap(row => [
  ...row.sourceAssertions.map(assertion => assertion.path),
  ...row.sourcePathAbsences.flatMap(absence => absence.paths),
  ...row.sourceFileAbsences.map(absence => absence.path),
]))
const catalogDeletedPaths = rows
  .flatMap(row => row.sourceFileAbsences.map(absence => absence.path))
  .sort()
assert(
  new Set(catalogDeletedPaths).size === catalogDeletedPaths.length,
  'duplicate deleted source path evidence',
)
assert(
  JSON.stringify(catalogDeletedPaths) === JSON.stringify(deletedSourcePaths()),
  'catalog deleted source paths differ from git',
)
const boundTests = new Set(rows.flatMap(row => row.focusedTests))
const missingPaths = changedSourcePaths().filter(value => !assertedPaths.has(value))
const missingTests = [...focusedTestIds].filter(value => !boundTests.has(value)).sort()
assert(missingPaths.length === 0,
  `changed source paths without direct evidence:\n${missingPaths.join('\n')}`)
assert(missingTests.length === 0,
  `focused tests without direct row bindings:\n${missingTests.join('\n')}`)
assert(changedSourcePaths().length > 0, 'expected changed source paths')
assert(focusedTestIds.size > 0, 'expected focused tests')
assert(rows.length > 0, 'expected hidden direct evidence rows')

const categoryCounts = Object.fromEntries(
  [...new Set(rows.map(row => row.category))]
    .sort()
    .map(category => [category, rows.filter(row => row.category === category).length]),
)
assert(categoryCounts.official === undefined,
  'hidden-only release must not contain an official category')
const inventoryPaths = fs.readdirSync(path.join(repo, 'recovery'))
  .filter(name => /^2\.1\.124-.*-inventory\.json$/.test(name))
  .map(name => path.join(repo, 'recovery', name)).sort()
const output = {
  schemaVersion: 1,
  case: '2.1.123-to-2.1.124',
  release: '2.1.124',
  complete: true,
  baseline: { bytes: baselineBytes.length, sha256: sha256(baselineBytes) },
  target: { bytes: targetBytes.length, sha256: sha256(targetBytes) },
  coverageDeclarations: specs.coverageDeclarations,
  inputs: [
    specsPath,
    provenancePath,
    releaseAbsencePath,
    fullChangelogPath,
    tagRefsPath,
    knownDeltaProofPath,
    ...inventoryPaths,
  ].map(metadata),
  clusterInventory: specs.clusterInventory,
  changedSourceRows: changedSourceRows(),
  changedSourcePathCount: changedSourcePaths().length,
  focusedTestCount: focusedTestIds.size,
  rowCount: rows.length,
  categoryCounts,
  rows,
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  status: '2.1.124-direct-evidence-built',
  ...metadata(outputPath),
  rows: rows.length,
  categoryCounts,
}))
