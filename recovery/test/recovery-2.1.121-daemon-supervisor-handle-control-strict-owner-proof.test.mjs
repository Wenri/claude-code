import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerEvidenceModule from '../cases/2.1.120-to-2.1.121/recovered/daemon-supervisor-handle-control-strict-owner-evidence.mjs'
import {
  TARGET121_DAEMON_SUPERVISOR_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/daemon-supervisor-owner-overrides.mjs'

const {
  TARGET121_DAEMON_SUPERVISOR_HANDLE_CONTROL_STRICT_EVIDENCE_IDS,
  TARGET121_DAEMON_SUPERVISOR_HANDLE_CONTROL_STRICT_OWNER_EVIDENCE,
} = ownerEvidenceModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-daemon-supervisor-handle-control-strict-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'aef2d8711a1fb34971c9283c3deb40e0786f1c61f942db9b04f1cb2770118201'

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
  return descriptor(Buffer.from(JSON.stringify(value)))
}

function sameDescriptor(actual, expected) {
  return (
    actual?.bytes === expected?.bytes && actual?.sha256 === expected?.sha256
  )
}

function selectFrozenPhase(reportDescriptor, coverageDescriptor) {
  const phases = [
    ['postPrune', fixture.inputs.frozenPostPruneSnapshot],
    ['postDaemonOwner', fixture.inputs.frozenPostDaemonOwnerSnapshot],
  ]
  const match = phases.find(
    ([, snapshot]) =>
      sameDescriptor(reportDescriptor, snapshot.typedReport) &&
      sameDescriptor(coverageDescriptor, snapshot.sourceCoverage),
  )
  if (!match) {
    throw new Error('unknown-or-hybrid-target121-supervisor-phase')
  }
  return { name: match[0], snapshot: match[1] }
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

function reportIdentity(item, residue) {
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
}

function walkAst(value, visit) {
  if (value === null || typeof value !== 'object') return
  if (typeof value.type === 'string') visit(value)
  for (const [key, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, visit)
    } else {
      walkAst(child, visit)
    }
  }
}

function buildObjectFields(member) {
  return Object.fromEntries(
    member.object.properties.map(property => [
      property.key.name ?? property.key.value,
      property.value.value,
    ]),
  )
}

function sourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, fixture.inputs.sourceRoots.raw),
  )
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function exactSourceDescriptor(text, node) {
  const start = node.getStart(node.getSourceFile())
  const end = node.end
  const value = text.slice(start, end)
  return {
    start,
    end,
    chars: value.length,
    ...descriptor(value),
    text: value,
  }
}

test(
  'fixture freezes exactly seven u22140 strict rows and pins the prior supervisor proof',
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
      [...TARGET121_DAEMON_SUPERVISOR_HANDLE_CONTROL_STRICT_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.ok(
      Object.isFrozen(
        TARGET121_DAEMON_SUPERVISOR_HANDLE_CONTROL_STRICT_OWNER_EVIDENCE,
      ),
    )
    assert.ok(
      TARGET121_DAEMON_SUPERVISOR_HANDLE_CONTROL_STRICT_OWNER_EVIDENCE.residues.every(
        Object.isFrozen,
      ),
    )
    assert.equal(
      Object.keys(ownerEvidenceModule).some(name =>
        /OVERRIDES?|REPLAY/.test(name),
      ),
      false,
    )

    const item =
      TARGET121_DAEMON_SUPERVISOR_HANDLE_CONTROL_STRICT_OWNER_EVIDENCE
    assert.equal(item.targetIndex, 22140)
    assert.deepEqual([...item.paths], fixture.rowBoundary.correctedOwnerPaths)
    assert.deepEqual([...item.declarations], ['handleControl'])
    const rows = item.residues.map(residue => reportIdentity(item, residue))
    assert.deepEqual(rows, fixture.rowBoundary.admittedRows)
    assert.deepEqual(
      canonicalDescriptor(rows),
      fixture.rowBoundary.admittedRowsDescriptor,
    )
    assert.deepEqual(
      rows.map(canonicalDescriptor),
      fixture.rowBoundary.rowDescriptors,
    )
    assert.deepEqual(
      canonicalDescriptor(rows),
      fixture.inputs.frozenPostPruneSnapshot.physicalPartitions.strict
        .identities,
    )
    assert.deepEqual(fixture.rowBoundary.selectedProofScope, {
      owner: { units: 1, rows: 7 },
      added: { units: 1, rows: 7 },
      strict: { units: 1, rows: 7 },
    })
    assert.deepEqual(fixture.rowBoundary.physicalPartitionDelta, {
      owner: { units: 0, rows: -7 },
      added: { units: 0, rows: -7 },
      strict: { units: -1, rows: -7 },
      coverage: { units: 0, rows: 0 },
    })
    assert.deepEqual(
      fixture.rowBoundary.remainingAddedRows.map(row => row[2]),
      ['from', 'join'],
    )
    assert.deepEqual(
      {
        owner: fixture.rowBoundary.postProofProjection.owner,
        added: fixture.rowBoundary.postProofProjection.added,
        strict: fixture.rowBoundary.postProofProjection.strict,
      },
      {
        owner: {
          units: 1,
          rows: 30,
          identities: {
            bytes: 2149,
            sha256:
              '17db9d593ccdc8f2373ef8d8331d1160d556638a2159ca3b650cf80749cc346b',
          },
        },
        added: {
          units: 1,
          rows: 2,
          identities: {
            bytes: 117,
            sha256:
              '8003e0eb50980eb95a1d23f4e75a48a5fc624e89cec8cae57c5859269d3c4e70',
          },
        },
        strict: {
          units: 0,
          rows: 0,
          identities: {
            bytes: 2,
            sha256:
              '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
          },
        },
      },
    )
    assert.equal(fixture.rowBoundary.wholeUnitOverride, false)
    assert.equal(fixture.rowBoundary.sourceReplay, false)
    assert.equal(fixture.rowBoundary.coverageChanged, false)

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
    assert.equal(frozen.coverage.ownerAndEvidenceAlreadyCorrect, true)
    assert.equal(frozen.coverage.ownerPath, 'src/daemon/supervisor.ts')

    const post = fixture.inputs.frozenPostDaemonOwnerSnapshot
    assert.deepEqual(
      selectFrozenPhase(frozen.typedReport, frozen.sourceCoverage),
      { name: 'postPrune', snapshot: frozen },
    )
    assert.deepEqual(
      selectFrozenPhase(post.typedReport, post.sourceCoverage),
      { name: 'postDaemonOwner', snapshot: post },
    )
    assert.throws(
      () => selectFrozenPhase(frozen.typedReport, post.sourceCoverage),
      /unknown-or-hybrid-target121-supervisor-phase/,
    )
    assert.throws(
      () => selectFrozenPhase(post.typedReport, frozen.sourceCoverage),
      /unknown-or-hybrid-target121-supervisor-phase/,
    )
    assert.throws(
      () =>
        selectFrozenPhase(
          { bytes: 0, sha256: 'unknown-report' },
          { bytes: 0, sha256: 'unknown-coverage' },
        ),
      /unknown-or-hybrid-target121-supervisor-phase/,
    )
    assert.deepEqual(expectedDescriptor(post.typedReport), {
      bytes: 25369097,
      sha256:
        '2126a6898cf52b4ad639c18d51dddd24d9adfd8df73470cf2ab4298700a66bf3',
    })
    assert.deepEqual(expectedDescriptor(post.sourceCoverage), {
      bytes: 347677,
      sha256:
        '91e279daac39df4d94f0bc34e90eb31b875b5fdeeabeceb0dc83d74660de6b83',
    })
    assert.deepEqual(
      {
        rawBytes: post.sourceCoverage.rawBytes,
        rawSha256: post.sourceCoverage.rawSha256,
      },
      {
        rawBytes: 2974761,
        rawSha256:
          '8b53acac16477ad92958b40bc7b9c44cba07b6ea48671adacc5c94f7235b173f',
      },
    )
    assert.deepEqual(post.globalCounts, {
      ownerRows: 35634,
      addedOwnerRows: 1118,
      strictRows: 1275,
      coverageRows: 4807,
      coverageOwners: 704,
    })
    assert.deepEqual(
      canonicalDescriptor(post.coverageRows),
      post.coverageRowsDescriptor,
    )
    assert.equal(post.coverageRows.length, 1)
    assert.deepEqual(
      post.coverageRows[0].evidenceIds,
      frozen.coverage.evidenceIds,
    )
    assert.deepEqual(post.coverageRows[0].ownerIds, [
      'owner-src-daemon-supervisor-ts',
    ])
    for (const partition of ['owner', 'added', 'strict']) {
      assert.deepEqual(
        post.physicalPartitions[partition].identities,
        frozen.physicalPartitions[partition].identities,
      )
    }
    assert.deepEqual(
      canonicalDescriptor(rows),
      post.physicalPartitions.strict.identities,
    )

    for (const input of [
      fixture.dependencyEvidence.helper,
      fixture.dependencyEvidence.builder,
      fixture.dependencyEvidence.fixture,
      fixture.dependencyEvidence.test,
    ]) {
      readExact(path.join(repositoryRoot, input.path), input)
    }
    const dependency = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.dependencyEvidence.fixture.path),
      ),
    )
    const dependencyUnit = dependency.units.find(
      unit => unit.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(dependencyUnit)
    assert.deepEqual(
      canonicalDescriptor(dependencyUnit),
      fixture.dependencyEvidence.targetUnitDescriptor,
    )
    assert.deepEqual(
      {
        targetIndex: dependencyUnit.targetIndex,
        start: dependencyUnit.start,
        end: dependencyUnit.end,
        nodeType: dependencyUnit.nodeType,
        bytes: dependencyUnit.bytes,
        sha256: dependencyUnit.sha256,
        correctedOwner: dependencyUnit.correctedOwner,
      },
      {
        targetIndex: fixture.targetUnit.targetIndex,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        nodeType: fixture.targetUnit.nodeType,
        bytes: fixture.targetUnit.bytes,
        sha256: fixture.targetUnit.sha256,
        correctedOwner: fixture.targetUnit.owner,
      },
    )
    const buildRows = dependency.buildMacroResidues.filter(
      row => row[0] === fixture.targetUnit.targetIndex,
    )
    const compilerRows = dependency.compilerResidues.filter(
      row => row[0] === fixture.targetUnit.targetIndex,
    )
    assert.equal(
      buildRows.length,
      fixture.dependencyEvidence.expectedBuildMacroRows,
    )
    assert.equal(
      compilerRows.length,
      fixture.dependencyEvidence.expectedCompilerRows,
    )
    assert.deepEqual(
      [...buildRows, ...compilerRows].map(row => [
        ...row.slice(0, 7),
        true,
      ]),
      rows,
    )
    assert.ok(
      [...buildRows, ...compilerRows].every(
        row => row[7] === fixture.targetUnit.sha256,
      ),
    )
    assert.equal(dependency.buildMacros.countsByUnit['22140'], 6)
    assert.deepEqual(dependency.buildMacros.sourceMarkers.handleControl, [
      'MACRO.VERSION',
    ])
    const compilerMapping = dependency.compilerMappings.find(
      mapping => mapping.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(
      compilerMapping.sourceMarkers,
      [
        "const clearDisplay = '\\x1B[2J'",
        "const homeAndEraseLine = '\\x1B[H\\x1B[2K'",
        '`${clearDisplay}\\x1B[H\\n  \\x1B[2m${message}\\x1B[0m\\n`',
      ],
    )
    const dependencySource = dependency.sourceFiles.find(
      item => item.path === fixture.sourceLineage.path,
    )
    assert.deepEqual(
      expectedDescriptor(dependencySource),
      expectedDescriptor(fixture.sourceLineage.file),
    )
    const dependencyOverride = TARGET121_DAEMON_SUPERVISOR_OWNER_OVERRIDES.find(
      override => override.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(dependencyOverride)
    assert.deepEqual([...dependencyOverride.paths], [
      fixture.dependencyEvidence.correctedOwner,
    ])
    assert.deepEqual(
      frozen.coverage.evidenceIds,
      dependency.evidenceIds,
    )
  },
)

test(
  'authenticated u22140 binds two build-object expansions and one repaint template element',
  { skip: !selected },
  () => {
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const region = structural.regions.find(
      item => item.target.index === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(
      {
        classification: region.classification,
        parseStatus: region.target.parseStatus,
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        tokenCount: region.target.tokenCount,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
        unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      },
      {
        classification: fixture.targetUnit.classification,
        parseStatus: fixture.targetUnit.parseStatus,
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        unknownFreeIdentifierCount:
          fixture.targetUnit.unknownFreeIdentifierCount,
      },
    )

    const unitBytes = targetBundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    assert.deepEqual(descriptor(unitBytes), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sha256,
    })
    const unitText = unitBytes.toString('utf8')
    const ast = parse(unitText, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].type, fixture.targetUnit.nodeType)
    assert.equal(ast.body[0].id?.name, fixture.targetUnit.name)
    assert.equal(
      [...tokenizer(unitText, { ecmaVersion: 'latest' })].length,
      fixture.targetUnit.tokenCount,
    )

    const buildMembers = []
    const repaintTemplates = []
    walkAst(ast.body[0], node => {
      if (
        node.type === 'MemberExpression' &&
        node.computed === false &&
        node.property?.name === 'VERSION' &&
        node.object?.type === 'ObjectExpression'
      ) {
        buildMembers.push(node)
      }
      if (
        node.type === 'TemplateLiteral' &&
        node.quasis[0]?.value?.cooked ===
          fixture.compiledLineage.repaintTemplate.firstQuasi.cooked
      ) {
        repaintTemplates.push(node)
      }
    })
    assert.equal(buildMembers.length, 2)
    for (const [index, member] of buildMembers.entries()) {
      const expected = fixture.compiledLineage.buildMemberExpressions[index]
      assert.deepEqual(
        {
          localStart: member.start,
          localEnd: member.end,
          start: fixture.targetUnit.start + member.start,
          end: fixture.targetUnit.start + member.end,
          ...descriptor(unitText.slice(member.start, member.end)),
        },
        {
          localStart: expected.localStart,
          localEnd: expected.localEnd,
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          sha256: expected.sha256,
        },
      )
      assert.deepEqual(
        buildObjectFields(member),
        fixture.compiledLineage.buildObjectFields,
      )
      const selectedRows = expected.strictRowOrdinals.map(
        ordinal => fixture.rowBoundary.admittedRows[ordinal],
      )
      assert.ok(
        selectedRows.every(
          row => row[3] >= expected.start && row[4] <= expected.end,
        ),
      )
    }

    assert.equal(repaintTemplates.length, 1)
    const repaint = repaintTemplates[0]
    const expectedRepaint = fixture.compiledLineage.repaintTemplate
    assert.deepEqual(
      {
        nodeType: repaint.type,
        localStart: repaint.start,
        localEnd: repaint.end,
        start: fixture.targetUnit.start + repaint.start,
        end: fixture.targetUnit.start + repaint.end,
        ...descriptor(unitText.slice(repaint.start, repaint.end)),
        raw: unitText.slice(repaint.start, repaint.end),
      },
      {
        nodeType: expectedRepaint.nodeType,
        localStart: expectedRepaint.localStart,
        localEnd: expectedRepaint.localEnd,
        start: expectedRepaint.start,
        end: expectedRepaint.end,
        bytes: expectedRepaint.bytes,
        sha256: expectedRepaint.sha256,
        raw: expectedRepaint.raw,
      },
    )
    const firstQuasi = repaint.quasis[0]
    assert.deepEqual(
      {
        nodeType: firstQuasi.type,
        localStart: firstQuasi.start,
        localEnd: firstQuasi.end,
        start: fixture.targetUnit.start + firstQuasi.start,
        end: fixture.targetUnit.start + firstQuasi.end,
        ...descriptor(unitText.slice(firstQuasi.start, firstQuasi.end)),
        raw: firstQuasi.value.raw,
        cooked: firstQuasi.value.cooked,
      },
      expectedRepaint.firstQuasi,
    )

    for (const [index, row] of fixture.rowBoundary.admittedRows.entries()) {
      const compiled = targetBundle.subarray(row[3], row[4]).toString('utf8')
      assert.equal(
        compiled,
        index < 6 ? JSON.stringify(row[2]) : expectedRepaint.firstQuasi.raw,
      )
    }
  },
)

test(
  'whole-bundle tokens prove the frozen occurrence ordinals and zero baseline counts',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const wantedValues = new Set(
      fixture.tokenLineage.values.map(item => item.value),
    )

    function tokenCoordinates(bytes) {
      const result = new Map(
        [...wantedValues].map(value => [value, []]),
      )
      for (const token of tokenizer(bytes.toString('utf8'), {
        ecmaVersion: 'latest',
      })) {
        if (wantedValues.has(token.value)) {
          result.get(token.value).push({
            type: token.type.label,
            start: token.start,
            end: token.end,
          })
        }
      }
      return result
    }

    const baseline = tokenCoordinates(baselineBundle)
    const target = tokenCoordinates(targetBundle)
    for (const expected of fixture.tokenLineage.values) {
      const baselineTokens = baseline.get(expected.value)
      const targetTokens = target.get(expected.value)
      assert.equal(baselineTokens.length, expected.baselineCount)
      assert.deepEqual(
        canonicalDescriptor(
          baselineTokens.map(token => [token.start, token.end]),
        ),
        fixture.tokenLineage.emptyCoordinatesDescriptor,
      )
      assert.equal(targetTokens.length, expected.targetCount)
      assert.deepEqual(
        canonicalDescriptor(
          targetTokens.map(token => [token.start, token.end]),
        ),
        expected.targetCoordinatesDescriptor,
      )
      assert.ok(
        targetTokens.every(token => token.type === expected.tokenType),
      )
      for (const selectedToken of expected.selected) {
        assert.deepEqual(
          targetTokens[selectedToken.ordinal - 1],
          {
            type: expected.tokenType,
            start: selectedToken.start,
            end: selectedToken.end,
          },
        )
      }
    }

    for (const row of fixture.rowBoundary.admittedRows) {
      const lineage = fixture.tokenLineage.values.find(
        item => item.value === row[2],
      )
      assert.ok(lineage)
      assert.equal(row[5], lineage.baselineCount)
      assert.deepEqual(
        lineage.selected.find(item => item.ordinal === row[6]),
        { ordinal: row[6], start: row[3], end: row[4] },
      )
    }
  },
)

test(
  'raw and postPrune source bind both macro accesses and the exact repaint template',
  { skip: !selected },
  () => {
    const filename = path.join(
      sourceRoot(),
      fixture.sourceLineage.path.slice('src/'.length),
    )
    const bytes = readExact(filename, fixture.sourceLineage.file)
    const text = bytes.toString('utf8')
    assert.equal(text.length, fixture.sourceLineage.file.chars)
    const ts = typescript()
    const sourceFile = ts.createSourceFile(
      filename,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.deepEqual(sourceFile.parseDiagnostics, [])

    const declarations = []
    function findDeclaration(node) {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === fixture.sourceLineage.declaration.name
      ) {
        declarations.push(node)
      }
      ts.forEachChild(node, findDeclaration)
    }
    findDeclaration(sourceFile)
    assert.equal(declarations.length, 1)
    const declaration = declarations[0]
    const declarationActual = exactSourceDescriptor(text, declaration)
    assert.deepEqual(
      {
        name: declaration.name.text,
        kind: 'FunctionDeclaration',
        start: declarationActual.start,
        end: declarationActual.end,
        chars: declarationActual.chars,
        bytes: declarationActual.bytes,
        sha256: declarationActual.sha256,
      },
      fixture.sourceLineage.declaration,
    )

    const macroAccesses = []
    const repaintVariables = []
    const repaintTemplates = []
    function visitDeclaration(node) {
      if (
        ts.isPropertyAccessExpression(node) &&
        node.expression.getText(sourceFile) === 'MACRO' &&
        node.name.text === 'VERSION'
      ) {
        macroAccesses.push(exactSourceDescriptor(text, node))
      }
      if (
        ts.isVariableDeclaration(node) &&
        ['clearDisplay', 'homeAndEraseLine'].includes(
          node.name.getText(sourceFile),
        )
      ) {
        repaintVariables.push({
          name: node.name.getText(sourceFile),
          ...exactSourceDescriptor(text, node),
        })
      }
      if (
        ts.isTemplateExpression(node) &&
        node.getText(sourceFile).includes('clearDisplay') &&
        node.getText(sourceFile).includes('message')
      ) {
        repaintTemplates.push(exactSourceDescriptor(text, node))
      }
      ts.forEachChild(node, visitDeclaration)
    }
    visitDeclaration(declaration)

    assert.deepEqual(
      macroAccesses,
      fixture.sourceLineage.macroVersionAccesses,
    )
    assert.deepEqual(
      repaintVariables,
      fixture.sourceLineage.repaint.variables,
    )
    assert.deepEqual(repaintTemplates, [fixture.sourceLineage.repaint.template])
    for (const value of Object.values(fixture.buildIdentity)) {
      assert.equal(text.includes(value), false, value)
    }
    assert.equal(
      fixture.sourceLineage.decision,
      'static-row-scoped-build-and-template-evidence-no-replay',
    )
  },
)
