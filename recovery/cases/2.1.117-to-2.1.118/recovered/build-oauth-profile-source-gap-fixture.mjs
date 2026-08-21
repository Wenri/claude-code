import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const selected = new Map([
  [4012, 'src/services/oauth/client.ts'],
  [4016, 'src/services/oauth/client.ts'],
  [4018, 'src/services/oauth/client.ts'],
  [4019, 'src/services/oauth/client.ts'],
  [4020, 'src/services/oauth/client.ts'],
  [4022, 'src/services/oauth/client.ts'],
  [4026, 'src/services/oauth/client.ts'],
  [4033, 'src/services/oauth/client.ts'],
  [11686, 'src/cli/handlers/auth.ts'],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function fileDescriptor(filename) {
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
    throw new Error(`Target118 OAuth fixture input is missing unit ${targetIndex}`)
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

const targetBundle = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
)
const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  status: 'authenticated-source-gap-recovered',
  evidenceIds: [
    'target118-oauth-profile-source-gap-target-fragment',
    'target118-oauth-profile-source-gap-source-replay-test',
  ],
  inputs: {
    targetBundle: fileDescriptor(targetBundle),
    recoveredSourceCommit: '351cd4d13f70a564dc2d90f59ab0093dc6fc7b05',
    files: [
      {
        path: 'src/services/oauth/client.ts',
        before: {
          bytes: 18466,
          sha256: 'a235e3ddcecd93b34ddc7791f81df3e6d90a17f323e1b840160f05ba063f2cce',
        },
        after: {
          bytes: 20355,
          sha256: '0fa1702b5bb443c42920f0c13e4193ca0d5b8d872c207be94b8dae6b7165ab68',
        },
      },
      {
        path: 'src/cli/handlers/auth.ts',
        before: {
          bytes: 11377,
          sha256: '6c35b4d8bc1305ac10ff600903a04415c4db194d03dcbd61a4fead8eaaadbf42',
        },
        after: {
          bytes: 11648,
          sha256: 'ceca43bde473b754d807ad1a8ab45ebdda415b6e1528be87768da2ffdd91b2ef',
        },
      },
    ],
  },
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
    ownerFiles: new Set(selected.values()).size,
    indicesSha256: sha256(JSON.stringify(rows.map(row => row.targetIndex))),
    residueIdentitiesSha256: sha256(
      JSON.stringify(rows.flatMap(row => row.residues)),
    ),
  },
  rows,
}

const output = path.join(
  root,
  'recovery/test/recovery-2.1.118-oauth-profile-source-gap.json',
)
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(output, fixture.summary)
