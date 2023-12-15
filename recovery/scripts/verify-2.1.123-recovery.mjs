#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertCompleteRecoveryResult,
  cleanupPrivateVerifierCarrier,
  createPrivateVerifierCarrier,
} from '../lib/private-verifier-carrier.mjs'

const defaultRepo = fileURLToPath(new URL('../..', import.meta.url))
const fullDiffCheckDiagnostic =
  'recovery/cases/2.1.122-to-2.1.123/evidence/CHANGELOG-2.1.123.md:4: new blank line at EOF.'
const fullDiffCheckSha256 =
  '882ecc7f8d701a4c7f8cc3e6cfc1cb196ee8902f25d7b4f7b295279f8912d2af'
const expectedTests = [
  'recovery/test/recovery-2.1.123-direct-evidence.test.mjs',
  'recovery/test/recovery-2.1.123-oauth-beta-disable-experimental.test.mjs',
  'recovery/test/recovery-2.1.123-semantic-delta.test.mjs',
]
const expectedStructuralArtifacts = {
  rawLedger: {
    path: 'structural/generated-delta.json.gz',
    bytes: 2_249_391,
    sha256: 'a25b8e0101631589db1a92c4d5d306aa60806228263921d2b8e37b8173a24e24',
  },
  metadataNormalizedLedger: {
    path: 'structural/metadata-normalized-delta.json.gz',
    bytes: 2_228_952,
    sha256: '7588d83842cd9a92c6c397af15253dd2b7bb76a575af62fd0f3ea594c79fc6b7',
  },
  knownDeltaExactLedger: {
    path: 'structural/known-delta-ledger.json.gz',
    bytes: 2_228_225,
    sha256: '0c5766e6ead785c802053e1b71a3dee825df1076efba4708a7f55c19ebc6d2d1',
  },
  knownDeltaProof: {
    path: 'structural/known-delta-proof.json',
    bytes: 19_857,
    sha256: '1e2b1bdf143c1a04afcbdfea6f887d7f73374f5e90ee9969792ae7ebe639139b',
  },
}
const expectedKnownDeltaClosure = {
  targetUnits: 22_302,
  targetTokens: 4_394_501,
  changedUnits: 0,
  movedUnits: 0,
  unresolvedUnits: 0,
  changedTokens: 0,
  movedTokens: 0,
  unresolvedTokens: 0,
  unmatchedBaselineUnits: 0,
  unresolvedTargetUnits: 0,
}
function expectedTestsForRepo(repo) {
  return listConfinedRepositoryFiles(repo, 'recovery/test', 'recovery tests')
    .filter(name => /^recovery-2\.1\.123-.*\.test\.mjs$/.test(name))
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
  const imports = [
    /\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g,
    /\bimport\s+['"](\.{1,2}\/[^'"]+)['"]/g,
    /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
  ]
  while (pending.length > 0) {
    const relative = pending.pop()
    const filename = path.resolve(repo, relative)
    const source = readConfinedRepositoryFile(
      repo,
      relative,
      `${relative}: local dependency scan`,
    ).toString('utf8')
    for (const pattern of imports) {
      pattern.lastIndex = 0
      for (const match of source.matchAll(pattern)) {
        const dependency = path.resolve(path.dirname(filename), match[1])
        assert(
          dependency.startsWith(`${path.resolve(repo)}${path.sep}`),
          `${relative}: local import escapes repository`,
        )
        const dependencyRelative = path
          .relative(repo, dependency)
          .replaceAll('\\', '/')
        inspectConfinedCaseFile(
          repo,
          dependencyRelative,
          `${dependencyRelative}: local import`,
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

function confinedRelativeParts(relative, label) {
  if (typeof relative !== 'string') {
    throw new Error(`${label}: path must be a string`)
  }
  const parts = relative.split('/')
  if (
    relative.length === 0 ||
    relative.includes('\0') ||
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    path.posix.normalize(relative) !== relative ||
    parts.includes('') ||
    parts.includes('.') ||
    parts.includes('..')
  ) {
    throw new Error(`${label}: unsafe relative path ${relative}`)
  }
  return parts
}

function inspectConfinedPath(caseRoot, relative, label, expectedType) {
  const parts = confinedRelativeParts(relative, label)
  const unresolvedRoot = path.resolve(caseRoot)
  let rootStatus
  try {
    rootStatus = fs.lstatSync(unresolvedRoot)
  } catch (error) {
    throw new Error(`${label}: case root is not accessible`, { cause: error })
  }
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    throw new Error(`${label}: case root must be a real directory`)
  }
  const root = fs.realpathSync(unresolvedRoot)
  const resolvedRootStatus = fs.lstatSync(root)
  const rootAfterResolution = fs.lstatSync(unresolvedRoot)
  if (
    resolvedRootStatus.isSymbolicLink() ||
    !resolvedRootStatus.isDirectory() ||
    rootAfterResolution.isSymbolicLink() ||
    !rootAfterResolution.isDirectory() ||
    resolvedRootStatus.dev !== rootStatus.dev ||
    resolvedRootStatus.ino !== rootStatus.ino ||
    rootAfterResolution.dev !== rootStatus.dev ||
    rootAfterResolution.ino !== rootStatus.ino
  ) {
    throw new Error(`${label}: case root changed while resolving`)
  }
  let filename = root
  let finalStatus
  for (let index = 0; index < parts.length; index += 1) {
    filename = path.join(filename, parts[index])
    let status
    try {
      status = fs.lstatSync(filename)
    } catch (error) {
      throw new Error(`${label}: path is not accessible: ${relative}`, {
        cause: error,
      })
    }
    if (status.isSymbolicLink()) {
      throw new Error(`${label}: symbolic-link path component: ${relative}`)
    }
    const final = index === parts.length - 1
    if (!final && !status.isDirectory()) {
      throw new Error(`${label}: non-directory path component: ${relative}`)
    }
    if (
      final &&
      (expectedType === 'file' ? !status.isFile() : !status.isDirectory())
    ) {
      throw new Error(
        `${label}: expected a ${
          expectedType === 'file' ? 'regular file' : 'directory'
        }: ${relative}`,
      )
    }
    if (final) finalStatus = status
  }
  const realFilename = fs.realpathSync(filename)
  const realRelative = path.relative(root, realFilename)
  if (
    realRelative.length === 0 ||
    path.isAbsolute(realRelative) ||
    realRelative === '..' ||
    realRelative.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`${label}: path escaped case root: ${relative}`)
  }
  const rootAfterTraversal = fs.lstatSync(unresolvedRoot)
  if (
    rootAfterTraversal.isSymbolicLink() ||
    !rootAfterTraversal.isDirectory() ||
    rootAfterTraversal.dev !== rootStatus.dev ||
    rootAfterTraversal.ino !== rootStatus.ino ||
    fs.realpathSync(unresolvedRoot) !== root
  ) {
    throw new Error(`${label}: case root changed while reading`)
  }
  return {
    device: finalStatus.dev,
    filename,
    inode: finalStatus.ino,
    realFilename,
    root,
    rootDevice: rootStatus.dev,
    rootInode: rootStatus.ino,
    unresolvedRoot,
  }
}

function inspectConfinedCaseFile(caseRoot, relative, label) {
  return inspectConfinedPath(caseRoot, relative, label, 'file')
}

function inspectConfinedDirectory(root, relative, label) {
  return inspectConfinedPath(root, relative, label, 'directory')
}

function readConfinedCaseFileRecord(caseRoot, relative, label) {
  const before = inspectConfinedCaseFile(caseRoot, relative, label)
  let descriptor
  try {
    const noFollow = fs.constants.O_NOFOLLOW
    const flags = Number.isInteger(noFollow)
      ? fs.constants.O_RDONLY | noFollow
      : fs.constants.O_RDONLY
    descriptor = fs.openSync(before.filename, flags)
    const opened = fs.fstatSync(descriptor)
    assert(opened.isFile(), `${label}: opened target must be a regular file`)
    assert(
      opened.dev === before.device && opened.ino === before.inode,
      `${label}: target changed before open`,
    )
    const value = fs.readFileSync(descriptor)
    const openedAfterRead = fs.fstatSync(descriptor)
    assert(
      openedAfterRead.dev === opened.dev && openedAfterRead.ino === opened.ino,
      `${label}: opened target changed while reading`,
    )
    const after = inspectConfinedCaseFile(
      before.unresolvedRoot,
      relative,
      label,
    )
    assert(
      after.realFilename === before.realFilename &&
        after.device === opened.dev &&
        after.inode === opened.ino &&
        after.root === before.root &&
        after.rootDevice === before.rootDevice &&
        after.rootInode === before.rootInode,
      `${label}: target changed after read`,
    )
    return { ...after, value }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}

export function readConfinedCaseFile(
  caseRoot,
  relative,
  label = 'case file',
) {
  return readConfinedCaseFileRecord(caseRoot, relative, label).value
}

export function readConfinedRepositoryFile(
  repo,
  relative,
  label = 'repository file',
) {
  return readConfinedCaseFileRecord(repo, relative, label).value
}

export function listConfinedRepositoryFiles(
  repo,
  relative,
  label = 'repository directory',
) {
  const before = inspectConfinedDirectory(repo, relative, label)
  const readNames = () =>
    fs
      .readdirSync(before.filename, { withFileTypes: true })
      .map(entry => {
        assert(
          entry.isFile() && !entry.isSymbolicLink(),
          `${label}: directory entry must be a regular file: ${entry.name}`,
        )
        confinedRelativeParts(entry.name, `${label} entry`)
        inspectConfinedCaseFile(
          repo,
          `${relative}/${entry.name}`,
          `${label} entry ${entry.name}`,
        )
        return entry.name
      })
      .sort()
  const names = readNames()
  const after = inspectConfinedDirectory(repo, relative, label)
  assert(
    after.realFilename === before.realFilename &&
      after.device === before.device &&
      after.inode === before.inode &&
      after.root === before.root &&
      after.rootDevice === before.rootDevice &&
      after.rootInode === before.rootInode,
    `${label}: directory changed while enumerating`,
  )
  assert(
    JSON.stringify(readNames()) === JSON.stringify(names),
    `${label}: directory entries changed while enumerating`,
  )
  return names
}

function readPinned(root, metadata, label) {
  assert(
    typeof metadata?.path === 'string' &&
      metadata.path.split('/')[0] === 'semantic',
    `${label}: unsafe path`,
  )
  const value = readConfinedCaseFile(root, metadata.path, label)
  assert(value.length === metadata.bytes, `${label}: byte length`)
  assert(sha256(value) === metadata.sha256, `${label}: SHA-256`)
  return JSON.parse(value)
}

function readPinnedStructural(root, metadata, label) {
  assert(
    typeof metadata?.path === 'string' &&
      metadata.path.split('/')[0] === 'structural',
    `${label}: unsafe path`,
  )
  const value = readConfinedCaseFile(root, metadata.path, label)
  assert(value.length === metadata.bytes, `${label}: byte length`)
  assert(sha256(value) === metadata.sha256, `${label}: SHA-256`)
  return value
}

function authenticateArtifactRecord(root, artifact, label) {
  assert(
    artifact && typeof artifact.localPath === 'string',
    `${label}: missing artifact`,
  )
  const record = readConfinedCaseFileRecord(
    root,
    artifact.localPath,
    `${label} artifact`,
  )
  assert(record.value.length === artifact.bytes, `${label}: byte length`)
  assert(sha256(record.value) === artifact.sha256, `${label}: SHA-256`)
  return record
}

export function authenticateArtifact(root, artifact, label) {
  return authenticateArtifactRecord(root, artifact, label).realFilename
}

function materializeSnapshotFile(root, relative, value, label) {
  confinedRelativeParts(relative, label)
  const filename = path.join(root, relative)
  fs.mkdirSync(path.dirname(filename), { mode: 0o700, recursive: true })
  fs.writeFileSync(filename, value, { flag: 'wx', mode: 0o600 })
  const written = readConfinedCaseFile(root, relative, `${label} snapshot`)
  assert(
    written.length === value.length && sha256(written) === sha256(value),
    `${label}: snapshot identity`,
  )
  return filename
}

function materializePinnedCaseFile(caseRoot, snapshotCaseRoot, metadata, label) {
  assert(
    metadata &&
      typeof metadata.path === 'string' &&
      Number.isSafeInteger(metadata.bytes) &&
      metadata.bytes >= 0 &&
      /^[a-f0-9]{64}$/.test(metadata.sha256),
    `${label}: invalid pinned identity`,
  )
  const value = readConfinedCaseFile(caseRoot, metadata.path, label)
  assert(value.length === metadata.bytes, `${label}: byte length`)
  assert(sha256(value) === metadata.sha256, `${label}: SHA-256`)
  materializeSnapshotFile(snapshotCaseRoot, metadata.path, value, label)
}

function createPrivateSnapshotRoot() {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'verify-2.1.123-semantic-'),
  )
  fs.chmodSync(root, 0o700)
  return root
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

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.artifacts || !args['baseline-tarball']) {
    throw new Error(
      'Usage: verify-2.1.123-recovery.mjs --artifacts DIR ' +
        '--baseline-tarball FILE [--case manifest.json] [--repo DIR]',
    )
  }
  const repo = path.resolve(args.repo ?? defaultRepo)
  const actualTests = expectedTestsForRepo(repo)
  const expectedTestAssertions = expectedTestAssertionsForRepo(repo)
  assert(
    JSON.stringify(actualTests) === JSON.stringify(expectedTests),
    '2.1.123 tests must be exactly direct evidence, OAuth beta, and semantic delta',
  )
  const manifestPath = path.resolve(
    args.case ??
      path.join(
        repo,
        'recovery/cases/2.1.122-to-2.1.123/manifest.json',
      ),
  )
  const caseRoot = path.dirname(manifestPath)
  const manifestBytes = readConfinedCaseFile(
    caseRoot,
    path.basename(manifestPath),
    'manifest',
  )
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  assert(manifest.schemaVersion === 4, 'manifest schema')
  assert(manifest.case === '2.1.122-to-2.1.123', 'case identity')
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
  assert(
    JSON.stringify(direct.categoryCounts) ===
      JSON.stringify({ official: 1 }),
    'exact one-row official catalog',
  )
  assert(direct.changedSourcePathCount === 1, 'one changed source path')
  assert(
    direct.focusedTestCount === 2 &&
      direct.rows.length === 1 &&
      JSON.stringify(direct.rows[0].focusedTests) ===
        JSON.stringify(['oauth-beta-disable-experimental', 'semantic-delta']),
    'exact OAuth and semantic-delta focused test bindings',
  )
  assert(
    direct.rows.every(
      row => row.evidenceKind === 'reviewed-row-scoped-direct-evidence',
    ),
    'every row must use direct evidence',
  )
  assert(
    summary.coverage.unclassifiedTokens === 0 &&
      summary.coverage.accountedTokens === summary.coverage.targetTokens,
    'whole-bundle token closure',
  )
  assert(
    summary.coverage.obligations.releaseBulletsCovered === 1 &&
      summary.coverage.obligations.releaseBulletCount === 1,
    'official bullet closure',
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
    }))) === JSON.stringify([{ status: 'M', path: 'src/utils/betas.ts' }]),
    'exact one-path source delta',
  )
  assert(
    JSON.stringify(
      manifest.sourceLineage.testFileAssertions.map(entry => entry.path),
    ) === JSON.stringify(expectedTestAssertions),
    'exact source-lineage test assertions and direct dependencies',
  )
  const expectedTargetCommitFiles = [
    ...expectedTestAssertions,
    'recovery/2.1.123-direct-evidence-specs.json',
    'recovery/cases/2.1.122-to-2.1.123/semantic/direct-evidence.json',
  ].sort()
  assert(
    JSON.stringify(
      manifest.sourceLineage.targetCommitFileAssertions.map(entry => entry.path),
    ) === JSON.stringify(expectedTargetCommitFiles),
    'exact target-commit recovery file topology',
  )
  for (const entry of manifest.sourceLineage.targetCommitFileAssertions) {
    const working = readConfinedRepositoryFile(
      repo,
      entry.path,
      `${entry.path}: frozen recovery input`,
    )
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
      .CLAUDE_CODE_2_1_122_WRAPPER === 'baselineBundle' &&
      manifest.sourceLineage.testArtifactEnvironment
        .CLAUDE_CODE_2_1_123_WRAPPER === 'targetBundle',
    'adjacent wrapper artifact environment',
  )
  const sourceIdentityValue = readConfinedCaseFile(
    caseRoot,
    manifest.sourceFreeze.identity,
    'source-freeze identity',
  )
  const sourceIdentity = JSON.parse(sourceIdentityValue)
  assert(
    sha256(sourceIdentityValue) === manifest.sourceFreeze.identitySha256,
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
    sourceIdentity.verification.targetTests.files === 3 &&
      sourceIdentity.verification.targetTests.tests === 7 &&
      sourceIdentity.verification.targetTests.passed === 7 &&
      sourceIdentity.verification.targetTests.failed === 0 &&
      sourceIdentity.verification.targetTests.manifest ===
        'target-test-files.sha256' &&
      /^[a-f0-9]{64}$/.test(
        sourceIdentity.verification.targetTests.manifestSha256,
      ),
    'exact three-suite frozen test result',
  )
  assert(
    sourceIdentity.base.commit ===
        'c30cece4b85c84cd9e92ca708c96d1cd3f8f6b87' &&
      /^[a-f0-9]{40}$/.test(sourceIdentity.target.commit) &&
      sourceIdentity.target.commit === manifest.sourceLineage.targetCommit,
    'source-freeze commit identities',
  )
  const expectedDiffCheck = {
    scope: 'full-target-tree',
    sourceDiagnosticLines: 0,
    diagnosticLines: 1,
    sha256: fullDiffCheckSha256,
    reviewed: true,
  }
  assert(
    JSON.stringify(sourceIdentity.verification.diffCheck) ===
      JSON.stringify(expectedDiffCheck),
    'source-freeze full-tree diff-check identity',
  )
  assert(
    JSON.stringify(manifest.sourceFreeze.diffCheck) ===
      JSON.stringify({
        ...expectedDiffCheck,
        diagnostic: fullDiffCheckDiagnostic,
        rawOutput: 'recovered/source-freeze/diff-check.raw.txt',
        allowlist: 'recovered/source-freeze/diff-check-allowlist.txt',
      }),
    'manifest full-tree diff-check allowlist',
  )
  assert(
    readConfinedCaseFile(
      caseRoot,
      manifest.sourceFreeze.diffCheck.rawOutput,
      'frozen full-tree diff-check output',
    ).toString('utf8') === `${fullDiffCheckDiagnostic}\n`,
    'frozen full-tree diff-check diagnostic',
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
  assert(fullDiffCheck.status === 2, 'full-tree git diff --check status')
  assert(
    fullDiffCheck.output === `${fullDiffCheckDiagnostic}\n` &&
      sha256(Buffer.from(fullDiffCheck.output)) === fullDiffCheckSha256,
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
  const knownDeltaProof = JSON.parse(
    readPinnedStructural(
      caseRoot,
      structural.knownDeltaProof,
      'known-delta proof',
    ),
  )
  assert(
    knownDeltaProof.complete === true &&
      knownDeltaProof.case === '2.1.122-to-2.1.123' &&
      knownDeltaProof.release === '2.1.123',
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
  const exactLedger = knownDeltaProof.ledgers.knownDeltaExact
  assert(
    exactLedger.target.unitCount === 22_302 &&
      exactLedger.target.tokenCount === 4_394_501 &&
      exactLedger.target.failureCount === 0 &&
      exactLedger.coverage.units.changed === 0 &&
      exactLedger.coverage.units.moved === 0 &&
      exactLedger.coverage.units.unresolved === 0 &&
      exactLedger.coverage.units.matched === 22_302 &&
      exactLedger.coverage.tokens.changed === 0 &&
      exactLedger.coverage.tokens.moved === 0 &&
      exactLedger.coverage.tokens.unresolved === 0 &&
      exactLedger.coverage.tokens.matched === 4_394_501 &&
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
  authenticateArtifactRecord(
    artifactRoot,
    baselineAnalyzable,
    'baselineAnalyzableBundle',
  )
  authenticateArtifactRecord(
    artifactRoot,
    targetAnalyzable,
    'targetAnalyzableBundle',
  )
  const snapshotCaseRecords = [
    expectedStructuralArtifacts.rawLedger,
    expectedStructuralArtifacts.metadataNormalizedLedger,
    expectedStructuralArtifacts.knownDeltaExactLedger,
    expectedStructuralArtifacts.knownDeltaProof,
    knownDeltaProof.artifacts.attribution.summary,
    knownDeltaProof.artifacts.attribution.sources,
    knownDeltaProof.artifacts.attribution.targetInitializers,
    knownDeltaProof.artifacts.attribution.targetPartitions,
    knownDeltaProof.artifacts.attribution.targetRanges,
    knownDeltaProof.readableDiff.metadata,
    ...Object.values(knownDeltaProof.readableDiff.outputs),
  ]
  assert(
    JSON.stringify(snapshotCaseRecords.map(record => record.path).sort()) ===
      JSON.stringify([
        'attribution/sources.jsonl.gz',
        'attribution/summary.json',
        'attribution/target-initializers.jsonl.gz',
        'attribution/target-partitions.jsonl.gz',
        'attribution/target-ranges.jsonl.gz',
        'readable-diff/metadata.json',
        'readable-diff/normalized.diff.gz',
        'readable-diff/renames.tsv',
        'readable-diff/statements.diff',
        'structural/generated-delta.json.gz',
        'structural/known-delta-ledger.json.gz',
        'structural/known-delta-proof.json',
        'structural/metadata-normalized-delta.json.gz',
      ]),
    'semantic-delta snapshot input topology',
  )
  const carrier = await createPrivateVerifierCarrier({
    artifactsRoot: artifactRoot,
    baselineTarball: path.resolve(args['baseline-tarball']),
    caseRoot,
    manifest,
    manifestBytes,
    repositoryRoot: repo,
  })
  let result
  try {
    const semanticDelta = spawnSync(
      process.execPath,
      [
        path.join(
          carrier.repositoryRoot,
          'recovery/scripts/verify-2.1.123-semantic-delta.mjs',
        ),
        '--baseline',
        path.join(carrier.artifactsRoot, baselineAnalyzable.localPath),
        '--target',
        path.join(carrier.artifactsRoot, targetAnalyzable.localPath),
        '--output',
        carrier.caseRoot,
      ],
      {
        cwd: carrier.repositoryRoot,
        encoding: 'utf8',
        env: carrier.environment,
        maxBuffer: 128 * 1024 * 1024,
      },
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
      semanticDeltaResult.status === '2.1.123-semantic-delta-verified' &&
        JSON.stringify(semanticDeltaResult.proof) ===
          JSON.stringify(expectedStructuralArtifacts.knownDeltaProof) &&
        semanticDeltaResult.exact.units.changed === 0 &&
        semanticDeltaResult.exact.units.moved === 0 &&
        semanticDeltaResult.exact.units.unresolved === 0 &&
        semanticDeltaResult.exact.units.matched === 22_302 &&
        semanticDeltaResult.exact.tokens.changed === 0 &&
        semanticDeltaResult.exact.tokens.moved === 0 &&
        semanticDeltaResult.exact.tokens.unresolved === 0 &&
        semanticDeltaResult.exact.tokens.matched === 4_394_501,
      'standalone semantic-delta verification result',
    )

    const complete = spawnSync(
      process.execPath,
      [
        path.join(
          carrier.repositoryRoot,
          'recovery/scripts/verify-complete-recovery.mjs',
        ),
        '--case',
        carrier.manifestPath,
        '--artifacts',
        carrier.artifactsRoot,
        '--baseline-tarball',
        carrier.baselineTarball,
        '--repo',
        carrier.repositoryRoot,
      ],
      {
        cwd: carrier.repositoryRoot,
        encoding: 'utf8',
        env: carrier.environment,
        maxBuffer: 128 * 1024 * 1024,
      },
    )
    if (complete.error) throw complete.error
    if (complete.status !== 0) {
      throw new Error(
        `complete verifier failed (${complete.status})\n` +
          `${complete.stdout ?? ''}${complete.stderr ?? ''}`,
      )
    }
    result = assertCompleteRecoveryResult({
      manifest,
      result: JSON.parse(complete.stdout),
      sourceIdentity,
    })
  } finally {
    cleanupPrivateVerifierCarrier(carrier)
  }
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
        status: '2.1.123-fail-closed-recovery-verified',
        completeRecovery: result.status,
        sourceSemanticReproduction:
          result.checks.sourceSemanticReproduction,
        directRows: direct.rowCount,
        categoryCounts: direct.categoryCounts,
        officialBullets: 1,
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

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
if (invokedAsScript) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
