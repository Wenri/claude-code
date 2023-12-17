#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const CLASSIFICATIONS = ['matched', 'moved', 'changed', 'unresolved']
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

function usage() {
  console.error(
    'Usage: verify-structural-ledger.mjs --ledger REPORT.json.gz ' +
      '[--expected-sha256 HEX] [--expected-bytes N] ' +
      '[--expected-baseline-sha256 HEX] [--expected-target-sha256 HEX] ' +
      '[--expected-target-tokens N] [--expected-target-units N]',
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

function parseInteger(value, label) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || String(parsed) !== value) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return parsed
}

function assertSha256(value, label) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} is not a lowercase SHA-256 digest`)
  }
}

function integer(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} is not an integer`)
  return value
}

function verifyEvidence(evidence, label) {
  assert(evidence && typeof evidence === 'object', `${label} is absent`)
  assertSha256(evidence.sha256, `${label}.sha256`)
  integer(evidence.bytes, `${label}.bytes`)
  integer(evidence.tokenCount, `${label}.tokenCount`)
  integer(evidence.utf16Length, `${label}.utf16Length`)
  integer(evidence.unitCount, `${label}.unitCount`)
  assertEqual(evidence.failureCount, 0, `${label}.failureCount`)
  assertEqual(
    evidence.tokenAccounting.accounted,
    evidence.tokenCount,
    `${label} accounted tokens`,
  )
  assertEqual(
    evidence.tokenAccounting.scanned,
    evidence.tokenCount,
    `${label} scanned tokens`,
  )
}

function emptyCounts() {
  return {
    changed: 0,
    matched: 0,
    moved: 0,
    unresolved: 0,
  }
}

function verifyRegions(report) {
  const target = report.target
  const regions = report.regions
  assert(Array.isArray(regions), 'regions must be an array')
  assertEqual(regions.length, target.unitCount, 'target region count')

  const units = emptyCounts()
  const tokens = emptyCounts()
  const moved = {
    ambiguousDuplicate: { tokens: 0, units: 0 },
    unique: { tokens: 0, units: 0 },
  }
  const unresolvedIndices = []
  let previousEnd = 0

  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index]
    assert(
      CLASSIFICATIONS.includes(region.classification),
      `region ${index}: invalid classification`,
    )
    const targetRegion = region.target
    assertEqual(targetRegion.index, index, `region ${index} target index`)
    integer(targetRegion.start, `region ${index} start`)
    integer(targetRegion.end, `region ${index} end`)
    integer(targetRegion.tokenCount, `region ${index} tokenCount`)
    assert(
      targetRegion.start >= previousEnd,
      `region ${index}: target ranges overlap or are out of order`,
    )
    assert(
      targetRegion.end >= targetRegion.start,
      `region ${index}: inverted target range`,
    )
    assert(
      targetRegion.end <= target.utf16Length,
      `region ${index}: target range exceeds artifact`,
    )
    previousEnd = targetRegion.end

    const classification = region.classification
    units[classification] += 1
    tokens[classification] += targetRegion.tokenCount
    if (classification === 'unresolved') {
      unresolvedIndices.push(index)
      assert(
        region.baselineUnitIndex === undefined,
        `region ${index}: unresolved region has a baseline pair`,
      )
    } else {
      integer(region.baselineUnitIndex, `region ${index} baselineUnitIndex`)
      assert(
        region.baselineUnitIndex < report.baseline.unitCount,
        `region ${index}: baseline index exceeds unit count`,
      )
    }
    if (classification === 'moved') {
      const bucket =
        region.moveEvidence === 'unique-exact-structural-hash'
          ? moved.unique
          : region.moveEvidence === 'duplicate-exact-structural-hash'
            ? moved.ambiguousDuplicate
            : null
      assert(bucket, `region ${index}: invalid move evidence`)
      bucket.units += 1
      bucket.tokens += targetRegion.tokenCount
    }
  }

  for (const classification of CLASSIFICATIONS) {
    assertEqual(
      report.coverage.units[classification],
      units[classification],
      `${classification} unit coverage`,
    )
    assertEqual(
      report.coverage.tokens[classification],
      tokens[classification],
      `${classification} token coverage`,
    )
  }
  assertEqual(report.coverage.units.total, regions.length, 'total unit coverage')
  const tokenTotal = CLASSIFICATIONS.reduce(
    (sum, classification) => sum + tokens[classification],
    0,
  )
  assertEqual(tokenTotal, target.tokenCount, 'target token classification sum')
  assertEqual(
    report.coverage.tokens.total,
    target.tokenCount,
    'target coverage total',
  )
  assertEqual(
    report.coverage.tokens.ledgerTotal,
    target.tokenCount,
    'target ledger total',
  )
  assertEqual(
    report.coverage.tokens.resolved,
    tokens.matched + tokens.moved + tokens.changed,
    'resolved token count',
  )
  assertEqual(
    report.pairCount,
    units.matched + units.moved + units.changed,
    'paired unit count',
  )
  assertEqual(
    report.unmatchedBaseline.length,
    report.baseline.unitCount - report.pairCount,
    'unmatched baseline count',
  )
  assertEqual(
    report.coverage.moveEvidence.unique.units,
    moved.unique.units,
    'unique moved units',
  )
  assertEqual(
    report.coverage.moveEvidence.unique.tokens,
    moved.unique.tokens,
    'unique moved tokens',
  )
  assertEqual(
    report.coverage.moveEvidence.ambiguousDuplicate.units,
    moved.ambiguousDuplicate.units,
    'ambiguous moved units',
  )
  assertEqual(
    report.coverage.moveEvidence.ambiguousDuplicate.tokens,
    moved.ambiguousDuplicate.tokens,
    'ambiguous moved tokens',
  )

  assert(Array.isArray(report.unresolvedTarget), 'unresolvedTarget is absent')
  const expectedUnresolved = regions.filter(
    region => region.classification === 'unresolved',
  )
  assertEqual(
    JSON.stringify(report.unresolvedTarget),
    JSON.stringify(expectedUnresolved),
    'unresolved target region ledger',
  )
  const listedUnresolved = report.unresolvedTarget.map(
    region => region.target.index,
  )
  assertEqual(
    JSON.stringify(listedUnresolved),
    JSON.stringify(unresolvedIndices),
    'unresolved target index ledger',
  )
  return { tokens, units, moved }
}

export function verifyStructuralLedger({
  filename,
  expectedBaselineSha256,
  expectedBytes,
  expectedSha256,
  expectedTargetSha256,
  expectedTargetTokens,
  expectedTargetUnits,
}) {
  const resolved = path.resolve(filename)
  const compressed = fs.readFileSync(resolved)
  const digest = sha256(compressed)
  if (expectedBytes !== undefined) {
    assertEqual(compressed.length, expectedBytes, 'ledger byte length')
  }
  if (expectedSha256 !== undefined) {
    assertSha256(expectedSha256, 'expected ledger SHA-256')
    assertEqual(digest, expectedSha256, 'ledger SHA-256')
  }
  assert(compressed.length >= 18, 'ledger is too short to be gzip')
  assertEqual(compressed[0], 0x1f, 'gzip magic byte 0')
  assertEqual(compressed[1], 0x8b, 'gzip magic byte 1')
  assertEqual(compressed[2], 8, 'gzip compression method')
  assertEqual(compressed.readUInt32LE(4), 0, 'gzip mtime')

  let decoded
  try {
    decoded = gunzipSync(compressed)
  } catch (error) {
    throw new Error('ledger gzip stream is invalid', { cause: error })
  }
  const canonical = gzipSync(decoded, { level: 9, mtime: 0 })
  assert(compressed.equals(canonical), 'ledger gzip encoding is not canonical')
  const text = UTF8_DECODER.decode(decoded)
  assert(text.endsWith('\n'), 'ledger JSON must end with one newline')
  let report
  try {
    report = JSON.parse(text)
  } catch (error) {
    throw new Error('ledger JSON is invalid', { cause: error })
  }

  assertEqual(report.schemaVersion, 1, 'ledger schema version')
  assertEqual(
    report.kind,
    'experimental-structural-generated-delta-ledger',
    'ledger kind',
  )
  verifyEvidence(report.baseline, 'baseline')
  verifyEvidence(report.target, 'target')
  if (expectedBaselineSha256 !== undefined) {
    assertEqual(
      report.baseline.sha256,
      expectedBaselineSha256,
      'baseline artifact SHA-256',
    )
  }
  if (expectedTargetSha256 !== undefined) {
    assertEqual(
      report.target.sha256,
      expectedTargetSha256,
      'target artifact SHA-256',
    )
  }
  if (expectedTargetTokens !== undefined) {
    assertEqual(
      report.target.tokenCount,
      expectedTargetTokens,
      'target artifact token count',
    )
  }
  if (expectedTargetUnits !== undefined) {
    assertEqual(
      report.target.unitCount,
      expectedTargetUnits,
      'target artifact unit count',
    )
  }
  const coverage = verifyRegions(report)
  return {
    bytes: compressed.length,
    coverage,
    gzipSha256: digest,
    kind: report.kind,
    status: 'structural-ledger-verified',
    target: report.target,
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args.ledger) {
    usage()
    process.exitCode = 2
    return
  }
  const result = verifyStructuralLedger({
    filename: args.ledger,
    expectedBaselineSha256: args['expected-baseline-sha256'],
    expectedBytes:
      args['expected-bytes'] === undefined
        ? undefined
        : parseInteger(args['expected-bytes'], '--expected-bytes'),
    expectedSha256: args['expected-sha256'],
    expectedTargetSha256: args['expected-target-sha256'],
    expectedTargetTokens:
      args['expected-target-tokens'] === undefined
        ? undefined
        : parseInteger(
            args['expected-target-tokens'],
            '--expected-target-tokens',
          ),
    expectedTargetUnits:
      args['expected-target-units'] === undefined
        ? undefined
        : parseInteger(
            args['expected-target-units'],
            '--expected-target-units',
          ),
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
