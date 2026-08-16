#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
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

function gitBlobSha1(value) {
  return crypto
    .createHash('sha1')
    .update(`blob ${value.length}\0`)
    .update(value)
    .digest('hex')
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

export function authenticatedReleaseEvidence({
  attribution,
  changelogPath,
  changelogText,
  obligations,
  sourceRoot,
}) {
  const absenceDeclared = obligations.officialReleaseAbsenceEvidence
  const inherited = attribution.releaseEvidence?.officialChangelog
  if (inherited !== undefined) {
    assert(
      absenceDeclared === undefined,
      'inherited official release evidence conflicts with declared absence',
    )
    return { official: inherited, inputs: {} }
  }

  const repositoryRoot = path.dirname(sourceRoot)
  const pinnedFile = (record, label) => {
    assert(
      record &&
        typeof record.path === 'string' &&
        record.path.startsWith('recovery/') &&
        Number.isSafeInteger(record.bytes) &&
        record.bytes >= 0 &&
        typeof record.sha256 === 'string' &&
        SHA256_PATTERN.test(record.sha256),
      `${label}: invalid pinned file evidence`,
    )
    const filename = safeExistingRegularFile(repositoryRoot, record.path, label)
    const value = fs.readFileSync(filename)
    assertEqual(value.length, record.bytes, `${label} bytes`)
    assertEqual(sha256(value), record.sha256, `${label} SHA-256`)
    return { filename, value }
  }
  if (absenceDeclared !== undefined) {
    assert(
      obligations.officialReleaseEvidence === undefined,
      'official release presence and absence evidence are mutually exclusive',
    )
    assert(
      absenceDeclared &&
        typeof absenceDeclared === 'object' &&
        !Array.isArray(absenceDeclared),
      'official release absence evidence is invalid',
    )
    assert(
      typeof absenceDeclared.release === 'string' &&
        absenceDeclared.release.length > 0,
      'absent official release version is invalid',
    )
    assertEqual(
      absenceDeclared.tag,
      `v${absenceDeclared.release}`,
      'absent official release tag',
    )
    assertEqual(
      absenceDeclared.heading,
      `## ${absenceDeclared.release}`,
      'absent official changelog heading',
    )
    assertEqual(
      absenceDeclared.bulletCount,
      0,
      'absent official release bullet count',
    )
    assertEqual(
      JSON.stringify(absenceDeclared.bullets),
      JSON.stringify([]),
      'absent official release bullet inventory',
    )
    const provenanceFile = pinnedFile(
      absenceDeclared.provenance,
      'release provenance',
    )
    const absenceFile = pinnedFile(
      absenceDeclared.absenceArtifact,
      'official release absence',
    )
    const fullFile = pinnedFile(
      absenceDeclared.fullChangelog,
      'absence-audit full changelog',
    )
    const tagRefsFile = pinnedFile(
      absenceDeclared.tagRefs,
      'absence-audit Git tag refs',
    )
    assertEqual(
      path.resolve(absenceFile.filename),
      path.resolve(changelogPath),
      'official release absence path',
    )
    assert(
      absenceFile.value.equals(Buffer.from(changelogText)),
      'official release absence differs from --changelog',
    )
    const provenance = JSON.parse(provenanceFile.value.toString('utf8'))
    const absence = JSON.parse(absenceFile.value.toString('utf8'))
    assertEqual(provenance.schemaVersion, 1, 'release provenance schema')
    assertEqual(
      provenance.release,
      absenceDeclared.release,
      'release provenance version',
    )
    assertEqual(absence.schemaVersion, 1, 'release absence schema')
    assertEqual(
      absence.kind,
      'authenticated-public-release-absence',
      'release absence kind',
    )
    assertEqual(absence.release, absenceDeclared.release, 'release absence version')
    assertEqual(absence.tag?.name, absenceDeclared.tag, 'release absence tag')
    assertEqual(absence.tag?.present, false, 'release absence tag presence')
    assertEqual(
      absence.changelog?.heading,
      absenceDeclared.heading,
      'release absence changelog heading',
    )
    assertEqual(
      absence.changelog?.present,
      false,
      'release absence changelog presence',
    )
    assertEqual(
      absence.changelog?.bulletCount,
      0,
      'release absence changelog bullet count',
    )
    assert(
      typeof absence.nearestPublishedPublicRelease?.before?.tag === 'string' &&
        /^v\d+\.\d+\.\d+$/.test(
          absence.nearestPublishedPublicRelease.before.tag,
        ) &&
        /^[a-f0-9]{40}$/.test(
          absence.nearestPublishedPublicRelease.before.commit ?? '',
        ),
      'release absence previous public tag identity',
    )
    assert(
      typeof absence.nearestPublishedPublicRelease?.after?.tag === 'string' &&
        /^v\d+\.\d+\.\d+$/.test(
          absence.nearestPublishedPublicRelease.after.tag,
        ) &&
        /^[a-f0-9]{40}$/.test(
          absence.nearestPublishedPublicRelease.after.commit ?? '',
        ),
      'release absence next public tag identity',
    )
    assert(
      absence.nearestPublishedPublicRelease.before.tag !==
        absence.nearestPublishedPublicRelease.after.tag,
      'release absence neighbor tags must be distinct',
    )
    assert(
      absence.changelog.fullSnapshot &&
        typeof absence.changelog.fullSnapshot.path === 'string' &&
        Number.isSafeInteger(absence.changelog.fullSnapshot.bytes) &&
        absence.changelog.fullSnapshot.bytes > 0 &&
        SHA256_PATTERN.test(absence.changelog.fullSnapshot.sha256 ?? '') &&
        /^[a-f0-9]{40}$/.test(
          absence.changelog.fullSnapshot.gitBlobSha1 ?? '',
        ),
      'release absence full changelog identity',
    )
    assert(
      absence.tag.refs &&
        typeof absence.tag.refs.path === 'string' &&
        Number.isSafeInteger(absence.tag.refs.bytes) &&
        absence.tag.refs.bytes > 0 &&
        SHA256_PATTERN.test(absence.tag.refs.sha256 ?? ''),
      'release absence tag-ref identity',
    )
    const caseRoot = path.dirname(path.dirname(provenanceFile.filename))
    for (const [filename, label] of [
      [absenceFile.filename, 'release absence'],
      [fullFile.filename, 'absence-audit full changelog'],
      [tagRefsFile.filename, 'absence-audit Git tag refs'],
    ]) {
      assertEqual(
        path.dirname(filename),
        path.join(caseRoot, 'evidence'),
        `${label} same-case evidence directory`,
      )
    }
    const relativeToCase = filename =>
      path.relative(caseRoot, filename).replaceAll('\\', '/')
    assertEqual(
      absence.changelog.fullSnapshot.path,
      relativeToCase(fullFile.filename),
      'release absence full changelog path',
    )
    assertEqual(
      absence.changelog.fullSnapshot.bytes,
      fullFile.value.length,
      'release absence full changelog bytes',
    )
    assertEqual(
      absence.changelog.fullSnapshot.sha256,
      sha256(fullFile.value),
      'release absence full changelog SHA-256',
    )
    assertEqual(
      absence.changelog.fullSnapshot.gitBlobSha1,
      gitBlobSha1(fullFile.value),
      'release absence full changelog Git blob SHA-1',
    )
    const fullText = fullFile.value.toString('utf8')
    const headingLines = fullText
      .split(/\r?\n/)
      .filter(line => line === absenceDeclared.heading)
    assertEqual(
      headingLines.length,
      0,
      'absent official changelog heading count',
    )
    assertEqual(
      absence.changelog.bulletCount,
      0,
      'absent official changelog bullet count',
    )
    assertEqual(
      absence.tag.refs.path,
      relativeToCase(tagRefsFile.filename),
      'release absence tag-ref path',
    )
    assertEqual(
      absence.tag.refs.bytes,
      tagRefsFile.value.length,
      'release absence tag-ref bytes',
    )
    assertEqual(
      absence.tag.refs.sha256,
      sha256(tagRefsFile.value),
      'release absence tag-ref SHA-256',
    )
    const tagRefText = tagRefsFile.value.toString('utf8')
    assert(tagRefText.endsWith('\n'), 'release tag refs need trailing newline')
    const tagRefLines = tagRefText.split('\n').filter(Boolean)
    assert(tagRefLines.length > 0, 'release tag refs are empty')
    assertEqual(
      JSON.stringify(tagRefLines),
      JSON.stringify([...tagRefLines].sort()),
      'release tag refs canonical order',
    )
    assertEqual(
      new Set(tagRefLines).size,
      tagRefLines.length,
      'release tag refs are unique',
    )
    const refs = new Map()
    for (const line of tagRefLines) {
      const match = /^([a-f0-9]{40})\t(refs\/tags\/[^\s]+)$/.exec(line)
      assert(match, `invalid release tag ref: ${line}`)
      refs.set(match[2], match[1])
    }
    const targetRef = `refs/tags/${absenceDeclared.tag}`
    assertEqual(refs.has(targetRef), false, 'absent official Git tag direct ref')
    assertEqual(
      refs.has(`${targetRef}^{}`),
      false,
      'absent official Git tag peeled ref',
    )
    const commitAtTag = tag => {
      const ref = `refs/tags/${tag}`
      return refs.get(`${ref}^{}`) ?? refs.get(ref)
    }
    for (const [position, record] of Object.entries(
      absence.nearestPublishedPublicRelease,
    )) {
      assertEqual(
        commitAtTag(record.tag),
        record.commit,
        `release absence ${position} public tag ref`,
      )
    }
    assertEqual(
      provenance.publicReleaseAbsence?.path,
        relativeToCase(absenceFile.filename),
      'release provenance absence path',
    )
    assertEqual(
      provenance.publicReleaseAbsence?.bytes,
      absenceFile.value.length,
      'release provenance absence bytes',
    )
    assertEqual(
      provenance.publicReleaseAbsence?.sha256,
      sha256(absenceFile.value),
      'release provenance absence SHA-256',
    )
    for (const [key, expected] of [
      ['tag', {
        name: absenceDeclared.tag,
        present: false,
        refs: {
          path: relativeToCase(tagRefsFile.filename),
          bytes: tagRefsFile.value.length,
          sha256: sha256(tagRefsFile.value),
        },
      }],
      ['changelog', {
        heading: absenceDeclared.heading,
        present: false,
        bulletCount: 0,
        fullSnapshot: {
          path: relativeToCase(fullFile.filename),
          bytes: fullFile.value.length,
          sha256: sha256(fullFile.value),
          gitBlobSha1: gitBlobSha1(fullFile.value),
        },
      }],
    ]) {
      assertEqual(
        JSON.stringify(provenance.publicReleaseAbsence?.[key]),
        JSON.stringify(expected),
        `release provenance absence ${key}`,
      )
    }
    return {
      official: {
        kind: 'authenticated-public-release-absence',
        section: absenceDeclared.release,
        bulletCount: 0,
        bullets: [],
        tag: absenceDeclared.tag,
        heading: absenceDeclared.heading,
        absenceSha256: sha256(absenceFile.value),
      },
      inputs: {
        releaseProvenance: evidence(provenanceFile.filename),
        officialReleaseAbsence: evidence(absenceFile.filename),
        absenceAuditFullChangelog: evidence(fullFile.filename),
        absenceAuditGitTagRefs: evidence(tagRefsFile.filename),
      },
    }
  }

  const declared = obligations.officialReleaseEvidence
  assert(
    declared && typeof declared === 'object' && !Array.isArray(declared),
    'release evidence is absent from both attribution and obligations',
  )
  const provenanceFile = pinnedFile(
    declared.provenance,
    'release provenance',
  )
  const fullFile = pinnedFile(
    declared.fullChangelog,
    'full official changelog',
  )
  const sectionFile = pinnedFile(
    declared.sectionArtifact,
    'official changelog section',
  )
  assertEqual(
    path.resolve(sectionFile.filename),
    path.resolve(changelogPath),
    'official changelog section path',
  )
  assert(
    sectionFile.value.equals(Buffer.from(changelogText)),
    'official changelog section differs from --changelog',
  )

  const provenance = JSON.parse(provenanceFile.value.toString('utf8'))
  assertEqual(provenance.schemaVersion, 1, 'release provenance schema')
  assert(
    typeof declared.section === 'string' && declared.section.length > 0,
    'official release section is absent',
  )
  assert(
    Number.isSafeInteger(declared.bulletCount) && declared.bulletCount > 0,
    'official release bullet count is invalid',
  )
  assert(
    Array.isArray(declared.bullets) &&
      declared.bullets.length === declared.bulletCount &&
      declared.bullets.every(
        bullet => typeof bullet === 'string' && bullet.length > 0,
      ),
    'official release bullet inventory is invalid',
  )
  assertEqual(provenance.release, declared.section, 'release provenance version')
  assertEqual(
    provenance.git?.tag,
    `v${declared.section}`,
    'release provenance Git tag',
  )
  assert(
    /^[a-f0-9]{40}$/.test(provenance.git?.commit ?? ''),
    'release provenance Git commit',
  )
  assertEqual(
    provenance.changelog?.fullBytes,
    declared.fullChangelog.bytes,
    'provenance full changelog bytes',
  )
  assertEqual(
    provenance.changelog?.fullSha256,
    declared.fullChangelog.sha256,
    'provenance full changelog SHA-256',
  )
  assertEqual(
    provenance.changelog?.fullGitBlobSha1,
    gitBlobSha1(fullFile.value),
    'provenance full changelog Git blob SHA-1',
  )
  assertEqual(
    provenance.changelog?.sectionBytes,
    declared.sectionArtifact.bytes,
    'provenance changelog section bytes',
  )
  assertEqual(
    provenance.changelog?.sectionSha256,
    declared.sectionArtifact.sha256,
    'provenance changelog section SHA-256',
  )
  assertEqual(
    provenance.changelog?.bulletCount,
    declared.bulletCount,
    'provenance release bullet count',
  )
  const sectionParts = relativeParts(
    provenance.changelog.sectionPath,
    'provenance changelog section path',
  )
  const fullParts = relativeParts(
    provenance.changelog.fullPath,
    'provenance full changelog path',
  )
  let caseRoot = sectionFile.filename
  for (let index = 0; index < sectionParts.length; index += 1) {
    caseRoot = path.dirname(caseRoot)
  }
  assertEqual(
    path.resolve(sectionFile.filename),
    path.join(caseRoot, ...sectionParts),
    'release section case-root binding',
  )
  assertEqual(
    path.resolve(fullFile.filename),
    path.join(caseRoot, ...fullParts),
    'full changelog case-root binding',
  )
  assertEqual(
    path.resolve(provenanceFile.filename),
    path.join(caseRoot, 'evidence/provenance.json'),
    'release provenance case-root binding',
  )

  const sectionLines = changelogText.split('\n')
  assertEqual(sectionLines.at(-1), '', 'official section trailing newline')
  assertEqual(
    sectionLines[0],
    `## ${declared.section}`,
    'official section heading',
  )
  assertEqual(sectionLines[1], '', 'official section heading separator')
  const contentLines = sectionLines.slice(2, -1).filter(line => line !== '')
  assert(
    contentLines.every(line => line.startsWith('- ')),
    'official section contains non-bullet content',
  )
  const bullets = contentLines.map(line => line.slice(2))
  assertEqual(bullets.length, declared.bulletCount, 'official section bullet count')
  assertEqual(
    JSON.stringify(bullets),
    JSON.stringify(declared.bullets),
    'official section exact bullets',
  )
  assertEqual(
    countOccurrences(fullFile.value.toString('utf8'), changelogText),
    1,
    'official section containment in full changelog',
  )
  const fullChangelogText = fullFile.value.toString('utf8')
  const headings = [...fullChangelogText.matchAll(/^## .+$/gm)]
  const releaseHeadings = headings.filter(
    match => match[0] === `## ${declared.section}`,
  )
  assertEqual(
    releaseHeadings.length,
    1,
    'official release heading count in full changelog',
  )
  const releaseStart = releaseHeadings[0].index
  const nextHeading = headings.find(match => match.index > releaseStart)
  const extractedSection = fullChangelogText.slice(
    releaseStart,
    nextHeading?.index ?? fullChangelogText.length,
  )
  assertEqual(
    extractedSection,
    changelogText,
    'official heading-delimited section bytes',
  )
  for (const [index, bullet] of bullets.entries()) {
    assertEqual(
      countOccurrences(fullChangelogText, bullet),
      1,
      `official release bullet ${index + 1} full changelog count`,
    )
  }

  return {
    official: {
      bytes: declared.fullChangelog.bytes,
      sha256: declared.fullChangelog.sha256,
      section: declared.section,
      bulletCount: declared.bulletCount,
      bullets,
    },
    inputs: {
      releaseProvenance: evidence(provenanceFile.filename),
      officialChangelog: evidence(fullFile.filename),
      officialChangelogSection: evidence(sectionFile.filename),
    },
  }
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
      obligations.releaseBulletCount >= 0,
    'releaseBulletCount must be a non-negative integer',
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
  if (obligations.releaseBulletCount === 0) {
    assertEqual(
      officialReleaseEvidence.kind,
      'authenticated-public-release-absence',
      'zero-bullet release evidence kind',
    )
  }
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
  const testEvidence = new Map()
  const directEvidenceMetadata = obligations.directEvidenceCatalog ?? null
  let directEvidenceRows = new Map()
  const usedDirectEvidenceRows = new Set()
  if (directEvidenceMetadata !== null) {
    assert(
      typeof directEvidenceMetadata.path === 'string' &&
        directEvidenceMetadata.path.startsWith('recovery/'),
      'direct evidence catalog path is unsafe',
    )
    const directEvidenceFilename = safeExistingRegularFile(
      path.dirname(sourceRoot),
      directEvidenceMetadata.path,
      'direct evidence catalog',
    )
    const directEvidenceValue = fs.readFileSync(directEvidenceFilename)
    assertEqual(
      directEvidenceValue.length,
      directEvidenceMetadata.bytes,
      'direct evidence catalog bytes',
    )
    assertEqual(
      sha256(directEvidenceValue),
      directEvidenceMetadata.sha256,
      'direct evidence catalog SHA-256',
    )
    const parsed = JSON.parse(directEvidenceValue.toString('utf8'))
    assert(
      Array.isArray(parsed.rows) &&
        parsed.rows.length === directEvidenceMetadata.rowCount,
      'direct evidence row count',
    )
    directEvidenceRows = new Map(parsed.rows.map(row => [row.id, row]))
    assertEqual(
      directEvidenceRows.size,
      parsed.rows.length,
      'unique direct evidence row IDs',
    )
    assertEqual(
      sha256(Buffer.from(parsed.rows.map(row => row.id).join('\n') + '\n')),
      directEvidenceMetadata.rowIdsSha256,
      'direct evidence row-ID SHA-256',
    )
  }
  const decodedCatalogStrings = value => {
    const result = []
    const visit = candidate => {
      if (Array.isArray(candidate)) {
        for (const child of candidate) visit(child)
      } else if (candidate && typeof candidate === 'object') {
        if (
          candidate.encoding === 'base64' &&
          typeof candidate.base64 === 'string'
        ) {
          result.push(Buffer.from(candidate.base64, 'base64').toString('utf8'))
        }
        for (const child of Object.values(candidate)) visit(child)
      } else if (typeof candidate === 'string') {
        result.push(candidate)
      }
    }
    visit(value)
    return result
  }
  const literalArrayFromTest = (source, declaration, label) => {
    const declarationOffset = source.indexOf(`const ${declaration} = [`)
    assert(declarationOffset !== -1, `${label}: missing ${declaration}`)
    const start = source.indexOf('[', declarationOffset)
    let depth = 0
    let quote = null
    let escaped = false
    for (let offset = start; offset < source.length; offset += 1) {
      const character = source[offset]
      if (quote !== null) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = null
        continue
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character
        continue
      }
      if (character === '[') depth += 1
      else if (character === ']' && --depth === 0) {
        return vm.runInNewContext(
          source.slice(start, offset + 1),
          Object.create(null),
        )
      }
    }
    throw new Error(`${label}: unterminated ${declaration}`)
  }
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
    const testSource = value.toString('utf8')
    let authenticatedText = testSource
    const literalArrays = entry.literalArrays ?? []
    assert(
      Array.isArray(literalArrays),
      `${entry.id}: literalArrays must be an array`,
    )
    for (const declaration of literalArrays) {
      assert(
        typeof declaration === 'string' && /^[A-Z][A-Z0-9_]*$/.test(declaration),
        `${entry.id}: invalid literal-array declaration`,
      )
      authenticatedText += `\n${decodedCatalogStrings(
        literalArrayFromTest(testSource, declaration, entry.id),
      ).join('\n')}`
    }
    const evidence = entry.evidence ?? []
    assert(Array.isArray(evidence), `${entry.id}: test evidence must be an array`)
    const evidenceByPath = new Map()
    for (const item of evidence) {
      assert(
        typeof item.path === 'string' && item.path.startsWith('recovery/'),
        `${entry.id}: unsafe test evidence path`,
      )
      const evidenceFilename = safeExistingRegularFile(
        path.dirname(sourceRoot),
        item.path,
        `${entry.id} test evidence`,
      )
      const evidenceValue = fs.readFileSync(evidenceFilename)
      assertEqual(evidenceValue.length, item.bytes, `${entry.id} evidence bytes`)
      assertEqual(sha256(evidenceValue), item.sha256, `${entry.id} evidence SHA-256`)
      assertEqual(
        item.relation,
        'loaded-and-exactly-verified-by-this-test',
        `${entry.id} evidence relation`,
      )
      assert(
        testSource.includes(item.path),
        `${entry.id}: test does not load declared evidence`,
      )
      if (item.testPinsIdentity === true) {
        assert(
          testSource.includes(item.sha256),
          `${entry.id}: test does not pin evidence SHA-256`,
        )
        assert(
          testSource.replaceAll('_', '').includes(String(item.bytes)),
          `${entry.id}: test does not pin evidence bytes`,
        )
      }
      if (item.decodeBase64Fragments === true) {
        const parsed = JSON.parse(evidenceValue.toString('utf8'))
        authenticatedText += `\n${decodedCatalogStrings(parsed).join('\n')}`
      }
      assert(
        !evidenceByPath.has(item.path),
        `${entry.id}: duplicate test evidence path`,
      )
      evidenceByPath.set(item.path, item)
    }
    testCatalog.set(entry.id, entry)
    testContents.set(entry.id, authenticatedText)
    testEvidence.set(entry.id, evidenceByPath)
  }
  const usedTestIds = new Set()
  const obligationWitnesses = []
  let fragmentCount = 0
  let targetAbsenceCount = 0
  let sourceAssertionCount = 0
  let sourceAbsenceCount = 0
  let sourceRemovalCount = 0
  let sourceFileAbsenceCount = 0
  const classifications = {}
  const localizationBases = {}
  let sourceTypeScriptTexts = null

  function allSourceTypeScriptTexts() {
    if (sourceTypeScriptTexts !== null) return sourceTypeScriptTexts
    const values = []
    const queue = [sourceRoot]
    while (queue.length > 0) {
      const directory = queue.shift()
      for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))) {
        const filename = path.join(directory, entry.name)
        const status = fs.lstatSync(filename)
        assert(!status.isSymbolicLink(), `source absence scan crosses symlink: ${filename}`)
        if (status.isDirectory()) queue.push(filename)
        else if (status.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
          values.push(fs.readFileSync(filename, 'utf8'))
        }
      }
    }
    sourceTypeScriptTexts = values
    return values
  }

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
    let boundDirectEvidenceRow = null
    if (obligation.catalogBinding !== undefined) {
      const binding = obligation.catalogBinding
      assert(directEvidenceMetadata !== null, `${obligation.id}: no direct catalog`)
      assertEqual(
        binding.path,
        directEvidenceMetadata.path,
        `${obligation.id}: catalog path`,
      )
      assertEqual(
        binding.bytes,
        directEvidenceMetadata.bytes,
        `${obligation.id}: catalog bytes`,
      )
      assertEqual(
        binding.sha256,
        directEvidenceMetadata.sha256,
        `${obligation.id}: catalog SHA-256`,
      )
      assert(
        typeof binding.rawId === 'string' && binding.rawId.length > 0,
        `${obligation.id}: catalog raw ID`,
      )
      boundDirectEvidenceRow = directEvidenceRows.get(binding.rawId)
      assert(
        boundDirectEvidenceRow !== undefined,
        `${obligation.id}: direct evidence row is absent`,
      )
      assert(
        !usedDirectEvidenceRows.has(binding.rawId),
        `${obligation.id}: direct evidence row is reused`,
      )
      usedDirectEvidenceRows.add(binding.rawId)
      assertEqual(
        boundDirectEvidenceRow.obligationId,
        obligation.id,
        `${obligation.id}: catalog obligation ID`,
      )
      assertEqual(
        binding.kind,
        boundDirectEvidenceRow.evidenceKind,
        `${obligation.id}: direct evidence kind`,
      )
      assertEqual(
        sha256(Buffer.from(JSON.stringify(boundDirectEvidenceRow))),
        binding.rowSha256,
        `${obligation.id}: direct evidence row SHA-256`,
      )
      assert(
        (obligation.testIds ?? []).includes('adjacent'),
        `${obligation.id}: direct evidence test is not bound`,
      )
      const adjacentEvidence = testEvidence.get('adjacent')?.get(binding.path)
      assert(
        adjacentEvidence !== undefined &&
          adjacentEvidence.testPinsIdentity === true,
        `${obligation.id}: direct evidence catalog is not test-pinned`,
      )
      for (const [label, actual, expected] of [
        ['target fragments', obligation.targetFragments, boundDirectEvidenceRow.targetFragments],
        ['target absences', obligation.targetAbsences ?? [], boundDirectEvidenceRow.targetAbsences],
        ['source assertions', obligation.sourceAssertions ?? [], boundDirectEvidenceRow.sourceAssertions],
        ['source absences', obligation.sourceAbsences ?? [], boundDirectEvidenceRow.sourceAbsences],
        ['source file absences', obligation.sourceFileAbsences ?? [], boundDirectEvidenceRow.sourceFileAbsences ?? []],
        ['semantic cluster IDs', obligation.semanticClusterIds ?? [], boundDirectEvidenceRow.semanticClusterIds ?? []],
        ['semantic cluster bindings', obligation.semanticClusterBindings ?? [], boundDirectEvidenceRow.semanticClusterBindings ?? []],
        ['source change support', obligation.sourceChangeSupport ?? null, boundDirectEvidenceRow.sourceChangeSupport ?? null],
        ['related direct clusters', obligation.relatedDirectClusterIds ?? [], boundDirectEvidenceRow.relatedDirectClusterIds ?? []],
      ]) {
        assertEqual(
          JSON.stringify(actual),
          JSON.stringify(expected),
          `${obligation.id}: catalog ${label}`,
        )
      }
    }
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
    const targetAbsences = obligation.targetAbsences ?? []
    assert(
      Array.isArray(targetAbsences),
      `${obligation.id}: targetAbsences must be an array`,
    )
    for (const fragment of targetAbsences) {
      assert(
        typeof fragment.text === 'string' && fragment.text.length > 0,
        `${obligation.id}: target absence text is absent`,
      )
      const bytes = Buffer.from(fragment.text)
      assertEqual(
        bytes.length,
        fragment.bytes,
        `${obligation.id} target absence bytes`,
      )
      assertEqual(
        sha256(bytes),
        fragment.sha256,
        `${obligation.id} target absence SHA-256`,
      )
      assertEqual(
        countOccurrences(baselineText, fragment.text),
        fragment.baselineCount,
        `${obligation.id} baseline target-absence count`,
      )
      assertEqual(
        countOccurrences(targetText, fragment.text),
        fragment.targetCount,
        `${obligation.id} target target-absence count`,
      )
      assertEqual(
        fragment.targetCount,
        0,
        `${obligation.id} target absence must be absent`,
      )
      targetAbsenceCount += 1
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
      if (assertion.bytes !== undefined) {
        assertEqual(
          Buffer.byteLength(assertion.fragment),
          assertion.bytes,
          `${obligation.id} source fragment bytes`,
        )
      }
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
    const sourceAbsences = obligation.sourceAbsences ?? []
    assert(
      Array.isArray(sourceAbsences),
      `${obligation.id}: sourceAbsences must be an array`,
    )
    for (const absence of sourceAbsences) {
      assertEqual(
        absence.scope,
        'src/**/*.{ts,tsx}',
        `${obligation.id}: source absence scope`,
      )
      assert(
        typeof absence.fragment === 'string' && absence.fragment.length > 0,
        `${obligation.id}: source absence fragment is absent`,
      )
      assertEqual(
        Buffer.byteLength(absence.fragment),
        absence.bytes,
        `${obligation.id} source absence bytes`,
      )
      assertEqual(
        sha256(Buffer.from(absence.fragment)),
        absence.sha256,
        `${obligation.id} source absence SHA-256`,
      )
      const actualCount = allSourceTypeScriptTexts().reduce(
        (sum, text) => sum + countOccurrences(text, absence.fragment),
        0,
      )
      assertEqual(
        actualCount,
        absence.count,
        `${obligation.id} source absence count`,
      )
      assertEqual(absence.count, 0, `${obligation.id}: source absence must be absent`)
      sourceAbsenceCount += 1
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
    const sourceFileAbsences = obligation.sourceFileAbsences ?? []
    assert(
      Array.isArray(sourceFileAbsences),
      `${obligation.id}: sourceFileAbsences must be an array`,
    )
    for (const absence of sourceFileAbsences) {
      assert(
        typeof absence.path === 'string' && absence.path.startsWith('src/'),
        `${obligation.id}: unsafe deleted source path`,
      )
      const filename = path.resolve(path.dirname(sourceRoot), absence.path)
      assert(
        filename.startsWith(`${path.resolve(sourceRoot)}${path.sep}`),
        `${obligation.id}: deleted source path escapes src`,
      )
      assert(
        !fs.existsSync(filename),
        `${obligation.id}: deleted source path still exists`,
      )
      assert(
        Number.isInteger(absence.baseBytes) && absence.baseBytes > 0,
        `${obligation.id}: deleted source base byte length`,
      )
      assert(
        typeof absence.baseSha256 === 'string' &&
          SHA256_PATTERN.test(absence.baseSha256),
        `${obligation.id}: deleted source base SHA-256`,
      )
      sourceFileAbsenceCount += 1
    }
    if (localizationBasis !== 'authenticated-behavior-test') {
      assert(
        sourceRemovals.length === 0 && sourceFileAbsences.length === 0,
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
        obligation.classification === 'source-localized-adjacent' ||
          obligation.classification === 'source-localized-inherited',
        `${obligation.id}: manual localization classification is invalid`,
      )
      if (obligation.classification === 'source-localized-adjacent') {
        assert(
          hasAdjacentCountEvidence,
          `${obligation.id}: adjacent manual localization needs count-different behavior evidence`,
        )
      } else {
        assert(
          !hasAdjacentCountEvidence,
          `${obligation.id}: inherited manual localization must preserve witness counts`,
        )
      }
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
        ...sourceFileAbsences.map(absence => absence.path),
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
        changedSourcePaths.length > 0 || retainedSourcePaths.length > 0,
        `${obligation.id}: manual localization has no asserted source boundary`,
      )
      if (boundDirectEvidenceRow === null) {
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
      }
      manualLocalization = {
        basis: localizationBasis,
        boundary: obligation.localizationBoundary,
        changedSourcePaths,
        retainedSourcePaths: [...retainedSourcePaths].sort(),
        testIds: [...(obligation.testIds ?? [])].sort(),
      }
    }
    const semanticClusterIds = obligation.semanticClusterIds ?? []
    if (obligation.semanticClusterIds !== undefined) {
      assert(
        Array.isArray(semanticClusterIds) &&
          semanticClusterIds.length > 0 &&
          semanticClusterIds.every(clusterId =>
            Number.isSafeInteger(clusterId) && clusterId >= 1) &&
          new Set(semanticClusterIds).size === semanticClusterIds.length &&
          JSON.stringify(semanticClusterIds) ===
            JSON.stringify(
              [...semanticClusterIds].sort((left, right) => left - right),
            ),
        `${obligation.id}: invalid semantic cluster IDs`,
      )
    }
    const semanticClusterBindings = obligation.semanticClusterBindings ?? []
    if (obligation.semanticClusterBindings !== undefined) {
      assert(
        Array.isArray(semanticClusterBindings) &&
          semanticClusterBindings.length === semanticClusterIds.length &&
          JSON.stringify(
            semanticClusterBindings.map(binding => binding.clusterId),
          ) === JSON.stringify(semanticClusterIds) &&
          semanticClusterBindings.every(binding =>
            binding &&
              typeof binding === 'object' &&
              !Array.isArray(binding) &&
              binding.targetWitness &&
              typeof binding.targetWitness === 'object' &&
              !Array.isArray(binding.targetWitness) &&
              Array.isArray(binding.sourceWitnesses) &&
              binding.sourceWitnesses.length > 0 &&
              Array.isArray(binding.testIds) &&
              binding.testIds.length > 0),
        `${obligation.id}: invalid semantic cluster bindings`,
      )
    }
    const sourceChangeSupport = obligation.sourceChangeSupport
    const relatedDirectClusterIds = obligation.relatedDirectClusterIds ?? []
    if (sourceChangeSupport !== undefined) {
      const supportWitness = sourceChangeSupport.sourceWitness
      assert(
        obligation.semanticClusterIds === undefined &&
          obligation.semanticClusterBindings === undefined &&
          sourceChangeSupport &&
          typeof sourceChangeSupport === 'object' &&
          !Array.isArray(sourceChangeSupport) &&
          typeof sourceChangeSupport.id === 'string' &&
          /^[a-z0-9][a-z0-9-]*$/.test(sourceChangeSupport.id) &&
          ['owning-direct-prerequisite', 'inherited-residual'].includes(
            sourceChangeSupport.classification,
          ) &&
          typeof sourceChangeSupport.reason === 'string' &&
          sourceChangeSupport.reason.trim() === sourceChangeSupport.reason &&
          sourceChangeSupport.reason.length >= 20 &&
          sourceChangeSupport.clusterId === undefined &&
          sourceChangeSupport.clusterIds === undefined &&
          supportWitness?.reviewed === true &&
          typeof supportWitness.path === 'string' &&
          supportWitness.path.startsWith('src/') &&
          !supportWitness.path.split('/').some(
            part => part === '' || part === '.' || part === '..',
          ) &&
          typeof supportWitness.fragment === 'string' &&
          supportWitness.fragment.length > 0 &&
          Number.isSafeInteger(supportWitness.count) &&
          supportWitness.count > 0 &&
          Array.isArray(supportWitness.matchedSemanticTerms) &&
          supportWitness.matchedSemanticTerms.every(term =>
            typeof term === 'string' && term.length > 0) &&
          new Set(supportWitness.matchedSemanticTerms).size ===
            supportWitness.matchedSemanticTerms.length &&
          JSON.stringify(supportWitness.matchedSemanticTerms) === JSON.stringify(
            [...supportWitness.matchedSemanticTerms].sort(),
          ) &&
          Array.isArray(sourceChangeSupport.testIds) &&
          sourceChangeSupport.testIds.length > 0 &&
          new Set(sourceChangeSupport.testIds).size ===
            sourceChangeSupport.testIds.length &&
          JSON.stringify(sourceChangeSupport.testIds) === JSON.stringify(
            [...sourceChangeSupport.testIds].sort(),
          ) &&
          Array.isArray(relatedDirectClusterIds) &&
          relatedDirectClusterIds.length > 0 &&
          relatedDirectClusterIds.every(clusterId =>
            Number.isSafeInteger(clusterId) && clusterId >= 1) &&
          new Set(relatedDirectClusterIds).size ===
            relatedDirectClusterIds.length &&
          JSON.stringify(relatedDirectClusterIds) === JSON.stringify(
            [...relatedDirectClusterIds].sort((left, right) => left - right),
          ) &&
          JSON.stringify(sourceChangeSupport.relatedDirectClusterIds) ===
            JSON.stringify(relatedDirectClusterIds) &&
          sourceChangeSupport.testIds.every(testId =>
            obligation.testIds.includes(testId)) &&
          obligation.sourceAssertions.some(assertion =>
            assertion.path === supportWitness.path &&
              assertion.fragment === supportWitness.fragment &&
              assertion.count === supportWitness.count),
        `${obligation.id}: invalid source-change support binding`,
      )
    } else {
      assert(
        obligation.relatedDirectClusterIds === undefined,
        `${obligation.id}: related direct clusters need source-change support`,
      )
    }
    obligationWitnesses.push({
      id: obligation.id,
      classification: obligation.classification,
      localizationBasis,
      releaseBullets: obligation.releaseBullets,
      bundleWitnesses,
      targetAbsences: targetAbsences.map(fragment => ({
        sha256: fragment.sha256,
        baselineCount: fragment.baselineCount,
        targetCount: fragment.targetCount,
      })),
      sourcePaths: [...new Set(
        [
          ...(obligation.sourceAssertions ?? []).map(assertion => assertion.path),
          ...sourceRemovals.map(removal => removal.path),
          ...sourceFileAbsences.map(absence => absence.path),
        ],
      )].sort(),
      sourceRemovals: sourceRemovals.map(removal => ({
        path: removal.path,
        sha256: removal.sha256,
      })),
      sourceFileAbsences: sourceFileAbsences.map(absence => ({
        path: absence.path,
        baseBytes: absence.baseBytes,
        baseSha256: absence.baseSha256,
      })),
      sourceAbsences: sourceAbsences.map(absence => ({
        scope: absence.scope,
        sha256: absence.sha256,
        count: absence.count,
      })),
      testIds: [...(obligation.testIds ?? [])].sort(),
      ...(semanticClusterIds.length === 0 ? {} : { semanticClusterIds }),
      ...(semanticClusterBindings.length === 0
        ? {}
        : { semanticClusterBindings }),
      ...(sourceChangeSupport === undefined
        ? {}
        : { sourceChangeSupport, relatedDirectClusterIds }),
      ...(obligation.catalogBinding === undefined
        ? {}
        : {
            catalogBinding: {
              path: obligation.catalogBinding.path,
              sha256: obligation.catalogBinding.sha256,
              rawId: obligation.catalogBinding.rawId,
              rowSha256: obligation.catalogBinding.rowSha256,
            },
          }),
      ...(manualLocalization === null ? {} : { manualLocalization }),
    })
  }

  for (let bullet = 1; bullet <= obligations.releaseBulletCount; bullet += 1) {
    assert(coveredBullets.has(bullet), `release bullet ${bullet} is not covered`)
  }
  if (obligations.releaseBulletCount === 0) {
    assert(
      obligations.obligations.every(
        obligation =>
          obligation.hidden === true && obligation.releaseBullets.length === 0,
      ),
      'zero-bullet releases require every obligation to be hidden',
    )
  }
  if (directEvidenceMetadata !== null) {
    assertEqual(
      usedDirectEvidenceRows.size,
      directEvidenceRows.size,
      'direct evidence rows consumed exactly once',
    )
    assertEqual(
      JSON.stringify([...usedDirectEvidenceRows].sort()),
      JSON.stringify([...directEvidenceRows.keys()].sort()),
      'direct evidence row-ID set consumed exactly once',
    )
  }
  return {
    summary: {
      obligationCount: obligations.obligations.length,
      fragmentCount,
      targetAbsenceCount,
      sourceAssertionCount,
      sourceAbsenceCount,
      sourceRemovalCount,
      sourceFileAbsenceCount,
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
      bytes: entry.bytes,
      sha256: entry.sha256,
      evidence: (entry.evidence ?? []).map(item => ({
        path: item.path,
        bytes: item.bytes,
        sha256: item.sha256,
        relation: item.relation,
      })),
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
  const releaseEvidence = authenticatedReleaseEvidence({
    attribution,
    changelogPath,
    changelogText,
    obligations,
    sourceRoot,
  })
  const obligationCoverage = validateObligations({
    baselineText,
    changelogText,
    obligations,
    officialReleaseEvidence: releaseEvidence.official,
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
      ...releaseEvidence.inputs,
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
