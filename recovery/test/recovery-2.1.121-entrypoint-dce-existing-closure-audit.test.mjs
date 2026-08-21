import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-entrypoint-dce-existing-closure-audit.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '2d037196078e2b15d54048582f377cf6c7cb597ac63793239ee7f0394559b6bd'

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

function targetSourceRoot() {
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

function sameDescriptor(actual, expected) {
  return (
    actual?.bytes === expected?.bytes && actual?.sha256 === expected?.sha256
  )
}

function selectFrozenPhase(reportDescriptor, coverageDescriptor) {
  const phases = [
    ['postPrune', fixture.phaseSnapshots.frozenPostPrune],
    ['postDaemonOwner', fixture.phaseSnapshots.frozenPostDaemonOwner],
  ]
  const match = phases.find(
    ([, snapshot]) =>
      sameDescriptor(reportDescriptor, snapshot.typedReport) &&
      sameDescriptor(coverageDescriptor, snapshot.sourceCoverage),
  )
  if (!match) throw new Error('unknown-or-hybrid-target121-entrypoint-phase')
  return { name: match[0], snapshot: match[1] }
}

function generatorIdentity(row, residue) {
  return [
    row.targetIndex,
    residue.kind,
    residue.value,
    residue.start,
    residue.end,
    residue.baselineCount,
    residue.targetOrdinal,
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

function collectTs(source, ts, predicate) {
  const result = []
  function visit(node) {
    if (predicate(node)) result.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

function tsDescriptor(text, node, source) {
  const start = node.getStart(source)
  const end = node.end
  const value = text.slice(start, end)
  return {
    start,
    end,
    chars: value.length,
    ...descriptor(value),
  }
}

function parseSource(ts, filename, text) {
  const source = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.deepEqual(source.parseDiagnostics, [])
  return source
}

function sourceAudit(ts, root, expectedFile, expectedMain) {
  const relative = fixture.sourceEvidence.path.replace(/^src\//, '')
  const filename = path.join(root, relative)
  const bytes = readExact(filename, expectedFile)
  const text = bytes.toString('utf8')
  assert.equal(text.length, expectedFile.chars)
  const source = parseSource(ts, filename, text)
  const main = collectTs(
    source,
    ts,
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'main',
  )
  assert.equal(main.length, 1)
  assert.deepEqual(
    {
      ...tsDescriptor(text, main[0], source),
      async:
        main[0].modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword,
        ) ?? false,
      exported:
        main[0].modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) ?? false,
      parameters: main[0].parameters.map(parameter =>
        parameter.name.getText(source),
      ),
    },
    expectedMain,
  )
  const imports = collectTs(
    source,
    ts,
    node =>
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword,
  )
  return { imports, source, text }
}

function focusedImports(audit, ts) {
  return audit.imports
    .filter(call =>
      ['../daemon/spare.js', '../utils/managedEnv.js', '../main.js'].includes(
        call.arguments[0]?.text,
      ),
    )
    .map(call => {
      let statement = call
      while (statement && !ts.isVariableStatement(statement)) {
        statement = statement.parent
      }
      assert.ok(statement)
      const bindingElements = collectTs(
        statement.declarationList.declarations[0].name,
        ts,
        ts.isBindingElement,
      )
      const statementDescriptor = tsDescriptor(
        audit.text,
        statement,
        audit.source,
      )
      return {
        module: call.arguments[0].text,
        start: statementDescriptor.start,
        end: statementDescriptor.end,
        bytes: statementDescriptor.bytes,
        sha256: statementDescriptor.sha256,
        imported:
          bindingElements[0].propertyName?.getText(audit.source) ??
          bindingElements[0].name.getText(audit.source),
        local: bindingElements[0].name.getText(audit.source),
      }
    })
}

test(
  'u22217 reuses the exact pinned tail compiler artifact and rejects phase hybrids',
  { skip: !selected },
  () => {
    assert.deepEqual(descriptor(fixtureBytes), {
      bytes: fixtureBytes.length,
      sha256: FIXTURE_SHA256,
    })
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    for (const key of [
      'classificationFixture',
      'classificationTest',
      'classificationHelper',
      'generatorFixture',
      'generatorTest',
      'generatorHelper',
    ]) {
      const expected = fixture.dependencies[key]
      readExact(path.join(repositoryRoot, expected.path), expected)
    }

    const classification = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.dependencies.classificationFixture.path),
      ),
    )
    const classificationProof = classification.policy.compilerProofs.find(
      item => item.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(classificationProof)
    assert.deepEqual(
      canonicalDescriptor(classificationProof),
      fixture.dependencies.classificationProofDescriptor,
    )
    assert.equal(classificationProof.method, fixture.existingClosure.method)
    assert.deepEqual(
      classificationProof.sourceFiles[0],
      {
        path: 'entrypoints/cli.tsx',
        bytes: fixture.sourceEvidence.targetFile.bytes,
        sha256: fixture.sourceEvidence.targetFile.sha256,
        markers: fixture.existingClosure.sourceMarkers,
      },
    )
    assert.deepEqual(
      classificationProof.targetMarkers,
      fixture.existingClosure.targetMarkers,
    )

    const generator = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.dependencies.generatorFixture.path),
      ),
    )
    const generatorRow = generator.compilerRows.find(
      item => item.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(generatorRow)
    assert.deepEqual(
      canonicalDescriptor(generatorRow),
      fixture.dependencies.generatorRowDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(generatorRow.residues),
      fixture.dependencies.generatorResiduesDescriptor,
    )
    assert.equal(generatorRow.category, fixture.existingClosure.category)
    assert.equal(generatorRow.compilerMethod, fixture.existingClosure.method)
    assert.equal(generatorRow.disposition, fixture.existingClosure.disposition)
    assert.deepEqual(generatorRow.ownerPaths, fixture.existingClosure.ownerPaths)
    assert.deepEqual(generatorRow.evidenceIds, fixture.existingClosure.evidenceIds)
    assert.deepEqual(generatorRow.testIds, fixture.existingClosure.testIds)
    assert.deepEqual(generatorRow.witnessIds, fixture.existingClosure.witnessIds)
    assert.equal(generatorRow.residues.length, fixture.existingClosure.residueCount)

    const pre = fixture.phaseSnapshots.frozenPostPrune
    const post = fixture.phaseSnapshots.frozenPostDaemonOwner
    assert.deepEqual(
      selectFrozenPhase(pre.typedReport, pre.sourceCoverage),
      { name: 'postPrune', snapshot: pre },
    )
    assert.deepEqual(
      selectFrozenPhase(post.typedReport, post.sourceCoverage),
      { name: 'postDaemonOwner', snapshot: post },
    )
    assert.throws(
      () => selectFrozenPhase(pre.typedReport, post.sourceCoverage),
      /unknown-or-hybrid-target121-entrypoint-phase/,
    )
    assert.throws(
      () => selectFrozenPhase(post.typedReport, pre.sourceCoverage),
      /unknown-or-hybrid-target121-entrypoint-phase/,
    )
    assert.throws(
      () =>
        selectFrozenPhase(
          { bytes: 0, sha256: 'unknown-report' },
          { bytes: 0, sha256: 'unknown-coverage' },
        ),
      /unknown-or-hybrid-target121-entrypoint-phase/,
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
        bytes: post.sourceCoverage.rawBytes,
        sha256: post.sourceCoverage.rawSha256,
      },
      {
        bytes: 2974761,
        sha256:
          '8b53acac16477ad92958b40bc7b9c44cba07b6ea48671adacc5c94f7235b173f',
      },
    )
    assert.deepEqual(
      canonicalDescriptor(post.coverageRows),
      post.coverageRowsDescriptor,
    )
    assert.deepEqual(post.coverageRows[0], {
      targetIndex: generatorRow.targetIndex,
      start: generatorRow.target.start,
      end: generatorRow.target.end,
      nodeType: generatorRow.target.nodeType,
      sourceHash: generatorRow.target.sourceHash,
      structuralClass: generatorRow.target.classification,
      disposition: generatorRow.disposition,
      ownerIds: ['owner-src-entrypoints-cli-tsx'],
      evidenceIds: generatorRow.evidenceIds,
      behavior: generatorRow.behavior,
    })
    for (const key of [
      'newOwnerOverride',
      'newCoverageOverride',
      'newHelper',
      'wholeUnitOverride',
      'sourceReplay',
      'generatorEdit',
    ]) {
      assert.equal(fixture.existingClosure[key], false)
    }
  },
)

test(
  'the inherited 83-row proof consumes added ownership, splits strict 15/6, and retains 103 owner rows',
  { skip: !selected },
  () => {
    const generator = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.dependencies.generatorFixture.path),
      ),
    )
    const row = generator.compilerRows.find(
      item => item.targetIndex === fixture.targetUnit.targetIndex,
    )
    const proofIdentities = row.residues.map(residue =>
      generatorIdentity(row, residue),
    )
    assert.deepEqual(
      canonicalDescriptor(proofIdentities),
      fixture.dependencies.generatorIdentityOrderDescriptor,
    )
    assert.equal(new Set(proofIdentities.map(JSON.stringify)).size, 83)

    const strict = fixture.strictPartition.identities
    assert.deepEqual(
      canonicalDescriptor(strict),
      fixture.strictPartition.identitiesDescriptor,
    )
    const proofSet = new Set(proofIdentities.map(JSON.stringify))
    assert.ok(strict.every(identity => proofSet.has(JSON.stringify(identity))))
    const macro = strict.slice(...fixture.strictPartition.macroExpansion.slice)
    const authored = strict.slice(...fixture.strictPartition.authoredImports.slice)
    assert.equal(macro.length, 15)
    assert.equal(authored.length, 6)
    assert.deepEqual(
      canonicalDescriptor(macro),
      fixture.strictPartition.macroExpansion.identitiesDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(authored),
      fixture.strictPartition.authoredImports.identitiesDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(
        fixture.strictPartition.macroExpansion.macroSchemaIndices.map(
          index => strict[index],
        ),
      ),
      fixture.strictPartition.macroExpansion.macroSchemaIdentitiesDescriptor,
    )
    assert.deepEqual(
      canonicalDescriptor(
        fixture.strictPartition.macroExpansion.releaseMetadataIndices.map(
          index => strict[index],
        ),
      ),
      fixture.strictPartition.macroExpansion.releaseMetadataIdentitiesDescriptor,
    )
    assert.deepEqual(authored.map(identity => identity[2]), [
      'runBgSpare',
      'applySafeConfigEnvironmentVariables',
      'applySafeConfigEnvironmentVariables',
      'applySafeConfigEnvironmentVariables',
      'applySafeConfigEnvironmentVariables',
      'main',
    ])

    const retained = fixture.retainedOwnerPartition.identities
    assert.equal(retained.length, fixture.retainedOwnerPartition.count)
    assert.deepEqual(
      canonicalDescriptor(retained),
      fixture.retainedOwnerPartition.identitiesDescriptor,
    )
    assert.ok(retained.every(identity => identity[7] === false))
    assert.ok(retained.every(identity => !proofSet.has(JSON.stringify(identity))))
    assert.equal(
      new Set([...proofIdentities, ...retained].map(JSON.stringify)).size,
      fixture.phaseSnapshots.frozenPostDaemonOwner.unitCounts.ownerRows,
    )
    assert.deepEqual(
      fixture.phaseSnapshots.frozenPostDaemonOwner.reconciliation,
      {
        allInheritedProofRowsInOwner: true,
        allInheritedProofRowsInAdded: true,
        allFreshAddedRowsInInheritedProof: true,
      },
    )
    assert.deepEqual(fixture.impact, {
      proofScope: {
        owner: { units: 1, rows: 83 },
        addedOwner: { units: 1, rows: 83 },
        strict: { units: 1, rows: 21 },
      },
      delta: {
        owner: { units: 0, rows: -83 },
        addedOwner: { units: -1, rows: -83 },
        strict: { units: -1, rows: -21 },
        coverage: { units: 0, rows: 0 },
      },
      postAdmission: {
        owner: { units: 1, rows: 103 },
        addedOwner: { units: 0, rows: 0 },
        strict: { units: 0, rows: 0 },
        coverage: { units: 1, rows: 1 },
      },
    })
  },
)

test(
  'authenticated u22217 contains three macro objects and the authored import bindings',
  { skip: !selected },
  () => {
    const bundle = readExact(
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
    assert.ok(region)
    assert.deepEqual(
      {
        classification: region.classification,
        nodeType: region.target.nodeType,
        parseStatus: region.target.parseStatus,
        start: region.target.start,
        end: region.target.end,
        bytes: region.target.end - region.target.start,
        tokenCount: region.target.tokenCount,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
        topDefinitionCount: region.target.topDefinitionCount,
        unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
      },
      {
        classification: fixture.targetUnit.classification,
        nodeType: fixture.targetUnit.nodeType,
        parseStatus: fixture.targetUnit.parseStatus,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        bytes: fixture.targetUnit.bytes,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sourceHash,
        coarseHash: fixture.targetUnit.coarseHash,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
      },
    )
    const bytes = bundle.subarray(fixture.targetUnit.start, fixture.targetUnit.end)
    assert.deepEqual(descriptor(bytes), {
      bytes: fixture.targetUnit.bytes,
      sha256: fixture.targetUnit.sourceHash,
    })
    const text = bytes.toString('utf8')
    const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].type, fixture.targetUnit.nodeType)
    assert.equal(ast.body[0].id.name, fixture.targetUnit.compiledBinding)
    assert.equal(ast.body[0].async, true)
    assert.equal(ast.body[0].params.length, 0)
    assert.equal(
      [...tokenizer(text, { ecmaVersion: 'latest' })].length,
      fixture.targetUnit.tokenCount,
    )

    const nodes = []
    walkAst(ast, node => nodes.push(node))
    const macroObjects = nodes.filter(
      node =>
        node.type === 'ObjectExpression' &&
        node.properties
          .map(property => property.key.name ?? property.key.value)
          .join('|') === fixture.bundleEvidence.macroKeys.join('|'),
    )
    assert.deepEqual(
      macroObjects.map(node => {
        const absoluteStart = fixture.targetUnit.start + node.start
        const absoluteEnd = fixture.targetUnit.start + node.end
        return {
          start: absoluteStart,
          end: absoluteEnd,
          bytes: node.end - node.start,
          sha256: sha256(text.slice(node.start, node.end)),
        }
      }),
      fixture.bundleEvidence.macroObjects,
    )
    for (const node of macroObjects) {
      assert.deepEqual(
        node.properties.map(property => property.key.name ?? property.key.value),
        fixture.bundleEvidence.macroKeys,
      )
      assert.deepEqual(
        node.properties.map(property => property.value.value),
        fixture.bundleEvidence.macroValues,
      )
    }

    const loweredImports = nodes.filter(
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.name === 'then' &&
        node.callee.object.type === 'CallExpression' &&
        node.callee.object.callee.type === 'MemberExpression' &&
        !node.callee.object.callee.computed &&
        node.callee.object.callee.object.name === 'Promise' &&
        node.callee.object.callee.property.name === 'resolve',
    )
    assert.equal(
      loweredImports.length,
      fixture.bundleEvidence.loweredDynamicImportCount,
    )
    assert.deepEqual(
      canonicalDescriptor(
        loweredImports.map(node => [
          fixture.targetUnit.start + node.start,
          fixture.targetUnit.start + node.end,
        ]),
      ),
      fixture.bundleEvidence.loweredDynamicImportCoordinatesDescriptor,
    )
    for (const [name, expected] of Object.entries(
      fixture.bundleEvidence.authoredCompiledIdentifiers,
    )) {
      const actual = nodes
        .filter(node => node.type === 'Identifier' && node.name === name)
        .map(node => [
          fixture.targetUnit.start + node.start,
          fixture.targetUnit.start + node.end,
        ])
      assert.deepEqual(actual, expected)
    }
  },
)

test(
  'raw and postPrune source pin three macro reads and the exact dynamic-import evolution',
  { skip: !selected },
  () => {
    const ts = typescript()
    const targetAudit = sourceAudit(
      ts,
      targetSourceRoot(),
      fixture.sourceEvidence.targetFile,
      fixture.sourceEvidence.targetMain,
    )
    const baselineAudit = sourceAudit(
      ts,
      path.join(repositoryRoot, fixture.inputs.sourceRoots.baseline),
      fixture.sourceEvidence.baselineFile,
      fixture.sourceEvidence.baselineMain,
    )

    function macroAccesses(audit) {
      return collectTs(
        audit.source,
        ts,
        node =>
          ts.isPropertyAccessExpression(node) &&
          node.expression.getText(audit.source) === 'MACRO',
      ).map(node => ({
        name: node.name.text,
        start: node.getStart(audit.source),
        end: node.end,
        text: node.getText(audit.source),
      }))
    }
    assert.deepEqual(
      macroAccesses(targetAudit),
      fixture.sourceEvidence.macroAccesses,
    )
    assert.deepEqual(
      macroAccesses(baselineAudit),
      fixture.sourceEvidence.macroAccesses,
    )
    assert.equal(
      targetAudit.imports.length,
      fixture.sourceEvidence.targetDynamicImportCount,
    )
    assert.equal(
      baselineAudit.imports.length,
      fixture.sourceEvidence.baselineDynamicImportCount,
    )
    assert.deepEqual(
      focusedImports(targetAudit, ts),
      fixture.sourceEvidence.targetFocusedImports,
    )
    assert.deepEqual(
      focusedImports(baselineAudit, ts),
      fixture.sourceEvidence.baselineFocusedImports,
    )
    assert.deepEqual(
      fixture.sourceEvidence.targetFocusedImports
        .slice(0, 3)
        .map(item => [item.module, item.imported]),
      [
        ['../daemon/spare.js', 'runBgSpare'],
        [
          '../utils/managedEnv.js',
          'applySafeConfigEnvironmentVariables',
        ],
        [
          '../utils/managedEnv.js',
          'applySafeConfigEnvironmentVariables',
        ],
      ],
    )
  },
)
