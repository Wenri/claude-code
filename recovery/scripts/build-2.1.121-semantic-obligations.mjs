#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.120-to-2.1.121')
const semanticRoot = path.join(caseRoot, 'semantic')
const outputPath = path.join(semanticRoot, 'obligations.json')
const directEvidencePath = path.join(semanticRoot, 'direct-evidence.json')
const directTestPath = path.join(
  repo,
  'recovery/test/recovery-2.1.121-direct-evidence.test.mjs',
)
const focusedTestNames = [
  'autocompact-rapid-refill',
  'compaction-spinner',
  'console-platform-wizards',
  'daemon-service',
  'dialog-overflow',
  'dream-skill',
  'dynamic-loop',
  'feedback-surface',
  'hidden-obligations',
  'inherited-active-core',
  'inherited-runtime-residuals',
  'lower-runtime-boundaries',
  'mcp-refresh-repl-copy',
  'official-owned-cluster',
  'official-residual-cluster',
  'official-runtime-settings-cluster',
  'powershell-pipeline-paths',
  'powerup-team-onboarding',
  'query-terminal-schema',
  'reactive-runtime-gaps',
  'remote-control-boundary',
  'remote-ux-and-branch',
  'removed-gates',
  'residual-dream-hook-defer',
  'retained-runtime-surfaces',
  'runtime-hardening',
  'sdk-control-runtime',
  'settings-auth-runtime',
  'subscription-upsell-gates',
  'usage-attribution',
  'warm-resume',
  'worktree-baseline',
]
const focusedTestPaths = Object.fromEntries(
  focusedTestNames.map(name => [
    name,
    path.join(repo, 'recovery/test', `recovery-2.1.121-${name}.test.mjs`),
  ]),
)
const changelogPath = path.join(caseRoot, 'evidence/CHANGELOG-2.1.121.md')
const sourcePathsPath = path.join(
  caseRoot,
  'recovered/source-freeze/source-paths.txt',
)
const baseCommit = '6801ead984ba2c3df02bd092ad8b93df096ed8c1'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(focusedTestNames.length === 32, 'frozen focused test total')
assert(
  new Set(focusedTestNames).size === focusedTestNames.length,
  'unique frozen focused test names',
)
for (const [name, filename] of Object.entries(focusedTestPaths)) {
  const status = fs.lstatSync(filename)
  assert(
    status.isFile() && !status.isSymbolicLink(),
    `frozen focused test must be a regular file: ${name}`,
  )
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
assert(directEvidence.release === '2.1.121', 'direct evidence release')
assert(directEvidence.rows.length === directEvidence.rowCount, 'direct rows')
assert(new Set(directIds).size === directIds.length, 'unique direct row IDs')
assert(bulletTexts.length === 39, 'official changelog bullet count')

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
  const assertedPaths = new Set([
    ...row.sourceAssertions.map(entry => entry.path),
    ...removals.map(entry => entry.path),
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
    ...(row.category === 'official' ? {} : { hidden: true }),
    rationale: `${row.id}: ${row.rationale}`,
    targetFragments: row.targetFragments,
    ...(row.targetAbsences.length > 0
      ? { targetAbsences: row.targetAbsences }
      : {}),
    sourceAssertions: row.sourceAssertions,
    sourceAbsences: row.sourceAbsences,
    ...(removals.length > 0 ? { sourceRemovals: removals } : {}),
    testIds: ['adjacent', ...(row.focusedTests ?? [])],
    catalogBinding: {
      ...directEvidenceMetadata,
      rawId: row.id,
      rowSha256: sha256(Buffer.from(JSON.stringify(row))),
      kind: row.evidenceKind,
    },
    localizationBasis: 'authenticated-behavior-test',
    localizationBoundary:
      'The pinned direct-evidence test loads this exact catalog identity and verifies this row’s authenticated adjacent-bundle counts, exact source fragment hashes and counts, and row-scoped source absences.',
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
  obligations.filter(value => value.releaseBullets.length === 1).length === 39,
  'official obligation total',
)
assert(
  obligations.every(value => value.classification.startsWith('source-localized-')),
  'all obligations source localized',
)

const output = {
  schemaVersion: 1,
  releaseBulletCount: 39,
  releaseBulletEvidence: bulletTexts.map((text, index) => ({
    number: index + 1,
    text,
    sha256: sha256(Buffer.from(text)),
  })),
  sourceAliases: {
    'src/commands/advisor.ts': 'src/commands/advisor/advisor.tsx',
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
assert(output.testCatalog.length === 33, 'frozen semantic test catalog total')
assert(
  obligations.every(row => row.testIds.every(id => catalogTestIds.has(id))),
  'every obligation test binding resolves to the frozen catalog',
)
assert(
  [...catalogTestIds].every(id => usedTestIds.has(id)),
  'every focused 2.1.121 suite is consumed by at least one obligation',
)

fs.mkdirSync(semanticRoot, { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
const value = fs.readFileSync(outputPath)
console.log(
  JSON.stringify({
    status: '2.1.121-semantic-obligations-built',
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
