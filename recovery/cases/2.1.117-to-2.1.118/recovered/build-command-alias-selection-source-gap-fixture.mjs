import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  TARGET118_COMMAND_ALIAS_SELECTION_INPUTS,
  TARGET118_COMMAND_ALIAS_SELECTION_OUTPUTS,
  TARGET118_COMMAND_ALIAS_SELECTION_OWNER_OVERRIDES,
} from './replay-command-alias-selection-source-gap.mjs'

const root = process.cwd()
const reportPath =
  process.env.CLAUDE_CODE_SEMANTIC_RESIDUE_REPORT ??
  path.join(root, '.recovery-tmp/root-audits/target118-schedule-final.json')
const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = filename => {
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
const rows = TARGET118_COMMAND_ALIAS_SELECTION_OWNER_OVERRIDES.map(override => {
  const unit = units.get(override.targetIndex)
  const residues = report.sourceRuntimeAddedOwnerResidueRows
    .filter(row => row.structural.index === override.targetIndex)
    .map(row => ({
      literalKind: row.literalKind,
      value: row.value,
      start: row.target.start,
      end: row.target.end,
      baselineOccurrenceCount: row.baselineOccurrenceCount,
      targetOccurrenceNumber: row.targetOccurrenceNumber,
    }))
  if (!unit || residues.length !== 1 || residues[0].value !== 'matchedAlias') {
    throw new Error(`Target118 command alias fixture misses u${override.targetIndex}`)
  }
  return {
    targetIndex: override.targetIndex,
    ownerPath: override.paths[0],
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
  }
})

const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  targetCommit: 'bd846a24e3886322888f02b9f747c132a4a32314',
  status: 'authenticated-command-alias-selection-source-replay',
  evidenceIds: [
    'target118-command-alias-selection-target-fragment',
    'target118-command-alias-selection-source-replay-test',
  ],
  inputs: {
    targetBundle: descriptor(
      path.join(
        root,
        '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
      ),
    ),
    sourceFiles: TARGET118_COMMAND_ALIAS_SELECTION_INPUTS,
  },
  outputs: { sourceFiles: TARGET118_COMMAND_ALIAS_SELECTION_OUTPUTS },
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
    indicesSha256: sha256(JSON.stringify(rows.map(row => row.targetIndex))),
    residueIdentitiesSha256: sha256(
      JSON.stringify(rows.flatMap(row => row.residues)),
    ),
  },
  sourceMarkers: {
    type: 'matchedAlias?: string;',
    payload: '    matchedAlias,',
    guard: 'matchedAlias && findCommand(matchedAlias, commands) === suggestion.metadata',
    fallback: ': suggestion.metadata.name',
  },
  rows,
}

const output = path.join(
  root,
  'recovery/test/recovery-2.1.118-command-alias-selection-source-gap.json',
)
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(output, fixture.summary)
