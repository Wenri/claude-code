import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/daemon-spare-connect-owner-evidence.mjs'

const {
  TARGET121_DAEMON_SPARE_CONNECT_EVIDENCE_IDS,
  TARGET121_DAEMON_SPARE_CONNECT_OWNER_EVIDENCE,
} = ownerEvidenceModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-daemon-spare-connect-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '5d0b6c82d65e529d832e8e4e3b768b28f6a861a02ff1df661460b6602cb21769'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function matchesDescriptor(actual, expected) {
  return actual.bytes === expected.bytes && actual.sha256 === expected.sha256
}

function canonicalDescriptor(value) {
  return descriptor(Buffer.from(JSON.stringify(value)))
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function selectArtifactSnapshot(reportDescriptor, coverageDescriptor) {
  const matches = [
    ['postDangerous', fixture.inputs.frozenPostDangerousSnapshot],
    ['postPrune', fixture.inputs.frozenPostPruneSnapshot],
    ['postDaemonOwner', fixture.inputs.frozenPostDaemonOwnerSnapshot],
  ].filter(
    ([, snapshot]) =>
      matchesDescriptor(reportDescriptor, snapshot.typedReport) &&
      matchesDescriptor(coverageDescriptor, snapshot.sourceCoverage),
  )
  assert.equal(
    matches.length,
    1,
    'daemon-spare-connect proof requires one exact known report/coverage phase; unknown and hybrid pairs are forbidden',
  )
  return matches[0]
}

function reportIdentity(row) {
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

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function completeUnit(bundle, expected) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected))
  const text = bytes.toString('utf8')
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, expected.nodeType)
  assert.equal(ast.body[0].id?.name, expected.name)
  assert.equal(
    [...tokenizer(text, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  return { ast, text }
}

function connectStringCoordinates(bundle) {
  return [
    ...tokenizer(bundle.toString('utf8'), { ecmaVersion: 'latest' }),
  ]
    .filter(token => token.type.label === 'string' && token.value === 'connect')
    .map(token => [token.start, token.end])
}

function exactTextDescriptor(text, start, end) {
  const value = text.slice(start, end)
  return {
    start,
    end,
    chars: value.length,
    ...descriptor(value),
  }
}

function parseSource(filename, scriptKind) {
  const ts = typescript()
  const bytes = fs.readFileSync(filename)
  const text = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [])
  return { bytes, sourceFile, text, ts }
}

function sourceSpareGraph(parsed) {
  const { sourceFile, text, ts } = parsed
  const declarations = new Map()
  const netImports = []
  const connectCalls = []
  const connectLiterals = []
  const sendClaimOnceCalls = []
  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === 'net'
    ) {
      netImports.push(
        exactTextDescriptor(text, node.getStart(sourceFile), node.end),
      )
    }
    if (
      ts.isFunctionDeclaration(node) &&
      ['sendClaimOnce', 'sendSpareClaim', 'reapOrphanSpares'].includes(
        node.name?.text,
      )
    ) {
      declarations.set(node.name.text, {
        node,
        descriptor: exactTextDescriptor(
          text,
          node.getStart(sourceFile),
          node.end,
        ),
      })
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(sourceFile)
      if (name === 'connect') {
        connectCalls.push(
          exactTextDescriptor(text, node.getStart(sourceFile), node.end),
        )
      }
      if (name === 'sendClaimOnce') {
        sendClaimOnceCalls.push(
          exactTextDescriptor(text, node.getStart(sourceFile), node.end),
        )
      }
    }
    if (ts.isStringLiteral(node) && node.text === 'connect') {
      connectLiterals.push(
        exactTextDescriptor(text, node.getStart(sourceFile), node.end),
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return {
    connectCalls,
    connectLiterals,
    declarations,
    netImports,
    sendClaimOnceCalls,
  }
}

function sourceSupervisorGraph(parsed) {
  const { sourceFile, text, ts } = parsed
  const imports = []
  const calls = new Map()
  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === './spare.js'
    ) {
      imports.push(
        exactTextDescriptor(text, node.getStart(sourceFile), node.end),
      )
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(sourceFile)
      if (['sendSpareClaim', 'reapOrphanSpares'].includes(name)) {
        const rows = calls.get(name) ?? []
        rows.push(
          exactTextDescriptor(text, node.getStart(sourceFile), node.end),
        )
        calls.set(name, rows)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { calls, imports }
}

function withoutChars(actual) {
  const { chars: _chars, ...rest } = actual
  return rest
}

test(
  'fixture freezes two connect rows without a whole-unit override',
  { skip: !selected },
  () => {
    assert.deepEqual(descriptor(fixtureBytes), {
      bytes: fixtureBytes.length,
      sha256: FIXTURE_SHA256,
    })
    assert.deepEqual(
      descriptor(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.caseFiles.helper.path),
        ),
      ),
      expectedDescriptor(fixture.caseFiles.helper),
    )
    assert.deepEqual(
      [...TARGET121_DAEMON_SPARE_CONNECT_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.equal(TARGET121_DAEMON_SPARE_CONNECT_OWNER_EVIDENCE.length, 2)
    assert.ok(Object.isFrozen(TARGET121_DAEMON_SPARE_CONNECT_OWNER_EVIDENCE))
    assert.equal(
      Object.keys(ownerEvidenceModule).some(name => /OVERRIDES?/.test(name)),
      false,
    )

    const rows = TARGET121_DAEMON_SPARE_CONNECT_OWNER_EVIDENCE.map(item => {
      assert.deepEqual([...item.paths], ['src/daemon/spare.ts'])
      assert.equal(item.residues.length, 1)
      const residue = item.residues[0]
      return [
        item.targetIndex,
        residue.literalKind,
        residue.value,
        residue.start,
        residue.end,
        residue.baselineCount,
        residue.targetOccurrenceNumber,
        true,
      ]
    })
    assert.deepEqual(rows, fixture.rowBoundary.admittedRows)
    assert.deepEqual(
      rows,
      fixture.inputs.frozenPostDangerousSnapshot.selectedRows,
    )
    assert.deepEqual(
      rows.map(canonicalDescriptor),
      fixture.inputs.frozenPostDangerousSnapshot.selectedRowDescriptors,
    )
    assert.deepEqual(
      canonicalDescriptor(rows),
      fixture.inputs.frozenPostDangerousSnapshot.aggregateRowDescriptor,
    )
    assert.deepEqual(
      fixture.inputs.frozenPostDangerousSnapshot.partitions,
      { owner: true, added: true, strict: false, unclassified: false },
    )
    const current = fixture.inputs.frozenPostDaemonOwnerSnapshot
    const reportBytes = readExact(
      artifactPath('CLAUDE_CODE_TARGET121_TYPED_REPORT', current.typedReport),
      current.typedReport,
      'exact post-prune Target121 typed report',
    )
    const coverageGzip = readExact(
      artifactPath(
        'CLAUDE_CODE_TARGET121_SOURCE_COVERAGE',
        current.sourceCoverage,
      ),
      current.sourceCoverage,
      'exact post-prune Target121 coverage',
    )
    assert.equal(
      selectArtifactSnapshot(
        descriptor(reportBytes),
        descriptor(coverageGzip),
      )[0],
      'postDaemonOwner',
    )
    assert.throws(
      () =>
        selectArtifactSnapshot(
          expectedDescriptor(fixture.inputs.frozenPostDangerousSnapshot.typedReport),
          descriptor(coverageGzip),
        ),
      /unknown and hybrid pairs are forbidden/,
    )
    const report = JSON.parse(reportBytes)
    for (const [unitName, targetIndex] of [
      ['u22124', 22124],
      ['u22125', 22125],
    ]) {
      assert.deepEqual(
        {
          owner: report.sourceRuntimeOwnerResidueRows.filter(
            item => item.structural.index === targetIndex,
          ).length,
          added: report.sourceRuntimeAddedOwnerResidueRows.filter(
            item => item.structural.index === targetIndex,
          ).length,
          strict: report.rows.filter(
            item => item.structural.index === targetIndex,
          ).length,
        },
        current.localCounts[unitName],
      )
    }
    const currentSelectedRows = report.sourceRuntimeAddedOwnerResidueRows
      .map(reportIdentity)
      .filter(identity =>
        rows.some(row => JSON.stringify(row) === JSON.stringify(identity)),
      )
    assert.deepEqual(currentSelectedRows, current.selectedRowsPresent)
    assert.deepEqual(descriptor(gunzipSync(coverageGzip)), {
      bytes: current.sourceCoverage.rawBytes,
      sha256: current.sourceCoverage.rawSha256,
    })
    assert.deepEqual(fixture.rowBoundary.impact, {
      owner: -2,
      added: -2,
      strict: 0,
      coverage: 0,
    })
    assert.equal(fixture.rowBoundary.wholeUnitOverride, false)
    assert.equal(fixture.rowBoundary.sourceReplay, false)
  },
)

test(
  'authenticated bundles prove complete added units and exact connect ordinals',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const baseline = readExact(baselinePath, fixture.inputs.baselineBundle)
    const target = readExact(targetPath, fixture.inputs.targetBundle)
    const structuralBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))

    const parsedUnits = new Map()
    for (const expected of fixture.targetUnits) {
      const region = structural.regions.find(
        candidate => candidate.target?.index === expected.targetIndex,
      )
      assert.ok(region)
      assert.equal(region.classification, expected.classification)
      assert.equal(
        region.unknownFreeIdentifierCount,
        expected.unknownFreeIdentifierCount,
      )
      assert.equal('baseline' in region, false)
      for (const name of [
        'nodeType',
        'parseStatus',
        'start',
        'end',
        'tokenCount',
        'coarseHash',
      ]) {
        assert.equal(region.target[name], expected[name])
      }
      assert.equal(region.target.sourceHash, expected.sha256)
      parsedUnits.set(expected.targetIndex, completeUnit(target, expected))
    }

    const baselineCoordinates = connectStringCoordinates(baseline)
    const targetCoordinates = connectStringCoordinates(target)
    assert.equal(
      baselineCoordinates.length,
      fixture.connectLiteralLineage.baseline.count,
    )
    assert.equal(
      targetCoordinates.length,
      fixture.connectLiteralLineage.target.count,
    )
    assert.deepEqual(
      canonicalDescriptor(baselineCoordinates),
      fixture.connectLiteralLineage.baseline.coordinatesDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(targetCoordinates),
      fixture.connectLiteralLineage.target.coordinatesDescriptor,
    )
    assert.deepEqual(
      baselineCoordinates.slice(-5),
      fixture.connectLiteralLineage.baseline.tail,
    )
    assert.deepEqual(
      targetCoordinates.slice(-5),
      fixture.connectLiteralLineage.target.tail,
    )
    assert.deepEqual(
      fixture.connectLiteralLineage.selectedTargetOrdinals.map(
        ordinal => targetCoordinates[ordinal - 1],
      ),
      fixture.connectLiteralLineage.selectedTargetCoordinates,
    )

    const claimUnit = parsedUnits.get(22124).text
    assert.equal(
      claimUnit.slice(
        fixture.rowBoundary.admittedRows[0][3] - fixture.targetUnits[0].start,
        fixture.rowBoundary.admittedRows[0][4] - fixture.targetUnits[0].start,
      ),
      '"connect"',
    )
    for (const marker of [
      'new Promise',
      '.connect(H)',
      '.once("error"',
      '.once("connect"',
      '.end(',
    ]) {
      assert.ok(claimUnit.includes(marker), marker)
    }

    const reapUnit = parsedUnits.get(22125).text
    assert.equal(
      reapUnit.slice(
        fixture.rowBoundary.admittedRows[1][3] - fixture.targetUnits[1].start,
        fixture.rowBoundary.admittedRows[1][4] - fixture.targetUnits[1].start,
      ),
      '"connect"',
    )
    for (const marker of [
      '==="windows"',
      '.endsWith(".pty.sock")',
      '.connect(z)',
      '.once("connect"',
      '.resume()',
      '{t:"kill",sig:"SIGTERM"}',
      '.destroy(),2000',
      '.endsWith(".pty.sock.err")',
      '.endsWith(".claim.sock")',
      'bg orphan-spare reap:',
    ]) {
      assert.ok(reapUnit.includes(marker), marker)
    }

    for (const caller of Object.values(fixture.compiledCallers)) {
      const bytes = target.subarray(caller.start, caller.end)
      assert.deepEqual(descriptor(bytes), expectedDescriptor(caller))
      const identifier = target
        .subarray(caller.callIdentifier.start, caller.callIdentifier.end)
        .toString('utf8')
      assert.ok(['hS5', 'Du6'].includes(identifier), identifier)
    }
  },
)

test(
  'Target121 spare and supervisor ASTs prove one cohesive true-owner graph',
  { skip: !selected },
  () => {
    const baselineRoot = path.resolve(
      repositoryRoot,
      fixture.inputs.sourceRoots.baseline,
    )
    assert.equal(fs.existsSync(path.join(baselineRoot, 'daemon/spare.ts')), false)
    const baselineSupervisor = readExact(
      path.join(baselineRoot, 'daemon/supervisor.ts'),
      fixture.sourceGraph.baseline.supervisorFile,
    ).toString('utf8')
    assert.equal(
      (baselineSupervisor.match(/from '\.\/spare\.js'/g) ?? []).length,
      fixture.sourceGraph.baseline.spareImportCount,
    )
    assert.equal(
      (baselineSupervisor.match(/\bsendSpareClaim\b/g) ?? []).length,
      fixture.sourceGraph.baseline.sendSpareClaimIdentifierCount,
    )
    assert.equal(
      (baselineSupervisor.match(/\breapOrphanSpares\b/g) ?? []).length,
      fixture.sourceGraph.baseline.reapOrphanSparesIdentifierCount,
    )

    const sourceRoot = path.resolve(
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        path.join(repositoryRoot, fixture.inputs.sourceRoots.raw),
    )
    const expectedState = fixture.sourceGraph.targetStates.find(state => {
      const sparePath = path.join(sourceRoot, 'daemon/spare.ts')
      const supervisorPath = path.join(sourceRoot, 'daemon/supervisor.ts')
      if (!fs.existsSync(sparePath) || !fs.existsSync(supervisorPath)) {
        return false
      }
      return (
        descriptor(fs.readFileSync(sparePath)).sha256 ===
          state.spareFile.sha256 &&
        descriptor(fs.readFileSync(supervisorPath)).sha256 ===
          state.supervisorFile.sha256
      )
    })
    assert.ok(expectedState, 'configured root is exact raw or package state')

    const ts = typescript()
    const spare = parseSource(
      path.join(sourceRoot, 'daemon/spare.ts'),
      ts.ScriptKind.TS,
    )
    const supervisor = parseSource(
      path.join(sourceRoot, 'daemon/supervisor.ts'),
      ts.ScriptKind.TS,
    )
    assert.deepEqual(descriptor(spare.bytes), expectedState.spareFile)
    assert.deepEqual(descriptor(supervisor.bytes), expectedState.supervisorFile)

    const spareGraph = sourceSpareGraph(spare)
    assert.equal(spareGraph.netImports.length, 1)
    assert.deepEqual(
      spareGraph.netImports[0],
      fixture.sourceGraph.netImport,
    )
    assert.equal(spareGraph.connectCalls.length, 3)
    assert.equal(spareGraph.connectLiterals.length, 3)
    assert.equal(spareGraph.sendClaimOnceCalls.length, 1)

    for (const expected of fixture.sourceGraph.declarations) {
      const actual = spareGraph.declarations.get(expected.name)
      assert.ok(actual, expected.name)
      assert.deepEqual(actual.descriptor, {
        start: expected.start,
        end: expected.end,
        chars: expected.chars,
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      if (expected.connectCall) {
        assert.ok(
          spareGraph.connectCalls.some(
            candidate =>
              candidate.start === expected.connectCall.start &&
              candidate.end === expected.connectCall.end &&
              candidate.sha256 === expected.connectCall.sha256,
          ),
        )
        assert.ok(
          spareGraph.connectLiterals.some(
            candidate =>
              candidate.start === expected.connectLiteral.start &&
              candidate.end === expected.connectLiteral.end &&
              candidate.sha256 === expected.connectLiteral.sha256,
          ),
        )
      }
      if (expected.sendClaimOnceCall) {
        assert.deepEqual(
          withoutChars(spareGraph.sendClaimOnceCalls[0]),
          expected.sendClaimOnceCall,
        )
      }
    }

    const claimText = spareGraph.declarations
      .get('sendClaimOnce')
      .node.getText(spare.sourceFile)
    for (const marker of [
      'connect(path)',
      "socket.once('error', reject)",
      "socket.once('connect'",
      'socket.end(`${JSON.stringify(frame)}\\n`, resolve)',
    ]) {
      assert.ok(claimText.includes(marker), marker)
    }
    const reapText = spareGraph.declarations
      .get('reapOrphanSpares')
      .node.getText(spare.sourceFile)
    for (const marker of [
      "process.platform === 'win32'",
      "entry.endsWith('.pty.sock')",
      'const socket = connect(path)',
      "socket.once('connect'",
      'socket.resume()',
      "encodeControlFrame({ t: 'kill', sig: 'SIGTERM' })",
      'setTimeout(() => socket.destroy(), 2_000).unref()',
      "entry.endsWith('.pty.sock.err')",
      "entry.endsWith('.claim.sock')",
      'bg orphan-spare reap:',
    ]) {
      assert.ok(reapText.includes(marker), marker)
    }

    const supervisorGraph = sourceSupervisorGraph(supervisor)
    assert.equal(supervisorGraph.imports.length, 1)
    assert.deepEqual(
      supervisorGraph.imports[0],
      fixture.sourceGraph.supervisor.spareImport,
    )
    assert.equal(supervisorGraph.calls.get('sendSpareClaim')?.length, 1)
    assert.equal(supervisorGraph.calls.get('reapOrphanSpares')?.length, 1)
    assert.deepEqual(
      supervisorGraph.calls.get('sendSpareClaim')[0],
      fixture.sourceGraph.supervisor.sendSpareClaimCall,
    )
    assert.deepEqual(
      supervisorGraph.calls.get('reapOrphanSpares')[0],
      fixture.sourceGraph.supervisor.reapOrphanSparesCall,
    )
  },
)

test(
  'source-authored rows reject coarse alternate owners and require no replay',
  { skip: !selected },
  () => {
    assert.deepEqual(fixture.rowBoundary.correctedOwnerPaths, [
      'src/daemon/spare.ts',
    ])
    assert.deepEqual(fixture.rowBoundary.rejectedOwnerPaths, [
      'src/daemon/client.ts',
      'src/commands/plugin/ManagePlugins.tsx',
    ])
    assert.deepEqual(
      fixture.inputs.frozenPostDangerousSnapshot.coverageRows.map(row => [
        row.targetIndex,
        row.ownerIds,
      ]),
      [
        [22124, ['owner-src-daemon-client-ts']],
        [
          22125,
          [
            'owner-src-commands-plugin-ManagePlugins-tsx',
            'owner-src-daemon-spare-ts',
          ],
        ],
      ],
    )
    assert.equal(
      fixture.sourceGraph.decision,
      'static-row-scoped-source-authored-no-replay',
    )
    assert.deepEqual(fixture.summary, {
      units: 2,
      residues: 2,
      sourceFiles: 2,
      wholeUnitOverride: false,
      sourceReplay: false,
      rawStrictRowsRemoved: 0,
    })
  },
)
