#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const defaultRepo = fileURLToPath(new URL('../..', import.meta.url))
// Replaced by the exact-identity seal after the semantic proof freezes. Zero
// identities keep final verification fail-closed in the meantime.
const expectedStructuralArtifacts = {
  rawLedger: {
    path: 'structural/generated-delta.json.gz',
    bytes: 0,
    sha256: '0'.repeat(64),
  },
  metadataNormalizedLedger: {
    path: 'structural/metadata-normalized-delta.json.gz',
    bytes: 0,
    sha256: '0'.repeat(64),
  },
  knownDeltaExactLedger: {
    path: 'structural/known-delta-ledger.json.gz',
    bytes: 0,
    sha256: '0'.repeat(64),
  },
  knownDeltaProof: {
    path: 'structural/known-delta-proof.json',
    bytes: 0,
    sha256: '0'.repeat(64),
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
  1, 2, 9, 10, 11, 26, 56, 97, 98, 113, 114, 116, 138, 141, 145, 157,
  158, 159, 165, 176, 190, 202,
]
const requiredDirectClusterIds = [12, 69, 115, 186, 188, 189]
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

  const semantic = manifest.generatedRecovery?.semanticCorrespondence
  assert(
    semantic?.status === 'verified-zero-unclassified-zero-unverified',
    'semantic status',
  )
  assert(
    semantic.changelog === 'evidence/RELEASE-2.1.124-ABSENCE.json',
    'semantic proof uses authenticated release-absence evidence',
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
  assert(
    direct.rows.every(
      row => row.evidenceKind === 'reviewed-row-scoped-direct-evidence',
    ),
    'every row must use direct evidence',
  )
  assert(
    direct.rows.every(row =>
      row.retained !== true &&
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
        binding.targetWitness?.kind === 'raw-statement' &&
        ['baseline', 'target'].includes(binding.targetWitness.side) &&
        Number.isSafeInteger(binding.targetWitness.count) &&
        binding.targetWitness.count > 0 &&
        Number.isSafeInteger(binding.targetWitness.otherSideCount) &&
        binding.targetWitness.otherSideCount >= 0 &&
        binding.targetWitness.count !==
          binding.targetWitness.otherSideCount &&
        Array.isArray(binding.sourceWitnesses) &&
        binding.sourceWitnesses.length > 0 &&
        Array.isArray(binding.testIds) &&
        binding.testIds.length > 0) &&
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
    'every direct row needs exact per-cluster and row-level adjacent evidence',
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
      clusterInventory.accountingOnly.length > 0,
    'known-delta semantic cluster inventory',
  )
  const directClusters = clusterInventory.direct.flatMap(
    entry => entry.clusterIds,
  )
  const accountingOnlyClusters = clusterInventory.accountingOnly.flatMap(
    entry => entry.clusterIds,
  )
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
  const semanticSourcePaths = [
    ...new Set(clusterInventory.direct.flatMap(entry => entry.sourcePaths)),
  ].sort()
  assert(
    JSON.stringify(semanticSourcePaths) ===
      JSON.stringify(changedSourcePaths),
    'semantic source-owner union differs from exact changed-source boundary',
  )
  assert(
    clusterInventory.direct.every(entry =>
      JSON.stringify(entry.sourcePaths) !==
        JSON.stringify(changedSourcePaths)),
    'a direct semantic row claims the complete global source delta',
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
      direct.coverageDeclarations?.clusterInventoryFullyBound === true,
    'direct catalog pins the complete semantic cluster inventory',
  )
  assert(
    direct.inputs.some(entry =>
      JSON.stringify(entry) ===
        JSON.stringify(knownDeltaProofRepositoryMetadata)),
    'direct catalog input pins known-delta proof',
  )
  assert(
    JSON.stringify(
      clusterInventory.direct
        .map(entry => [entry.rowId, entry.clusterIds])
        .sort((left, right) => left[0].localeCompare(right[0])),
    ) === JSON.stringify(
      direct.rows
        .map(row => [row.id, row.semanticClusterIds])
        .sort((left, right) => left[0].localeCompare(right[0])),
    ),
    'direct catalog rows consume every direct semantic cluster group',
  )
  const directById = new Map(direct.rows.map(row => [row.id, row]))
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
        if (
          typeof witness.path !== 'string' ||
          !witness.path.startsWith('src/') ||
          witness.path.split('/').some(
            part => part === '' || part === '.' || part === '..',
          ) ||
          typeof witness.fragment !== 'string' ||
          witness.fragment.length === 0 ||
          !Number.isSafeInteger(witness.count) ||
          witness.count <= 0
        ) return false
        const source = fs.readFileSync(path.join(repo, witness.path), 'utf8')
        return occurrences(source, witness.fragment) === witness.count
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
        }))) === JSON.stringify(bindingSourceWitnesses) &&
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
  const semanticDelta = spawnSync(
    process.execPath,
    [
      path.join(repo, 'recovery/scripts/verify-2.1.124-semantic-delta.mjs'),
      '--baseline',
      path.join(path.resolve(args.artifacts), baselineAnalyzable.localPath),
      '--target',
      path.join(path.resolve(args.artifacts), targetAnalyzable.localPath),
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
