import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { TARGET118_TERTIARY_STATIC_OWNER_OVERRIDES } from './tertiary-static-owner-overrides.mjs'

const root = process.cwd()
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')
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
const selected = new Set(
  TARGET118_TERTIARY_STATIC_OWNER_OVERRIDES.map(row => row.targetIndex),
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

const sourceProofs = new Map([
  [
    2523,
    {
      declaration: 'SettingsMarketplacePluginSchema',
      role: 'folded-string-property',
      property: 'message',
      sourceMarkers: [
        'Plugins in a settings-sourced marketplace must use remote sources ',
        '(github, git-subdir, npm, url). Relative-path sources like "./foo" ',
        'have no marketplace repository to resolve against.',
      ],
    },
  ],
  [
    6249,
    {
      declaration: 'getAuthHeadersAsync',
      role: 'dynamic-import-binding-and-call',
      identifier: 'getWIFCredentials',
      sourceMarkers: [
        'const { getWIFCredentials, getWIFTokenCache } = await import(',
        'getWIFCredentials(),',
      ],
    },
  ],
  [
    15337,
    {
      declaration: 'syncRemoteColor',
      role: 'dynamic-import-binding-and-call',
      identifier: 'updateBridgeSessionColorTag',
      sourceMarkers: [
        '({ updateBridgeSessionColorTag }) =>',
        'updateBridgeSessionColorTag(bridgeSessionId, color, AGENT_COLORS, {',
      ],
    },
  ],
  [
    20013,
    {
      declaration: 'externalTips',
      role: 'binding-and-return',
      identifier: 'eligible',
      sourceMarkers: [
        "id: 'guest-passes'",
        'const { eligible } = checkCachedPassesEligibility()',
        'return eligible',
      ],
    },
  ],
])

const files = new Map()
const rows = TARGET118_TERTIARY_STATIC_OWNER_OVERRIDES.map(override => {
  const unit = units.get(override.targetIndex)
  const residues = residuesByUnit.get(override.targetIndex) ?? []
  const sourceProof = sourceProofs.get(override.targetIndex)
  if (!unit || residues.length !== 1 || !sourceProof) {
    throw new Error(`Target118 tertiary static fixture misses u${override.targetIndex}`)
  }
  const relative = override.paths[0].replace(/^src\//, '')
  if (!files.has(override.paths[0])) {
    files.set(override.paths[0], descriptor(path.join(sourceRoot, relative)))
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
    sourceProof,
  }
})

const targetBundle = descriptor(
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  ),
)
const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  status: 'authenticated-tertiary-static-source-owner',
  evidenceIds: [
    'target118-tertiary-static-owner-target-fragment',
    'target118-tertiary-static-owner-source-ast-test',
  ],
  inputs: {
    targetBundle,
    sourceFiles: [...files].map(([sourcePath, file]) => ({ sourcePath, ...file })),
  },
  summary: {
    units: rows.length,
    residues: rows.reduce((sum, row) => sum + row.residues.length, 0),
    indicesSha256: sha256(JSON.stringify(rows.map(row => row.targetIndex))),
    residueIdentitiesSha256: sha256(JSON.stringify(rows.flatMap(row => row.residues))),
  },
  rows,
}

const output = path.join(
  root,
  'recovery/test/recovery-2.1.118-tertiary-static-owner-proofs.json',
)
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(output, fixture.summary)
