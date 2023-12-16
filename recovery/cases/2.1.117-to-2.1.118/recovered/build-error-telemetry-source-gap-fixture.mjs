import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const selected = new Map([
  [9866, 'src/utils/gracefulShutdown.ts'],
  [9867, 'src/utils/gracefulShutdown.ts'],
  [9869, 'src/utils/gracefulShutdown.ts'],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(filename) {
  const value = fs.readFileSync(filename)
  return { bytes: value.length, sha256: sha256(value) }
}

const allOwners = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      '.recovery-tmp/generator-inputs/2.1.117-to-2.1.118.all-owners.json',
    ),
  ),
)
const report = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
    ),
  ),
)
const units = new Map(allOwners.rows.map(row => [row.targetIndex, row]))
const residuesByUnit = new Map()
for (const residue of report.sourceRuntimeAddedOwnerResidueRows) {
  const targetIndex = residue.structural.index
  if (!selected.has(targetIndex)) continue
  const values = residuesByUnit.get(targetIndex) ?? []
  values.push([
    residue.literalKind,
    residue.value,
    residue.target.start,
    residue.target.end,
    residue.baselineOccurrenceCount,
    residue.targetOccurrenceNumber,
  ])
  residuesByUnit.set(targetIndex, values)
}

const rows = [...selected].map(([targetIndex, ownerPath]) => {
  const unit = units.get(targetIndex)
  const residues = residuesByUnit.get(targetIndex) ?? []
  if (!unit || residues.length === 0) {
    throw new Error(`Target118 error telemetry fixture is missing u${targetIndex}`)
  }
  return {
    targetIndex,
    ownerPath,
    target: {
      start: unit.start,
      end: unit.end,
      bytes: unit.end - unit.start,
      nodeType: unit.nodeType,
      sourceHash: unit.sourceHash,
      structuralClass: unit.structuralClass,
    },
    residues,
  }
})

const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  status: 'authenticated-source-gap-recovered',
  evidenceIds: [
    'target118-error-telemetry-source-gap-target-fragment',
    'target118-error-telemetry-source-gap-source-replay-test',
  ],
  inputs: {
    targetBundle: descriptor(
      path.join(
        root,
        '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
      ),
    ),
    file: {
      path: 'src/utils/gracefulShutdown.ts',
      before: {
        bytes: 20840,
        sha256: '1cc0c7af7ecb33b345ccc4e3ca76c6b115a0c6dda7b86ccc1f92b495002776ee',
      },
      after: {
        bytes: 23952,
        sha256: '235cee67b85df57479ee0bd2a3637f0b43469d06128843d73d6671f63a9ad9cb',
      },
    },
  },
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
    indicesSha256: sha256(JSON.stringify(rows.map(row => row.targetIndex))),
    residueIdentitiesSha256: sha256(
      JSON.stringify(rows.flatMap(row => row.residues)),
    ),
  },
  rows,
}

const output = path.join(
  root,
  'recovery/test/recovery-2.1.118-error-telemetry-source-gap.json',
)
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(output, fixture.summary)
