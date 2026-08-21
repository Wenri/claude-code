#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
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
  'recovery/cases/2.1.121-to-2.1.122/evidence/CHANGELOG-2.1.122.md:21: new blank line at EOF.'
const fullDiffCheckSha256 =
  '1075939c016a1591ae25d94a2c587ba8e2fa151b05326ee93197f55584393902'
function expectedTestsForRepo(repo) {
  return listConfinedRepositoryFiles(repo, 'recovery/test', 'recovery tests')
    .filter(name => /^recovery-2\.1\.122-.*\.test\.mjs$/.test(name))
    .map(name => `recovery/test/${name}`)
    .sort()
}

function expectedTestAssertionsForRepo(repo) {
  return [...expectedTestsForRepo(repo), 'src/utils/messageOperations.ts'].sort()
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

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.artifacts || !args['baseline-tarball']) {
    throw new Error(
      'Usage: verify-2.1.122-recovery.mjs --artifacts DIR ' +
        '--baseline-tarball FILE [--case manifest.json] [--repo DIR]',
    )
  }
  const repo = path.resolve(args.repo ?? defaultRepo)
  const expectedTests = expectedTestsForRepo(repo)
  const expectedTestAssertions = expectedTestAssertionsForRepo(repo)
  const manifestPath = path.resolve(
    args.case ??
      path.join(
        repo,
        'recovery/cases/2.1.121-to-2.1.122/manifest.json',
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
  assert(manifest.case === '2.1.121-to-2.1.122', 'case identity')
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
  assert(direct.categoryCounts.official === 18, 'official 18')
  assert(direct.categoryCounts.hidden === 10, 'hidden H01-H10')
  assert(direct.categoryCounts.daemon > 0, 'daemon rows')
  assert(direct.categoryCounts.residual > 0, 'finite residual rows')
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
    summary.coverage.obligations.releaseBulletsCovered === 18 &&
      summary.coverage.obligations.releaseBulletCount === 18,
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
      JSON.stringify(expectedTests),
    'exact source-lineage semantic tests',
  )
  assert(
    JSON.stringify(
      manifest.sourceLineage.testFileAssertions.map(entry => entry.path),
    ) === JSON.stringify(expectedTestAssertions),
    'exact source-lineage test assertions and direct dependencies',
  )
  assert(
    manifest.sourceLineage.testArtifactEnvironment
      .CLAUDE_CODE_2_1_121_WRAPPER === 'baselineBundle' &&
      manifest.sourceLineage.testArtifactEnvironment
        .CLAUDE_CODE_2_1_122_WRAPPER === 'targetBundle',
    'Fleet wrapper artifact environment',
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
    /^[a-f0-9]{40}$/.test(sourceIdentity.base.commit) &&
      /^[a-f0-9]{40}$/.test(sourceIdentity.target.commit),
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

  const carrier = await createPrivateVerifierCarrier({
    artifactsRoot: path.resolve(args.artifacts),
    baselineTarball: path.resolve(args['baseline-tarball']),
    caseRoot,
    manifest,
    manifestBytes,
    repositoryRoot: repo,
  })
  let result
  try {
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
        status: '2.1.122-fail-closed-recovery-verified',
        completeRecovery: result.status,
        sourceSemanticReproduction:
          result.checks.sourceSemanticReproduction,
        directRows: direct.rowCount,
        categoryCounts: direct.categoryCounts,
        officialBullets: 18,
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
