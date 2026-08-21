import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../../../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET121_DAEMON_SPARE_EVIDENCE_IDS,
  TARGET121_DAEMON_SPARE_OWNER_OVERRIDES,
} from './daemon-spare-owner-overrides.mjs'

const root = process.cwd()
const targetIndices = Object.freeze([22119])
const targetIndexSet = new Set(targetIndices)
const correctedOwner = 'src/daemon/spare.ts'
const baselineBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.120-linux-x64/cli.inner.js',
)
const targetBundlePath = path.join(
  root,
  '.recovery-tmp/authenticated-artifacts/2.1.121-linux-x64/cli.inner.js',
)
const structuralPath = path.join(
  root,
  'recovery/cases/2.1.120-to-2.1.121/structural/generated-delta.json.gz',
)
const typedReportPath =
  process.env.CLAUDE_CODE_2_1_121_TYPED_REPORT ??
  path.join(
    root,
    '.recovery-tmp/residue-audits/2.1.120-to-2.1.121.typed-audit.json',
  )
const sourceRoot = path.join(
  root,
  '.recovery-tmp/semantic-trees/2.1.121/src',
)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const canonicalValue = value =>
  value !== null && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
      )
    : value
const canonicalResidue = row => [
  row.structural.index,
  row.literalKind,
  canonicalValue(row.value),
  row.target.start,
  row.target.end,
  row.baselineOccurrenceCount,
  row.targetOccurrenceNumber,
  row.structural.sourceHash,
]
const canonicalDigest = rows =>
  sha256(Buffer.from(`${JSON.stringify(rows)}\n`, 'utf8'))

const baselineBundle = fs.readFileSync(baselineBundlePath)
const targetBundle = fs.readFileSync(targetBundlePath)
const structuralBytes = fs.readFileSync(structuralPath)
const typedReportBytes = fs.readFileSync(typedReportPath)
const structural = JSON.parse(gunzipSync(structuralBytes))
const report = JSON.parse(typedReportBytes)

const units = targetIndices.map(targetIndex => {
  const region = structural.regions.find(
    candidate => candidate.target?.index === targetIndex,
  )
  if (region === undefined) throw new Error(`u${targetIndex} is absent`)
  const target = region.target
  const slice = targetBundle.subarray(target.start, target.end)
  if (sha256(slice) !== target.sourceHash) {
    throw new Error(`u${targetIndex} target hash differs`)
  }
  const ast = parse(slice.toString('utf8'), {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  if (ast.body.length !== 1 || ast.body[0].type !== target.nodeType) {
    throw new Error(`u${targetIndex} target AST differs`)
  }
  return {
    targetIndex,
    start: target.start,
    end: target.end,
    nodeType: target.nodeType,
    sourceHash: target.sourceHash,
    ...descriptor(slice),
    correctedOwner,
  }
})

const reportRows = report.sourceRuntimeAddedOwnerResidueRows
  .filter(row => targetIndexSet.has(row.structural.index))
  .sort(
    (a, b) =>
      a.structural.index - b.structural.index ||
      a.target.start - b.target.start ||
      a.target.end - b.target.end,
  )
if (reportRows.length !== 17) {
  throw new Error(`expected 17 daemon-spare residues, got ${reportRows.length}`)
}
const residues = reportRows.map(canonicalResidue)
const directOwnerRows = reportRows.filter(row =>
  row.sourceMatches.includes('daemon/spare.ts'),
)
const residualRows = reportRows.filter(row => !directOwnerRows.includes(row))
const buildValues = Object.freeze([
  '2.1.121',
  '2026-04-27T01:32:27Z',
  '16ffea721a0a39bc787a236dc19fb62307180b75',
])
const buildValueSet = new Set(buildValues)
const buildMacroRows = residualRows.filter(
  row => row.literalKind === 'string' && buildValueSet.has(row.value),
)
const unexplainedRows = residualRows.filter(
  row => !buildMacroRows.includes(row),
)
if (
  directOwnerRows.length !== 14 ||
  buildMacroRows.length !== 3 ||
  unexplainedRows.length !== 0
) {
  throw new Error('daemon-spare residue accounting differs')
}

const tsImport = await import(
  pathToFileURL(
    path.join(
      root,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ).href,
)
const ts = tsImport.default ?? tsImport
const sourcePath = correctedOwner
const absoluteSourcePath = path.join(sourceRoot, sourcePath.slice(4))
const sourceBytes = fs.readFileSync(absoluteSourcePath)
const sourceFile = ts.createSourceFile(
  absoluteSourcePath,
  sourceBytes.toString('utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)
const expectedDeclarations = ['spawnSpare']
const declarations = []
function visit(node) {
  if (
    ts.isFunctionDeclaration(node) &&
    node.name !== undefined &&
    expectedDeclarations.includes(node.name.text)
  ) {
    const start = node.getStart(sourceFile)
    const end = node.end
    declarations.push({
      name: node.name.text,
      kind: 'FunctionDeclaration',
      start,
      end,
      ...descriptor(sourceBytes.subarray(start, end)),
    })
  }
  ts.forEachChild(node, visit)
}
visit(sourceFile)
if (declarations.length !== 1) {
  throw new Error(`${sourcePath} spawnSpare declaration differs`)
}

const fixture = {
  schemaVersion: 1,
  case: '2.1.120-to-2.1.121',
  targetVersion: '2.1.121',
  criterion: 'target121-daemon-spare-exact-owner-and-build-proof-v1',
  inputs: {
    baselineBundle: {
      path: path.relative(root, baselineBundlePath),
      ...descriptor(baselineBundle),
    },
    targetBundle: {
      path: path.relative(root, targetBundlePath),
      ...descriptor(targetBundle),
    },
    structural: {
      path: path.relative(root, structuralPath),
      ...descriptor(structuralBytes),
    },
    typedReport: {
      path: path.relative(root, typedReportPath),
      ...descriptor(typedReportBytes),
    },
  },
  targetIndices,
  targetIndicesSha256: sha256(
    Buffer.from(`${JSON.stringify(targetIndices)}\n`),
  ),
  units,
  residues,
  directOwnerResidues: directOwnerRows.map(canonicalResidue),
  buildMacroResidues: buildMacroRows.map(canonicalResidue),
  summary: {
    units: units.length,
    residues: residues.length,
    directOwnerResidues: directOwnerRows.length,
    buildMacroResidues: buildMacroRows.length,
    correctedResidualResidues: residualRows.length,
    residueIdentitiesSha256: canonicalDigest(residues),
    correctedResidualIdentitiesSha256: canonicalDigest(
      residualRows.map(canonicalResidue),
    ),
  },
  buildMacros: {
    values: buildValues,
    countsByUnit: { 22119: 3 },
    sourceDeclaration: 'spawnSpare',
    sourceMarkers: ['cliVersion: MACRO.VERSION'],
  },
  sourceFiles: [
    {
      path: sourcePath,
      ...descriptor(sourceBytes),
      declarations,
    },
  ],
  evidenceIds: [...TARGET121_DAEMON_SPARE_EVIDENCE_IDS],
  ownerOverrides: TARGET121_DAEMON_SPARE_OWNER_OVERRIDES,
}

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`)
