import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  TARGET119_COMPUTER_USE_SETUP_RETAINED_EVIDENCE_IDS,
  TARGET119_COMPUTER_USE_SETUP_RETAINED_OWNER_OVERRIDES,
  TARGET119_COMPUTER_USE_SETUP_RETAINED_PROOF_SPEC,
} from '../cases/2.1.118-to-2.1.119/recovered/computer-use-setup-retained-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-computer-use-setup-retained-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/computer-use-setup-retained-owner-overrides.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  '38640f13ac0c39fb8105c538196bf2aa664553af0fcb4cc21be7099c586e6fbb'
const HELPER_SHA256 =
  '81805249509dafbd8c90bee1e89329982d4657ae161cff0bb2451452bed57d3b'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function partitionDescriptor(rows) {
  const bytes = Buffer.from(JSON.stringify(rows))
  return { rows: rows.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function resolveArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    phase =>
      phase.typedAudit.bytes === typedAudit.bytes &&
      phase.typedAudit.sha256 === typedAudit.sha256 &&
      phase.sourceCoverage.bytes === sourceCoverage.bytes &&
      phase.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      (phase.sourceCoverageRaw === undefined
        ? sourceCoverageRaw === undefined
        : sourceCoverageRaw !== undefined &&
          phase.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
          phase.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256),
  )
  if (matches.length !== 1) {
    throw new Error('unknown or hybrid Target119 artifact phase')
  }
  return matches[0]
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(bytes),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return bytes
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function canonicalAst(source) {
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const identifiers = new Map()
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean)
    if (value === null || typeof value !== 'object') return value
    const result = {}
    for (const key of Object.keys(value).sort()) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
      let child = value[key]
      if (value.type === 'Identifier' && key === 'name') {
        if (!identifiers.has(child)) {
          identifiers.set(child, `i${identifiers.size}`)
        }
        child = identifiers.get(child)
      }
      result[key] = clean(child)
    }
    return result
  }
  return Buffer.from(JSON.stringify(clean(ast)))
}

function tokenCount(source) {
  const tokens = []
  parse(source, {
    ecmaVersion: 'latest',
    onToken: tokens,
    sourceType: 'module',
  })
  assert.equal(tokens.at(-1).type.label, 'eof')
  return tokens.length - 1
}

function propertyOffsets(source, expectedName) {
  const offsets = []
  function visit(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    const property =
      ['MethodDefinition', 'Property', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property?.name === expectedName) {
      offsets.push([property.start, property.end])
    }
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
        visit(child)
      }
    }
  }
  visit(
    parse(source, {
      allowHashBang: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }),
  )
  return offsets.sort((left, right) => left[0] - right[0])
}

async function loadTypeScript() {
  const filename = path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  const imported = await import(pathToFileURL(filename).href)
  return imported.default ?? imported
}

function gitBlob(commit, sourcePath) {
  const result = spawnSync('git', ['rev-parse', `${commit}:${sourcePath}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function exactNodeDescriptor(source, sourceFile, node) {
  return descriptor(
    Buffer.from(source.slice(node.getStart(sourceFile), node.end)),
  )
}

test(
  'Target119 retained computer-use setup fixture and override remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.partitionSnapshot, {
      typedAuditBytes: 24701325,
      typedAuditSha256:
        'e4fc8b6cc60092ba5bd3b451cefcd1bc1834bc988cb7b4f062e57cb1767cbe0b',
      sourceCoverageBytes: 377500,
      sourceCoverageSha256:
        '69b05794654d35c242fef43ae7f1844ca947c677c1f2de72d9b1d34f9972ab03',
      productionStrictRows: 1,
      ownerResidueRows: 0,
      addedOwnerResidueRows: 0,
      unclassifiedAddedOccurrenceRows: 0,
      coverageTargetRowPresent: false,
    })
    assert.deepEqual(fixture.artifactPhasePolicy, {
      pairing: 'exact-report-and-coverage-descriptor-pair',
      rejectHybridPairs: true,
      rejectUnknownPairs: true,
      acceptedPairs: [
        {
          phase: 'initial-snapshot',
          typedAudit: {
            bytes: 24701325,
            sha256:
              'e4fc8b6cc60092ba5bd3b451cefcd1bc1834bc988cb7b4f062e57cb1767cbe0b',
          },
          sourceCoverage: {
            bytes: 377500,
            sha256:
              '69b05794654d35c242fef43ae7f1844ca947c677c1f2de72d9b1d34f9972ab03',
          },
        },
        {
          phase: 'post-rendezvous',
          typedAudit: {
            bytes: 24697305,
            sha256:
              '1b156d078208c9df0baea3430dc58387f14d3535cd6052724f0847bd83d4d4f7',
          },
          sourceCoverage: {
            bytes: 378822,
            sha256:
              '355c431cda776c760ac1d1e5098dc03f322087bd2deb67a4ab53dd50aa6f2f4d',
          },
        },
        {
          phase: 'post-streaming',
          typedAudit: {
            bytes: 24991569,
            sha256:
              'c4ab243f3937141db7984b0d4d9cdde7900805369a74a8b9b7589b13fbd1e78d',
          },
          sourceCoverage: {
            bytes: 380714,
            sha256:
              'ad2d435743921b83fb784ff6baf34e1651fc83dc2e31f7680997a3bfd6241654',
          },
          sourceCoverageRaw: {
            bytes: 3283017,
            sha256:
              '1b47544fc4464cbc437b27133fe03438a2fecb384d4e607118d1a57cb014cc55',
          },
        },
      ],
    })
    const [initial, postRendezvous, postStreaming] =
      fixture.artifactPhasePolicy.acceptedPairs
    assert.deepEqual(
      resolveArtifactPhase(initial.typedAudit, initial.sourceCoverage),
      initial,
    )
    assert.deepEqual(
      resolveArtifactPhase(
        postRendezvous.typedAudit,
        postRendezvous.sourceCoverage,
      ),
      postRendezvous,
    )
    assert.deepEqual(
      resolveArtifactPhase(
        postStreaming.typedAudit,
        postStreaming.sourceCoverage,
        postStreaming.sourceCoverageRaw,
      ),
      postStreaming,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          postStreaming.typedAudit,
          postStreaming.sourceCoverage,
        ),
      /unknown or hybrid Target119 artifact phase/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          initial.typedAudit,
          postRendezvous.sourceCoverage,
        ),
      /unknown or hybrid Target119 artifact phase/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          postRendezvous.typedAudit,
          initial.sourceCoverage,
        ),
      /unknown or hybrid Target119 artifact phase/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          { bytes: 1, sha256: 'unknown-report' },
          postRendezvous.sourceCoverage,
        ),
      /unknown or hybrid Target119 artifact phase/,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.postRendezvous.typedResidues),
      fixture.postRendezvous.typedResiduesDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.postRendezvous.coverageTargetRows),
      fixture.postRendezvous.coverageTargetRowsDescriptor,
    )
    assert.deepEqual(fixture.postRendezvous.coverageTargetRows, [])
    assert.equal(fixture.postRendezvous.matchedStatic, true)
    assert.deepEqual(fixture.postStreaming, {
      typedResiduesDescriptor:
        fixture.postRendezvous.typedResiduesDescriptor,
      coverageTargetRowsDescriptor:
        fixture.postRendezvous.coverageTargetRowsDescriptor,
      typedResiduesUnchangedFromPostRendezvous: true,
      coverageTargetRowsUnchangedFromPostRendezvous: true,
      matchedStatic: true,
    })
    assert.deepEqual(
      fixture.postRendezvous.typedResidues.map(row => ({
        targetIndex: row.structural.index,
        classification: row.structural.classification,
        value: row.value,
        start: row.target.start,
        end: row.target.end,
        disposition: row.disposition,
        ownerPaths: row.ownerPaths,
      })),
      [
        {
          targetIndex: 21655,
          classification: 'matched',
          value: 'fileURLToPath',
          start: 13453960,
          end: 13453973,
          disposition: null,
          ownerPaths: [],
        },
      ],
    )
    assert.deepEqual(
      TARGET119_COMPUTER_USE_SETUP_RETAINED_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET119_COMPUTER_USE_SETUP_RETAINED_OWNER_OVERRIDES[0],
      {
        key: `${caseName}:${fixture.row.targetIndex}`,
        targetIndex: fixture.row.targetIndex,
        paths: fixture.row.ownerPaths,
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET119_COMPUTER_USE_SETUP_RETAINED_OWNER_OVERRIDES[0].behavior,
      },
    )
    assert.deepEqual(TARGET119_COMPUTER_USE_SETUP_RETAINED_PROOF_SPEC, {
      targetIndex: fixture.row.targetIndex,
      baselineUnitIndex: fixture.structuralPair.baselineUnitIndex,
      ownerPath: fixture.row.ownerPaths[0],
      declaration: fixture.row.declaration,
      representation: fixture.row.representation,
      residue: {
        kind: fixture.row.strictResidues[0].kind,
        value: fixture.row.strictResidues[0].value,
        start: fixture.row.strictResidues[0].start,
        end: fixture.row.strictResidues[0].end,
        baselineCount: fixture.row.strictResidues[0].baselineCount,
        targetOrdinal: fixture.row.strictResidues[0].targetOrdinal,
        targetAdded: fixture.row.strictResidues[0].targetAdded,
      },
    })
    assert.equal(fixture.sourceReplay.required, false)
    assert.equal(
      sha256(Buffer.from(JSON.stringify([fixture.row.targetIndex]))),
      fixture.summary.targetIndicesSha256,
    )
    const residue = fixture.row.strictResidues[0]
    assert.equal(
      sha256(
        Buffer.from(
          JSON.stringify([
            [
              fixture.row.targetIndex,
              residue.kind,
              residue.value,
              residue.start,
              residue.end,
              residue.baselineCount,
              residue.targetOrdinal,
              residue.targetAdded,
            ],
          ]),
        ),
      ),
      fixture.summary.strictResidueIdentitiesSha256,
    )
    assert.equal(
      sha256(
        Buffer.from(
          JSON.stringify(
            fixture.units.map(unit => [
              unit.targetIndex,
              unit.start,
              unit.end,
            ]),
          ),
        ),
      ),
      fixture.summary.crossReleaseUnitsSha256,
    )
  },
)

test(
  'complete Target118 and Target119 computer-use setup units are one retained AST',
  {
    skip: selected ? false : `not applicable to ${selectedCase}`,
    timeout: 30000,
  },
  () => {
    const bundles = new Map([
      [
        '2.1.118',
        readExact(
          artifactPath(
            'CLAUDE_CODE_2_1_118_BUNDLE',
            fixture.inputs.baselineBundle,
          ),
          fixture.inputs.baselineBundle,
          'Target118 bundle',
        ).toString('utf8'),
      ],
      [
        '2.1.119',
        readExact(
          artifactPath(
            'CLAUDE_CODE_2_1_119_BUNDLE',
            fixture.inputs.targetBundle,
          ),
          fixture.inputs.targetBundle,
          'Target119 bundle',
        ).toString('utf8'),
      ],
    ])
    for (const unit of fixture.units) {
      const unitText = bundles.get(unit.release).slice(unit.start, unit.end)
      assert.deepEqual(descriptor(Buffer.from(unitText)), {
        bytes: unit.bytes,
        sha256: unit.sha256,
      })
      assert.equal(tokenCount(unitText), unit.tokens)
      assert.deepEqual(descriptor(canonicalAst(unitText)), fixture.canonicalAst)
    }

    const structural = JSON.parse(
      gunzipSync(
        readExact(
          path.join(root, fixture.inputs.structural.path),
          fixture.inputs.structural,
          'Target119 structural ledger',
        ),
      ),
    )
    const region = structural.regions[fixture.row.targetIndex]
    const targetUnit = fixture.units.find(unit => unit.release === '2.1.119')
    assert.deepEqual(
      {
        classification: region.classification,
        pairReason: region.pairReason,
        baselineUnitIndex: region.baselineUnitIndex,
        unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
        target: {
          index: region.target.index,
          nodeType: region.target.nodeType,
          start: region.target.start,
          end: region.target.end,
          tokenCount: region.target.tokenCount,
          sourceHash: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
      },
      {
        classification: fixture.structuralPair.classification,
        pairReason: fixture.structuralPair.pairReason,
        baselineUnitIndex: fixture.structuralPair.baselineUnitIndex,
        unknownFreeIdentifierCount:
          fixture.structuralPair.unknownFreeIdentifierCount,
        target: {
          index: targetUnit.targetIndex,
          nodeType: 'FunctionDeclaration',
          start: targetUnit.start,
          end: targetUnit.end,
          tokenCount: targetUnit.tokens,
          sourceHash: targetUnit.sha256,
          coarseHash: fixture.structuralPair.targetCoarseHash,
        },
      },
    )

    const residue = fixture.row.strictResidues[0]
    const baselineProperties = propertyOffsets(
      bundles.get('2.1.118'),
      residue.value,
    )
    const targetProperties = propertyOffsets(
      bundles.get('2.1.119'),
      residue.value,
    )
    assert.equal(baselineProperties.length, residue.baselineCount)
    assert.equal(targetProperties.length, residue.targetGlobalOccurrenceCount)
    assert.deepEqual(
      baselineProperties[residue.baselineCounterpart.globalOrdinal - 1],
      [residue.baselineCounterpart.start, residue.baselineCounterpart.end],
    )
    assert.deepEqual(targetProperties[residue.targetOrdinal - 1], [
      residue.start,
      residue.end,
    ])
    const baselineUnit = fixture.units.find(unit => unit.release === '2.1.118')
    assert.deepEqual(
      [
        residue.baselineCounterpart.start - baselineUnit.start,
        residue.baselineCounterpart.end - baselineUnit.start,
      ],
      [residue.localStart, residue.localEnd],
    )
    assert.deepEqual(
      [residue.start - targetUnit.start, residue.end - targetUnit.start],
      [residue.localStart, residue.localEnd],
    )
  },
)

test(
  'exact setup source and release lineage authenticate the retained owner',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const sourceRoot = path.resolve(
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
    )
    const source = readExact(
      path.join(
        sourceRoot,
        fixture.sourceLineage.sourceFile.path.slice('src/'.length),
      ),
      fixture.sourceLineage.sourceFile,
      fixture.sourceLineage.sourceFile.path,
    ).toString('utf8')
    const ts = await loadTypeScript()
    const sourceFile = ts.createSourceFile(
      fixture.sourceLineage.sourceFile.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)

    const declarations = []
    const calls = []
    const variableDeclarations = []
    function visit(node) {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === fixture.sourceLineage.declaration.name
      ) {
        declarations.push(node)
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(sourceFile) === 'fileURLToPath'
      ) {
        calls.push(node)
      }
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(sourceFile) === 'args'
      ) {
        variableDeclarations.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert.equal(declarations.length, 1)
    assert.equal(calls.length, 1)
    assert.equal(variableDeclarations.length, 1)
    for (const [node, expected] of [
      [declarations[0], fixture.sourceLineage.declaration],
      [calls[0], fixture.sourceLineage.fileUrlCall],
      [variableDeclarations[0], fixture.sourceLineage.argsDeclaration],
    ]) {
      assert.deepEqual(
        {
          ...(expected.name ? { name: declarations[0].name.text } : {}),
          start: node.getStart(sourceFile),
          end: node.end,
          ...exactNodeDescriptor(source, sourceFile, node),
        },
        expected,
      )
    }
    assert.equal(calls[0].arguments.length, 1)
    assert.equal(calls[0].arguments[0].getText(sourceFile), 'import.meta.url')

    const imports = sourceFile.statements.filter(ts.isImportDeclaration)
    for (const expected of fixture.sourceLineage.imports) {
      const matches = imports.filter(
        node =>
          node.moduleSpecifier.text === expected.module &&
          node.importClause?.namedBindings?.elements.some(
            element => element.name.text === expected.binding,
          ),
      )
      assert.equal(matches.length, 1, `${expected.binding}: exact import`)
      assert.deepEqual(
        {
          module: expected.module,
          binding: expected.binding,
          start: matches[0].getStart(sourceFile),
          end: matches[0].end,
          ...exactNodeDescriptor(source, sourceFile, matches[0]),
        },
        expected,
      )
    }
    for (const commit of fixture.sourceLineage.commits) {
      assert.equal(
        gitBlob(commit, fixture.sourceLineage.sourceFile.path),
        fixture.sourceLineage.blob,
      )
    }
  },
)

test(
  'raw and packaged main sources retain the exact setup import and call graph',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const sourceRoot = path.resolve(
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src'),
    )
    const filename = path.join(
      sourceRoot,
      fixture.callerGraph.path.slice('src/'.length),
    )
    const bytes = fs.readFileSync(filename)
    assert.ok(
      fixture.callerGraph.sourceVariants.some(
        variant =>
          variant.bytes === bytes.length && variant.sha256 === sha256(bytes),
      ),
      'main.tsx is an exact raw or packaged source variant',
    )
    const source = bytes.toString('utf8')
    const ts = await loadTypeScript()
    const sourceFile = ts.createSourceFile(
      fixture.callerGraph.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)

    const importStatements = []
    const callStatements = []
    const calls = []
    function visit(node) {
      const text = source.slice(node.getStart(sourceFile), node.end)
      if (
        ts.isVariableStatement(node) &&
        text.includes("await import('src/utils/computerUse/setup.js')")
      ) {
        importStatements.push(node)
      }
      if (
        ts.isVariableStatement(node) &&
        text.includes('} = setupComputerUseMCP()')
      ) {
        callStatements.push(node)
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(sourceFile) === 'setupComputerUseMCP'
      ) {
        calls.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert.equal(importStatements.length, 1)
    assert.equal(callStatements.length, 1)
    assert.equal(calls.length, 1)
    assert.deepEqual(
      exactNodeDescriptor(source, sourceFile, importStatements[0]),
      fixture.callerGraph.dynamicImportStatement,
    )
    assert.deepEqual(
      exactNodeDescriptor(source, sourceFile, callStatements[0]),
      fixture.callerGraph.setupCallStatement,
    )
    assert.deepEqual(
      exactNodeDescriptor(source, sourceFile, calls[0]),
      fixture.callerGraph.setupCall,
    )
    for (const entry of fixture.callerGraph.commits) {
      assert.equal(gitBlob(entry.commit, fixture.callerGraph.path), entry.blob)
    }
  },
)
