#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { parse } from 'acorn'

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const FORBIDDEN_TEST_ENVIRONMENT_NAMES = new Set([
  'BUN_OPTIONS',
  'DYLD_INSERT_LIBRARIES',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PATH',
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

function resolveRelativeModule(repositoryRoot, importer, specifier, label) {
  const unresolved = path.resolve(path.dirname(importer), specifier)
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

function verifyTestFileAssertions(
  manifest,
  lineage,
  repositoryRoot,
  configuration,
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

function testEnvironment(manifest, artifactsRoot, mapping) {
  const environment = { ...process.env }
  const resolved = {}
  for (const [name, artifactId] of Object.entries(mapping)) {
    if (
      !ENVIRONMENT_NAME_PATTERN.test(name) ||
      FORBIDDEN_TEST_ENVIRONMENT_NAMES.has(name)
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
  return { environment, resolved }
}

function runSyntaxChecks(workspace, temporaryRoot, relativePaths) {
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
    run(
      'bun',
      [
        'build',
        input,
        '--target=bun',
        '--external=*',
        `--outfile=${output}`,
      ],
      { cwd: workspace },
    )
    assertRealFile(output, `syntax output for ${relative}`)
    return relative
  })
}

function runTests(
  manifest,
  repositoryRoot,
  artifactsRoot,
  configuration,
) {
  const files = configuration.files.map((relative, index) =>
    safeExistingFile(
      repositoryRoot,
      relative,
      `sourceLineage test ${index + 1}`,
    ),
  )
  const configuredEnvironment = testEnvironment(
    manifest,
    artifactsRoot,
    configuration.artifactEnvironment,
  )
  if (files.length === 0) {
    return {
      status: 'not-configured',
      files: [],
      artifactEnvironment: configuredEnvironment.resolved,
      summary: null,
    }
  }
  const result = run(process.execPath, ['--test', ...files], {
    cwd: repositoryRoot,
    env: configuredEnvironment.environment,
  })
  const summary =
    result.stdout
      .split('\n')
      .find(line => line.startsWith('ℹ tests ') || line.startsWith('# tests ')) ??
    null
  return {
    status: 'passed',
    files: configuration.files,
    artifactEnvironment: configuredEnvironment.resolved,
    summary,
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
  const patches = normalizePatchEntries(
    manifest,
    lineage,
    caseRoot,
  )
  const sourceRoot = path.join(resolvedRepository, 'src')
  const testConfiguration = normalizeTestConfiguration(lineage)
  const testFileAssertions = verifyTestFileAssertions(
    manifest,
    lineage,
    resolvedRepository,
    testConfiguration,
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
    checkedSyntax = runSyntaxChecks(
      workspace,
      temporaryRoot,
      syntaxPaths(lineage),
    )
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }

  const tests = runTests(
    manifest,
    resolvedRepository,
    resolvedArtifacts,
    testConfiguration,
  )
  const baseSummary = publicTreeSummary(base)
  const targetSummary = publicTreeSummary(reconstructed)
  const patchSet = lineage.patchSet ?? lineage.name ?? 'incremental'
  if (typeof patchSet !== 'string' || patchSet.length === 0) {
    throw new Error('sourceLineage.patchSet must be a non-empty string')
  }
  return {
    case: manifest.case ?? path.basename(caseRoot),
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
      byteComparison: 'exact',
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
