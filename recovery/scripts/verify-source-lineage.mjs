#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const GIT_OBJECT_PATTERN = /^[a-f0-9]{40}$/
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const FORBIDDEN_TEST_ENVIRONMENT_NAMES = new Set([
  'BUN_OPTIONS',
  'CLAUDE_CODE_DIRECT_EVIDENCE_SOURCE_ROOT',
  'CLAUDE_CODE_SEMANTIC_CASE',
  'CLAUDE_CODE_SEMANTIC_SOURCE_ROOT',
  'DYLD_INSERT_LIBRARIES',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_TEST_CONTEXT',
  'PATH',
])
const SYSTEM_TEST_ENVIRONMENT_NAMES = new Set([
  'ComSpec',
  'HOME',
  'LANG',
  'LANGUAGE',
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'TZ',
  'USERPROFILE',
])

function usage() {
  console.error(
    'Usage: verify-source-lineage.mjs --case manifest.json --repo DIR ' +
      '[--artifacts DIR]',
  )
}

function parseArguments(argv) {
  const allowed = new Set(['artifacts', 'case', 'repo'])
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }
    const key = argument.slice(2)
    if (!allowed.has(key)) throw new Error(`Unknown argument: ${argument}`)
    if (result[key] !== undefined) {
      throw new Error(`Duplicate argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  return result
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function assertRealDirectory(directory, label) {
  let status
  try {
    status = fs.lstatSync(directory)
  } catch (error) {
    throw new Error(`${label} is not accessible: ${directory}`, {
      cause: error,
    })
  }
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`${label} is not a real directory: ${directory}`)
  }
}

function assertRealFile(filename, label) {
  let status
  try {
    status = fs.lstatSync(filename)
  } catch (error) {
    throw new Error(`${label} is not accessible: ${filename}`, {
      cause: error,
    })
  }
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${label} is not a real file: ${filename}`)
  }
}

function relativeParts(relative, label) {
  if (
    typeof relative !== 'string' ||
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative.includes('\\')
  ) {
    throw new Error(`${label}: unsafe relative path ${String(relative)}`)
  }
  const parts = relative.split('/')
  if (
    parts.includes('') ||
    parts.includes('.') ||
    parts.includes('..')
  ) {
    throw new Error(`${label}: unsafe relative path ${relative}`)
  }
  return parts
}

function safeExistingFile(root, relative, label) {
  assertRealDirectory(root, `${label} root`)
  const parts = relativeParts(relative, label)
  let current = path.resolve(root)
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index])
    let status
    try {
      status = fs.lstatSync(current)
    } catch (error) {
      throw new Error(`${label} is not accessible: ${relative}`, {
        cause: error,
      })
    }
    if (status.isSymbolicLink()) {
      throw new Error(`${label} traverses a symbolic link: ${relative}`)
    }
    const final = index === parts.length - 1
    if (final ? !status.isFile() : !status.isDirectory()) {
      throw new Error(
        `${label} has an unexpected path component: ${relative}`,
      )
    }
  }
  return current
}

function compareText(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function systemTestEnvironment(source) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([name]) =>
        SYSTEM_TEST_ENVIRONMENT_NAMES.has(name) || name.startsWith('LC_'),
    ),
  )
}

function walkSourceFiles(sourceRoot) {
  assertRealDirectory(sourceRoot, 'source tree')
  const pending = [sourceRoot]
  const filenames = []
  while (pending.length > 0) {
    const directory = pending.pop()
    const entries = fs.readdirSync(directory, { withFileTypes: true })
    for (const entry of entries) {
      const filename = path.join(directory, entry.name)
      const status = fs.lstatSync(filename)
      if (status.isSymbolicLink()) {
        throw new Error(
          `Source tree contains a symbolic link: ` +
            path.relative(sourceRoot, filename),
        )
      }
      if (status.isDirectory()) {
        pending.push(filename)
      } else if (status.isFile()) {
        filenames.push(filename)
      } else {
        throw new Error(
          `Source tree contains a non-regular entry: ` +
            path.relative(sourceRoot, filename),
        )
      }
    }
  }
  return filenames.sort((left, right) =>
    compareText(
      path.relative(sourceRoot, left),
      path.relative(sourceRoot, right),
    ),
  )
}

export function summarizeSourceTree(sourceRoot) {
  const records = walkSourceFiles(sourceRoot).map(filename => {
    const value = fs.readFileSync(filename)
    const relative = path
      .relative(sourceRoot, filename)
      .split(path.sep)
      .join('/')
    return {
      path: `src/${relative}`,
      filename,
      bytes: value.length,
      sha256: sha256(value),
    }
  })
  const hash = crypto.createHash('sha256')
  let bytes = 0
  for (const record of records) {
    bytes += record.bytes
    hash
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
    manifestSha256: hash.digest('hex'),
    records,
  }
}

function publicTreeSummary(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function aliasValue(object, aliases, label) {
  const present = aliases.filter(alias => object[alias] !== undefined)
  if (present.length === 0) {
    throw new Error(`${label}: missing ${aliases[0]}`)
  }
  const value = object[present[0]]
  for (const alias of present.slice(1)) {
    if (object[alias] !== value) {
      throw new Error(`${label}: conflicting ${present.join('/')} values`)
    }
  }
  return value
}

function normalizeTreeAssertion(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const files = aliasValue(value, ['files', 'fileCount', 'count'], label)
  const bytes = aliasValue(value, ['bytes'], label)
  const manifestSha256 = aliasValue(
    value,
    ['manifestSha256', 'sha256'],
    label,
  )
  if (!Number.isSafeInteger(files) || files < 0) {
    throw new Error(`${label}.files must be a non-negative safe integer`)
  }
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error(`${label}.bytes must be a non-negative safe integer`)
  }
  if (
    typeof manifestSha256 !== 'string' ||
    !SHA256_PATTERN.test(manifestSha256)
  ) {
    throw new Error(`${label}.manifestSha256 must be a lowercase SHA-256`)
  }
  return { files, bytes, manifestSha256 }
}

function assertTreeSummary(actual, expected, label) {
  assertEqual(actual.files, expected.files, `${label} file count`)
  assertEqual(actual.bytes, expected.bytes, `${label} byte length`)
  assertEqual(
    actual.manifestSha256,
    expected.manifestSha256,
    `${label} manifest SHA-256`,
  )
}

function normalizePatchEntries(manifest, lineage, caseRoot) {
  if (
    lineage.patchOrder !== undefined &&
    lineage.patches !== undefined
  ) {
    throw new Error('sourceLineage has both patchOrder and patches')
  }
  const entries = lineage.patchOrder ?? lineage.patches
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('sourceLineage.patchOrder must be a non-empty array')
  }
  const recoveredAssertions = new Map()
  for (const assertion of manifest.recoveredFileAssertions ?? []) {
    if (
      assertion &&
      typeof assertion.path === 'string' &&
      !recoveredAssertions.has(assertion.path)
    ) {
      recoveredAssertions.set(assertion.path, assertion)
    }
  }
  const seen = new Set()
  return entries.map((entry, index) => {
    const specified =
      typeof entry === 'string'
        ? { path: entry }
        : entry && typeof entry === 'object' && !Array.isArray(entry)
          ? entry
          : null
    if (!specified || typeof specified.path !== 'string') {
      throw new Error(`sourceLineage patch ${index + 1} is invalid`)
    }
    if (seen.has(specified.path)) {
      throw new Error(`Duplicate sourceLineage patch: ${specified.path}`)
    }
    seen.add(specified.path)
    const filename = safeExistingFile(
      caseRoot,
      specified.path,
      `sourceLineage patch ${index + 1}`,
    )
    const value = fs.readFileSync(filename)
    const evidence = recoveredAssertions.get(specified.path)
    const expectedBytes = specified.bytes ?? evidence?.bytes
    const expectedSha256 = specified.sha256 ?? evidence?.sha256
    if (
      specified.bytes !== undefined &&
      evidence?.bytes !== undefined &&
      specified.bytes !== evidence.bytes
    ) {
      throw new Error(`${specified.path}: conflicting byte assertions`)
    }
    if (
      specified.sha256 !== undefined &&
      evidence?.sha256 !== undefined &&
      specified.sha256 !== evidence.sha256
    ) {
      throw new Error(`${specified.path}: conflicting SHA-256 assertions`)
    }
    if (expectedBytes !== undefined) {
      assertEqual(value.length, expectedBytes, `${specified.path} byte length`)
    }
    const digest = sha256(value)
    if (expectedSha256 !== undefined) {
      if (
        typeof expectedSha256 !== 'string' ||
        !SHA256_PATTERN.test(expectedSha256)
      ) {
        throw new Error(`${specified.path}: invalid expected SHA-256`)
      }
      assertEqual(digest, expectedSha256, `${specified.path} SHA-256`)
    }
    return {
      path: specified.path,
      filename,
      bytes: value.length,
      sha256: digest,
    }
  })
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed (${result.status})\n` +
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return result
}

function singleLine(result, label) {
  const value = result.stdout.trim()
  if (value.length === 0 || value.includes('\n') || value.includes('\r')) {
    throw new Error(`${label}: expected exactly one output line`)
  }
  return value
}

function normalizeGitEndpoint(lineage, name) {
  const commitField = `${name}Commit`
  const treeField = `${name}GitTree`
  const finalizedSourceField = `${name}SrcGitTree`
  const legacySourceField = `${name}SourceGitTree`
  if (
    lineage[finalizedSourceField] !== undefined &&
    lineage[legacySourceField] !== undefined &&
    lineage[finalizedSourceField] !== lineage[legacySourceField]
  ) {
    throw new Error(
      `sourceLineage has conflicting ${finalizedSourceField} and ${legacySourceField}`,
    )
  }
  const sourceTree =
    lineage[finalizedSourceField] ?? lineage[legacySourceField]
  const values = [lineage[commitField], lineage[treeField], sourceTree]
  const present = values.filter(value => value !== undefined).length
  if (present === 0) return null
  if (present !== values.length) {
    throw new Error(
      `sourceLineage git ${name} must provide ${commitField}, ${treeField}, ` +
        `${finalizedSourceField} (or ${legacySourceField}) together`,
    )
  }
  for (const [field, value] of [
    [commitField, lineage[commitField]],
    [treeField, lineage[treeField]],
    [finalizedSourceField, sourceTree],
  ]) {
    if (typeof value !== 'string' || !GIT_OBJECT_PATTERN.test(value)) {
      throw new Error(`sourceLineage.${field} must be a lowercase Git SHA-1`)
    }
  }
  return {
    commit: lineage[commitField],
    tree: lineage[treeField],
    sourceTree,
  }
}

function normalizeGitHistory(lineage, caseName) {
  if (caseName === '2.1.118-to-2.1.119') {
    if (
      lineage.targetCommit !== undefined ||
      lineage.targetGitTree !== 'bceb0af2f6b5261fab23b9d8fee51cf48f1b2dd2' ||
      (lineage.targetSrcGitTree ?? lineage.targetSourceGitTree) !==
        '9e807992d428e7e23a0ad96e3a53e286d372afd7' ||
      (lineage.targetSrcGitTree !== undefined &&
        lineage.targetSourceGitTree !== undefined &&
        lineage.targetSrcGitTree !== lineage.targetSourceGitTree)
    ) {
      throw new Error('sourceLineage has an invalid legacy T119 target identity')
    }
    return {
      base: normalizeGitEndpoint(lineage, 'base'),
      target: null,
      legacyTarget: {
        tree: lineage.targetGitTree,
        sourceTree:
          lineage.targetSrcGitTree ?? lineage.targetSourceGitTree,
      },
    }
  }
  const history = {
    base: normalizeGitEndpoint(lineage, 'base'),
    target: normalizeGitEndpoint(lineage, 'target'),
    legacyTarget: null,
  }
  if (
    new Set([
      '2.1.119-to-2.1.120',
      '2.1.120-to-2.1.121',
    ]).has(caseName) &&
    (history.base === null || history.target === null)
  ) {
    throw new Error(
      `${caseName} sourceLineage requires complete base and target Git identities`,
    )
  }
  return history
}

function semanticVersionPair(caseName) {
  if (typeof caseName !== 'string' || caseName.length === 0) {
    throw new Error('Manifest case must be a non-empty string for semantic tests')
  }
  const versions = caseName.match(
    /^(\d+\.\d+\.\d+)-to-(\d+\.\d+\.\d+)$/,
  )
  if (versions === null) {
    throw new Error('Manifest case has no semantic version pair')
  }
  return versions.slice(1)
}

function repositoryEnvironmentName(version) {
  return `CLAUDE_CODE_${version.replaceAll('.', '_')}_REPOSITORY_ROOT`
}

function normalizeTestGitRepositories(lineage, caseName, history) {
  const configured = lineage.testGitRepositories
  const [baselineVersion, targetVersion] = semanticVersionPair(caseName)
  const expectedNames = [
    repositoryEnvironmentName(baselineVersion),
    repositoryEnvironmentName(targetVersion),
  ]

  if (configured === undefined) {
    if (caseName === '2.1.120-to-2.1.121') {
      throw new Error(
        '2.1.120-to-2.1.121 sourceLineage requires testGitRepositories',
      )
    }
    if (history.base === null || history.target === null) return null
    return {
      base: { environment: expectedNames[0], ...history.base },
      target: { environment: expectedNames[1], ...history.target },
      explicit: false,
    }
  }
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
    throw new Error('sourceLineage.testGitRepositories must be an object')
  }
  const configuredNames = Object.keys(configured).sort(compareText)
  if (
    JSON.stringify(configuredNames) !==
    JSON.stringify([...expectedNames].sort(compareText))
  ) {
    throw new Error(
      'sourceLineage.testGitRepositories must have exactly the derived ' +
        `repository-root environments: ${expectedNames.join(', ')}`,
    )
  }

  const endpoint = (environment, expectedSourceTree, allowDetachedCommits) => {
    const value = configured[environment]
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `sourceLineage.testGitRepositories.${environment} must be an object`,
      )
    }
    const fields = Object.keys(value).sort(compareText)
    const expectedFields = [
      'commit',
      ...(value.detachedCommits === undefined ? [] : ['detachedCommits']),
      'gitTree',
      'srcGitTree',
    ].sort(compareText)
    if (
      JSON.stringify(fields) !== JSON.stringify(expectedFields) ||
      (!allowDetachedCommits && value.detachedCommits !== undefined)
    ) {
      throw new Error(
        `sourceLineage.testGitRepositories.${environment} must have exactly ` +
          'commit, gitTree, srcGitTree, and an optional permitted ' +
          'detachedCommits array',
      )
    }
    for (const field of ['commit', 'gitTree', 'srcGitTree']) {
      if (
        typeof value[field] !== 'string' ||
        !GIT_OBJECT_PATTERN.test(value[field])
      ) {
        throw new Error(
          `sourceLineage.testGitRepositories.${environment}.${field} ` +
            'must be a lowercase Git SHA-1',
        )
      }
    }
    const detachedCommits = value.detachedCommits ?? []
    if (
      !Array.isArray(detachedCommits) ||
      (detachedCommits.length === 0 && value.detachedCommits !== undefined)
    ) {
      throw new Error(
        `sourceLineage.testGitRepositories.${environment}.detachedCommits ` +
          'must be a non-empty array when present',
      )
    }
    const seenDetachedCommits = new Set([value.commit])
    const normalizedDetachedCommits = detachedCommits.map((item, index) => {
      const label =
        `sourceLineage.testGitRepositories.${environment}.` +
        `detachedCommits[${index}]`
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`${label} must be an object`)
      }
      if (
        JSON.stringify(Object.keys(item).sort(compareText)) !==
        JSON.stringify(['commit', 'gitTree', 'srcGitTree'])
      ) {
        throw new Error(
          `${label} must have exactly commit, gitTree, and srcGitTree`,
        )
      }
      for (const field of ['commit', 'gitTree', 'srcGitTree']) {
        if (
          typeof item[field] !== 'string' ||
          !GIT_OBJECT_PATTERN.test(item[field])
        ) {
          throw new Error(`${label}.${field} must be a lowercase Git SHA-1`)
        }
      }
      if (seenDetachedCommits.has(item.commit)) {
        throw new Error(`${label}.commit is duplicated`)
      }
      seenDetachedCommits.add(item.commit)
      return {
        commit: item.commit,
        tree: item.gitTree,
        sourceTree: item.srcGitTree,
      }
    })
    assertEqual(
      value.srcGitTree,
      expectedSourceTree,
      `sourceLineage.testGitRepositories.${environment}.srcGitTree ` +
        'versus lineage source tree',
    )
    return {
      environment,
      commit: value.commit,
      tree: value.gitTree,
      sourceTree: value.srcGitTree,
      detachedCommits: normalizedDetachedCommits,
    }
  }

  if (history.base === null || history.target === null) {
    throw new Error(
      'sourceLineage.testGitRepositories requires complete Git history',
    )
  }
  const base = endpoint(expectedNames[0], history.base.sourceTree, false)
  assertEqual(
    base.commit,
    history.base.commit,
    `sourceLineage.testGitRepositories.${expectedNames[0]}.commit ` +
      'versus lineage base commit',
  )
  assertEqual(
    base.tree,
    history.base.tree,
    `sourceLineage.testGitRepositories.${expectedNames[0]}.gitTree ` +
      'versus lineage base tree',
  )
  return {
    base,
    target: endpoint(expectedNames[1], history.target.sourceTree, true),
    explicit: true,
  }
}

function verifyGitEndpoint(
  repositoryRoot,
  temporaryRoot,
  endpoint,
  reconstructed,
  name,
) {
  if (!endpoint) return null
  const commitExpression = `${endpoint.commit}^{commit}`
  const treeExpression = `${endpoint.commit}^{tree}`
  const sourceExpression = `${endpoint.commit}:src`
  const commit = singleLine(
    run('git', ['rev-parse', '--verify', commitExpression], {
      cwd: repositoryRoot,
    }),
    `sourceLineage.${name}Commit`,
  )
  assertEqual(commit, endpoint.commit, `sourceLineage.${name}Commit identity`)
  const tree = singleLine(
    run('git', ['rev-parse', '--verify', treeExpression], {
      cwd: repositoryRoot,
    }),
    `sourceLineage.${name}GitTree`,
  )
  assertEqual(tree, endpoint.tree, `sourceLineage.${name}GitTree`)
  const sourceTree = singleLine(
    run('git', ['rev-parse', '--verify', sourceExpression], {
      cwd: repositoryRoot,
    }),
    `sourceLineage.${name}SrcGitTree`,
  )
  assertEqual(
    sourceTree,
    endpoint.sourceTree,
    `sourceLineage.${name}SrcGitTree`,
  )

  const archive = path.join(temporaryRoot, `git-${name}.tar`)
  const extracted = path.join(temporaryRoot, `git-${name}`)
  fs.mkdirSync(extracted)
  run(
    'git',
    [
      'archive',
      '--format=tar',
      `--output=${archive}`,
      endpoint.commit,
      '--',
      'src',
    ],
    { cwd: repositoryRoot },
  )
  run('tar', ['-xf', archive, '-C', extracted], {
    cwd: repositoryRoot,
  })
  const committedSource = summarizeSourceTree(path.join(extracted, 'src'))
  assertTreesByteEqual(
    committedSource,
    reconstructed,
    `reconstructed ${name} versus pinned Git source tree`,
  )
  return {
    commit,
    tree,
    sourceTree,
    sourceComparison: 'exact',
  }
}

function createVerifiedRepositoryRoots(
  repositoryRoot,
  temporaryRoot,
  declarations,
  baseSource,
  targetSource,
) {
  if (declarations === null) return null

  const create = (name, endpoint, expectedSource) => {
    const gitDirectory = path.join(
      temporaryRoot,
      `verified-${name}-history.git`,
    )
    run('git', ['init', '--bare', '--quiet', gitDirectory], {
      cwd: temporaryRoot,
    })
    run(
      'git',
      [
        `--git-dir=${gitDirectory}`,
        'fetch',
        '--quiet',
        '--no-tags',
        '--force',
        '--',
        repositoryRoot,
        `${endpoint.commit}:refs/heads/authenticated`,
      ],
      { cwd: temporaryRoot },
    )
    for (const detached of endpoint.detachedCommits ?? []) {
      run(
        'git',
        [
          `--git-dir=${gitDirectory}`,
          'fetch',
          '--quiet',
          '--no-tags',
          '--no-write-fetch-head',
          '--force',
          '--',
          repositoryRoot,
          detached.commit,
        ],
        { cwd: temporaryRoot },
      )
    }
    const refs = run(
      'git',
      [
        `--git-dir=${gitDirectory}`,
        'for-each-ref',
        '--format=%(refname) %(objectname)',
        'refs/',
      ],
      { cwd: temporaryRoot },
    ).stdout.trim()
    assertEqual(
      refs,
      `refs/heads/authenticated ${endpoint.commit}`,
      `verified ${name} repository refs`,
    )
    if (fs.existsSync(path.join(gitDirectory, 'objects/info/alternates'))) {
      throw new Error(`verified ${name} repository unexpectedly uses alternates`)
    }
    const destination = path.join(
      temporaryRoot,
      `verified-${name}-repository`,
    )
    run(
      'git',
      [
        `--git-dir=${gitDirectory}`,
        'worktree',
        'add',
        '--quiet',
        '--detach',
        destination,
        'refs/heads/authenticated',
      ],
      { cwd: temporaryRoot },
    )
    assertRealDirectory(destination, `verified ${name} repository`)
    const commit = singleLine(
      run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
        cwd: destination,
      }),
      `verified ${name} repository HEAD`,
    )
    const tree = singleLine(
      run('git', ['rev-parse', '--verify', 'HEAD^{tree}'], {
        cwd: destination,
      }),
      `verified ${name} repository tree`,
    )
    const sourceTree = singleLine(
      run('git', ['rev-parse', '--verify', 'HEAD:src'], {
        cwd: destination,
      }),
      `verified ${name} repository source tree`,
    )
    assertEqual(commit, endpoint.commit, `verified ${name} repository commit`)
    assertEqual(tree, endpoint.tree, `verified ${name} repository tree`)
    assertEqual(
      sourceTree,
      endpoint.sourceTree,
      `verified ${name} repository source tree`,
    )
    assertTreesByteEqual(
      expectedSource,
      summarizeSourceTree(path.join(destination, 'src')),
      `verified ${name} repository source bytes`,
    )
    const status = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: destination,
    }).stdout
    if (status !== '') {
      throw new Error(`verified ${name} repository is not clean: ${status}`)
    }
    const detachedCommits = (endpoint.detachedCommits ?? []).map(
      (detached, index) => {
        const detachedCommit = singleLine(
          run(
            'git',
            ['rev-parse', '--verify', `${detached.commit}^{commit}`],
            { cwd: destination },
          ),
          `verified ${name} detached commit ${index + 1}`,
        )
        const detachedTree = singleLine(
          run('git', ['rev-parse', '--verify', `${detached.commit}^{tree}`], {
            cwd: destination,
          }),
          `verified ${name} detached tree ${index + 1}`,
        )
        const detachedSourceTree = singleLine(
          run('git', ['rev-parse', '--verify', `${detached.commit}:src`], {
            cwd: destination,
          }),
          `verified ${name} detached source tree ${index + 1}`,
        )
        assertEqual(
          detachedCommit,
          detached.commit,
          `verified ${name} detached commit ${index + 1}`,
        )
        assertEqual(
          detachedTree,
          detached.tree,
          `verified ${name} detached tree ${index + 1}`,
        )
        assertEqual(
          detachedSourceTree,
          detached.sourceTree,
          `verified ${name} detached source tree ${index + 1}`,
        )
        return {
          commit: detachedCommit,
          gitTree: detachedTree,
          srcGitTree: detachedSourceTree,
          ref: null,
        }
      },
    )
    const reachableObjects = run(
      'git',
      [
        'rev-list',
        '--objects',
        '--no-object-names',
        endpoint.commit,
        ...(endpoint.detachedCommits ?? []).map(item => item.commit),
      ],
      { cwd: destination },
    ).stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort(compareText)
    const storedObjects = run(
      'git',
      [
        'cat-file',
        '--batch-all-objects',
        '--batch-check=%(objectname)',
      ],
      { cwd: destination },
    ).stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort(compareText)
    assertEqual(
      storedObjects.join('\n'),
      reachableObjects.join('\n'),
      `verified ${name} repository object closure`,
    )
    return {
      path: destination,
      verification: {
        environment: endpoint.environment,
        commit,
        gitTree: tree,
        srcGitTree: sourceTree,
        ref: 'refs/heads/authenticated',
        refs: 1,
        sourceComparison: 'exact',
        detachedCommits,
        objects: storedObjects.length,
        objectClosure: 'exact-primary-and-detached-reachability',
      },
    }
  }

  const base = create('base', declarations.base, baseSource)
  const target = create('target', declarations.target, targetSource)
  run(
    'git',
    [
      'merge-base',
      '--is-ancestor',
      declarations.base.commit,
      declarations.target.commit,
    ],
    { cwd: repositoryRoot },
  )
  return {
    base: base.path,
    target: target.path,
    explicit: declarations.explicit,
    verification: {
      [base.verification.environment]: base.verification,
      [target.verification.environment]: target.verification,
    },
  }
}

function applyPatch(patch, workspace, reverse) {
  const direction = reverse ? ['--reverse'] : []
  run(
    'git',
    ['apply', ...direction, '--check', patch.filename],
    { cwd: workspace },
  )
  run(
    'git',
    ['apply', ...direction, patch.filename],
    { cwd: workspace },
  )
}

function assertWorkspaceScope(workspace) {
  const entries = fs.readdirSync(workspace, { withFileTypes: true })
  if (
    entries.length !== 1 ||
    entries[0].name !== 'src' ||
    !entries[0].isDirectory() ||
    entries[0].isSymbolicLink()
  ) {
    throw new Error('Source patch changed content outside the src tree')
  }
  walkSourceFiles(path.join(workspace, 'src'))
}

function assertTreesByteEqual(expected, actual, label) {
  assertEqual(actual.records.length, expected.records.length, `${label} files`)
  for (let index = 0; index < expected.records.length; index += 1) {
    const left = expected.records[index]
    const right = actual.records[index]
    assertEqual(right.path, left.path, `${label} path ${index + 1}`)
    assertEqual(right.bytes, left.bytes, `${label} ${left.path} bytes`)
    assertEqual(right.sha256, left.sha256, `${label} ${left.path} SHA-256`)
    if (!fs.readFileSync(right.filename).equals(fs.readFileSync(left.filename))) {
      throw new Error(`${label}: ${left.path} differs byte-for-byte`)
    }
  }
}

function normalizeStringArray(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings`)
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${label} contains duplicate paths`)
  }
  return value
}

function syntaxPaths(lineage) {
  if (
    lineage.syntaxCheck !== undefined &&
    lineage.syntaxChecks !== undefined
  ) {
    throw new Error('sourceLineage has both syntaxCheck and syntaxChecks')
  }
  return normalizeStringArray(
    lineage.syntaxCheck ?? lineage.syntaxChecks,
    'sourceLineage.syntaxCheck',
  )
}

function normalizeTestConfiguration(lineage) {
  const nested = lineage.tests
  if (
    nested !== undefined &&
    (!nested || typeof nested !== 'object' || Array.isArray(nested))
  ) {
    throw new Error('sourceLineage.tests must be an object')
  }
  if (lineage.testFiles !== undefined && nested?.files !== undefined) {
    throw new Error('sourceLineage has both testFiles and tests.files')
  }
  if (
    lineage.testArtifactEnvironment !== undefined &&
    nested?.artifactEnvironment !== undefined
  ) {
    throw new Error(
      'sourceLineage has both testArtifactEnvironment and ' +
        'tests.artifactEnvironment',
    )
  }
  const files = normalizeStringArray(
    lineage.testFiles ?? nested?.files,
    'sourceLineage.testFiles',
  )
  const artifactEnvironment =
    lineage.testArtifactEnvironment ?? nested?.artifactEnvironment ?? {}
  if (
    !artifactEnvironment ||
    typeof artifactEnvironment !== 'object' ||
    Array.isArray(artifactEnvironment)
  ) {
    throw new Error('sourceLineage.testArtifactEnvironment must be an object')
  }
  return { files, artifactEnvironment }
}

function exactObjectFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const actual = Object.keys(value).sort(compareText)
  const expected = [...fields].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must have exactly ${fields.join(', ')}`)
  }
}

function normalizeByteDescriptor(value, label, fields) {
  exactObjectFields(value, fields, label)
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0) {
    throw new Error(`${label}.bytes must be a non-negative safe integer`)
  }
  if (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)) {
    throw new Error(`${label}.sha256 must be a lowercase SHA-256`)
  }
}

function normalizeTestSandbox(lineage, caseName) {
  const configured = lineage.testSandbox
  if (configured === undefined) {
    if (caseName === '2.1.120-to-2.1.121') {
      throw new Error('2.1.120-to-2.1.121 sourceLineage requires testSandbox')
    }
    return null
  }
  exactObjectFields(
    configured,
    [
      'schemaVersion',
      'legacyArtifacts',
      'expandedFiles',
      'sourceTrees',
      'toolchainFiles',
    ],
    'sourceLineage.testSandbox',
  )
  if (configured.schemaVersion !== 1) {
    throw new Error('sourceLineage.testSandbox.schemaVersion must be 1')
  }
  const seenDestinations = new Set()
  const destination = (relative, label) => {
    relativeParts(relative, label)
    if (seenDestinations.has(relative)) {
      throw new Error(`${label} duplicates sandbox destination ${relative}`)
    }
    seenDestinations.add(relative)
    return relative
  }
  if (
    !Array.isArray(configured.legacyArtifacts) ||
    configured.legacyArtifacts.length === 0
  ) {
    throw new Error('sourceLineage.testSandbox.legacyArtifacts must be non-empty')
  }
  const legacyArtifacts = configured.legacyArtifacts.map((item, index) => {
    const label = `sourceLineage.testSandbox.legacyArtifacts[${index}]`
    exactObjectFields(item, ['destination', 'artifact'], label)
    const relative = destination(item.destination, `${label}.destination`)
    if (!relative.startsWith('.recovery-tmp/authenticated-artifacts/')) {
      throw new Error(`${label}.destination must be an authenticated-artifacts path`)
    }
    if (typeof item.artifact !== 'string' || item.artifact.length === 0) {
      throw new Error(`${label}.artifact must be a non-empty string`)
    }
    return { destination: relative, artifact: item.artifact }
  })
  if (
    !Array.isArray(configured.expandedFiles) ||
    configured.expandedFiles.length === 0
  ) {
    throw new Error('sourceLineage.testSandbox.expandedFiles must be non-empty')
  }
  const expandedFiles = configured.expandedFiles.map((item, index) => {
    const label = `sourceLineage.testSandbox.expandedFiles[${index}]`
    normalizeByteDescriptor(
      item,
      label,
      [
        'source',
        'bytes',
        'sha256',
        'compression',
        'destination',
        'expandedBytes',
        'expandedSha256',
      ],
    )
    relativeParts(item.source, `${label}.source`)
    if (item.compression !== 'gzip') {
      throw new Error(`${label}.compression must be gzip`)
    }
    const relative = destination(item.destination, `${label}.destination`)
    if (!relative.startsWith('.recovery-tmp/')) {
      throw new Error(`${label}.destination must be within .recovery-tmp`)
    }
    if (!Number.isSafeInteger(item.expandedBytes) || item.expandedBytes < 0) {
      throw new Error(`${label}.expandedBytes must be a non-negative safe integer`)
    }
    if (
      typeof item.expandedSha256 !== 'string' ||
      !SHA256_PATTERN.test(item.expandedSha256)
    ) {
      throw new Error(`${label}.expandedSha256 must be a lowercase SHA-256`)
    }
    return {
      source: item.source,
      bytes: item.bytes,
      sha256: item.sha256,
      compression: 'gzip',
      destination: relative,
      expandedBytes: item.expandedBytes,
      expandedSha256: item.expandedSha256,
    }
  })
  const [baselineVersion, targetVersion] = semanticVersionPair(caseName)
  const expectedSourceTrees = [
    {
      destination: `.recovery-tmp/semantic-trees/${baselineVersion}/src`,
      repositoryEnvironment: repositoryEnvironmentName(baselineVersion),
    },
    {
      destination: `.recovery-tmp/semantic-trees/${targetVersion}/src`,
      repositoryEnvironment: repositoryEnvironmentName(targetVersion),
    },
    {
      destination: 'src',
      repositoryEnvironment: repositoryEnvironmentName(targetVersion),
    },
  ]
  if (!Array.isArray(configured.sourceTrees)) {
    throw new Error('sourceLineage.testSandbox.sourceTrees must be an array')
  }
  const sourceTrees = configured.sourceTrees.map((item, index) => {
    const label = `sourceLineage.testSandbox.sourceTrees[${index}]`
    exactObjectFields(item, ['destination', 'repositoryEnvironment'], label)
    return {
      destination: destination(item.destination, `${label}.destination`),
      repositoryEnvironment: item.repositoryEnvironment,
    }
  })
  if (JSON.stringify(sourceTrees) !== JSON.stringify(expectedSourceTrees)) {
    throw new Error(
      'sourceLineage.testSandbox.sourceTrees must exactly stage the ' +
        'baseline legacy tree, target legacy tree, and target src tree',
    )
  }
  if (
    !Array.isArray(configured.toolchainFiles) ||
    configured.toolchainFiles.length === 0
  ) {
    throw new Error('sourceLineage.testSandbox.toolchainFiles must be non-empty')
  }
  const toolchainFiles = configured.toolchainFiles.map((item, index) => {
    const label = `sourceLineage.testSandbox.toolchainFiles[${index}]`
    normalizeByteDescriptor(
      item,
      label,
      ['source', 'destination', 'bytes', 'sha256', 'mode'],
    )
    relativeParts(item.source, `${label}.source`)
    const relative = destination(item.destination, `${label}.destination`)
    if (!item.source.startsWith('.pixi/') || !relative.startsWith('.pixi/')) {
      throw new Error(`${label} must copy an exact .pixi toolchain file`)
    }
    if (item.mode !== 0o644 && item.mode !== 0o755) {
      throw new Error(`${label}.mode must be 420 or 493`)
    }
    return {
      source: item.source,
      destination: relative,
      bytes: item.bytes,
      sha256: item.sha256,
      mode: item.mode,
    }
  })
  const syntaxRuntimes = toolchainFiles.filter(
    item => item.destination === '.pixi/envs/default/bin/bun',
  )
  if (
    syntaxRuntimes.length !== 1 ||
    syntaxRuntimes[0].source !== syntaxRuntimes[0].destination ||
    syntaxRuntimes[0].mode !== 0o755
  ) {
    throw new Error(
      'sourceLineage.testSandbox.toolchainFiles must authenticate exactly ' +
        'one executable .pixi/envs/default/bin/bun runtime',
    )
  }
  return {
    schemaVersion: 1,
    legacyArtifacts,
    expandedFiles,
    sourceTrees,
    toolchainFiles,
    syntaxRuntime: syntaxRuntimes[0].destination,
  }
}

function relativeModuleSpecifiers(source) {
  const result = new Set()

  const moduleSpecifier = node => {
    if (node?.type === 'Literal' && typeof node.value === 'string') {
      return node.value
    }
    if (
      node?.type === 'TemplateLiteral' &&
      node.expressions.length === 0 &&
      node.quasis.length === 1
    ) {
      return node.quasis[0].value.cooked
    }
    return undefined
  }

  const add = node => {
    const specifier = moduleSpecifier(node)
    if (specifier?.startsWith('.')) result.add(specifier)
  }

  const visit = node => {
    if (!node || typeof node !== 'object') return
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration':
      case 'ImportExpression':
        add(node.source)
        break
      case 'CallExpression':
        if (
          node.callee?.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1
        ) {
          add(node.arguments[0])
        }
        break
      default:
        break
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      if (Array.isArray(child)) {
        for (const item of child) visit(item)
      } else {
        visit(child)
      }
    }
  }

  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  return [...result].sort(compareText)
}

function relativeRuntimeFileSpecifiers(source) {
  const result = new Set()

  const literal = node => {
    if (node?.type === 'Literal' && typeof node.value === 'string') {
      return node.value
    }
    if (
      node?.type === 'TemplateLiteral' &&
      node.expressions.length === 0 &&
      node.quasis.length === 1
    ) {
      return node.quasis[0].value.cooked
    }
    return undefined
  }
  const isImportMetaUrl = node =>
    node?.type === 'MemberExpression' &&
    node.computed === false &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'url' &&
    node.object?.type === 'MetaProperty' &&
    node.object.meta?.name === 'import' &&
    node.object.property?.name === 'meta'

  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (
      node.type === 'NewExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'URL' &&
      node.arguments.length === 2 &&
      isImportMetaUrl(node.arguments[1])
    ) {
      const specifier = literal(node.arguments[0])
      if (specifier?.startsWith('.')) result.add(specifier)
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      if (Array.isArray(child)) {
        for (const item of child) visit(item)
      } else {
        visit(child)
      }
    }
  }

  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  return [...result].sort(compareText)
}

function repositoryRuntimeFilePaths(source, repositoryRoot) {
  const result = new Set()
  const visit = node => {
    if (!node || typeof node !== 'object') return
    const value =
      node.type === 'Literal' && typeof node.value === 'string'
        ? node.value
        : node.type === 'TemplateLiteral' &&
            node.expressions.length === 0 &&
            node.quasis.length === 1
          ? node.quasis[0].value.cooked
          : undefined
    if (
      value?.startsWith('recovery/') &&
      path.posix.normalize(value) === value &&
      !value.split('/').includes('..')
    ) {
      const filename = path.join(repositoryRoot, ...value.split('/'))
      try {
        const status = fs.lstatSync(filename)
        if (status.isFile() && !status.isSymbolicLink()) result.add(value)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue
      if (Array.isArray(child)) {
        for (const item of child) visit(item)
      } else {
        visit(child)
      }
    }
  }
  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  return [...result].sort(compareText)
}

function dynamicRuntimeFilePaths(relative, repositoryRoot, caseName) {
  let files
  if (relative === 'recovery/test/late-semantic-source-coverage.test.mjs') {
    const lateCases = [
      '2.1.107-to-2.1.108',
      '2.1.108-to-2.1.109',
      '2.1.109-to-2.1.110',
      '2.1.110-to-2.1.111',
      '2.1.111-to-2.1.112',
      '2.1.112-to-2.1.113',
      '2.1.113-to-2.1.114',
      '2.1.114-to-2.1.116',
    ]
    files = lateCases.flatMap(historicalCase => [
      `recovery/cases/${historicalCase}/manifest.json`,
      `recovery/cases/${historicalCase}/semantic-supplement.patch`,
      `recovery/cases/${historicalCase}/semantic/claude-api-content.json`,
      `recovery/cases/${historicalCase}/semantic/dependency-coverage.json.gz`,
      `recovery/cases/${historicalCase}/semantic/source-coverage.json.gz`,
    ])
    files.push(
      'recovery/test/recovery-2.1.116-workload-identity-semantic.test.mjs',
    )
  } else if (
    relative ===
    'recovery/test/recovery-late-focused-residue-proof-helpers.mjs'
  ) {
    const [, targetVersion] = semanticVersionPair(caseName)
    files = [
      `recovery/test/recovery-${targetVersion}-build-metadata-residue-proofs.json`,
      `recovery/test/recovery-${targetVersion}-exact-owner-correction-proofs.json`,
    ]
  } else {
    return []
  }
  const existing = []
  for (const candidate of files) {
    try {
      safeExistingFile(
        repositoryRoot,
        candidate,
        `dynamic runtime dependency ${candidate}`,
      )
      existing.push(candidate)
    } catch (error) {
      if (
        candidate.endsWith('/semantic-supplement.patch') &&
        error?.cause?.code === 'ENOENT'
      ) {
        continue
      }
      throw error
    }
  }
  return existing.sort(compareText)
}

function resolveRelativeModule(repositoryRoot, importer, specifier, label) {
  const dependencyUrl = new URL(specifier, pathToFileURL(importer))
  dependencyUrl.search = ''
  dependencyUrl.hash = ''
  const unresolved = fileURLToPath(dependencyUrl)
  const repository = path.resolve(repositoryRoot)
  if (
    unresolved !== repository &&
    !unresolved.startsWith(`${repository}${path.sep}`)
  ) {
    throw new Error(`${label}: relative import escaped repository: ${specifier}`)
  }
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    `${unresolved}.mjs`,
    `${unresolved}.cjs`,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    path.join(unresolved, 'index.js'),
    path.join(unresolved, 'index.mjs'),
    path.join(unresolved, 'index.cjs'),
    path.join(unresolved, 'index.ts'),
    path.join(unresolved, 'index.tsx'),
  ]
  const matches = candidates.filter(candidate => {
    try {
      const status = fs.lstatSync(candidate)
      return status.isFile() && !status.isSymbolicLink()
    } catch {
      return false
    }
  })
  if (matches.length !== 1) {
    throw new Error(
      `${label}: relative import ${specifier} resolved to ${matches.length} files`,
    )
  }
  return matches[0]
}

function resolveRelativeRuntimeFile(
  repositoryRoot,
  importer,
  specifier,
  label,
) {
  const dependencyUrl = new URL(specifier, pathToFileURL(importer))
  dependencyUrl.search = ''
  dependencyUrl.hash = ''
  const filename = fileURLToPath(dependencyUrl)
  const relative = path
    .relative(repositoryRoot, filename)
    .split(path.sep)
    .join('/')
  if (
    relative === '' ||
    relative.startsWith('../') ||
    !relative.startsWith('recovery/')
  ) {
    return null
  }
  assertRealFile(filename, `${label}: ${specifier}`)
  return relative
}

function assertedRecoveryPaths(value, repositoryRoot) {
  const candidates = new Map()
  const visit = item => {
    if (!item || typeof item !== 'object') return
    if (
      !Array.isArray(item) &&
      typeof item.path === 'string' &&
      item.path.startsWith('recovery/') &&
      Number.isSafeInteger(item.bytes) &&
      item.bytes >= 0 &&
      typeof item.sha256 === 'string' &&
      SHA256_PATTERN.test(item.sha256)
    ) {
      const descriptors = candidates.get(item.path) ?? []
      descriptors.push({ bytes: item.bytes, sha256: item.sha256 })
      candidates.set(item.path, descriptors)
    }
    for (const child of Object.values(item)) visit(child)
  }
  visit(value)
  const result = []
  for (const [relative, descriptors] of candidates) {
    const filename = safeExistingFile(
      repositoryRoot,
      relative,
      `fixture recovery candidate ${relative}`,
    )
    const bytes = fs.readFileSync(filename)
    const digest = sha256(bytes)
    if (
      descriptors.some(
        descriptor =>
          descriptor.bytes === bytes.length && descriptor.sha256 === digest,
      )
    ) {
      result.push(relative)
    }
  }
  return result.sort(compareText)
}

function isJavaScriptRuntimeFile(relative) {
  return /\.(?:cjs|js|mjs)$/.test(relative)
}

function verifyTestFileAssertions(
  manifest,
  lineage,
  repositoryRoot,
  configuration,
  strictClosure,
  caseName,
) {
  const assertions = lineage.testFileAssertions
  const semanticContract = manifest.generatedRecovery?.semanticCorrespondence
  if (assertions === undefined) {
    if (semanticContract && configuration.files.length > 0) {
      throw new Error(
        'sourceLineage.testFileAssertions is required for semantic tests',
      )
    }
    return []
  }
  if (!Array.isArray(assertions) || assertions.length === 0) {
    throw new Error(
      'sourceLineage.testFileAssertions must be a non-empty array',
    )
  }

  const byPath = new Map()
  const verified = assertions.map((assertion, index) => {
    const label = `sourceLineage test file assertion ${index + 1}`
    if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
      throw new Error(`${label} must be an object`)
    }
    if (typeof assertion.path !== 'string') {
      throw new Error(`${label}.path must be a string`)
    }
    if (byPath.has(assertion.path)) {
      throw new Error(`Duplicate sourceLineage test file assertion: ${assertion.path}`)
    }
    if (!Number.isSafeInteger(assertion.bytes) || assertion.bytes < 0) {
      throw new Error(`${label}.bytes must be a non-negative safe integer`)
    }
    if (
      typeof assertion.sha256 !== 'string' ||
      !SHA256_PATTERN.test(assertion.sha256)
    ) {
      throw new Error(`${label}.sha256 must be a lowercase SHA-256`)
    }
    const filename = safeExistingFile(
      repositoryRoot,
      assertion.path,
      label,
    )
    const value = fs.readFileSync(filename)
    assertEqual(value.length, assertion.bytes, `${assertion.path} byte length`)
    assertEqual(sha256(value), assertion.sha256, `${assertion.path} SHA-256`)
    const record = {
      path: assertion.path,
      filename,
      bytes: value.length,
      sha256: assertion.sha256,
    }
    byPath.set(assertion.path, record)
    return record
  })

  const pending = [...configuration.files]
  const visited = new Set()
  while (pending.length > 0) {
    const relative = pending.pop()
    if (visited.has(relative)) continue
    visited.add(relative)
    const record = byPath.get(relative)
    if (!record) {
      throw new Error(
        `Missing sourceLineage test file assertion for ${relative}`,
      )
    }
    if (strictClosure && relative.endsWith('.json')) {
      const fixture = JSON.parse(fs.readFileSync(record.filename, 'utf8'))
      for (const dependencyRelative of assertedRecoveryPaths(
        fixture,
        repositoryRoot,
      )) {
        if (!byPath.has(dependencyRelative)) {
          throw new Error(
            `Missing sourceLineage test file assertion for fixture ` +
              `${dependencyRelative}`,
          )
        }
        pending.push(dependencyRelative)
      }
      continue
    }
    if (strictClosure && !isJavaScriptRuntimeFile(relative)) continue
    const source = fs.readFileSync(record.filename, 'utf8')
    for (const specifier of relativeModuleSpecifiers(source)) {
      const dependency = resolveRelativeModule(
        repositoryRoot,
        record.filename,
        specifier,
        `sourceLineage test dependency ${relative}`,
      )
      const dependencyRelative = path
        .relative(repositoryRoot, dependency)
        .split(path.sep)
        .join('/')
      if (!byPath.has(dependencyRelative)) {
        throw new Error(
          `Missing sourceLineage test file assertion for imported ` +
            `${dependencyRelative}`,
        )
      }
      pending.push(dependencyRelative)
    }
    if (!strictClosure) continue
    for (const specifier of relativeRuntimeFileSpecifiers(source)) {
      const dependencyRelative = resolveRelativeRuntimeFile(
        repositoryRoot,
        record.filename,
        specifier,
        `sourceLineage test runtime dependency ${relative}`,
      )
      if (dependencyRelative === null) continue
      if (!byPath.has(dependencyRelative)) {
        throw new Error(
          `Missing sourceLineage test file assertion for runtime ` +
            `${dependencyRelative}`,
        )
      }
      pending.push(dependencyRelative)
    }
    for (const dependencyRelative of repositoryRuntimeFilePaths(
      source,
      repositoryRoot,
    )) {
      if (!byPath.has(dependencyRelative)) {
        throw new Error(
          `Missing sourceLineage test file assertion for repository runtime ` +
            `${dependencyRelative}`,
        )
      }
      pending.push(dependencyRelative)
    }
    for (const dependencyRelative of dynamicRuntimeFilePaths(
      relative,
      repositoryRoot,
      caseName,
    )) {
      if (!byPath.has(dependencyRelative)) {
        throw new Error(
          `Missing sourceLineage test file assertion for dynamic runtime ` +
            `${dependencyRelative}`,
        )
      }
      pending.push(dependencyRelative)
    }
    if (relative.endsWith('.test.mjs')) {
      const companion = relative.replace(/\.test\.mjs$/, '.json')
      const companionFilename = path.join(repositoryRoot, ...companion.split('/'))
      if (fs.existsSync(companionFilename)) {
        assertRealFile(companionFilename, `sourceLineage test companion ${companion}`)
        if (!byPath.has(companion)) {
          throw new Error(
            `Missing sourceLineage test file assertion for companion ${companion}`,
          )
        }
        pending.push(companion)
      }
    }
  }

  if (strictClosure) {
    const unreachable = [...byPath.keys()]
      .filter(relative => !visited.has(relative))
      .sort(compareText)
    if (unreachable.length > 0) {
      throw new Error(
        'Unreachable sourceLineage test file assertions: ' +
          unreachable.join(', '),
      )
    }
  }

  return verified.map(({ filename: _, ...record }) => record)
}

function verifiedArtifact(manifest, artifactsRoot, id) {
  if (!artifactsRoot) {
    throw new Error(
      `Artifact environment requires --artifacts (needed for ${id})`,
    )
  }
  assertRealDirectory(artifactsRoot, 'artifacts root')
  const matches = (manifest.artifacts ?? []).filter(item => item.id === id)
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Unknown artifact: ${id}`
        : `Duplicate artifact id: ${id}`,
    )
  }
  const artifact = matches[0]
  if (
    !Number.isSafeInteger(artifact.bytes) ||
    artifact.bytes < 0 ||
    typeof artifact.sha256 !== 'string' ||
    !SHA256_PATTERN.test(artifact.sha256)
  ) {
    throw new Error(`${id}: invalid artifact evidence`)
  }
  const filename = safeExistingFile(
    artifactsRoot,
    artifact.localPath,
    `artifact ${id}`,
  )
  const value = fs.readFileSync(filename)
  assertEqual(value.length, artifact.bytes, `${id} byte length`)
  assertEqual(sha256(value), artifact.sha256, `${id} SHA-256`)
  return filename
}

function verifiedRecoveredAssertions(manifest, caseRoot) {
  const assertions = manifest.recoveredFileAssertions
  if (!Array.isArray(assertions) || assertions.length === 0) {
    throw new Error(
      'testSandbox requires non-empty manifest.recoveredFileAssertions',
    )
  }
  const byPath = new Map()
  for (const [index, assertion] of assertions.entries()) {
    const label = `recoveredFileAssertions[${index}]`
    if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
      throw new Error(`${label} must be an object`)
    }
    relativeParts(assertion.path, `${label}.path`)
    if (byPath.has(assertion.path)) {
      throw new Error(`Duplicate recovered file assertion: ${assertion.path}`)
    }
    if (!Number.isSafeInteger(assertion.bytes) || assertion.bytes < 0) {
      throw new Error(`${label}.bytes must be a non-negative safe integer`)
    }
    if (
      typeof assertion.sha256 !== 'string' ||
      !SHA256_PATTERN.test(assertion.sha256)
    ) {
      throw new Error(`${label}.sha256 must be a lowercase SHA-256`)
    }
    const filename = safeExistingFile(caseRoot, assertion.path, label)
    const value = fs.readFileSync(filename)
    assertEqual(value.length, assertion.bytes, `${assertion.path} byte length`)
    assertEqual(sha256(value), assertion.sha256, `${assertion.path} SHA-256`)
    byPath.set(assertion.path, {
      path: assertion.path,
      filename,
      bytes: assertion.bytes,
      sha256: assertion.sha256,
    })
  }
  return byPath
}

function createTestSandbox({
  artifactsRoot,
  caseName,
  caseRoot,
  manifest,
  repositoryRoot,
  repositoryRoots,
  sandboxConfiguration,
  targetSource,
  testFileAssertions,
  temporaryRoot,
}) {
  if (sandboxConfiguration === null) {
    return { repositoryRoot, report: null }
  }
  if (repositoryRoots === null) {
    throw new Error('testSandbox requires authenticated test Git repositories')
  }
  const sandboxRoot = repositoryRoots.target
  const temporaryPrefix = `${path.resolve(temporaryRoot)}${path.sep}`
  if (!path.resolve(sandboxRoot).startsWith(temporaryPrefix)) {
    throw new Error('test sandbox carrier escaped the temporary root')
  }
  const gitMarker = path.join(sandboxRoot, '.git')
  assertRealFile(gitMarker, 'test sandbox authenticated Git marker')
  assertRealDirectory(path.join(sandboxRoot, 'src'), 'test sandbox source root')
  for (const entry of fs.readdirSync(sandboxRoot).sort(compareText)) {
    if (entry === '.git' || entry === 'src') continue
    fs.rmSync(path.join(sandboxRoot, entry), { recursive: true, force: true })
  }
  assertEqual(
    fs.readdirSync(sandboxRoot).sort(compareText).join(','),
    '.git,src',
    'test sandbox pruned carrier entries',
  )
  const staged = new Map()

  const stage = (relative, value, label, mode = null) => {
    const parts = relativeParts(relative, label)
    const digest = sha256(value)
    const prior = staged.get(relative)
    if (prior !== undefined) {
      if (
        prior.bytes !== value.length ||
        prior.sha256 !== digest ||
        (mode !== null && prior.mode !== mode)
      ) {
        throw new Error(`${label} conflicts with staged ${relative}`)
      }
      return
    }
    let parent = sandboxRoot
    for (const part of parts.slice(0, -1)) {
      const child = path.join(parent, part)
      if (!fs.existsSync(child)) {
        fs.mkdirSync(child)
      } else {
        assertRealDirectory(child, `${label} destination directory`)
      }
      parent = child
    }
    const filename = path.join(parent, parts.at(-1))
    if (fs.existsSync(filename)) {
      assertRealFile(filename, `${label} existing destination`)
      const existing = fs.readFileSync(filename)
      if (!existing.equals(value)) {
        throw new Error(`${label} destination conflicts: ${relative}`)
      }
      const existingMode = fs.statSync(filename).mode & 0o777
      if (mode !== null && existingMode !== mode) {
        throw new Error(
          `${label} destination mode conflicts: ${relative} ` +
            `(expected ${mode}, got ${existingMode})`,
        )
      }
      staged.set(relative, {
        bytes: value.length,
        sha256: digest,
        mode: existingMode,
      })
      return
    }
    fs.writeFileSync(
      filename,
      value,
      mode === null ? { flag: 'wx' } : { flag: 'wx', mode },
    )
    assertRealFile(filename, `${label} staged file`)
    if (mode !== null) fs.chmodSync(filename, mode)
    const stagedMode = fs.statSync(filename).mode & 0o777
    if (mode !== null) {
      assertEqual(stagedMode, mode, `${label} staged mode`)
    }
    staged.set(relative, {
      bytes: value.length,
      sha256: digest,
      mode: stagedMode,
    })
  }

  for (const [index, assertion] of testFileAssertions.entries()) {
    const filename = safeExistingFile(
      repositoryRoot,
      assertion.path,
      `test sandbox test file ${index + 1}`,
    )
    const value = fs.readFileSync(filename)
    assertEqual(value.length, assertion.bytes, `${assertion.path} byte length`)
    assertEqual(sha256(value), assertion.sha256, `${assertion.path} SHA-256`)
    stage(assertion.path, value, `test sandbox test file ${index + 1}`)
  }

  const recovered = verifiedRecoveredAssertions(manifest, caseRoot)
  const sandboxCasePrefix = `recovery/cases/${caseName}`
  for (const [index, assertion] of [...recovered.values()].entries()) {
    stage(
      `${sandboxCasePrefix}/${assertion.path}`,
      fs.readFileSync(assertion.filename),
      `test sandbox recovered file ${index + 1}`,
    )
  }

  const repositoryByEnvironment = new Map([
    [repositoryEnvironmentName(semanticVersionPair(caseName)[0]), repositoryRoots.base],
    [repositoryEnvironmentName(semanticVersionPair(caseName)[1]), repositoryRoots.target],
  ])
  const sourceTreeReports = []
  for (const [index, descriptor] of sandboxConfiguration.sourceTrees.entries()) {
    const sourceRepository = repositoryByEnvironment.get(
      descriptor.repositoryEnvironment,
    )
    if (sourceRepository === undefined) {
      throw new Error(
        `test sandbox source tree ${index + 1} has an unknown repository environment`,
      )
    }
    const summary = summarizeSourceTree(path.join(sourceRepository, 'src'))
    if (descriptor.destination === 'src') {
      assertTreesByteEqual(
        summary,
        targetSource,
        'test sandbox target source tree',
      )
    }
    for (const record of summary.records) {
      const suffix = record.path.slice('src/'.length)
      stage(
        `${descriptor.destination}/${suffix}`,
        fs.readFileSync(record.filename),
        `test sandbox source tree ${index + 1}`,
      )
    }
    sourceTreeReports.push({
      ...descriptor,
      ...publicTreeSummary(summary),
    })
  }

  const legacyArtifactReports = []
  for (const [index, descriptor] of sandboxConfiguration.legacyArtifacts.entries()) {
    const filename = verifiedArtifact(
      manifest,
      artifactsRoot,
      descriptor.artifact,
    )
    const value = fs.readFileSync(filename)
    stage(
      descriptor.destination,
      value,
      `test sandbox legacy artifact ${index + 1}`,
    )
    legacyArtifactReports.push({
      ...descriptor,
      bytes: value.length,
      sha256: sha256(value),
    })
  }

  const expandedFileReports = []
  for (const [index, descriptor] of sandboxConfiguration.expandedFiles.entries()) {
    const assertion = recovered.get(descriptor.source)
    if (assertion === undefined) {
      throw new Error(
        `test sandbox expanded source lacks recovered assertion: ${descriptor.source}`,
      )
    }
    assertEqual(assertion.bytes, descriptor.bytes, `${descriptor.source} byte assertion`)
    assertEqual(
      assertion.sha256,
      descriptor.sha256,
      `${descriptor.source} SHA-256 assertion`,
    )
    const compressed = fs.readFileSync(assertion.filename)
    const expanded = gunzipSync(compressed)
    assertEqual(
      expanded.length,
      descriptor.expandedBytes,
      `${descriptor.source} expanded byte length`,
    )
    assertEqual(
      sha256(expanded),
      descriptor.expandedSha256,
      `${descriptor.source} expanded SHA-256`,
    )
    stage(
      descriptor.destination,
      expanded,
      `test sandbox expanded file ${index + 1}`,
    )
    expandedFileReports.push({ ...descriptor, verified: true })
  }

  const toolchainFileReports = []
  for (const [index, descriptor] of sandboxConfiguration.toolchainFiles.entries()) {
    const filename = safeExistingFile(
      repositoryRoot,
      descriptor.source,
      `test sandbox toolchain file ${index + 1}`,
    )
    const value = fs.readFileSync(filename)
    assertEqual(value.length, descriptor.bytes, `${descriptor.source} byte length`)
    assertEqual(sha256(value), descriptor.sha256, `${descriptor.source} SHA-256`)
    assertEqual(
      fs.statSync(filename).mode & 0o777,
      descriptor.mode,
      `${descriptor.source} mode`,
    )
    stage(
      descriptor.destination,
      value,
      `test sandbox toolchain file ${index + 1}`,
      descriptor.mode,
    )
    toolchainFileReports.push({ ...descriptor, verified: true })
  }

  let bytes = 0
  for (const record of staged.values()) bytes += record.bytes
  return {
    repositoryRoot: sandboxRoot,
    report: {
      schemaVersion: sandboxConfiguration.schemaVersion,
      files: staged.size,
      bytes,
      legacyArtifacts: legacyArtifactReports,
      expandedFiles: expandedFileReports,
      sourceTrees: sourceTreeReports,
      toolchainFiles: toolchainFileReports,
      symlinks: 0,
    },
  }
}

function testEnvironment(
  manifest,
  baselineSourceRoot,
  targetSourceRoot,
  repositoryRoots,
  artifactsRoot,
  mapping,
) {
  const environment = systemTestEnvironment(process.env)
  const resolved = {}
  for (const [name, artifactId] of Object.entries(mapping)) {
    if (
      !ENVIRONMENT_NAME_PATTERN.test(name) ||
      FORBIDDEN_TEST_ENVIRONMENT_NAMES.has(name) ||
      /^CLAUDE_CODE_\d+_\d+_\d+_(?:SOURCE|REPOSITORY)_ROOT$/.test(name)
    ) {
      throw new Error(`Unsafe test environment variable: ${name}`)
    }
    if (typeof artifactId !== 'string' || artifactId.length === 0) {
      throw new Error(`${name}: artifact id must be a non-empty string`)
    }
    const filename = verifiedArtifact(manifest, artifactsRoot, artifactId)
    environment[name] = filename
    resolved[name] = { artifact: artifactId, path: filename }
  }
  const [baselineVersion, targetVersion] = semanticVersionPair(manifest.case)
  const semantic = {
    CLAUDE_CODE_SEMANTIC_CASE: manifest.case,
    CLAUDE_CODE_SEMANTIC_SOURCE_ROOT: targetSourceRoot,
    CLAUDE_CODE_DIRECT_EVIDENCE_SOURCE_ROOT: targetSourceRoot,
  }
  semantic[
    `CLAUDE_CODE_${baselineVersion.replaceAll('.', '_')}_SOURCE_ROOT`
  ] = baselineSourceRoot
  semantic[
    `CLAUDE_CODE_${targetVersion.replaceAll('.', '_')}_SOURCE_ROOT`
  ] = targetSourceRoot
  if (repositoryRoots !== null) {
    semantic[
      `CLAUDE_CODE_${baselineVersion.replaceAll('.', '_')}_REPOSITORY_ROOT`
    ] = repositoryRoots.base
    semantic[
      `CLAUDE_CODE_${targetVersion.replaceAll('.', '_')}_REPOSITORY_ROOT`
    ] = repositoryRoots.target
  }
  Object.assign(environment, semantic)
  return { environment, resolved, semantic }
}

function testSummary(stdout) {
  const read = label => {
    const matches = [
      ...stdout.matchAll(
        new RegExp(`^[ \\t]*(?:ℹ|#) ${label} (\\d+)\\r?$`, 'gm'),
      ),
    ]
    if (matches.length === 0) {
      throw new Error(`test output has no ${label} summary`)
    }
    return Number(matches.at(-1)[1])
  }
  const summary = {
    tests: read('tests'),
    passed: read('pass'),
    failed: read('fail'),
    skipped: read('skipped'),
  }
  if (summary.passed + summary.failed + summary.skipped !== summary.tests) {
    throw new Error('test output summary arithmetic does not close')
  }
  return summary
}

function frozenTestExecution(manifest, caseRoot) {
  const freeze = manifest.sourceFreeze
  if (freeze === undefined) return null
  if (!freeze || typeof freeze !== 'object' || Array.isArray(freeze)) {
    throw new Error('sourceFreeze must be an object')
  }
  if (
    typeof freeze.identity !== 'string' ||
    typeof freeze.identitySha256 !== 'string' ||
    !SHA256_PATTERN.test(freeze.identitySha256)
  ) {
    throw new Error('sourceFreeze identity must have a pinned SHA-256')
  }
  const filename = safeExistingFile(
    caseRoot,
    freeze.identity,
    'sourceFreeze identity',
  )
  const value = fs.readFileSync(filename)
  assertEqual(
    sha256(value),
    freeze.identitySha256,
    'sourceFreeze identity SHA-256',
  )
  const identity = JSON.parse(value)
  const targetTests = identity.verification?.targetTests
  if (
    !targetTests ||
    typeof targetTests !== 'object' ||
    Array.isArray(targetTests)
  ) {
    throw new Error('sourceFreeze identity has no target test execution')
  }

  // Older frozen identities did not record skipped tests. Keep those schemas
  // compatible; identities with the field opt into exact live-result binding.
  if (targetTests.skipped === undefined) return null
  const summary = {}
  for (const field of ['tests', 'passed', 'failed', 'skipped', 'files']) {
    const count = targetTests[field]
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`sourceFreeze targetTests.${field} must be a count`)
    }
    summary[field] = count
  }
  if (summary.passed + summary.failed + summary.skipped !== summary.tests) {
    throw new Error('sourceFreeze target test summary arithmetic does not close')
  }
  return {
    identity: {
      path: freeze.identity,
      sha256: freeze.identitySha256,
    },
    summary,
  }
}

function authenticatedSyntaxRuntime(testSandbox, sandboxConfiguration) {
  if (sandboxConfiguration === null) return 'bun'
  if (testSandbox.report === null) {
    throw new Error('authenticated syntax runtime requires a test sandbox')
  }
  const runtime = safeExistingFile(
    testSandbox.repositoryRoot,
    sandboxConfiguration.syntaxRuntime,
    'authenticated syntax runtime',
  )
  assertEqual(
    fs.statSync(runtime).mode & 0o777,
    0o755,
    'authenticated syntax runtime mode',
  )
  return runtime
}

function hermeticSyntaxEnvironment(temporaryRoot, syntaxRuntime) {
  return {
    HOME: temporaryRoot,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: path.dirname(syntaxRuntime),
    TEMP: temporaryRoot,
    TMP: temporaryRoot,
    TMPDIR: temporaryRoot,
    TZ: 'UTC',
  }
}

function runSyntaxChecks(
  workspace,
  temporaryRoot,
  relativePaths,
  syntaxRuntime,
  syntaxEnvironment,
) {
  return relativePaths.map((relative, index) => {
    const parts = relativeParts(relative, `syntax check ${index + 1}`)
    if (parts[0] !== 'src' || parts.length < 2) {
      throw new Error(`Syntax check must be within src: ${relative}`)
    }
    const input = safeExistingFile(
      workspace,
      relative,
      `syntax check ${index + 1}`,
    )
    const output = path.join(temporaryRoot, `syntax-${index}.js`)
    const options = { cwd: workspace }
    if (syntaxEnvironment !== undefined) options.env = syntaxEnvironment
    run(
      syntaxRuntime,
      [
        'build',
        input,
        '--target=bun',
        '--external=*',
        `--outfile=${output}`,
      ],
      options,
    )
    assertRealFile(output, `syntax output for ${relative}`)
    return relative
  })
}

function runTests(
  manifest,
  caseRoot,
  executionRepositoryRoot,
  baselineSourceRoot,
  targetSourceRoot,
  repositoryRoots,
  artifactsRoot,
  configuration,
  sandboxReport,
) {
  const files = configuration.files.map((relative, index) =>
    safeExistingFile(
      executionRepositoryRoot,
      relative,
      `sourceLineage test ${index + 1}`,
    ),
  )
  const configuredEnvironment = testEnvironment(
    manifest,
    baselineSourceRoot,
    targetSourceRoot,
    repositoryRoots,
    artifactsRoot,
    configuration.artifactEnvironment,
  )
  if (sandboxReport !== null) {
    const sandboxBun = safeExistingFile(
      executionRepositoryRoot,
      '.pixi/envs/default/bin/bun',
      'semantic test authenticated Bun runtime',
    )
    const sandboxBin = path.dirname(sandboxBun)
    const inheritedPath = configuredEnvironment.environment.PATH
    configuredEnvironment.environment.PATH =
      typeof inheritedPath === 'string' && inheritedPath.length > 0
        ? `${sandboxBin}${path.delimiter}${inheritedPath}`
        : sandboxBin
  }
  const frozen = frozenTestExecution(manifest, caseRoot)
  if (files.length === 0) {
    if (frozen !== null) {
      throw new Error('frozen target tests exist but no live tests are configured')
    }
    return {
      status: 'not-configured',
      files: [],
      artifactEnvironment: configuredEnvironment.resolved,
      semanticEnvironment: configuredEnvironment.semantic,
      summary: null,
      tapSummary: null,
      frozenTargetTests: null,
      sandbox: sandboxReport,
    }
  }
  const result = run(process.execPath, ['--test', ...files], {
    cwd: executionRepositoryRoot,
    env: configuredEnvironment.environment,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const summaryLine =
    output
      .split('\n')
      .filter(line => /^[ \t]*(?:ℹ|#) tests \d+\r?$/.test(line))
      .at(-1) ?? null
  const tapSummary = testSummary(output)
  const liveExecution = {
    ...tapSummary,
    files: configuration.files.length,
  }
  if (
    frozen !== null &&
    JSON.stringify(liveExecution) !== JSON.stringify(frozen.summary)
  ) {
    throw new Error(
      'Live source-lineage TAP summary differs from frozen targetTests: ' +
        `expected ${JSON.stringify(frozen.summary)}, ` +
        `got ${JSON.stringify(liveExecution)}`,
    )
  }
  return {
    status: 'passed',
    files: configuration.files,
    artifactEnvironment: configuredEnvironment.resolved,
    semanticEnvironment: configuredEnvironment.semantic,
    summary: summaryLine,
    tapSummary,
    frozenTargetTests:
      frozen === null
        ? null
        : { ...frozen.identity, ...frozen.summary, matched: true },
    sandbox: sandboxReport,
  }
}

export function verifySourceLineage({
  artifactsRoot,
  manifestPath,
  repositoryRoot,
}) {
  const resolvedManifest = path.resolve(manifestPath)
  const resolvedRepository = path.resolve(repositoryRoot)
  const resolvedArtifacts =
    artifactsRoot === undefined ? undefined : path.resolve(artifactsRoot)
  assertRealFile(resolvedManifest, 'case manifest')
  assertRealDirectory(resolvedRepository, 'repository root')
  const manifest = JSON.parse(fs.readFileSync(resolvedManifest, 'utf8'))
  const lineage = manifest.sourceLineage
  if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) {
    throw new Error('Manifest has no sourceLineage object')
  }
  if (lineage.root !== undefined && lineage.root !== 'src') {
    throw new Error('sourceLineage.root must be `src`')
  }
  if (lineage.base !== undefined && lineage.baseTree !== undefined) {
    throw new Error('sourceLineage has both base and baseTree')
  }
  if (lineage.target !== undefined && lineage.targetTree !== undefined) {
    throw new Error('sourceLineage has both target and targetTree')
  }
  const expectedBase = normalizeTreeAssertion(
    lineage.base ?? lineage.baseTree,
    'sourceLineage.base',
  )
  const expectedTarget = normalizeTreeAssertion(
    lineage.target ?? lineage.targetTree,
    'sourceLineage.target',
  )
  const caseRoot = path.dirname(resolvedManifest)
  const caseName = manifest.case ?? path.basename(caseRoot)
  const gitHistory = normalizeGitHistory(lineage, caseName)
  const testGitRepositories = normalizeTestGitRepositories(
    lineage,
    caseName,
    gitHistory,
  )
  const patches = normalizePatchEntries(
    manifest,
    lineage,
    caseRoot,
  )
  const sourceRoot = path.join(resolvedRepository, 'src')
  const testConfiguration = normalizeTestConfiguration(lineage)
  const testSandboxConfiguration = normalizeTestSandbox(lineage, caseName)
  const testFileAssertions = verifyTestFileAssertions(
    manifest,
    lineage,
    resolvedRepository,
    testConfiguration,
    testSandboxConfiguration !== null,
    caseName,
  )
  const repositoryTarget = summarizeSourceTree(sourceRoot)
  assertTreeSummary(
    repositoryTarget,
    expectedTarget,
    'repository target source tree',
  )

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'claude-source-lineage-'),
  )
  let base
  let reconstructed
  let checkedSyntax
  let gitBase
  let gitTarget
  let verifiedRepositoryRoots
  let tests
  try {
    const workspace = path.join(temporaryRoot, 'workspace')
    fs.mkdirSync(workspace)
    fs.cpSync(sourceRoot, path.join(workspace, 'src'), {
      recursive: true,
      errorOnExist: true,
      force: false,
    })
    assertWorkspaceScope(workspace)

    for (const patch of [...patches].reverse()) {
      applyPatch(patch, workspace, true)
      assertWorkspaceScope(workspace)
    }
    base = summarizeSourceTree(path.join(workspace, 'src'))
    assertTreeSummary(base, expectedBase, 'recovered base source tree')
    const copiedBaselineSourceRoot = path.join(
      temporaryRoot,
      'verified-base-src',
    )
    fs.cpSync(path.join(workspace, 'src'), copiedBaselineSourceRoot, {
      recursive: true,
      errorOnExist: true,
      force: false,
    })
    const copiedBaselineSource = summarizeSourceTree(copiedBaselineSourceRoot)
    assertTreesByteEqual(
      base,
      copiedBaselineSource,
      'verified baseline test source',
    )
    gitBase = verifyGitEndpoint(
      resolvedRepository,
      temporaryRoot,
      gitHistory.base,
      base,
      'base',
    )

    for (const patch of patches) {
      applyPatch(patch, workspace, false)
      assertWorkspaceScope(workspace)
    }
    reconstructed = summarizeSourceTree(path.join(workspace, 'src'))
    assertTreeSummary(
      reconstructed,
      expectedTarget,
      'reconstructed target source tree',
    )
    assertTreesByteEqual(
      repositoryTarget,
      reconstructed,
      'reconstructed target versus repository',
    )
    gitTarget = verifyGitEndpoint(
      resolvedRepository,
      temporaryRoot,
      gitHistory.target,
      reconstructed,
      'target',
    )
    if (gitHistory.base !== null) {
      run(
        'git',
        [
          'merge-base',
          '--is-ancestor',
          gitHistory.base.commit,
          gitHistory.target?.commit ?? 'HEAD',
        ],
        { cwd: resolvedRepository },
      )
    }
    verifiedRepositoryRoots = createVerifiedRepositoryRoots(
      resolvedRepository,
      temporaryRoot,
      testGitRepositories,
      copiedBaselineSource,
      reconstructed,
    )
    const baselineSourceRoot =
      verifiedRepositoryRoots === null
        ? copiedBaselineSourceRoot
        : path.join(verifiedRepositoryRoots.base, 'src')
    const targetSourceRoot =
      verifiedRepositoryRoots === null
        ? sourceRoot
        : path.join(verifiedRepositoryRoots.target, 'src')
    const testSandbox = createTestSandbox({
      artifactsRoot: resolvedArtifacts,
      caseName,
      caseRoot,
      manifest,
      repositoryRoot: resolvedRepository,
      repositoryRoots: verifiedRepositoryRoots,
      sandboxConfiguration: testSandboxConfiguration,
      targetSource: reconstructed,
      testFileAssertions,
      temporaryRoot,
    })
    const syntaxRuntime = authenticatedSyntaxRuntime(
      testSandbox,
      testSandboxConfiguration,
    )
    const syntaxEnvironment =
      testSandboxConfiguration === null
        ? undefined
        : hermeticSyntaxEnvironment(temporaryRoot, syntaxRuntime)
    checkedSyntax = runSyntaxChecks(
      workspace,
      temporaryRoot,
      syntaxPaths(lineage),
      syntaxRuntime,
      syntaxEnvironment,
    )
    tests = runTests(
      manifest,
      caseRoot,
      testSandbox.repositoryRoot,
      baselineSourceRoot,
      targetSourceRoot,
      verifiedRepositoryRoots,
      resolvedArtifacts,
      testConfiguration,
      testSandbox.report,
    )
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }

  const baseSummary = publicTreeSummary(base)
  const targetSummary = publicTreeSummary(reconstructed)
  const patchSet = lineage.patchSet ?? lineage.name ?? 'incremental'
  if (typeof patchSet !== 'string' || patchSet.length === 0) {
    throw new Error('sourceLineage.patchSet must be a non-empty string')
  }
  return {
    case: caseName,
    status: 'source-lineage-verified',
    patchSet,
    base: baseSummary,
    target: targetSummary,
    sourceTree: {
      state: 'verified-incremental-overlay',
      root: 'src',
      base: baseSummary,
      target: targetSummary,
      repository: publicTreeSummary(repositoryTarget),
      byteComparison: 'reconstructed-overlay-to-repository-src-exact',
      targetBundleComparison: 'not-performed',
      reproducesAuthenticatedTargetBundleExactly: false,
    },
    gitBase,
    gitTarget,
    legacyGitTarget: gitHistory.legacyTarget,
    testGitRepositories:
      verifiedRepositoryRoots === null
        ? null
        : {
            explicit: verifiedRepositoryRoots.explicit,
            environments: verifiedRepositoryRoots.verification,
          },
    patches: patches.map(({ path: patchPath, bytes, sha256: digest }) => ({
      path: patchPath,
      bytes,
      sha256: digest,
    })),
    syntaxChecks: checkedSyntax,
    testFileAssertions,
    semanticTests: tests.summary,
    tests,
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.case || !args.repo) {
    usage()
    process.exitCode = 2
    return
  }
  console.log(
    JSON.stringify(
      verifySourceLineage({
        artifactsRoot: args.artifacts,
        manifestPath: args.case,
        repositoryRoot: args.repo,
      }),
      null,
      2,
    ),
  )
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedAsScript) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
