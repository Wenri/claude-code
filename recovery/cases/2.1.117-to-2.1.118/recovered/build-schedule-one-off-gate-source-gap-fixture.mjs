import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  TARGET118_SCHEDULE_ONE_OFF_GATE_INPUT,
  TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT,
  TARGET118_SCHEDULE_ONE_OFF_GATE_OWNER_OVERRIDES,
} from './replay-schedule-one-off-gate-source-gap.mjs'

const root = process.cwd()
const reportPath =
  process.env.CLAUDE_CODE_SEMANTIC_RESIDUE_REPORT ??
  path.join(
    root,
    '.recovery-tmp/root-audits/target118-secondary-static-final.json',
  )
const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

const report = JSON.parse(fs.readFileSync(reportPath))
const allOwners = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      '.recovery-tmp/generator-inputs/2.1.117-to-2.1.118.all-owners.json',
    ),
  ),
)
const units = new Map(allOwners.rows.map(row => [row.targetIndex, row]))
const selected = new Set(
  TARGET118_SCHEDULE_ONE_OFF_GATE_OWNER_OVERRIDES.map(row => row.targetIndex),
)
const residues = report.sourceRuntimeAddedOwnerResidueRows.filter(row =>
  selected.has(row.structural.index),
)
const rows = TARGET118_SCHEDULE_ONE_OFF_GATE_OWNER_OVERRIDES.map(override => {
  const unit = units.get(override.targetIndex)
  if (!unit) throw new Error(`Target118 schedule fixture misses u${override.targetIndex}`)
  const unitResidues = residues
    .filter(row => row.structural.index === override.targetIndex)
    .map(row => ({
      literalKind: row.literalKind,
      value: row.value,
      start: row.target.start,
      end: row.target.end,
      baselineOccurrenceCount: row.baselineOccurrenceCount,
      targetOccurrenceNumber: row.targetOccurrenceNumber,
    }))
  if (unitResidues.length === 0) {
    throw new Error(`Target118 schedule fixture has no residues for u${override.targetIndex}`)
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
      structuralClass: unit.structuralClass,
      sourceHash: unit.sourceHash,
    },
    residues: unitResidues,
  }
})

const targetBundle = fs.readFileSync(
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  ),
)
const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  targetCommit: 'bd846a24e3886322888f02b9f747c132a4a32314',
  status: 'authenticated-schedule-one-off-gate-source-replay',
  evidenceIds: [
    'target118-schedule-one-off-gate-target-fragment',
    'target118-schedule-one-off-gate-source-replay-test',
  ],
  inputs: {
    targetBundle: descriptor(targetBundle),
    sourcePreimage: TARGET118_SCHEDULE_ONE_OFF_GATE_INPUT,
    sourcePostimage: TARGET118_SCHEDULE_ONE_OFF_GATE_OUTPUT,
  },
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
    indicesSha256: sha256(JSON.stringify(rows.map(row => row.targetIndex))),
    residueIdentitiesSha256: sha256(
      JSON.stringify(rows.flatMap(row => row.residues)),
    ),
  },
  sourceMarkers: {
    option: 'oneOffEnabled: boolean',
    gate: "'tengu_mocha_barista'",
    enabledIntro:
      "oneOffEnabled ? ', either on a recurring cron schedule or once at a specific time' : ' on a recurring cron schedule'",
    disabledRequired:
      'oneOffEnabled ? "- Exactly ONE of:',
    invocation: '        oneOffEnabled,',
  },
  rows,
}

const output = path.join(
  root,
  'recovery/test/recovery-2.1.118-schedule-one-off-gate-source-gap.json',
)
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
process.stdout.write(`${output} ${JSON.stringify(fixture.summary)}\n`)
