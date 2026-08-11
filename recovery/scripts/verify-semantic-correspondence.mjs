#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import {
  buildSemanticCorrespondence,
  encodeSemanticCorrespondence,
  semanticCorrespondenceSummary,
} from './build-semantic-correspondence.mjs'

function usage() {
  console.error(
    'Usage: verify-semantic-correspondence.mjs ' +
      '--attribution DIR --structural LEDGER.json.gz ' +
      '--obligations OBLIGATIONS.json --source-root src ' +
      '--changelog CHANGELOG-SECTION.md ' +
      '--baseline BASELINE.js --target TARGET.js ' +
      '--report REPORT.json.gz --summary SUMMARY.json ' +
      '[--expected-report-sha256 HEX] [--expected-summary-sha256 HEX]',
  )
}

function parseArguments(argv) {
  const allowed = new Set([
    'attribution',
    'baseline',
    'changelog',
    'expected-report-sha256',
    'expected-summary-sha256',
    'obligations',
    'report',
    'source-root',
    'structural',
    'summary',
    'target',
  ])
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) throw new Error(`Unexpected ${argument}`)
    const key = argument.slice(2)
    if (!allowed.has(key)) throw new Error(`Unknown argument: ${argument}`)
    if (result[key] !== undefined) throw new Error(`Duplicate ${argument}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`)
    }
    result[key] = value
    index += 1
  }
  return result
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readStoredReport(filename) {
  const status = fs.lstatSync(filename)
  assert(
    status.isFile() && !status.isSymbolicLink(),
    'semantic report is not a real regular file',
  )
  const compressed = fs.readFileSync(filename)
  assertEqual(compressed[0], 0x1f, 'semantic report gzip magic byte 0')
  assertEqual(compressed[1], 0x8b, 'semantic report gzip magic byte 1')
  assertEqual(compressed.readUInt32LE(4), 0, 'semantic report gzip mtime')
  const json = gunzipSync(compressed)
  assert(
    compressed.equals(gzipSync(json, { level: 9, mtime: 0 })),
    'semantic report is not canonical gzip',
  )
  assert(json.toString('utf8').endsWith('\n'), 'semantic report needs newline')
  return { compressed, json, report: JSON.parse(json.toString('utf8')) }
}

export function verifySemanticCorrespondence({
  attributionDirectory,
  baselinePath,
  changelogPath,
  expectedReportSha256,
  expectedSummarySha256,
  obligationsPath,
  reportPath,
  sourceRoot,
  structuralPath,
  summaryPath,
  targetPath,
}) {
  const stored = readStoredReport(reportPath)
  const summaryStatus = fs.lstatSync(summaryPath)
  assert(
    summaryStatus.isFile() && !summaryStatus.isSymbolicLink(),
    'semantic summary is not a real regular file',
  )
  const storedSummaryBytes = fs.readFileSync(summaryPath)
  const storedSummary = JSON.parse(storedSummaryBytes)
  if (expectedReportSha256 !== undefined) {
    assertEqual(
      sha256(stored.compressed),
      expectedReportSha256,
      'semantic report SHA-256',
    )
  }
  if (expectedSummarySha256 !== undefined) {
    assertEqual(
      sha256(storedSummaryBytes),
      expectedSummarySha256,
      'semantic summary SHA-256',
    )
  }

  const regenerated = buildSemanticCorrespondence({
    attributionDirectory,
    baselinePath,
    changelogPath,
    obligationsPath,
    sourceRoot,
    structuralPath,
    targetPath,
  })
  const encoded = encodeSemanticCorrespondence(regenerated)
  assert(
    stored.compressed.equals(encoded.compressed),
    'semantic report does not reproduce byte-for-byte',
  )
  const regeneratedSummary = semanticCorrespondenceSummary(
    regenerated,
    encoded.compressed,
  )
  const expectedSummaryBytes = Buffer.from(
    `${JSON.stringify(regeneratedSummary, null, 2)}\n`,
  )
  assert(
    storedSummaryBytes.equals(expectedSummaryBytes),
    'semantic summary does not reproduce byte-for-byte',
  )
  assertEqual(stored.report.schemaVersion, 1, 'report schema version')
  assertEqual(
    stored.report.kind,
    'whole-bundle-source-correspondence',
    'report kind',
  )
  assertEqual(
    stored.report.coverage.unclassifiedTokens,
    0,
    'unclassified target tokens',
  )
  assertEqual(
    stored.report.coverage.accountedTokens,
    stored.report.coverage.targetTokens,
    'accounted target tokens',
  )
  assertEqual(
    stored.report.sourceOwnership.unresolvedApplication,
    0,
    'unresolved application source ownership',
  )
  assertEqual(
    stored.report.coverage.obligations.releaseBulletsCovered,
    stored.report.coverage.obligations.releaseBulletCount,
    'release-note semantic coverage',
  )
  const manualLocalizations = stored.report.obligationWitnesses
    .filter(witness => witness.manualLocalization !== undefined)
    .map(witness => ({
      id: witness.id,
      ...witness.manualLocalization,
    }))
  assertEqual(
    manualLocalizations.length,
    stored.report.coverage.obligations.manualLocalizationCount,
    'manual localization count',
  )

  return {
    status: 'whole-bundle-source-correspondence-verified',
    report: {
      bytes: stored.compressed.length,
      sha256: sha256(stored.compressed),
    },
    summary: {
      bytes: storedSummaryBytes.length,
      sha256: sha256(storedSummaryBytes),
    },
    sourceTree: stored.report.sourceTree,
    targetTokens: stored.report.coverage.targetTokens,
    accountedTokens: stored.report.coverage.accountedTokens,
    unclassifiedTokens: stored.report.coverage.unclassifiedTokens,
    regions: stored.report.coverage.regions,
    sourceOwnership: stored.report.sourceOwnership,
    obligations: stored.report.coverage.obligations,
    testCatalog: stored.report.testCatalog,
    manualLocalizations,
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  const required = [
    'attribution',
    'baseline',
    'changelog',
    'obligations',
    'report',
    'source-root',
    'structural',
    'summary',
    'target',
  ]
  if (required.some(key => args[key] === undefined)) {
    usage()
    process.exitCode = 2
    return
  }
  console.log(JSON.stringify(verifySemanticCorrespondence({
    attributionDirectory: path.resolve(args.attribution),
    baselinePath: path.resolve(args.baseline),
    changelogPath: path.resolve(args.changelog),
    expectedReportSha256: args['expected-report-sha256'],
    expectedSummarySha256: args['expected-summary-sha256'],
    obligationsPath: path.resolve(args.obligations),
    reportPath: path.resolve(args.report),
    sourceRoot: path.resolve(args['source-root']),
    structuralPath: path.resolve(args.structural),
    summaryPath: path.resolve(args.summary),
    targetPath: path.resolve(args.target),
  }), null, 2))
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
