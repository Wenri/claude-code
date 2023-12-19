import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { TARGET118_QUATERNARY_STATIC_OWNER_OVERRIDES } from './quaternary-static-owner-overrides.mjs'

const root = process.cwd()
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')
const reportPath =
  process.env.CLAUDE_CODE_SEMANTIC_RESIDUE_REPORT ??
  path.join(
    root,
    '.recovery-tmp/residue-audits/2.1.117-to-2.1.118.typed-audit.json',
  )
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
  TARGET118_QUATERNARY_STATIC_OWNER_OVERRIDES.map(row => row.targetIndex),
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
    6796,
    {
      declaration: 'getRendererEntryPath',
      role: 'module-state-object-lowering',
      identifiers: ['gbGateCached'],
      sourceMarkers: [
        'gbGateCached ??',
        "getFeatureValue_CACHED_MAY_BE_STALE('tengu_pewter_brook', false)",
      ],
    },
  ],
  [
    15447,
    {
      declaration: 'ThemePicker',
      role: 'binding-elements',
      identifiers: ['onCustomTheme', 'customThemes'],
      sourceMarkers: [
        'onCustomTheme,',
        'const { customThemes } = useCustomThemes()',
        "label: 'New custom theme…'",
      ],
    },
  ],
  [
    18758,
    {
      declaration: 'handleServerControlRequest',
      role: 'binding-and-optional-call',
      identifiers: ['onSetColor'],
      sourceMarkers: [
        'onSetColor,',
        "case 'set_color'",
        'onSetColor?.(request.request.color)',
      ],
    },
  ],
  [
    20441,
    {
      declaration: 'handleBedrockDefaultFallbacks',
      role: 'jsx-key-lowering',
      identifiers: ['key'],
      sourceMarkers: [
        "withProbeDeadline('bedrock-fallback'",
        '<Text key={warning} color="warning">',
      ],
    },
  ],
  [
    20443,
    {
      declaration: 'handleVertexDefaultFallbacks',
      role: 'jsx-key-lowering',
      identifiers: ['key'],
      sourceMarkers: [
        "withProbeDeadline('vertex-fallback'",
        '<Text key={warning} color="warning">',
      ],
    },
  ],
  [
    20523,
    {
      declaration: 'registerUpdateConfigSkill',
      role: 'static-string-length-fold',
      staticString: '[hooks-only]',
      foldedValue: 12,
      sourceMarkers: [
        "args.startsWith('[hooks-only]')",
        "args.slice('[hooks-only]'.length).trim()",
      ],
    },
  ],
  [
    20897,
    {
      declaration: 'SetupNotes',
      role: 'react-compiler-cache-call',
      identifiers: ['_c'],
      cacheSlots: 5,
      sourceMarkers: ['const $ = _c(5);', 'messages.map(_temp)'],
    },
  ],
  [
    20898,
    {
      declaration: '_temp',
      role: 'jsx-key-lowering',
      identifiers: ['key'],
      sourceMarkers: ['<Box key={index} marginLeft={2}>'],
    },
  ],
  [
    20908,
    {
      declaration: 'installHandler',
      role: 'named-import-call-lowering',
      identifiers: ['cwd'],
      importModule: 'process',
      sourceMarkers: [
        "await setup(cwd(), 'default', false, false, undefined, false);",
      ],
    },
  ],
  [
    20916,
    {
      declaration: 'pluginTagHandler',
      role: 'binding-elements',
      identifiers: ['plan'],
      sourceMarkers: [
        'const { plan } = result',
        'getPluginTagMessage(plan, options.message)',
      ],
    },
  ],
])

const files = new Map()
const expectedResidueCounts = new Map([
  [6796, 1],
  [15447, 2],
  [18758, 1],
  [20441, 1],
  [20443, 1],
  [20523, 1],
  [20897, 1],
  [20898, 1],
  [20908, 1],
  [20916, 1],
])
const rows = TARGET118_QUATERNARY_STATIC_OWNER_OVERRIDES.map(override => {
  const unit = units.get(override.targetIndex)
  const residues = residuesByUnit.get(override.targetIndex) ?? []
  const sourceProof = sourceProofs.get(override.targetIndex)
  if (
    !unit ||
    residues.length !== expectedResidueCounts.get(override.targetIndex) ||
    !sourceProof
  ) {
    throw new Error(
      `Target118 quaternary static fixture misses u${override.targetIndex}`,
    )
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

const fixture = {
  schemaVersion: 1,
  case: '2.1.117-to-2.1.118',
  status: 'authenticated-quaternary-static-source-owner',
  evidenceIds: [
    'target118-quaternary-static-owner-target-fragment',
    'target118-quaternary-static-owner-source-ast-test',
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
  'recovery/test/recovery-2.1.118-quaternary-static-owner-proofs.json',
)
fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(output, fixture.summary)
