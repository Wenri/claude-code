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
      '[--expected-baseline-sha256 HEX] ' +
      '[--expected-source-map-sha256 HEX] [--expected-target-sha256 HEX]',
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
  expectedSourceMapSha256,
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
  if (expectedSourceMapSha256 !== undefined) {
    assertSha256(expectedSourceMapSha256, 'expected source-map SHA-256')
    assertEqual(
      summary.artifacts.baselineSourceMap?.sha256,
      expectedSourceMapSha256,
      'baseline source-map SHA-256',
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
  const rangeFieldsPresent = [
    summary.reportFiles.targetRanges !== undefined,
    summary.coverage.targetRangeCount !== undefined,
    summary.coverage.targetRangeUtf16 !== undefined,
  ]
  assert(
    rangeFieldsPresent.every(value => value === rangeFieldsPresent[0]),
    'target range report fields must be all present or all absent',
  )
  const targetRanges = rangeFieldsPresent[0]
    ? readCanonicalJsonLines(
        safeReportFile(
          root,
          summary.reportFiles.targetRanges.path,
          'target ranges',
        ),
        summary.reportFiles.targetRanges,
        'target ranges',
      )
    : null

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
  if (targetRanges) {
    assertEqual(
      targetRanges.length,
      summary.coverage.targetRangeCount,
      'target range count',
    )
    assertEqual(
      targetRanges.length,
      partitions.length + summary.coverage.exactAnchorCount,
      'partition plus anchor target range count',
    )
    let previousEnd = 0
    let partitionUtf16 = 0
    let anchorUtf16 = 0
    let partitionRangeCount = 0
    let anchorRangeCount = 0
    const ids = new Set()
    const partitionIndices = new Set()
    const monotoneIndices = new Set()
    for (const [index, range] of targetRanges.entries()) {
      assert(
        range.kind === 'partition' || range.kind === 'exact-literal-anchor',
        `target range ${index}: invalid kind`,
      )
      assertEqual(
        range.target.offsetStart,
        previousEnd,
        `target range ${index} start`,
      )
      assert(
        typeof range.id === 'string' && range.id.length > 0,
        `target range ${index}: id is absent`,
      )
      assert(!ids.has(range.id), `target range ${index}: duplicate id`)
      ids.add(range.id)
      assert(
        Number.isSafeInteger(range.target.offsetEnd) &&
          range.target.offsetEnd >= range.target.offsetStart,
        `target range ${index}: invalid end`,
      )
      assertEqual(
        range.target.utf16Length,
        range.target.offsetEnd - range.target.offsetStart,
        `target range ${index} UTF-16 length`,
      )
      assertSha256(range.target.sha256, `target range ${index} SHA-256`)
      assert(Array.isArray(range.sourceIndices),
        `target range ${index}: sourceIndices must be an array`)
      assertEqual(
        JSON.stringify(range.sourceIndices),
        JSON.stringify([...new Set(range.sourceIndices)].sort((left, right) => left - right)),
        `target range ${index} sorted unique source indices`,
      )
      for (const sourceIndex of range.sourceIndices) {
        assert(
          Number.isSafeInteger(sourceIndex) &&
            sourceIndex >= 0 &&
            sourceIndex < sources.length,
          `target range ${index}: invalid source index`,
        )
      }
      if (range.kind === 'partition') {
        assert(
          Number.isSafeInteger(range.partitionIndex) &&
            range.partitionIndex >= 0 &&
            range.partitionIndex < partitions.length,
          `target range ${index}: invalid partition index`,
        )
        assert(
          !partitionIndices.has(range.partitionIndex),
          `target range ${index}: duplicate partition index`,
        )
        partitionIndices.add(range.partitionIndex)
        const partition = partitions[range.partitionIndex]
        const expectedSources = [
          partition.attributedSourceIndex,
          ...partition.sourceCandidates,
          ...partition.relocatedSourceCandidates,
          partition.boundarySourceIndices.left,
          partition.boundarySourceIndices.right,
        ]
          .filter(value => value !== null)
          .filter((value, position, values) => values.indexOf(value) === position)
          .sort((left, right) => left - right)
        assertEqual(range.id, partition.id, `target range ${index} partition id`)
        assertEqual(
          JSON.stringify(range.target),
          JSON.stringify(partition.target),
          `target range ${index} partition target`,
        )
        assertEqual(
          range.classification,
          partition.classification,
          `target range ${index} partition classification`,
        )
        assertEqual(
          range.confidence,
          partition.confidence,
          `target range ${index} partition confidence`,
        )
        assertEqual(
          JSON.stringify(range.sourceIndices),
          JSON.stringify(expectedSources),
          `target range ${index} partition source indices`,
        )
        partitionRangeCount += 1
        partitionUtf16 += range.target.utf16Length
      } else {
        assertEqual(
          range.classification,
          'exact-literal-anchor',
          `target range ${index} anchor classification`,
        )
        assert(
          range.confidence === 'exact' || range.confidence === 'unresolved',
          `target range ${index}: invalid anchor confidence`,
        )
        assert(
          Number.isSafeInteger(range.monotoneIndex) &&
            range.monotoneIndex >= 0 &&
            range.monotoneIndex < summary.coverage.exactAnchorCount,
          `target range ${index}: invalid monotone index`,
        )
        assert(
          !monotoneIndices.has(range.monotoneIndex),
          `target range ${index}: duplicate monotone index`,
        )
        monotoneIndices.add(range.monotoneIndex)
        assert(
          range.sourceIndices.length <= 1,
          `target range ${index}: anchor has multiple owners`,
        )
        assertEqual(
          range.confidence,
          range.sourceIndices.length === 1 ? 'exact' : 'unresolved',
          `target range ${index} anchor confidence`,
        )
        anchorRangeCount += 1
        anchorUtf16 += range.target.utf16Length
      }
      previousEnd = range.target.offsetEnd
    }
    assertEqual(
      previousEnd,
      summary.coverage.targetUtf16,
      'target range UTF-16 coverage',
    )
    assertEqual(
      previousEnd,
      summary.coverage.targetRangeUtf16,
      'target range summary UTF-16 coverage',
    )
    assertEqual(partitionRangeCount, partitions.length, 'partition range count')
    assertEqual(
      anchorRangeCount,
      summary.coverage.exactAnchorCount,
      'anchor range count',
    )
    assertEqual(
      partitionUtf16,
      summary.coverage.targetPartitionUtf16,
      'partition range UTF-16 coverage',
    )
    assertEqual(
      anchorUtf16,
      summary.coverage.exactAnchorTargetUtf16,
      'anchor range UTF-16 coverage',
    )
  }

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
      ...(targetRanges ? { targetRanges: targetRanges.length } : {}),
    },
    coverage: {
      accountedTargetUtf16: summary.coverage.accountedTargetUtf16,
      targetUtf16: summary.coverage.targetUtf16,
      unaccountedTargetUtf16: summary.coverage.unaccountedTargetUtf16,
      ...(targetRanges ? { targetRanges: targetRanges.length } : {}),
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
        expectedSourceMapSha256: args['expected-source-map-sha256'],
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
