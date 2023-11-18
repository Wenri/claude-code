#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

function usage() {
  console.error(
    'Usage: verify-readable-diff.mjs --report DIR ' +
      '[--expected-metadata-sha256 HEX] ' +
      '[--expected-baseline-sha256 HEX] [--expected-target-sha256 HEX]',
  )
}

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[argument.slice(2)] = value
    index += 1
  }
  return result
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function safeOutput(root, name) {
  if (
    typeof name !== 'string' ||
    path.isAbsolute(name) ||
    name.includes('/') ||
    name.includes('\\') ||
    name === '.' ||
    name === '..'
  ) {
    throw new Error(`Unsafe readable-diff output name: ${name}`)
  }
  return path.join(root, name)
}

export function verifyReadableDiff({
  expectedBaselineSha256,
  expectedMetadataSha256,
  expectedTargetSha256,
  reportDirectory,
}) {
  const root = path.resolve(reportDirectory)
  const metadataBytes = fs.readFileSync(path.join(root, 'metadata.json'))
  const metadataSha256 = sha256(metadataBytes)
  if (expectedMetadataSha256 !== undefined) {
    assertEqual(
      metadataSha256,
      expectedMetadataSha256,
      'readable-diff metadata SHA-256',
    )
  }
  const metadata = JSON.parse(metadataBytes)
  assertEqual(metadata.schemaVersion, 1, 'metadata schema version')
  if (expectedBaselineSha256 !== undefined) {
    assertEqual(
      metadata.inputs.baseline.sha256,
      expectedBaselineSha256,
      'baseline input SHA-256',
    )
  }
  if (expectedTargetSha256 !== undefined) {
    assertEqual(
      metadata.inputs.target.sha256,
      expectedTargetSha256,
      'target input SHA-256',
    )
  }
  assertEqual(
    metadata.verification.comparisonInvariantHashesEqual,
    true,
    'comparison invariant',
  )
  const invariantHashes = [
    metadata.verification.targetComparisonInvariantHashBeforeAlphaRename,
    metadata.verification.targetComparisonInvariantHashAfterAlphaRename,
    metadata.verification
      .targetComparisonInvariantHashAfterStatementNormalization,
  ]
  assertEqual(
    new Set(invariantHashes).size,
    1,
    'comparison invariant hash count',
  )

  for (const [name, evidence] of Object.entries(metadata.outputs)) {
    assertEqual(evidence.name, name, `${name} evidence name`)
    const value = fs.readFileSync(safeOutput(root, name))
    assertEqual(value.length, evidence.bytes, `${name} byte length`)
    assertEqual(sha256(value), evidence.sha256, `${name} SHA-256`)
  }

  const compressed = fs.readFileSync(
    safeOutput(root, 'normalized.diff.gz'),
  )
  assertEqual(compressed[0], 0x1f, 'readable diff gzip magic byte 0')
  assertEqual(compressed[1], 0x8b, 'readable diff gzip magic byte 1')
  assertEqual(compressed.readUInt32LE(4), 0, 'readable diff gzip mtime')
  const normalizedDiff = gunzipSync(compressed)
  assert(
    compressed.equals(gzipSync(normalizedDiff, { level: 9, mtime: 0 })),
    'readable diff gzip stream is not canonical',
  )
  const uncompressed =
    metadata.reproducibleIntermediates['normalized.diff']
  assertEqual(
    normalizedDiff.length,
    uncompressed.bytes,
    'normalized diff uncompressed byte length',
  )
  assertEqual(
    sha256(normalizedDiff),
    uncompressed.sha256,
    'normalized diff uncompressed SHA-256',
  )
  assert(
    normalizedDiff
      .subarray(0, 80)
      .toString('utf8')
      .startsWith('diff --git '),
    'normalized output is not a Git diff',
  )

  return {
    status: 'readable-diff-verified',
    metadata: {
      bytes: metadataBytes.length,
      sha256: metadataSha256,
    },
    normalizedDiff: {
      bytes: normalizedDiff.length,
      sha256: sha256(normalizedDiff),
    },
    matching: metadata.matching,
    renames: {
      accepted: metadata.renames.accepted,
      edits: metadata.renames.edits,
      rejected: metadata.renames.rejected,
    },
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.report) {
    usage()
    process.exitCode = 2
    return
  }
  console.log(
    JSON.stringify(
      verifyReadableDiff({
        expectedBaselineSha256: args['expected-baseline-sha256'],
        expectedMetadataSha256: args['expected-metadata-sha256'],
        expectedTargetSha256: args['expected-target-sha256'],
        reportDirectory: args.report,
      }),
      null,
      2,
    ),
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error))
    process.exitCode = 1
  }
}
