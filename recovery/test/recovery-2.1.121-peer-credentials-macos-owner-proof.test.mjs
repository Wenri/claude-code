import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/peer-credentials-macos-owner-evidence.mjs'

const {
  TARGET121_PEER_CREDENTIALS_MACOS_EVIDENCE_IDS,
  TARGET121_PEER_CREDENTIALS_MACOS_OWNER_EVIDENCE,
} = ownerEvidenceModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-peer-credentials-macos-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'ba60b407e5bb133fd24bdaa6cc44a973591fc641cb028618bbeed9b3e6459b62'

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
    'peer-credentials proof requires one exact known report/coverage phase; unknown and hybrid pairs are forbidden',
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

function exactTextDescriptor(text, start, end) {
  const value = text.slice(start, end)
  return {
    start,
    end,
    chars: value.length,
    ...descriptor(value),
  }
}

function parseCompleteUnit(bundle, expected) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected))
  const text = bytes.toString('utf8')
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, 'FunctionDeclaration')
  assert.equal(ast.body[0].id?.name, expected.name)
  assert.equal(
    [...tokenizer(text, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  return text
}

function stringCoordinates(bundle, value) {
  return [
    ...tokenizer(bundle.toString('utf8'), { ecmaVersion: 'latest' }),
  ]
    .filter(token => token.type.label === 'string' && token.value === value)
    .map(token => [token.start, token.end])
}

function parseSource(filename) {
  const ts = typescript()
  const bytes = fs.readFileSync(filename)
  const text = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [])
  return { bytes, sourceFile, text, ts }
}

function peerGraph(parsed) {
  const { sourceFile, text, ts } = parsed
  const declarations = new Map()
  const calls = new Map()
  const platformLiterals = []
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      [
        'linuxPeerUid',
        'macPeerUid',
        'getControlPeerUid',
        'controlPeerMatchesCurrentUser',
      ].includes(node.name?.text)
    ) {
      declarations.set(
        node.name.text,
        exactTextDescriptor(text, node.getStart(sourceFile), node.end),
      )
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(sourceFile)
      if (['macPeerUid', 'linuxPeerUid'].includes(name)) {
        calls.set(
          name,
          exactTextDescriptor(text, node.getStart(sourceFile), node.end),
        )
      }
    }
    if (
      ts.isStringLiteral(node) &&
      ['win32', 'darwin'].includes(node.text)
    ) {
      platformLiterals.push({
        value: node.text,
        ...exactTextDescriptor(text, node.getStart(sourceFile), node.end),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { calls, declarations, platformLiterals }
}

function supervisorGraph(parsed) {
  const { sourceFile, text, ts } = parsed
  const imports = []
  const calls = []
  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === './peerCredentials.js'
    ) {
      imports.push(
        exactTextDescriptor(text, node.getStart(sourceFile), node.end),
      )
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) ===
        'controlPeerMatchesCurrentUser'
    ) {
      calls.push(
        exactTextDescriptor(text, node.getStart(sourceFile), node.end),
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { calls, imports }
}

function getPlatformDeclaration(parsed) {
  const { sourceFile, text, ts } = parsed
  const matches = []
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'getPlatform'
    ) {
      let statement = node
      while (statement && !ts.isVariableStatement(statement)) {
        statement = statement.parent
      }
      assert.ok(statement)
      matches.push({
        descriptor: exactTextDescriptor(
          text,
          statement.getStart(sourceFile),
          statement.end,
        ),
        text: statement.getText(sourceFile),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(matches.length, 1)
  return matches[0]
}

test(
  'fixture freezes one macos owner-added row with no override or replay',
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
      [...TARGET121_PEER_CREDENTIALS_MACOS_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.ok(
      Object.isFrozen(TARGET121_PEER_CREDENTIALS_MACOS_OWNER_EVIDENCE),
    )
    assert.equal(
      Object.keys(ownerEvidenceModule).some(name => /OVERRIDES?/.test(name)),
      false,
    )
    const residue =
      TARGET121_PEER_CREDENTIALS_MACOS_OWNER_EVIDENCE.residues[0]
    const row = [
      TARGET121_PEER_CREDENTIALS_MACOS_OWNER_EVIDENCE.targetIndex,
      residue.literalKind,
      residue.value,
      residue.start,
      residue.end,
      residue.baselineCount,
      residue.targetOccurrenceNumber,
      true,
    ]
    assert.deepEqual(row, fixture.rowBoundary.admitted)
    assert.deepEqual(
      row,
      fixture.inputs.frozenPostDangerousSnapshot.selectedRow,
    )
    assert.deepEqual(
      canonicalDescriptor(row),
      fixture.inputs.frozenPostDangerousSnapshot.selectedRowDescriptor,
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
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      item => item.structural.index === 22129,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      item => item.structural.index === 22129,
    )
    const strictRows = report.rows.filter(
      item => item.structural.index === 22129,
    )
    assert.deepEqual(
      { owner: ownerRows.length, added: addedRows.length, strict: strictRows.length },
      current.localCounts,
    )
    assert.ok(
      addedRows.some(
        item =>
          JSON.stringify(reportIdentity(item)) ===
          JSON.stringify(current.selectedRow),
      ),
    )
    assert.deepEqual(descriptor(gunzipSync(coverageGzip)), {
      bytes: current.sourceCoverage.rawBytes,
      sha256: current.sourceCoverage.rawSha256,
    })
    assert.deepEqual(fixture.rowBoundary.impact, {
      owner: -1,
      added: -1,
      strict: 0,
      coverage: 0,
    })
  },
)

test(
  'authenticated u22129 is complete and owns exact global macos ordinal 43',
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
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const expected = fixture.targetUnit
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
    const unitText = parseCompleteUnit(target, expected)
    assert.equal(
      unitText.slice(
        fixture.rowBoundary.admitted[3] - expected.start,
        fixture.rowBoundary.admitted[4] - expected.start,
      ),
      '"macos"',
    )
    for (const marker of [
      'let $=s$()',
      '$==="windows"',
      'typeof Bun>"u"',
      'H._handle',
      'typeof q?.fd==="number"',
      '$==="macos"?CS5(K):RS5(K)',
      '[daemon] peer uid lookup failed:',
    ]) {
      assert.ok(unitText.includes(marker), marker)
    }

    const baselineCoordinates = stringCoordinates(baseline, 'macos')
    const targetCoordinates = stringCoordinates(target, 'macos')
    assert.equal(
      baselineCoordinates.length,
      fixture.macosLiteralLineage.baseline.count,
    )
    assert.equal(
      targetCoordinates.length,
      fixture.macosLiteralLineage.target.count,
    )
    assert.deepEqual(
      canonicalDescriptor(baselineCoordinates),
      fixture.macosLiteralLineage.baseline.coordinatesDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(targetCoordinates),
      fixture.macosLiteralLineage.target.coordinatesDescriptor,
    )
    assert.deepEqual(
      baselineCoordinates.slice(-4),
      fixture.macosLiteralLineage.baseline.tail,
    )
    assert.deepEqual(
      targetCoordinates.slice(-5),
      fixture.macosLiteralLineage.target.tail,
    )
    assert.deepEqual(
      targetCoordinates[fixture.macosLiteralLineage.selectedOrdinal - 1],
      fixture.macosLiteralLineage.selectedCoordinates,
    )

    const defaultCallerText = parseCompleteUnit(
      target,
      fixture.compiledGraph.defaultLookupCaller,
    )
    assert.ok(defaultCallerText.startsWith('function _b4(H,$=SS5)'))
    const supervisorCaller = fixture.compiledGraph.supervisorCaller
    const supervisorBytes = target.subarray(
      supervisorCaller.start,
      supervisorCaller.end,
    )
    assert.deepEqual(
      descriptor(supervisorBytes),
      expectedDescriptor(supervisorCaller),
    )
    assert.equal(
      target
        .subarray(
          supervisorCaller.callIdentifier.start,
          supervisorCaller.callIdentifier.end,
        )
        .toString('utf8'),
      '_b4',
    )
  },
)

test(
  'peer source and platform domain prove darwin-to-macos ownership and callers',
  { skip: !selected },
  () => {
    const baselineRoot = path.resolve(
      repositoryRoot,
      fixture.inputs.sourceRoots.baseline,
    )
    assert.equal(
      fs.existsSync(path.join(baselineRoot, 'daemon/peerCredentials.ts')),
      false,
    )
    const baselineSupervisor = readExact(
      path.join(baselineRoot, 'daemon/supervisor.ts'),
      fixture.sourceGraph.baseline.supervisorFile,
    ).toString('utf8')
    assert.equal(
      (baselineSupervisor.match(/peerCredentials/g) ?? []).length,
      fixture.sourceGraph.baseline.peerImportCount,
    )
    assert.equal(
      (baselineSupervisor.match(/controlPeerMatchesCurrentUser/g) ?? [])
        .length,
      fixture.sourceGraph.baseline.peerMatchCallCount,
    )
    const baselinePlatform = parseSource(
      path.join(baselineRoot, 'utils/platform.ts'),
    )
    assert.deepEqual(
      descriptor(baselinePlatform.bytes),
      fixture.sourceGraph.baseline.platformFile,
    )
    assert.deepEqual(
      getPlatformDeclaration(baselinePlatform).descriptor,
      fixture.sourceGraph.platform.getPlatformDeclaration,
    )

    const sourceRoot = path.resolve(
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        path.join(repositoryRoot, fixture.inputs.sourceRoots.raw),
    )
    const peerPath = path.join(sourceRoot, 'daemon/peerCredentials.ts')
    const supervisorPath = path.join(sourceRoot, 'daemon/supervisor.ts')
    const platformPath = path.join(sourceRoot, 'utils/platform.ts')
    const actualDescriptors = {
      peerCredentialsFile: descriptor(fs.readFileSync(peerPath)),
      supervisorFile: descriptor(fs.readFileSync(supervisorPath)),
      platformFile: descriptor(fs.readFileSync(platformPath)),
    }
    assert.ok(
      fixture.sourceGraph.targetStates.some(
        state =>
          JSON.stringify(actualDescriptors) ===
          JSON.stringify({
            peerCredentialsFile: state.peerCredentialsFile,
            supervisorFile: state.supervisorFile,
            platformFile: state.platformFile,
          }),
      ),
      'configured source root is exact raw or package state',
    )

    const peer = parseSource(peerPath)
    const supervisor = parseSource(supervisorPath)
    const platform = parseSource(platformPath)
    const peerAst = peerGraph(peer)
    assert.deepEqual(
      [...peerAst.declarations.entries()].map(([name, value]) => ({
        name,
        ...value,
      })),
      fixture.sourceGraph.peerDeclarations,
    )
    assert.deepEqual(
      peerAst.platformLiterals,
      fixture.sourceGraph.peerPlatformLiterals.map(item => ({
        value: item.value,
        start: item.start,
        end: item.end,
        chars: item.bytes,
        bytes: item.bytes,
        sha256: item.sha256,
      })),
    )
    assert.deepEqual(
      [...peerAst.calls.entries()].map(([name, value]) => ({
        name,
        ...value,
      })),
      fixture.sourceGraph.peerCalls.map(item => ({
        name: item.name,
        start: item.start,
        end: item.end,
        chars: item.bytes,
        bytes: item.bytes,
        sha256: item.sha256,
      })),
    )

    const getPeerText = peer.text.slice(1723, 2309)
    for (const marker of [
      "process.platform === 'win32'",
      "process.platform === 'darwin' ? macPeerUid(fd) : linuxPeerUid(fd)",
      '[daemon] peer uid lookup failed:',
    ]) {
      assert.ok(getPeerText.includes(marker), marker)
    }
    const matchText = peer.text.slice(2311, 2744)
    assert.ok(matchText.includes('= getControlPeerUid'))

    const supervisorAst = supervisorGraph(supervisor)
    assert.deepEqual(
      supervisorAst.imports[0],
      fixture.sourceGraph.supervisor.peerImport,
    )
    assert.deepEqual(
      supervisorAst.calls[0],
      fixture.sourceGraph.supervisor.peerMatchCall,
    )
    assert.equal(supervisorAst.imports.length, 1)
    assert.equal(supervisorAst.calls.length, 1)

    const platformGraph = getPlatformDeclaration(platform)
    assert.deepEqual(
      platformGraph.descriptor,
      fixture.sourceGraph.platform.getPlatformDeclaration,
    )
    for (const marker of [
      "process.platform === 'darwin'",
      "return 'macos'",
      "process.platform === 'win32'",
      "return 'windows'",
      "return 'wsl'",
      "return 'linux'",
    ]) {
      assert.ok(platformGraph.text.includes(marker), marker)
    }
  },
)

test(
  'platform-domain representation is static and preserves every strict row',
  { skip: !selected },
  () => {
    assert.deepEqual(fixture.rowBoundary.ownerPaths, [
      'src/daemon/peerCredentials.ts',
    ])
    assert.deepEqual(
      fixture.compiledGraph.platformBranches,
      [
        { compiled: 'windows', authored: 'win32', action: 'return-null' },
        { compiled: 'macos', authored: 'darwin', action: 'macPeerUid' },
        {
          compiled: 'linux-or-wsl',
          authored: 'linux',
          action: 'linuxPeerUid',
        },
      ],
    )
    assert.equal(
      fixture.sourceGraph.decision,
      'static-platform-domain-source-representation-no-replay',
    )
    assert.equal(fixture.rowBoundary.wholeUnitOverride, false)
    assert.equal(fixture.rowBoundary.sourceReplay, false)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 1,
      sourceFiles: 3,
      wholeUnitOverride: false,
      sourceReplay: false,
      rawStrictRowsRemoved: 0,
    })
  },
)
