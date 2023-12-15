#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  RELEASE_2_1_126,
  RELEASE_2_1_126_GENERATED_INPUTS,
  assertRelease21126CommitReachability,
  assertRelease21126GeneratedInputContract,
  assertRelease21126InheritedTestProvenance,
  assertRelease21126SourceOracleDeclaration,
  assertRelease21126TopologyFrozen,
} from '../lib/release-2.1.126-input-contract.mjs'
import {
  assertCompleteRecoveryResult,
  cleanupPrivateVerifierCarrier,
  createPrivateVerifierCarrier,
} from '../lib/private-verifier-carrier.mjs'

const defaultRepo = fileURLToPath(new URL('../..', import.meta.url))
const PINNED_ACORN_PARSER = Object.freeze({
  path: 'recovery/node_modules/acorn/dist/acorn.mjs',
  bytes: 229_792,
  sha256: 'b4c8c70200e72bae33cf1085e0ecb1e792c1b6924ed50cab817caf14f51bb249',
  mode: 0o644,
})
let authenticatedParse = null
const semanticTopology = RELEASE_2_1_126_GENERATED_INPUTS.semanticTopology
const structuralContract = RELEASE_2_1_126_GENERATED_INPUTS.structural
const expectedStructuralArtifacts = {
  rawLedger: {
    path: 'structural/generated-delta.json.gz',
    ...structuralContract.rawLedger,
  },
  metadataNormalizedLedger: {
    path: 'structural/metadata-normalized-delta.json.gz',
    ...structuralContract.metadataNormalizedLedger,
  },
  knownDeltaExactLedger: {
    path: 'structural/known-delta-ledger.json.gz',
    ...structuralContract.knownDeltaExactLedger,
  },
  knownDeltaProof: {
    path: 'structural/known-delta-proof.json',
    ...structuralContract.knownDeltaProof,
  },
}
const expectedKnownDeltaClosure = {
  targetUnits: structuralContract.targetUnits,
  targetTokens: structuralContract.targetTokens,
  changedUnits: 0,
  movedUnits: 0,
  unresolvedUnits: 0,
  changedTokens: 0,
  movedTokens: 0,
  unresolvedTokens: 0,
  unmatchedBaselineUnits: 0,
  unresolvedTargetUnits: 0,
}
const expectedAccountingClusterIds = semanticTopology.accountingClusterIds
const expectedAccountingReasonGroups = semanticTopology.accountingReasonGroups
const expectedInitializerPairedDirectClusterIds =
  semanticTopology.initializerPairedDirectClusterIds
const requiredDirectClusterIds = semanticTopology.requiredDirectClusterIds
const expectedDirectClusterCount = semanticTopology.directClusterCount
const expectedAccountingClusterCount = semanticTopology.accountingClusterCount
const expectedDirectSourcePathCount = semanticTopology.directSourcePathCount
const expectedSupportSourcePathCount = semanticTopology.supportSourcePathCount
const expectedRetainedSourceRepairPathCount =
  semanticTopology.retainedSourceRepairPathCount
const expectedChangedSourcePathCount = semanticTopology.changedSourcePathCount
function expectedTestsForRepo(repo) {
  return listConfinedRepositoryFiles(repo, 'recovery/test', 'recovery tests')
    .filter(name => /^recovery-2\.1\.126-.*\.test\.mjs$/.test(name))
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
    const source = readConfinedRepositoryFile(
      repo,
      relative,
      `${relative}: local dependency scan`,
    ).toString('utf8')
    const ast = authenticatedParse(source, {
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
    return { ...after, mode: opened.mode & 0o777, value }
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

async function loadAuthenticatedParser(repo) {
  if (authenticatedParse !== null) return authenticatedParse
  const record = readConfinedCaseFileRecord(
    repo,
    PINNED_ACORN_PARSER.path,
    'pinned Acorn parser',
  )
  assert(
    record.value.length === PINNED_ACORN_PARSER.bytes,
    'pinned Acorn parser byte length',
  )
  assert(
    sha256(record.value) === PINNED_ACORN_PARSER.sha256,
    'pinned Acorn parser SHA-256',
  )
  assert(
    record.mode === PINNED_ACORN_PARSER.mode,
    'pinned Acorn parser mode',
  )
  const moduleUrl =
    `data:text/javascript;base64,${record.value.toString('base64')}` +
    `#sha256=${PINNED_ACORN_PARSER.sha256}`
  const namespace = await import(moduleUrl)
  assert(
    typeof namespace.parse === 'function',
    'authenticated Acorn module has no parse export',
  )
  authenticatedParse = namespace.parse
  return authenticatedParse
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
  const source = readConfinedRepositoryFile(
    repo,
    witness.path,
    `${witness.path}: source witness`,
  ).toString('utf8')
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

function gitOutput(repo, args, label) {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status})\n` +
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return result.stdout.trim()
}

function gitIsAncestor(repo, ancestor, descendant) {
  const result = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', ancestor, descendant],
    { cwd: repo, encoding: 'utf8' },
  )
  if (result.error) throw result.error
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(
    `git merge-base --is-ancestor failed (${result.status})\n` +
      `${result.stdout ?? ''}${result.stderr ?? ''}`,
  )
}

function authenticateArtifactRecord(root, artifact, label) {
  assert(artifact && typeof artifact.localPath === 'string',
    `${label}: missing artifact`)
  const record = readConfinedCaseFileRecord(
    root,
    artifact.localPath,
    `${label} artifact`,
  )
  const value = record.value
  assert(value.length === artifact.bytes, `${label}: byte length`)
  assert(sha256(value) === artifact.sha256, `${label}: SHA-256`)
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
    path.join(fs.realpathSync(os.tmpdir()), 'verify-2.1.126-semantic-'),
  )
  fs.chmodSync(root, 0o700)
  return root
}

function runSnapshotGit(cwd, arguments_, label) {
  const result = spawnSync('git', arguments_, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status})\n` +
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return result.stdout.trim()
}

function materializeSourceSnapshot(repo, snapshotRoot, targetCommit) {
  const sourceRoot = path.join(snapshotRoot, 'source-root')
  runSnapshotGit(
    snapshotRoot,
    ['clone', '--shared', '--no-checkout', '--quiet', '--', repo, sourceRoot],
    'private source clone',
  )
  runSnapshotGit(
    sourceRoot,
    ['sparse-checkout', 'init', '--cone'],
    'private source sparse-checkout initialization',
  )
  runSnapshotGit(
    sourceRoot,
    ['sparse-checkout', 'set', 'src'],
    'private source sparse-checkout selection',
  )
  runSnapshotGit(
    sourceRoot,
    ['checkout', '--detach', '--quiet', targetCommit],
    'private source checkout',
  )
  assert(
    runSnapshotGit(sourceRoot, ['rev-parse', 'HEAD'], 'private source identity') ===
      targetCommit,
    'private source commit identity',
  )
  return sourceRoot
}

async function main() {
  assertRelease21126TopologyFrozen()
  const args = parseArguments(process.argv.slice(2))
  if (!args.artifacts || !args['baseline-tarball']) {
    throw new Error(
      'Usage: verify-2.1.126-recovery.mjs --artifacts DIR ' +
        '--baseline-tarball FILE [--case manifest.json] [--repo DIR]',
    )
  }
  const repo = path.resolve(args.repo ?? defaultRepo)
  await loadAuthenticatedParser(repo)
  const actualTests = expectedTestsForRepo(repo)
  const expectedTestAssertions = expectedTestAssertionsForRepo(repo)
  const manifestPath = path.resolve(
    args.case ??
      path.join(
        repo,
        'recovery/cases/2.1.124-to-2.1.126/manifest.json',
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
  assert(manifest.case === '2.1.124-to-2.1.126', 'case identity')
  assert(
    manifest.releaseAdjacency?.baseline === '2.1.124' &&
      manifest.releaseAdjacency?.target === '2.1.126' &&
      manifest.releaseAdjacency?.targetIsNextPublishedVersion === true &&
      JSON.stringify(manifest.releaseAdjacency?.skipped) ===
        JSON.stringify(RELEASE_2_1_126.skipped) &&
      manifest.releaseAdjacency?.skippedVersionsAbsent === true &&
      manifest.releaseAdjacency?.publicGitReleaseTagPresent === true &&
      manifest.releaseAdjacency?.publicChangelogSectionPresent === true &&
      manifest.releaseAdjacency?.officialReleaseNotes ===
        RELEASE_2_1_126.officialSection &&
      manifest.releaseAdjacency?.skippedRegistryAbsence ===
        RELEASE_2_1_126.skippedRegistryAbsence,
    'published adjacency, public-release presence, and skipped-version absence',
  )
  assert(manifest.finalization?.status === 'complete', 'finalization status')
  assert(manifest.recoveryScope?.sourceClosurePending === false, 'source closure')
  assert(
    manifest.recoveryScope?.semanticClosurePending === false,
    'semantic closure',
  )
  const releasePresenceBytes = readConfinedCaseFile(
    caseRoot,
    RELEASE_2_1_126.officialReleasePresence,
    'authenticated public release presence evidence',
  )
  const releasePresence = JSON.parse(releasePresenceBytes)
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
      releasePresence.changelog?.section?.path ===
        RELEASE_2_1_126.officialSection,
    'authenticated public release presence evidence',
  )
  const skippedAbsenceBytes = readConfinedCaseFile(
    caseRoot,
    RELEASE_2_1_126.skippedRegistryAbsence,
    'skipped registry absence evidence',
  )
  const skippedAbsence = JSON.parse(skippedAbsenceBytes)
  assert(
    skippedAbsence.schemaVersion === 1 &&
      skippedAbsence.kind ===
        'authoritative-npm-registry-version-absence' &&
      skippedAbsence.release === RELEASE_2_1_126.skipped[0] &&
      JSON.stringify(skippedAbsence.semanticVersionGap) === JSON.stringify({
        baseline: RELEASE_2_1_126.baseline,
        skipped: RELEASE_2_1_126.skipped,
        target: RELEASE_2_1_126.target,
      }) &&
      skippedAbsence.publishedAdjacency?.targetIsNextPublishedVersion === true &&
      skippedAbsence.publishedAdjacency?.skippedVersionsAbsent === true &&
      Array.isArray(skippedAbsence.packages) &&
      skippedAbsence.packages.length === 2 &&
      skippedAbsence.packages.every(entry =>
        entry.packument?.skippedVersionPresent === false &&
          entry.packument?.skippedPublicationTimePresent === false &&
          entry.missingVersionEndpoint?.httpStatus === 404 &&
          entry.missingVersionEndpoint?.body?.json ===
            'version not found: 2.1.125'),
    'authoritative 2.1.125 registry absence evidence',
  )

  const attributionSummaryBytes = readConfinedCaseFile(
    caseRoot,
    'attribution/summary.json',
    'attribution summary',
  )
  const readableMetadataBytes = readConfinedCaseFile(
    caseRoot,
    'readable-diff/metadata.json',
    'readable-diff metadata',
  )
  const structuralValues = Object.fromEntries(
    Object.entries(expectedStructuralArtifacts).map(([key, record]) => [
      key,
      readPinnedStructural(caseRoot, record, `structural ${key}`),
    ]),
  )
  const knownDeltaProofValue = structuralValues.knownDeltaProof
  const knownDeltaProof = JSON.parse(knownDeltaProofValue)
  const generatedInputContract = assertRelease21126GeneratedInputContract({
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
    structural: {
      rawLedger: {
        bytes: structuralValues.rawLedger.length,
        sha256: sha256(structuralValues.rawLedger),
      },
      metadataNormalizedLedger: {
        bytes: structuralValues.metadataNormalizedLedger.length,
        sha256: sha256(structuralValues.metadataNormalizedLedger),
      },
      knownDeltaExactLedger: {
        bytes: structuralValues.knownDeltaExactLedger.length,
        sha256: sha256(structuralValues.knownDeltaExactLedger),
      },
      knownDeltaProof: {
        bytes: knownDeltaProofValue.length,
        sha256: sha256(knownDeltaProofValue),
      },
      targetUnits: knownDeltaProof.ledgers.knownDeltaExact.target.unitCount,
      targetTokens: knownDeltaProof.ledgers.knownDeltaExact.target.tokenCount,
    },
    structuralProof: knownDeltaProof,
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
  assertRelease21126SourceOracleDeclaration(
    manifest,
    generatedInputContract,
  )

  const semantic = manifest.generatedRecovery?.semanticCorrespondence
  assert(
    semantic?.status === 'verified-zero-unclassified-zero-unverified',
    'semantic status',
  )
  assert(
    semantic.changelog === RELEASE_2_1_126.officialSection &&
      semantic.publicReleasePresence ===
        RELEASE_2_1_126.officialReleasePresence &&
      semantic.skippedRegistryAbsence ===
        RELEASE_2_1_126.skippedRegistryAbsence &&
      semantic.baselineArtifact === 'baselineAnalyzableBundle' &&
      semantic.targetArtifact === 'targetAnalyzableBundle',
    'semantic proof uses adjacent bundles, public release, and skipped absence',
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
  const obligations = readPinned(
    caseRoot,
    semantic.fileIdentities.obligations,
    'semantic obligations',
  )
  assertRelease21126InheritedTestProvenance(obligations)
  assert(direct.rowCount === direct.rows.length, 'direct row count')
  assert(new Set(direct.rows.map(row => row.id)).size === direct.rowCount, 'row IDs')
  const expectedFocusedTests = [
    ...new Set(direct.rows.flatMap(row => row.focusedTests ?? [])),
  ].sort()
  const expectedTests = [
    'recovery/test/recovery-2.1.126-direct-evidence.test.mjs',
    ...expectedFocusedTests.map(
      id => `recovery/test/recovery-2.1.126-${id}.test.mjs`,
    ),
  ].sort()
  assert(expectedFocusedTests.includes('semantic-delta'),
    'focused tests include semantic delta')
  assert(
    JSON.stringify(actualTests) === JSON.stringify(expectedTests),
    '2.1.126 tests differ from exact direct-evidence bindings',
  )
  assert(
    direct.categoryCounts.official === 32 &&
      direct.categoryCounts.hidden === 1 &&
      direct.officialCoverage?.bulletCount ===
        RELEASE_2_1_126.officialBulletCount &&
      direct.officialCoverage?.activeAdjacent === 3 &&
      direct.officialCoverage?.retainedInherited === 29 &&
      direct.officialCoverage?.targetRetainedSourceRepair === 1 &&
      direct.officialCoverage?.nonActiveTotal === 30 &&
      direct.officialCoverage?.complete === true,
    'exact active, inherited, and target-retained catalog topology',
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
  const inheritedCatalogRows = direct.rows.filter(
    row => row.inheritedBaselineEvidence !== undefined,
  )
  const retainedRepairCatalogRows = direct.rows.filter(
    row => row.targetRetainedSourceRepair !== undefined,
  )
  assert(
    semanticCatalogRows.length === 3 &&
      supportCatalogRows.length === expectedSupportSourcePathCount &&
      inheritedCatalogRows.length === 29 &&
      retainedRepairCatalogRows.length === 1 &&
      semanticCatalogRows.length +
          supportCatalogRows.length +
          inheritedCatalogRows.length +
          retainedRepairCatalogRows.length ===
        direct.rowCount,
    'catalog rows partition active, support, inherited, and retained repair evidence',
  )
  assert(
    semanticCatalogRows.every(row =>
        row.evidenceKind === 'reviewed-row-scoped-direct-evidence' &&
        row.retained !== true &&
        row.sourceChangeSupport === undefined &&
        row.relatedDirectClusterIds === undefined &&
        Array.isArray(row.semanticTargetWitnesses) &&
        row.semanticTargetWitnesses.length === row.targetFragments.length &&
        row.semanticTargetWitnesses.every((witness, index) =>
          witness.kind === 'literal' &&
            typeof witness.value === 'string' &&
            witness.value.length > 0 &&
            Number.isSafeInteger(witness.count) &&
            witness.count >= 0 &&
            row.targetFragments[index].text === witness.value &&
            row.targetFragments[index].targetCount === witness.count) &&
        row.targetFragments.some(fragment =>
          fragment.baselineCount !== fragment.targetCount) &&
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
          Array.isArray(binding.sourceAbsences ?? []) &&
          binding.sourceWitnesses.length +
              (binding.sourceAbsences ?? []).length >
            0 &&
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
    inheritedCatalogRows.every(row =>
      row.category === 'official' &&
        row.retained === true &&
        row.evidenceKind === 'reviewed-inherited-baseline-row-evidence' &&
        Array.isArray(row.releaseBullets) &&
        row.releaseBullets.length === 1 &&
        Number.isSafeInteger(row.releaseBullets[0]) &&
        Array.isArray(row.inheritedBaselineEvidence?.rowIds) &&
        row.inheritedBaselineEvidence.rowIds.length > 0 &&
        row.semanticClusterIds === undefined &&
        row.sourceChangeSupport === undefined &&
        row.targetRetainedSourceRepair === undefined &&
        row.focusedTests.length === 0 &&
        row.targetFragments.every(fragment =>
          fragment.baselineCount > 0 &&
            fragment.baselineCount === fragment.targetCount)),
    'inherited official rows need sealed baseline evidence',
  )
  assert(
    retainedRepairCatalogRows.every(row =>
      row.id === 'B23' &&
        row.category === 'official' &&
        JSON.stringify(row.releaseBullets) === JSON.stringify([23]) &&
        row.retained === true &&
        row.evidenceKind === 'target-retained-source-repair' &&
        row.inheritedBaselineEvidence === undefined &&
        row.semanticClusterIds === undefined &&
        row.sourceChangeSupport === undefined &&
        row.targetRetainedSourceRepair
          ?.authenticatedBundleInvariant ===
            'unchanged-positive-counts-required' &&
        JSON.stringify(row.targetRetainedSourceRepair?.testIds) ===
          JSON.stringify(['retained-redraw']) &&
        JSON.stringify(row.focusedTests) ===
          JSON.stringify(['retained-redraw']) &&
        row.targetFragments.every(fragment =>
          fragment.baselineCount > 0 &&
            fragment.baselineCount === fragment.targetCount)),
    'target-retained Ctrl+L source repair evidence',
  )
  assert(
    summary.coverage.unclassifiedTokens === 0 &&
      summary.coverage.accountedTokens === summary.coverage.targetTokens,
    'whole-bundle token closure',
  )
  assert(
    summary.coverage.obligations.releaseBulletsCovered ===
        RELEASE_2_1_126.officialBulletCount &&
      summary.coverage.obligations.releaseBulletCount ===
        RELEASE_2_1_126.officialBulletCount,
    'authenticated official-bullet closure',
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
    'recovery/2.1.126-direct-evidence-specs.json',
    'recovery/cases/2.1.124-to-2.1.126/semantic/direct-evidence.json',
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
      .CLAUDE_CODE_2_1_124_WRAPPER === 'baselineBundle' &&
      manifest.sourceLineage.testArtifactEnvironment
        .CLAUDE_CODE_2_1_126_WRAPPER === 'targetBundle',
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
    sourceIdentity.target.srcTree === manifest.sourceLineage.targetSrcGitTree &&
      sourceIdentity.target.srcTree ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceSrcTree &&
      sourceIdentity.target.recoveredSourceCommit ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceCommit &&
      sourceIdentity.target.recoveredSourceCommitTree ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceCommitTree &&
      sourceIdentity.target.focusedTestCommit ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.focusedTestCommit &&
      sourceIdentity.target.retainedTestCommit ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.retainedTestCommit &&
      manifest.sourceLineage.recoveredSourceCommit ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceCommit &&
      manifest.sourceLineage.recoveredSourceCommitTree ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceCommitTree &&
      manifest.sourceLineage.focusedTestCommit ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.focusedTestCommit &&
      manifest.sourceLineage.retainedTestCommit ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.retainedTestCommit,
    'source and focused-test recovery freeze identities',
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
        'ae866640a6d67891fe14aeff5bc41da10784b979' &&
      /^[a-f0-9]{40}$/.test(sourceIdentity.target.commit) &&
      sourceIdentity.target.commit === manifest.sourceLineage.targetCommit &&
      sourceIdentity.base.tree === manifest.sourceLineage.baseGitTree &&
      sourceIdentity.base.srcTree === manifest.sourceLineage.baseSrcGitTree &&
      sourceIdentity.target.tree === manifest.sourceLineage.targetGitTree &&
      sourceIdentity.target.srcTree === manifest.sourceLineage.targetSrcGitTree,
    'source-freeze commit identities',
  )
  assert(
    gitOutput(repo, ['rev-parse', `${sourceIdentity.base.commit}^{tree}`],
      'resolve source-freeze base tree') === sourceIdentity.base.tree &&
      gitOutput(repo, ['rev-parse', `${sourceIdentity.base.commit}:src`],
        'resolve source-freeze base src tree') === sourceIdentity.base.srcTree &&
      gitOutput(repo, ['rev-parse', `${sourceIdentity.target.commit}^{tree}`],
        'resolve source-freeze target tree') === sourceIdentity.target.tree &&
      gitOutput(repo, ['rev-parse', `${sourceIdentity.target.commit}:src`],
        'resolve source-freeze target src tree') === sourceIdentity.target.srcTree,
    'source-freeze commit/tree identities differ from the repository',
  )
  assertRelease21126CommitReachability({
    baseToTarget: gitIsAncestor(
      repo,
      sourceIdentity.base.commit,
      sourceIdentity.target.commit,
    ),
    targetToHead: gitIsAncestor(repo, sourceIdentity.target.commit, 'HEAD'),
  })
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
  const frozenDiffCheck = readConfinedCaseFile(
    caseRoot,
    manifest.sourceFreeze.diffCheck.rawOutput,
    'frozen full-tree diff-check output',
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
    assert(
      structuralValues[key].equals(
        readPinnedStructural(caseRoot, metadata, `structural ${key}`),
      ),
      `${key}: structural artifact changed during verification`,
    )
  }
  assert(
    knownDeltaProof.complete === true &&
      knownDeltaProof.case === '2.1.124-to-2.1.126' &&
      knownDeltaProof.release === '2.1.126',
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
      clusterInventory.totalClusters === semanticTopology.totalClusters &&
      Array.isArray(clusterInventory.direct) &&
      clusterInventory.direct.length > 0 &&
      Array.isArray(clusterInventory.accountingOnly) &&
      clusterInventory.accountingOnly.length > 0 &&
      Array.isArray(clusterInventory.supportBindings) &&
      clusterInventory.supportBindings.length ===
        expectedSupportSourcePathCount &&
      Array.isArray(clusterInventory.targetRetainedRepairs) &&
      clusterInventory.targetRetainedRepairs.length === 1,
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
    new Set(allClusterIds).size === semanticTopology.totalClusters &&
      JSON.stringify(allClusterIds) === JSON.stringify(
        Array.from(
          { length: semanticTopology.totalClusters },
          (_, index) => index + 1,
        ),
      ),
    `semantic clusters partition exactly 1..${semanticTopology.totalClusters}`,
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
  const retainedRepairSourcePaths = [
    ...new Set(clusterInventory.targetRetainedRepairs.flatMap(
      entry => entry.sourcePaths,
    )),
  ].sort()
  assert(
    changedSourcePaths.length === expectedChangedSourcePathCount &&
      preciseClusterSourcePaths.length === expectedDirectSourcePathCount &&
      supportSourcePaths.length === expectedSupportSourcePathCount &&
      retainedRepairSourcePaths.length ===
        expectedRetainedSourceRepairPathCount &&
      new Set(supportSourcePaths).size === supportSourcePaths.length &&
      supportSourcePaths.every(sourcePath =>
        !preciseClusterSourcePaths.includes(sourcePath)) &&
      retainedRepairSourcePaths.every(sourcePath =>
        !preciseClusterSourcePaths.includes(sourcePath) &&
          !supportSourcePaths.includes(sourcePath)) &&
      JSON.stringify([
        ...preciseClusterSourcePaths,
        ...supportSourcePaths,
        ...retainedRepairSourcePaths,
      ].sort()) === JSON.stringify(changedSourcePaths),
    'adjacent owners, support paths, and retained repairs differ from changed source',
  )
  const proofChangedSourceInventory =
    knownDeltaProof.knownDelta?.changedSourcePaths
  assert(
    proofChangedSourceInventory?.baseRevision === RELEASE_2_1_126.baseRevision &&
      proofChangedSourceInventory.activeOverlayRevision ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.activeSourceCommit &&
      proofChangedSourceInventory.recoveredOverlayRevision ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceCommit &&
      proofChangedSourceInventory.recoveredSourceTree ===
        RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery.sourceSrcTree &&
      proofChangedSourceInventory.count === expectedChangedSourcePathCount &&
      JSON.stringify(proofChangedSourceInventory.paths) ===
        JSON.stringify(changedSourcePaths) &&
      JSON.stringify(proofChangedSourceInventory.partitions?.activeAdjacent) ===
        JSON.stringify({
          count: preciseClusterSourcePaths.length,
          paths: preciseClusterSourcePaths,
        }) &&
      JSON.stringify(
        proofChangedSourceInventory.partitions?.targetRetainedSourceRepairs,
      ) === JSON.stringify({
        count: retainedRepairSourcePaths.length,
        paths: retainedRepairSourcePaths,
      }),
    'known-delta changed-source revisions and partitions',
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
  const retainedRepair = clusterInventory.targetRetainedRepairs[0]
  assert(
    retainedRepair.rowId === 'ctrl-l-redraw' &&
      retainedRepair.disposition === 'target-retained-source-repair' &&
      retainedRepair.retained === true &&
      JSON.stringify(retainedRepair.releaseBullets) === JSON.stringify([23]) &&
      JSON.stringify(retainedRepair.sourcePaths) === JSON.stringify([
        'src/components/PromptInput/PromptInput.tsx',
      ]) &&
      JSON.stringify(retainedRepair.testIds) ===
        JSON.stringify(['retained-redraw']) &&
      retainedRepair.bundleSemantics?.byteIdenticalAcrossAdjacentBundles ===
        true &&
      Array.isArray(retainedRepair.bundleSemantics?.fragments) &&
      retainedRepair.bundleSemantics.fragments.length === 4 &&
      retainedRepair.bundleSemantics.fragments.every(fragment =>
        fragment.baselineCount > 0 &&
          fragment.baselineCount === fragment.targetCount) &&
      Array.isArray(retainedRepair.sourceWitnesses) &&
      retainedRepair.sourceWitnesses.length > 0 &&
      retainedRepair.sourceWitnesses.every(witness => {
        if (
          !safeSourcePath(witness.path) ||
          witness.reviewed !== true ||
          typeof witness.fragment !== 'string' ||
          witness.fragment.length === 0 ||
          !Number.isSafeInteger(witness.count) ||
          witness.count <= 0
        ) return false
        return occurrences(
          readConfinedRepositoryFile(
            repo,
            witness.path,
            `${witness.path}: retained repair source witness`,
          ).toString('utf8'),
          witness.fragment,
        ) === witness.count
      }),
    'known-delta target-retained source-repair inventory',
  )
  const releaseBulletClassification =
    knownDeltaProof.knownDelta?.releaseBulletClassification
  const allOfficialBullets = Array.from(
    { length: RELEASE_2_1_126.officialBulletCount },
    (_, index) => index + 1,
  )
  assert(
    releaseBulletClassification?.total ===
        RELEASE_2_1_126.officialBulletCount &&
      JSON.stringify(releaseBulletClassification.activeAdjacent) ===
        JSON.stringify([10, 17, 18]) &&
      JSON.stringify(releaseBulletClassification.baselineRetained) ===
        JSON.stringify(allOfficialBullets.filter(
          bullet => ![10, 17, 18].includes(bullet),
        )) &&
      JSON.stringify(releaseBulletClassification.hiddenAdjacentRows) ===
        JSON.stringify(['effort-settings-persistence']) &&
      JSON.stringify(releaseBulletClassification.retainedSourceRepairRows) ===
        JSON.stringify(['ctrl-l-redraw']),
    'known-delta release-bullet classification',
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
  const targetRetainedRepairsSha256 = sha256(Buffer.from(
    `${JSON.stringify(clusterInventory.targetRetainedRepairs)}\n`,
  ))
  assert(
    JSON.stringify(direct.clusterInventory?.proof) ===
        JSON.stringify(knownDeltaProofRepositoryMetadata) &&
      direct.clusterInventory?.totalClusters === semanticTopology.totalClusters &&
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
      direct.clusterInventory?.targetRetainedRepairCount ===
        clusterInventory.targetRetainedRepairs.length &&
      direct.clusterInventory?.targetRetainedRepairsSha256 ===
        targetRetainedRepairsSha256 &&
      direct.sourceRepairInventory?.rowCount === 1 &&
      direct.sourceRepairInventory?.pathCount ===
        expectedRetainedSourceRepairPathCount &&
      JSON.stringify(direct.sourceRepairInventory?.paths) ===
        JSON.stringify(retainedRepairSourcePaths) &&
      direct.coverageDeclarations?.clusterInventoryFullyBound === true &&
      direct.coverageDeclarations?.sourceSupportFullyBound === true &&
      direct.coverageDeclarations?.changedSourcePathsFullyBound === true,
    'direct catalog pins the semantic, support, and retained-repair inventory',
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
  const activeCatalogBySemanticRowId = new Map(
    semanticCatalogRows.map(row => [row.semanticRowId ?? row.id, row]),
  )
  const supportById = new Map(
    clusterInventory.supportBindings.map(binding => [binding.id, binding]),
  )
  assert(
    semanticDirectById.size === clusterInventory.direct.length &&
      activeCatalogBySemanticRowId.size === semanticCatalogRows.length &&
      supportById.size === clusterInventory.supportBindings.length &&
      [...supportById.keys()].every(id => !semanticDirectById.has(id)) &&
      [...semanticDirectById.keys()].every(id =>
        activeCatalogBySemanticRowId.has(id)) &&
      directById.size === direct.rowCount,
    'direct catalog rows consume every active semantic and support group',
  )
  assert(
    clusterInventory.direct.every(entry => {
      const row = activeCatalogBySemanticRowId.get(entry.rowId)
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
        ...new Set([
          ...bindingSourceWitnesses.map(witness => witness.path),
          ...entry.clusterBindings.flatMap(binding =>
            (binding.sourceAbsences ?? []).map(witness => witness.path)),
        ]),
      ].sort()
      const bindingTestIds = [
        ...new Set(entry.clusterBindings.flatMap(binding => binding.testIds)),
      ].sort()
      const sourceWitnessesValid = bindingSourceWitnesses.every(witness => {
        return reviewedSourceWitness(repo, witness, true)
      })
      const sourceAbsencesValid = entry.clusterBindings.every(binding =>
        Array.isArray(binding.sourceAbsences ?? []) &&
          binding.sourceWitnesses.length +
              (binding.sourceAbsences ?? []).length >
            0 &&
          (binding.sourceAbsences ?? []).every(witness =>
            safeSourcePath(witness?.path) &&
              typeof witness.fragment === 'string' &&
              witness.fragment.length > 0 &&
              occurrences(
                readConfinedRepositoryFile(
                  repo,
                  witness.path,
                  `${witness.path}: source absence witness`,
                ).toString('utf8'),
                witness.fragment,
              ) === 0))
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
        sourceAbsencesValid &&
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
  const retainedRepairRow = retainedRepairCatalogRows[0]
  assert(
    retainedRepairRow !== undefined &&
      JSON.stringify(retainedRepairRow.targetFragments.map(fragment =>
        fragment.text).sort()) ===
        JSON.stringify(retainedRepair.bundleSemantics.fragments.map(fragment =>
          fragment.text).sort()) &&
      retainedRepair.sourceWitnesses.every(witness =>
        retainedRepairRow.sourceAssertions.some(assertion =>
          JSON.stringify(sourceWitnessProjection(assertion)) ===
            JSON.stringify(sourceWitnessProjection(witness)))) &&
      JSON.stringify(retainedRepairRow.focusedTests) ===
        JSON.stringify(retainedRepair.testIds),
    'catalog target-retained repair differs from semantic proof',
  )
  const directRowIdsSha256 = sha256(Buffer.from(
    `${[...semanticDirectById.keys()].sort().join('\n')}\n`,
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
      structural.semanticClusterInventory.totalClusters ===
        semanticTopology.totalClusters &&
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
      structural.semanticClusterInventory.targetRetainedSourceRepairs ===
        clusterInventory.targetRetainedRepairs.length &&
      structural.semanticClusterInventory.retainedSourceRepairPaths ===
        retainedRepairSourcePaths.length &&
      JSON.stringify(structural.semanticClusterInventory.proof) ===
        JSON.stringify(knownDeltaProofRepositoryMetadata) &&
      structural.semanticClusterInventory.partitionSha256 ===
        direct.clusterInventory.partitionSha256,
    'manifest structural semantic cluster partition',
  )
  const exactLedger = knownDeltaProof.ledgers.knownDeltaExact
  assert(
    exactLedger.target.unitCount === structuralContract.targetUnits &&
      exactLedger.target.tokenCount === structuralContract.targetTokens &&
      exactLedger.target.failureCount === 0 &&
      exactLedger.coverage.units.changed === 0 &&
      exactLedger.coverage.units.moved === 0 &&
      exactLedger.coverage.units.unresolved === 0 &&
      exactLedger.coverage.units.matched === structuralContract.targetUnits &&
      exactLedger.coverage.tokens.changed === 0 &&
      exactLedger.coverage.tokens.moved === 0 &&
      exactLedger.coverage.tokens.unresolved === 0 &&
      exactLedger.coverage.tokens.matched === structuralContract.targetTokens &&
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
  for (const id of [
    'sourceOracleBundle',
    'sourceOracleMap',
    'baselineAnalyzableBundle',
    'targetAnalyzableBundle',
    'targetPackageJson',
    'targetDeclarations',
  ]) {
    authenticateArtifactRecord(artifactRoot, artifactById.get(id), id)
  }
  const snapshotCaseRecords = [
    expectedStructuralArtifacts.rawLedger,
    expectedStructuralArtifacts.metadataNormalizedLedger,
    expectedStructuralArtifacts.knownDeltaExactLedger,
    expectedStructuralArtifacts.knownDeltaProof,
    knownDeltaProof.artifacts.clusterLedger,
  ]
  assert(
    JSON.stringify(snapshotCaseRecords.map(record => record.path).sort()) ===
      JSON.stringify([
        'structural/generated-delta.json.gz',
        'structural/known-delta-ledger.json.gz',
        'structural/known-delta-proof.json',
        'structural/metadata-normalized-delta.json.gz',
        'structural/semantic-cluster-ledger.json.gz',
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
          'recovery/scripts/verify-2.1.126-semantic-delta.mjs',
        ),
        '--baseline',
        path.join(carrier.artifactsRoot, baselineAnalyzable.localPath),
        '--target',
        path.join(carrier.artifactsRoot, targetAnalyzable.localPath),
        '--case-root',
        carrier.caseRoot,
        '--source-root',
        carrier.repositoryRoot,
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
      semanticDeltaResult.status === '2.1.126-semantic-delta-verified' &&
        JSON.stringify(semanticDeltaResult.proof) ===
          JSON.stringify(expectedStructuralArtifacts.knownDeltaProof) &&
        semanticDeltaResult.exact.units.changed === 0 &&
        semanticDeltaResult.exact.units.moved === 0 &&
        semanticDeltaResult.exact.units.unresolved === 0 &&
        semanticDeltaResult.exact.units.matched === structuralContract.targetUnits &&
        semanticDeltaResult.exact.tokens.changed === 0 &&
        semanticDeltaResult.exact.tokens.moved === 0 &&
        semanticDeltaResult.exact.tokens.unresolved === 0 &&
        semanticDeltaResult.exact.tokens.matched === structuralContract.targetTokens,
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
        status: '2.1.126-fail-closed-recovery-verified',
        completeRecovery: result.status,
        sourceSemanticReproduction:
          result.checks.sourceSemanticReproduction,
        directRows: direct.rowCount,
        categoryCounts: direct.categoryCounts,
        officialBullets: RELEASE_2_1_126.officialBulletCount,
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
