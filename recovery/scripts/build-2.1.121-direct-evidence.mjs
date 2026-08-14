#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.120-to-2.1.121')
const outputPath = path.join(caseRoot, 'semantic/direct-evidence.json')
const specsPath = path.join(repo, 'recovery/2.1.121-direct-evidence-specs.json')
const hiddenPath = path.join(
  repo,
  'recovery/2.1.121-hidden-semantic-inventory.json',
)
const changelogPath = path.join(caseRoot, 'evidence/CHANGELOG-2.1.121.md')
const baselinePath =
  process.env.CLAUDE_CODE_2_1_120_BUNDLE ??
  '/tmp/claude-21121-acquire.EX9rBZ/artifacts/2.1.120-linux-x64/cli.inner.js'
const targetPath =
  process.env.CLAUDE_CODE_2_1_121_BUNDLE ??
  '/tmp/claude-21121-acquire.EX9rBZ/artifacts/2.1.121-linux-x64/cli.inner.js'
const baseRevision = '6801ead984ba2c3df02bd092ad8b93df096ed8c1'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  assert(fragment.length > 0, 'cannot count an empty fragment')
  let count = 0
  let offset = 0
  while ((offset = contents.indexOf(fragment, offset)) !== -1) {
    count += 1
    offset += fragment.length
  }
  return count
}

function metadata(filename) {
  const value = fs.readFileSync(filename)
  return {
    path: path.relative(repo, filename).replaceAll('\\', '/'),
    bytes: value.length,
    sha256: sha256(value),
  }
}

function bundleRecord(text, baseline, target) {
  const value = Buffer.from(text)
  return {
    text,
    bytes: value.length,
    sha256: sha256(value),
    baselineCount: occurrences(baseline, text),
    targetCount: occurrences(target, text),
  }
}

function sourceRecord(assertion) {
  assert(
    typeof assertion.path === 'string' && assertion.path.startsWith('src/'),
    `unsafe source assertion path: ${assertion.path}`,
  )
  assert(
    typeof assertion.fragment === 'string' && assertion.fragment.length > 0,
    `${assertion.path}: empty source fragment`,
  )
  const source = fs.readFileSync(path.join(repo, assertion.path), 'utf8')
  const value = Buffer.from(assertion.fragment)
  const count = occurrences(source, assertion.fragment)
  assert(count > 0, `${assertion.path}: absent source fragment: ${assertion.fragment}`)
  return {
    path: assertion.path,
    fragment: assertion.fragment,
    bytes: value.length,
    sha256: sha256(value),
    count,
  }
}

function sourcePathAbsenceRecord(absence) {
  assert(
    Array.isArray(absence.paths) && absence.paths.length > 0,
    `source absence has no paths: ${absence.fragment}`,
  )
  const paths = [...new Set(absence.paths)].sort()
  assert(paths.length === absence.paths.length, 'duplicate source-absence path')
  const count = paths.reduce(
    (sum, sourcePath) =>
      sum +
      occurrences(
        fs.readFileSync(path.join(repo, sourcePath), 'utf8'),
        absence.fragment,
      ),
    0,
  )
  assert(count === 0, `source absence is present: ${absence.fragment}`)
  return {
    paths,
    fragment: absence.fragment,
    bytes: Buffer.byteLength(absence.fragment),
    sha256: sha256(Buffer.from(absence.fragment)),
    count,
  }
}

function changedSourcePaths() {
  return execFileSync(
    'git',
    ['diff', '--name-only', `${baseRevision}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort()
}

const specsBytes = fs.readFileSync(specsPath)
const specs = JSON.parse(specsBytes)
const hidden = JSON.parse(fs.readFileSync(hiddenPath, 'utf8'))
const changelog = fs
  .readFileSync(changelogPath, 'utf8')
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))
const baselineBytes = fs.readFileSync(baselinePath)
const targetBytes = fs.readFileSync(targetPath)
const baseline = baselineBytes.toString('utf8')
const target = targetBytes.toString('utf8')

assert(specs.schemaVersion === 1, 'direct spec schema')
assert(specs.case === '2.1.120-to-2.1.121', 'direct spec case')
assert(specs.release === '2.1.121', 'direct spec release')
assert(specs.complete === true, 'direct spec is still provisional')
assert(changelog.length === 39, 'official changelog bullet count')
assert(hidden.obligations.length === 13, 'hidden inventory row count')
assert(baselineBytes.length === 13_784_743, 'baseline byte length')
assert(
  sha256(baselineBytes) ===
    'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  'baseline SHA-256',
)
assert(targetBytes.length === 13_908_188, 'target byte length')
assert(
  sha256(targetBytes) ===
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  'target SHA-256',
)

const focusedTestIds = new Set(
  fs
    .readdirSync(path.join(repo, 'recovery/test'))
    .filter(
      name =>
        /^recovery-2\.1\.121-.*\.test\.mjs$/.test(name) &&
        name !== 'recovery-2.1.121-direct-evidence.test.mjs',
    )
    .map(name =>
      name
        .replace(/^recovery-2\.1\.121-/, '')
        .replace(/\.test\.mjs$/, ''),
    ),
)
const preflightFailures = []
for (const spec of specs.rows) {
  for (const assertion of spec.sourceAssertions ?? []) {
    const filename = path.join(repo, assertion.path)
    if (!fs.existsSync(filename)) {
      preflightFailures.push(`${spec.id}: missing source path ${assertion.path}`)
      continue
    }
    if (!fs.readFileSync(filename, 'utf8').includes(assertion.fragment)) {
      preflightFailures.push(
        `${spec.id}: ${assertion.path} lacks ${JSON.stringify(assertion.fragment)}`,
      )
    }
  }
  for (const id of spec.focusedTests ?? []) {
    if (!focusedTestIds.has(id)) {
      preflightFailures.push(`${spec.id}: missing focused test ${id}`)
    }
  }
  for (const fragment of spec.targetFragments ?? []) {
    if (!target.includes(fragment) && !baseline.includes(fragment)) {
      preflightFailures.push(
        `${spec.id}: bundle fragment absent from both artifacts ${JSON.stringify(fragment)}`,
      )
    }
  }
}
assert(
  preflightFailures.length === 0,
  `direct-evidence preflight failed:\n${preflightFailures.join('\n')}`,
)
const hiddenTitles = new Map(hidden.obligations.map(row => [row.id, row.title]))
const expectedOfficial = Array.from(
  { length: 39 },
  (_, index) => `B${String(index + 1).padStart(2, '0')}`,
)
const expectedHidden = Array.from(
  { length: 13 },
  (_, index) => `H${String(index + 1).padStart(2, '0')}`,
)
assert(
  new Set(specs.rows.map(row => row.id)).size === specs.rows.length,
  'direct spec IDs are unique',
)
assert(
  JSON.stringify(
    specs.rows.filter(row => row.category === 'official').map(row => row.id),
  ) === JSON.stringify(expectedOfficial),
  'official specs must be ordered B01-B39',
)
assert(
  JSON.stringify(
    specs.rows.filter(row => row.category === 'hidden').map(row => row.id),
  ) === JSON.stringify(expectedHidden),
  'hidden specs must be ordered H01-H13',
)

const rows = specs.rows.map(spec => {
  assert(Array.isArray(spec.targetFragments) && spec.targetFragments.length > 0,
    `${spec.id}: no bundle witness`)
  assert(Array.isArray(spec.sourceAssertions) && spec.sourceAssertions.length > 0,
    `${spec.id}: no source witness`)
  assert(Array.isArray(spec.focusedTests) && spec.focusedTests.length > 0,
    `${spec.id}: no focused test`)
  assert(
    spec.focusedTests.every(id => focusedTestIds.has(id)),
    `${spec.id}: unknown focused test binding`,
  )
  const targetFragments = spec.targetFragments.map(text =>
    bundleRecord(text, baseline, target),
  )
  assert(
    targetFragments.some(fragment => fragment.targetCount > 0),
    `${spec.id}: target bundle witness is absent`,
  )
  const changed = targetFragments.some(
    fragment => fragment.baselineCount !== fragment.targetCount,
  )
  assert(changed || spec.retained === true, `${spec.id}: no adjacent evidence`)
  assert(!(changed && spec.retained === true), `${spec.id}: false retained marker`)
  const releaseBullet = spec.category === 'official' ? Number(spec.id.slice(1)) : null
  const title =
    spec.category === 'official'
      ? changelog[releaseBullet - 1]
      : spec.category === 'hidden'
        ? hiddenTitles.get(spec.id)
        : spec.title
  assert(typeof title === 'string' && title.length > 0, `${spec.id}: title`)
  return {
    id: spec.id,
    obligationId:
      spec.obligationId ??
      (spec.category === 'official'
        ? `official-2-1-121-b${String(releaseBullet).padStart(2, '0')}`
        : `${spec.category}-${spec.id.toLowerCase()}`),
    category: spec.category,
    ...(releaseBullet === null ? {} : { releaseBullet }),
    title,
    rationale: spec.rationale,
    evidenceKind: 'reviewed-row-scoped-direct-evidence',
    ...(spec.retained === true ? { retained: true } : {}),
    focusedTests: [...new Set(spec.focusedTests)].sort(),
    targetFragments,
    targetAbsences: targetFragments.filter(fragment => fragment.targetCount === 0),
    sourceAssertions: spec.sourceAssertions.map(sourceRecord),
    sourceAbsences: [],
    sourcePathAbsences: (spec.sourcePathAbsences ?? []).map(
      sourcePathAbsenceRecord,
    ),
  }
})

const categoryCounts = Object.fromEntries(
  [...new Set(rows.map(row => row.category))].map(category => [
    category,
    rows.filter(row => row.category === category).length,
  ]),
)
assert(categoryCounts.official === 39, 'official direct row count')
assert(categoryCounts.hidden === 13, 'hidden direct row count')
assert(categoryCounts.daemon > 0, 'daemon direct rows')
assert(categoryCounts.residual > 0, 'residual direct rows')

const assertedPaths = new Set(
  rows.flatMap(row => [
    ...row.sourceAssertions.map(assertion => assertion.path),
    ...row.sourcePathAbsences.flatMap(absence => absence.paths),
  ]),
)
const missingChangedPaths = changedSourcePaths().filter(
  sourcePath => !assertedPaths.has(sourcePath),
)
assert(
  missingChangedPaths.length === 0,
  `changed source paths without direct evidence:\n${missingChangedPaths.join('\n')}`,
)

const inventoryPaths = fs
  .readdirSync(path.join(repo, 'recovery'))
  .filter(name => /^2\.1\.121-.*-inventory\.json$/.test(name))
  .map(name => path.join(repo, 'recovery', name))
  .sort()
const output = {
  schemaVersion: 1,
  case: '2.1.120-to-2.1.121',
  release: '2.1.121',
  baseline: { bytes: baselineBytes.length, sha256: sha256(baselineBytes) },
  target: { bytes: targetBytes.length, sha256: sha256(targetBytes) },
  inputs: [specsPath, hiddenPath, changelogPath, ...inventoryPaths]
    .filter((value, index, values) => values.indexOf(value) === index)
    .map(metadata),
  rowCount: rows.length,
  categoryCounts,
  rows,
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
const value = fs.readFileSync(outputPath)
console.log(
  JSON.stringify({
    status: '2.1.121-direct-evidence-built',
    ...metadata(outputPath),
    rows: rows.length,
    categoryCounts,
    changedSourcePaths: changedSourcePaths().length,
    targetFragments: rows.reduce((sum, row) => sum + row.targetFragments.length, 0),
    sourceAssertions: rows.reduce((sum, row) => sum + row.sourceAssertions.length, 0),
  }),
)
