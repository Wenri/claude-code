import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { TARGET118_SECONDARY_DIRECT_OWNER_OVERRIDES } from './secondary-direct-owner-overrides.mjs'

const root = process.cwd()
const packageSourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')
const reportPath =
  process.env.CLAUDE_CODE_SEMANTIC_RESIDUE_REPORT ??
  path.join(root, '.recovery-tmp/root-audits/target118-direct14.json')

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
const report = JSON.parse(fs.readFileSync(reportPath))
const units = new Map(allOwners.rows.map(row => [row.targetIndex, row]))
const selected = new Set(
  TARGET118_SECONDARY_DIRECT_OWNER_OVERRIDES.map(row => row.targetIndex),
)
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

const declarations = new Map([
  [15071, 'getPlanModeV2Instructions'],
  [16206, 'ManageMarketplaces'],
  [16234, 'PluginComponentsDisplay'],
])
const markers = new Map([
  [
    15071,
    [
      '## Plan File Info:',
      'questions or clarifications',
      'ASK_USER_QUESTION_TOOL_NAME',
    ],
  ],
  [16206, ['updated:', '• Update {updateCount}', '• Remove {removeCount}']],
  [16234, ['Agents:', 'Skills:', 'Hooks:']],
])

const files = new Map()
const rows = TARGET118_SECONDARY_DIRECT_OWNER_OVERRIDES.map(override => {
  const unit = units.get(override.targetIndex)
  const residues = residuesByUnit.get(override.targetIndex) ?? []
  if (!unit || residues.length === 0) {
    throw new Error(
      `Target118 secondary direct-owner fixture is missing u${override.targetIndex}`,
    )
  }
  const relative = override.paths[0].replace(/^src\//, '')
  if (!files.has(override.paths[0])) {
    files.set(
      override.paths[0],
      descriptor(path.join(packageSourceRoot, relative)),
    )
  }
  return {
    targetIndex: override.targetIndex,
    ownerPath: override.paths[0],
    declaration: declarations.get(override.targetIndex),
    behavior: override.behavior,
    target: {
      start: unit.start,
      end: unit.end,
      bytes: unit.end - unit.start,
      nodeType: unit.nodeType,
      sourceHash: unit.sourceHash,
      structuralClass: unit.structuralClass,
    },
    residues,
    sourceMarkers: markers.get(override.targetIndex),
  }
})

const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  status: 'authenticated-secondary-direct-source-owner',
  evidenceIds: [
    'target118-secondary-direct-owner-target-fragment',
    'target118-secondary-direct-owner-source-ast-test',
  ],
  inputs: {
    targetBundle: descriptor(
      path.join(
        root,
        '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
      ),
    ),
    sourceFiles: [...files].map(([sourcePath, file]) => ({
      sourcePath,
      ...file,
    })),
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
  'recovery/test/recovery-2.1.118-secondary-direct-owner-proofs.json',
)
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(output, fixture.summary)
