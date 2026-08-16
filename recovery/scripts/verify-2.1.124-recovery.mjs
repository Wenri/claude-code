#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'
import {
  assertRelease21124GeneratedInputContract,
  assertRelease21124SourceOracleDeclaration,
} from '../lib/release-2.1.124-input-contract.mjs'

const defaultRepo = fileURLToPath(new URL('../..', import.meta.url))
const expectedStructuralArtifacts = {
  rawLedger: {
    path: 'structural/generated-delta.json.gz',
    bytes: 2_415_762,
    sha256: '0675cd7f48b2d74b5922e5eacabd76a8a151d9cdd6f515d76e2aa350fb83e982',
  },
  metadataNormalizedLedger: {
    path: 'structural/metadata-normalized-delta.json.gz',
    bytes: 2_397_530,
    sha256: 'de7f4b2a3bd15392758ac3c981d4759f54bfcdb9a5ee3a810d8215fe4da3e460',
  },
  knownDeltaExactLedger: {
    path: 'structural/known-delta-ledger.json.gz',
    bytes: 2_234_460,
    sha256: '97cf1e6fe195eb4a2605cb0ade2de5fe8963adcb1a02ab2cafd731a783f54a24',
  },
  knownDeltaProof: {
    path: 'structural/known-delta-proof.json',
    bytes: 347_925,
    sha256: '4104bbbd6c14f7703ac5fca78ff1a1ac30925aea53e70ed3f4c080434594e06b',
  },
}
const expectedKnownDeltaClosure = {
  targetUnits: 22_358,
  targetTokens: 4_405_970,
  changedUnits: 0,
  movedUnits: 0,
  unresolvedUnits: 0,
  changedTokens: 0,
  movedTokens: 0,
  unresolvedTokens: 0,
  unmatchedBaselineUnits: 0,
  unresolvedTargetUnits: 0,
}
const expectedAccountingClusterIds = [
  1, 2, 4, 9, 10, 11, 16, 26, 31, 33, 34, 36, 47, 56, 60, 61, 74, 86, 97, 98, 112,
  113, 114, 116, 123, 138, 141, 145, 147, 157, 158, 159, 165, 176, 179, 190, 202,
]
const expectedAccountingReasonGroups = {
  dependency: [1, 2, 9, 10, 11, 26],
  'identifier-only': [74, 86, 157, 158, 165, 190],
  'initializer-linkage': [
    4, 16, 31, 33, 34, 36, 47, 56, 60, 61, 97, 98, 112, 116, 138,
    141, 145, 147, 176, 179, 202,
  ],
  'exact-relocation': [113, 114, 123, 159],
}
const expectedInitializerPairedDirectClusterIds = [
  3, 17, 18, 32, 35, 62, 110, 151, 167, 168, 180,
]
const requiredDirectClusterIds = [12, 69, 115, 122, 186, 188, 189]
const expectedDirectClusterCount = 168
const expectedAccountingClusterCount = 37
const expectedDirectSourcePathCount = 121
const expectedSupportSourcePathCount = 10
const expectedChangedSourcePathCount = 131
function expectedTestsForRepo(repo) {
  return fs
    .readdirSync(path.join(repo, 'recovery/test'))
    .filter(name => /^recovery-2\.1\.124-.*\.test\.mjs$/.test(name))
    .map(name => `recovery/test/${name}`)
    .sort()
}

function expectedTestAssertionsForRepo(repo) {
  const tests = expectedTestsForRepo(repo)
  return [...tests, ...localModuleDependencies(repo, tests)].sort()
}

function localModuleDependencies(repo, entryPaths) {
  const entries = new Set(entryPaths)
  const seen = new Set(entryPaths)
  const pending = [...entryPaths]
  while (pending.length > 0) {
    const relative = pending.pop()
    const filename = path.resolve(repo, relative)
    const source = fs.readFileSync(filename, 'utf8')
    const ast = parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const moduleSpecifiers = []
    const visit = node => {
      if (!node || typeof node !== 'object') return
      if (
        (node.type === 'ImportDeclaration' ||
          node.type === 'ExportNamedDeclaration' ||
          node.type === 'ExportAllDeclaration' ||
          node.type === 'ImportExpression') &&
        typeof node.source?.value === 'string'
      ) {
        moduleSpecifiers.push(node.source.value)
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit)
        else if (value && typeof value === 'object') visit(value)
      }
    }
    visit(ast)
    for (const specifier of moduleSpecifiers) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const dependency = path.resolve(path.dirname(filename), specifier)
        assert(
          dependency.startsWith(`${path.resolve(repo)}${path.sep}`),
          `${relative}: local import escapes repository`,
        )
        const dependencyRelative = path
          .relative(repo, dependency)
          .replaceAll('\\', '/')
        const status = fs.lstatSync(dependency)
        assert(
          status.isFile() && !status.isSymbolicLink(),
          `${dependencyRelative}: local import must be a regular file`,
        )
        if (!seen.has(dependencyRelative)) {
          seen.add(dependencyRelative)
          pending.push(dependencyRelative)
        }
      }
    }
  }
  return [...seen].filter(relative => !entries.has(relative)).sort()
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set(['artifacts', 'baseline-tarball', 'case', 'repo'])
  for (let index = 0; index < argv.length; index += 2) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (!argument?.startsWith('--') || !allowed.has(argument.slice(2))) {
      throw new Error(`unknown argument: ${argument}`)
    }
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for ${argument}`)
    }
    const key = argument.slice(2)
    if (result[key] !== undefined) throw new Error(`duplicate ${argument}`)
    result[key] = value
  }
  return result
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function validateAccountingTopology(entries, directClusterIds) {
  assert(
    directClusterIds.length === expectedDirectClusterCount &&
      entries.flatMap(entry => entry.clusterIds).length ===
        expectedAccountingClusterCount,
    'direct/accounting cluster counts',
  )
  for (const [reason, expectedIds] of Object.entries(
    expectedAccountingReasonGroups,
  )) {
    const reasonEntries = entries.filter(entry => entry.reason === reason)
    assert(reasonEntries.length === 1, `${reason}: accounting group count`)
    const actualIds = reasonEntries
      .flatMap(entry => entry.clusterIds)
      .sort((left, right) => left - right)
    assert(JSON.stringify(actualIds) === JSON.stringify(expectedIds),
      `${reason}: accounting cluster topology`)
  }
  const initializerEntries = entries.filter(
    entry => entry.reason === 'initializer-linkage',
  )
  assert(
    entries.every(entry =>
      typeof entry.evidence?.classification === 'string' &&
        entry.evidence.classification.length >= 20 &&
        (entry.reason === 'initializer-linkage' ||
          entry.evidence.pairedDirectClusterIds === undefined)) &&
      initializerEntries.length === 1 &&
      JSON.stringify(initializerEntries[0].evidence.pairedDirectClusterIds) ===
        JSON.stringify(expectedInitializerPairedDirectClusterIds) &&
      expectedInitializerPairedDirectClusterIds.every(clusterId =>
        directClusterIds.includes(clusterId)),
    'accounting evidence and initializer/direct pairing',
  )
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

function safeSourcePath(relative) {
  return typeof relative === 'string' &&
    relative.startsWith('src/') &&
    !relative.split('/').some(part => part === '' || part === '.' || part === '..')
}

function sourceWitnessProjection(witness) {
  return {
    path: witness.path,
    fragment: witness.fragment,
    count: witness.count,
  }
}

function reviewedSourceWitness(repo, witness, requireReviewed = false) {
  if (
    !safeSourcePath(witness?.path) ||
    typeof witness.fragment !== 'string' ||
    witness.fragment.length === 0 ||
    !Number.isSafeInteger(witness.count) ||
    witness.count <= 0 ||
    typeof witness.reviewed !== 'boolean' ||
    !Array.isArray(witness.matchedSemanticTerms) ||
    witness.matchedSemanticTerms.some(term =>
      typeof term !== 'string' || term.length === 0) ||
    new Set(witness.matchedSemanticTerms).size !==
      witness.matchedSemanticTerms.length ||
    (witness.reviewed !== true && witness.matchedSemanticTerms.length === 0) ||
    (requireReviewed && witness.reviewed !== true)
  ) return false
  const source = fs.readFileSync(path.join(repo, witness.path), 'utf8')
  return occurrences(source, witness.fragment) === witness.count
}

function rawStatementWitnessShape(witness) {
  return witness?.kind === 'raw-statement' &&
    ['baseline', 'target'].includes(witness.side) &&
    Number.isSafeInteger(witness.statementIndex) &&
    witness.statementIndex >= 0 &&
    Number.isSafeInteger(witness.start) &&
    witness.start >= 0 &&
    Number.isSafeInteger(witness.end) &&
    witness.end > witness.start &&
    Number.isSafeInteger(witness.bytes) &&
    witness.bytes > 0 &&
    typeof witness.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(witness.sha256) &&
    typeof witness.normalizedSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(witness.normalizedSha256) &&
    Number.isSafeInteger(witness.count) &&
    witness.count > 0 &&
    Number.isSafeInteger(witness.otherSideCount) &&
    witness.otherSideCount >= 0 &&
    witness.count !== witness.otherSideCount
}

function clusterTargetWitnessesShape(binding) {
  const additional = binding.additionalTargetWitnesses ?? []
  const witnesses = [binding.targetWitness, ...additional]
  return rawStatementWitnessShape(binding.targetWitness) &&
    Array.isArray(additional) &&
    (binding.additionalTargetWitnesses === undefined || additional.length > 0) &&
    additional.every(rawStatementWitnessShape) &&
    JSON.stringify(additional.map(witness => [
      witness.side,
      witness.statementIndex,
    ])) === JSON.stringify(
      additional
        .map(witness => [witness.side, witness.statementIndex])
        .sort((left, right) =>
          left[0].localeCompare(right[0]) || left[1] - right[1]),
    ) &&
    new Set(witnesses.map(witness =>
      `${witness?.side}\u0000${witness?.statementIndex}`)).size ===
      witnesses.length
}

function readPinned(root, metadata, label) {
  assert(
    typeof metadata.path === 'string' &&
      metadata.path.startsWith('semantic/') &&
      !metadata.path.split('/').some(
        part => part === '' || part === '.' || part === '..',
      ),
    `${label}: unsafe path`,
  )
  const value = fs.readFileSync(path.join(root, metadata.path))
  assert(value.length === metadata.bytes, `${label}: byte length`)
  assert(sha256(value) === metadata.sha256, `${label}: SHA-256`)
  return JSON.parse(value)
}

function readPinnedStructural(root, metadata, label) {
  assert(
    metadata.path.startsWith('structural/') && !metadata.path.includes('..'),
    `${label}: unsafe path`,
  )
  const value = fs.readFileSync(path.join(root, metadata.path))
  assert(value.length === metadata.bytes, `${label}: byte length`)
  assert(sha256(value) === metadata.sha256, `${label}: SHA-256`)
  return value
}

function readCommitFile(repo, revision, relative) {
  assert(
    !path.isAbsolute(relative) &&
      !relative.split('/').includes('..') &&
      relative.length > 0,
    `unsafe target-commit file path: ${relative}`,
  )
  const result = spawnSync('git', ['show', `${revision}:${relative}`], {
    cwd: repo,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${relative}: absent from target commit ${revision}\n` +
        String(result.stderr ?? ''),
    )
  }
  return result.stdout
}

function authenticateArtifact(root, artifact, label) {
  assert(artifact && typeof artifact.localPath === 'string',
    `${label}: missing artifact`)
  const parts = artifact.localPath.split('/')
  assert(
    !path.isAbsolute(artifact.localPath) &&
      !artifact.localPath.includes('\\') &&
      parts.length > 0 &&
      !parts.some(part => part === '' || part === '.' || part === '..'),
    `${label}: unsafe artifact path`,
  )
  const resolvedRoot = path.resolve(root)
  const rootStatus = fs.lstatSync(resolvedRoot)
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(),
    `${label}: artifact root must be a real directory`)
  let filename = resolvedRoot
  for (const [index, part] of parts.entries()) {
    filename = path.join(filename, part)
    const status = fs.lstatSync(filename)
    assert(!status.isSymbolicLink(), `${label}: artifact path traverses a symlink`)
    assert(
      index === parts.length - 1 ? status.isFile() : status.isDirectory(),
      `${label}: artifact path component has the wrong type`,
    )
  }
  const value = fs.readFileSync(filename)
  assert(value.length === artifact.bytes, `${label}: byte length`)
  assert(sha256(value) === artifact.sha256, `${label}: SHA-256`)
  return filename
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.artifacts || !args['baseline-tarball']) {
    throw new Error(
      'Usage: verify-2.1.124-recovery.mjs --artifacts DIR ' +
        '--baseline-tarball FILE [--case manifest.json] [--repo DIR]',
    )
  }
  const repo = path.resolve(args.repo ?? defaultRepo)
  const actualTests = expectedTestsForRepo(repo)
  const expectedTestAssertions = expectedTestAssertionsForRepo(repo)
  const manifestPath = path.resolve(
    args.case ??
      path.join(
        repo,
        'recovery/cases/2.1.123-to-2.1.124/manifest.json',
      ),
  )
  const caseRoot = path.dirname(manifestPath)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert(manifest.schemaVersion === 4, 'manifest schema')
  assert(manifest.case === '2.1.123-to-2.1.124', 'case identity')
  assert(
    manifest.releaseAdjacency?.baseline === '2.1.123' &&
      manifest.releaseAdjacency?.target === '2.1.124' &&
      manifest.releaseAdjacency?.publicGitReleaseTagPresent === false &&
      manifest.releaseAdjacency?.publicChangelogSectionPresent === false &&
      manifest.releaseAdjacency?.publicReleaseAbsence ===
        'evidence/RELEASE-2.1.124-ABSENCE.json',
    'registry adjacency and public-release absence',
  )
  assert(manifest.finalization?.status === 'complete', 'finalization status')
  assert(manifest.recoveryScope?.sourceClosurePending === false, 'source closure')
  assert(
    manifest.recoveryScope?.semanticClosurePending === false,
    'semantic closure',
  )

  const attributionSummaryBytes = fs.readFileSync(
    path.join(caseRoot, 'attribution/summary.json'),
  )
  const readableMetadataBytes = fs.readFileSync(
    path.join(caseRoot, 'readable-diff/metadata.json'),
  )
  const generatedInputContract = assertRelease21124GeneratedInputContract({
    artifacts: manifest.artifacts,
    attribution: JSON.parse(attributionSummaryBytes),
    attributionSummary: {
      bytes: attributionSummaryBytes.length,
      sha256: sha256(attributionSummaryBytes),
    },
    readable: JSON.parse(readableMetadataBytes),
    readableMetadata: {
      bytes: readableMetadataBytes.length,
      sha256: sha256(readableMetadataBytes),
    },
  })
  for (const [name, expected] of Object.entries(generatedInputContract)) {
    const section = manifest.generatedRecovery[
      name === 'readable' ? 'readableDiff' : name
    ]
    const declared = Object.fromEntries(
      Object.keys(expected).map(key => [key, section?.[key]]),
    )
    assert(
      JSON.stringify(declared) === JSON.stringify(expected),
      `${name}: generated input contract`,
    )
  }
  assertRelease21124SourceOracleDeclaration(
    manifest,
    generatedInputContract,
  )

  const semantic = manifest.generatedRecovery?.semanticCorrespondence
  assert(
    semantic?.status === 'verified-zero-unclassified-zero-unverified',
    'semantic status',
  )
  assert(
    semantic.changelog === 'evidence/RELEASE-2.1.124-ABSENCE.json' &&
      semantic.baselineArtifact === 'baselineAnalyzableBundle' &&
      semantic.targetArtifact === 'targetAnalyzableBundle',
    'semantic proof uses adjacent bundles and authenticated release absence',
  )
  const direct = readPinned(
    caseRoot,
    semantic.fileIdentities.directEvidence,
    'direct evidence',
  )
  const summary = readPinned(
    caseRoot,
    semantic.fileIdentities.summary,
    'semantic summary',
  )
  assert(direct.rowCount === direct.rows.length, 'direct row count')
  assert(new Set(direct.rows.map(row => row.id)).size === direct.rowCount, 'row IDs')
  const expectedFocusedTests = [
    ...new Set(direct.rows.flatMap(row => row.focusedTests ?? [])),
  ].sort()
  const expectedTests = [
    'recovery/test/recovery-2.1.124-direct-evidence.test.mjs',
    ...expectedFocusedTests.map(
      id => `recovery/test/recovery-2.1.124-${id}.test.mjs`,
    ),
  ].sort()
  assert(expectedFocusedTests.includes('semantic-delta'),
    'focused tests include semantic delta')
  assert(
    JSON.stringify(actualTests) === JSON.stringify(expectedTests),
    '2.1.124 tests differ from exact direct-evidence bindings',
  )
  assert(
    direct.categoryCounts.official === undefined &&
      direct.rows.every(row => row.category !== 'official'),
    'exact hidden-only catalog',
  )
  assert(
    direct.changedSourcePathCount === direct.changedSourceRows.length &&
      direct.changedSourcePathCount > 0,
    'changed source boundary',
  )
  assert(
    direct.focusedTestCount === expectedFocusedTests.length &&
      JSON.stringify(
        [...new Set(direct.rows.flatMap(row => row.focusedTests))].sort(),
      ) === JSON.stringify(expectedFocusedTests),
    'exact hidden focused-test bindings',
  )
  const semanticCatalogRows = direct.rows.filter(
    row => row.semanticClusterIds !== undefined,
  )
  const supportCatalogRows = direct.rows.filter(
    row => row.sourceChangeSupport !== undefined,
  )
  assert(
    direct.rows.every(row =>
      row.retained !== true &&
      Array.isArray(row.semanticTargetWitnesses) &&
      row.semanticTargetWitnesses.length === row.targetFragments.length &&
      row.semanticTargetWitnesses.every((witness, index) =>
        witness.kind === 'literal' &&
        typeof witness.value === 'string' &&
        witness.value.length > 0 &&
        Number.isSafeInteger(witness.count) &&
        witness.count > 0 &&
        row.targetFragments[index].text === witness.value &&
        row.targetFragments[index].targetCount === witness.count) &&
      row.targetFragments.some(
        fragment => fragment.baselineCount !== fragment.targetCount,
      )),
    'every catalog row needs exact row-level adjacent evidence',
  )
  assert(
    semanticCatalogRows.length > 0 &&
      supportCatalogRows.length > 0 &&
      semanticCatalogRows.length + supportCatalogRows.length === direct.rowCount &&
      semanticCatalogRows.every(row =>
        row.evidenceKind === 'reviewed-row-scoped-direct-evidence' &&
        row.sourceChangeSupport === undefined &&
        row.relatedDirectClusterIds === undefined &&
        Array.isArray(row.semanticClusterIds) &&
        row.semanticClusterIds.length > 0 &&
        new Set(row.semanticClusterIds).size === row.semanticClusterIds.length &&
        JSON.stringify(row.semanticClusterIds) === JSON.stringify(
          [...row.semanticClusterIds].sort((left, right) => left - right),
        ) &&
        Array.isArray(row.semanticClusterBindings) &&
        row.semanticClusterBindings.length === row.semanticClusterIds.length &&
        JSON.stringify(
          row.semanticClusterBindings.map(binding => binding.clusterId),
        ) === JSON.stringify(row.semanticClusterIds) &&
        row.semanticClusterBindings.every(binding =>
          clusterTargetWitnessesShape(binding) &&
          Array.isArray(binding.sourceWitnesses) &&
          binding.sourceWitnesses.length > 0 &&
          Array.isArray(binding.testIds) &&
          binding.testIds.length > 0)),
    'semantic catalog rows need exact per-cluster evidence',
  )
  assert(
    supportCatalogRows.every(row =>
      row.evidenceKind === 'reviewed-source-change-support-evidence' &&
      row.semanticClusterIds === undefined &&
      row.semanticClusterBindings === undefined &&
      row.sourceChangeSupport?.id === row.id &&
      ['owning-direct-prerequisite', 'inherited-residual'].includes(
        row.sourceChangeSupport?.classification,
      ) &&
      row.sourceChangeSupport?.sourceWitness?.reviewed === true &&
      Array.isArray(row.relatedDirectClusterIds) &&
      row.relatedDirectClusterIds.length > 0 &&
      JSON.stringify(row.relatedDirectClusterIds) === JSON.stringify(
        row.sourceChangeSupport.relatedDirectClusterIds,
      )),
    'support catalog rows need explicit reviewed bundle relations',
  )
  assert(
    summary.coverage.unclassifiedTokens === 0 &&
      summary.coverage.accountedTokens === summary.coverage.targetTokens,
    'whole-bundle token closure',
  )
  assert(
    summary.coverage.obligations.releaseBulletsCovered === 0 &&
      summary.coverage.obligations.releaseBulletCount === 0,
    'authenticated zero-bullet closure',
  )
  assert(
    summary.coverage.obligations.unverifiedObligationCount === 0,
    'unverified obligation closure',
  )
  assert(
    summary.coverage.obligations.obligationCount === direct.rowCount,
    'obligation/direct row bijection',
  )
  assert(
    summary.coverage.obligations.testCatalogEntries ===
      summary.coverage.obligations.usedTestCatalogEntries,
    'all focused tests consumed',
  )

  assert(
    JSON.stringify(manifest.sourceLineage.testFiles) ===
      JSON.stringify(actualTests),
    'exact source-lineage semantic tests',
  )
  assert(
    JSON.stringify(manifest.sourceLineage.changedFiles.map(entry => ({
      status: entry.status,
      path: entry.path,
    }))) === JSON.stringify(direct.changedSourceRows),
    'exact catalog-bound source delta',
  )
  assert(
    JSON.stringify(
      manifest.sourceLineage.testFileAssertions.map(entry => entry.path),
    ) === JSON.stringify(expectedTestAssertions),
    'exact source-lineage test assertions and direct dependencies',
  )
  const expectedTargetCommitFiles = [...new Set([
    ...expectedTestAssertions,
    ...direct.inputs.map(entry => entry.path),
    'recovery/2.1.124-direct-evidence-specs.json',
    'recovery/cases/2.1.123-to-2.1.124/semantic/direct-evidence.json',
  ])].sort()
  assert(
    JSON.stringify(
      manifest.sourceLineage.targetCommitFileAssertions.map(entry => entry.path),
    ) === JSON.stringify(expectedTargetCommitFiles),
    'exact target-commit recovery file topology',
  )
  const targetCommitAssertionByPath = new Map(
    manifest.sourceLineage.targetCommitFileAssertions.map(entry => [
      entry.path,
      entry,
    ]),
  )
  assert(
    targetCommitAssertionByPath.size ===
      manifest.sourceLineage.targetCommitFileAssertions.length,
    'duplicate target-commit recovery file assertion',
  )
  for (const entry of direct.inputs) {
    assert(
      JSON.stringify(targetCommitAssertionByPath.get(entry.path)) ===
        JSON.stringify(entry),
      `${entry.path}: direct input differs from target-commit assertion`,
    )
  }
  for (const entry of manifest.sourceLineage.targetCommitFileAssertions) {
    assert(
      typeof entry.path === 'string' &&
        entry.path.length > 0 &&
        !path.isAbsolute(entry.path) &&
        !entry.path.split('/').some(part => part === '' || part === '.' || part === '..'),
      `unsafe target-commit recovery file path: ${entry.path}`,
    )
    const filename = path.join(repo, entry.path)
    const status = fs.lstatSync(filename)
    assert(
      status.isFile() && !status.isSymbolicLink(),
      `${entry.path}: recovery input must be a regular file`,
    )
    const working = fs.readFileSync(filename)
    assert(working.length === entry.bytes, `${entry.path}: frozen byte length`)
    assert(sha256(working) === entry.sha256, `${entry.path}: frozen SHA-256`)
    assert(
      working.equals(
        readCommitFile(repo, manifest.sourceLineage.targetCommit, entry.path),
      ),
      `${entry.path}: target commit differs from frozen recovery input`,
    )
  }
  assert(
    manifest.sourceLineage.testArtifactEnvironment
      .CLAUDE_CODE_2_1_123_WRAPPER === 'baselineBundle' &&
      manifest.sourceLineage.testArtifactEnvironment
        .CLAUDE_CODE_2_1_124_WRAPPER === 'targetBundle',
    'adjacent wrapper artifact environment',
  )
  const sourceIdentity = JSON.parse(
    fs.readFileSync(path.join(caseRoot, manifest.sourceFreeze.identity), 'utf8'),
  )
  assert(
    sha256(
      fs.readFileSync(path.join(caseRoot, manifest.sourceFreeze.identity)),
    ) === manifest.sourceFreeze.identitySha256,
    'source-freeze identity SHA-256',
  )
  assert(
    sourceIdentity.target.srcTree === manifest.sourceLineage.targetSrcGitTree,
    'source target Git tree',
  )
  assert(
    sourceIdentity.verification.targetTests.failed === 0,
    'frozen target tests',
  )
  assert(
    sourceIdentity.verification.targetTests.files === actualTests.length &&
      sourceIdentity.verification.targetTests.tests > 0 &&
      sourceIdentity.verification.targetTests.passed ===
        sourceIdentity.verification.targetTests.tests &&
      sourceIdentity.verification.targetTests.failed === 0 &&
      sourceIdentity.verification.targetTests.manifest ===
        'target-test-files.sha256' &&
      /^[a-f0-9]{64}$/.test(
        sourceIdentity.verification.targetTests.manifestSha256,
      ),
    'exact frozen test result',
  )
  assert(
    sourceIdentity.base.commit ===
        '338d170737e8294c489481bc2e8fac52d8ce5f85' &&
      /^[a-f0-9]{40}$/.test(sourceIdentity.target.commit) &&
      sourceIdentity.target.commit === manifest.sourceLineage.targetCommit,
    'source-freeze commit identities',
  )
  const expectedDiffCheck = sourceIdentity.verification.diffCheck
  assert(
    expectedDiffCheck.scope === 'full-target-tree' &&
      expectedDiffCheck.sourceDiagnosticLines === 0 &&
      Number.isSafeInteger(expectedDiffCheck.diagnosticLines) &&
      expectedDiffCheck.diagnosticLines >= 0 &&
      /^[a-f0-9]{64}$/.test(expectedDiffCheck.sha256) &&
      expectedDiffCheck.reviewed === true,
    'source-freeze full-tree diff-check identity',
  )
  assert(
    JSON.stringify(manifest.sourceFreeze.diffCheck) ===
      JSON.stringify({
        ...expectedDiffCheck,
        rawOutput: 'recovered/source-freeze/diff-check.raw.txt',
        allowlist: 'recovered/source-freeze/diff-check-allowlist.txt',
      }),
    'manifest full-tree diff-check allowlist',
  )
  const frozenDiffCheck = fs.readFileSync(
    path.join(caseRoot, manifest.sourceFreeze.diffCheck.rawOutput),
  )
  assert(
    sha256(frozenDiffCheck) === expectedDiffCheck.sha256 &&
      frozenDiffCheck.toString('utf8').split('\n').filter(Boolean).length ===
        expectedDiffCheck.diagnosticLines,
    'frozen full-tree diff-check output',
  )
  const runDiffCheck = extraArguments => {
    const result = spawnSync(
      'git',
      [
        'diff',
        '--check',
        sourceIdentity.base.commit,
        sourceIdentity.target.commit,
        ...extraArguments,
      ],
      { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    )
    if (result.error) throw result.error
    return {
      status: result.status,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    }
  }
  const fullDiffCheck = runDiffCheck([])
  assert(
    fullDiffCheck.status ===
      (expectedDiffCheck.diagnosticLines === 0 ? 0 : 2),
    'full-tree git diff --check status',
  )
  assert(
    Buffer.from(fullDiffCheck.output).equals(frozenDiffCheck) &&
      sha256(Buffer.from(fullDiffCheck.output)) === expectedDiffCheck.sha256,
    'full-tree git diff --check exact allowlist',
  )
  const sourceDiffCheck = runDiffCheck(['--', 'src'])
  assert(
    sourceDiffCheck.status === 0 && sourceDiffCheck.output === '',
    'source-only git diff --check must be clean',
  )

  const structural = manifest.generatedRecovery?.structural
  assert(
    structural?.status === 'verified-zero-residue-known-delta-ledger',
    'known-delta structural status',
  )
  assert(
    JSON.stringify({
      rawLedger: structural.rawLedger,
      metadataNormalizedLedger: structural.metadataNormalizedLedger,
      knownDeltaExactLedger: structural.knownDeltaExactLedger,
      knownDeltaProof: structural.knownDeltaProof,
    }) === JSON.stringify(expectedStructuralArtifacts),
    'exact structural ledger and proof identities',
  )
  assert(
    JSON.stringify(structural.knownDeltaClosure) ===
      JSON.stringify(expectedKnownDeltaClosure),
    'zero-residue known-delta closure',
  )
  for (const [key, metadata] of Object.entries(expectedStructuralArtifacts)) {
    readPinnedStructural(caseRoot, metadata, `structural ${key}`)
  }
  const knownDeltaProofValue = readPinnedStructural(
    caseRoot,
    structural.knownDeltaProof,
    'known-delta proof',
  )
  const knownDeltaProof = JSON.parse(knownDeltaProofValue)
  assert(
    knownDeltaProof.complete === true &&
      knownDeltaProof.case === '2.1.123-to-2.1.124' &&
      knownDeltaProof.release === '2.1.124',
    'known-delta proof completeness and identity',
  )
  assert(
    JSON.stringify({
      rawLedger: knownDeltaProof.artifacts.rawLedger,
      metadataNormalizedLedger: knownDeltaProof.artifacts.metadataLedger,
      knownDeltaExactLedger: knownDeltaProof.artifacts.exactLedger,
    }) === JSON.stringify({
      rawLedger: expectedStructuralArtifacts.rawLedger,
      metadataNormalizedLedger:
        expectedStructuralArtifacts.metadataNormalizedLedger,
      knownDeltaExactLedger: expectedStructuralArtifacts.knownDeltaExactLedger,
    }),
    'known-delta proof ledger bindings',
  )
  const clusterInventory = knownDeltaProof.knownDelta?.clusterInventory
  assert(
    clusterInventory?.schemaVersion === 1 &&
      clusterInventory.totalClusters === 205 &&
      Array.isArray(clusterInventory.direct) &&
      clusterInventory.direct.length > 0 &&
      Array.isArray(clusterInventory.accountingOnly) &&
      clusterInventory.accountingOnly.length > 0 &&
      Array.isArray(clusterInventory.supportBindings) &&
      clusterInventory.supportBindings.length > 0,
    'known-delta semantic cluster inventory',
  )
  const directClusters = clusterInventory.direct.flatMap(
    entry => entry.clusterIds,
  )
  const accountingOnlyClusters = clusterInventory.accountingOnly.flatMap(
    entry => entry.clusterIds,
  )
  validateAccountingTopology(clusterInventory.accountingOnly, directClusters)
  const allClusterIds = [...directClusters, ...accountingOnlyClusters]
    .sort((left, right) => left - right)
  assert(
    new Set(allClusterIds).size === 205 &&
      JSON.stringify(allClusterIds) === JSON.stringify(
        Array.from({ length: 205 }, (_, index) => index + 1),
      ),
    'semantic clusters partition exactly 1..205',
  )
  assert(
    requiredDirectClusterIds.every(clusterId =>
      directClusters.includes(clusterId) &&
        !accountingOnlyClusters.includes(clusterId)),
    'reviewed mixed-active clusters must be direct',
  )
  assert(
    JSON.stringify(
      [...accountingOnlyClusters].sort((left, right) => left - right),
    ) === JSON.stringify(expectedAccountingClusterIds),
    'accounting-only clusters differ from the conservative reviewed set',
  )
  const changedSourcePaths = direct.changedSourceRows
    .map(entry => entry.path)
    .sort()
  const preciseClusterSourcePaths = [
    ...new Set(clusterInventory.direct.flatMap(entry => entry.sourcePaths)),
  ].sort()
  const supportSourcePaths = clusterInventory.supportBindings
    .map(binding => binding.sourceWitness?.path)
    .sort()
  assert(
    changedSourcePaths.length === expectedChangedSourcePathCount &&
      preciseClusterSourcePaths.length === expectedDirectSourcePathCount &&
      supportSourcePaths.length === expectedSupportSourcePathCount &&
      new Set(supportSourcePaths).size === supportSourcePaths.length &&
      supportSourcePaths.every(sourcePath =>
        !preciseClusterSourcePaths.includes(sourcePath)) &&
      JSON.stringify([...preciseClusterSourcePaths, ...supportSourcePaths].sort()) ===
      JSON.stringify(changedSourcePaths),
    'precise cluster owners plus support paths differ from changed source',
  )
  assert(
    clusterInventory.direct.every(entry =>
      JSON.stringify(entry.sourcePaths) !==
        JSON.stringify(changedSourcePaths)),
    'a direct semantic row claims the complete global source delta',
  )
  const directClusterIdSet = new Set(directClusters)
  assert(
    JSON.stringify(clusterInventory.supportBindings.map(binding => binding.id)) ===
        JSON.stringify(
          clusterInventory.supportBindings.map(binding => binding.id).sort(),
        ) &&
      new Set(clusterInventory.supportBindings.map(binding => binding.id)).size ===
        clusterInventory.supportBindings.length &&
      clusterInventory.supportBindings.every(binding =>
        typeof binding.id === 'string' &&
        /^[a-z0-9][a-z0-9-]*$/.test(binding.id) &&
        ['owning-direct-prerequisite', 'inherited-residual'].includes(
          binding.classification,
        ) &&
        typeof binding.reason === 'string' &&
        binding.reason.trim() === binding.reason &&
        binding.reason.length >= 20 &&
        binding.clusterId === undefined &&
        binding.clusterIds === undefined &&
        reviewedSourceWitness(repo, binding.sourceWitness, true) &&
        JSON.stringify(binding.sourceWitness.matchedSemanticTerms) ===
          JSON.stringify([...binding.sourceWitness.matchedSemanticTerms].sort()) &&
        Array.isArray(binding.testIds) &&
        binding.testIds.length > 0 &&
        new Set(binding.testIds).size === binding.testIds.length &&
        JSON.stringify(binding.testIds) === JSON.stringify(
          [...binding.testIds].sort(),
        ) &&
        Array.isArray(binding.relatedDirectClusterIds) &&
        binding.relatedDirectClusterIds.length > 0 &&
        new Set(binding.relatedDirectClusterIds).size ===
          binding.relatedDirectClusterIds.length &&
        JSON.stringify(binding.relatedDirectClusterIds) === JSON.stringify(
          [...binding.relatedDirectClusterIds].sort((left, right) => left - right),
        ) &&
        binding.relatedDirectClusterIds.every(clusterId =>
          directClusterIdSet.has(clusterId))),
    'source-change support bindings require reviewed direct-cluster relations',
  )
  const accountingReasons = new Set([
    'dependency',
    'exact-relocation',
    'identifier-only',
    'initializer-linkage',
    'metadata',
  ])
  assert(
    clusterInventory.accountingOnly.every(entry =>
      accountingReasons.has(entry.reason) &&
      entry.evidence &&
      typeof entry.evidence === 'object' &&
      !Array.isArray(entry.evidence) &&
      Object.keys(entry.evidence).length > 0),
    'accounting-only semantic clusters need enumerated evidence',
  )
  const knownDeltaProofRepositoryMetadata = {
    path: path
      .relative(repo, path.join(caseRoot, structural.knownDeltaProof.path))
      .replaceAll('\\', '/'),
    bytes: knownDeltaProofValue.length,
    sha256: sha256(knownDeltaProofValue),
  }
  const semanticClusterBindings = clusterInventory.direct.flatMap(entry =>
    entry.clusterBindings.map(binding => ({ rowId: entry.rowId, ...binding })))
  const clusterBindingsSha256 = sha256(Buffer.from(
    `${JSON.stringify(semanticClusterBindings)}\n`,
  ))
  const supportBindingsSha256 = sha256(Buffer.from(
    `${JSON.stringify(clusterInventory.supportBindings)}\n`,
  ))
  assert(
    JSON.stringify(direct.clusterInventory?.proof) ===
        JSON.stringify(knownDeltaProofRepositoryMetadata) &&
      direct.clusterInventory?.totalClusters === 205 &&
      direct.clusterInventory?.directGroups === clusterInventory.direct.length &&
      direct.clusterInventory?.directClusters === directClusters.length &&
      direct.clusterInventory?.accountingOnlyGroups ===
        clusterInventory.accountingOnly.length &&
      direct.clusterInventory?.accountingOnlyClusters ===
        accountingOnlyClusters.length &&
      direct.clusterInventory?.clusterBindingCount === directClusters.length &&
      direct.clusterInventory?.clusterBindingsSha256 ===
        clusterBindingsSha256 &&
      direct.clusterInventory?.supportBindingCount ===
        clusterInventory.supportBindings.length &&
      direct.clusterInventory?.supportSourcePathCount ===
        clusterInventory.supportBindings.length &&
      direct.clusterInventory?.supportBindingsSha256 === supportBindingsSha256 &&
      direct.coverageDeclarations?.clusterInventoryFullyBound === true &&
      direct.coverageDeclarations?.sourceSupportFullyBound === true,
    'direct catalog pins the complete semantic/support inventory',
  )
  assert(
    direct.inputs.some(entry =>
      JSON.stringify(entry) ===
        JSON.stringify(knownDeltaProofRepositoryMetadata)),
    'direct catalog input pins known-delta proof',
  )
  const directById = new Map(direct.rows.map(row => [row.id, row]))
  const semanticDirectById = new Map(
    clusterInventory.direct.map(entry => [entry.rowId, entry]),
  )
  const supportById = new Map(
    clusterInventory.supportBindings.map(binding => [binding.id, binding]),
  )
  assert(
    semanticDirectById.size === clusterInventory.direct.length &&
      supportById.size === clusterInventory.supportBindings.length &&
      [...supportById.keys()].every(id => !semanticDirectById.has(id)) &&
      JSON.stringify([...directById.keys()].sort()) === JSON.stringify([
        ...semanticDirectById.keys(),
        ...supportById.keys(),
      ].sort()),
    'direct catalog rows consume every semantic and support group',
  )
  assert(
    clusterInventory.direct.every(entry => {
      const row = directById.get(entry.rowId)
      if (row === undefined || entry.retained === true) return false
      const bindingSourceWitnesses = [
        ...new Map(
          entry.clusterBindings.flatMap(binding =>
            binding.sourceWitnesses.map(sourceWitness => [
              `${sourceWitness.path}\u0000${sourceWitness.fragment}`,
              sourceWitness,
            ])),
        ).values(),
      ].sort((left, right) =>
        left.path.localeCompare(right.path) ||
          left.fragment.localeCompare(right.fragment))
      const bindingSourcePaths = [
        ...new Set(bindingSourceWitnesses.map(witness => witness.path)),
      ].sort()
      const bindingTestIds = [
        ...new Set(entry.clusterBindings.flatMap(binding => binding.testIds)),
      ].sort()
      const sourceWitnessesValid = bindingSourceWitnesses.every(witness => {
        return reviewedSourceWitness(repo, witness, true)
      })
      const sourcePaths = [...new Set([
        ...row.sourceAssertions.map(assertion => assertion.path),
        ...row.sourcePathAbsences.flatMap(absence => absence.paths),
        ...row.sourceFileAbsences.map(absence => absence.path),
      ])].sort()
      return (
        JSON.stringify(row.semanticClusterIds) ===
          JSON.stringify(entry.clusterIds) &&
        entry.clusterBindings.length === entry.clusterIds.length &&
        JSON.stringify(entry.clusterBindings.map(binding => binding.clusterId)) ===
          JSON.stringify(entry.clusterIds) &&
        JSON.stringify(row.semanticClusterBindings) ===
          JSON.stringify(entry.clusterBindings) &&
        sourceWitnessesValid &&
        JSON.stringify(bindingSourcePaths) ===
          JSON.stringify(entry.sourcePaths) &&
        JSON.stringify(bindingTestIds) === JSON.stringify(entry.testIds) &&
        JSON.stringify(row.sourceAssertions.map(assertion => ({
          path: assertion.path,
          fragment: assertion.fragment,
          count: assertion.count,
        }))) === JSON.stringify(
          bindingSourceWitnesses.map(sourceWitnessProjection),
        ) &&
        JSON.stringify(row.semanticTargetWitnesses) ===
          JSON.stringify(entry.targetWitnesses) &&
        JSON.stringify(row.focusedTests) === JSON.stringify(entry.testIds) &&
        JSON.stringify(sourcePaths) === JSON.stringify(entry.sourcePaths) &&
        JSON.stringify(row.sourcePathAbsences.map(absence => ({
          paths: absence.paths,
          fragment: absence.fragment,
        }))) === JSON.stringify(entry.sourcePathAbsences ?? []) &&
        JSON.stringify(row.sourceFileAbsences.map(absence => absence.path)) ===
          JSON.stringify(entry.sourceFileAbsences ?? [])
      )
    }),
    'direct catalog semantic cluster source/test/witness bindings',
  )
  const directEntryByClusterId = new Map(
    clusterInventory.direct.flatMap(entry =>
      entry.clusterIds.map(clusterId => [clusterId, entry])),
  )
  const relatedTargetWitnesses = binding => {
    const relatedEntries = new Map()
    for (const clusterId of binding.relatedDirectClusterIds) {
      const entry = directEntryByClusterId.get(clusterId)
      assert(entry !== undefined, `${binding.id}: related cluster is not direct`)
      relatedEntries.set(entry.rowId, entry)
    }
    return [
      ...new Map(
        [...relatedEntries.values()].flatMap(entry =>
          entry.targetWitnesses.map(witness => [witness.value, witness])),
      ).values(),
    ].sort((left, right) => left.value.localeCompare(right.value))
  }
  assert(
    clusterInventory.supportBindings.every(binding => {
      const row = directById.get(binding.id)
      const targetWitnesses = relatedTargetWitnesses(binding)
      return row !== undefined &&
        row.evidenceKind === 'reviewed-source-change-support-evidence' &&
        row.semanticClusterIds === undefined &&
        row.semanticClusterBindings === undefined &&
        JSON.stringify(row.sourceChangeSupport) === JSON.stringify(binding) &&
        JSON.stringify(row.relatedDirectClusterIds) ===
          JSON.stringify(binding.relatedDirectClusterIds) &&
        JSON.stringify(row.semanticTargetWitnesses) ===
          JSON.stringify(targetWitnesses) &&
        JSON.stringify(row.targetFragments.map(fragment => fragment.text)) ===
          JSON.stringify(targetWitnesses.map(witness => witness.value)) &&
        JSON.stringify(row.sourceAssertions.map(sourceWitnessProjection)) ===
          JSON.stringify([sourceWitnessProjection(binding.sourceWitness)]) &&
        row.sourcePathAbsences.length === 0 &&
        row.sourceFileAbsences.length === 0 &&
        JSON.stringify(row.focusedTests) === JSON.stringify(binding.testIds)
    }),
    'direct catalog source-change support/test/target bindings',
  )
  const directRowIdsSha256 = sha256(Buffer.from(
    `${direct.rows.map(row => row.id).join('\n')}\n`,
  ))
  assert(
    JSON.stringify(
      manifest.generatedRecovery.semanticCatalogContract?.clusterInventory,
    ) === JSON.stringify({
      ...direct.clusterInventory,
      directRowIdsSha256,
    }),
    'manifest semantic cluster inventory binding',
  )
  assert(
    structural.semanticClusterInventory?.status ===
        'verified-complete-partition-and-direct-bindings' &&
      structural.semanticClusterInventory.totalClusters === 205 &&
      structural.semanticClusterInventory.directGroups ===
        clusterInventory.direct.length &&
      structural.semanticClusterInventory.directClusters ===
        directClusters.length &&
      structural.semanticClusterInventory.accountingOnlyGroups ===
        clusterInventory.accountingOnly.length &&
      structural.semanticClusterInventory.accountingOnlyClusters ===
        accountingOnlyClusters.length &&
      structural.semanticClusterInventory.supportBindings ===
        clusterInventory.supportBindings.length &&
      structural.semanticClusterInventory.supportSourcePaths ===
        clusterInventory.supportBindings.length &&
      JSON.stringify(structural.semanticClusterInventory.proof) ===
        JSON.stringify(knownDeltaProofRepositoryMetadata) &&
      structural.semanticClusterInventory.partitionSha256 ===
        direct.clusterInventory.partitionSha256,
    'manifest structural semantic cluster partition',
  )
  const exactLedger = knownDeltaProof.ledgers.knownDeltaExact
  assert(
    exactLedger.target.unitCount === 22_358 &&
      exactLedger.target.tokenCount === 4_405_970 &&
      exactLedger.target.failureCount === 0 &&
      exactLedger.coverage.units.changed === 0 &&
      exactLedger.coverage.units.moved === 0 &&
      exactLedger.coverage.units.unresolved === 0 &&
      exactLedger.coverage.units.matched === 22_358 &&
      exactLedger.coverage.tokens.changed === 0 &&
      exactLedger.coverage.tokens.moved === 0 &&
      exactLedger.coverage.tokens.unresolved === 0 &&
      exactLedger.coverage.tokens.matched === 4_405_970 &&
      exactLedger.unmatchedBaselineCount === 0 &&
      exactLedger.unresolvedTargetCount === 0,
    'known-delta proof exact zero-residue ledger',
  )

  const artifactById = new Map(manifest.artifacts.map(item => [item.id, item]))
  const baselineAnalyzable = artifactById.get('baselineAnalyzableBundle')
  const targetAnalyzable = artifactById.get('targetAnalyzableBundle')
  assert(
    baselineAnalyzable?.localPath && targetAnalyzable?.localPath,
    'adjacent analyzable artifact paths',
  )
  const artifactRoot = path.resolve(args.artifacts)
  const authenticatedGeneratedArtifacts = new Map(
    [
      'sourceOracleBundle',
      'sourceOracleMap',
      'baselineAnalyzableBundle',
      'targetAnalyzableBundle',
      'targetPackageJson',
      'targetDeclarations',
    ].map(id => [
      id,
      authenticateArtifact(artifactRoot, artifactById.get(id), id),
    ]),
  )
  const semanticDelta = spawnSync(
    process.execPath,
    [
      path.join(repo, 'recovery/scripts/verify-2.1.124-semantic-delta.mjs'),
      '--baseline',
      authenticatedGeneratedArtifacts.get('baselineAnalyzableBundle'),
      '--target',
      authenticatedGeneratedArtifacts.get('targetAnalyzableBundle'),
      '--case-root',
      caseRoot,
      '--source-root',
      repo,
    ],
    { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  if (semanticDelta.error) throw semanticDelta.error
  if (semanticDelta.status !== 0) {
    throw new Error(
      `semantic-delta verifier failed (${semanticDelta.status})\n` +
        `${semanticDelta.stdout ?? ''}${semanticDelta.stderr ?? ''}`,
    )
  }
  const semanticDeltaResult = JSON.parse(semanticDelta.stdout)
  assert(
    semanticDeltaResult.status === '2.1.124-semantic-delta-verified' &&
      JSON.stringify(semanticDeltaResult.proof) ===
        JSON.stringify(expectedStructuralArtifacts.knownDeltaProof) &&
      semanticDeltaResult.exact.units.changed === 0 &&
      semanticDeltaResult.exact.units.moved === 0 &&
      semanticDeltaResult.exact.units.unresolved === 0 &&
      semanticDeltaResult.exact.units.matched === 22_358 &&
      semanticDeltaResult.exact.tokens.changed === 0 &&
      semanticDeltaResult.exact.tokens.moved === 0 &&
      semanticDeltaResult.exact.tokens.unresolved === 0 &&
      semanticDeltaResult.exact.tokens.matched === 4_405_970,
    'standalone semantic-delta verification result',
  )

  const complete = spawnSync(
    process.execPath,
    [
      path.join(repo, 'recovery/scripts/verify-complete-recovery.mjs'),
      '--case',
      manifestPath,
      '--artifacts',
      path.resolve(args.artifacts),
      '--baseline-tarball',
      path.resolve(args['baseline-tarball']),
      '--repo',
      repo,
    ],
    { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  if (complete.error) throw complete.error
  if (complete.status !== 0) {
    throw new Error(
      `complete verifier failed (${complete.status})\n` +
        `${complete.stdout ?? ''}${complete.stderr ?? ''}`,
    )
  }
  const result = JSON.parse(complete.stdout)
  assert(result.status === 'complete-recovery-verified', 'complete status')
  assert(
    result.checks.sourceSemanticReproduction ===
      'whole-bundle-source-semantics-verified',
    'source semantic reproduction',
  )
  assert(result.accounting.unaccountedTargetUtf16 === 0, 'UTF-16 closure')
  assert(
    result.accounting.unclassifiedSourceSemanticTokens === 0,
    'semantic token closure',
  )
  console.log(
    JSON.stringify(
      {
        status: '2.1.124-fail-closed-recovery-verified',
        completeRecovery: result.status,
        sourceSemanticReproduction:
          result.checks.sourceSemanticReproduction,
        directRows: direct.rowCount,
        categoryCounts: direct.categoryCounts,
        officialBullets: 0,
        unverifiedObligations: 0,
        unclassifiedTokens: 0,
        sourceTargetCommit: sourceIdentity.target.commit,
        sourceTargetTree: sourceIdentity.target.srcTree,
      },
      null,
      2,
    ),
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
