#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'
import {
  RELEASE_2_1_126,
  RELEASE_2_1_126_GENERATED_INPUTS,
  assertRelease21126CommitReachability,
  assertRelease21126TopologyFrozen,
} from '../lib/release-2.1.126-input-contract.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.124-to-2.1.126')
const recoveredRoot = path.join(caseRoot, 'recovered')
const freezeRoot = path.join(recoveredRoot, 'source-freeze')
const overlayPath = path.join(recoveredRoot, 'source-facing-overlay.patch')
const freezeOverlayPath = path.join(freezeRoot, 'source-facing-overlay.patch')
const lineagePath = path.join(recoveredRoot, 'source-lineage-core.json')
const directEvidencePath = path.join(caseRoot, 'semantic/direct-evidence.json')
const directSpecsPath = path.join(
  repo,
  'recovery/2.1.126-direct-evidence-specs.json',
)
const baseRevision = RELEASE_2_1_126.baseRevision
const semanticTopology = RELEASE_2_1_126_GENERATED_INPUTS.semanticTopology
const sourceRecovery = RELEASE_2_1_126_GENERATED_INPUTS.sourceRecovery
const adjacentArtifacts = RELEASE_2_1_126_GENERATED_INPUTS.artifacts

// Freeze every release-scoped suite that exists at the target commit. This is
// intentionally discovered rather than hand-maintained: adding a focused
// recovery suite without consuming it changes the frozen test manifest and is
// rejected by the semantic verifier.
const targetTests = fs
  .readdirSync(path.join(repo, 'recovery/test'))
  .filter(name => /^recovery-2\.1\.126-.*\.test\.mjs$/.test(name))
  .map(name => `recovery/test/${name}`)
  .sort()
const semanticDeltaTest =
  'recovery/test/recovery-2.1.126-semantic-delta.test.mjs'
const targetTestDependencies = localModuleDependencies(targetTests)
const directEvidenceTopology = JSON.parse(
  fs.readFileSync(directEvidencePath, 'utf8'),
)
assert(
  Array.isArray(directEvidenceTopology.inputs) &&
    directEvidenceTopology.inputs.length > 0,
  'direct-evidence inputs are absent',
)
const directEvidenceInputPaths = directEvidenceTopology.inputs.map(entry => {
  const relative = entry.path
  assert(
    typeof relative === 'string' &&
      relative.startsWith('recovery/') &&
      !path.isAbsolute(relative) &&
      !relative.split('/').some(part => part === '' || part === '.' || part === '..'),
    `unsafe direct-evidence input path: ${relative}`,
  )
  return relative
})
assert(
  new Set(directEvidenceInputPaths).size === directEvidenceInputPaths.length,
  'duplicate direct-evidence input path',
)
const expectedFocusedTestIds = [
  ...new Set(
    directEvidenceTopology.rows.flatMap(row => row.focusedTests ?? []),
  ),
].sort()
const expectedTargetTests = [
  'recovery/test/recovery-2.1.126-direct-evidence.test.mjs',
  ...expectedFocusedTestIds.map(
    id => `recovery/test/recovery-2.1.126-${id}.test.mjs`,
  ),
].sort()
assert(
  directEvidenceTopology.case === '2.1.124-to-2.1.126' &&
    directEvidenceTopology.complete === true &&
    directEvidenceTopology.clusterInventory?.totalClusters ===
      semanticTopology.totalClusters &&
    Number.isSafeInteger(
      directEvidenceTopology.clusterInventory?.supportBindingCount,
    ) &&
    directEvidenceTopology.clusterInventory.supportBindingCount ===
      semanticTopology.supportSourcePathCount &&
    directEvidenceTopology.clusterInventory?.supportSourcePathCount ===
      directEvidenceTopology.clusterInventory.supportBindingCount &&
    directEvidenceTopology.clusterInventory?.targetRetainedRepairCount ===
      semanticTopology.retainedSourceRepairPathCount &&
    /^[0-9a-f]{64}$/.test(
      directEvidenceTopology.clusterInventory?.supportBindingsSha256 ?? '',
    ) &&
    /^[0-9a-f]{64}$/.test(
      directEvidenceTopology.clusterInventory
        ?.targetRetainedRepairsSha256 ?? '',
    ) &&
    directEvidenceTopology.sourceRepairInventory?.rowCount === 1 &&
    directEvidenceTopology.sourceRepairInventory?.pathCount ===
      semanticTopology.retainedSourceRepairPathCount &&
    JSON.stringify(directEvidenceTopology.sourceRepairInventory?.paths) ===
      JSON.stringify(['src/components/PromptInput/PromptInput.tsx']) &&
    directEvidenceTopology.coverageDeclarations
      ?.clusterInventoryFullyBound === true &&
    directEvidenceTopology.coverageDeclarations?.sourceSupportFullyBound === true,
  'direct-evidence test topology identity',
)
assert(
  JSON.stringify(targetTests) === JSON.stringify(expectedTargetTests),
  'release tests differ from the exact direct-evidence bindings',
)
assert(
  expectedFocusedTestIds.length === semanticTopology.focusedTestCount &&
    targetTests.length === semanticTopology.focusedTestCount + 1,
  'release test count differs from the frozen focused-test topology',
)
assert(
  targetTests.includes(semanticDeltaTest),
  'target tests must include semantic delta',
)

function usage() {
  console.error(
    'Usage: build-2.1.126-source-freeze.mjs ' +
      '--target-commit COMMIT --baseline-inner FILE --target-inner FILE ' +
      '--baseline-wrapper FILE --target-wrapper FILE ' +
      '[--allow-diff-check-sha256 HEX]',
  )
}

function parseArguments(argv) {
  const allowed = new Set([
    'allow-diff-check-sha256',
    'baseline-inner',
    'baseline-wrapper',
    'target-commit',
    'target-inner',
    'target-wrapper',
  ])
  const values = {}
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
    if (values[key] !== undefined) throw new Error(`duplicate ${argument}`)
    values[key] = value
  }
  return values
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function localModuleDependencies(entryPaths) {
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repo,
    encoding: options.encoding ?? 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status})\n` +
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return result.stdout
}

function git(args, options = {}) {
  return run('git', args, options)
}

function gitIsAncestor(ancestor, descendant) {
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

function write(relative, value) {
  const filename = path.join(freezeRoot, relative)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, value)
  return filename
}

function metadata(filename, root = caseRoot) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(root, filename).replaceAll('\\', '/'),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function assertCommitFileMatches(revision, relative) {
  assert(
    !path.isAbsolute(relative) &&
      !relative.split('/').includes('..') &&
      relative.length > 0,
    `unsafe target-commit file path: ${relative}`,
  )
  const filename = path.join(repo, relative)
  const status = fs.lstatSync(filename)
  assert(
    status.isFile() && !status.isSymbolicLink(),
    `${relative}: working-tree input must be a regular file`,
  )
  const committed = git(['show', `${revision}:${relative}`], {
    encoding: 'buffer',
  })
  const working = fs.readFileSync(filename)
  assert(
    working.equals(committed),
    `${relative}: working tree differs from target commit`,
  )
  return metadata(filename, repo)
}

function walkFiles(root) {
  const pending = [root]
  const files = []
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const filename = path.join(directory, entry.name)
      const status = fs.lstatSync(filename)
      assert(!status.isSymbolicLink(), `source symlink: ${filename}`)
      if (status.isDirectory()) pending.push(filename)
      else if (status.isFile()) files.push(filename)
      else throw new Error(`non-regular source entry: ${filename}`)
    }
  }
  return files.sort((left, right) => {
    const leftRelative = path.relative(root, left)
    const rightRelative = path.relative(root, right)
    if (leftRelative === rightRelative) return 0
    return leftRelative < rightRelative ? -1 : 1
  })
}

function summarizeSourceTree(sourceRoot) {
  const records = walkFiles(sourceRoot).map(filename => {
    const value = fs.readFileSync(filename)
    return {
      path: `src/${path.relative(sourceRoot, filename).replaceAll('\\', '/')}`,
      filename,
      bytes: value.length,
      sha256: sha256(value),
    }
  })
  const framed = crypto.createHash('sha256')
  let bytes = 0
  for (const record of records) {
    bytes += record.bytes
    framed
      .update(record.path)
      .update('\0')
      .update(String(record.bytes))
      .update('\0')
      .update(record.sha256)
      .update('\n')
  }
  return {
    files: records.length,
    bytes,
    manifestSha256: framed.digest('hex'),
    records,
  }
}

function publicSummary(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function assertTreesEqual(left, right, label) {
  assert(left.records.length === right.records.length, `${label}: file count`)
  for (let index = 0; index < left.records.length; index += 1) {
    const a = left.records[index]
    const b = right.records[index]
    assert(a.path === b.path, `${label}: path ${index}`)
    assert(a.bytes === b.bytes, `${label}: ${a.path} bytes`)
    assert(a.sha256 === b.sha256, `${label}: ${a.path} SHA-256`)
  }
}

function extractRevision(revision, destination, archivePath) {
  fs.mkdirSync(destination)
  git(['archive', '--format=tar', `--output=${archivePath}`, revision, 'src'])
  run('tar', ['-xf', archivePath, '-C', destination])
  fs.rmSync(archivePath)
}

function testManifest(files) {
  return `${files
    .map(relative => `${sha256(fs.readFileSync(path.join(repo, relative)))}  ${relative}`)
    .join('\n')}\n`
}

function bundle(filename, bytes, digest, label) {
  const value = fs.readFileSync(filename)
  assert(value.length === bytes, `${label}: byte length`)
  assert(sha256(value) === digest, `${label}: SHA-256`)
  return path.resolve(filename)
}

function testSummary(stdout) {
  const read = label => {
    const match = stdout.match(new RegExp(`(?:ℹ|#) ${label} (\\d+)`))
    assert(match, `test output has no ${label} summary`)
    return Number(match[1])
  }
  return { tests: read('tests'), passed: read('pass'), failed: read('fail') }
}

function main() {
  assertRelease21126TopologyFrozen()
  const args = parseArguments(process.argv.slice(2))
  for (const required of [
    'target-commit',
    'baseline-inner',
    'target-inner',
    'baseline-wrapper',
    'target-wrapper',
  ]) {
    if (args[required] === undefined) {
      usage()
      process.exitCode = 2
      return
    }
  }

  const baseCommit = git(['rev-parse', `${baseRevision}^{commit}`]).trim()
  const targetCommit = git([
    'rev-parse',
    `${args['target-commit']}^{commit}`,
  ]).trim()
  assert(/^[a-f0-9]{40}$/.test(targetCommit), 'target commit identity')
  assertRelease21126CommitReachability({
    baseToTarget: gitIsAncestor(baseCommit, targetCommit),
    targetToHead: gitIsAncestor(targetCommit, 'HEAD'),
  })
  assert(
    git(['merge-base', '--is-ancestor', sourceRecovery.sourceCommit, targetCommit]) === '',
    'target commit does not descend from the frozen source recovery commit',
  )
  assert(
    git(['rev-parse', `${sourceRecovery.sourceCommit}^{tree}`]).trim() ===
        sourceRecovery.sourceCommitTree &&
      git(['rev-parse', `${sourceRecovery.sourceCommit}:src`]).trim() ===
        sourceRecovery.sourceSrcTree &&
      git(['rev-parse', `${targetCommit}:src`]).trim() ===
        sourceRecovery.sourceSrcTree,
    'target commit source tree differs from the frozen recovered source tree',
  )
  git([
    'merge-base',
    '--is-ancestor',
    sourceRecovery.focusedTestCommit,
    sourceRecovery.sourceCommit,
  ])
  git([
    'merge-base',
    '--is-ancestor',
    sourceRecovery.retainedTestCommit,
    sourceRecovery.sourceCommit,
  ])
  run('git', ['diff', '--quiet', targetCommit, '--', 'src'])
  const targetCommitFilePaths = [...new Set([
    ...targetTests,
    ...targetTestDependencies,
    ...directEvidenceInputPaths,
    path.relative(repo, directEvidencePath).replaceAll('\\', '/'),
    path.relative(repo, directSpecsPath).replaceAll('\\', '/'),
  ])].sort()
  const targetCommitFileAssertions = targetCommitFilePaths.map(relative =>
    assertCommitFileMatches(targetCommit, relative),
  )
  const targetCommitAssertionByPath = new Map(
    targetCommitFileAssertions.map(entry => [entry.path, entry]),
  )
  for (const entry of directEvidenceTopology.inputs) {
    assert(
      JSON.stringify(targetCommitAssertionByPath.get(entry.path)) ===
        JSON.stringify(entry),
      `${entry.path}: direct-evidence input identity differs from target commit`,
    )
  }
  const directEvidence = JSON.parse(fs.readFileSync(directEvidencePath, 'utf8'))
  assert(
    directEvidence.case === '2.1.124-to-2.1.126' &&
      directEvidence.complete === true &&
      Array.isArray(directEvidence.changedSourceRows),
    'direct evidence source-boundary identity',
  )

  const baselineInner = bundle(
    args['baseline-inner'],
    adjacentArtifacts.baselineAnalyzableBundle.bytes,
    adjacentArtifacts.baselineAnalyzableBundle.sha256,
    '2.1.124 inner bundle',
  )
  const targetInner = bundle(
    args['target-inner'],
    adjacentArtifacts.targetAnalyzableBundle.bytes,
    adjacentArtifacts.targetAnalyzableBundle.sha256,
    '2.1.126 inner bundle',
  )
  const baselineWrapper = bundle(
    args['baseline-wrapper'],
    sourceRecovery.baselineWrapperBundle.bytes,
    sourceRecovery.baselineWrapperBundle.sha256,
    '2.1.124 wrapper bundle',
  )
  const targetWrapper = bundle(
    args['target-wrapper'],
    sourceRecovery.targetWrapperBundle.bytes,
    sourceRecovery.targetWrapperBundle.sha256,
    '2.1.126 wrapper bundle',
  )

  const overlay = git(
    [
      'diff',
      '--binary',
      '--full-index',
      '--no-ext-diff',
      '--no-renames',
      baseCommit,
      targetCommit,
      '--',
      'src',
    ],
    { encoding: 'buffer' },
  )
  assert(overlay.length > 0, 'source overlay is empty')
  fs.mkdirSync(freezeRoot, { recursive: true })
  fs.writeFileSync(overlayPath, overlay)
  fs.writeFileSync(freezeOverlayPath, overlay)

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-2.1.126-source-freeze-'),
  )
  let baseSummary
  let targetSummary
  try {
    const baseWorkspace = path.join(temporaryRoot, 'base')
    const targetWorkspace = path.join(temporaryRoot, 'target')
    const reverseWorkspace = path.join(temporaryRoot, 'reverse')
    extractRevision(
      baseCommit,
      baseWorkspace,
      path.join(temporaryRoot, 'base.tar'),
    )
    extractRevision(
      targetCommit,
      targetWorkspace,
      path.join(temporaryRoot, 'target.tar'),
    )
    baseSummary = summarizeSourceTree(path.join(baseWorkspace, 'src'))
    targetSummary = summarizeSourceTree(path.join(targetWorkspace, 'src'))
    assertTreesEqual(
      targetSummary,
      summarizeSourceTree(path.join(repo, 'src')),
      'target commit versus repository',
    )

    git(['apply', '--check', overlayPath], { cwd: baseWorkspace })
    git(['apply', overlayPath], { cwd: baseWorkspace })
    assertTreesEqual(
      targetSummary,
      summarizeSourceTree(path.join(baseWorkspace, 'src')),
      'forward-applied overlay versus target',
    )
    fs.cpSync(targetWorkspace, reverseWorkspace, { recursive: true })
    git(['apply', '--reverse', '--check', overlayPath], {
      cwd: reverseWorkspace,
    })
    git(['apply', '--reverse', overlayPath], { cwd: reverseWorkspace })
    assertTreesEqual(
      baseSummary,
      summarizeSourceTree(path.join(reverseWorkspace, 'src')),
      'reverse-applied overlay versus base',
    )
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }

  const nameStatus = git([
    'diff',
    '--name-status',
    '--no-renames',
    baseCommit,
    targetCommit,
    '--',
    'src',
  ])
  const changed = nameStatus
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, sourcePath] = line.split('\t')
      assert(['A', 'M', 'D'].includes(status), `unsupported status: ${line}`)
      return { status, path: sourcePath }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
  assert(changed.length > 0, 'no changed source paths')
  assert(
    JSON.stringify(changed.map(entry => entry.path)) ===
        JSON.stringify(sourceRecovery.changedSourcePaths) &&
      JSON.stringify(changed) === JSON.stringify(directEvidence.changedSourceRows),
    'source delta differs from the reviewed direct-evidence boundary',
  )
  const baseByPath = new Map(baseSummary.records.map(row => [row.path, row]))
  const targetByPath = new Map(targetSummary.records.map(row => [row.path, row]))
  const changedFiles = changed.map(entry => ({
    ...entry,
    base: baseByPath.has(entry.path)
      ? {
          bytes: baseByPath.get(entry.path).bytes,
          sha256: baseByPath.get(entry.path).sha256,
        }
      : null,
    target: targetByPath.has(entry.path)
      ? {
          bytes: targetByPath.get(entry.path).bytes,
          sha256: targetByPath.get(entry.path).sha256,
        }
      : null,
  }))

  const numstat = git([
    'diff',
    '--numstat',
    '--no-renames',
    baseCommit,
    targetCommit,
    '--',
    'src',
  ])
  const numberRows = numstat
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [insertions, deletions, sourcePath] = line.split('\t')
      assert(/^\d+$/.test(insertions) && /^\d+$/.test(deletions), line)
      return {
        path: sourcePath,
        insertions: Number(insertions),
        deletions: Number(deletions),
      }
    })
  assert(numberRows.length === changed.length, 'numstat path count')

  const sourceDiffCheck = spawnSync(
    'git',
    ['diff', '--check', baseCommit, targetCommit, '--', 'src'],
    { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  assert(sourceDiffCheck.status === 0, 'source git diff --check status')
  const sourceDiffCheckRaw =
    `${sourceDiffCheck.stdout ?? ''}${sourceDiffCheck.stderr ?? ''}`
  assert(sourceDiffCheckRaw.length === 0, 'source git diff --check diagnostics')

  const diffCheck = spawnSync(
    'git',
    ['diff', '--check', baseCommit, targetCommit],
    { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  assert([0, 2].includes(diffCheck.status), 'git diff --check status')
  const diffCheckRaw = `${diffCheck.stdout ?? ''}${diffCheck.stderr ?? ''}`
  const diagnosticLines = diffCheckRaw.split('\n').filter(Boolean).length
  const diffCheckSha256 = sha256(Buffer.from(diffCheckRaw))
  if (diagnosticLines > 0) {
    assert(
      args['allow-diff-check-sha256'] === diffCheckSha256,
      `git diff --check produced ${diagnosticLines} lines; review and rerun ` +
        `with --allow-diff-check-sha256 ${diffCheckSha256}`,
    )
  } else {
    assert(
      args['allow-diff-check-sha256'] === undefined,
      'diff-check allowlist supplied but output is empty',
    )
  }

  const testEnvironment = {
    ...process.env,
    CLAUDE_CODE_2_1_124_BUNDLE: baselineInner,
    CLAUDE_CODE_2_1_126_BUNDLE: targetInner,
    CLAUDE_CODE_2_1_124_WRAPPER: baselineWrapper,
    CLAUDE_CODE_2_1_126_WRAPPER: targetWrapper,
  }
  const tests = run(process.execPath, ['--test', ...targetTests], {
    env: testEnvironment,
  })
  const testsVerified = testSummary(tests)
  assert(testsVerified.failed === 0, 'target tests failed')

  const syntaxCheck = changed
    .map(entry => entry.path)
    .filter(sourcePath =>
      targetByPath.has(sourcePath) && /\.(?:js|jsx|ts|tsx)$/.test(sourcePath),
    )
  const syntaxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-2.1.126-syntax-'))
  try {
    for (const [index, sourcePath] of syntaxCheck.entries()) {
      run(
        'bun',
        [
          'build',
          path.join(repo, sourcePath),
          '--target=bun',
          '--external=*',
          `--outfile=${path.join(syntaxRoot, `${index}.js`)}`,
        ],
      )
    }
  } finally {
    fs.rmSync(syntaxRoot, { recursive: true, force: true })
  }

  const retainedTests = JSON.parse(
    fs.readFileSync(
      path.join(repo, 'recovery/cases/2.1.123-to-2.1.124/manifest.json'),
      'utf8',
    ),
  ).sourceLineage.testFiles
  const directMetadata = metadata(directEvidencePath, repo)
  const directTestMetadata = metadata(
    path.join(repo, 'recovery/test/recovery-2.1.126-direct-evidence.test.mjs'),
    repo,
  )
  write('source-paths.txt', nameStatus)
  write('source-numstat.tsv', numstat)
  write(
    'source-stat.txt',
    git([
      'diff',
      '--stat',
      '--no-renames',
      baseCommit,
      targetCommit,
      '--',
      'src',
    ]),
  )
  write(
    'source-files.sha256',
    `${targetSummary.records
      .map(record => `${record.sha256}  ${record.path}`)
      .join('\n')}\n`,
  )
  write('source-symlinks.txt', '')
  write('target-test-files.sha256', testManifest(targetTests))
  write('retained-test-files.sha256', testManifest(retainedTests))
  write(
    'adjacent-direct-evidence.sha256',
    `${directMetadata.sha256}  ${directMetadata.path}\n`,
  )
  write('diff-check.raw.txt', diffCheckRaw)
  write(
    'diff-check-allowlist.txt',
    diagnosticLines === 0
      ? 'reviewed diagnostics: 0; no allowlist required\n'
      : `reviewed exact git diff --check output: ${diagnosticLines} line(s)\n` +
          `sha256: ${diffCheckSha256}\n`,
  )
  write('applied-src-byte-compare.txt', 'identical\n')
  write('forward-src-byte-compare.txt', 'identical\n')

  const patchStats = {
    files: changed.length,
    modified: changed.filter(entry => entry.status === 'M').length,
    added: changed.filter(entry => entry.status === 'A').length,
    deleted: changed.filter(entry => entry.status === 'D').length,
    insertions: numberRows.reduce((sum, entry) => sum + entry.insertions, 0),
    deletions: numberRows.reduce((sum, entry) => sum + entry.deletions, 0),
  }
  const overlayMetadata = metadata(overlayPath)
  const targetTestManifest = metadata(
    path.join(freezeRoot, 'target-test-files.sha256'),
    freezeRoot,
  )
  const retainedTestManifest = metadata(
    path.join(freezeRoot, 'retained-test-files.sha256'),
    freezeRoot,
  )
  const directManifest = metadata(
    path.join(freezeRoot, 'adjacent-direct-evidence.sha256'),
    freezeRoot,
  )
  const identity = {
    schemaVersion: 1,
    case: '2.1.124-to-2.1.126',
    kind: 'authenticated-source-overlay-freeze',
    base: {
      commit: baseCommit,
      tree: git(['rev-parse', `${baseCommit}^{tree}`]).trim(),
      srcTree: git(['rev-parse', `${baseCommit}:src`]).trim(),
      bundleSha256:
        adjacentArtifacts.baselineAnalyzableBundle.sha256,
    },
    target: {
      commit: targetCommit,
      tree: git(['rev-parse', `${targetCommit}^{tree}`]).trim(),
      srcTree: git(['rev-parse', `${targetCommit}:src`]).trim(),
      recoveredSourceCommit: sourceRecovery.sourceCommit,
      recoveredSourceCommitTree: sourceRecovery.sourceCommitTree,
      focusedTestCommit: sourceRecovery.focusedTestCommit,
      retainedTestCommit: sourceRecovery.retainedTestCommit,
      bundleSha256:
        adjacentArtifacts.targetAnalyzableBundle.sha256,
    },
    overlay: {
      path: 'source-facing-overlay.patch',
      bytes: overlayMetadata.bytes,
      sha256: overlayMetadata.sha256,
      lines: overlay.toString('utf8').split('\n').length - 1,
      changedPaths: changed.length,
      insertions: patchStats.insertions,
      deletions: patchStats.deletions,
    },
    source: {
      files: targetSummary.files,
      bytes: targetSummary.bytes,
      symlinks: 0,
    },
    verification: {
      applyToBaseTree: true,
      completeSrcByteCompare: true,
      reverseToBaseTree: true,
      forwardToTargetTree: true,
      diffCheck: {
        scope: 'full-target-tree',
        sourceDiagnosticLines: 0,
        diagnosticLines,
        sha256: diffCheckSha256,
        reviewed: true,
      },
      targetTests: {
        ...testsVerified,
        files: targetTests.length,
        manifest: targetTestManifest.path,
        manifestSha256: targetTestManifest.sha256,
      },
      retainedTests: {
        files: retainedTests.length,
        manifest: retainedTestManifest.path,
        manifestSha256: retainedTestManifest.sha256,
      },
      syntaxBuilds: { passed: syntaxCheck.length, failed: 0 },
      adjacentDirectEvidence: {
        catalog: directMetadata,
        test: directTestMetadata,
        manifest: directManifest.path,
        manifestSha256: directManifest.sha256,
      },
    },
  }
  write('identity.json', `${JSON.stringify(identity, null, 2)}\n`)

  const sumPaths = [
    'source-facing-overlay.patch',
    'source-paths.txt',
    'source-stat.txt',
    'source-numstat.tsv',
    'source-files.sha256',
    'source-symlinks.txt',
    'target-test-files.sha256',
    'retained-test-files.sha256',
    'adjacent-direct-evidence.sha256',
    'diff-check.raw.txt',
    'diff-check-allowlist.txt',
    'applied-src-byte-compare.txt',
    'forward-src-byte-compare.txt',
    'identity.json',
  ]
  write(
    'SHA256SUMS',
    `${sumPaths
      .map(relative =>
        `${sha256(fs.readFileSync(path.join(freezeRoot, relative)))}  ${relative}`,
      )
      .join('\n')}\n`,
  )

  const testFileAssertions = [...targetTests, ...targetTestDependencies]
    .sort()
    .map(relative => metadata(path.join(repo, relative), repo))
  const sourceLineage = {
    root: 'src',
    baseCommit,
    baseGitTree: identity.base.tree,
    baseSrcGitTree: identity.base.srcTree,
    targetCommit,
    targetGitTree: identity.target.tree,
    targetSrcGitTree: identity.target.srcTree,
    recoveredSourceCommit: sourceRecovery.sourceCommit,
    recoveredSourceCommitTree: sourceRecovery.sourceCommitTree,
    focusedTestCommit: sourceRecovery.focusedTestCommit,
    retainedTestCommit: sourceRecovery.retainedTestCommit,
    patchSet: '2.1.124-to-2.1.126-incremental',
    patchOrder: ['recovered/source-facing-overlay.patch'],
    patchStats,
    patch: overlayMetadata,
    base: publicSummary(baseSummary),
    target: publicSummary(targetSummary),
    changedFiles,
    syntaxCheck,
    testFiles: targetTests,
    targetCommitFileAssertions,
    testArtifactEnvironment: {
      CLAUDE_CODE_2_1_124_BUNDLE: 'baselineAnalyzableBundle',
      CLAUDE_CODE_2_1_126_BUNDLE: 'targetAnalyzableBundle',
      CLAUDE_CODE_2_1_124_WRAPPER: 'baselineBundle',
      CLAUDE_CODE_2_1_126_WRAPPER: 'targetBundle',
    },
    testFileAssertions,
  }
  fs.writeFileSync(lineagePath, `${JSON.stringify(sourceLineage, null, 2)}\n`)

  console.log(
    JSON.stringify({
      status: '2.1.126-source-freeze-built',
      targetCommit,
      overlay: overlayMetadata,
      patchStats,
      source: publicSummary(targetSummary),
      tests: testsVerified,
      syntaxBuilds: syntaxCheck.length,
      diffCheck: identity.verification.diffCheck,
      identity: metadata(path.join(freezeRoot, 'identity.json')),
      sourceLineage: metadata(lineagePath),
    }),
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
