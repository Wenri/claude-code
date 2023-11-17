#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

function usage() {
  console.error(
    'Usage: verify-attribution-report.mjs --report DIR ' +
      '[--expected-summary-sha256 HEX] ' +
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

function assertSha256(value, label) {
  assert(
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
    `${label} is not a lowercase SHA-256 digest`,
  )
}

function safeReportFile(root, relative, label) {
  assert(typeof relative === 'string', `${label}: path is absent`)
  const parts = relative.split('/')
  if (
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    parts.length !== 1 ||
    parts.includes('') ||
    parts.includes('.') ||
    parts.includes('..')
  ) {
    throw new Error(`${label}: unsafe report path ${relative}`)
  }
  return path.join(root, relative)
}

function readCanonicalJsonLines(filename, expected, label) {
  const compressed = fs.readFileSync(filename)
  assertEqual(compressed.length, expected.bytes, `${label} byte length`)
  assertEqual(sha256(compressed), expected.sha256, `${label} SHA-256`)
  assertEqual(compressed[0], 0x1f, `${label} gzip magic byte 0`)
  assertEqual(compressed[1], 0x8b, `${label} gzip magic byte 1`)
  assertEqual(compressed.readUInt32LE(4), 0, `${label} gzip mtime`)
  const decoded = gunzipSync(compressed)
  assert(
    compressed.equals(gzipSync(decoded, { level: 9, mtime: 0 })),
    `${label} gzip stream is not canonical`,
  )
  const text = UTF8_DECODER.decode(decoded)
  assert(text.endsWith('\n'), `${label} must end with one newline`)
  return text
    .trimEnd()
    .split('\n')
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`${label} row ${index + 1} is invalid JSON`, {
          cause: error,
        })
      }
    })
}

function countBy(rows, field) {
  const result = {}
  for (const row of rows) {
    assert(typeof row[field] === 'string', `row has no ${field}`)
    result[row[field]] = (result[row[field]] ?? 0) + 1
  }
  return result
}

function assertCountMap(actual, expected, label) {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])]
    .sort()
  for (const key of keys) {
    assertEqual(actual[key] ?? 0, expected[key] ?? 0, `${label}: ${key}`)
  }
}

export function verifyAttributionReport({
  reportDirectory,
  expectedBaselineSha256,
  expectedSummarySha256,
  expectedTargetSha256,
}) {
  const root = path.resolve(reportDirectory)
  const summaryBytes = fs.readFileSync(path.join(root, 'summary.json'))
  const summarySha256 = sha256(summaryBytes)
  if (expectedSummarySha256 !== undefined) {
    assertSha256(expectedSummarySha256, 'expected summary SHA-256')
    assertEqual(
      summarySha256,
      expectedSummarySha256,
      'attribution summary SHA-256',
    )
  }
  const summary = JSON.parse(UTF8_DECODER.decode(summaryBytes))
  assertEqual(summary.schemaVersion, 1, 'summary schema version')
  assertEqual(
    summary.kind,
    'generated-source-ownership-and-attribution-inventory',
    'summary kind',
  )
  assertEqual(summary.offsetUnit, 'utf16-code-units', 'summary offset unit')
  if (expectedBaselineSha256 !== undefined) {
    assertEqual(
      summary.artifacts.baselineBundle.sha256,
      expectedBaselineSha256,
      'baseline bundle SHA-256',
    )
  }
  if (expectedTargetSha256 !== undefined) {
    assertEqual(
      summary.artifacts.targetBundle.sha256,
      expectedTargetSha256,
      'target bundle SHA-256',
    )
  }

  const sources = readCanonicalJsonLines(
    safeReportFile(root, summary.reportFiles.sources.path, 'sources'),
    summary.reportFiles.sources,
    'sources',
  )
  const initializers = readCanonicalJsonLines(
    safeReportFile(
      root,
      summary.reportFiles.targetInitializers.path,
      'target initializers',
    ),
    summary.reportFiles.targetInitializers,
    'target initializers',
  )
  const partitions = readCanonicalJsonLines(
    safeReportFile(
      root,
      summary.reportFiles.targetPartitions.path,
      'target partitions',
    ),
    summary.reportFiles.targetPartitions,
    'target partitions',
  )

  assertEqual(
    sources.length,
    summary.baselineOwnership.sourceCount,
    'source row count',
  )
  assertEqual(
    initializers.length,
    summary.initializerEvidence.target.count,
    'target initializer row count',
  )
  assertEqual(
    partitions.length,
    summary.coverage.partitionCount,
    'target partition row count',
  )
  assertEqual(
    partitions.reduce((sum, row) => sum + row.target.utf16Length, 0),
    summary.coverage.targetPartitionUtf16,
    'target partition UTF-16 coverage',
  )

  const partitionCounts = countBy(partitions, 'classification')
  const expectedPartitionCounts = {
    'changed-same-source':
      summary.coverage.changedHighConfidencePartitionCount,
    'changed-source-candidates':
      summary.coverage.changedCandidatePartitionCount,
    'exact-generated': summary.coverage.exactGeneratedPartitionCount,
    'unresolved-target-gap': summary.coverage.unresolvedPartitionCount,
  }
  assertCountMap(
    partitionCounts,
    expectedPartitionCounts,
    'partition classification counts',
  )
  const partitionUtf16 = Object.fromEntries(
    Object.keys(expectedPartitionCounts).map(classification => [
      classification,
      partitions
        .filter(row => row.classification === classification)
        .reduce((sum, row) => sum + row.target.utf16Length, 0),
    ]),
  )
  assertEqual(
    partitionUtf16['exact-generated'],
    summary.coverage.exactGeneratedTargetUtf16,
    'exact partition UTF-16 coverage',
  )
  assertEqual(
    partitionUtf16['changed-same-source'],
    summary.coverage.changedHighConfidenceTargetUtf16,
    'high-confidence changed UTF-16 coverage',
  )
  assertEqual(
    partitionUtf16['changed-source-candidates'],
    summary.coverage.changedCandidateTargetUtf16,
    'candidate changed UTF-16 coverage',
  )
  assertEqual(
    partitionUtf16['unresolved-target-gap'],
    summary.coverage.unresolvedTargetUtf16,
    'unresolved UTF-16 coverage',
  )
  assertCountMap(
    countBy(initializers, 'status'),
    summary.initializerEvidence.target.statuses,
    'initializer status counts',
  )
  assertEqual(
    summary.coverage.targetPartitionUtf16 +
      summary.coverage.exactAnchorTargetUtf16,
    summary.coverage.targetUtf16,
    'partition plus anchor target coverage',
  )
  assertEqual(
    summary.coverage.accountedTargetUtf16,
    summary.coverage.targetUtf16,
    'accounted target UTF-16',
  )
  assertEqual(
    summary.coverage.unaccountedTargetUtf16,
    0,
    'unaccounted target UTF-16',
  )

  return {
    status: 'attribution-report-verified',
    summary: {
      bytes: summaryBytes.length,
      sha256: summarySha256,
    },
    rows: {
      sources: sources.length,
      targetInitializers: initializers.length,
      targetPartitions: partitions.length,
    },
    coverage: {
      accountedTargetUtf16: summary.coverage.accountedTargetUtf16,
      targetUtf16: summary.coverage.targetUtf16,
      unaccountedTargetUtf16: summary.coverage.unaccountedTargetUtf16,
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
      verifyAttributionReport({
        reportDirectory: args.report,
        expectedBaselineSha256: args['expected-baseline-sha256'],
        expectedSummarySha256: args['expected-summary-sha256'],
        expectedTargetSha256: args['expected-target-sha256'],
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
