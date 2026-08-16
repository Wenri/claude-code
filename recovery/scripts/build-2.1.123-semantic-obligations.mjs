#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.122-to-2.1.123')
const semanticRoot = path.join(caseRoot, 'semantic')
const outputPath = path.join(semanticRoot, 'obligations.json')
const directEvidencePath = path.join(semanticRoot, 'direct-evidence.json')
const directTestPath = path.join(
  repo,
  'recovery/test/recovery-2.1.123-direct-evidence.test.mjs',
)
const focusedTestPaths = Object.fromEntries(
  fs
    .readdirSync(path.join(repo, 'recovery/test'))
    .filter(
      name =>
        /^recovery-2\.1\.123-.*\.test\.mjs$/.test(name) &&
        name !== 'recovery-2.1.123-direct-evidence.test.mjs',
    )
    .sort()
    .map(name => [
      name
        .replace(/^recovery-2\.1\.123-/, '')
        .replace(/\.test\.mjs$/, ''),
      path.join(repo, 'recovery/test', name),
    ]),
)
if (
  JSON.stringify(Object.keys(focusedTestPaths)) !==
  JSON.stringify(['oauth-beta-disable-experimental', 'semantic-delta'])
) {
  throw new Error('focused tests must be exactly OAuth beta plus semantic delta')
}
const changelogPath = path.join(caseRoot, 'evidence/CHANGELOG-2.1.123.md')
const sourcePathsPath = path.join(
  caseRoot,
  'recovered/source-freeze/source-paths.txt',
)
const baseCommit = 'c30cece4b85c84cd9e92ca708c96d1cd3f8f6b87'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function metadata(filename) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(repo, filename),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function changedSourcePaths() {
  if (fs.existsSync(sourcePathsPath)) {
    const lines = fs
      .readFileSync(sourcePathsPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
    return new Set(lines.map(line => line.split('\t').at(-1)))
  }
  const value = execFileSync(
    'git',
    ['diff', '--name-only', `${baseCommit}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
  return new Set(value.trim().split('\n').filter(Boolean))
}

const directEvidence = JSON.parse(fs.readFileSync(directEvidencePath, 'utf8'))
const directEvidenceMetadata = metadata(directEvidencePath)
const changedPaths = changedSourcePaths()
const directIds = directEvidence.rows.map(row => row.id)
const bulletTexts = fs
  .readFileSync(changelogPath, 'utf8')
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))

assert(directEvidence.schemaVersion === 1, 'direct evidence schema')
assert(directEvidence.release === '2.1.123', 'direct evidence release')
assert(directEvidence.rows.length === directEvidence.rowCount, 'direct rows')
assert(new Set(directIds).size === directIds.length, 'unique direct row IDs')
assert(bulletTexts.length === 1, 'official changelog bullet count')
assert(
  JSON.stringify(directEvidence.categoryCounts) ===
    JSON.stringify({ official: 1 }),
  'exact direct-evidence category partition',
)
assert(directEvidence.changedSourcePathCount === 1, 'one changed source path')
assert(directEvidence.rowCount === 1, 'one direct evidence row')

const testMetadata = metadata(directTestPath)
const testSource = fs.readFileSync(directTestPath, 'utf8')
assert(
  testSource.includes(directEvidenceMetadata.sha256),
  'direct test must pin the direct catalog SHA-256',
)
assert(
  testSource.replaceAll('_', '').includes(String(directEvidenceMetadata.bytes)),
  'direct test must pin the direct catalog byte length',
)

function sourceRemovals(row) {
  return row.sourcePathAbsences.flatMap(absence =>
    absence.paths.map(sourcePath => ({
      path: sourcePath,
      fragment: absence.fragment,
      sha256: absence.sha256,
    })),
  )
}

function obligation(row) {
  const adjacent = row.targetFragments.some(
    fragment => fragment.baselineCount !== fragment.targetCount,
  )
  const removals = sourceRemovals(row)
  const fileAbsences = row.sourceFileAbsences ?? []
  const assertedPaths = new Set([
    ...row.sourceAssertions.map(entry => entry.path),
    ...removals.map(entry => entry.path),
    ...fileAbsences.map(entry => entry.path),
  ])
  const retainedSourcePaths = [...assertedPaths]
    .filter(sourcePath => !changedPaths.has(sourcePath))
    .sort()
  return {
    id: row.obligationId,
    classification: adjacent
      ? 'source-localized-adjacent'
      : 'source-localized-inherited',
    releaseBullets:
      row.category === 'official' ? [row.releaseBullet] : [],
    category: row.category,
    ...(row.category !== 'official' ? { hidden: true } : {}),
    rationale: `${row.id}: ${row.rationale}`,
    targetFragments: row.targetFragments,
    ...(row.targetAbsences.length > 0
      ? { targetAbsences: row.targetAbsences }
      : {}),
    sourceAssertions: row.sourceAssertions,
    sourceAbsences: row.sourceAbsences ?? [],
    ...(removals.length > 0 ? { sourceRemovals: removals } : {}),
    ...(fileAbsences.length > 0 ? { sourceFileAbsences: fileAbsences } : {}),
    testIds: ['adjacent', ...(row.focusedTests ?? [])],
    catalogBinding: {
      ...directEvidenceMetadata,
      rawId: row.id,
      rowSha256: sha256(Buffer.from(JSON.stringify(row))),
      kind: row.evidenceKind,
    },
    localizationBasis: 'authenticated-behavior-test',
    localizationBoundary:
      'The pinned direct-evidence test loads this exact catalog identity and verifies this row’s authenticated adjacent-bundle counts, exact source fragment hashes and counts, row-scoped fragment absences, and authenticated deleted-file identities.',
    retainedSourcePaths,
  }
}

const obligations = directEvidence.rows.map(obligation)
assert(obligations.length === directEvidence.rowCount, 'obligation total')
assert(
  new Set(obligations.map(value => value.id)).size === obligations.length,
  'unique obligation IDs',
)
assert(
  obligations.filter(value => value.releaseBullets.length === 1).length === 1,
  'official obligation total',
)
assert(
  obligations.every(value =>
    value.category === 'official'
      ? value.releaseBullets.length === 1 && value.hidden !== true
      : value.releaseBullets.length === 0 && value.hidden === true,
  ),
  'official and non-release hidden obligations are an exact partition',
)
assert(
  obligations.every(value => value.classification.startsWith('source-localized-')),
  'all obligations source localized',
)

const output = {
  schemaVersion: 1,
  releaseBulletCount: 1,
  releaseBulletEvidence: bulletTexts.map((text, index) => ({
    number: index + 1,
    text,
    sha256: sha256(Buffer.from(text)),
  })),
  sourceAliases: {
    'src/commands/advisor.ts': 'src/commands/advisor/advisor.tsx',
    'src/utils/autoModeDenials.ts': 'src/context/recentDenials.tsx',
  },
  directEvidenceCatalog: {
    ...directEvidenceMetadata,
    rowCount: directEvidence.rowCount,
    rowIdsSha256: sha256(Buffer.from(`${directIds.join('\n')}\n`)),
  },
  testCatalog: [
    {
      id: 'adjacent',
      ...testMetadata,
      evidence: [
        {
          ...directEvidenceMetadata,
          rowCount: directEvidence.rowCount,
          testPinsIdentity: true,
          relation: 'loaded-and-exactly-verified-by-this-test',
        },
      ],
    },
    ...Object.entries(focusedTestPaths).map(([id, filename]) => ({
      id,
      ...metadata(filename),
    })),
  ],
  obligations,
}

const catalogTestIds = new Set(output.testCatalog.map(row => row.id))
const usedTestIds = new Set(obligations.flatMap(row => row.testIds))
assert(
  obligations.every(row => row.testIds.every(id => catalogTestIds.has(id))),
  'every obligation test binding resolves to the frozen catalog',
)
assert(
  [...catalogTestIds].every(id => usedTestIds.has(id)),
  'every focused 2.1.123 suite is consumed by at least one obligation',
)

fs.mkdirSync(semanticRoot, { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
const value = fs.readFileSync(outputPath)
console.log(
  JSON.stringify({
    status: '2.1.123-semantic-obligations-built',
    path: path.relative(repo, outputPath),
    bytes: value.length,
    sha256: sha256(value),
    obligations: obligations.length,
    official: obligations.filter(value => value.releaseBullets.length === 1)
      .length,
    hidden: obligations.filter(value => value.hidden === true).length,
    sourceLocalizedAdjacent: obligations.filter(
      value => value.classification === 'source-localized-adjacent',
    ).length,
    sourceLocalizedInherited: obligations.filter(
      value => value.classification === 'source-localized-inherited',
    ).length,
    sourceRemovals: obligations.reduce(
      (sum, value) => sum + (value.sourceRemovals?.length ?? 0),
      0,
    ),
    sourceBoundary: fs.existsSync(sourcePathsPath)
      ? 'frozen-source-paths'
      : `git-diff-${baseCommit}-to-HEAD`,
  }),
)
