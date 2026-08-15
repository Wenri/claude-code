#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.121-to-2.1.122')
const outputPath = path.join(caseRoot, 'semantic/direct-evidence.json')
const specsPath = path.join(repo, 'recovery/2.1.122-direct-evidence-specs.json')
const changelogPath = path.join(caseRoot, 'evidence/CHANGELOG-2.1.122.md')
const baselinePath = process.env.CLAUDE_CODE_2_1_121_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_122_BUNDLE
const baseRevision = '11890981447ee2cea3407c608f4411e43e5fe72a'

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
  const filename = path.join(repo, assertion.path)
  const source = fs.readFileSync(filename, 'utf8')
  const count = occurrences(source, assertion.fragment)
  assert(count > 0, `${assertion.path}: absent source fragment`)
  const value = Buffer.from(assertion.fragment)
  return {
    path: assertion.path,
    fragment: assertion.fragment,
    bytes: value.length,
    sha256: sha256(value),
    count,
  }
}

function sourcePathAbsenceRecord(absence) {
  assert(Array.isArray(absence.paths) && absence.paths.length > 0,
    `source absence has no paths: ${absence.fragment}`)
  assert(typeof absence.fragment === 'string' && absence.fragment.length > 0,
    'source absence has an empty fragment')
  const paths = [...new Set(absence.paths)].sort()
  assert(paths.length === absence.paths.length, 'duplicate source-absence path')
  const count = paths.reduce((sum, relative) => {
    assert(relative.startsWith('src/'), `unsafe source absence path: ${relative}`)
    return sum + occurrences(
      fs.readFileSync(path.join(repo, relative), 'utf8'),
      absence.fragment,
    )
  }, 0)
  assert(count === 0, `source absence is present: ${absence.fragment}`)
  const value = Buffer.from(absence.fragment)
  return {
    paths,
    fragment: absence.fragment,
    bytes: value.length,
    sha256: sha256(value),
    count,
  }
}

function changedSourcePaths() {
  return execFileSync(
    'git',
    ['diff', '--name-only', `${baseRevision}..HEAD`, '--', 'src'],
    { cwd: repo, encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean).sort()
}

const specs = JSON.parse(fs.readFileSync(specsPath, 'utf8'))
assert(specs.schemaVersion === 1, 'direct spec schema')
assert(specs.case === '2.1.121-to-2.1.122', 'direct spec case')
assert(specs.release === '2.1.122', 'direct spec release')
assert(specs.complete === true, 'direct spec is still provisional')
for (const [key, value] of Object.entries(specs.coverageDeclarations ?? {})) {
  assert(value === true, `coverage declaration remains false: ${key}`)
}
assert(baselinePath, 'CLAUDE_CODE_2_1_121_BUNDLE must be set')
assert(targetPath, 'CLAUDE_CODE_2_1_122_BUNDLE must be set')

const baselineBytes = fs.readFileSync(baselinePath)
const targetBytes = fs.readFileSync(targetPath)
assert(baselineBytes.length === 13_908_188, 'baseline byte length')
assert(
  sha256(baselineBytes) ===
    '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  'baseline SHA-256',
)
assert(targetBytes.length === 13_949_544, 'target byte length')
assert(
  sha256(targetBytes) ===
    'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  'target SHA-256',
)
const baseline = baselineBytes.toString('utf8')
const target = targetBytes.toString('utf8')
const changelog = fs.readFileSync(changelogPath, 'utf8')
  .split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2))
assert(changelog.length === 18, 'official changelog bullet count')

const focusedTestIds = new Set(
  fs.readdirSync(path.join(repo, 'recovery/test'))
    .filter(name =>
      /^recovery-2\.1\.122-.*\.test\.mjs$/.test(name) &&
      name !== 'recovery-2.1.122-direct-evidence.test.mjs')
    .map(name => name
      .replace(/^recovery-2\.1\.122-/, '')
      .replace(/\.test\.mjs$/, '')),
)
const expectedOfficial = Array.from(
  { length: 18 },
  (_, index) => `B${String(index + 1).padStart(2, '0')}`,
)
const officialIds = specs.rows
  .filter(row => row.category === 'official')
  .map(row => row.id)
assert(JSON.stringify(officialIds) === JSON.stringify(expectedOfficial),
  'official specs must be ordered B01-B18')
assert(new Set(specs.rows.map(row => row.id)).size === specs.rows.length,
  'direct spec IDs are unique')

const rows = specs.rows.map(spec => {
  assert(spec.status === 'verified', `${spec.id}: status is not verified`)
  assert(Array.isArray(spec.targetFragments) && spec.targetFragments.length > 0,
    `${spec.id}: no bundle witness`)
  assert(Array.isArray(spec.sourceAssertions) && spec.sourceAssertions.length > 0,
    `${spec.id}: no source witness`)
  assert(Array.isArray(spec.focusedTests) && spec.focusedTests.length > 0,
    `${spec.id}: no focused test`)
  assert(spec.focusedTests.every(id => focusedTestIds.has(id)),
    `${spec.id}: unknown focused test binding`)
  const targetFragments = spec.targetFragments.map(text =>
    bundleRecord(text, baseline, target))
  assert(targetFragments.some(fragment => fragment.targetCount > 0),
    `${spec.id}: target bundle witness is absent`)
  const changed = targetFragments.some(
    fragment => fragment.baselineCount !== fragment.targetCount)
  assert(changed || spec.retained === true, `${spec.id}: no adjacent evidence`)
  assert(!(changed && spec.retained === true), `${spec.id}: false retained marker`)
  const releaseBullet = spec.category === 'official' ? Number(spec.id.slice(1)) : null
  const title = releaseBullet === null ? spec.title : changelog[releaseBullet - 1]
  assert(typeof title === 'string' && title.length > 0, `${spec.id}: title`)
  return {
    id: spec.id,
    obligationId: spec.obligationId ??
      (releaseBullet === null
        ? `${spec.category}-${spec.id.toLowerCase()}`
        : `official-2-1-122-b${String(releaseBullet).padStart(2, '0')}`),
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
    sourcePathAbsences: (spec.sourcePathAbsences ?? []).map(sourcePathAbsenceRecord),
  }
})

const assertedPaths = new Set(rows.flatMap(row => [
  ...row.sourceAssertions.map(assertion => assertion.path),
  ...row.sourcePathAbsences.flatMap(absence => absence.paths),
]))
const boundTests = new Set(rows.flatMap(row => row.focusedTests))
const missingPaths = changedSourcePaths().filter(value => !assertedPaths.has(value))
const missingTests = [...focusedTestIds].filter(value => !boundTests.has(value)).sort()
assert(missingPaths.length === 0,
  `changed source paths without direct evidence:\n${missingPaths.join('\n')}`)
assert(missingTests.length === 0,
  `focused tests without direct row bindings:\n${missingTests.join('\n')}`)

const categoryCounts = Object.fromEntries(
  [...new Set(rows.map(row => row.category))]
    .sort()
    .map(category => [category, rows.filter(row => row.category === category).length]),
)
assert(categoryCounts.official === 18, 'official direct row count')
const inventoryPaths = fs.readdirSync(path.join(repo, 'recovery'))
  .filter(name => /^2\.1\.122-.*-inventory\.json$/.test(name))
  .map(name => path.join(repo, 'recovery', name)).sort()
const output = {
  schemaVersion: 1,
  case: '2.1.121-to-2.1.122',
  release: '2.1.122',
  complete: true,
  baseline: { bytes: baselineBytes.length, sha256: sha256(baselineBytes) },
  target: { bytes: targetBytes.length, sha256: sha256(targetBytes) },
  coverageDeclarations: specs.coverageDeclarations,
  inputs: [specsPath, changelogPath, ...inventoryPaths].map(metadata),
  changedSourcePathCount: changedSourcePaths().length,
  focusedTestCount: focusedTestIds.size,
  rowCount: rows.length,
  categoryCounts,
  rows,
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  status: '2.1.122-direct-evidence-built',
  ...metadata(outputPath),
  rows: rows.length,
  categoryCounts,
}))
