import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const root = process.cwd()
const caseName = process.argv[2]
if (!caseName) throw new Error('usage: CASE')
const auditRoot = '/tmp/recovery-semantic-late-b'
const historical = JSON.parse(
  fs.readFileSync(path.join(auditRoot, `${caseName}.typed-audit.json`)),
)
const current = JSON.parse(
  fs.readFileSync(path.join(auditRoot, `${caseName}.current-typed-audit.json`)),
)
const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(root, 'recovery/cases', caseName, 'structural/generated-delta.json.gz'),
    ),
  ),
)
const regionByIndex = new Map(
  structural.regions.map(region => [region.target.index, region]),
)
const historicalResidues = historical.rows.filter(
  row =>
    row.disposition === 'source-runtime-covered' &&
    row.ownerSourceMatches?.length === 0,
)
const currentResidues = current.rows.filter(
  row =>
    row.disposition === 'source-runtime-covered' &&
    row.ownerSourceMatches?.length === 0,
)
const currentByOccurrence = new Map(
  currentResidues.map(row => [
    `${row.target.start}:${row.target.end}`,
    row,
  ]),
)
const metadataValues = new Set([
  '2.1.108',
  '2.1.109',
  '2.1.110',
  '2.1.111',
  '2.1.112',
  '2.1.113',
  '2.1.114',
  '2.1.116',
  '2026-04-14T17:18:04Z',
  '2026-04-15T03:02:38Z',
  '2026-04-15T19:36:27Z',
  '2026-04-16T14:23:56Z',
  '2026-04-16T18:33:19Z',
  '2026-04-17T18:18:28Z',
  '2026-04-17T22:37:24Z',
  '2026-04-20T13:57:26Z',
  '9e176d0772418b8b88475d39fb86c651a12f4aad',
])
const groups = new Map()
for (const row of historicalResidues.filter(row => row.targetAdded)) {
  if (metadataValues.has(String(row.value))) continue
  const index = row.structural.index
  const group = groups.get(index) ?? {
    targetIndex: index,
    structuralClass: row.structural.classification,
    sourceHash: row.structural.sourceHash,
    historicalOwners: row.ownerPaths,
    values: [],
    historicalMatches: new Set(),
    currentMatches: new Set(),
    candidates: new Set(),
  }
  group.values.push(row.value)
  for (const item of row.sourceMatches ?? []) group.historicalMatches.add(item)
  for (const item of row.candidates ?? []) group.candidates.add(item.replace(/^\.\.\/src\//, ''))
  const currentRow = currentByOccurrence.get(`${row.target.start}:${row.target.end}`)
  for (const item of currentRow?.sourceMatches ?? []) group.currentMatches.add(item)
  groups.set(index, group)
}
const result = [...groups.values()]
  .map(group => ({
    ...group,
    values: [...new Set(group.values.map(value =>
      typeof value === 'object' ? JSON.stringify(value) : String(value),
    ))],
    historicalMatches: [...group.historicalMatches],
    currentMatches: [...group.currentMatches],
    candidates: [...group.candidates],
  }))
  .sort((left, right) => right.values.length - left.values.length)
fs.writeFileSync(
  path.join(auditRoot, `${caseName}.typed-units.json`),
  `${JSON.stringify(result, null, 2)}\n`,
)
process.stdout.write(`${JSON.stringify({
  caseName,
  units: result.length,
  historicalOwnerAvailable: result.filter(item => item.historicalMatches.length > 0).length,
  currentOwnerAvailable: result.filter(item => item.currentMatches.length > 0).length,
  noCurrentOwner: result.filter(item => item.currentMatches.length === 0).length,
}, null, 2)}\n`)
