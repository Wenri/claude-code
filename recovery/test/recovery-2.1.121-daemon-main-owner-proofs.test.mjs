import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET121_DAEMON_MAIN_EVIDENCE_IDS,
  TARGET121_DAEMON_MAIN_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/daemon-main-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-daemon-main-owner-proofs.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '9b553ff3c0e895fccadf96d93225a00e80186fb775c7218784047e2b6fc5b6eb'
const baselineBundlePath =
  process.env.CLAUDE_CODE_2_1_120_BUNDLE ??
  path.join(root, fixture.inputs.baselineBundle.path)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_121_BUNDLE ??
  path.join(root, fixture.inputs.targetBundle.path)
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src')
const typedReportPath =
  process.env.CLAUDE_CODE_2_1_121_TYPED_REPORT ??
  path.join(
    root,
    '.recovery-tmp/residue-audits/2.1.120-to-2.1.121.typed-audit.json',
  )

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}
const canonicalDigest = rows =>
  sha256(Buffer.from(`${JSON.stringify(rows)}\n`, 'utf8'))

function readCoverage() {
  const gzip = fs.readFileSync(
    path.join(
      root,
      'recovery/cases/2.1.120-to-2.1.121/semantic/source-coverage.json.gz',
    ),
  )
  const raw = gunzipSync(gzip)
  return { coverage: JSON.parse(raw), gzip, raw }
}

function artifactDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function selectPhysicalPhase(reportDescriptor, coverageDescriptor) {
  const phases = ['postPrune', 'postDaemonOwner']
  const matches = phases.filter(name => {
    const phase = fixture.physicalPhases[name]
    return (
      JSON.stringify(reportDescriptor) === JSON.stringify(phase.typedReport) &&
      JSON.stringify(coverageDescriptor) ===
        JSON.stringify(artifactDescriptor(phase.sourceCoverage))
    )
  })
  assert.equal(matches.length, 1, 'unknown or hybrid daemon-main artifact pair')
  return fixture.physicalPhases[matches[0]]
}

function canonicalPhysicalResidue(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

test('target121 daemon-main fixture pins the complete CLI unit and all 111 coarse-main residues', t => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.equal(
    fixture.criterion,
    'target121-daemon-main-exact-owner-and-compiler-proof-v1',
  )
  assert.deepEqual(
    fixture.targetIndices,
    TARGET121_DAEMON_MAIN_OWNER_OVERRIDES.map(row => row.targetIndex),
  )
  assert.deepEqual(fixture.summary, {
    units: 1,
    residues: 111,
    directOwnerResidues: 102,
    buildMacroResidues: 6,
    compilerResidues: 3,
    correctedResidualResidues: 9,
    residueIdentitiesSha256:
      'bfe94c838dc2b120b46ce2af5c437c4dae9907e19483d40ebdd33066bbfa58bd',
    correctedResidualIdentitiesSha256:
      '081c76fc8a3fa413ecb395d5d81d69713fed50147649cba59a492af815c67e78',
  })
  assert.equal(
    canonicalDigest(fixture.residues),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.equal(
    canonicalDigest(
      [...fixture.buildMacroResidues, ...fixture.compilerResidues].sort(
        (a, b) => a[0] - b[0] || a[3] - b[3] || a[4] - b[4],
      ),
    ),
    fixture.summary.correctedResidualIdentitiesSha256,
  )
  assert.deepEqual(fixture.evidenceIds, [
    ...TARGET121_DAEMON_MAIN_EVIDENCE_IDS,
  ])
  assert.deepEqual(fixture.ownerOverrides, [
    ...TARGET121_DAEMON_MAIN_OWNER_OVERRIDES,
  ])

  if (!fs.existsSync(baselineBundlePath) || !fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target120/121 bundles are unavailable')
    return
  }
  const baseline = fs.readFileSync(baselineBundlePath)
  const target = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(baseline), {
    bytes: fixture.inputs.baselineBundle.bytes,
    sha256: fixture.inputs.baselineBundle.sha256,
  })
  assert.deepEqual(descriptor(target), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  const unit = fixture.units[0]
  const slice = target.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(slice), {
    bytes: unit.bytes,
    sha256: unit.sha256,
  })
  assert.equal(unit.sourceHash, unit.sha256)
  for (const residue of fixture.residues) {
    const [targetIndex, , , start, end, , , sourceHash] = residue
    assert.equal(targetIndex, unit.targetIndex)
    assert.equal(sourceHash, unit.sourceHash)
    assert.ok(start >= unit.start && end <= unit.end && end > start)
  }
})

test('authenticated Target121 fragment is the complete daemon CLI dispatcher and status path', t => {
  if (!fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target121 bundle is unavailable')
    return
  }
  const target = fs.readFileSync(targetBundlePath)
  const unit = fixture.units[0]
  const text = target.subarray(unit.start, unit.end).toString('utf8')
  const ast = parse(text, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  for (const marker of [
    'Interactive hub requires a TTY. See `claude daemon --help`.',
    'claude daemon: background agents disabled (ZDR/3P/opt-out)',
    'tengu_daemon_startup_crash',
    'service binary missing',
    'regenerate failed:',
    'tengu_daemon_control',
    'taskkill /PID',
    'no daemon running',
    'holding this daemon open:',
    'warning: running daemon is ',
    'unknown subcommand:',
  ]) {
    assert.ok(text.includes(marker), marker)
  }

  const macroCounts = new Map()
  for (const residue of fixture.buildMacroResidues) {
    const [targetIndex, kind, value] = residue
    assert.equal(kind, 'string')
    assert.ok(fixture.buildMacros.values.includes(value))
    macroCounts.set(targetIndex, (macroCounts.get(targetIndex) ?? 0) + 1)
  }
  assert.deepEqual(
    Object.fromEntries([...macroCounts].sort(([a], [b]) => a - b)),
    fixture.buildMacros.countsByUnit,
  )
})

test('Target121 source AST and compiler mappings prove the corrected daemon main owner', async () => {
  const ts = await loadTypeScript()
  assert.deepEqual(
    fixture.sourceFiles.map(sourceFile => sourceFile.name),
    ['raw', 'postPrunePackage'],
  )
  const sourcePath = fixture.sourceFiles[0].path
  assert.ok(fixture.sourceFiles.every(sourceFile => sourceFile.path === sourcePath))
  const filename = path.join(sourceRoot, sourcePath.slice(4))
  const bytes = fs.readFileSync(filename)
  const text = bytes.toString('utf8')
  const expectedFile = fixture.sourceFiles.find(
    sourceFile =>
      sourceFile.bytes === bytes.length && sourceFile.sha256 === sha256(bytes),
  )
  assert.ok(expectedFile, 'source root is exact raw or postPrune package state')
  assert.deepEqual(descriptor(bytes), {
    bytes: expectedFile.bytes,
    sha256: expectedFile.sha256,
  })
  assert.equal(text.length, expectedFile.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, expectedFile.path)
  const expectedNames = new Set(
    expectedFile.declarations.map(declaration => declaration.name),
  )
  const actualDeclarations = []
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name !== undefined &&
      expectedNames.has(node.name.text)
    ) {
      const start = node.getStart(sourceFile)
      const end = node.end
      const declaration = text.slice(start, end)
      actualDeclarations.push({
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
  actualDeclarations.sort((a, b) => a.start - b.start)
  assert.deepEqual(actualDeclarations, expectedFile.declarations)
  const declarationContentDescriptors = sourceFile =>
    sourceFile.declarations.map(
      ({ name, kind, chars, bytes: declarationBytes, sha256: declarationSha }) => ({
        name,
        kind,
        chars,
        bytes: declarationBytes,
        sha256: declarationSha,
      }),
    )
  assert.deepEqual(
    declarationContentDescriptors(fixture.sourceFiles[0]),
    declarationContentDescriptors(fixture.sourceFiles[1]),
    'raw and postPrune declaration bytes are identical despite shifted offsets',
  )

  for (const marker of [
    'async function showStatus()',
    'export async function daemonMain(args: string[])',
    "case 'run':",
    "case 'stop':",
    "case 'status':",
    "case 'hub':",
    'running.version !== MACRO.VERSION',
    'but this claude is ${MACRO.VERSION}',
  ]) {
    assert.ok(text.includes(marker), marker)
  }
  for (const mapping of fixture.compilerMappings) {
    assert.equal(mapping.sourcePath, expectedFile.path)
    for (const marker of mapping.sourceMarkers) {
      assert.ok(text.includes(marker), marker)
    }
  }

  const compilerCounts = new Map()
  for (const residue of fixture.compilerResidues) {
    const [targetIndex, kind, value] = residue
    const key = JSON.stringify([targetIndex, kind, value])
    compilerCounts.set(key, (compilerCounts.get(key) ?? 0) + 1)
  }
  const mappedCounts = new Map()
  for (const mapping of fixture.compilerMappings) {
    for (const residue of mapping.targetResidues) {
      mappedCounts.set(
        JSON.stringify([mapping.targetIndex, residue.kind, residue.value]),
        residue.count,
      )
    }
  }
  assert.deepEqual(compilerCounts, mappedCounts)
  assert.ok(
    TARGET121_DAEMON_MAIN_OWNER_OVERRIDES.every(
      row => !row.paths.includes('src/main.tsx'),
    ),
  )
})

test('Target121 daemon-main phase evolution preserves exactly the nine-row strict tail', () => {
  const strictRows = [...fixture.buildMacroResidues, ...fixture.compilerResidues].sort(
    (a, b) => a[0] - b[0] || a[3] - b[3] || a[4] - b[4],
  )
  assert.deepEqual(fixture.physicalPhases.preIntegration, {
    typedReport: {
      bytes: fixture.inputs.typedReport.bytes,
      sha256: fixture.inputs.typedReport.sha256,
    },
    owner: {
      units: 1,
      rows: 111,
      identitiesSha256: fixture.summary.residueIdentitiesSha256,
    },
    strict: {
      units: 1,
      rows: 9,
      identitiesSha256: fixture.summary.correctedResidualIdentitiesSha256,
    },
  })
  assert.deepEqual(fixture.physicalPhases.postPrune.typedReport, {
    bytes: fixture.inputs.postPruneTypedReport.bytes,
    sha256: fixture.inputs.postPruneTypedReport.sha256,
  })
  assert.deepEqual(
    fixture.physicalPhases.postPrune.sourceCoverage,
    Object.fromEntries(
      Object.entries(fixture.inputs.postPruneSourceCoverage).filter(
        ([key]) => key !== 'path',
      ),
    ),
  )
  assert.deepEqual(fixture.physicalPhases.postPrune.owner, {
    units: 1,
    rows: 38,
    identitiesSha256:
      'a66e12e26b921cdd423f7c79ffa8e105670097e54e917016ee5538a52b956cef',
  })
  assert.deepEqual(fixture.physicalPhases.postPrune.addedOwner, {
    units: 1,
    rows: 12,
    identitiesSha256:
      'a0b51c4378c0e369ebc5d9dbb68145ac806d13a742729e05631f35ae27a17fd6',
  })
  assert.deepEqual(fixture.physicalPhases.postPrune.unclassifiedAdded, {
    units: 0,
    rows: 0,
    identitiesSha256:
      '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
  })
  assert.deepEqual(fixture.physicalPhases.postPrune.strict, {
    units: 1,
    rows: 9,
    identitiesSha256: canonicalDigest(strictRows),
    composition: { compilerRows: 3, buildMacroRows: 6 },
  })
  assert.deepEqual(fixture.physicalPhases.postDaemonOwner.typedReport, {
    bytes: fixture.inputs.postDaemonOwnerTypedReport.bytes,
    sha256: fixture.inputs.postDaemonOwnerTypedReport.sha256,
  })
  assert.deepEqual(
    fixture.physicalPhases.postDaemonOwner.sourceCoverage,
    Object.fromEntries(
      Object.entries(fixture.inputs.postDaemonOwnerSourceCoverage).filter(
        ([key]) => key !== 'path',
      ),
    ),
  )
  assert.deepEqual(
    {
      units: fixture.physicalPhases.postDaemonOwner.owner.units,
      rows: fixture.physicalPhases.postDaemonOwner.owner.rows,
      identitiesSha256:
        fixture.physicalPhases.postDaemonOwner.owner.identitiesSha256,
    },
    fixture.physicalPhases.postPrune.owner,
  )
  assert.deepEqual(
    {
      units: fixture.physicalPhases.postDaemonOwner.addedOwner.units,
      rows: fixture.physicalPhases.postDaemonOwner.addedOwner.rows,
      identitiesSha256:
        fixture.physicalPhases.postDaemonOwner.addedOwner.identitiesSha256,
    },
    fixture.physicalPhases.postPrune.addedOwner,
  )
  assert.deepEqual(
    {
      units: fixture.physicalPhases.postDaemonOwner.strict.units,
      rows: fixture.physicalPhases.postDaemonOwner.strict.rows,
      identitiesSha256:
        fixture.physicalPhases.postDaemonOwner.strict.identitiesSha256,
      composition: fixture.physicalPhases.postDaemonOwner.strict.composition,
    },
    fixture.physicalPhases.postPrune.strict,
  )
  assert.equal(
    selectPhysicalPhase(
      fixture.physicalPhases.postPrune.typedReport,
      artifactDescriptor(fixture.physicalPhases.postPrune.sourceCoverage),
    ),
    fixture.physicalPhases.postPrune,
  )
  assert.equal(
    selectPhysicalPhase(
      fixture.physicalPhases.postDaemonOwner.typedReport,
      artifactDescriptor(
        fixture.physicalPhases.postDaemonOwner.sourceCoverage,
      ),
    ),
    fixture.physicalPhases.postDaemonOwner,
  )
  assert.throws(
    () =>
      selectPhysicalPhase(
        fixture.physicalPhases.postPrune.typedReport,
        artifactDescriptor(
          fixture.physicalPhases.postDaemonOwner.sourceCoverage,
        ),
      ),
    /unknown or hybrid/,
  )
  assert.throws(
    () =>
      selectPhysicalPhase(
        { bytes: 1, sha256: 'unknown' },
        { bytes: 1, sha256: 'unknown' },
      ),
    /unknown or hybrid/,
  )
  assert.deepEqual(fixture.coverageClaim, {
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
  })
  assert.deepEqual(fixture.decision, {
    existingProofClosesCurrentStrictPartition: true,
    newCaseRequired: false,
    sourceReplayAuthorized: false,
    matchedStaticHarnessMode: false,
    combinedHarnessMode: 'source-coverage-static-proof',
    expectedProductionStrictImpact: { units: -1, rows: -9 },
  })
})

test('Target121 daemon-main coverage is either frozen pre-integration or completely corrected', () => {
  const typedReportBytes = fs.readFileSync(typedReportPath)
  const report = JSON.parse(typedReportBytes)
  const { coverage, gzip, raw } = readCoverage()
  const phase = selectPhysicalPhase(
    descriptor(typedReportBytes),
    descriptor(gzip),
  )
  assert.deepEqual(descriptor(raw), {
    bytes: phase.sourceCoverage.rawBytes,
    sha256: phase.sourceCoverage.rawSha256,
  })
  if (phase === fixture.physicalPhases.postDaemonOwner) {
    const physicalRows = report.rows
      .filter(row => row.structural.index === fixture.coverageClaim.targetIndex)
      .map(canonicalPhysicalResidue)
    const ownerRows = report.sourceRuntimeOwnerResidueRows
      .filter(row => row.structural.index === fixture.coverageClaim.targetIndex)
      .map(canonicalPhysicalResidue)
    const addedOwnerRows = report.sourceRuntimeAddedOwnerResidueRows
      .filter(row => row.structural.index === fixture.coverageClaim.targetIndex)
      .map(canonicalPhysicalResidue)
    assert.deepEqual(descriptor(JSON.stringify(physicalRows)), {
      ...phase.strict.physicalIdentities,
    })
    assert.deepEqual(descriptor(JSON.stringify(ownerRows)), {
      ...phase.owner.physicalIdentities,
    })
    assert.deepEqual(descriptor(JSON.stringify(addedOwnerRows)), {
      ...phase.addedOwner.physicalIdentities,
    })
  }
  const ownerById = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const expected = TARGET121_DAEMON_MAIN_OWNER_OVERRIDES[0]
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === expected.targetIndex,
  )
  assert.ok(row, expected.key)
  const paths = row.ownerIds.map(id => ownerById.get(id)).sort()
  const ownerSignal =
    JSON.stringify(paths) === JSON.stringify([...expected.paths].sort())
  const evidenceSignal = row.evidenceIds.some(id =>
    TARGET121_DAEMON_MAIN_EVIDENCE_IDS.includes(id),
  )
  if (!ownerSignal && !evidenceSignal) {
    assert.deepEqual(paths, ['src/main.tsx'])
    assert.deepEqual(row.evidenceIds, [
      'source-map-attribution',
      'semantic-test',
    ])
    return
  }
  assert.ok(ownerSignal && evidenceSignal, 'partial daemon-main integration')
  assert.equal(row.disposition, 'source-runtime-covered')
  assert.equal(row.structuralClass, fixture.coverageClaim.structuralClass)
  assert.deepEqual(paths, [...expected.paths])
  assert.deepEqual(row.evidenceIds, [...expected.evidenceIds])
  assert.equal(row.behavior, expected.behavior)
  assert.deepEqual(descriptor(Buffer.from(JSON.stringify(row))), {
    bytes: fixture.coverageClaim.rowCanonical.bytes,
    sha256: fixture.coverageClaim.rowCanonical.sha256,
  })
  for (const evidenceId of expected.evidenceIds) {
    assert.ok(
      coverage.evidence.some(evidence => evidence.id === evidenceId),
      evidenceId,
    )
  }
})

test('Target121 daemon-main proof builder reproduces the frozen fixture', t => {
  if (!fs.existsSync(targetBundlePath)) {
    t.skip('authenticated Target121 bundle is unavailable')
    return
  }
  if (!fs.existsSync(typedReportPath)) {
    t.skip('frozen Target121 typed report is unavailable')
    return
  }
  const typedReportBytes = fs.readFileSync(typedReportPath)
  if (
    JSON.stringify(descriptor(typedReportBytes)) !==
    JSON.stringify(fixture.inputs.typedReport)
  ) {
    t.skip('live Target121 typed report is newer than the frozen builder input')
    return
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        root,
        'recovery/cases/2.1.120-to-2.1.121/recovered/build-daemon-main-owner-proofs.mjs',
      ),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_CODE_2_1_121_TYPED_REPORT: typedReportPath,
      },
    },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), fixture)
})
