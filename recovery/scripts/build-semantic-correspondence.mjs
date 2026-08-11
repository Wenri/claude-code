#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { summarizeSourceTree } from './verify-source-lineage.mjs'
import { verifyAttributionReport } from './verify-attribution-report.mjs'
import { verifyStructuralLedger } from './verify-structural-ledger.mjs'

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const CLASSIFICATIONS = new Set([
  'dependency-candidate',
  'dependency-attributed-high',
  'dependency-owned-exact',
  'generated-boundary',
  'mixed-candidate',
  'mixed-attributed-high',
  'mixed-owned-exact',
  'source-candidate',
  'source-attributed-high',
  'source-owned-exact',
])
const OBLIGATION_CLASSIFICATIONS = new Set([
  'dependency-adjacent',
  'external-component',
  'generated-runtime-adjacent',
  'metadata-only',
  'release-note-unobservable',
  'source-localized-adjacent',
  'source-localized-inherited',
])
const LOCALIZATION_BASES = new Set([
  'attribution',
  'authenticated-behavior-test',
])

function usage() {
  console.error(
    'Usage: build-semantic-correspondence.mjs ' +
      '--attribution DIR --structural LEDGER.json.gz ' +
      '--obligations OBLIGATIONS.json --source-root src ' +
      '--changelog CHANGELOG-SECTION.md ' +
      '--baseline BASELINE.js --target TARGET.js ' +
      '--output REPORT.json.gz --summary SUMMARY.json',
  )
}

function parseArguments(argv) {
  const allowed = new Set([
    'attribution',
    'baseline',
    'changelog',
    'obligations',
    'output',
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

function evidence(filename) {
  const value = fs.readFileSync(filename)
  return { bytes: value.length, sha256: sha256(value) }
}

function assertRealRegularFile(filename, label) {
  const status = fs.lstatSync(filename)
  assert(
    status.isFile() && !status.isSymbolicLink(),
    `${label} is not a real regular file`,
  )
}

function relativeParts(relative, label) {
  assert(
    typeof relative === 'string' &&
      relative.length > 0 &&
      !path.isAbsolute(relative) &&
      !relative.includes('\\'),
    `${label}: unsafe relative path`,
  )
  const parts = relative.split('/')
  assert(
    !parts.includes('') && !parts.includes('.') && !parts.includes('..'),
    `${label}: unsafe relative path`,
  )
  return parts
}

function safeExistingRegularFile(root, relative, label) {
  const rootStatus = fs.lstatSync(root)
  assert(
    rootStatus.isDirectory() && !rootStatus.isSymbolicLink(),
    `${label}: root is not a real directory`,
  )
  let current = path.resolve(root)
  const parts = relativeParts(relative, label)
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index])
    const status = fs.lstatSync(current)
    assert(!status.isSymbolicLink(), `${label}: path traverses a symlink`)
    const final = index === parts.length - 1
    assert(
      final ? status.isFile() : status.isDirectory(),
      `${label}: path component has the wrong type`,
    )
  }
  return current
}

function safeReportBasename(root, relative, label) {
  const parts = relativeParts(relative, label)
  assertEqual(parts.length, 1, `${label} path component count`)
  return safeExistingRegularFile(root, relative, label)
}

function readJson(filename, label) {
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filename}`, { cause: error })
  }
  return parsed
}

function readCanonicalGzipJson(filename, label) {
  const compressed = fs.readFileSync(filename)
  assertEqual(compressed[0], 0x1f, `${label} gzip magic byte 0`)
  assertEqual(compressed[1], 0x8b, `${label} gzip magic byte 1`)
  assertEqual(compressed.readUInt32LE(4), 0, `${label} gzip mtime`)
  const decoded = gunzipSync(compressed)
  assert(
    compressed.equals(gzipSync(decoded, { level: 9, mtime: 0 })),
    `${label} is not canonical gzip`,
  )
  return JSON.parse(decoded.toString('utf8'))
}

function readCanonicalGzipJsonLines(filename, label) {
  const compressed = fs.readFileSync(filename)
  assertEqual(compressed[0], 0x1f, `${label} gzip magic byte 0`)
  assertEqual(compressed[1], 0x8b, `${label} gzip magic byte 1`)
  assertEqual(compressed.readUInt32LE(4), 0, `${label} gzip mtime`)
  const decoded = gunzipSync(compressed)
  assert(
    compressed.equals(gzipSync(decoded, { level: 9, mtime: 0 })),
    `${label} is not canonical gzip`,
  )
  const text = decoded.toString('utf8')
  assert(text.endsWith('\n'), `${label} must end with a newline`)
  return text.trimEnd().split('\n').map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      throw new Error(`${label} row ${index + 1} is invalid JSON`, {
        cause: error,
      })
    }
  })
}

function countOccurrences(haystack, needle) {
  assert(needle.length > 0, 'fragment must not be empty')
  let count = 0
  let offset = 0
  while (true) {
    const found = haystack.indexOf(needle, offset)
    if (found === -1) return count
    count += 1
    offset = found + needle.length
  }
}

function occurrenceRanges(haystack, needle) {
  const ranges = []
  let offset = 0
  while (true) {
    const found = haystack.indexOf(needle, offset)
    if (found === -1) return ranges
    ranges.push({ start: found, end: found + needle.length })
    offset = found + needle.length
  }
}

function ownershipForWitnessRanges(witnessRanges, targetRanges, sourceRecords) {
  const ownership = { exact: new Set(), high: new Set(), candidate: new Set() }
  for (const witness of witnessRanges) {
    for (const range of targetRanges) {
      if (range.target.offsetEnd <= witness.start) continue
      if (range.target.offsetStart >= witness.end) break
      const strength =
        range.confidence === 'exact'
          ? 'exact'
          : range.confidence === 'high'
            ? 'high'
            : range.confidence === 'candidate'
              ? 'candidate'
              : null
      if (strength === null) continue
      for (const sourceIndex of range.sourceIndices) {
        const source = sourceRecords[sourceIndex]
        if (source?.kind === 'application' && source.resolved !== null) {
          ownership[strength].add(source.resolved)
        }
      }
    }
  }
  return Object.fromEntries(
    Object.entries(ownership).map(([strength, values]) => [
      strength,
      [...values].sort(),
    ]),
  )
}

function baselineOwnershipForWitnessRanges(witnessRanges, sourceRecords) {
  const result = new Set()
  for (const witness of witnessRanges) {
    for (const source of sourceRecords) {
      if (source.baselineEnd === undefined || source.baselineStart === undefined) {
        continue
      }
      if (source.baselineEnd <= witness.start) continue
      if (source.baselineStart >= witness.end) break
      if (source.kind === 'application' && source.resolved !== null) {
        result.add(source.resolved)
      }
    }
  }
  return [...result].sort()
}

function normalizedSourcePath(source) {
  if (!source.startsWith('../src/')) return null
  return source.slice(3)
}

function sourceAlternatives(relative) {
  const alternatives = [relative]
  if (relative.endsWith('.ts')) alternatives.push(`${relative}x`)
  if (relative.endsWith('.js')) alternatives.push(`${relative}x`)
  return [...new Set(alternatives)]
}

function resolveSourcePath(sourceRoot, relative, aliases) {
  relativeParts(relative, `attributed source ${relative}`)
  const configured = aliases[relative]
  const alternatives = configured === undefined
    ? sourceAlternatives(relative)
    : Array.isArray(configured)
      ? configured
      : [configured]
  for (const candidate of alternatives) {
    assert(
      typeof candidate === 'string' && candidate.startsWith('src/'),
      `unsafe source alias for ${relative}`,
    )
    try {
      safeExistingRegularFile(
        path.dirname(sourceRoot),
        candidate,
        `source alias for ${relative}`,
      )
      return candidate
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return null
}

function overlappingTargetRanges(regions, ranges) {
  const result = new Array(regions.length)
  let first = 0
  for (let regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
    const target = regions[regionIndex].target
    while (
      first < ranges.length &&
      ranges[first].target.offsetEnd <= target.start
    ) first += 1
    const overlaps = []
    for (let index = first; index < ranges.length; index += 1) {
      const range = ranges[index].target
      if (range.offsetStart >= target.end) break
      if (range.offsetEnd > target.start) overlaps.push(index)
    }
    result[regionIndex] = overlaps
  }
  return result
}

function publicTreeSummary(summary) {
  return {
    files: summary.files,
    bytes: summary.bytes,
    manifestSha256: summary.manifestSha256,
  }
}

function validateObligations({
  baselineText,
  changelogText,
  obligations,
  officialReleaseEvidence,
  sourceRecords,
  sourceRoot,
  targetRanges,
  targetText,
}) {
  assertEqual(obligations.schemaVersion, 1, 'obligations schema version')
  assert(
    Number.isSafeInteger(obligations.releaseBulletCount) &&
      obligations.releaseBulletCount > 0,
    'releaseBulletCount must be a positive integer',
  )
  assertEqual(
    obligations.releaseBulletCount,
    officialReleaseEvidence.bulletCount,
    'official release bullet count',
  )
  assert(
    Array.isArray(officialReleaseEvidence.bullets) &&
      officialReleaseEvidence.bullets.length === officialReleaseEvidence.bulletCount,
    'official release bullet inventory is invalid',
  )
  assert(
    Array.isArray(obligations.releaseBulletEvidence) &&
      obligations.releaseBulletEvidence.length === obligations.releaseBulletCount,
    'releaseBulletEvidence must contain every release bullet',
  )
  const releaseBulletEvidence = new Map()
  for (const entry of obligations.releaseBulletEvidence) {
    assert(
      Number.isSafeInteger(entry.number) &&
        entry.number >= 1 &&
        entry.number <= obligations.releaseBulletCount,
      'release bullet evidence number is invalid',
    )
    assert(
      !releaseBulletEvidence.has(entry.number),
      `duplicate release bullet evidence: ${entry.number}`,
    )
    assert(
      typeof entry.text === 'string' && entry.text.length > 0,
      `release bullet ${entry.number}: text is absent`,
    )
    assertEqual(
      sha256(Buffer.from(entry.text)),
      entry.sha256,
      `release bullet ${entry.number} SHA-256`,
    )
    assertEqual(
      entry.text,
      officialReleaseEvidence.bullets[entry.number - 1],
      `release bullet ${entry.number} exact official text`,
    )
    assertEqual(
      countOccurrences(changelogText, entry.text),
      1,
      `release bullet ${entry.number} changelog count`,
    )
    releaseBulletEvidence.set(entry.number, entry)
  }
  assert(Array.isArray(obligations.obligations), 'obligations must be an array')
  const ids = new Set()
  const coveredBullets = new Map()
  const testCatalog = new Map()
  const testContents = new Map()
  assert(Array.isArray(obligations.testCatalog), 'testCatalog must be an array')
  for (const entry of obligations.testCatalog) {
    assert(
      typeof entry.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(entry.id),
      'test catalog id is invalid',
    )
    assert(!testCatalog.has(entry.id), `duplicate test catalog id: ${entry.id}`)
    assert(
      typeof entry.path === 'string' && entry.path.startsWith('recovery/test/'),
      `${entry.id}: unsafe test path`,
    )
    const filename = safeExistingRegularFile(
      path.dirname(sourceRoot),
      entry.path,
      `${entry.id} test`,
    )
    const value = fs.readFileSync(filename)
    if (entry.bytes !== undefined) {
      assertEqual(value.length, entry.bytes, `${entry.id} test bytes`)
    }
    if (entry.sha256 !== undefined) {
      assertEqual(sha256(value), entry.sha256, `${entry.id} test SHA-256`)
    }
    testCatalog.set(entry.id, entry)
    testContents.set(entry.id, value.toString('utf8'))
  }
  const usedTestIds = new Set()
  const obligationWitnesses = []
  let fragmentCount = 0
  let sourceAssertionCount = 0
  let sourceRemovalCount = 0
  const classifications = {}
  const localizationBases = {}

  for (const obligation of obligations.obligations) {
    const bundleWitnesses = []
    let hasAdjacentCountEvidence = false
    assert(
      typeof obligation.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(obligation.id),
      'obligation id is invalid',
    )
    assert(!ids.has(obligation.id), `duplicate obligation id: ${obligation.id}`)
    ids.add(obligation.id)
    assert(
      OBLIGATION_CLASSIFICATIONS.has(obligation.classification),
      `${obligation.id}: invalid classification`,
    )
    classifications[obligation.classification] =
      (classifications[obligation.classification] ?? 0) + 1
    const localizationBasis = obligation.localizationBasis ?? 'attribution'
    assert(
      LOCALIZATION_BASES.has(localizationBasis),
      `${obligation.id}: invalid localization basis`,
    )
    localizationBases[localizationBasis] =
      (localizationBases[localizationBasis] ?? 0) + 1
    assert(
      Array.isArray(obligation.releaseBullets),
      `${obligation.id}: releaseBullets must be an array`,
    )
    for (const bullet of obligation.releaseBullets) {
      assert(
        Number.isSafeInteger(bullet) &&
          bullet >= 1 &&
          bullet <= obligations.releaseBulletCount,
        `${obligation.id}: invalid release bullet ${bullet}`,
      )
      assert(
        releaseBulletEvidence.has(bullet),
        `${obligation.id}: release bullet evidence is absent`,
      )
      const previous = coveredBullets.get(bullet)
      assert(previous === undefined, `release bullet ${bullet} is covered twice`)
      coveredBullets.set(bullet, obligation.id)
    }
    assert(
      obligation.releaseBullets.length > 0 || obligation.hidden === true,
      `${obligation.id}: non-release obligation must be marked hidden`,
    )
    assert(
      typeof obligation.rationale === 'string' && obligation.rationale.length > 0,
      `${obligation.id}: rationale is absent`,
    )
    assert(
      Array.isArray(obligation.targetFragments),
      `${obligation.id}: targetFragments must be an array`,
    )
    if (obligation.targetFragments.length === 0) {
      assert(
        obligation.classification === 'external-component' ||
          obligation.classification === 'release-note-unobservable',
        `${obligation.id}: at least one bundle fragment is required`,
      )
      assert(
        Array.isArray(obligation.externalEvidence) &&
          obligation.externalEvidence.length > 0,
        `${obligation.id}: unobservable claim needs external evidence`,
      )
      for (const evidenceItem of obligation.externalEvidence) {
        assert(
          evidenceItem &&
            typeof evidenceItem.description === 'string' &&
            evidenceItem.description.length > 0,
          `${obligation.id}: invalid external evidence`,
        )
        assertEqual(
          sha256(Buffer.from(evidenceItem.description)),
          evidenceItem.sha256,
          `${obligation.id} external evidence SHA-256`,
        )
      }
    }
    for (const fragment of obligation.targetFragments) {
      assert(typeof fragment.text === 'string' && fragment.text.length > 0,
        `${obligation.id}: fragment text is absent`)
      const bytes = Buffer.from(fragment.text)
      assertEqual(bytes.length, fragment.bytes, `${obligation.id} fragment bytes`)
      assertEqual(sha256(bytes), fragment.sha256, `${obligation.id} fragment SHA-256`)
      assertEqual(
        countOccurrences(baselineText, fragment.text),
        fragment.baselineCount,
        `${obligation.id} baseline fragment count`,
      )
      assertEqual(
        countOccurrences(targetText, fragment.text),
        fragment.targetCount,
        `${obligation.id} target fragment count`,
      )
      if (fragment.baselineCount !== fragment.targetCount) {
        hasAdjacentCountEvidence = true
      }
      const targetWitnessRanges = occurrenceRanges(targetText, fragment.text)
      const baselineWitnessRanges = occurrenceRanges(
        baselineText,
        fragment.text,
      )
      bundleWitnesses.push({
        sha256: fragment.sha256,
        baselineCount: fragment.baselineCount,
        targetCount: fragment.targetCount,
        targetRanges: targetWitnessRanges,
        baselineRanges: baselineWitnessRanges,
        ownership: ownershipForWitnessRanges(
          targetWitnessRanges,
          targetRanges,
          sourceRecords,
        ),
        baselineOwnership: baselineOwnershipForWitnessRanges(
          baselineWitnessRanges,
          sourceRecords,
        ),
      })
      fragmentCount += 1
    }
    if (
      obligation.classification === 'source-localized-adjacent' ||
      obligation.classification === 'dependency-adjacent' ||
      obligation.classification === 'generated-runtime-adjacent' ||
      obligation.classification === 'metadata-only'
    ) {
      assert(
        hasAdjacentCountEvidence,
        `${obligation.id}: adjacent claim needs count-different bundle evidence`,
      )
    }
    const sourceLocalized = obligation.classification.startsWith('source-localized-')
    if (!sourceLocalized) {
      assert(
        localizationBasis === 'attribution',
        `${obligation.id}: manual localization requires a source-localized classification`,
      )
    }
    if (sourceLocalized) {
      assert(
        Array.isArray(obligation.sourceAssertions) &&
          obligation.sourceAssertions.length > 0,
        `${obligation.id}: source-localized obligation needs source assertions`,
      )
      assert(
        Array.isArray(obligation.testIds) && obligation.testIds.length > 0,
        `${obligation.id}: source-localized obligation needs test ids`,
      )
    }
    for (const testId of obligation.testIds ?? []) {
      assert(testCatalog.has(testId), `${obligation.id}: unknown test id ${testId}`)
      usedTestIds.add(testId)
    }
    for (const assertion of obligation.sourceAssertions ?? []) {
      assert(
        typeof assertion.path === 'string' && assertion.path.startsWith('src/'),
        `${obligation.id}: unsafe source assertion path`,
      )
      const filename = safeExistingRegularFile(
        path.dirname(sourceRoot),
        assertion.path,
        `${obligation.id} source assertion`,
      )
      const text = fs.readFileSync(filename, 'utf8')
      assert(typeof assertion.fragment === 'string' && assertion.fragment.length > 0,
        `${obligation.id}: source fragment is absent`)
      assertEqual(
        sha256(Buffer.from(assertion.fragment)),
        assertion.sha256,
        `${obligation.id} source fragment SHA-256`,
      )
      assertEqual(
        countOccurrences(text, assertion.fragment),
        assertion.count,
        `${obligation.id} source fragment count`,
      )
      sourceAssertionCount += 1
    }
    const sourceRemovals = obligation.sourceRemovals ?? []
    assert(
      Array.isArray(sourceRemovals),
      `${obligation.id}: sourceRemovals must be an array`,
    )
    for (const removal of sourceRemovals) {
      assert(
        typeof removal.path === 'string' && removal.path.startsWith('src/'),
        `${obligation.id}: unsafe source removal path`,
      )
      const filename = safeExistingRegularFile(
        path.dirname(sourceRoot),
        removal.path,
        `${obligation.id} source removal`,
      )
      const text = fs.readFileSync(filename, 'utf8')
      assert(
        typeof removal.fragment === 'string' && removal.fragment.length > 0,
        `${obligation.id}: source removal fragment is absent`,
      )
      assertEqual(
        sha256(Buffer.from(removal.fragment)),
        removal.sha256,
        `${obligation.id} source removal fragment SHA-256`,
      )
      assertEqual(
        countOccurrences(text, removal.fragment),
        0,
        `${obligation.id} source removal fragment count`,
      )
      sourceRemovalCount += 1
    }
    if (localizationBasis !== 'authenticated-behavior-test') {
      assert(
        sourceRemovals.length === 0,
        `${obligation.id}: source removals require authenticated-behavior-test localization`,
      )
    }
    let manualLocalization = null
    if (sourceLocalized && localizationBasis === 'attribution') {
      const assertedPaths = new Set(
        obligation.sourceAssertions.map(assertion => assertion.path),
      )
      const ownedPaths = new Set(
        bundleWitnesses.flatMap(witness => [
          ...witness.ownership.exact,
          ...witness.ownership.high,
          ...witness.baselineOwnership,
          ...(obligation.allowCandidateOwnership === true
            ? witness.ownership.candidate
            : []),
        ]),
      )
      assert(
        [...assertedPaths].some(sourcePath => ownedPaths.has(sourcePath)),
        `${obligation.id}: bundle witness is not owned by an asserted source path`,
      )
    } else if (sourceLocalized) {
      assert(
        obligation.classification === 'source-localized-adjacent',
        `${obligation.id}: manual localization must be adjacent`,
      )
      assert(
        hasAdjacentCountEvidence,
        `${obligation.id}: manual localization needs count-different behavior evidence`,
      )
      assert(
        obligation.targetFragments.every(fragment =>
          fragment.baselineCount !== fragment.targetCount,
        ),
        `${obligation.id}: every manual localization fragment must be count-different`,
      )
      assert(
        obligation.allowCandidateOwnership !== true,
        `${obligation.id}: manual localization cannot claim candidate ownership`,
      )
      assert(
        typeof obligation.localizationBoundary === 'string' &&
          obligation.localizationBoundary.length >= 40,
        `${obligation.id}: manual localization boundary rationale is absent`,
      )
      const retainedSourcePaths = obligation.retainedSourcePaths ?? []
      assert(
        Array.isArray(retainedSourcePaths) &&
          new Set(retainedSourcePaths).size === retainedSourcePaths.length,
        `${obligation.id}: retainedSourcePaths must be a unique array`,
      )
      const assertedPaths = new Set([
        ...(obligation.sourceAssertions ?? []).map(assertion => assertion.path),
        ...sourceRemovals.map(removal => removal.path),
      ])
      for (const retainedPath of retainedSourcePaths) {
        assert(
          assertedPaths.has(retainedPath),
          `${obligation.id}: retained path is not asserted: ${retainedPath}`,
        )
      }
      const changedSourcePaths = [...assertedPaths]
        .filter(sourcePath => !retainedSourcePaths.includes(sourcePath))
        .sort()
      assert(
        changedSourcePaths.length > 0,
        `${obligation.id}: manual localization has no changed source path`,
      )
      const boundTestTexts = (obligation.testIds ?? []).map(testId => ({
        id: testId,
        text: testContents.get(testId),
      }))
      const testContains = value =>
        boundTestTexts.some(test => test.text.includes(value))
      for (const fragment of obligation.targetFragments) {
        assert(
          testContains(fragment.text),
          `${obligation.id}: bound test does not contain target behavior fragment`,
        )
      }
      for (const assertion of obligation.sourceAssertions ?? []) {
        assert(
          boundTestTexts.some(test =>
            test.text.includes(assertion.path) &&
            test.text.includes(assertion.fragment),
          ),
          `${obligation.id}: bound test does not contain source assertion evidence`,
        )
      }
      for (const removal of sourceRemovals) {
        assert(
          boundTestTexts.some(test =>
            test.text.includes(removal.path) &&
            test.text.includes(removal.fragment),
          ),
          `${obligation.id}: bound test does not contain source removal evidence`,
        )
      }
      manualLocalization = {
        basis: localizationBasis,
        boundary: obligation.localizationBoundary,
        changedSourcePaths,
        retainedSourcePaths: [...retainedSourcePaths].sort(),
        testIds: [...(obligation.testIds ?? [])].sort(),
      }
    }
    obligationWitnesses.push({
      id: obligation.id,
      classification: obligation.classification,
      localizationBasis,
      releaseBullets: obligation.releaseBullets,
      bundleWitnesses,
      sourcePaths: [...new Set(
        [
          ...(obligation.sourceAssertions ?? []).map(assertion => assertion.path),
          ...sourceRemovals.map(removal => removal.path),
        ],
      )].sort(),
      sourceRemovals: sourceRemovals.map(removal => ({
        path: removal.path,
        sha256: removal.sha256,
      })),
      testIds: [...(obligation.testIds ?? [])].sort(),
      ...(manualLocalization === null ? {} : { manualLocalization }),
    })
  }

  for (let bullet = 1; bullet <= obligations.releaseBulletCount; bullet += 1) {
    assert(coveredBullets.has(bullet), `release bullet ${bullet} is not covered`)
  }
  return {
    summary: {
      obligationCount: obligations.obligations.length,
      fragmentCount,
      sourceAssertionCount,
      sourceRemovalCount,
      releaseBulletCount: obligations.releaseBulletCount,
      releaseBulletsCovered: coveredBullets.size,
      testCatalogEntries: testCatalog.size,
      usedTestCatalogEntries: usedTestIds.size,
      classifications,
      localizationBases,
      manualLocalizationCount:
        localizationBases['authenticated-behavior-test'] ?? 0,
      unverifiedObligationCount: obligations.obligations.filter(obligation =>
        obligation.classification === 'external-component' ||
        obligation.classification === 'release-note-unobservable' ||
        obligation.classification === 'generated-runtime-adjacent',
      ).length,
    },
    witnesses: obligationWitnesses,
    testCatalog: [...testCatalog.values()].map(entry => ({
      id: entry.id,
      path: entry.path,
    })),
  }
}

export function buildSemanticCorrespondence({
  attributionDirectory,
  baselinePath,
  changelogPath,
  obligationsPath,
  sourceRoot,
  structuralPath,
  targetPath,
}) {
  for (const [filename, label] of [
    [baselinePath, 'baseline bundle'],
    [changelogPath, 'changelog section'],
    [obligationsPath, 'semantic obligations'],
    [structuralPath, 'structural ledger'],
    [targetPath, 'target bundle'],
  ]) assertRealRegularFile(filename, label)
  const attributionSummaryPath = safeExistingRegularFile(
    attributionDirectory,
    'summary.json',
    'attribution summary',
  )
  const attribution = readJson(attributionSummaryPath, 'attribution summary')
  assert(
    attribution.reportFiles.targetRanges,
    'attribution report has no exhaustive target ranges',
  )
  const sourcesPath = safeReportBasename(
    attributionDirectory,
    attribution.reportFiles.sources.path,
    'attribution sources',
  )
  const partitionsPath = safeReportBasename(
    attributionDirectory,
    attribution.reportFiles.targetPartitions.path,
    'attribution partitions',
  )
  const targetRangesPath = safeReportBasename(
    attributionDirectory,
    attribution.reportFiles.targetRanges.path,
    'attribution target ranges',
  )
  const sources = readCanonicalGzipJsonLines(sourcesPath, 'attribution sources')
  readCanonicalGzipJsonLines(
    partitionsPath,
    'attribution partitions',
  )
  const targetRanges = readCanonicalGzipJsonLines(
    targetRangesPath,
    'attribution target ranges',
  )
  const structural = readCanonicalGzipJson(structuralPath, 'structural ledger')
  const obligations = readJson(obligationsPath, 'semantic obligations')
  const changelogText = fs.readFileSync(changelogPath, 'utf8')
  const baselineBuffer = fs.readFileSync(baselinePath)
  const targetBuffer = fs.readFileSync(targetPath)
  const baselineText = baselineBuffer.toString('utf8')
  const targetText = targetBuffer.toString('utf8')

  assertEqual(
    sha256(baselineBuffer),
    structural.baseline.sha256,
    'structural baseline SHA-256',
  )
  assertEqual(
    sha256(targetBuffer),
    structural.target.sha256,
    'structural target SHA-256',
  )
  assertEqual(
    sha256(targetBuffer),
    attribution.artifacts.targetBundle.sha256,
    'attribution target SHA-256',
  )
  assertEqual(
    targetText.length,
    structural.target.utf16Length,
    'target UTF-16 length',
  )
  verifyAttributionReport({
    reportDirectory: attributionDirectory,
    expectedBaselineSha256: attribution.artifacts.baselineBundle.sha256,
    expectedSummarySha256: sha256(fs.readFileSync(attributionSummaryPath)),
    expectedTargetSha256: sha256(targetBuffer),
  })
  verifyStructuralLedger({
    filename: structuralPath,
    expectedBaselineSha256: sha256(baselineBuffer),
    expectedBytes: fs.statSync(structuralPath).size,
    expectedSha256: sha256(fs.readFileSync(structuralPath)),
    expectedTargetSha256: sha256(targetBuffer),
    expectedTargetTokens: structural.target.tokenCount,
    expectedTargetUnits: structural.target.unitCount,
  })

  const aliases = obligations.sourceAliases ?? {}
  const sourceRecords = sources.map((source, index) => {
    assertEqual(source.sourceIndex, index, `source index ${index}`)
    const relative = normalizedSourcePath(source.source)
    if (relative === null) {
      return {
        index,
        kind: source.source.startsWith('../node_modules/')
          ? 'dependency'
          : source.source.startsWith('../vendor/')
            ? 'vendor'
            : 'generated',
        original: source.source,
        resolved: null,
        baselineStart: source.envelopeStart,
        baselineEnd: source.envelopeEnd,
      }
    }
    return {
      index,
      kind: 'application',
      original: source.source,
      resolved: resolveSourcePath(sourceRoot, relative, aliases),
      baselineStart: source.envelopeStart,
      baselineEnd: source.envelopeEnd,
    }
  })
  const missingApplicationSources = sourceRecords.filter(
    source => source.kind === 'application' && source.resolved === null,
  )
  assertEqual(
    missingApplicationSources.length,
    0,
    'unresolved application source paths',
  )

  const overlaps = overlappingTargetRanges(structural.regions, targetRanges)
  const categories = {}
  const deltaKinds = {}
  const crossClassification = {}
  let tokenTotal = 0
  const regions = structural.regions.map((region, index) => {
    const exactSourceIndices = [...new Set(
      overlaps[index]
        .filter(rangeIndex => targetRanges[rangeIndex].confidence === 'exact')
        .flatMap(rangeIndex => targetRanges[rangeIndex].sourceIndices),
    )].sort((left, right) => left - right)
    const highSourceIndices = [...new Set(
      overlaps[index]
        .filter(rangeIndex => targetRanges[rangeIndex].confidence === 'high')
        .flatMap(rangeIndex => targetRanges[rangeIndex].sourceIndices),
    )]
      .filter(sourceIndex => !exactSourceIndices.includes(sourceIndex))
      .sort((left, right) => left - right)
    const candidateSourceIndices = [...new Set(
      overlaps[index]
        .filter(rangeIndex => targetRanges[rangeIndex].confidence === 'candidate')
        .flatMap(rangeIndex => targetRanges[rangeIndex].sourceIndices),
    )]
      .filter(sourceIndex =>
        !exactSourceIndices.includes(sourceIndex) &&
        !highSourceIndices.includes(sourceIndex),
      )
      .sort((left, right) => left - right)
    const exactCandidates = exactSourceIndices.map(
      sourceIndex => sourceRecords[sourceIndex],
    )
    const uncertainCandidates = candidateSourceIndices.map(
      sourceIndex => sourceRecords[sourceIndex],
    )
    const highCandidates = highSourceIndices.map(
      sourceIndex => sourceRecords[sourceIndex],
    )
    const exactApplication = exactCandidates
      .filter(candidate => candidate.kind === 'application')
      .map(candidate => candidate.resolved)
      .filter(Boolean)
    const exactExternal = exactCandidates.filter(candidate =>
      candidate.kind === 'dependency' || candidate.kind === 'vendor',
    )
    const candidateApplication = uncertainCandidates
      .filter(candidate => candidate.kind === 'application')
      .map(candidate => candidate.resolved)
      .filter(Boolean)
    const candidateExternal = uncertainCandidates.filter(candidate =>
      candidate.kind === 'dependency' || candidate.kind === 'vendor',
    )
    const highApplication = highCandidates
      .filter(candidate => candidate.kind === 'application')
      .map(candidate => candidate.resolved)
      .filter(Boolean)
    const highExternal = highCandidates.filter(candidate =>
      candidate.kind === 'dependency' || candidate.kind === 'vendor',
    )
    let ownership
    if (exactApplication.length > 0 && exactExternal.length > 0) {
      ownership = 'mixed-owned-exact'
    } else if (exactApplication.length > 0) {
      ownership = 'source-owned-exact'
    } else if (exactExternal.length > 0) {
      ownership = 'dependency-owned-exact'
    } else if (highApplication.length > 0 && highExternal.length > 0) {
      ownership = 'mixed-attributed-high'
    } else if (highApplication.length > 0) {
      ownership = 'source-attributed-high'
    } else if (highExternal.length > 0) {
      ownership = 'dependency-attributed-high'
    } else if (candidateApplication.length > 0 && candidateExternal.length > 0) {
      ownership = 'mixed-candidate'
    } else if (candidateApplication.length > 0) {
      ownership = 'source-candidate'
    } else if (candidateExternal.length > 0) {
      ownership = 'dependency-candidate'
    } else {
      ownership = 'generated-boundary'
    }
    assert(CLASSIFICATIONS.has(ownership), `invalid ownership ${ownership}`)
    categories[ownership] = (categories[ownership] ?? 0) + region.target.tokenCount
    deltaKinds[region.classification] =
      (deltaKinds[region.classification] ?? 0) + region.target.tokenCount
    const crossKey = `${region.classification}:${ownership}`
    crossClassification[crossKey] =
      (crossClassification[crossKey] ?? 0) + region.target.tokenCount
    tokenTotal += region.target.tokenCount
    return {
      index,
      start: region.target.start,
      end: region.target.end,
      tokenCount: region.target.tokenCount,
      deltaKind: region.classification,
      ownership,
      exactSourcePaths: [...new Set(exactApplication)].sort(),
      highConfidenceSourcePaths: [...new Set(highApplication)].sort(),
      candidateSourcePaths: [...new Set(candidateApplication)].sort(),
      targetRangeIndices: overlaps[index],
    }
  })
  assertEqual(tokenTotal, structural.target.tokenCount, 'semantic token coverage')

  const sourceTree = summarizeSourceTree(sourceRoot)
  const obligationCoverage = validateObligations({
    baselineText,
    changelogText,
    obligations,
    officialReleaseEvidence: attribution.releaseEvidence.officialChangelog,
    sourceRecords,
    sourceRoot,
    targetRanges,
    targetText,
  })
  const report = {
    schemaVersion: 1,
    kind: 'whole-bundle-source-correspondence',
    claim:
      'Exhaustive generated-unit ownership correspondence plus authenticated ' +
      'behavior obligations and source assertions. Passing focused tests in ' +
      'the source-lineage gate is separately required for the combined ' +
      'source-facing semantic reproduction claim; upstream authored spelling ' +
      'is not claimed byte-identical.',
    inputs: {
      baseline: { path: path.basename(baselinePath), ...evidence(baselinePath) },
      target: { path: path.basename(targetPath), ...evidence(targetPath) },
      attributionSummary: evidence(attributionSummaryPath),
      attributionSources: evidence(sourcesPath),
      attributionPartitions: evidence(partitionsPath),
      attributionTargetRanges: evidence(targetRangesPath),
      structural: evidence(structuralPath),
      obligations: evidence(obligationsPath),
      changelog: evidence(changelogPath),
    },
    sourceTree: publicTreeSummary(sourceTree),
    sourceOwnership: {
      total: sourceRecords.length,
      application: sourceRecords.filter(source => source.kind === 'application').length,
      dependency: sourceRecords.filter(source => source.kind === 'dependency').length,
      vendor: sourceRecords.filter(source => source.kind === 'vendor').length,
      generated: sourceRecords.filter(source => source.kind === 'generated').length,
      unresolvedApplication: 0,
    },
    coverage: {
      regions: regions.length,
      targetTokens: structural.target.tokenCount,
      accountedTokens: tokenTotal,
      unclassifiedTokens: 0,
      ownershipTokens: categories,
      deltaTokens: deltaKinds,
      deltaOwnershipTokens: crossClassification,
      obligations: obligationCoverage.summary,
    },
    sourceRecords,
    regions,
    obligationWitnesses: obligationCoverage.witnesses,
    testCatalog: obligationCoverage.testCatalog,
  }
  return report
}

export function encodeSemanticCorrespondence(report) {
  const json = Buffer.from(`${JSON.stringify(report)}\n`)
  return {
    json,
    compressed: gzipSync(json, { level: 9, mtime: 0 }),
  }
}

export function semanticCorrespondenceSummary(report, compressed) {
  return {
    schemaVersion: 1,
    kind: report.kind,
    claim: report.claim,
    report: {
      path: 'semantic-correspondence.json.gz',
      bytes: compressed.length,
      sha256: sha256(compressed),
    },
    inputs: report.inputs,
    sourceTree: report.sourceTree,
    sourceOwnership: report.sourceOwnership,
    coverage: report.coverage,
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2))
  const required = [
    'attribution',
    'baseline',
    'changelog',
    'obligations',
    'output',
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
  const report = buildSemanticCorrespondence({
    attributionDirectory: path.resolve(args.attribution),
    baselinePath: path.resolve(args.baseline),
    changelogPath: path.resolve(args.changelog),
    obligationsPath: path.resolve(args.obligations),
    sourceRoot: path.resolve(args['source-root']),
    structuralPath: path.resolve(args.structural),
    targetPath: path.resolve(args.target),
  })
  const encoded = encodeSemanticCorrespondence(report)
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true })
  fs.writeFileSync(path.resolve(args.output), encoded.compressed)
  const summary = semanticCorrespondenceSummary(report, encoded.compressed)
  fs.writeFileSync(path.resolve(args.summary), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(JSON.stringify(summary, null, 2))
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
