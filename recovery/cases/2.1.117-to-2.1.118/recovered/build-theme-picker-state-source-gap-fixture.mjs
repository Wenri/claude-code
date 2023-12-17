import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  TARGET118_THEME_PICKER_STATE_INPUT,
  TARGET118_THEME_PICKER_STATE_OUTPUT,
} from './replay-theme-picker-state-source-gap.mjs'

const root = process.cwd()
const targetIndex = 17047
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
    path.join(root, '.recovery-tmp/root-audits/target118-direct14.json'),
  ),
)
const unit = allOwners.rows.find(row => row.targetIndex === targetIndex)
const residues = report.sourceRuntimeAddedOwnerResidueRows
  .filter(row => row.structural.index === targetIndex)
  .map(row => [
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ])
if (!unit || residues.length !== 3) {
  throw new Error('Target118 theme-picker fixture input differs')
}
const bundle = fs.readFileSync(
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  ),
)
const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  status: 'authenticated-source-gap-replay',
  targetIndex,
  evidenceIds: [
    'target118-theme-picker-state-target-fragment',
    'target118-theme-picker-state-source-replay-test',
  ],
  inputs: {
    targetBundle: { bytes: bundle.length, sha256: sha256(bundle) },
    sourcePreimage: TARGET118_THEME_PICKER_STATE_INPUT,
    sourcePostimage: TARGET118_THEME_PICKER_STATE_OUTPUT,
  },
  target: {
    start: unit.start,
    end: unit.end,
    bytes: unit.end - unit.start,
    nodeType: unit.nodeType,
    sourceHash: unit.sourceHash,
    structuralClass: unit.structuralClass,
  },
  residues,
  targetMarkers: [
    '{kind:"picker"}',
    'z.kind==="editor"',
    '{kind:"editor",initial:j}',
    'QDH(L.slug)',
    'J4H(j)',
  ],
  sourceMarkers: [
    "type ThemePickerState =",
    "{ kind: 'picker' }",
    "{ kind: 'editor'; initial: CustomTheme | undefined }",
    'toCustomThemeSetting(customTheme.slug)',
    'fromCustomThemeSetting(setting)',
    "setState({ kind: 'editor', initial })",
  ],
}
const output = path.join(
  root,
  'recovery/test/recovery-2.1.118-theme-picker-state-source-gap.json',
)
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(output, sha256(JSON.stringify(fixture)))
