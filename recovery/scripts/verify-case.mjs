#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { summarizeSourceMap } from '../lib/source-map.mjs'
import { exactTextInsertion } from '../lib/exact-text-insertion.mjs'

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: verify-case.mjs --case manifest.json --repo DIR ' +
          '[--artifacts DIR | per-artifact overrides]',
      )
    }
    result[key.slice(2)] = value
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

function resolveArtifact(artifact, args) {
  if (args[artifact.argument]) return path.resolve(args[artifact.argument])
  if (!args.artifacts) {
    throw new Error(
      `Missing --${artifact.argument}; alternatively provide --artifacts DIR`,
    )
  }
  const root = path.resolve(args.artifacts)
  const parts = artifact.localPath.split('/')
  if (
    path.isAbsolute(artifact.localPath) ||
    artifact.localPath.includes('\\') ||
    parts.length === 0 ||
    parts.includes('') ||
    parts.includes('.') ||
    parts.includes('..')
  ) {
    throw new Error(`${artifact.id}: unsafe local artifact path`)
  }
  const filename = path.resolve(root, ...parts)
  if (!filename.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${artifact.id}: artifact path escaped root`)
  }
  return filename
}

function verifyArtifact(artifact, filename) {
  const buffer = fs.readFileSync(filename)
  assertEqual(buffer.length, artifact.bytes, `${artifact.id} byte length`)
  assertEqual(sha256(buffer), artifact.sha256, `${artifact.id} sha256`)
  return {
    id: artifact.id,
    path: filename,
    bytes: buffer.length,
    sha256: artifact.sha256,
  }
}

function safeApplicationPath(repo, source) {
  const prefix = '../src/'
  if (!source.startsWith(prefix)) return null
  const relative = source.slice(prefix.length)
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative.split('/').includes('..')
  ) {
    throw new Error(`Unsafe source-map path: ${source}`)
  }
  const root = path.resolve(repo, 'src')
  const resolved = path.resolve(root, relative)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Source-map path escaped repository: ${source}`)
  }
  return { relative: relative.replaceAll('\\', '/'), resolved }
}

function walkFiles(directory) {
  const result = []
  const pending = [directory]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (entry.isFile()) result.push(filename)
    }
  }
  return result
}

function normalizeAppliedSourceTree(repo, appliedSourceTree) {
  if (!appliedSourceTree) {
    return {
      assertions: new Map(),
      absentBaselineFiles: new Set(),
      absentTargetFiles: new Set(),
    }
  }
  if (!Array.isArray(appliedSourceTree.files)) {
    throw new Error('appliedSourceTree.files must be an array')
  }
  const assertions = new Map()
  const absentBaselineFiles = new Set()
  const absentTargetFiles = new Set()
  for (const assertion of appliedSourceTree.files) {
    const targetIsAbsent = assertion.target === 'absent'
    if (
      typeof assertion.path !== 'string' ||
      !assertion.path.startsWith('src/') ||
      assertions.has(assertion.path.slice(4)) ||
      (targetIsAbsent
        ? assertion.bytes !== undefined || assertion.sha256 !== undefined
        : !Number.isSafeInteger(assertion.bytes) ||
          assertion.bytes < 0 ||
          !/^[a-f0-9]{64}$/.test(assertion.sha256))
    ) {
      throw new Error(
        `Invalid or duplicate applied source assertion: ${assertion.path}`,
      )
    }
    const relative = assertion.path.slice(4)
    const resolved = path.resolve(repo, assertion.path)
    const sourceRoot = path.resolve(repo, 'src')
    if (!resolved.startsWith(`${sourceRoot}${path.sep}`)) {
      throw new Error(`${assertion.path}: applied source path escaped src`)
    }
    assertions.set(relative, { ...assertion, relative, resolved })
    if (assertion.baseline === 'absent') absentBaselineFiles.add(relative)
    else if (assertion.baseline !== undefined) {
      throw new Error(
        `${assertion.path}: unknown baseline state ${assertion.baseline}`,
      )
    }
    if (targetIsAbsent) absentTargetFiles.add(relative)
    else if (assertion.target !== undefined) {
      throw new Error(
        `${assertion.path}: unknown target state ${assertion.target}`,
      )
    }
    if (
      absentBaselineFiles.has(relative) &&
      absentTargetFiles.has(relative)
    ) {
      throw new Error(
        `${assertion.path}: cannot be absent from both baseline and target`,
      )
    }
  }
  return { assertions, absentBaselineFiles, absentTargetFiles }
}

export function verifyBaseline(mapPath, repo, oracle, appliedSourceTree) {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
  const sourceMapSummary = summarizeSourceMap(map)
  for (const [key, expected] of Object.entries(oracle.sourceMap)) {
    assertEqual(sourceMapSummary[key], expected, `source map ${key}`)
  }

  const applicationHash = crypto.createHash('sha256')
  const nestedHash = crypto.createHash('sha256')
  const expectedFiles = new Set()
  let applicationSourceCount = 0
  let applicationSourceBytes = 0
  let tsxSourceCount = 0
  let nestedOriginalBytes = 0
  const overlay = normalizeAppliedSourceTree(repo, appliedSourceTree)
  const appliedByRelative = new Map()
  let baselineOverlayFiles = 0
  let recoveredOverlayFiles = 0

  const recordAppliedFile = (relative, assertion, value) => {
    assertEqual(
      value.length,
      assertion.bytes,
      `${assertion.path} byte length`,
    )
    assertEqual(
      sha256(value),
      assertion.sha256,
      `${assertion.path} sha256`,
    )
    recoveredOverlayFiles += 1
    appliedByRelative.set(relative, {
      path: assertion.path,
      baseline: assertion.baseline ?? 'source-map',
      bytes: assertion.bytes,
      sha256: assertion.sha256,
    })
  }
  const recordAppliedDeletion = (relative, assertion) => {
    recoveredOverlayFiles += 1
    appliedByRelative.set(relative, {
      path: assertion.path,
      baseline: assertion.baseline ?? 'source-map',
      target: 'absent',
    })
  }

  for (let index = 0; index < map.sources.length; index += 1) {
    const source = map.sources[index]
    const content = map.sourcesContent[index]
    const applicationPath = safeApplicationPath(repo, source)
    if (!applicationPath) continue
    if (typeof content !== 'string') {
      throw new Error(`${source}: missing sourcesContent`)
    }

    applicationSourceCount += 1
    applicationSourceBytes += Buffer.byteLength(content)
    expectedFiles.add(applicationPath.relative)
    applicationHash
      .update(source)
      .update('\0')
      .update(sha256(content))
      .update('\0')

    const appliedAssertion = overlay.assertions.get(applicationPath.relative)
    if (appliedAssertion) {
      if (overlay.absentBaselineFiles.has(applicationPath.relative)) {
        throw new Error(
          `${source}: overlay marks a source-map file absent from baseline`,
        )
      }
      if (overlay.absentTargetFiles.has(applicationPath.relative)) {
        if (fs.existsSync(applicationPath.resolved)) {
          const repositoryContent = fs.readFileSync(applicationPath.resolved)
          if (!repositoryContent.equals(Buffer.from(content))) {
            throw new Error(
              `${source}: target-absent source differs from the baseline`,
            )
          }
          baselineOverlayFiles += 1
        } else {
          recordAppliedDeletion(applicationPath.relative, appliedAssertion)
        }
      } else {
        const repositoryContent = fs.readFileSync(applicationPath.resolved)
        if (repositoryContent.equals(Buffer.from(content))) {
          baselineOverlayFiles += 1
        } else {
          recordAppliedFile(
            applicationPath.relative,
            appliedAssertion,
            repositoryContent,
          )
        }
      }
    } else {
      const repositoryContent = fs.readFileSync(
        applicationPath.resolved,
        'utf8',
      )
      if (repositoryContent !== content) {
        throw new Error(
          `${source}: repository content differs from source map`,
        )
      }
    }

    if (source.endsWith('.tsx')) {
      const match = content.match(
        /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)\s*$/,
      )
      if (!match) throw new Error(`${source}: missing nested inline source map`)
      const nested = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'))
      if (
        nested.sources?.length !== 1 ||
        nested.sourcesContent?.length !== 1 ||
        typeof nested.sourcesContent[0] !== 'string'
      ) {
        throw new Error(`${source}: unexpected nested source-map topology`)
      }
      const original = nested.sourcesContent[0]
      tsxSourceCount += 1
      nestedOriginalBytes += Buffer.byteLength(original)
      nestedHash
        .update(source)
        .update('\0')
        .update(nested.sources[0])
        .update('\0')
        .update(sha256(original))
        .update('\0')
    }
  }

  const repositoryFiles = walkFiles(path.resolve(repo, 'src')).map(filename =>
    path.relative(path.resolve(repo, 'src'), filename).replaceAll('\\', '/'),
  )
  const extras = repositoryFiles.filter(
    filename =>
      !expectedFiles.has(filename) &&
      !overlay.absentBaselineFiles.has(filename),
  )
  if (extras.length > 0) {
    throw new Error(`Repository has ${extras.length} extra src files: ${extras[0]}`)
  }
  for (const [relative, assertion] of overlay.assertions) {
    const isBaselineSource = expectedFiles.has(relative)
    if (isBaselineSource !== !overlay.absentBaselineFiles.has(relative)) {
      throw new Error(
        `${assertion.path}: baseline presence does not match source map`,
      )
    }
    if (overlay.absentTargetFiles.has(relative) && !isBaselineSource) {
      throw new Error(
        `${assertion.path}: target-absent assertion has no baseline source`,
      )
    }
    if (!isBaselineSource) {
      if (fs.existsSync(assertion.resolved)) {
        recordAppliedFile(
          relative,
          assertion,
          fs.readFileSync(assertion.resolved),
        )
      } else {
        baselineOverlayFiles += 1
      }
    }
  }
  assertEqual(
    baselineOverlayFiles + recoveredOverlayFiles,
    overlay.assertions.size,
    'recognized source overlay file count',
  )
  if (baselineOverlayFiles > 0 && recoveredOverlayFiles > 0) {
    throw new Error(
      'Repository has a partially applied source overlay: expected every ' +
        'recovery file to be either baseline or recovered',
    )
  }
  const appliedFiles = [...overlay.assertions.keys()]
    .filter(relative => appliedByRelative.has(relative))
    .map(relative => appliedByRelative.get(relative))

  const actual = {
    applicationSourceCount,
    applicationSourceBytes,
    applicationManifestSha256: applicationHash.digest('hex'),
    tsxSourceCount,
    nestedOriginalBytes,
    nestedOriginalManifestSha256: nestedHash.digest('hex'),
  }
  for (const [key, expected] of Object.entries(oracle)) {
    if (key === 'sourceMap') continue
    assertEqual(actual[key], expected, `baseline oracle ${key}`)
  }
  return {
    ...actual,
    sourceMap: sourceMapSummary,
    repositoryState:
      recoveredOverlayFiles === 0
        ? { kind: 'exact-baseline', appliedFiles: [] }
        : {
            kind: 'verified-recovered-overlay',
            base: appliedSourceTree.base,
            patchSet: appliedSourceTree.patchSet,
            appliedFiles,
          },
  }
}

function verifyTarget(manifest, files) {
  const assertions = manifest.targetAssertions
  const baselineDeclarations = fs.readFileSync(
    files.baselineDeclarations,
    'utf8',
  )
  const declarations = fs.readFileSync(files.targetDeclarations, 'utf8')
  let declarationsChange
  if (assertions.declarationExactInsertion) {
    const insertion = assertions.declarationExactInsertion
    const anchorIndex = baselineDeclarations.indexOf(insertion.anchor)
    if (anchorIndex < 0) {
      throw new Error('Declaration insertion anchor is absent from baseline')
    }
    if (
      baselineDeclarations.indexOf(
        insertion.anchor,
        anchorIndex + insertion.anchor.length,
      ) >= 0
    ) {
      throw new Error('Declaration insertion anchor is not unique')
    }
    const expectedDeclarations =
      baselineDeclarations.slice(0, anchorIndex + insertion.anchor.length) +
      insertion.text +
      baselineDeclarations.slice(anchorIndex + insertion.anchor.length)
    assertEqual(
      declarations,
      expectedDeclarations,
      'target declarations exact insertion',
    )
    declarationsChange = 'one exact insertion'
  } else if (assertions.declarationChange?.kind === 'unchanged') {
    assertEqual(
      declarations,
      baselineDeclarations,
      'target declarations unchanged',
    )
    declarationsChange = 'unchanged'
  } else {
    throw new Error(
      'targetAssertions must describe declarationExactInsertion or ' +
        'declarationChange.kind=unchanged',
    )
  }

  const baselinePackageText = fs.readFileSync(
    files.baselinePackageJson,
    'utf8',
  )
  const targetPackageText = fs.readFileSync(files.targetPackageJson, 'utf8')
  const versionChange = assertions.packageVersionChange
  const baselineVersion = `"version": "${versionChange.baseline}"`
  const targetVersion = `"version": "${versionChange.target}"`
  let expectedPackageText = baselinePackageText.replace(
    baselineVersion,
    targetVersion,
  )
  if (expectedPackageText === baselinePackageText) {
    throw new Error('Baseline package version marker was not found')
  }
  const packageJsonInsertion = assertions.packageJsonExactInsertion
  if (packageJsonInsertion) {
    expectedPackageText = exactTextInsertion(
      expectedPackageText,
      packageJsonInsertion,
      'Package JSON',
    )
  }
  assertEqual(
    targetPackageText,
    expectedPackageText,
    packageJsonInsertion
      ? 'target package exact version and insertion change'
      : 'target package exact version-only change',
  )
  const packageJson = JSON.parse(targetPackageText)
  assertEqual(
    packageJson.version,
    versionChange.target,
    'target package version',
  )

  const bundle = fs.readFileSync(files.targetBundle, 'utf8')
  const fragments = []
  for (const assertion of assertions.bundleFragments) {
    const start = bundle.indexOf(assertion.start)
    if (start < 0) throw new Error(`${assertion.id}: start delimiter not found`)
    const endDelimiter = bundle.indexOf(assertion.end, start)
    if (endDelimiter < 0) {
      throw new Error(`${assertion.id}: end delimiter not found`)
    }
    const end = endDelimiter + (assertion.includeEndPrefix ?? 0)
    const fragment = bundle.slice(start, end)
    assertEqual(
      Buffer.byteLength(fragment),
      assertion.bytes,
      `${assertion.id} byte length`,
    )
    assertEqual(sha256(fragment), assertion.sha256, `${assertion.id} sha256`)
    fragments.push({
      id: assertion.id,
      generatedStart: start,
      generatedEnd: end,
      bytes: assertion.bytes,
      sha256: assertion.sha256,
    })
  }
  return {
    packageVersion: packageJson.version,
    declarationsChange,
    packageChange: packageJsonInsertion
      ? 'version plus one exact insertion'
      : 'version only',
    fragments,
  }
}

function safeCaseFile(caseRoot, relative, label) {
  if (typeof relative !== 'string') {
    throw new Error(`${label}: path must be a string`)
  }
  const parts = relative.split('/')
  if (
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    parts.length === 0 ||
    parts.includes('') ||
    parts.includes('.') ||
    parts.includes('..')
  ) {
    throw new Error(`${label}: unsafe case-relative path ${relative}`)
  }
  const filename = path.resolve(caseRoot, ...parts)
  if (!filename.startsWith(`${path.resolve(caseRoot)}${path.sep}`)) {
    throw new Error(`${label}: path escaped case directory`)
  }
  return filename
}

function verifyRecoveryLedger(manifest, manifestPath) {
  const edits = manifest.recoveredEdits
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error('Case has no recoveredEdits ledger')
  }
  const knownEvidence = new Set([
    ...manifest.artifacts.map(artifact => artifact.id),
    ...manifest.targetAssertions.bundleFragments.map(fragment => fragment.id),
  ])
  const fragmentCoverage = new Map(
    manifest.targetAssertions.bundleFragments.map(fragment => [fragment.id, 0]),
  )
  const caseRoot = path.dirname(path.resolve(manifestPath))
  const editIds = new Set()
  const files = new Map()
  const fileAssertions = new Map()
  const allowedConfidence = new Set(['exact', 'equivalent', 'inferred'])

  for (const assertion of manifest.recoveredFileAssertions ?? []) {
    if (
      typeof assertion.path !== 'string' ||
      fileAssertions.has(assertion.path)
    ) {
      throw new Error(
        `Invalid or duplicate recovered file assertion: ${assertion.path}`,
      )
    }
    fileAssertions.set(assertion.path, assertion)
  }

  for (const edit of edits) {
    if (typeof edit.id !== 'string' || editIds.has(edit.id)) {
      throw new Error(`Invalid or duplicate recovered edit id: ${edit.id}`)
    }
    editIds.add(edit.id)
    if (!allowedConfidence.has(edit.confidence)) {
      throw new Error(`${edit.id}: unknown confidence ${edit.confidence}`)
    }
    if (!Array.isArray(edit.files) || edit.files.length === 0) {
      throw new Error(`${edit.id}: no recovered files`)
    }
    if (!Array.isArray(edit.explains) || edit.explains.length === 0) {
      throw new Error(`${edit.id}: no evidence links`)
    }

    for (const relative of edit.files) {
      const filename = safeCaseFile(caseRoot, relative, edit.id)
      const value = fs.readFileSync(filename)
      const assertion = fileAssertions.get(relative)
      if (!assertion) {
        throw new Error(`${edit.id}: ${relative} has no hash assertion`)
      }
      assertEqual(value.length, assertion.bytes, `${relative} byte length`)
      assertEqual(sha256(value), assertion.sha256, `${relative} sha256`)
      const current = files.get(relative)
      if (current && current.edit !== edit.id) {
        throw new Error(
          `${relative}: referenced by both ${current.edit} and ${edit.id}`,
        )
      }
      files.set(relative, {
        edit: edit.id,
        path: filename,
        bytes: value.length,
        sha256: sha256(value),
      })
    }

    for (const evidence of edit.explains) {
      if (!knownEvidence.has(evidence)) {
        throw new Error(`${edit.id}: unknown evidence id ${evidence}`)
      }
      if (fragmentCoverage.has(evidence)) {
        fragmentCoverage.set(evidence, fragmentCoverage.get(evidence) + 1)
      }
    }
  }

  for (const [fragment, count] of fragmentCoverage) {
    if (count !== 1) {
      throw new Error(
        `${fragment}: expected exactly one recovery explanation, got ${count}`,
      )
    }
  }
  for (const relative of fileAssertions.keys()) {
    if (!files.has(relative)) {
      throw new Error(`${relative}: asserted but not linked to a recovery edit`)
    }
  }

  return {
    edits: edits.length,
    files: [...files.entries()].map(([relative, value]) => ({
      path: relative,
      bytes: value.bytes,
      sha256: value.sha256,
      edit: value.edit,
    })),
    explainedBundleFragments: fragmentCoverage.size,
  }
}

function verifyGeneratedRecoveryFiles(manifest, manifestPath) {
  const generated = manifest.generatedRecovery
  if (!generated || typeof generated !== 'object') {
    throw new Error('Case has no generatedRecovery ledger')
  }
  const assertions = generated.fileAssertions
  if (!Array.isArray(assertions) || assertions.length === 0) {
    throw new Error('Case has no generated recovery file assertions')
  }
  const caseRoot = path.dirname(path.resolve(manifestPath))
  const seen = new Set()
  const files = []
  for (const assertion of assertions) {
    if (
      typeof assertion.path !== 'string' ||
      seen.has(assertion.path) ||
      !Number.isSafeInteger(assertion.bytes) ||
      assertion.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(assertion.sha256)
    ) {
      throw new Error(
        `Invalid or duplicate generated file assertion: ${assertion.path}`,
      )
    }
    seen.add(assertion.path)
    const filename = safeCaseFile(
      caseRoot,
      assertion.path,
      'generated recovery',
    )
    const value = fs.readFileSync(filename)
    assertEqual(
      value.length,
      assertion.bytes,
      `${assertion.path} byte length`,
    )
    assertEqual(
      sha256(value),
      assertion.sha256,
      `${assertion.path} sha256`,
    )
    files.push({
      path: assertion.path,
      bytes: assertion.bytes,
      sha256: assertion.sha256,
    })
  }
  return {
    files,
    exactBundleDelta: generated.exactBundleDelta,
    packageMembers: generated.packageMembers,
    attribution: generated.attribution,
    structural: generated.structural,
    readableDiff: generated.readableDiff,
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.case || !args.repo) {
    throw new Error('Both --case and --repo are required')
  }
  const manifest = JSON.parse(fs.readFileSync(args.case, 'utf8'))
  const files = {}
  const artifacts = manifest.artifacts.map(artifact => {
    const filename = resolveArtifact(artifact, args)
    files[artifact.id] = filename
    return verifyArtifact(artifact, filename)
  })

  const sourceOracle = manifest.sourceOracle ?? {
    mapArtifact: 'baselineSourceMap',
    appliedSourceTree: manifest.recoveryValidation?.appliedSourceTree,
  }
  if (!sourceOracle.mapArtifact) {
    throw new Error('sourceOracle.mapArtifact is required')
  }
  const baseline = verifyBaseline(
    files[sourceOracle.mapArtifact],
    path.resolve(args.repo),
    manifest.baselineOracle,
    sourceOracle.appliedSourceTree ??
      manifest.recoveryValidation?.appliedSourceTree,
  )
  const target = verifyTarget(manifest, files)
  const recovery = verifyRecoveryLedger(manifest, args.case)
  const generatedRecovery = verifyGeneratedRecoveryFiles(
    manifest,
    args.case,
  )
  console.log(
    JSON.stringify(
      {
        case: manifest.case,
        status: 'evidence-verified',
        recoveryScope: manifest.recoveryScope,
        artifacts,
        baseline,
        target,
        recovery,
        generatedRecovery,
      },
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
    console.error(error.stack ?? error)
    process.exitCode = 1
  }
}
