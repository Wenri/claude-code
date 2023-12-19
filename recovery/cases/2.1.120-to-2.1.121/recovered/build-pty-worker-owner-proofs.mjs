import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../../../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET121_PTY_WORKER_EVIDENCE_IDS,
  TARGET121_PTY_WORKER_OWNER_OVERRIDES,
} from './pty-worker-owner-overrides.mjs'

const root = process.cwd()
const targetIndices = Object.freeze([19577, 19592, 19597])
const targetIndexSet = new Set(targetIndices)
const ownerPathByIndex = new Map(
  TARGET121_PTY_WORKER_OWNER_OVERRIDES.map(row => [
    row.targetIndex,
    row.paths[0],
  ]),
)
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
    correctedOwner: ownerPathByIndex.get(targetIndex),
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
if (reportRows.length !== 125) {
  throw new Error(`expected 125 PTY-worker residues, got ${reportRows.length}`)
}
const residues = reportRows.map(canonicalResidue)
const directOwnerRows = reportRows.filter(row => {
  const owner = ownerPathByIndex.get(row.structural.index).slice(4)
  return row.sourceMatches.includes(owner)
})
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
const compilerRows = residualRows.filter(row => !buildMacroRows.includes(row))
const compilerSignatures = compilerRows.map(row => [
  row.structural.index,
  row.literalKind,
  row.value,
])
const expectedCompilerSignatures = [
  [19592, 'property', 'pinToCurrentBinary'],
  [19597, 'property', 'ptyCols'],
  [19597, 'property', 'pinToCurrentBinary'],
  [19597, 'property', 'connectRv'],
  [19597, 'property', 'rvSockPath'],
  [19597, 'property', 'rv'],
  [19597, 'property', 'rv'],
]
if (JSON.stringify(compilerSignatures) !== JSON.stringify(expectedCompilerSignatures)) {
  throw new Error('PTY-worker compiler residue identities differ')
}
if (directOwnerRows.length !== 103 || buildMacroRows.length !== 15) {
  throw new Error('PTY-worker direct or build-macro residue counts differ')
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
const sourceSpecs = [
  {
    path: 'src/daemon/ptyHost.ts',
    declarations: ['runPtyHost'],
  },
  {
    path: 'src/daemon/supervisor.ts',
    declarations: [
      'pinnedWorkerLauncher',
      'defaultSpawnPty',
      'BackgroundHandle',
    ],
  },
]
const sourceFiles = sourceSpecs.map(spec => {
  const absolutePath = path.join(sourceRoot, spec.path.slice(4))
  const bytes = fs.readFileSync(absolutePath)
  const sourceFile = ts.createSourceFile(
    absolutePath,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declarations = []
  function visit(node) {
    if (
      node.name !== undefined &&
      ts.isIdentifier(node.name) &&
      spec.declarations.includes(node.name.text) &&
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
    ) {
      const start = node.getStart(sourceFile)
      const end = node.end
      declarations.push({
        name: node.name.text,
        kind: ts.isClassDeclaration(node) ? 'ClassDeclaration' : 'FunctionDeclaration',
        start,
        end,
        ...descriptor(bytes.subarray(start, end)),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  declarations.sort((a, b) => a.start - b.start)
  if (
    declarations.length !== spec.declarations.length ||
    spec.declarations.some(
      name => declarations.filter(row => row.name === name).length !== 1,
    )
  ) {
    throw new Error(`${spec.path} declarations differ`)
  }
  return { path: spec.path, ...descriptor(bytes), declarations }
})

const compilerMappings = [
  {
    targetIndex: 19592,
    targetResidues: [{ kind: 'property', value: 'pinToCurrentBinary', count: 1 }],
    sourcePath: 'src/daemon/supervisor.ts',
    declaration: 'pinnedWorkerLauncher',
    sourceMarkers: ['isInBundledMode()', 'process.execPath', 'process.argv[1]'],
    behavior:
      'The target option pinToCurrentBinary and pinnedWorkerLauncher both select the running bundled executable or the current script before spawning the private PTY host.',
  },
  {
    targetIndex: 19597,
    targetResidues: [
      { kind: 'property', value: 'ptyCols', count: 1 },
      { kind: 'property', value: 'pinToCurrentBinary', count: 1 },
      { kind: 'property', value: 'connectRv', count: 1 },
      { kind: 'property', value: 'rvSockPath', count: 1 },
      { kind: 'property', value: 'rv', count: 2 },
    ],
    sourcePath: 'src/daemon/supervisor.ts',
    declaration: 'BackgroundHandle',
    sourceMarkers: [
      'private cols = 200',
      'private rendezvous?:',
      'private rendezvousSocket:',
      'private connectRendezvous(): void',
      'defaultSpawnPty()',
    ],
    behavior:
      'The target private names ptyCols/connectRv/rvSockPath/rv are compiler-era names for the source cols/connectRendezvous/rendezvousSocket/rendezvous state; the pinned launcher is injected as the default BackgroundHandle spawn dependency.',
  },
]

const fixture = {
  schemaVersion: 1,
  case: '2.1.120-to-2.1.121',
  targetVersion: '2.1.121',
  criterion: 'target121-pty-worker-exact-owner-and-compiler-proof-v1',
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
  targetIndicesSha256: sha256(Buffer.from(`${JSON.stringify(targetIndices)}\n`)),
  units,
  residues,
  directOwnerResidues: directOwnerRows.map(canonicalResidue),
  buildMacroResidues: buildMacroRows.map(canonicalResidue),
  compilerResidues: compilerRows.map(canonicalResidue),
  summary: {
    units: units.length,
    residues: residues.length,
    directOwnerResidues: directOwnerRows.length,
    buildMacroResidues: buildMacroRows.length,
    compilerResidues: compilerRows.length,
    correctedResidualResidues: residualRows.length,
    residueIdentitiesSha256: canonicalDigest(residues),
    correctedResidualIdentitiesSha256: canonicalDigest(
      residualRows.map(canonicalResidue),
    ),
  },
  buildMacros: {
    values: buildValues,
    countsByUnit: { 19577: 3, 19597: 12 },
    sourceMarkers: {
      'src/daemon/ptyHost.ts': ['MACRO.VERSION'],
      'src/daemon/supervisor.ts': ['MACRO.VERSION'],
    },
  },
  compilerMappings,
  sourceFiles,
  evidenceIds: [...TARGET121_PTY_WORKER_EVIDENCE_IDS],
  ownerOverrides: TARGET121_PTY_WORKER_OWNER_OVERRIDES,
}

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`)
