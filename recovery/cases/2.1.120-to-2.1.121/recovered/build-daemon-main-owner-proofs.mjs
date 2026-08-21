import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../../../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET121_DAEMON_MAIN_EVIDENCE_IDS,
  TARGET121_DAEMON_MAIN_OWNER_OVERRIDES,
} from './daemon-main-owner-overrides.mjs'
import { buildTarget121DaemonStatusProcStartOutput } from './replay-daemon-status-supervisor-proc-start-source-gap.mjs'

const root = process.cwd()
const targetIndices = Object.freeze([22207])
const targetIndexSet = new Set(targetIndices)
const correctedOwner = 'src/daemon/main.ts'
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
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}
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
if (reportRows.length !== 111) {
  throw new Error(`expected 111 daemon-main residues, got ${reportRows.length}`)
}
const residues = reportRows.map(canonicalResidue)
const directOwnerRows = reportRows.filter(row =>
  row.sourceMatches.includes('daemon/main.ts'),
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
const compilerRows = residualRows.filter(row => !buildMacroRows.includes(row))
const compilerSignatures = compilerRows.map(row => [
  row.structural.index,
  row.literalKind,
  row.value,
])
const expectedCompilerSignatures = [
  [22207, 'string', 'regenerate failed: '],
  [22207, 'string', ') is still running — stop it with '],
  [22207, 'string', '`taskkill /PID '],
]
if (
  JSON.stringify(compilerSignatures) !==
  JSON.stringify(expectedCompilerSignatures)
) {
  throw new Error('daemon-main compiler residue identities differ')
}
if (
  directOwnerRows.length !== 102 ||
  buildMacroRows.length !== 6 ||
  compilerRows.length !== 3
) {
  throw new Error('daemon-main residue accounting differs')
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
const expectedDeclarations = ['showStatus', 'daemonMain']
function sourceState(name, source) {
  const bytes = Buffer.from(source)
  const sourceFile = ts.createSourceFile(
    absoluteSourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  if (sourceFile.parseDiagnostics.length !== 0) {
    throw new Error(`${sourcePath} ${name} source does not parse`)
  }
  const declarations = []
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name !== undefined &&
      expectedDeclarations.includes(node.name.text)
    ) {
      const start = node.getStart(sourceFile)
      const end = node.end
      const declaration = source.slice(start, end)
      declarations.push({
        name: node.name.text,
        kind: 'FunctionDeclaration',
        start,
        end,
        chars: declaration.length,
        ...descriptor(declaration),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  declarations.sort((a, b) => a.start - b.start)
  if (
    declarations.length !== expectedDeclarations.length ||
    expectedDeclarations.some(
      declarationName =>
        declarations.filter(row => row.name === declarationName).length !== 1,
    )
  ) {
    throw new Error(`${sourcePath} ${name} declarations differ`)
  }
  return {
    name,
    path: sourcePath,
    ...descriptor(bytes),
    chars: source.length,
    declarations,
  }
}
const rawSource = fs.readFileSync(absoluteSourcePath, 'utf8')
const packageSource = buildTarget121DaemonStatusProcStartOutput(rawSource)
const sourceFiles = [
  sourceState('raw', rawSource),
  sourceState('postPrunePackage', packageSource),
]

const compilerMappings = [
  {
    targetIndex: 22207,
    targetResidues: [
      { kind: 'string', value: 'regenerate failed: ', count: 1 },
      {
        kind: 'string',
        value: ') is still running — stop it with ',
        count: 1,
      },
      { kind: 'string', value: '`taskkill /PID ', count: 1 },
    ],
    sourcePath,
    declarations: ['daemonMain'],
    sourceMarkers: [
      "${regenerated ? 'regenerate' : sub} failed: ${result.error}",
      'supervisor (pid=${running.pid}) is still running — stop it with',
      'taskkill /PID ${running.pid}',
      'or close the terminal it was started in.',
    ],
    behavior:
      'The minifier specializes the regenerated-service conditional and splits the nested Windows taskkill template into three target literals; both complete templates are pinned inside the exact daemonMain source declaration.',
  },
]

const fixture = {
  schemaVersion: 1,
  case: '2.1.120-to-2.1.121',
  targetVersion: '2.1.121',
  criterion: 'target121-daemon-main-exact-owner-and-compiler-proof-v1',
  status: 'evolution-aware-complete-unit-source-coverage-owner-proof',
  claim:
    'Target121 u22207 is the complete daemon CLI dispatcher owned by src/daemon/main.ts, not src/main.tsx. The existing nonmatched whole-unit owner correction is already wired and its exact remaining production-strict partition is six build substitutions plus three compiler-split source templates. Raw and postPrune package source contain byte-identical showStatus and daemonMain declarations; their file offsets differ only because of the separately authenticated daemon-status writer replay. No new case, matched-static admission, or source replay is authorized.',
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
    postPruneTypedReport: {
      path: path.relative(root, typedReportPath),
      bytes: 25396455,
      sha256:
        'f63079907d813bffaf98cb89d28b8b2e183df9fe2e1c72b21f10fa2fd5c0a3f4',
    },
    postPruneSourceCoverage: {
      path: 'recovery/cases/2.1.120-to-2.1.121/semantic/source-coverage.json.gz',
      bytes: 345989,
      sha256:
        '05ac9243d7cee276bc51c8eb0c8e4e3678f96d941560cae620d05af240d7cdd4',
      rawBytes: 2968244,
      rawSha256:
        '7be9d68b6144e09290d58e3dae17f21df9536852b5f8415e777c9f7dd3ad1c06',
    },
    postDaemonOwnerTypedReport: {
      path: path.relative(root, typedReportPath),
      bytes: 25369097,
      sha256:
        '2126a6898cf52b4ad639c18d51dddd24d9adfd8df73470cf2ab4298700a66bf3',
    },
    postDaemonOwnerSourceCoverage: {
      path: 'recovery/cases/2.1.120-to-2.1.121/semantic/source-coverage.json.gz',
      bytes: 347677,
      sha256:
        '91e279daac39df4d94f0bc34e90eb31b875b5fdeeabeceb0dc83d74660de6b83',
      rawBytes: 2974761,
      rawSha256:
        '8b53acac16477ad92958b40bc7b9c44cba07b6ea48671adacc5c94f7235b173f',
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
    countsByUnit: { 22207: 6 },
    sourceDeclaration: 'showStatus',
    sourceMarkers: ['running.version !== MACRO.VERSION', '${MACRO.VERSION}'],
  },
  compilerMappings,
  sourceFiles,
  physicalPhases: {
    preIntegration: {
      typedReport: {
        bytes: 31092432,
        sha256:
          'f76cfab38ea9cf241a60562c7e697b0db3fbbacd7bda281737a37e052502c929',
      },
      owner: {
        units: 1,
        rows: 111,
        identitiesSha256:
          'bfe94c838dc2b120b46ce2af5c437c4dae9907e19483d40ebdd33066bbfa58bd',
      },
      strict: {
        units: 1,
        rows: 9,
        identitiesSha256:
          '081c76fc8a3fa413ecb395d5d81d69713fed50147649cba59a492af815c67e78',
      },
    },
    postPrune: {
      typedReport: {
        bytes: 25396455,
        sha256:
          'f63079907d813bffaf98cb89d28b8b2e183df9fe2e1c72b21f10fa2fd5c0a3f4',
      },
      sourceCoverage: {
        bytes: 345989,
        sha256:
          '05ac9243d7cee276bc51c8eb0c8e4e3678f96d941560cae620d05af240d7cdd4',
        rawBytes: 2968244,
        rawSha256:
          '7be9d68b6144e09290d58e3dae17f21df9536852b5f8415e777c9f7dd3ad1c06',
      },
      owner: {
        units: 1,
        rows: 38,
        identitiesSha256:
          'a66e12e26b921cdd423f7c79ffa8e105670097e54e917016ee5538a52b956cef',
      },
      addedOwner: {
        units: 1,
        rows: 12,
        identitiesSha256:
          'a0b51c4378c0e369ebc5d9dbb68145ac806d13a742729e05631f35ae27a17fd6',
      },
      unclassifiedAdded: {
        units: 0,
        rows: 0,
        identitiesSha256:
          '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
      },
      strict: {
        units: 1,
        rows: 9,
        identitiesSha256:
          '081c76fc8a3fa413ecb395d5d81d69713fed50147649cba59a492af815c67e78',
        composition: { compilerRows: 3, buildMacroRows: 6 },
      },
      projectionReason:
        'All intervening postPrune proof/replay groups are disjoint from u22207; its already-corrected owner and exact nine-row strict tail are unchanged.',
    },
    postDaemonOwner: {
      typedReport: {
        bytes: 25369097,
        sha256:
          '2126a6898cf52b4ad639c18d51dddd24d9adfd8df73470cf2ab4298700a66bf3',
      },
      sourceCoverage: {
        bytes: 347677,
        sha256:
          '91e279daac39df4d94f0bc34e90eb31b875b5fdeeabeceb0dc83d74660de6b83',
        rawBytes: 2974761,
        rawSha256:
          '8b53acac16477ad92958b40bc7b9c44cba07b6ea48671adacc5c94f7235b173f',
      },
      owner: {
        units: 1,
        rows: 38,
        identitiesSha256:
          'a66e12e26b921cdd423f7c79ffa8e105670097e54e917016ee5538a52b956cef',
        physicalIdentities: {
          bytes: 2781,
          sha256:
            'db6eb6a7bdb96fd670663f571da5ca8ae27a51361107dd3a367789d7f80caf34',
        },
      },
      addedOwner: {
        units: 1,
        rows: 12,
        identitiesSha256:
          'a0b51c4378c0e369ebc5d9dbb68145ac806d13a742729e05631f35ae27a17fd6',
        physicalIdentities: {
          bytes: 810,
          sha256:
            'acccc95f602f4144224ce00dfa1d336532729a798dbaee515ec6e8a79689288c',
        },
      },
      unclassifiedAdded: {
        units: 0,
        rows: 0,
        identitiesSha256:
          '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
      },
      strict: {
        units: 1,
        rows: 9,
        identitiesSha256:
          '081c76fc8a3fa413ecb395d5d81d69713fed50147649cba59a492af815c67e78',
        physicalIdentities: {
          bytes: 640,
          sha256:
            'f9732dd9bc896832649579c7ddede7a834dd2f47a7fce3ecdea637ab96bf4674',
        },
        composition: { compilerRows: 3, buildMacroRows: 6 },
      },
      projectionReason:
        'The u22170/u22174 daemon worker-owner integration and all other intervening proof groups are disjoint from u22207; the corrected daemon-main coverage row, 38 owner rows, 12 added-owner rows, and nine-row strict tail remain exact.',
    },
  },
  coverageClaim: {
    mode: 'nonmatched-source-coverage-owner-override',
    matchedStatic: false,
    generatorWiringAlreadyPresent: true,
    targetIndex: 22207,
    structuralClass: 'unresolved',
    disposition: 'source-runtime-covered',
    ownerPaths: ['src/daemon/main.ts'],
    rowCanonical: {
      bytes: 874,
      sha256:
        '7a9bcb294e1a137a3235a719585c735d4912e0a3258f421a8b1c485dbb15c635',
    },
  },
  decision: {
    existingProofClosesCurrentStrictPartition: true,
    newCaseRequired: false,
    sourceReplayAuthorized: false,
    matchedStaticHarnessMode: false,
    combinedHarnessMode: 'source-coverage-static-proof',
    expectedProductionStrictImpact: { units: -1, rows: -9 },
  },
  evidenceIds: [...TARGET121_DAEMON_MAIN_EVIDENCE_IDS],
  ownerOverrides: TARGET121_DAEMON_MAIN_OWNER_OVERRIDES,
}

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`)
