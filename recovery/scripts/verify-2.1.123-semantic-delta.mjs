#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import v8 from 'node:v8'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  RELEASE_2_1_123,
  rebuildRelease21123Core,
  release21123SemanticDeltaInternals,
} from './build-2.1.123-semantic-delta.mjs'
import { verifyAttributionReport } from './verify-attribution-report.mjs'
import { verifyReadableDiff } from './verify-readable-diff.mjs'
import { verifyStructuralLedger } from './verify-structural-ledger.mjs'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function assertDeepEqual(actual, expected, label) {
  const actualText = JSON.stringify(actual)
  const expectedText = JSON.stringify(expected)
  if (actualText !== expectedText) {
    throw new Error(
      `${label}: expected ${expectedText}, got ${actualText}`,
    )
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fileEvidence(filename) {
  const value = fs.readFileSync(filename)
  return { bytes: value.length, sha256: sha256(value) }
}

function artifactPath(root, relative) {
  const resolvedRoot = path.resolve(root)
  const filename = path.resolve(resolvedRoot, relative)
  assert(
    filename.startsWith(`${resolvedRoot}${path.sep}`),
    `artifact path escapes output root: ${relative}`,
  )
  return filename
}

function readRegularFile(filename, label) {
  const status = fs.lstatSync(filename)
  assert(status.isFile(), `${label} must be a regular file`)
  assert(!status.isSymbolicLink(), `${label} must not be a symlink`)
  return fs.readFileSync(filename)
}

function verifyArtifact(root, record, expectedPath, label) {
  assertEqual(record.path, expectedPath, `${label} path`)
  const filename = artifactPath(root, expectedPath)
  const actual = fileEvidence(filename)
  assertDeepEqual(
    { path: expectedPath, ...actual },
    record,
    `${label} identity`,
  )
  return filename
}

function compareGeneratedLedger(root, relative, expected, label) {
  const filename = artifactPath(root, relative)
  const actual = readRegularFile(filename, label)
  assert(actual.equals(expected), `${label} differs from deterministic rebuild`)
  return filename
}

export function verifyRelease21123SemanticDelta({
  baselinePath,
  outputRoot,
  progress = () => {},
  targetPath,
}) {
  const root = path.resolve(outputRoot)
  const rootStatus = fs.lstatSync(root)
  assert(rootStatus.isDirectory() && !rootStatus.isSymbolicLink(),
    'output root must be a real directory')
  const outputs = release21123SemanticDeltaInternals.outputs
  const proofFilename = artifactPath(root, outputs.proof)
  const proofBytes = readRegularFile(proofFilename, 'semantic proof')
  assert(proofBytes.toString('utf8').endsWith('\n'),
    'semantic proof must end with a newline')
  const proof = JSON.parse(proofBytes)

  progress('Rebuilding all three structural ledgers')
  const core = rebuildRelease21123Core({ baselinePath, targetPath })
  const { artifacts, readableDiff, ...proofCore } = proof
  assertDeepEqual(proofCore, core.proof, 'semantic proof core')
  assertEqual(proof.complete, true, 'semantic proof completeness')

  const rawFilename = compareGeneratedLedger(
    root,
    outputs.rawLedger,
    core.ledgers.rawLedger,
    'raw structural ledger',
  )
  const metadataFilename = compareGeneratedLedger(
    root,
    outputs.metadataLedger,
    core.ledgers.metadataLedger,
    'metadata-normalized structural ledger',
  )
  const exactFilename = compareGeneratedLedger(
    root,
    outputs.exactLedger,
    core.ledgers.exactLedger,
    'known-delta exact structural ledger',
  )

  verifyArtifact(root, artifacts.rawLedger, outputs.rawLedger,
    'raw ledger proof record')
  verifyArtifact(root, artifacts.metadataLedger, outputs.metadataLedger,
    'metadata ledger proof record')
  verifyArtifact(root, artifacts.exactLedger, outputs.exactLedger,
    'exact ledger proof record')

  progress('Verifying deterministic incremental attribution')
  const attributionRoot = artifactPath(root, outputs.attribution)
  const attributionFiles = {
    summary: {
      relative: `${outputs.attribution}/summary.json`,
      expected: core.attribution.summaryBuffer,
    },
    sources: {
      relative: `${outputs.attribution}/sources.jsonl.gz`,
      expected: core.attribution.reportBuffers.sources,
    },
    targetInitializers: {
      relative: `${outputs.attribution}/target-initializers.jsonl.gz`,
      expected: core.attribution.reportBuffers.targetInitializers,
    },
    targetPartitions: {
      relative: `${outputs.attribution}/target-partitions.jsonl.gz`,
      expected: core.attribution.reportBuffers.targetPartitions,
    },
    targetRanges: {
      relative: `${outputs.attribution}/target-ranges.jsonl.gz`,
      expected: core.attribution.reportBuffers.targetRanges,
    },
  }
  for (const [name, item] of Object.entries(attributionFiles)) {
    compareGeneratedLedger(
      root,
      item.relative,
      item.expected,
      `attribution ${name}`,
    )
    verifyArtifact(
      root,
      artifacts.attribution[name],
      item.relative,
      `attribution ${name} proof record`,
    )
  }
  const attributionVerification = verifyAttributionReport({
    reportDirectory: attributionRoot,
    expectedBaselineSha256: RELEASE_2_1_123.baseline.sha256,
    expectedSummarySha256: sha256(core.attribution.summaryBuffer),
    expectedTargetSha256: RELEASE_2_1_123.target.sha256,
  })

  const rawVerification = verifyStructuralLedger({
    filename: rawFilename,
    expectedBaselineSha256: RELEASE_2_1_123.baseline.sha256,
    expectedTargetSha256: RELEASE_2_1_123.target.sha256,
    expectedTargetTokens: RELEASE_2_1_123.targetTokens,
    expectedTargetUnits: RELEASE_2_1_123.targetUnits,
  })
  const metadataVerification = verifyStructuralLedger({
    filename: metadataFilename,
    expectedBaselineSha256: RELEASE_2_1_123.baseline.sha256,
    expectedTargetSha256: RELEASE_2_1_123.normalizedTarget.sha256,
    expectedTargetTokens: RELEASE_2_1_123.targetTokens,
    expectedTargetUnits: RELEASE_2_1_123.targetUnits,
  })
  const exactVerification = verifyStructuralLedger({
    filename: exactFilename,
    expectedBaselineSha256: RELEASE_2_1_123.syntheticBaseline.sha256,
    expectedTargetSha256: RELEASE_2_1_123.normalizedTarget.sha256,
    expectedTargetTokens: RELEASE_2_1_123.targetTokens,
    expectedTargetUnits: RELEASE_2_1_123.targetUnits,
  })
  assertDeepEqual(
    exactVerification.coverage.units,
    {
      changed: 0,
      matched: RELEASE_2_1_123.targetUnits,
      moved: 0,
      unresolved: 0,
    },
    'verified exact unit coverage',
  )
  assertDeepEqual(
    exactVerification.coverage.tokens,
    {
      changed: 0,
      matched: RELEASE_2_1_123.targetTokens,
      moved: 0,
      unresolved: 0,
    },
    'verified exact token coverage',
  )

  progress('Verifying readable adjacent-bundle artifacts')
  const readableRoot = artifactPath(root, outputs.readable)
  const readableVerification = verifyReadableDiff({
    expectedBaselineSha256: RELEASE_2_1_123.baseline.sha256,
    expectedTargetSha256: RELEASE_2_1_123.target.sha256,
    reportDirectory: readableRoot,
  })
  const readableMetadata = JSON.parse(
    readRegularFile(
      path.join(readableRoot, 'metadata.json'),
      'readable metadata',
    ),
  )
  const expectedReadable =
    release21123SemanticDeltaInternals.readableSummary(
      readableMetadata,
      readableRoot,
    )
  assertDeepEqual(readableDiff, expectedReadable, 'readable proof summary')
  verifyArtifact(
    root,
    readableDiff.metadata,
    `${outputs.readable}/metadata.json`,
    'readable metadata proof record',
  )
  for (const [name, record] of Object.entries(readableDiff.outputs)) {
    verifyArtifact(
      root,
      record,
      `${outputs.readable}/${name}`,
      `readable ${name} proof record`,
    )
  }

  return {
    status: '2.1.123-semantic-delta-verified',
    proof: {
      path: outputs.proof,
      bytes: proofBytes.length,
      sha256: sha256(proofBytes),
    },
    raw: rawVerification.coverage,
    metadataNormalized: metadataVerification.coverage,
    exact: exactVerification.coverage,
    attribution: attributionVerification,
    readable: readableVerification,
  }
}

function parseArguments(argv) {
  const result = {}
  const allowed = new Set(['baseline', 'output', 'target'])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    assert(argument.startsWith('--'), `Unexpected argument: ${argument}`)
    const key = argument.slice(2)
    assert(allowed.has(key), `Unknown argument: ${argument}`)
    assert(result[key] === undefined, `Duplicate argument: ${argument}`)
    const value = argv[index + 1]
    assert(value && !value.startsWith('--'), `Missing value for ${argument}`)
    result[key] = value
    index += 1
  }
  return result
}

function usage() {
  console.error(
    'Usage: verify-2.1.123-semantic-delta.mjs --baseline 2.1.122.js ' +
      '--target 2.1.123.js --output CASE_ROOT',
  )
}

function restartWithLargeHeapIfNeeded(args) {
  if (v8.getHeapStatistics().heap_size_limit >= 6 * 1024 * 1024 * 1024) {
    return false
  }
  const result = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=8192',
      fileURLToPath(import.meta.url),
      ...args,
    ],
    { stdio: 'inherit' },
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
  return true
}

function main() {
  const argv = process.argv.slice(2)
  const args = parseArguments(argv)
  if (!args.baseline || !args.target || !args.output) {
    usage()
    process.exitCode = 2
    return
  }
  if (restartWithLargeHeapIfNeeded(argv)) return
  const result = verifyRelease21123SemanticDelta({
    baselinePath: args.baseline,
    outputRoot: args.output,
    progress(message) {
      console.error(`${message}...`)
    },
    targetPath: args.target,
  })
  console.log(JSON.stringify(result, null, 2))
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
