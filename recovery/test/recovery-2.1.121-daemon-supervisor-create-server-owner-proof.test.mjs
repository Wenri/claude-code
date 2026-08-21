import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/daemon-supervisor-create-server-owner-evidence.mjs'

const {
  TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_EVIDENCE_IDS,
  TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_OWNER_EVIDENCE,
} = ownerEvidenceModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-daemon-supervisor-create-server-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'fb94aea0d777e4674e7e8dd00e5a7dfb4155463574d6fea86167565235b0cbf0'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function canonicalDescriptor(value) {
  return descriptor(JSON.stringify(value))
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

function exactTextDescriptor(text, start, end) {
  const value = text.slice(start, end)
  return {
    start,
    end,
    chars: value.length,
    ...descriptor(value),
  }
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function walkAst(value, visit) {
  if (value === null || typeof value !== 'object') return
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (key === 'parent') continue
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, visit)
    } else {
      walkAst(child, visit)
    }
  }
}

function parseCompleteCompiledUnit(bundle, expected) {
  const bytes = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected))
  const text = bytes.toString('utf8')
  const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, expected.nodeType)
  assert.equal(ast.body[0].id?.name, expected.name)
  const tokens = [...tokenizer(text, { ecmaVersion: 'latest' })]
  assert.equal(tokens.length, expected.tokenCount)
  return { ast, text, tokens }
}

function createServerCoordinates(bundle) {
  return [...tokenizer(bundle.toString('utf8'), { ecmaVersion: 'latest' })]
    .filter(token => token.value === 'createServer')
    .map(token => [token.start, token.end])
}

function sourceGraph(filename) {
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
  const imports = []
  const declarations = []
  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === 'net'
    ) {
      imports.push(
        exactTextDescriptor(text, node.getStart(sourceFile), node.end),
      )
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'startControlServer'
    ) {
      const calls = []
      function visitDeclaration(child) {
        if (
          ts.isCallExpression(child) &&
          child.expression.getText(sourceFile) === 'createServer'
        ) {
          calls.push({
            ...exactTextDescriptor(
              text,
              child.getStart(sourceFile),
              child.end,
            ),
            identifier: exactTextDescriptor(
              text,
              child.expression.getStart(sourceFile),
              child.expression.end,
            ),
          })
        }
        ts.forEachChild(child, visitDeclaration)
      }
      visitDeclaration(node)
      const start = node.getStart(sourceFile)
      const end = node.end
      declarations.push({
        name: node.name.text,
        kind: 'FunctionDeclaration',
        ...exactTextDescriptor(text, start, end),
        parameters: node.parameters.map(parameter =>
          parameter.name.getText(sourceFile),
        ),
        calls,
        text: text.slice(start, end),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { bytes, declarations, imports }
}

test(
  'fixture freezes one retained createServer row without override or replay',
  { skip: !selected },
  () => {
    assert.deepEqual(descriptor(fixtureBytes), {
      bytes: fixtureBytes.length,
      sha256: FIXTURE_SHA256,
    })
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.caseFiles.helper.path),
        ),
      ),
      expectedDescriptor(fixture.caseFiles.helper),
    )
    assert.deepEqual(
      [...TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.ok(
      Object.isFrozen(
        TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_OWNER_EVIDENCE,
      ),
    )
    assert.equal(
      Object.keys(ownerEvidenceModule).some(name =>
        /OVERRIDES?|REPLAY/.test(name),
      ),
      false,
    )

    const residue =
      TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_OWNER_EVIDENCE.residues[0]
    const row = [
      TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_OWNER_EVIDENCE.targetIndex,
      residue.literalKind,
      residue.value,
      residue.start,
      residue.end,
      residue.baselineCount,
      residue.targetOccurrenceNumber,
      true,
    ]
    assert.deepEqual(row, fixture.rowBoundary.admitted)
    assert.deepEqual(row, fixture.inputs.frozenPostPruneSnapshot.selectedRow)
    assert.deepEqual(
      canonicalDescriptor(row),
      fixture.inputs.frozenPostPruneSnapshot.selectedRowDescriptor,
    )
    assert.deepEqual(
      [
        ...TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_OWNER_EVIDENCE.paths,
      ],
      fixture.rowBoundary.correctedOwnerPaths,
    )
    assert.deepEqual(fixture.rowBoundary.impact, {
      owner: -1,
      added: -1,
      strict: -1,
      coverage: 0,
    })
    assert.deepEqual(fixture.rowBoundary.postProofProjection, {
      owner: 4,
      added: 3,
      strict: 0,
      coverage: 1,
    })
    assert.equal(fixture.rowBoundary.wholeUnitOverride, false)
    assert.equal(fixture.rowBoundary.sourceReplay, false)

    const frozen = fixture.inputs.frozenPostPruneSnapshot
    assert.deepEqual(expectedDescriptor(frozen.typedReport), {
      bytes: 25396455,
      sha256:
        'f63079907d813bffaf98cb89d28b8b2e183df9fe2e1c72b21f10fa2fd5c0a3f4',
    })
    assert.deepEqual(expectedDescriptor(frozen.sourceCoverage), {
      bytes: 345989,
      sha256:
        '05ac9243d7cee276bc51c8eb0c8e4e3678f96d941560cae620d05af240d7cdd4',
    })
    assert.deepEqual(
      {
        rawBytes: frozen.sourceCoverage.rawBytes,
        rawSha256: frozen.sourceCoverage.rawSha256,
      },
      {
        rawBytes: 2968244,
        rawSha256:
          '7be9d68b6144e09290d58e3dae17f21df9536852b5f8415e777c9f7dd3ad1c06',
      },
    )
    assert.deepEqual(frozen.partitions, {
      owner: { count: 5, identitiesSha256Prefix: 'c0659e64' },
      added: { count: 4, identitiesSha256Prefix: '745ee411' },
      strict: { count: 1, identitiesSha256Prefix: '4f797bc0' },
    })
    assert.deepEqual(frozen.coverage, {
      count: 1,
      rowIdentitySha256Prefix: 'e0f84821',
      ownerPath: 'src/daemon/supervisor.ts',
      ownerAndEvidenceAlreadyCorrect: true,
    })
  },
)

test(
  'existing supervisor proof is exact dependency evidence but leaves the ordinal row open',
  { skip: !selected },
  () => {
    const dependencyBytes = readExact(
      path.join(repositoryRoot, fixture.dependencyEvidence.fixture.path),
      fixture.dependencyEvidence.fixture,
    )
    readExact(
      path.join(repositoryRoot, fixture.dependencyEvidence.helper.path),
      fixture.dependencyEvidence.helper,
    )
    const dependency = JSON.parse(dependencyBytes)
    const unit = dependency.units.find(item => item.targetIndex === 22136)
    assert.ok(unit)
    assert.deepEqual(
      expectedDescriptor(unit),
      expectedDescriptor(fixture.compiledLineage.targetUnit),
    )
    assert.equal(unit.correctedOwner, 'src/daemon/supervisor.ts')
    assert.ok(
      dependency.compilerResidues.some(
        ([targetIndex, kind, value, start, end]) =>
          targetIndex === 22136 &&
          kind === 'property' &&
          value === 'createServer' &&
          start === 13852432 &&
          end === 13852444,
      ),
    )
    assert.equal(
      dependency.ownerOverrides.find(item => item.targetIndex === 22136)
        ?.paths[0],
      'src/daemon/supervisor.ts',
    )
  },
)

test(
  'authenticated compiled units prove one local createServer call and the retained ordinal spill',
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
    const expectedTarget = fixture.compiledLineage.targetUnit
    const region = structural.regions.find(
      candidate => candidate.target?.index === expectedTarget.targetIndex,
    )
    assert.ok(region)
    assert.equal(region.classification, expectedTarget.classification)
    assert.equal(
      region.unknownFreeIdentifierCount,
      expectedTarget.unknownFreeIdentifierCount,
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
      assert.equal(region.target[name], expectedTarget[name])
    }
    assert.equal(region.target.sourceHash, expectedTarget.sha256)

    for (const [bundle, expected, local] of [
      [
        baseline,
        fixture.compiledLineage.baselinePredecessor,
        fixture.compiledLineage.localCreateServer.baseline,
      ],
      [
        target,
        expectedTarget,
        fixture.compiledLineage.localCreateServer.target,
      ],
    ]) {
      const parsed = parseCompleteCompiledUnit(bundle, expected)
      const localTokens = parsed.tokens
        .map((token, tokenIndex) => ({ token, tokenIndex }))
        .filter(({ token }) => token.value === 'createServer')
      assert.equal(localTokens.length, 1)
      assert.deepEqual(
        {
          tokenIndex: localTokens[0].tokenIndex,
          localCoordinates: [
            localTokens[0].token.start,
            localTokens[0].token.end,
          ],
          globalCoordinates: [
            expected.start + localTokens[0].token.start,
            expected.start + localTokens[0].token.end,
          ],
        },
        {
          tokenIndex: local.tokenIndex,
          localCoordinates: local.localCoordinates,
          globalCoordinates: local.globalCoordinates,
        },
      )
      const calls = []
      walkAst(parsed.ast, node => {
        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'MemberExpression' &&
          node.callee.computed === false &&
          node.callee.property?.name === 'createServer'
        ) {
          calls.push(node.callee)
        }
      })
      assert.equal(calls.length, 1)
      assert.deepEqual(
        {
          type: calls[0].type,
          computed: calls[0].computed,
          property: calls[0].property.name,
        },
        fixture.compiledLineage.localCreateServer.calleeShape,
      )
    }

    for (const [bundle, local, expected] of [
      [
        baseline,
        fixture.compiledLineage.localCreateServer.baseline,
        fixture.compiledLineage.globalCreateServerCoordinates.baseline,
      ],
      [
        target,
        fixture.compiledLineage.localCreateServer.target,
        fixture.compiledLineage.globalCreateServerCoordinates.target,
      ],
    ]) {
      const coordinates = createServerCoordinates(bundle)
      assert.equal(coordinates.length, expected.count)
      assert.deepEqual(canonicalDescriptor(coordinates), expected.coordinatesDescriptor)
      assert.deepEqual(coordinates.slice(-5), expected.tail)
      assert.deepEqual(coordinates[local.globalOrdinal - 1], local.globalCoordinates)
      assert.equal(local.globalCount, coordinates.length)
    }
    assert.equal(
      fixture.compiledLineage.localCreateServer.target.globalOrdinal,
      fixture.compiledLineage.localCreateServer.baseline.globalCount + 1,
    )
    assert.deepEqual(
      fixture.compiledLineage.localCreateServer.target.globalCoordinates,
      fixture.rowBoundary.admitted.slice(3, 5),
    )
  },
)

test(
  'raw and postPrune package source retain createServer while evolving the control graph',
  { skip: !selected },
  () => {
    const baselineRoot = path.resolve(
      repositoryRoot,
      fixture.inputs.sourceRoots.baseline,
    )
    const defaultTargetRoot = path.resolve(
      repositoryRoot,
      fixture.inputs.sourceRoots.raw,
    )
    const authenticatedTargetRoot =
      process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT
    const targetRoot = path.resolve(
      authenticatedTargetRoot ??
        process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        defaultTargetRoot,
    )
    const acceptedTargetRoots = [
      authenticatedTargetRoot,
      fixture.inputs.sourceRoots.raw,
      fixture.inputs.sourceRoots.postPrunePackage,
    ]
      .filter(Boolean)
      .map(value =>
        path.isAbsolute(value)
          ? path.resolve(value)
          : path.resolve(repositoryRoot, value),
      )
    assert.ok(
      acceptedTargetRoots.includes(targetRoot),
      `unexpected Target121 source root: ${targetRoot}`,
    )

    const sourcePath = fixture.sourceLineage.path.slice(4)
    const baseline = sourceGraph(path.join(baselineRoot, sourcePath))
    const target = sourceGraph(path.join(targetRoot, sourcePath))
    assert.deepEqual(
      descriptor(baseline.bytes),
      expectedDescriptor(fixture.sourceLineage.baseline.file),
    )
    assert.deepEqual(
      descriptor(target.bytes),
      expectedDescriptor(fixture.sourceLineage.target.file),
    )
    assert.equal(baseline.imports.length, 1)
    assert.equal(target.imports.length, 1)
    assert.deepEqual(
      baseline.imports[0],
      fixture.sourceLineage.baseline.netImport,
    )
    assert.deepEqual(target.imports[0], fixture.sourceLineage.target.netImport)
    assert.equal(baseline.declarations.length, 1)
    assert.equal(target.declarations.length, 1)

    for (const [actual, expected] of [
      [baseline.declarations[0], fixture.sourceLineage.baseline.declaration],
      [target.declarations[0], fixture.sourceLineage.target.declaration],
    ]) {
      const { calls, text: declarationText, ...declaration } = actual
      const { createServerCall, ...expectedDeclaration } = expected
      assert.deepEqual(declaration, expectedDeclaration)
      assert.equal(calls.length, 1)
      assert.deepEqual(calls[0], createServerCall)
      assert.equal(
        declarationText.includes(fixture.sourceLineage.retainedOperation),
        true,
      )
    }
    for (const marker of fixture.sourceLineage.targetEvolutionMarkers) {
      assert.ok(target.declarations[0].text.includes(marker), marker)
      assert.equal(baseline.declarations[0].text.includes(marker), false, marker)
    }
    assert.equal(
      fixture.sourceLineage.decision,
      'static-row-scoped-retained-source-operation-no-replay',
    )
  },
)
