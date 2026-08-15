#!/usr/bin/env node

import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const GIT_OBJECT_PATTERN = /^[a-f0-9]{40}$/
const CASE_PATTERN = /^(\d+\.\d+\.\d+)-to-(\d+\.\d+\.\d+)$/
const SEMANTIC_CRITERION = 'compiled-ast-function-semantics-v1'
const DEPENDENCY_CRITERION = 'whole-bundle-dependency-build-input-v1'
const DISPOSITIONS = new Set([
  'alpha-equivalent',
  'dependency-runtime',
  'generated-metadata',
  'dce-nonruntime',
  'source-runtime-covered',
  'source-runtime-gap',
])
const EVIDENCE_KINDS = new Set([
  'dependency-attribution',
  'dependency-target-fragment',
  'generated-metadata',
  'readable-normalization',
  'semantic-test',
  'source-map-attribution',
  'static-ast',
  'structural-pairing',
  'target-fragment',
])
const verifiedSupplementIntroductions = new Map()
const verifiedSemanticTestSyntax = new Set()
const verifiedArtifactFiles = new Map()

function usage() {
  console.error(
    'Usage: audit-source-reproduction.mjs [--repo DIR] [--ledger FILE] ' +
      '[--case manifest.json] [--artifacts DIR] [--require-exact-source]',
  )
}

function parseArguments(argv) {
  const result = { requireExactSource: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help') {
      result.help = true
      continue
    }
    if (argument === '--require-exact-source') {
      assert(!result.requireExactSource, `Duplicate argument: ${argument}`)
      result.requireExactSource = true
      continue
    }
    assert(
      ['--artifacts', '--case', '--ledger', '--repo'].includes(argument),
      `Unknown argument: ${argument}`,
    )
    const key = argument.slice(2)
    assert(result[key] === undefined, `Duplicate argument: ${argument}`)
    const value = argv[index + 1]
    assert(value !== undefined && !value.startsWith('--'), `Missing value for ${argument}`)
    result[key] = value
    index += 1
  }
  return result
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertPlainObject(value, label) {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`,
  )
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readJson(filename, label) {
  const value = readRealFile(filename, label)
  return JSON.parse(value.toString('utf8'))
}

function readRealFile(filename, label) {
  let status
  try {
    status = fs.lstatSync(filename)
  } catch (error) {
    throw new Error(`${label} is not accessible: ${filename}`, { cause: error })
  }
  assert(status.isFile() && !status.isSymbolicLink(), `${label} is not a real file`)
  return fs.readFileSync(filename)
}

function safeRepositoryPath(repositoryRoot, relative, label) {
  assert(typeof relative === 'string' && relative.length > 0, `${label}: missing path`)
  const parts = relative.split('/')
  assert(
    !path.isAbsolute(relative) &&
      !relative.includes('\\') &&
      !parts.includes('') &&
      !parts.includes('.') &&
      !parts.includes('..'),
    `${label}: unsafe path ${relative}`,
  )
  return path.resolve(repositoryRoot, ...parts)
}

function compareVersion(left, right) {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index]
  }
  return 0
}

function caseVersions(caseName) {
  const match = caseName.match(CASE_PATTERN)
  assert(match, `Invalid recovery case name: ${caseName}`)
  assert(compareVersion(match[1], match[2]) < 0, `${caseName}: target must follow baseline`)
  return { baseline: match[1], target: match[2] }
}

function caseManifestPaths(repositoryRoot) {
  const casesRoot = path.join(repositoryRoot, 'recovery', 'cases')
  return fs
    .readdirSync(casesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
    .map(entry => ({
      caseName: entry.name,
      filename: path.join(casesRoot, entry.name, 'manifest.json'),
      versions: caseVersions(entry.name),
    }))
    .filter(item => {
      const manifest = readJson(item.filename, `${item.caseName} manifest`)
      return manifest.semanticSourceLineage !== undefined
    })
    .sort((left, right) => compareVersion(left.versions.baseline, right.versions.baseline))
}

function uniqueById(items, id, label) {
  assert(Array.isArray(items), `${label} must be an array`)
  const matches = items.filter(item => item?.id === id)
  assert(matches.length === 1, `${label}: expected exactly one ${id}`)
  return matches[0]
}

function validateArtifact(artifact, label) {
  assertPlainObject(artifact, label)
  assert(Number.isSafeInteger(artifact.bytes) && artifact.bytes >= 0, `${label}: invalid bytes`)
  assert(
    typeof artifact.sha256 === 'string' && SHA256_PATTERN.test(artifact.sha256),
    `${label}: invalid SHA-256`,
  )
  assert(
    typeof artifact.localPath === 'string' && artifact.localPath.length > 0,
    `${label}: invalid localPath`,
  )
}

function generatedAssertion(manifest, relative, label) {
  const assertion = manifest.generatedRecovery.fileAssertions?.find(item => item.path === relative)
  assert(assertion, `${label}: no generated file assertion for ${relative}`)
  assert(Number.isSafeInteger(assertion.bytes) && assertion.bytes >= 0, `${label}: invalid bytes`)
  assert(
    typeof assertion.sha256 === 'string' && SHA256_PATTERN.test(assertion.sha256),
    `${label}: invalid SHA-256`,
  )
  return assertion
}

function validatePinnedCaseFile(caseRoot, manifest, relative, label) {
  const filename = safeRepositoryPath(caseRoot, relative, label)
  const assertion = generatedAssertion(manifest, relative, label)
  const value = readRealFile(filename, label)
  assert(value.length === assertion.bytes, `${label}: payload byte length differs`)
  assert(sha256(value) === assertion.sha256, `${label}: payload SHA-256 differs`)
  return { filename, relative, value, bytes: value.length, sha256: assertion.sha256 }
}

function validatePinnedRecoveredCaseFile(caseRoot, manifest, relative, label) {
  assert(
    Array.isArray(manifest.recoveredFileAssertions),
    `${label}: recoveredFileAssertions missing`,
  )
  const matches = manifest.recoveredFileAssertions.filter(
    item => item?.path === relative,
  )
  assert(matches.length === 1, `${label}: expected one recovered file assertion`)
  const assertion = matches[0]
  assert(Number.isSafeInteger(assertion.bytes) && assertion.bytes >= 0, `${label}: invalid bytes`)
  assert(
    typeof assertion.sha256 === 'string' && SHA256_PATTERN.test(assertion.sha256),
    `${label}: invalid SHA-256`,
  )
  const filename = safeRepositoryPath(caseRoot, relative, label)
  const value = readRealFile(filename, label)
  assert(value.length === assertion.bytes, `${label}: payload byte length differs`)
  assert(sha256(value) === assertion.sha256, `${label}: payload SHA-256 differs`)
  return { filename, relative, value, bytes: value.length, sha256: assertion.sha256 }
}

function run(repositoryRoot, command, arguments_, label, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: options.encoding ?? 'utf8',
    env: options.env,
    input: options.input,
    maxBuffer: options.maxBuffer ?? 512 * 1024 * 1024,
  })
  if (result.error) throw result.error
  assert(result.status === 0, `${label} failed (${result.status}): ${result.stderr || result.stdout}`)
  return result.stdout
}

function runGit(repositoryRoot, arguments_, label) {
  const value = run(repositoryRoot, 'git', arguments_, label).trim()
  assert(value.length > 0 && !value.includes('\n') && !value.includes('\r'), `${label}: expected one line`)
  return value
}

function gitPathExists(repositoryRoot, commit, relative) {
  const result = spawnSync(
    'git',
    ['cat-file', '-e', `${commit}:${relative}`],
    { cwd: repositoryRoot, stdio: 'ignore' },
  )
  if (result.error) throw result.error
  return result.status === 0
}

function sourceBuildInputAudit(repositoryRoot, targetCommit) {
  const lockfiles = [
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
  ].filter(relative => gitPathExists(repositoryRoot, targetCommit, relative))
  const applicationManifest = gitPathExists(
    repositoryRoot,
    targetCommit,
    'package.json',
  )
  const buildConfiguration = [
    'tsconfig.json',
    'bunfig.toml',
    'webpack.config.js',
    'rollup.config.js',
    'esbuild.config.js',
  ].filter(relative => gitPathExists(repositoryRoot, targetCommit, relative))
  const hermetic =
    applicationManifest && lockfiles.length > 0 && buildConfiguration.length > 0
  return {
    applicationManifest,
    lockfiles,
    buildConfiguration,
    dependencySourceArchivePinned: false,
    hermetic,
    gap: hermetic
      ? null
      : 'The historical target has no complete root application manifest, dependency lock, dependency source archive, and build configuration needed to compile the whole published bundle from src/.',
  }
}

function validateSupplement(repositoryRoot, descriptor, expectedCase, label) {
  assertPlainObject(descriptor, label)
  assert(descriptor.case === expectedCase, `${label}: case differs`)
  assert(typeof descriptor.path === 'string', `${label}: path is missing`)
  assert(
    descriptor.path === `recovery/cases/${expectedCase}/semantic-supplement.patch`,
    `${label}: supplement must use its canonical case path`,
  )
  assert(Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0, `${label}: bytes invalid`)
  assert(
    typeof descriptor.sha256 === 'string' && SHA256_PATTERN.test(descriptor.sha256),
    `${label}: SHA-256 invalid`,
  )
  const filename = safeRepositoryPath(repositoryRoot, descriptor.path, label)
  const value = readRealFile(filename, label)
  assert(value.length === descriptor.bytes, `${label}: byte length differs`)
  assert(sha256(value) === descriptor.sha256, `${label}: SHA-256 differs`)
  const headers = [...value.toString('utf8').matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)]
  assert(headers.length > 0, `${label}: no Git patch entries`)
  for (const header of headers) {
    assert(
      header[1] === header[2] && header[1].startsWith('src/'),
      `${label}: semantic supplement may modify only matching src/ paths`,
    )
  }
  return {
    ...descriptor,
    filename,
    sourcePaths: headers.map(header => header[2]),
  }
}

function exactPatchSection(value, relative, label) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : value
  const marker = `diff --git a/${relative} b/${relative}\n`
  const first = text.indexOf(marker)
  if (first === -1) return null
  assert(
    text.indexOf(marker, first + marker.length) === -1,
    `${label}: duplicate patch entry for ${relative}`,
  )
  const next = text.indexOf('\ndiff --git ', first + marker.length)
  return text.slice(first, next === -1 ? undefined : next)
}

function patchEntryCreatesFile(section, relative) {
  return (
    section.includes('\nnew file mode ') &&
    section.includes('\n--- /dev/null\n') &&
    section.includes(`\n+++ b/${relative}\n`)
  )
}

function patchEntryDeletesFile(section, relative) {
  return (
    section.includes('\ndeleted file mode ') &&
    section.includes(`\n--- a/${relative}\n`) &&
    section.includes('\n+++ /dev/null\n')
  )
}

/**
 * Prove that a historical semantic owner may be absent from the cumulative
 * current source tree.  The normal owner contract remains current-presence;
 * this exception is accepted only for a named, strictly later recovery case
 * whose pinned semantic target omits the path.  Prefer an exact deletion in
 * that case's pinned source-lineage overlay.  Owners created by a semantic
 * supplement can instead use the narrower introduction/target-absence proof:
 * the original pinned patch must create the complete file, and the later
 * semantic target plus current tree must both omit it.
 */
export function validateRetiredOwner({
  caseName,
  introductionSupplement,
  owner,
  repositoryRoot,
}) {
  const label = `${caseName} retired owner ${owner.id}`
  assert(
    typeof owner.retiredInCase === 'string',
    `${label}: retiredInCase must be a case name`,
  )
  const sourceVersions = caseVersions(caseName)
  const retirementVersions = caseVersions(owner.retiredInCase)
  assert(
    compareVersion(retirementVersions.baseline, sourceVersions.target) >= 0 &&
      compareVersion(retirementVersions.target, sourceVersions.target) > 0,
    `${label}: retirement case must follow the owner case`,
  )

  const retirementRoot = safeRepositoryPath(
    repositoryRoot,
    `recovery/cases/${owner.retiredInCase}`,
    `${label} retirement case`,
  )
  const retirementManifest = readJson(
    path.join(retirementRoot, 'manifest.json'),
    `${label} retirement manifest`,
  )
  assert(
    retirementManifest.case === owner.retiredInCase,
    `${label}: retirement manifest case differs`,
  )
  assertPlainObject(
    retirementManifest.semanticSourceLineage,
    `${label} retirement semanticSourceLineage`,
  )
  const retirementCommit = retirementManifest.semanticSourceLineage.targetCommit
  assert(
    typeof retirementCommit === 'string' && GIT_OBJECT_PATTERN.test(retirementCommit),
    `${label}: retirement targetCommit invalid`,
  )
  const resolvedCommit = runGit(
    repositoryRoot,
    ['rev-parse', '--verify', `${retirementCommit}^{commit}`],
    `${label} retirement target commit`,
  )
  assert(
    resolvedCommit === retirementCommit,
    `${label}: retirement targetCommit identity differs`,
  )
  assert(
    !gitPathExists(repositoryRoot, retirementCommit, owner.path),
    `${label}: owner still exists in retirement target`,
  )

  const current = safeRepositoryPath(
    repositoryRoot,
    owner.path,
    `${label} current owner`,
  )
  assert(
    !fs.existsSync(current),
    `${label}: retired owner still exists in current src`,
  )

  const lineage = retirementManifest.sourceLineage
  if (lineage !== undefined) {
    assertPlainObject(lineage, `${label} retirement sourceLineage`)
    assert(
      Array.isArray(lineage.patchOrder) && lineage.patchOrder.length > 0,
      `${label}: retirement sourceLineage.patchOrder is missing`,
    )
    for (const [index, relative] of lineage.patchOrder.entries()) {
      assert(
        typeof relative === 'string',
        `${label}: retirement patch ${index + 1} must be a path`,
      )
      const pinned = validatePinnedRecoveredCaseFile(
        retirementRoot,
        retirementManifest,
        relative,
        `${label} retirement patch ${index + 1}`,
      )
      const section = exactPatchSection(
        pinned.value,
        owner.path,
        `${label} retirement patch ${index + 1}`,
      )
      if (section !== null) {
        assert(
          patchEntryDeletesFile(section, owner.path),
          `${label}: retirement patch touches owner without deleting it`,
        )
        assert(
          typeof lineage.baseCommit === 'string' &&
            GIT_OBJECT_PATTERN.test(lineage.baseCommit) &&
            gitPathExists(repositoryRoot, lineage.baseCommit, owner.path),
          `${label}: deletion patch base does not contain owner`,
        )
        return {
          case: owner.retiredInCase,
          mode: 'pinned-source-overlay-deletion',
          path: relative,
          targetCommit: retirementCommit,
        }
      }
    }
  }

  assert(
    introductionSupplement?.case === (owner.transitiveFromCase ?? caseName),
    `${label}: no pinned deletion or semantic introduction proof`,
  )
  const introduction = readRealFile(
    introductionSupplement.filename,
    `${label} introduction supplement`,
  )
  const introductionSection = exactPatchSection(
    introduction,
    owner.path,
    `${label} introduction supplement`,
  )
  assert(
    introductionSection !== null &&
      patchEntryCreatesFile(introductionSection, owner.path),
    `${label}: no pinned deletion and introduction patch does not create owner`,
  )
  return {
    case: owner.retiredInCase,
    mode: 'pinned-supplement-introduction-and-later-target-absence',
    path: introductionSupplement.path,
    targetCommit: retirementCommit,
  }
}

function supplementIdentity(descriptor) {
  if (descriptor === null) return null
  return {
    case: descriptor.case,
    path: descriptor.path,
    bytes: descriptor.bytes,
    sha256: descriptor.sha256,
  }
}

function discoverSemanticSupplements(repositoryRoot, selectedCase) {
  const result = []
  for (const item of caseManifestPaths(repositoryRoot)) {
    if (compareVersion(item.versions.target, caseVersions(selectedCase).target) > 0) break
    const manifest = readJson(item.filename, `${item.caseName} manifest`)
    const supplement = manifest.semanticSourceLineage?.supplement
    if (supplement !== undefined && supplement !== null) {
      result.push(
        supplementIdentity(
          validateSupplement(
            repositoryRoot,
            supplement,
            item.caseName,
            `${item.caseName}.semanticSourceLineage.supplement`,
          ),
        ),
      )
    }
  }
  return result
}

function semanticTargetCommitForCase(repositoryRoot, caseName) {
  const manifestPath = path.join(
    repositoryRoot,
    'recovery',
    'cases',
    caseName,
    'manifest.json',
  )
  const manifest = readJson(manifestPath, `${caseName} manifest`)
  const semantic = manifest.semanticSourceLineage
  assertPlainObject(semantic, `${caseName}.semanticSourceLineage`)
  assert(
    typeof semantic.targetCommit === 'string' &&
      GIT_OBJECT_PATTERN.test(semantic.targetCommit),
    `${caseName}: semantic targetCommit invalid`,
  )
  const resolved = runGit(
    repositoryRoot,
    ['rev-parse', '--verify', `${semantic.targetCommit}^{commit}`],
    `${caseName} semantic target commit`,
  )
  assert(
    resolved === semantic.targetCommit,
    `${caseName}: semantic targetCommit identity differs`,
  )
  return semantic.targetCommit
}

function materializeSemanticSourceTree(
  repositoryRoot,
  targetCommit,
  supplement,
  label,
) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-source-lineage-'))
  try {
    // A semantic supplement is an authored delta against the historical target
    // where that behavior first appears.  Prove it at that introduction point;
    // later cases carry the result forward through exact structural matches and
    // exhaustively classify every changed/moved/unresolved target unit.  Replaying
    // an old textual patch onto an unrelated later snapshot would test merge
    // context, not compiled-AST equivalence.
    run(
      repositoryRoot,
      'git',
      ['clone', '--quiet', '--shared', '--no-checkout', repositoryRoot, temporary],
      'clone semantic target repository',
    )
    run(
      temporary,
      'git',
      ['checkout', '--quiet', '--detach', targetCommit],
      `checkout ${label} semantic target commit`,
    )
    if (supplement !== null) {
      run(
        temporary,
        'git',
        ['apply', '--3way', supplement.filename],
        `apply ${label} semantic supplement`,
      )
    }
    return temporary
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}

function verifySupplementAtIntroduction(repositoryRoot, supplement) {
  const identity = supplementIdentity(supplement)
  const cacheKey = `${path.resolve(repositoryRoot)}\0${JSON.stringify(identity)}`
  const cached = verifiedSupplementIntroductions.get(cacheKey)
  if (cached) return cached

  const targetCommit = semanticTargetCommitForCase(
    repositoryRoot,
    supplement.case,
  )
  const temporary = materializeSemanticSourceTree(
    repositoryRoot,
    targetCommit,
    supplement,
    supplement.case,
  )
  try {
    const syntaxInputs = supplement.sourcePaths
      .filter(relative => /\.(?:[cm]?[jt]sx?)$/.test(relative))
      .filter(relative => fs.existsSync(path.join(temporary, relative)))
    if (syntaxInputs.length > 0) {
      const output = fs.mkdtempSync(
        path.join(os.tmpdir(), 'semantic-supplement-syntax-'),
      )
      try {
        run(
          temporary,
          'bun',
          [
            'build',
            ...syntaxInputs,
            '--target=bun',
            '--external=*',
            '--entry-naming=[dir]/[name]-[hash].[ext]',
            `--outdir=${output}`,
          ],
          `${supplement.case} semantic supplement syntax`,
        )
      } finally {
        fs.rmSync(output, { recursive: true, force: true })
      }
    }
    const proof = {
      case: supplement.case,
      targetCommit,
      ...identity,
      syntaxCheckedSourceFiles: syntaxInputs.length,
    }
    verifiedSupplementIntroductions.set(cacheKey, proof)
    return proof
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

function jsonLinesGzip(value, label) {
  let decoded
  try {
    decoded = gunzipSync(value).toString('utf8')
  } catch (error) {
    throw new Error(`${label}: invalid gzip`, { cause: error })
  }
  return decoded
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`${label}: invalid JSON on line ${index + 1}`, { cause: error })
      }
    })
}

function jsonGzip(value, label) {
  try {
    return JSON.parse(gunzipSync(value).toString('utf8'))
  } catch (error) {
    throw new Error(`${label}: invalid gzip JSON`, { cause: error })
  }
}

function changedTargetIndexes(diff) {
  const indexes = new Set()
  let targetLine = 0
  let inHunk = false
  for (const line of diff.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (header) {
      targetLine = Number(header[1]) - 1
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('+') && !line.startsWith('+++')) {
      indexes.add(targetLine)
      targetLine += 1
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Baseline-only descriptor.
    } else if (line.startsWith(' ')) {
      targetLine += 1
    }
  }
  return indexes
}

function firstPartitionEndingAfter(partitions, offset) {
  let low = 0
  let high = partitions.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (partitions[middle].target.offsetEnd <= offset) low = middle + 1
    else high = middle
  }
  return low
}

function initializerAt(initializers, offset) {
  let low = 0
  let high = initializers.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (initializers[middle].regionStart <= offset) low = middle + 1
    else high = middle
  }
  const candidate = initializers[low - 1]
  return candidate && offset < candidate.regionEnd ? candidate : null
}

function normalizedSourcePath(source) {
  if (typeof source !== 'string') return null
  const marker = source.lastIndexOf('/src/')
  if (marker >= 0) return source.slice(marker + 1)
  if (source.startsWith('src/')) return source
  return null
}

function isDependencyRuntimeSource(source) {
  return (
    typeof source === 'string' &&
    (source.includes('/node_modules/') || source.includes('/vendor/'))
  )
}

function attributedSources(target, attribution) {
  const weights = new Map()
  const candidates = new Map()
  for (
    let index = firstPartitionEndingAfter(attribution.partitions, target.start);
    index < attribution.partitions.length &&
    attribution.partitions[index].target.offsetStart < target.end;
    index += 1
  ) {
    const partition = attribution.partitions[index]
    const overlap =
      Math.min(target.end, partition.target.offsetEnd) -
      Math.max(target.start, partition.target.offsetStart)
    if (overlap <= 0) continue
    if (partition.attributedSourceIndex !== null) {
      weights.set(
        partition.attributedSourceIndex,
        (weights.get(partition.attributedSourceIndex) ?? 0) + overlap,
      )
    }
    for (const sourceIndex of partition.sourceCandidates ?? []) {
      candidates.set(
        sourceIndex,
        (candidates.get(sourceIndex) ?? 0) + overlap,
      )
    }
    for (const sourceIndex of partition.relocatedSourceCandidates ?? []) {
      candidates.set(
        sourceIndex,
        (candidates.get(sourceIndex) ?? 0) + overlap / 2,
      )
    }
  }
  if (weights.size === 0) {
    const initializer = initializerAt(attribution.initializers, target.start)
    for (const vote of initializer?.sourceVotes ?? []) weights.set(vote.value, vote.count)
  }
  if (weights.size === 0) {
    for (const [sourceIndex, score] of candidates) {
      weights.set(sourceIndex, score)
    }
  }
  return [...weights]
    .sort((left, right) => right[1] - left[1])
    .map(([sourceIndex, score]) => ({
      sourceIndex,
      source: attribution.sources.get(sourceIndex),
      score,
    }))
    .filter(item => typeof item.source === 'string')
}

function evidenceKinds(row, evidenceById) {
  return new Set(row.evidenceIds.map(id => evidenceById.get(id).kind))
}

export function semanticEvidenceTestFilesForCoverage(coverage) {
  assert(Array.isArray(coverage.rows), 'semantic coverage rows must be an array')
  assert(
    Array.isArray(coverage.evidence),
    'semantic coverage evidence must be an array',
  )
  const referencedIds = new Set(
    coverage.rows.flatMap(row =>
      Array.isArray(row.evidenceIds) ? row.evidenceIds : [],
    ),
  )
  return [
    ...new Set(
      coverage.evidence
        .filter(
          evidence =>
            referencedIds.has(evidence.id) && evidence.kind === 'semantic-test',
        )
        .map(evidence => evidence.path),
    ),
  ].sort()
}

function exactCountObject(entries, keys) {
  const counts = Object.fromEntries(keys.map(key => [key, 0]))
  for (const entry of entries) counts[entry] = (counts[entry] ?? 0) + 1
  return counts
}

function validateCoverageLedger({
  caseName,
  caseRoot,
  coverage,
  manifest,
  repositoryRoot,
  semanticTree,
  supplements,
  structural,
  attribution,
}) {
  const versions = caseVersions(caseName)
  assertPlainObject(coverage, `${caseName} semantic coverage`)
  assert(coverage.schemaVersion === 1, `${caseName}: unsupported semantic coverage schema`)
  assert(coverage.case === caseName, `${caseName}: semantic coverage case differs`)
  assert(coverage.targetVersion === versions.target, `${caseName}: targetVersion differs`)
  assert(
    coverage.targetCommit === manifest.semanticSourceLineage.targetCommit,
    `${caseName}: coverage targetCommit differs`,
  )
  assert(coverage.criterion === SEMANTIC_CRITERION, `${caseName}: semantic criterion differs`)

  assert(Array.isArray(coverage.owners), `${caseName}: owners must be an array`)
  const ownersById = new Map()
  const retiredOwnerProofs = new Map()
  for (const owner of coverage.owners) {
    assertPlainObject(owner, `${caseName} owner`)
    assert(typeof owner.id === 'string' && owner.id.length > 0, `${caseName}: owner id missing`)
    assert(!ownersById.has(owner.id), `${caseName}: duplicate owner ${owner.id}`)
    assert(
      typeof owner.path === 'string' && owner.path.startsWith('src/'),
      `${caseName}: owner ${owner.id} must name a src path`,
    )
    const historical = safeRepositoryPath(semanticTree, owner.path, `${caseName} owner ${owner.id}`)
    const current = safeRepositoryPath(repositoryRoot, owner.path, `${caseName} current owner ${owner.id}`)
    if (owner.transitiveFromCase !== undefined) {
      assert(
        typeof owner.transitiveFromCase === 'string' &&
          compareVersion(
            caseVersions(owner.transitiveFromCase).target,
            versions.target,
          ) < 0,
        `${caseName}: owner ${owner.id} has an invalid transitive source case`,
      )
      const introduction = supplements.find(
        supplement => supplement.case === owner.transitiveFromCase,
      )
      assert(
        introduction?.sourcePaths.includes(owner.path),
        `${caseName}: transitive owner ${owner.path} is not supplied by ${owner.transitiveFromCase}`,
      )
    } else {
      assert(fs.existsSync(historical), `${caseName}: historical owner is missing: ${owner.path}`)
      assert(fs.lstatSync(historical).isFile(), `${caseName}: historical owner is not a file: ${owner.path}`)
    }
    if (owner.retiredInCase !== undefined) {
      const introductionCase = owner.transitiveFromCase ?? caseName
      retiredOwnerProofs.set(
        owner.id,
        validateRetiredOwner({
          caseName,
          introductionSupplement: supplements.find(
            supplement => supplement.case === introductionCase,
          ),
          owner,
          repositoryRoot,
        }),
      )
    } else {
      assert(fs.existsSync(current), `${caseName}: current src owner is missing: ${owner.path}`)
      assert(fs.lstatSync(current).isFile(), `${caseName}: current src owner is not a file: ${owner.path}`)
    }
    if (owner.anchor !== undefined) {
      assert(typeof owner.anchor === 'string' && owner.anchor.length >= 4, `${caseName}: owner anchor invalid`)
      assert(
        fs.readFileSync(historical, 'utf8').includes(owner.anchor),
        `${caseName}: historical owner anchor missing for ${owner.id}`,
      )
    }
    ownersById.set(owner.id, owner)
  }

  assert(Array.isArray(coverage.evidence), `${caseName}: evidence must be an array`)
  const evidenceById = new Map()
  for (const evidence of coverage.evidence) {
    assertPlainObject(evidence, `${caseName} evidence`)
    assert(typeof evidence.id === 'string' && evidence.id.length > 0, `${caseName}: evidence id missing`)
    assert(!evidenceById.has(evidence.id), `${caseName}: duplicate evidence ${evidence.id}`)
    assert(EVIDENCE_KINDS.has(evidence.kind), `${caseName}: invalid evidence kind ${evidence.kind}`)
    assert(typeof evidence.detail === 'string' && evidence.detail.length > 0, `${caseName}: evidence detail missing`)
    if (evidence.path !== undefined) {
      const filename = safeRepositoryPath(repositoryRoot, evidence.path, `${caseName} evidence ${evidence.id}`)
      assert(fs.existsSync(filename), `${caseName}: evidence path missing: ${evidence.path}`)
      assert(fs.lstatSync(filename).isFile(), `${caseName}: evidence path is not a file`)
    }
    if (evidence.kind === 'semantic-test') {
      assert(
        typeof evidence.path === 'string' &&
          /^recovery\/test\/[^/]+\.test\.mjs$/.test(evidence.path),
        `${caseName}: semantic test evidence must name a recovery test`,
      )
      const filename = safeRepositoryPath(
        repositoryRoot,
        evidence.path,
        `${caseName} semantic test ${evidence.id}`,
      )
      if (!verifiedSemanticTestSyntax.has(filename)) {
        run(
          repositoryRoot,
          process.execPath,
          ['--check', filename],
          `${caseName} semantic test syntax`,
        )
        verifiedSemanticTestSyntax.add(filename)
      }
    }
    evidenceById.set(evidence.id, evidence)
  }

  assert(Array.isArray(coverage.rows), `${caseName}: rows must be an array`)
  const expectedRows = structural.regions
    .filter(region => region.classification !== 'matched')
    .sort((left, right) => left.target.index - right.target.index)
  const rows = [...coverage.rows].sort((left, right) => left.targetIndex - right.targetIndex)
  assert(rows.length === expectedRows.length, `${caseName}: semantic row count differs from structural nonmatched set`)

  const readable = fs.readFileSync(
    path.join(
      caseRoot,
      manifest.generatedRecovery.readableDiff.statementDiff ??
        `${manifest.generatedRecovery.readableDiff.directory}/statements.diff`,
    ),
    'utf8',
  )
  const readableChangedIndexes = changedTargetIndexes(readable)
  let gapCount = 0
  let dependencyGapCount = 0
  for (let index = 0; index < expectedRows.length; index += 1) {
    const expected = expectedRows[index]
    const row = rows[index]
    assertPlainObject(row, `${caseName} row ${index}`)
    const target = expected.target
    for (const [field, value] of [
      ['targetIndex', target.index],
      ['start', target.start],
      ['end', target.end],
      ['nodeType', target.nodeType],
      ['sourceHash', target.sourceHash],
      ['structuralClass', expected.classification],
    ]) {
      assert(row[field] === value, `${caseName}: row ${target.index} ${field} differs`)
    }
    assert(DISPOSITIONS.has(row.disposition), `${caseName}: row ${target.index} disposition invalid`)
    assert(Array.isArray(row.ownerIds), `${caseName}: row ${target.index} ownerIds missing`)
    assert(Array.isArray(row.evidenceIds) && row.evidenceIds.length > 0, `${caseName}: row ${target.index} evidenceIds missing`)
    assert(new Set(row.ownerIds).size === row.ownerIds.length, `${caseName}: row ${target.index} duplicate owners`)
    assert(new Set(row.evidenceIds).size === row.evidenceIds.length, `${caseName}: row ${target.index} duplicate evidence`)
    for (const id of row.ownerIds) assert(ownersById.has(id), `${caseName}: row ${target.index} unknown owner ${id}`)
    for (const id of row.evidenceIds) assert(evidenceById.has(id), `${caseName}: row ${target.index} unknown evidence ${id}`)
    const kinds = evidenceKinds(row, evidenceById)
    const attributed = attributedSources(target, attribution)

    if (row.disposition === 'alpha-equivalent') {
      assert(row.ownerIds.length === 0, `${caseName}: alpha-equivalent row ${target.index} has owners`)
      if (expected.classification === 'moved') {
        assert(
          expected.pairReason === 'exact-scope-normalized-token-hash' &&
            kinds.has('structural-pairing'),
          `${caseName}: moved row ${target.index} lacks exact structural evidence`,
        )
      } else if (!readableChangedIndexes.has(target.index)) {
        assert(kinds.has('readable-normalization'), `${caseName}: row ${target.index} lacks readable normalization evidence`)
      } else {
        assert(
          kinds.has('static-ast') && typeof row.reason === 'string' && row.reason.length > 0,
          `${caseName}: semantic-looking alpha row ${target.index} lacks static AST no-op evidence`,
        )
      }
    } else if (row.disposition === 'source-runtime-covered') {
      assert(row.ownerIds.length > 0, `${caseName}: source-covered row ${target.index} has no owner`)
      assert(
        typeof row.behavior === 'string' && row.behavior.length > 0,
        `${caseName}: source-covered row ${target.index} has no behavior`,
      )
      assert(kinds.has('semantic-test'), `${caseName}: source-covered row ${target.index} lacks semantic test`)
      assert(
        kinds.has('source-map-attribution') || kinds.has('target-fragment') || kinds.has('static-ast'),
        `${caseName}: source-covered row ${target.index} lacks target/source semantic evidence`,
      )
      if (kinds.has('source-map-attribution')) {
        const paths = new Set(attributed.map(item => normalizedSourcePath(item.source)).filter(Boolean))
        assert(
          row.ownerIds.some(id => paths.has(ownersById.get(id).path)),
          `${caseName}: row ${target.index} source-map evidence does not reach an owner`,
        )
      }
    } else {
      assert(row.ownerIds.length === 0, `${caseName}: excluded/gap row ${target.index} has source owners`)
      assert(typeof row.category === 'string' && row.category.length > 0, `${caseName}: row ${target.index} category missing`)
      assert(typeof row.reason === 'string' && row.reason.length > 0, `${caseName}: row ${target.index} reason missing`)
      if (row.disposition === 'dependency-runtime') {
        dependencyGapCount += 1
        assert(
          kinds.has('dependency-attribution') || kinds.has('source-map-attribution'),
          `${caseName}: dependency row ${target.index} lacks attribution`,
        )
        assert(
          isDependencyRuntimeSource(attributed[0]?.source) ||
            kinds.has('dependency-target-fragment'),
          `${caseName}: dependency row ${target.index} is neither source-map dependency-owned nor authenticated by a dependency target fragment`,
        )
      } else if (row.disposition === 'generated-metadata') {
        assert(
          kinds.has('generated-metadata') || kinds.has('static-ast'),
          `${caseName}: metadata row ${target.index} lacks generated evidence`,
        )
      } else if (row.disposition === 'dce-nonruntime') {
        assert(
          kinds.has('static-ast') || kinds.has('target-fragment'),
          `${caseName}: DCE row ${target.index} lacks static evidence`,
        )
      } else if (row.disposition === 'source-runtime-gap') {
        gapCount += 1
      }
    }
  }

  const structuralClasses = ['changed', 'moved', 'unresolved']
  const dispositionKeys = [...DISPOSITIONS]
  const expectedSummary = {
    nonmatchedUnits: rows.length,
    byStructuralClass: exactCountObject(rows.map(row => row.structuralClass), structuralClasses),
    byDisposition: exactCountObject(rows.map(row => row.disposition), dispositionKeys),
    sourceRuntimeGaps: gapCount,
    dependencyRuntimeGaps: dependencyGapCount,
  }
  assert(
    JSON.stringify(coverage.summary) === JSON.stringify(expectedSummary),
    `${caseName}: semantic summary differs from rows`,
  )
  assert(gapCount === 0, `${caseName}: ${gapCount} source-runtime gap(s) remain`)
  for (const [ownerId, proof] of retiredOwnerProofs) {
    const owner = ownersById.get(ownerId)
    const ownerRows = rows.filter(row => row.ownerIds.includes(ownerId))
    assert(
      ownerRows.length > 0,
      `${caseName}: retired owner ${ownerId} is not used by a semantic row`,
    )
    const semanticTests = new Set(
      ownerRows.flatMap(row =>
        row.evidenceIds
          .map(id => evidenceById.get(id))
          .filter(evidence => evidence.kind === 'semantic-test')
          .map(evidence => evidence.path),
      ),
    )
    assert(
      semanticTests.size > 0 &&
        [...semanticTests].some(relative => {
          const testSource = fs.readFileSync(
            safeRepositoryPath(
              repositoryRoot,
              relative,
              `${caseName} retired owner ${ownerId} semantic test`,
            ),
            'utf8',
          )
          return (
            testSource.includes(owner.path) ||
            testSource.includes(owner.path.replace(/^src\//, ''))
          )
        }),
      `${caseName}: retired owner ${ownerId} lacks path-specific semantic-test evidence`,
    )
    assert(
      proof.case === owner.retiredInCase,
      `${caseName}: retired owner ${ownerId} proof case differs`,
    )
  }
  return expectedSummary
}

function validateDependencyCoverage({
  caseName,
  dependency,
  semanticCoverage,
  targetCommit,
  targetVersion,
}) {
  assertPlainObject(dependency, `${caseName} dependency coverage`)
  assert(
    dependency.schemaVersion === 1,
    `${caseName}: unsupported dependency coverage schema`,
  )
  assert(dependency.case === caseName, `${caseName}: dependency coverage case differs`)
  assert(
    dependency.criterion === DEPENDENCY_CRITERION,
    `${caseName}: dependency coverage criterion differs`,
  )
  assert(
    dependency.targetCommit === targetCommit,
    `${caseName}: dependency coverage targetCommit differs`,
  )
  assert(
    dependency.targetVersion === targetVersion,
    `${caseName}: dependency coverage targetVersion differs`,
  )
  assert(Array.isArray(dependency.groups), `${caseName}: dependency groups missing`)
  const auditedRows = dependency.groups.flatMap((group, groupIndex) => {
    assertPlainObject(group, `${caseName} dependency group ${groupIndex}`)
    assert(
      typeof group.package === 'string' && group.package.length > 0,
      `${caseName}: dependency group ${groupIndex} package missing`,
    )
    assert(Array.isArray(group.rows), `${caseName}: dependency group rows missing`)
    assertPlainObject(group.summary, `${caseName} dependency group summary`)
    assert(
      group.summary.dependencyRows === group.rows.length,
      `${caseName}: dependency group row count differs`,
    )
    assert(
      group.summary.identifierOrMetadataEquivalent +
          group.summary.materialOrUnresolvedDelta +
          (group.summary.vendoredBuildInputUnpinned ?? 0) ===
        group.rows.length,
      `${caseName}: dependency group classifications do not partition its rows`,
    )
    assert(
      group.summary.sourceBuildInputPinned === false,
      `${caseName}: unsupported pinned dependency source claim`,
    )
    return group.rows
  })
  const expectedRows = semanticCoverage.rows
    .filter(row => row.disposition === 'dependency-runtime')
    .map(row => ({
      targetIndex: row.targetIndex,
      sourceHash: row.sourceHash,
      structuralClass: row.structuralClass,
    }))
    .sort((left, right) => left.targetIndex - right.targetIndex)
  const actualRows = auditedRows
    .map(row => ({
      targetIndex: row.targetIndex,
      sourceHash: row.sourceHash,
      structuralClass: row.structuralClass,
    }))
    .sort((left, right) => left.targetIndex - right.targetIndex)
  assert(
    JSON.stringify(actualRows) === JSON.stringify(expectedRows),
    `${caseName}: dependency audit row set differs from semantic coverage`,
  )
  assertPlainObject(dependency.summary, `${caseName} dependency summary`)
  assert(
    dependency.summary.dependencyRows === expectedRows.length &&
      dependency.summary.dependencyRuntimeGaps === expectedRows.length,
    `${caseName}: dependency summary gap count differs`,
  )
  assert(
    dependency.summary.identifierOrMetadataEquivalent +
        dependency.summary.materialOrUnresolvedDelta ===
      expectedRows.length,
    `${caseName}: dependency classifications do not partition the row set`,
  )
  assert(
    dependency.summary.pinnedSourceBuildInputs === 0 &&
      dependency.summary.exactTargetBundleArtifactRecoverable === true &&
      dependency.summary.wholeBundleSemanticEquivalentFromSrc === false,
    `${caseName}: unsupported whole-bundle dependency claim`,
  )
  assertPlainObject(
    dependency.buildInputAudit,
    `${caseName} dependency build-input audit`,
  )
  assert(
    dependency.buildInputAudit.applicationManifestOrLockfileInTargetCommit ===
      false &&
      dependency.buildInputAudit.dependencySourceArchivePinned === false &&
      dependency.buildInputAudit.dependencyBuildRecipePinned === false,
    `${caseName}: dependency build-input gap is not recorded`,
  )
  return {
    groups: dependency.groups.length,
    dependencyRows: expectedRows.length,
    materialOrUnresolvedDelta:
      dependency.summary.materialOrUnresolvedDelta,
    pinnedSourceBuildInputs: 0,
  }
}

function verifiedArtifactFile(artifactsRoot, artifact, label) {
  const filename = safeRepositoryPath(artifactsRoot, artifact.localPath, label)
  const cacheKey = `${path.resolve(artifactsRoot)}\0${artifact.localPath}\0${artifact.bytes}\0${artifact.sha256}`
  const cached = verifiedArtifactFiles.get(cacheKey)
  if (cached) return cached
  const rootStatus = fs.lstatSync(path.resolve(artifactsRoot))
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(), 'artifacts root is not a real directory')
  const value = readRealFile(filename, label)
  assert(value.length === artifact.bytes, `${label}: artifact byte length differs`)
  assert(sha256(value) === artifact.sha256, `${label}: artifact SHA-256 differs`)
  verifiedArtifactFiles.set(cacheKey, filename)
  return filename
}

function bundleEnvironmentVariable(version) {
  return `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
}

function publishedBundleEnvironmentVariable(version) {
  return `CLAUDE_CODE_${version.replaceAll('.', '_')}_PUBLISHED_BUNDLE`
}

function semanticTestEnvironment(repositoryRoot, selected, artifactsRoot) {
  const environment = { ...process.env }
  const resolved = {}
  for (const item of selected) {
    const manifest = readJson(item.filename, `${item.caseName} manifest`)
    const versions = caseVersions(item.caseName)
    const delta = manifest.generatedRecovery.exactBundleDelta
    const structural = manifest.generatedRecovery.structural ?? {}
    const bundles = [
      [
        versions.baseline,
        structural.baselineArtifact ?? delta.baselineArtifact ?? 'baselineBundle',
        delta.baselineArtifact ?? 'baselineBundle',
      ],
      [
        versions.target,
        structural.targetArtifact ?? delta.targetArtifact ?? 'targetBundle',
        delta.targetArtifact ?? 'targetBundle',
      ],
    ]
    for (const [version, artifactId, publishedArtifactId] of bundles) {
      const artifact = uniqueById(
        manifest.artifacts,
        artifactId,
        `${item.caseName}.artifacts`,
      )
      validateArtifact(artifact, `${item.caseName}.${artifactId}`)
      const filename = verifiedArtifactFile(
        artifactsRoot,
        artifact,
        `${item.caseName}.${artifactId}`,
      )
      const name = bundleEnvironmentVariable(version)
      const prior = resolved[name]
      if (prior) {
        assert(
          prior.bytes === artifact.bytes && prior.sha256 === artifact.sha256,
          `${name}: recovery cases disagree about the authenticated bundle`,
        )
      } else {
        environment[name] = filename
        resolved[name] = {
          version,
          role: 'structural-analyzable-bundle',
          bytes: artifact.bytes,
          sha256: artifact.sha256,
        }
      }

      const publishedArtifact = uniqueById(
        manifest.artifacts,
        publishedArtifactId,
        `${item.caseName}.artifacts`,
      )
      validateArtifact(
        publishedArtifact,
        `${item.caseName}.${publishedArtifactId}`,
      )
      const publishedFilename = verifiedArtifactFile(
        artifactsRoot,
        publishedArtifact,
        `${item.caseName}.${publishedArtifactId}`,
      )
      const publishedName = publishedBundleEnvironmentVariable(version)
      const priorPublished = resolved[publishedName]
      if (priorPublished) {
        assert(
          priorPublished.bytes === publishedArtifact.bytes &&
            priorPublished.sha256 === publishedArtifact.sha256,
          `${publishedName}: recovery cases disagree about the authenticated published bundle`,
        )
      } else {
        environment[publishedName] = publishedFilename
        resolved[publishedName] = {
          version,
          role: 'published-bundle',
          bytes: publishedArtifact.bytes,
          sha256: publishedArtifact.sha256,
        }
      }
    }
  }
  return { environment, resolved }
}

export function validateSemanticLiteralResidueReport({
  caseName,
  coverage,
  report,
}) {
  assertPlainObject(report, `${caseName} typed semantic literal audit`)
  assert(
    report.unclassifiedAddedOccurrences === 0,
    `${caseName}: ${report.unclassifiedAddedOccurrences} target literal occurrence(s) are outside the structural ledger`,
  )
  assert(
    Array.isArray(report.sourceRuntimeOwnerResidueRows),
    `${caseName}: typed semantic literal residue rows are missing`,
  )
  assert(
    Number.isSafeInteger(report.sourceRuntimeTargetOccurrences) &&
      report.sourceRuntimeTargetOccurrences >=
        report.sourceRuntimeOwnerResidueRows.length,
    `${caseName}: typed semantic source-runtime occurrence count is invalid`,
  )
  assert(
    report.sourceRuntimeOwnerResidues ===
      report.sourceRuntimeOwnerResidueRows.length,
    `${caseName}: typed semantic owner-residue count differs from its rows`,
  )
  const targetAddedResidueRows = report.sourceRuntimeOwnerResidueRows.filter(
    residue => residue?.targetAdded === true,
  )
  assert(
    report.sourceRuntimeAddedOwnerResidues === targetAddedResidueRows.length,
    `${caseName}: typed semantic target-added owner-residue count differs from its rows`,
  )
  assert(
    Array.isArray(report.sourceRuntimeAddedOwnerResidueRows),
    `${caseName}: typed semantic target-added owner-residue rows are missing`,
  )
  const residueIdentity = residue =>
    JSON.stringify([
      residue?.structural?.index,
      residue?.literalKind,
      residue?.value,
      residue?.target?.start,
      residue?.target?.end,
      residue?.targetOccurrenceNumber,
    ])
  assert(
    JSON.stringify(
      report.sourceRuntimeAddedOwnerResidueRows.map(residueIdentity),
    ) === JSON.stringify(targetAddedResidueRows.map(residueIdentity)),
    `${caseName}: typed semantic target-added owner-residue rows differ`,
  )
  const rowsByIndex = new Map(
    coverage.rows.map(row => [row.targetIndex, row]),
  )
  const evidenceById = new Map(
    coverage.evidence.map(evidence => [evidence.id, evidence]),
  )
  const residueUnits = new Set()
  const inheritedResidueUnits = new Set()
  let inheritedResidues = 0
  let explicitlyProvedResidues = 0
  for (const residue of report.sourceRuntimeOwnerResidueRows) {
    assertPlainObject(residue, `${caseName} typed semantic residue`)
    assertPlainObject(residue.structural, `${caseName} typed semantic residue structural unit`)
    assert(
      Number.isSafeInteger(residue.baselineOccurrenceCount) &&
        residue.baselineOccurrenceCount >= 0,
      `${caseName}: typed residue has an invalid baseline occurrence count`,
    )
    assert(
      Number.isSafeInteger(residue.targetOccurrenceNumber) &&
        residue.targetOccurrenceNumber > 0,
      `${caseName}: typed residue has an invalid target occurrence number`,
    )
    assert(
      typeof residue.targetAdded === 'boolean',
      `${caseName}: typed residue targetAdded must be Boolean`,
    )
    assert(
      residue.targetAdded ===
        (residue.targetOccurrenceNumber > residue.baselineOccurrenceCount),
      `${caseName}: typed residue targetAdded disagrees with authenticated baseline occurrence accounting`,
    )
    const targetIndex = residue.structural.index
    const row = rowsByIndex.get(targetIndex)
    assert(row, `${caseName}: typed residue unit ${targetIndex} has no semantic row`)
    assert(
      row.disposition === 'source-runtime-covered',
      `${caseName}: typed residue unit ${targetIndex} is not source-runtime-covered`,
    )
    assert(
      Array.isArray(row.ownerIds) && row.ownerIds.length > 0,
      `${caseName}: typed residue unit ${targetIndex} has no source owner`,
    )
    assert(
      Array.isArray(row.evidenceIds),
      `${caseName}: typed residue unit ${targetIndex} has no semantic evidence`,
    )
    const evidence = row.evidenceIds.map(id => evidenceById.get(id))
    assert(
      evidence.every(Boolean),
      `${caseName}: typed residue unit ${targetIndex} has unknown semantic evidence`,
    )
    const semanticTestPaths = new Set(
      evidence
        .filter(item => item.kind === 'semantic-test')
        .map(item => item.path),
    )
    assert(
      semanticTestPaths.size > 0,
      `${caseName}: typed residue unit ${targetIndex} lacks semantic-test evidence`,
    )
    residueUnits.add(targetIndex)
    if (!residue.targetAdded) {
      inheritedResidues += 1
      inheritedResidueUnits.add(targetIndex)
      continue
    }
    const hasExecutableTargetFragment = evidence.some(
      item =>
        item.kind === 'target-fragment' &&
        typeof item.path === 'string' &&
        semanticTestPaths.has(item.path),
    )
    const hasStaticAstProof = evidence.some(item => item.kind === 'static-ast')
    assert(
      hasExecutableTargetFragment || hasStaticAstProof,
      `${caseName}: source-covered unit ${targetIndex} has a target-added ${residue.literalKind} value absent from its historical owner but lacks executable target-fragment or static-AST equivalence evidence`,
    )
    explicitlyProvedResidues += 1
  }
  return {
    status: 'passed',
    targetAddedOccurrences: report.targetAddedOccurrences,
    sourceRuntimeTargetOccurrences: report.sourceRuntimeTargetOccurrences,
    directOwnerMatches:
      report.sourceRuntimeTargetOccurrences - report.sourceRuntimeOwnerResidues,
    inheritedResidues,
    inheritedResidueUnits: inheritedResidueUnits.size,
    explicitlyProvedResidues,
    explicitlyProvedResidueUnits:
      new Set(
        targetAddedResidueRows.map(residue => residue.structural.index),
      ).size,
    ownerResidues: report.sourceRuntimeOwnerResidues,
    ownerResidueUnits: residueUnits.size,
    byKind: report.sourceRuntimeOwnerResiduesByKind,
  }
}

function validateSemanticLiteralResidues({
  caseName,
  coverage,
  coveragePinned,
  partitionsPinned,
  repositoryRoot,
  semanticTree,
  sourcePinned,
  structuralPinned,
  testEnvironment,
  versions,
}) {
  if (!testEnvironment) {
    return {
      status: 'not-run-without-authenticated-artifacts',
      targetAddedOccurrences: null,
      sourceRuntimeTargetOccurrences: null,
      inheritedResidues: null,
      inheritedResidueUnits: null,
      directOwnerMatches: null,
      explicitlyProvedResidues: null,
      explicitlyProvedResidueUnits: null,
      ownerResidues: null,
      ownerResidueUnits: null,
      byKind: null,
    }
  }
  const baseline = testEnvironment[bundleEnvironmentVariable(versions.baseline)]
  const target = testEnvironment[bundleEnvironmentVariable(versions.target)]
  assert(typeof baseline === 'string', `${caseName}: authenticated baseline bundle is missing`)
  assert(typeof target === 'string', `${caseName}: authenticated target bundle is missing`)
  const scanner = path.join(
    repositoryRoot,
    'recovery',
    'scripts',
    'inspect-semantic-literal-gaps.mjs',
  )
  const stdout = run(
    repositoryRoot,
    process.execPath,
    [
      scanner,
      '--baseline',
      baseline,
      '--target',
      target,
      '--source-root',
      path.join(semanticTree, 'src'),
      '--structural',
      structuralPinned.filename,
      '--partitions',
      partitionsPinned.filename,
      '--sources',
      sourcePinned.filename,
      '--coverage',
      coveragePinned.filename,
    ],
    `${caseName} typed semantic literal residue audit`,
  )
  let report
  try {
    report = JSON.parse(stdout)
  } catch (error) {
    throw new Error(`${caseName}: typed semantic literal audit returned invalid JSON`, {
      cause: error,
    })
  }
  return validateSemanticLiteralResidueReport({ caseName, coverage, report })
}

function runCaseSemanticEvidenceTests({
  caseName,
  coverage,
  repositoryRoot,
  semanticTree,
  testEnvironment,
}) {
  const files = semanticEvidenceTestFilesForCoverage(coverage)
  if (!testEnvironment) {
    return {
      status: 'not-run-without-authenticated-artifacts',
      files,
      summary: null,
    }
  }
  if (files.length === 0) {
    return {
      status: 'not-configured',
      files,
      summary: null,
    }
  }
  const filenames = files.map((relative, index) =>
    safeRepositoryPath(
      repositoryRoot,
      relative,
      `semantic evidence test ${index + 1}`,
    ),
  )
  const stdout = run(
    repositoryRoot,
    process.execPath,
    ['--test', ...filenames],
    `${caseName} semantic evidence tests`,
    {
      env: {
        ...testEnvironment,
        CLAUDE_CODE_SEMANTIC_CASE: caseName,
        CLAUDE_CODE_SEMANTIC_SOURCE_ROOT: path.join(semanticTree, 'src'),
        CLAUDE_CODE_SEMANTIC_TARGET_COMMIT: coverage.targetCommit,
      },
    },
  )
  const summary =
    stdout
      .split('\n')
      .find(line => line.startsWith('ℹ tests ') || line.startsWith('# tests ')) ??
    null
  return {
    status: 'passed',
    files,
    summary,
  }
}

function runCurrentSemanticEvidenceTests({
  auditedResults,
  repositoryRoot,
  testEnvironment,
}) {
  const files = [
    ...new Set(
      auditedResults.flatMap(
        result => result.sourceReproduction.semanticTestFiles,
      ),
    ),
  ].sort()
  if (!testEnvironment) {
    return {
      status: 'not-run-without-authenticated-artifacts',
      files,
      summary: null,
    }
  }
  if (files.length === 0) {
    return { status: 'not-configured', files, summary: null }
  }
  const filenames = files.map((relative, index) =>
    safeRepositoryPath(
      repositoryRoot,
      relative,
      `current semantic evidence test ${index + 1}`,
    ),
  )
  const environment = {
    ...testEnvironment,
    CLAUDE_CODE_SEMANTIC_SOURCE_ROOT: path.join(repositoryRoot, 'src'),
  }
  // An unset case selector is the contract used by the focused tests for the
  // cumulative/current source path.  A caller's stale selector must not turn
  // this independent pass into another historical-case run.
  delete environment.CLAUDE_CODE_SEMANTIC_CASE
  delete environment.CLAUDE_CODE_SEMANTIC_TARGET_COMMIT
  const stdout = run(
    repositoryRoot,
    process.execPath,
    ['--test', ...filenames],
    'current cumulative semantic evidence tests',
    { env: environment },
  )
  const summary =
    stdout
      .split('\n')
      .find(line => line.startsWith('ℹ tests ') || line.startsWith('# tests ')) ??
    null
  return { status: 'passed', files, summary }
}

function runCurrentSemanticOwnerSyntaxChecks({
  auditedResults,
  repositoryRoot,
}) {
  const files = [
    ...new Set(
      auditedResults.flatMap(
        result => result.sourceReproduction.semanticOwnerPaths,
      ),
    ),
  ]
    .filter(relative => /\.(?:[cm]?[jt]sx?)$/.test(relative))
    .sort()
  if (files.length === 0) return { status: 'not-configured', files: [] }
  const output = fs.mkdtempSync(
    path.join(os.tmpdir(), 'current-semantic-owner-syntax-'),
  )
  try {
    run(
      repositoryRoot,
      'bun',
      [
        'build',
        ...files,
        '--target=bun',
        '--external=*',
        '--entry-naming=[dir]/[name]-[hash].[ext]',
        `--outdir=${output}`,
      ],
      'current semantic owner syntax',
    )
    return { status: 'passed', files }
  } finally {
    fs.rmSync(output, { recursive: true, force: true })
  }
}

function replayExactDelta(baseline, target, payload, expectedTarget) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-generated-replay-'))
  const reconstructed = path.join(temporary, 'cli.js')
  try {
    run(
      temporary,
      'zstd',
      ['-d', `--patch-from=${baseline}`, payload, '-o', reconstructed, '--force'],
      'Zstandard exact generated replay',
    )
    const reconstructedValue = fs.readFileSync(reconstructed)
    const targetValue = fs.readFileSync(target)
    assert(reconstructedValue.equals(targetValue), 'Exact generated delta differs from target bytes')
    assert(reconstructedValue.length === expectedTarget.bytes, 'Replayed target byte length differs')
    assert(sha256(reconstructedValue) === expectedTarget.sha256, 'Replayed target SHA-256 differs')
    return { bytes: reconstructedValue.length, sha256: expectedTarget.sha256 }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

function auditCase(
  manifestPath,
  repositoryRoot,
  artifactsRoot,
  semanticTestArtifacts,
) {
  const manifest = readJson(manifestPath, 'selected case manifest')
  const caseName = manifest.case
  const versions = caseVersions(caseName)
  const caseRoot = path.dirname(manifestPath)
  assert(path.basename(caseRoot) === caseName, `${caseName}: manifest directory differs`)
  assertPlainObject(manifest.generatedRecovery, `${caseName}.generatedRecovery`)
  assertPlainObject(manifest.semanticSourceLineage, `${caseName}.semanticSourceLineage`)
  const semantic = manifest.semanticSourceLineage
  assert(
    typeof semantic.targetCommit === 'string' && GIT_OBJECT_PATTERN.test(semantic.targetCommit),
    `${caseName}: semantic targetCommit invalid`,
  )
  const resolvedCommit = runGit(repositoryRoot, ['rev-parse', '--verify', `${semantic.targetCommit}^{commit}`], `${caseName} semantic target commit`)
  assert(resolvedCommit === semantic.targetCommit, `${caseName}: semantic targetCommit identity differs`)

  const ownSupplement = semantic.supplement === null
    ? null
    : validateSupplement(repositoryRoot, semantic.supplement, caseName, `${caseName}.semanticSourceLineage.supplement`)
  assert(Array.isArray(semantic.cumulativeSupplements), `${caseName}: cumulativeSupplements missing`)
  const supplements = semantic.cumulativeSupplements.map((descriptor, index) => {
    assertPlainObject(descriptor, `${caseName} cumulative supplement ${index}`)
    return validateSupplement(
      repositoryRoot,
      descriptor,
      descriptor.case,
      `${caseName}.semanticSourceLineage.cumulativeSupplements[${index}]`,
    )
  })
  const expectedSupplements = discoverSemanticSupplements(repositoryRoot, caseName)
  assert(
    JSON.stringify(supplements.map(supplementIdentity)) === JSON.stringify(expectedSupplements),
    `${caseName}: cumulative semantic supplements are incomplete or out of order`,
  )
  if (ownSupplement) {
    assert(
      JSON.stringify(supplementIdentity(ownSupplement)) ===
        JSON.stringify(expectedSupplements.find(item => item.case === caseName)),
      `${caseName}: own semantic supplement is absent from cumulative lineage`,
    )
    const caseRelative = path.relative(caseRoot, ownSupplement.filename).split(path.sep).join('/')
    generatedAssertion(manifest, caseRelative, `${caseName} semantic supplement`)
  }

  // Verify every carried supplement against the historical release where its
  // behavior was introduced.  A process-local cache keeps a full-chain audit
  // linear while selected-case audits still prove their entire ancestry.
  const introductionProofs = supplements.map(supplement =>
    verifySupplementAtIntroduction(repositoryRoot, supplement),
  )

  assertPlainObject(semantic.sourceCoverage, `${caseName}.semanticSourceLineage.sourceCoverage`)
  const coveragePinned = validatePinnedCaseFile(
    caseRoot,
    manifest,
    semantic.sourceCoverage.path,
    `${caseName} semantic source coverage`,
  )
  assert(coveragePinned.bytes === semantic.sourceCoverage.bytes, `${caseName}: sourceCoverage bytes differ`)
  assert(coveragePinned.sha256 === semantic.sourceCoverage.sha256, `${caseName}: sourceCoverage SHA-256 differs`)

  const structuralPinned = validatePinnedCaseFile(
    caseRoot,
    manifest,
    manifest.generatedRecovery.structural.path ??
      manifest.generatedRecovery.structural.ledger,
    `${caseName} structural ledger`,
  )
  const structural = jsonGzip(structuralPinned.value, `${caseName} structural ledger`)
  const sourcePinned = validatePinnedCaseFile(
    caseRoot,
    manifest,
    manifest.generatedRecovery.attribution.sources ??
      `${manifest.generatedRecovery.attribution.directory}/sources.jsonl.gz`,
    `${caseName} attribution sources`,
  )
  const partitionsPinned = validatePinnedCaseFile(
    caseRoot,
    manifest,
    manifest.generatedRecovery.attribution.targetPartitions ??
      `${manifest.generatedRecovery.attribution.directory}/target-partitions.jsonl.gz`,
    `${caseName} target partitions`,
  )
  const initializersPinned = validatePinnedCaseFile(
    caseRoot,
    manifest,
    manifest.generatedRecovery.attribution.targetInitializers ??
      `${manifest.generatedRecovery.attribution.directory}/target-initializers.jsonl.gz`,
    `${caseName} target initializers`,
  )
  const sourceRows = jsonLinesGzip(
    sourcePinned.value,
    `${caseName} attribution sources`,
  )
  const attribution = {
    sources: new Map(sourceRows.map(row => [row.sourceIndex, row.source])),
    partitions: jsonLinesGzip(
      partitionsPinned.value,
      `${caseName} target partitions`,
    ),
    initializers: jsonLinesGzip(
      initializersPinned.value,
      `${caseName} target initializers`,
    ),
  }

  const semanticTree = materializeSemanticSourceTree(
    repositoryRoot,
    semantic.targetCommit,
    ownSupplement,
    caseName,
  )
  let semanticSummary
  let semanticCoverage
  let semanticEvidenceTests
  let semanticLiteralResidueAudit
  try {
    semanticCoverage = jsonGzip(
      coveragePinned.value,
      `${caseName} semantic source coverage`,
    )
    semanticSummary = validateCoverageLedger({
      caseName,
      caseRoot,
      coverage: semanticCoverage,
      manifest,
      repositoryRoot,
      semanticTree,
      supplements,
      structural,
      attribution,
    })
    semanticLiteralResidueAudit = validateSemanticLiteralResidues({
      caseName,
      coverage: semanticCoverage,
      coveragePinned,
      partitionsPinned,
      repositoryRoot,
      semanticTree,
      sourcePinned,
      structuralPinned,
      testEnvironment: semanticTestArtifacts?.environment,
      versions,
    })
    semanticEvidenceTests = runCaseSemanticEvidenceTests({
      caseName,
      coverage: semanticCoverage,
      repositoryRoot,
      semanticTree,
      testEnvironment: semanticTestArtifacts?.environment,
    })
  } finally {
    fs.rmSync(semanticTree, { recursive: true, force: true })
  }
  const dependencyPinned = validatePinnedCaseFile(
    caseRoot,
    manifest,
    'semantic/dependency-coverage.json.gz',
    `${caseName} dependency coverage`,
  )
  const dependencyAudit = validateDependencyCoverage({
    caseName,
    dependency: jsonGzip(
      dependencyPinned.value,
      `${caseName} dependency coverage`,
    ),
    semanticCoverage,
    targetCommit: semantic.targetCommit,
    targetVersion: versions.target,
  })
  const buildInputs = sourceBuildInputAudit(
    repositoryRoot,
    semantic.targetCommit,
  )

  const delta = manifest.generatedRecovery.exactBundleDelta
  assertPlainObject(delta, `${caseName}.generatedRecovery.exactBundleDelta`)
  assert(delta.algorithm === 'zstd-dictionary-patch', `${caseName}: unsupported exact delta`)
  assert(delta.reconstructsTargetExactly === true, `${caseName}: exact delta claim missing`)
  const baselineId = delta.baselineArtifact ?? 'baselineBundle'
  const targetId = delta.targetArtifact ?? 'targetBundle'
  const baselineArtifact = uniqueById(manifest.artifacts, baselineId, `${caseName}.artifacts`)
  const targetArtifact = uniqueById(manifest.artifacts, targetId, `${caseName}.artifacts`)
  validateArtifact(baselineArtifact, `${caseName}.${baselineId}`)
  validateArtifact(targetArtifact, `${caseName}.${targetId}`)
  const deltaPinned = validatePinnedCaseFile(caseRoot, manifest, delta.path, `${caseName} exact generated delta`)
  let byteReplay = null
  if (artifactsRoot) {
    byteReplay = replayExactDelta(
      verifiedArtifactFile(artifactsRoot, baselineArtifact, `${caseName}.${baselineId}`),
      verifiedArtifactFile(artifactsRoot, targetArtifact, `${caseName}.${targetId}`),
      deltaPinned.filename,
      targetArtifact,
    )
  }
  const firstPartySemanticCoverageClaimed =
    semanticSummary.sourceRuntimeGaps === 0
  const firstPartySemanticEquivalentFromSrc =
    firstPartySemanticCoverageClaimed &&
    semanticLiteralResidueAudit.status === 'passed' &&
    (semanticEvidenceTests.status === 'passed' ||
      semanticEvidenceTests.status === 'not-configured')

  return {
    case: caseName,
    baselineVersion: versions.baseline,
    targetVersion: versions.target,
    generatedReplay: {
      byteExactGeneratedReplay: true,
      byteReplayVerified: byteReplay !== null,
      method: delta.algorithm,
      target: { bytes: targetArtifact.bytes, sha256: targetArtifact.sha256 },
      replay: byteReplay,
    },
    sourceReproduction: {
      criterion: SEMANTIC_CRITERION,
      firstPartySemanticCoverageClaimed,
      firstPartySemanticEquivalentFromSrc,
      wholeBundleSemanticEquivalentFromSrc:
        firstPartySemanticEquivalentFromSrc &&
        semanticSummary.dependencyRuntimeGaps === 0 &&
        buildInputs.hermetic,
      byteExactSourceBuildClaimed: false,
      buildInputs,
      targetCommit: semantic.targetCommit,
      cumulativeSupplements: supplements.map(supplementIdentity),
      supplementIntroductionProofs: introductionProofs,
      coverage: semanticSummary,
      dependencyAudit,
      semanticOwnerPaths: semanticCoverage.owners
        .filter(owner => owner.retiredInCase === undefined)
        .map(owner => owner.path)
        .sort(),
      retiredSemanticOwners: semanticCoverage.owners
        .filter(owner => owner.retiredInCase !== undefined)
        .map(owner => ({
          path: owner.path,
          retiredInCase: owner.retiredInCase,
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
      semanticTestFiles: [
        ...semanticEvidenceTestFilesForCoverage(semanticCoverage),
      ],
      semanticEvidenceTests,
      semanticLiteralResidueAudit,
    },
  }
}

function validateInventory(ledgerPath, discovered) {
  const ledger = readJson(ledgerPath, 'semantic source reproduction inventory')
  assertPlainObject(ledger, 'semantic source reproduction inventory')
  assert(ledger.schemaVersion === 2, 'Unsupported semantic source inventory schema')
  assert(ledger.criterion === SEMANTIC_CRITERION, 'Semantic source inventory criterion differs')
  assert(Array.isArray(ledger.cases), 'Semantic source inventory cases must be an array')
  const names = ledger.cases.map(entry => {
    assertPlainObject(entry, 'semantic source inventory entry')
    assert(entry.status === 'derived-from-pinned-case-ledger', `${entry.case}: invalid inventory status`)
    return entry.case
  })
  assert(new Set(names).size === names.length, 'Duplicate semantic source inventory case')
  assert(JSON.stringify(names) === JSON.stringify(discovered), 'Semantic source inventory differs from case chain')
  return ledger
}

export function auditSourceReproduction({
  artifactsRoot,
  casePath,
  ledgerPath,
  repositoryRoot,
  requireExactSource = false,
}) {
  const resolvedRepository = path.resolve(repositoryRoot)
  const discoveredItems = caseManifestPaths(resolvedRepository)
  const discovered = discoveredItems.map(item => item.caseName)
  validateInventory(path.resolve(ledgerPath), discovered)
  for (let index = 1; index < discoveredItems.length; index += 1) {
    assert(
      discoveredItems[index - 1].versions.target === discoveredItems[index].versions.baseline,
      `Recovery chain gap between ${discoveredItems[index - 1].caseName} and ${discoveredItems[index].caseName}`,
    )
  }
  let selected = discoveredItems
  let selectedCaseOnly = false
  if (casePath) {
    const resolved = path.resolve(casePath)
    const manifest = readJson(resolved, 'selected case manifest')
    const selectedIndex = discovered.indexOf(manifest.case)
    assert(selectedIndex >= 0, `Unknown selected case: ${manifest.case}`)
    selected = discoveredItems.slice(0, selectedIndex + 1)
    selected[selectedIndex] = { caseName: manifest.case, filename: resolved }
    selectedCaseOnly = true
  }
  const semanticTestArtifacts = artifactsRoot
    ? semanticTestEnvironment(
        resolvedRepository,
        selected,
        path.resolve(artifactsRoot),
      )
    : null
  const auditedResults = selected.map(item =>
    auditCase(
      item.filename,
      resolvedRepository,
      artifactsRoot && path.resolve(artifactsRoot),
      semanticTestArtifacts,
    ),
  )
  const semanticEvidenceTests = {
    status: artifactsRoot
      ? auditedResults.every(
          result =>
            result.sourceReproduction.semanticEvidenceTests.status ===
              'passed' ||
            result.sourceReproduction.semanticEvidenceTests.status ===
              'not-configured',
        )
        ? 'passed'
        : 'failed'
      : 'not-run-without-authenticated-artifacts',
    caseRuns: auditedResults.map(result => ({
      case: result.case,
      ...result.sourceReproduction.semanticEvidenceTests,
    })),
    authenticatedBundleEnvironment: semanticTestArtifacts?.resolved ?? {},
  }
  const currentSourceSemanticEvidenceTests =
    runCurrentSemanticEvidenceTests({
      auditedResults,
      repositoryRoot: resolvedRepository,
      testEnvironment: semanticTestArtifacts?.environment,
    })
  const currentSourceSemanticOwnerSyntax =
    runCurrentSemanticOwnerSyntaxChecks({
      auditedResults,
      repositoryRoot: resolvedRepository,
    })
  const results = selectedCaseOnly ? [auditedResults.at(-1)] : auditedResults
  if (requireExactSource) {
    assert(
      results.every(
        result => result.sourceReproduction.wholeBundleSemanticEquivalentFromSrc,
      ),
      'Whole-bundle semantic source equivalence required, but dependency/build-input gaps remain',
    )
  }
  return {
    status: artifactsRoot
      ? 'semantic-source-reproduction-verified'
      : 'semantic-source-reproduction-ledgers-verified',
    criterion: SEMANTIC_CRITERION,
    cases: results.length,
    ancestryCasesVerified: selected.length,
    ancestryGeneratedReplayByteVerified: auditedResults.filter(
      result => result.generatedReplay.byteReplayVerified,
    ).length,
    ancestryFirstPartySemanticCoverageClaims: auditedResults.filter(
      result => result.sourceReproduction.firstPartySemanticCoverageClaimed,
    ).length,
    ancestryFirstPartySemanticEquivalentFromSource: auditedResults.filter(
      result => result.sourceReproduction.firstPartySemanticEquivalentFromSrc,
    ).length,
    ancestryWholeBundleSemanticEquivalentFromSource: auditedResults.filter(
      result => result.sourceReproduction.wholeBundleSemanticEquivalentFromSrc,
    ).length,
    ancestrySourceRuntimeGaps: auditedResults.reduce(
      (total, result) =>
        total + result.sourceReproduction.coverage.sourceRuntimeGaps,
      0,
    ),
    ancestryDependencyRuntimeGaps: auditedResults.reduce(
      (total, result) =>
        total + result.sourceReproduction.coverage.dependencyRuntimeGaps,
      0,
    ),
    ancestryMissingHermeticBuildInputCases: auditedResults.filter(
      result => !result.sourceReproduction.buildInputs.hermetic,
    ).length,
    generatedReplayExactClaims: results.filter(result => result.generatedReplay.byteExactGeneratedReplay).length,
    generatedReplayByteVerified: results.filter(result => result.generatedReplay.byteReplayVerified).length,
    firstPartySemanticCoverageClaims: results.filter(
      result => result.sourceReproduction.firstPartySemanticCoverageClaimed,
    ).length,
    firstPartySemanticEquivalentFromSource: results.filter(
      result => result.sourceReproduction.firstPartySemanticEquivalentFromSrc,
    ).length,
    wholeBundleSemanticEquivalentFromSource: results.filter(
      result => result.sourceReproduction.wholeBundleSemanticEquivalentFromSrc,
    ).length,
    sourceRuntimeGaps: results.reduce(
      (total, result) => total + result.sourceReproduction.coverage.sourceRuntimeGaps,
      0,
    ),
    dependencyRuntimeGaps: results.reduce(
      (total, result) =>
        total + result.sourceReproduction.coverage.dependencyRuntimeGaps,
      0,
    ),
    missingHermeticBuildInputCases: results.filter(
      result => !result.sourceReproduction.buildInputs.hermetic,
    ).length,
    byteExactSourceBuildClaims: 0,
    semanticEvidenceTests,
    currentSourceSemanticEvidenceTests,
    currentSourceSemanticOwnerSyntax,
    results,
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (args.help) {
    usage()
    return
  }
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const repositoryRoot = args.repo
    ? path.resolve(args.repo)
    : path.resolve(scriptDirectory, '../..')
  const ledgerPath = args.ledger
    ? path.resolve(args.ledger)
    : path.join(repositoryRoot, 'recovery', 'source-reproduction-gaps.json')
  console.log(
    JSON.stringify(
      auditSourceReproduction({
        artifactsRoot: args.artifacts,
        casePath: args.case,
        ledgerPath,
        repositoryRoot,
        requireExactSource: args.requireExactSource,
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
