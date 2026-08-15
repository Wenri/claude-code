#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const caseRoot = path.join(repo, 'recovery/cases/2.1.121-to-2.1.122')
const changelogPath = path.join(caseRoot, 'evidence/CHANGELOG-2.1.122.md')
const outputPath = path.join(repo, 'recovery/2.1.122-direct-evidence-specs.json')
const final = process.argv.slice(2).includes('--final')

if (process.argv.slice(2).some(argument => argument !== '--final')) {
  throw new Error('Usage: build-2.1.122-direct-specs.mjs [--final]')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const bullets = fs
  .readFileSync(changelogPath, 'utf8')
  .split('\n')
  .filter(line => line.startsWith('- '))
  .map(line => line.slice(2))
assert(bullets.length === 18, 'expected exactly 18 official changelog bullets')

const existing = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  : null
if (existing) {
  assert(existing.schemaVersion === 1, 'existing spec schema')
  assert(existing.case === '2.1.121-to-2.1.122', 'existing spec case')
  assert(existing.release === '2.1.122', 'existing spec release')
}

const existingRows = new Map((existing?.rows ?? []).map(row => [row.id, row]))
const officialRows = bullets.map((title, index) => {
  const id = `B${String(index + 1).padStart(2, '0')}`
  return existingRows.get(id) ?? {
    id,
    category: 'official',
    releaseBullet: index + 1,
    title,
    status: 'pending-source-recovery',
    targetFragments: [],
    sourceAssertions: [],
    sourcePathAbsences: [],
    focusedTests: [],
    rationale: 'Pending exact adjacent-bundle and recovered-source evidence.',
  }
})
const nonOfficialRows = (existing?.rows ?? []).filter(
  row => row.category !== 'official',
)
const rows = [...officialRows, ...nonOfficialRows]
const declarations = {
  officialRowsEnumerated: true,
  hiddenInventoryComplete: false,
  daemonInventoryComplete: false,
  residualAuditComplete: false,
  changedSourcePathsFullyBound: false,
  focusedTestsFullyBound: false,
  ...(existing?.coverageDeclarations ?? {}),
}

if (final) {
  for (const [key, value] of Object.entries(declarations)) {
    assert(value === true, `coverage declaration remains false: ${key}`)
  }
  assert(
    officialRows.map(row => row.id).join(',') ===
      Array.from({ length: 18 }, (_, index) =>
        `B${String(index + 1).padStart(2, '0')}`,
      ).join(','),
    'official rows must be ordered B01-B18',
  )
  const ids = rows.map(row => row.id)
  assert(new Set(ids).size === ids.length, 'row IDs must be unique')
  for (const row of rows) {
    assert(row.status === 'verified', `${row.id}: status is not verified`)
    assert(
      Array.isArray(row.targetFragments) && row.targetFragments.length > 0,
      `${row.id}: no exact bundle witness`,
    )
    assert(
      Array.isArray(row.sourceAssertions) && row.sourceAssertions.length > 0,
      `${row.id}: no source witness`,
    )
    assert(
      Array.isArray(row.focusedTests) && row.focusedTests.length > 0,
      `${row.id}: no focused test binding`,
    )
    assert(
      typeof row.rationale === 'string' && row.rationale.length > 0,
      `${row.id}: no rationale`,
    )
  }
}

const output = {
  schemaVersion: 1,
  case: '2.1.121-to-2.1.122',
  release: '2.1.122',
  complete: final,
  coverageDeclarations: declarations,
  rows,
}
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(
  JSON.stringify({
    status: '2.1.122-direct-specs-built',
    complete: output.complete,
    rows: rows.length,
    official: officialRows.length,
    nonOfficial: nonOfficialRows.length,
  }),
)
