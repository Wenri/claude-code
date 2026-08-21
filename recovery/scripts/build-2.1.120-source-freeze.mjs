#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.119-to-2.1.120')
const recoveredRelative = 'recovered'
const freezeRelative = `${recoveredRelative}/source-freeze`
const overlayRelative = `${recoveredRelative}/source-facing-overlay.patch`
const freezeOverlayRelative = `${freezeRelative}/source-facing-overlay.patch`
const lineageRelative = `${recoveredRelative}/source-lineage-core.json`
const directEvidencePath = path.join(caseRoot, 'semantic/direct-evidence.json')
const baseRevision = '351cd4d13f70a564dc2d90f59ab0093dc6fc7b05'
const targetIdentity = Object.freeze({
  commit: '6801ead984ba2c3df02bd092ad8b93df096ed8c1',
  tree: '6284c518a191674bf3e42869e05cad35dcaeabf0',
  srcTree: 'a80c537f012b1588e3900c998971fec31eefc3ce',
})
const retainedManifestIdentity = Object.freeze({
  bytes: 360_450,
  sha256: '3e40037dd64d27eda8a0fa16c6a7fcdcef314842050e37b6fae7b57c9d1c2b0d',
})

const targetTests = [
  'recovery/test/recovery-2.1.120-official-bullets.test.mjs',
  'recovery/test/recovery-2.1.120-hidden-obligations.test.mjs',
  'recovery/test/recovery-2.1.120-daemon-lifecycle.test.mjs',
  'recovery/test/recovery-2.1.120-selection-scrollback.test.mjs',
  'recovery/test/recovery-2.1.120-direct-evidence.test.mjs',
  'recovery/test/recovery-2.1.120-fleet-auto-relaunch.test.mjs',
  'recovery/test/recovery-2.1.120-team-memory-sync.test.mjs',
  'recovery/test/recovery-2.1.120-notifications-inherited.test.mjs',
  'recovery/test/recovery-2.1.120-subagent-status-line.test.mjs',
]

function usage() {
  console.error(
    'Usage: build-2.1.120-source-freeze.mjs ' +
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function compareText(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
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

function assertOutputRelative(relative) {
  assert(
    typeof relative === 'string' &&
      relative.startsWith(`${recoveredRelative}/`) &&
      path.posix.normalize(relative) === relative &&
      !relative.split('/').includes('..'),
    `unsafe staged output path: ${String(relative)}`,
  )
}

function stageOutput(outputs, relative, value) {
  assertOutputRelative(relative)
  assert(!outputs.has(relative), `duplicate staged output: ${relative}`)
  outputs.set(
    relative,
    Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value)),
  )
}

function stageFreezeOutput(outputs, relative, value) {
  stageOutput(outputs, `${freezeRelative}/${relative}`, value)
}

function stagedMetadata(outputs, relative, rootRelative = '') {
  const value = outputs.get(relative)
  assert(value !== undefined, `missing staged output: ${relative}`)
  return {
    path: path.posix.relative(rootRelative, relative),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function lstatIfExists(filename, label) {
  try {
    return fs.lstatSync(filename)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw new Error(`${label} is not accessible: ${filename}`, {
      cause: error,
    })
  }
}

function assertRealDirectory(directory, label) {
  const status = lstatIfExists(directory, label)
  assert(
    status !== null && status.isDirectory() && !status.isSymbolicLink(),
    `${label} is not a real directory: ${directory}`,
  )
}

function ensureRealChildDirectory(parent, name, label, createdDirectories) {
  assert(!name.includes(path.sep), `${label} has an unsafe name`)
  assertRealDirectory(parent, `${label} parent`)
  const directory = path.join(parent, name)
  let status = lstatIfExists(directory, label)
  if (status === null) {
    fs.mkdirSync(directory)
    createdDirectories.push(directory)
    status = fs.lstatSync(directory)
  }
  assert(
    status.isDirectory() && !status.isSymbolicLink(),
    `${label} is not a real directory: ${directory}`,
  )
  return directory
}

function publicationOrder(outputs) {
  const identityRelative = `${freezeRelative}/identity.json`
  const sumsRelative = `${freezeRelative}/SHA256SUMS`
  const freezeLeaves = [...outputs.keys()]
    .filter(
      relative =>
        relative.startsWith(`${freezeRelative}/`) &&
        relative !== identityRelative &&
        relative !== sumsRelative,
    )
    .sort(compareText)
  const expected = new Set([
    ...freezeLeaves,
    overlayRelative,
    lineageRelative,
    identityRelative,
    sumsRelative,
  ])
  assert(
    expected.size === outputs.size &&
      [...outputs.keys()].every(relative => expected.has(relative)),
    'invalid staged publication set',
  )

  // Publish the outer overlay before the lineage that authenticates it. The
  // identity and its checksum ledger are the final two commit markers.
  return [
    ...freezeLeaves,
    overlayRelative,
    lineageRelative,
    identityRelative,
    sumsRelative,
  ]
}

function publishStagedOutputs(outputs) {
  const transaction = crypto.randomBytes(12).toString('hex')
  const lockPath = path.join(caseRoot, '.source-freeze-publish.lock')
  const createdDirectories = []
  const prepared = []
  const published = []
  const cleanupErrors = []
  const preservedBackups = new Set()
  let lockDescriptor
  let failure = null
  let completed = false

  const captureCleanup = action => {
    try {
      action()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  try {
    assertRealDirectory(caseRoot, 'source-freeze case root')
    lockDescriptor = fs.openSync(lockPath, 'wx', 0o600)
    fs.writeFileSync(lockDescriptor, `${process.pid}\n`)
    const recoveredDirectory = ensureRealChildDirectory(
      caseRoot,
      recoveredRelative,
      'source-freeze recovered root',
      createdDirectories,
    )
    const freezeDirectory = ensureRealChildDirectory(
      recoveredDirectory,
      'source-freeze',
      'source-freeze output root',
      createdDirectories,
    )
    const allowedFreezeEntries = new Set(
      [...outputs.keys()]
        .filter(relative => relative.startsWith(`${freezeRelative}/`))
        .map(relative => relative.slice(freezeRelative.length + 1)),
    )
    const unexpectedFreezeEntries = fs
      .readdirSync(freezeDirectory)
      .filter(name => !allowedFreezeEntries.has(name))
      .sort(compareText)
    assert(
      unexpectedFreezeEntries.length === 0,
      `unexpected existing source-freeze entries: ${unexpectedFreezeEntries.join(', ')}`,
    )

    for (const relative of publicationOrder(outputs)) {
      assertOutputRelative(relative)
      const value = outputs.get(relative)
      const filename = relative.startsWith(`${freezeRelative}/`)
        ? path.join(
            freezeDirectory,
            relative.slice(freezeRelative.length + 1),
          )
        : path.join(recoveredDirectory, path.posix.basename(relative))
      const parent = path.dirname(filename)
      assertRealDirectory(parent, `publication parent for ${relative}`)
      const existing = lstatIfExists(filename, `publication target ${relative}`)
      assert(
        existing === null ||
          (existing.isFile() && !existing.isSymbolicLink()),
        `publication target is not a real file: ${relative}`,
      )
      const temporary = path.join(
        parent,
        `.${path.basename(filename)}.${transaction}.tmp`,
      )
      const backup = path.join(
        parent,
        `.${path.basename(filename)}.${transaction}.bak`,
      )
      const record = {
        backup,
        existed: existing !== null,
        filename,
        relative,
        temporary,
      }
      prepared.push(record)
      fs.writeFileSync(temporary, value, { flag: 'wx' })
      if (existing !== null) {
        fs.copyFileSync(filename, backup, fs.constants.COPYFILE_EXCL)
      }
    }
    for (const record of prepared) {
      const { filename, relative, temporary } = record
      assertRealDirectory(
        path.dirname(filename),
        `publication commit parent for ${relative}`,
      )
      fs.renameSync(temporary, filename)
      published.push(record)
    }
    completed = true
  } catch (error) {
    failure = error
    for (const record of [...published].reverse()) {
      try {
        if (record.existed) {
          fs.renameSync(record.backup, record.filename)
        } else {
          fs.rmSync(record.filename, { force: true })
        }
      } catch (rollbackError) {
        if (record.existed) preservedBackups.add(record.backup)
        cleanupErrors.push(rollbackError)
      }
    }
  }

  for (const { backup, temporary } of prepared) {
    captureCleanup(() => fs.rmSync(temporary, { force: true }))
    if (!preservedBackups.has(backup)) {
      captureCleanup(() => fs.rmSync(backup, { force: true }))
    }
  }
  if (!completed) {
    for (const directory of [...createdDirectories].reverse()) {
      captureCleanup(() => fs.rmdirSync(directory))
    }
  }
  if (lockDescriptor !== undefined) {
    captureCleanup(() => fs.closeSync(lockDescriptor))
    captureCleanup(() => fs.rmSync(lockPath, { force: true }))
  }

  if (failure !== null) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [failure, ...cleanupErrors],
        'source-freeze publication failed and rollback was incomplete',
      )
    }
    throw failure
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'source-freeze publication cleanup failed',
    )
  }
}

function metadata(filename, root = caseRoot) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(root, filename).replaceAll('\\', '/'),
    bytes: value.length,
    sha256: sha256(value),
  }
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

function authenticatedRetainedTests() {
  const retainedCaseRoot = path.join(
    repo,
    'recovery/cases/2.1.118-to-2.1.119',
  )
  const retainedManifestValue = fs.readFileSync(
    path.join(retainedCaseRoot, 'manifest.json'),
  )
  assert(
    retainedManifestValue.length === retainedManifestIdentity.bytes,
    'retained T119 manifest byte length',
  )
  assert(
    sha256(retainedManifestValue) === retainedManifestIdentity.sha256,
    'retained T119 manifest SHA-256',
  )
  const retainedManifest = JSON.parse(retainedManifestValue)
  assert(
    retainedManifest.case === '2.1.118-to-2.1.119',
    'retained T119 manifest case',
  )
  assert(
    retainedManifest.finalization?.status === 'complete',
    'retained T119 manifest finalization',
  )
  const recoveredLineage = JSON.parse(
    fs.readFileSync(
      path.join(retainedCaseRoot, 'recovered/source-lineage-core.json'),
      'utf8',
    ),
  )
  assert(
    isDeepStrictEqual(retainedManifest.sourceLineage, recoveredLineage),
    'retained T119 embedded and recovered source lineage',
  )
  assert(
    Array.isArray(recoveredLineage.testFiles) &&
      recoveredLineage.testFiles.length > 0,
    'retained T119 test files',
  )
  return recoveredLineage.testFiles
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
  assert(
    targetCommit === targetIdentity.commit,
    `target commit must be the durable authenticated 2.1.120 commit ${targetIdentity.commit}`,
  )
  assert(
    git(['rev-parse', `${targetCommit}^{tree}`]).trim() === targetIdentity.tree,
    'target Git tree identity',
  )
  assert(
    git(['rev-parse', `${targetCommit}:src`]).trim() === targetIdentity.srcTree,
    'target src Git tree identity',
  )
  run('git', ['diff', '--quiet', targetCommit, '--', 'src'])
  const untrackedSource = git(['ls-files', '--others', '--', 'src']).trim()
  assert(
    untrackedSource.length === 0,
    `repository has untracked source paths:\n${untrackedSource}`,
  )

  const baselineInner = bundle(
    args['baseline-inner'],
    13_720_987,
    '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef',
    '2.1.119 inner bundle',
  )
  const targetInner = bundle(
    args['target-inner'],
    13_784_743,
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
    '2.1.120 inner bundle',
  )
  const baselineWrapper = bundle(
    args['baseline-wrapper'],
    13_721_077,
    'bc814388b51cbcb5114db927e60f8fbb5e12409532a89137429975556c29464e',
    '2.1.119 wrapper bundle',
  )
  const targetWrapper = bundle(
    args['target-wrapper'],
    13_784_833,
    '280754b3db23901e986711f11dc74536da9669c43f61999b4a84e2cf76cf1e83',
    '2.1.120 wrapper bundle',
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
  const stagedOutputs = new Map()
  stageOutput(stagedOutputs, overlayRelative, overlay)
  stageOutput(stagedOutputs, freezeOverlayRelative, overlay)

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-2.1.120-source-freeze-'),
  )
  let baseSummary
  let targetSummary
  try {
    const validationOverlayPath = path.join(
      temporaryRoot,
      'source-facing-overlay.patch',
    )
    fs.writeFileSync(validationOverlayPath, overlay)
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

    git(['apply', '--check', validationOverlayPath], { cwd: baseWorkspace })
    git(['apply', validationOverlayPath], { cwd: baseWorkspace })
    assertTreesEqual(
      targetSummary,
      summarizeSourceTree(path.join(baseWorkspace, 'src')),
      'forward-applied overlay versus target',
    )
    fs.cpSync(targetWorkspace, reverseWorkspace, { recursive: true })
    git(['apply', '--reverse', '--check', validationOverlayPath], {
      cwd: reverseWorkspace,
    })
    git(['apply', '--reverse', validationOverlayPath], {
      cwd: reverseWorkspace,
    })
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
  assert(changed.length > 0, 'no changed source paths')
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

  const diffCheck = spawnSync(
    'git',
    ['diff', '--check', baseCommit, targetCommit, '--', 'src'],
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
    CLAUDE_CODE_2_1_119_BUNDLE: baselineInner,
    CLAUDE_CODE_2_1_120_BUNDLE: targetInner,
    CLAUDE_2_1_119_CLI_INNER: baselineInner,
    CLAUDE_2_1_120_CLI_INNER: targetInner,
    CLAUDE_CODE_2_1_119_WRAPPER: baselineWrapper,
    CLAUDE_CODE_2_1_120_WRAPPER: targetWrapper,
  }
  const tests = run(process.execPath, ['--test', ...targetTests], {
    env: testEnvironment,
  })
  const testsVerified = testSummary(tests)
  assert(testsVerified.failed === 0, 'target tests failed')

  const syntaxCheck = changed
    .map(entry => entry.path)
    .filter(sourcePath =>
      targetByPath.has(sourcePath) && /\.(?:ts|tsx)$/.test(sourcePath),
    )
  const syntaxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-2.1.120-syntax-'))
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

  const retainedTests = authenticatedRetainedTests()
  const directMetadata = metadata(directEvidencePath, repo)
  const directTestMetadata = metadata(
    path.join(repo, 'recovery/test/recovery-2.1.120-direct-evidence.test.mjs'),
    repo,
  )
  stageFreezeOutput(stagedOutputs, 'source-paths.txt', nameStatus)
  stageFreezeOutput(stagedOutputs, 'source-numstat.tsv', numstat)
  stageFreezeOutput(
    stagedOutputs,
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
  stageFreezeOutput(
    stagedOutputs,
    'source-files.sha256',
    `${targetSummary.records
      .map(record => `${record.sha256}  ${record.path}`)
      .join('\n')}\n`,
  )
  stageFreezeOutput(stagedOutputs, 'source-symlinks.txt', '')
  stageFreezeOutput(
    stagedOutputs,
    'target-test-files.sha256',
    testManifest(targetTests),
  )
  stageFreezeOutput(
    stagedOutputs,
    'retained-test-files.sha256',
    testManifest(retainedTests),
  )
  stageFreezeOutput(
    stagedOutputs,
    'adjacent-direct-evidence.sha256',
    `${directMetadata.sha256}  ${directMetadata.path}\n`,
  )
  stageFreezeOutput(stagedOutputs, 'diff-check.raw.txt', diffCheckRaw)
  stageFreezeOutput(
    stagedOutputs,
    'diff-check-allowlist.txt',
    diagnosticLines === 0
      ? 'unexpected diagnostics: 0\n'
      : `reviewed exact git diff --check output: ${diagnosticLines} line(s)\n` +
          `sha256: ${diffCheckSha256}\n`,
  )
  stageFreezeOutput(
    stagedOutputs,
    'applied-src-byte-compare.txt',
    'identical\n',
  )
  stageFreezeOutput(
    stagedOutputs,
    'forward-src-byte-compare.txt',
    'identical\n',
  )

  const patchStats = {
    files: changed.length,
    modified: changed.filter(entry => entry.status === 'M').length,
    added: changed.filter(entry => entry.status === 'A').length,
    deleted: changed.filter(entry => entry.status === 'D').length,
    insertions: numberRows.reduce((sum, entry) => sum + entry.insertions, 0),
    deletions: numberRows.reduce((sum, entry) => sum + entry.deletions, 0),
  }
  const overlayMetadata = stagedMetadata(stagedOutputs, overlayRelative)
  const targetTestManifest = stagedMetadata(
    stagedOutputs,
    `${freezeRelative}/target-test-files.sha256`,
    freezeRelative,
  )
  const retainedTestManifest = stagedMetadata(
    stagedOutputs,
    `${freezeRelative}/retained-test-files.sha256`,
    freezeRelative,
  )
  const directManifest = stagedMetadata(
    stagedOutputs,
    `${freezeRelative}/adjacent-direct-evidence.sha256`,
    freezeRelative,
  )
  const identity = {
    schemaVersion: 1,
    case: '2.1.119-to-2.1.120',
    kind: 'authenticated-source-overlay-freeze',
    base: {
      commit: baseCommit,
      tree: git(['rev-parse', `${baseCommit}^{tree}`]).trim(),
      srcTree: git(['rev-parse', `${baseCommit}:src`]).trim(),
      bundleSha256:
        '9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef',
    },
    target: {
      commit: targetCommit,
      tree: git(['rev-parse', `${targetCommit}^{tree}`]).trim(),
      srcTree: git(['rev-parse', `${targetCommit}:src`]).trim(),
      bundleSha256:
        'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
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
  stageFreezeOutput(
    stagedOutputs,
    'identity.json',
    `${JSON.stringify(identity, null, 2)}\n`,
  )

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
  stageFreezeOutput(
    stagedOutputs,
    'SHA256SUMS',
    `${sumPaths
      .map(relative =>
        `${stagedMetadata(
          stagedOutputs,
          `${freezeRelative}/${relative}`,
          freezeRelative,
        ).sha256}  ${relative}`,
      )
      .join('\n')}\n`,
  )

  const testFileAssertions = targetTests.map(relative =>
    metadata(path.join(repo, relative), repo),
  )
  const sourceLineage = {
    root: 'src',
    baseCommit,
    baseGitTree: identity.base.tree,
    baseSrcGitTree: identity.base.srcTree,
    targetCommit,
    targetGitTree: identity.target.tree,
    targetSrcGitTree: identity.target.srcTree,
    patchSet: '2.1.119-to-2.1.120-incremental',
    patchOrder: ['recovered/source-facing-overlay.patch'],
    patchStats,
    patch: overlayMetadata,
    base: publicSummary(baseSummary),
    target: publicSummary(targetSummary),
    changedFiles,
    syntaxCheck,
    testFiles: targetTests,
    testArtifactEnvironment: {
      CLAUDE_CODE_2_1_119_BUNDLE: 'baselineAnalyzableBundle',
      CLAUDE_CODE_2_1_120_BUNDLE: 'targetAnalyzableBundle',
      CLAUDE_2_1_119_CLI_INNER: 'baselineAnalyzableBundle',
      CLAUDE_2_1_120_CLI_INNER: 'targetAnalyzableBundle',
      CLAUDE_CODE_2_1_119_WRAPPER: 'baselineBundle',
      CLAUDE_CODE_2_1_120_WRAPPER: 'targetBundle',
    },
    testFileAssertions,
  }
  stageOutput(
    stagedOutputs,
    lineageRelative,
    `${JSON.stringify(sourceLineage, null, 2)}\n`,
  )

  const expectedStagedOutputs = [
    overlayRelative,
    lineageRelative,
    ...[...sumPaths, 'SHA256SUMS'].map(
      relative => `${freezeRelative}/${relative}`,
    ),
  ].sort(compareText)
  assert(
    JSON.stringify([...stagedOutputs.keys()].sort(compareText)) ===
      JSON.stringify(expectedStagedOutputs),
    'staged source-freeze output set',
  )
  const identityMetadata = stagedMetadata(
    stagedOutputs,
    `${freezeRelative}/identity.json`,
  )
  const sourceLineageMetadata = stagedMetadata(
    stagedOutputs,
    lineageRelative,
  )
  publishStagedOutputs(stagedOutputs)

  console.log(
    JSON.stringify({
      status: '2.1.120-source-freeze-built',
      targetCommit,
      overlay: overlayMetadata,
      patchStats,
      source: publicSummary(targetSummary),
      tests: testsVerified,
      syntaxBuilds: syntaxCheck.length,
      diffCheck: identity.verification.diffCheck,
      identity: identityMetadata,
      sourceLineage: sourceLineageMetadata,
    }),
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
