import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import * as helper from '../cases/2.1.118-to-2.1.119/recovered/headless-classifier-summary-strict-property-owner-overrides.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const artifactRoot = path.join(root, '.recovery-tmp/authenticated-artifacts')
const selectedSourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ?? path.join(root, 'src'),
)
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-headless-classifier-summary-strict-property-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/headless-classifier-summary-strict-property-owner-overrides.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'bf06768c07f633989cc544fba72457710e7322800c59ac9f874d6b99e3e66500'
const HELPER_SHA256 =
  '66a16d26f1afe5ede891300ff955a391390064a008601a3f62f77c1bef0ced8e'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function partitionDescriptor(rows) {
  const bytes = Buffer.from(JSON.stringify(rows))
  return { rows: rows.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function gitBlobSha1(value) {
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${value.length}\0`))
    .update(value)
    .digest('hex')
}

function readExact(filename, expected, label = filename) {
  const value = fs.readFileSync(filename)
  assert.deepEqual(
    descriptor(value),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return value
}

function artifactPath(environmentName, input) {
  return process.env[environmentName]
    ? path.resolve(process.env[environmentName])
    : path.join(artifactRoot, input.artifact)
}

function sliceExact(value, expected, label) {
  const result = value.subarray(expected.start, expected.end)
  assert.deepEqual(
    descriptor(result),
    { bytes: expected.bytes, sha256: expected.sha256 },
    label,
  )
  return result
}

function tokenCount(source) {
  const tokens = []
  parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    onToken: tokens,
  })
  assert.equal(tokens.at(-1).type.label, 'eof')
  return tokens.length - 1
}

function parseUnit(bundle, expected) {
  const bytes = sliceExact(bundle, expected, `u${expected.index}`)
  const text = bytes.toString('utf8')
  const program = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(program.body.length, 1)
  assert.equal(program.body[0].type, expected.nodeType)
  assert.equal(tokenCount(text), expected.tokenCount)
  return { bytes, text, program, node: program.body[0] }
}

function walk(node, visitor, parent = null, parentKey = null) {
  if (node === null || typeof node !== 'object') return
  visitor(node, parent, parentKey)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const nested of child) walk(nested, visitor, node, key)
    } else {
      walk(child, visitor, node, key)
    }
  }
}

function canonicalValue(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalValue(child, value, index))
  }
  if (value === null || typeof value !== 'object') return value
  const output = {}
  for (const [key, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (key === 'kind' && value.type === 'VariableDeclaration') {
      output[key] = 'var'
      continue
    }
    if (key === 'name' && value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          !parent.computed &&
          parentKey === 'property') ||
        (parent?.type === 'Property' &&
          !parent.computed &&
          !parent.shorthand &&
          parentKey === 'key')
      output[key] = preserve ? child : '@id'
    } else {
      output[key] = canonicalValue(child, value, key)
    }
  }
  return output
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(canonicalValue(value)))
}

function canonicalDescriptor(value) {
  const bytes = canonicalBytes(value)
  return { jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function longestCommonSubsequence(left, right) {
  const table = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0),
  )
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i] === right[j]
          ? 1 + table[i + 1][j + 1]
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table[0][0]
}

function transitionNodes(text, declaration) {
  let permissionSequence
  let afterLoadStatement
  let messageLoop
  walk(declaration, node => {
    const source = text.slice(node.start, node.end)
    if (
      node.type === 'SequenceExpression' &&
      source.includes('"requires_action"')
    ) {
      permissionSequence = node
    }
    if (
      node.type === 'ExpressionStatement' &&
      source.includes('after_loadInitialMessages')
    ) {
      afterLoadStatement = node
    }
    if (
      node.type === 'ForOfStatement' &&
      source.includes('post_turn_summary')
    ) {
      messageLoop = node
    }
  })
  assert(permissionSequence)
  assert(afterLoadStatement)
  assert(messageLoop)
  return { permissionSequence, afterLoadStatement, messageLoop }
}

function stripTargetTaskSummaryArm(node) {
  if (node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(stripTargetTaskSummaryArm)
  if (
    node.type === 'LogicalExpression' &&
    node.operator === '||' &&
    node.right?.type === 'BinaryExpression' &&
    node.right.right?.type === 'Literal' &&
    node.right.right.value === 'task_summary'
  ) {
    return stripTargetTaskSummaryArm(node.left)
  }
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    node[key] = stripTargetTaskSummaryArm(child)
  }
  return node
}

function structuralUnit(structural, side, index) {
  if (side === 'target') {
    return [
      ...structural.regions.map(region => region.target),
      ...structural.unresolvedTarget,
    ].find(unit => unit?.index === index)
  }
  return [
    ...structural.unmatchedBaseline,
    ...structural.regions.map(region => region.baseline),
  ].find(unit => unit?.index === index)
}

function structuralProjection(unit) {
  return {
    index: unit.index,
    nodeType: unit.nodeType,
    start: unit.start,
    end: unit.end,
    tokenCount: unit.tokenCount,
    sourceHash: unit.sourceHash,
    coarseHash: unit.coarseHash,
  }
}

function expectedStructural(input) {
  return {
    index: input.index,
    nodeType: input.nodeType,
    start: input.start,
    end: input.end,
    tokenCount: input.tokenCount,
    sourceHash: input.sha256,
    coarseHash: input.coarseHash,
  }
}

function occurrenceOffsets(buffer, value) {
  const needle = Buffer.from(value)
  const offsets = []
  for (
    let start = buffer.indexOf(needle);
    start >= 0;
    start = buffer.indexOf(needle, start + 1)
  ) {
    offsets.push(start)
  }
  return offsets
}

function identifierCount(text, name) {
  return text.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0
}

function declaredName(node) {
  if (node.type === 'FunctionDeclaration') return node.id.name
  if (node.type === 'ExpressionStatement') return null
  assert.equal(node.type, 'VariableDeclaration')
  return node.declarations
    .map(declaration =>
      declaration.id.type === 'Identifier'
        ? declaration.id.name
        : declaration.id.type,
    )
    .join(',')
}

function resolveArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      (pair.sourceCoverageRaw === undefined
        ? sourceCoverageRaw === undefined
        : sourceCoverageRaw !== undefined &&
          pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
          pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256),
  )
  if (matches.length !== 1) {
    throw new Error('unknown or hybrid Target119 report/coverage pair')
  }
  return matches[0]
}

function gitSource(commitInput, sourceInput) {
  const tree = spawnSync('git', ['rev-parse', `${commitInput.commit}^{tree}`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(tree.status, 0, tree.stderr)
  assert.equal(tree.stdout.trim(), commitInput.tree)
  const blob = spawnSync(
    'git',
    ['rev-parse', `${commitInput.commit}:${sourceInput.path}`],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(blob.status, 0, blob.stderr)
  assert.equal(blob.stdout.trim(), sourceInput.gitBlobSha1)
  const source = spawnSync(
    'git',
    ['show', `${commitInput.commit}:${sourceInput.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(source.status, 0, source.stderr?.toString())
  assert.deepEqual(descriptor(source.stdout), {
    bytes: sourceInput.bytes,
    sha256: sourceInput.sha256,
  })
  return source.stdout.toString('utf8')
}

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function allTypeScriptNodes(ts, rootNode, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(rootNode)
  return matches
}

function parseTypeScriptSource(ts, filename, text) {
  const sourceFile = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.deepEqual(sourceFile.parseDiagnostics, [])
  return sourceFile
}

function typeScriptNodeDescriptor(text, sourceFile, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return {
    characterStart: start,
    characterEnd: end,
    ...descriptor(Buffer.from(text.slice(start, end))),
  }
}

function printSourceNodes(ts, filename, text) {
  const sourceFile = parseTypeScriptSource(ts, filename, text)
  const runHeadless = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'runHeadless',
  )
  assert(runHeadless)
  const permissionCallback = allTypeScriptNodes(
    ts,
    runHeadless,
    node =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        declaration => declaration.name.getText(sourceFile) === 'onPermissionPrompt',
      ),
  )[0]
  assert(permissionCallback)
  const classifierCalls = allTypeScriptNodes(
    ts,
    permissionCallback,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) ===
        'runClassifierSummaryForBlocked',
  )
  const taskSummaryImports = sourceFile.statements.filter(
    statement =>
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === 'src/utils/taskSummary.js',
  )
  const canUseToolCall = allTypeScriptNodes(
    ts,
    runHeadless,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'getCanUseToolFn',
  )[0]
  assert(canUseToolCall)
  return {
    sourceFile,
    runHeadless,
    permissionCallback,
    classifierCalls,
    taskSummaryImports,
    canUseToolCall,
  }
}

function assertPrintSourceNodes(text, nodes, expected, target) {
  assert.deepEqual(
    typeScriptNodeDescriptor(text, nodes.sourceFile, nodes.runHeadless),
    expected.runHeadless,
  )
  assert.deepEqual(
    typeScriptNodeDescriptor(text, nodes.sourceFile, nodes.permissionCallback),
    expected.permissionCallback,
  )
  assert.deepEqual(
    typeScriptNodeDescriptor(text, nodes.sourceFile, nodes.canUseToolCall),
    expected.canUseToolCall,
  )
  assert.equal(nodes.canUseToolCall.arguments.length, 4)
  assert.equal(
    nodes.canUseToolCall.arguments.at(-1).getText(nodes.sourceFile),
    'onPermissionPrompt',
  )
  if (!target) {
    assert.equal(nodes.classifierCalls.length, expected.classifierCallCount)
    assert.equal(nodes.taskSummaryImports.length, expected.classifierImportCount)
    return
  }
  assert.equal(nodes.classifierCalls.length, 1)
  assert.equal(nodes.taskSummaryImports.length, 1)
  assert.deepEqual(
    typeScriptNodeDescriptor(
      text,
      nodes.sourceFile,
      nodes.classifierCalls[0],
    ),
    expected.classifierCall,
  )
  assert.deepEqual(
    typeScriptNodeDescriptor(
      text,
      nodes.sourceFile,
      nodes.taskSummaryImports[0],
    ),
    expected.taskSummaryImport,
  )
  assert.equal(
    text.slice(
      nodes.taskSummaryImports[0].getStart(nodes.sourceFile),
      nodes.taskSummaryImports[0].end,
    ),
    fixture.sourceGraph.classifierImportText,
  )
  assert.equal(
    text.slice(
      nodes.classifierCalls[0].getStart(nodes.sourceFile),
      nodes.classifierCalls[0].end,
    ),
    fixture.sourceGraph.classifierCallText,
  )
  const call = nodes.classifierCalls[0]
  assert.equal(call.arguments.length, 2)
  assert.equal(call.arguments[0].getText(nodes.sourceFile), 'details')
  assert.equal(call.arguments[1].properties.length, 1)
  assert.equal(
    call.arguments[1].properties[0].name.getText(nodes.sourceFile),
    'notifyMetadataChanged',
  )
  assert.equal(
    call.arguments[1].properties[0].initializer.getText(nodes.sourceFile),
    'notifySessionMetadataChanged',
  )
}

function taskSummaryGraph(ts, filename, text) {
  const sourceFile = parseTypeScriptSource(ts, filename, text)
  const declarations = new Map(
    sourceFile.statements
      .filter(
        statement =>
          ts.isFunctionDeclaration(statement) && statement.name !== undefined,
      )
      .map(statement => [statement.name.text, statement]),
  )
  const importedValues = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly)
      continue
    const namedBindings = statement.importClause?.namedBindings
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue
    for (const element of namedBindings.elements) {
      if (!element.isTypeOnly) {
        importedValues.set(element.name.text, statement.moduleSpecifier.text)
      }
    }
  }
  const identifierCalls = declaration =>
    allTypeScriptNodes(
      ts,
      declaration,
      node => ts.isCallExpression(node) && ts.isIdentifier(node.expression),
    ).map(node => node.expression.text)
  const reachable = new Set()
  const pending = ['runClassifierSummaryForBlocked']
  while (pending.length > 0) {
    const name = pending.shift()
    if (reachable.has(name)) continue
    const declaration = declarations.get(name)
    assert(declaration, name)
    reachable.add(name)
    for (const called of identifierCalls(declaration)) {
      if (declarations.has(called) && !reachable.has(called)) pending.push(called)
    }
  }
  const externalCalls = new Set()
  for (const name of reachable) {
    for (const called of identifierCalls(declarations.get(name))) {
      if (importedValues.has(called)) externalCalls.add(called)
    }
  }
  return { sourceFile, declarations, importedValues, reachable, externalCalls }
}

function inlineOptionalCallTemporary(declaration) {
  const temporary = declaration.body.body.find(
    statement =>
      statement.type === 'VariableDeclaration' &&
      statement.declarations.length === 1 &&
      statement.declarations[0].init?.type === 'ObjectExpression',
  )
  assert(temporary)
  const name = temporary.declarations[0].id.name
  const initializer = temporary.declarations[0].init
  walk(declaration, (node, parent, parentKey) => {
    if (
      node.type === 'Identifier' &&
      node.name === name &&
      parent?.type === 'Property' &&
      parentKey === 'value'
    ) {
      parent[parentKey] = structuredClone(initializer)
    }
  })
  declaration.body.body = declaration.body.body.filter(
    statement => statement !== temporary,
  )
}

test(
  'Target119 headless classifier strict fixture, helper, phase, and partitions remain frozen',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(Object.keys(helper), [
      'TARGET119_HEADLESS_CLASSIFIER_SUMMARY_DEPENDENCY_TARGET_INDICES',
      'TARGET119_HEADLESS_CLASSIFIER_SUMMARY_STRICT_PROPERTY_EVIDENCE_IDS',
      'TARGET119_HEADLESS_CLASSIFIER_SUMMARY_STRICT_PROPERTY_OWNER_OVERRIDES',
    ])
    assert.deepEqual(
      helper.TARGET119_HEADLESS_CLASSIFIER_SUMMARY_STRICT_PROPERTY_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      helper.TARGET119_HEADLESS_CLASSIFIER_SUMMARY_DEPENDENCY_TARGET_INDICES,
      fixture.compiledGraph.dependencyTargetIndices,
    )
    assert.deepEqual(
      helper.TARGET119_HEADLESS_CLASSIFIER_SUMMARY_STRICT_PROPERTY_OWNER_OVERRIDES.map(
        row => ({
          key: row.key,
          targetIndex: row.targetIndex,
          paths: row.paths,
          declarations: row.declarations,
          dependencyTargetIndices: row.dependencyTargetIndices,
          evidenceIds: row.evidenceIds,
        }),
      ),
      [
        {
          key: fixture.override.key,
          targetIndex: fixture.override.targetIndex,
          paths: fixture.override.ownerPaths,
          declarations: fixture.override.declarations,
          dependencyTargetIndices: fixture.override.dependencyTargetIndices,
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )
    const override =
      helper.TARGET119_HEADLESS_CLASSIFIER_SUMMARY_STRICT_PROPERTY_OWNER_OVERRIDES[0]
    assert.equal(override.behavior.includes('no source replay is authorized'), true)
    assert.equal(Object.isFrozen(override), true)
    assert.equal(Object.isFrozen(override.paths), true)
    assert.equal(Object.isFrozen(override.evidenceIds), true)

    const [phase, postStreaming] =
      fixture.artifactPhasePolicy.acceptedPairs
    assert.equal(
      resolveArtifactPhase(phase.typedAudit, phase.sourceCoverage).phase,
      'post-rendezvous',
    )
    assert.equal(
      resolveArtifactPhase(
        postStreaming.typedAudit,
        postStreaming.sourceCoverage,
        postStreaming.sourceCoverageRaw,
      ).phase,
      'post-streaming',
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          postStreaming.typedAudit,
          postStreaming.sourceCoverage,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          { ...phase.typedAudit, sha256: '0'.repeat(64) },
          phase.sourceCoverage,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(phase.typedAudit, {
          ...phase.sourceCoverage,
          sha256: 'f'.repeat(64),
        }),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        resolveArtifactPhase(
          { bytes: 1, sha256: '1'.repeat(64) },
          { bytes: 2, sha256: '2'.repeat(64) },
        ),
      /unknown or hybrid/,
    )

    // These rows are the one-time frozen postRendezvous partitions. This test
    // never opens the mutable report or coverage artifact.
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.typedResidues),
      fixture.snapshotPartitions.typedResiduesDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.coverageTarget),
      fixture.snapshotPartitions.coverageTargetDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.coverageGraphTuples),
      fixture.snapshotPartitions.coverageGraphDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(fixture.snapshotPartitions.ownerCatalog),
      fixture.snapshotPartitions.ownerCatalogDescriptor,
    )
    assert.deepEqual(
      fixture.snapshotPartitions.typedResidues.map(row => row.structural.index),
      [21741],
    )
    assert.deepEqual(
      fixture.snapshotPartitions.coverageTarget[0].ownerIds,
      ['owner-src-cli-print-ts'],
    )

    const strengthened = [
      {
        ...fixture.snapshotPartitions.coverageTarget[0],
        evidenceIds: [...override.evidenceIds],
        behavior: override.behavior,
      },
    ]
    assert.deepEqual(
      partitionDescriptor(strengthened),
      fixture.postWiring.coverageTargetDescriptor,
    )
    const strengthenedGraphTuples =
      fixture.snapshotPartitions.coverageGraphTuples.map(row =>
        row[0] === 21741
          ? [...row.slice(0, 8), [...override.evidenceIds]]
          : row,
      )
    assert.deepEqual(
      partitionDescriptor(strengthenedGraphTuples),
      fixture.postStreaming.coverageGraphTupleDescriptor,
    )
    assert.deepEqual(fixture.postStreaming, {
      typedResiduesDescriptor:
        fixture.snapshotPartitions.typedResiduesDescriptor,
      coverageTargetDescriptor:
        fixture.postWiring.coverageTargetDescriptor,
      coverageGraphTupleDescriptor: {
        rows: 13,
        jsonBytes: 3415,
        sha256:
          '9f45675853a15052ee45a3a38faefdfa142f99bc922447fa80fab32935239f07',
      },
      typedResiduesUnchangedFromPostRendezvous: true,
      coverageTargetEqualsPostWiringProjection: true,
    })
  },
)

test(
  'complete Target118 u20835 and Target119 u21741 units authenticate the manual predecessor',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const structuralBytes = readExact(
      path.join(root, fixture.inputs.structural.path),
      fixture.inputs.structural,
    )
    const structural = JSON.parse(gunzipSync(structuralBytes))
    const baselineStructural = structuralUnit(
      structural,
      'baseline',
      fixture.units.baselineHeadless.index,
    )
    const targetStructural = structuralUnit(
      structural,
      'target',
      fixture.units.targetHeadless.index,
    )
    assert.deepEqual(
      structuralProjection(baselineStructural),
      expectedStructural(fixture.units.baselineHeadless),
    )
    assert.deepEqual(
      structuralProjection(targetStructural),
      expectedStructural(fixture.units.targetHeadless),
    )
    assert.equal(
      structural.unmatchedBaseline.some(
        unit => unit.index === fixture.units.baselineHeadless.index,
      ),
      true,
    )
    const targetRegion = structural.regions.find(
      region => region.target?.index === fixture.units.targetHeadless.index,
    )
    assert.equal(targetRegion.classification, 'unresolved')
    assert.equal(
      targetRegion.unknownFreeIdentifierCount,
      fixture.units.targetHeadless.unknownFreeIdentifierCount,
    )

    for (const input of fixture.compiledGraph.units) {
      assert.deepEqual(
        structuralProjection(structuralUnit(structural, 'target', input.index)),
        expectedStructural(input),
      )
    }

    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const baseline = parseUnit(baselineBundle, fixture.units.baselineHeadless)
    const target = parseUnit(targetBundle, fixture.units.targetHeadless)
    assert.equal(
      baseline.node.body.body.length,
      fixture.predecessorProof.totalTopLevelStatements.baseline,
    )
    assert.equal(
      target.node.body.body.length,
      fixture.predecessorProof.totalTopLevelStatements.target,
    )
    const baselineStatementHashes = baseline.node.body.body.map(statement =>
      sha256(canonicalBytes(statement)),
    )
    const targetStatementHashes = target.node.body.body.map(statement =>
      sha256(canonicalBytes(statement)),
    )
    assert.equal(
      longestCommonSubsequence(
        baselineStatementHashes,
        targetStatementHashes,
      ),
      fixture.predecessorProof.commonTopLevelStatements,
    )

    const baselineNodes = transitionNodes(baseline.text, baseline.node)
    const targetNodes = transitionNodes(target.text, target.node)
    const baselineOutput = fixture.predecessorProof.normalizations[0]
    const targetOutput = fixture.predecessorProof.pairedChangedStatements.targetOutputInitializer
    const baselineLoop = fixture.predecessorProof.pairedChangedStatements.baselineMessageLoop
    const targetLoop = fixture.predecessorProof.normalizations[1]
    assert.deepEqual(
      descriptor(
        baseline.bytes.subarray(
          baselineNodes.afterLoadStatement.start,
          baselineNodes.afterLoadStatement.end,
        ),
      ),
      { bytes: baselineOutput.statement.bytes, sha256: baselineOutput.statement.sha256 },
    )
    assert.deepEqual(
      descriptor(
        target.bytes.subarray(
          targetNodes.afterLoadStatement.start,
          targetNodes.afterLoadStatement.end,
        ),
      ),
      { bytes: targetOutput.bytes, sha256: targetOutput.sha256 },
    )
    assert.deepEqual(
      descriptor(
        baseline.bytes.subarray(
          baselineNodes.messageLoop.start,
          baselineNodes.messageLoop.end,
        ),
      ),
      { bytes: baselineLoop.bytes, sha256: baselineLoop.sha256 },
    )
    assert.deepEqual(
      descriptor(
        target.bytes.subarray(
          targetNodes.messageLoop.start,
          targetNodes.messageLoop.end,
        ),
      ),
      { bytes: targetLoop.statement.bytes, sha256: targetLoop.statement.sha256 },
    )
    assert.equal(
      baselineNodes.afterLoadStatement.expression.expressions.length,
      4,
    )
    assert.equal(targetNodes.afterLoadStatement.expression.expressions.length, 3)
    assert.equal(
      target.text
        .slice(targetNodes.messageLoop.start, targetNodes.messageLoop.end)
        .includes('"task_summary"'),
      true,
    )
    assert.equal(
      baseline.text
        .slice(baselineNodes.messageLoop.start, baselineNodes.messageLoop.end)
        .includes('"task_summary"'),
      false,
    )

    const normalizedBaseline = structuredClone(baseline.node)
    const normalizedTarget = structuredClone(target.node)
    const normalizedBaselineNodes = transitionNodes(
      baseline.text,
      normalizedBaseline,
    )
    normalizedBaselineNodes.afterLoadStatement.expression.expressions =
      normalizedBaselineNodes.afterLoadStatement.expression.expressions.slice(1)
    stripTargetTaskSummaryArm(normalizedTarget)
    const baselineCanonical = canonicalBytes(normalizedBaseline)
    const targetCanonical = canonicalBytes(normalizedTarget)
    assert.deepEqual(targetCanonical, baselineCanonical)
    assert.deepEqual(
      {
        jsonBytes: targetCanonical.length,
        sha256: sha256(targetCanonical),
      },
      fixture.predecessorProof.normalizedCompleteUnitCanonical,
    )

    for (const [side, parsed, nodes] of [
      ['baseline', baseline, baselineNodes],
      ['target', target, targetNodes],
    ]) {
      const expected = fixture.predecessorProof.permissionSequence[side]
      const bytes = parsed.bytes.subarray(
        nodes.permissionSequence.start,
        nodes.permissionSequence.end,
      )
      assert.deepEqual(descriptor(bytes), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      assert.deepEqual(
        canonicalDescriptor(nodes.permissionSequence),
        fixture.predecessorProof.permissionSequence.canonical,
      )
      const expression = nodes.permissionSequence.expressions[1]
      assert.equal(expression.type, 'ChainExpression')
      const expressionExpected = fixture.predecessorProof.classifierExpression[side]
      assert.equal(
        parsed.text.slice(expression.start, expression.end),
        expressionExpected.text,
      )
      assert.deepEqual(
        descriptor(parsed.bytes.subarray(expression.start, expression.end)),
        { bytes: expressionExpected.bytes, sha256: expressionExpected.sha256 },
      )
      assert.deepEqual(
        canonicalDescriptor(expression),
        fixture.predecessorProof.classifierExpression.canonical,
      )
    }
  },
)

test(
  'the strict ordinal is caused by the new taskSummary export before the retained caller',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    assert.deepEqual(
      occurrenceOffsets(baselineBundle, fixture.strictProperty.value),
      fixture.strictProperty.baselineOccurrences.map(row => row.start),
    )
    assert.deepEqual(
      occurrenceOffsets(targetBundle, fixture.strictProperty.value),
      fixture.strictProperty.targetOccurrences.map(row => row.start),
    )
    assert.equal(
      fixture.strictProperty.baselineOccurrences.length,
      fixture.strictProperty.baselineOccurrenceCount,
    )
    assert.equal(
      fixture.strictProperty.targetOccurrences[1].start,
      fixture.snapshotPartitions.typedResidues[0].target.start,
    )
    assert.equal(
      fixture.strictProperty.targetOccurrenceNumber,
      fixture.snapshotPartitions.typedResidues[0].targetOccurrenceNumber,
    )

    const exportInput = fixture.compiledGraph.units.find(row => row.index === 13990)
    const exported = parseUnit(targetBundle, exportInput)
    assert.equal(exported.text, fixture.compiledGraph.exportTable.text)
    const exportCall = exported.node.expression
    assert.equal(exportCall.type, 'CallExpression')
    assert.equal(exportCall.arguments[0].name, 'B78')
    const bindings = Object.fromEntries(
      exportCall.arguments[1].properties.map(property => [
        property.key.name ?? property.key.value,
        property.value.body.name,
      ]),
    )
    assert.equal(
      bindings[fixture.strictProperty.value],
      fixture.compiledGraph.exportTable.binding,
    )
    const exportProperty = exportCall.arguments[1].properties.find(
      property =>
        (property.key.name ?? property.key.value) === fixture.strictProperty.value,
    )
    const propertyText = exported.text.slice(
      exportProperty.start,
      exportProperty.end,
    )
    assert.equal(propertyText, fixture.compiledGraph.exportTable.property.text)
    assert.deepEqual(descriptor(propertyText), {
      bytes: fixture.compiledGraph.exportTable.property.bytes,
      sha256: fixture.compiledGraph.exportTable.property.sha256,
    })
  },
)

test(
  'Target119 replaces the Target118 null namespace with one live exact implementation graph',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_119_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const baselineBinding = fixture.compiledGraph.baselineBinding
    assert.equal(
      sliceExact(baselineBundle, baselineBinding, 'Target118 null binding').toString(),
      baselineBinding.text,
    )
    assert.equal(
      identifierCount(baselineBundle.toString('utf8'), baselineBinding.name),
      baselineBinding.identifierCount,
    )
    const baselineUnit = parseUnit(baselineBundle, fixture.units.baselineHeadless)
    const baselineExpression = transitionNodes(
      baselineUnit.text,
      baselineUnit.node,
    ).permissionSequence.expressions[1]
    assert.equal(baselineExpression.expression.callee.object.name, 'X55')
    assert.equal(baselineExpression.expression.callee.optional, true)

    const graphUnits = new Map()
    for (const input of fixture.compiledGraph.units) {
      const unit = parseUnit(targetBundle, input)
      graphUnits.set(input.index, unit)
      assert.equal(declaredName(unit.node), input.name)
    }
    const targetBinding = fixture.compiledGraph.targetBinding
    const initializer = graphUnits.get(targetBinding.initializerTargetIndex)
    let assignment
    let assignmentWrites = 0
    walk(initializer.node, node => {
      if (
        node.type === 'AssignmentExpression' &&
        node.left.type === 'Identifier' &&
        node.left.name === targetBinding.name
      ) {
        assignmentWrites += 1
        assignment = node
      }
    })
    assert.equal(assignmentWrites, targetBinding.assignmentWriteCount)
    assert.equal(
      initializer.text.slice(assignment.start, assignment.end),
      targetBinding.text,
    )
    assert.deepEqual(
      descriptor(
        initializer.bytes.subarray(assignment.start, assignment.end),
      ),
      { bytes: targetBinding.bytes, sha256: targetBinding.sha256 },
    )
    assert.equal(
      identifierCount(targetBundle.toString('utf8'), targetBinding.name),
      targetBinding.identifierCount,
    )
    assert.equal(assignment.right.type, 'SequenceExpression')
    assert.equal(assignment.right.expressions[0].callee.name, 'F78')
    assert.equal(assignment.right.expressions[1].callee.name, 'b6')
    assert.equal(assignment.right.expressions[1].arguments[0].name, 'B78')

    const targetUnit = parseUnit(targetBundle, fixture.units.targetHeadless)
    const targetExpression = transitionNodes(
      targetUnit.text,
      targetUnit.node,
    ).permissionSequence.expressions[1]
    assert.equal(targetExpression.expression.callee.object.name, 'LV5')
    assert.equal(targetExpression.expression.callee.optional, true)
    assert.equal(
      targetExpression.expression.callee.property.name,
      fixture.strictProperty.value,
    )
    assert.equal(targetExpression.expression.arguments.length, 2)

    const moduleInitializer = graphUnits.get(14000)
    const initializerCalls = []
    walk(moduleInitializer.node, node => {
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
        initializerCalls.push(node.callee.name)
      }
    })
    assert.deepEqual(
      initializerCalls.filter(name => name !== 'T'),
      fixture.compiledGraph.moduleInitializerExternalCalls,
    )

    const ts = await loadTypeScript()
    const targetTaskSummary = gitSource(
      fixture.inputs.sourceCommits.target,
      fixture.inputs.sourceFiles.targetTaskSummary,
    )
    const transpiled = ts.transpileModule(targetTaskSummary, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
      },
    }).outputText
    const transpiledProgram = parse(transpiled, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const sourceImplementation = transpiledProgram.body.find(
      statement =>
        statement.type === 'ExportNamedDeclaration' &&
        statement.declaration?.type === 'FunctionDeclaration' &&
        statement.declaration.id.name === fixture.strictProperty.value,
    ).declaration
    const compiledImplementation = structuredClone(graphUnits.get(13998).node)
    inlineOptionalCallTemporary(compiledImplementation)
    assert.deepEqual(
      canonicalBytes(compiledImplementation),
      canonicalBytes(sourceImplementation),
    )
    assert.deepEqual(
      canonicalDescriptor(compiledImplementation),
      fixture.compiledGraph.implementationCanonicalAfterOptionalCallTempInlining,
    )
  },
)

test(
  'historical and selected cli/print.ts states retain the exact authored classifier callback graph',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const baselineText = gitSource(
      fixture.inputs.sourceCommits.baseline,
      fixture.inputs.sourceFiles.baselinePrint,
    )
    const targetText = gitSource(
      fixture.inputs.sourceCommits.target,
      fixture.inputs.sourceFiles.targetPrint,
    )
    const baselineTaskSummary = spawnSync(
      'git',
      [
        'cat-file',
        '-e',
        `${fixture.inputs.sourceCommits.baseline.commit}:${fixture.inputs.sourceFiles.targetTaskSummary.path}`,
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert.notEqual(baselineTaskSummary.status, 0)

    const baselineNodes = printSourceNodes(
      ts,
      fixture.inputs.sourceFiles.baselinePrint.path,
      baselineText,
    )
    assertPrintSourceNodes(
      baselineText,
      baselineNodes,
      fixture.sourceGraph.baseline.print,
      false,
    )
    const historicalTarget = fixture.sourceGraph.targetPrintVariants.find(
      state => state.state === 'historical-target',
    )
    const targetNodes = printSourceNodes(
      ts,
      fixture.inputs.sourceFiles.targetPrint.path,
      targetText,
    )
    assertPrintSourceNodes(targetText, targetNodes, historicalTarget, true)

    const selectedFilename = path.join(selectedSourceRoot, 'cli/print.ts')
    const selectedBytes = fs.readFileSync(selectedFilename)
    const selectedMatches = fixture.sourceGraph.targetPrintVariants.filter(
      state =>
        state.file.bytes === selectedBytes.length &&
        state.file.sha256 === sha256(selectedBytes),
    )
    assert.equal(selectedMatches.length, 1, 'unknown cli/print.ts source state')
    const selectedState = selectedMatches[0]
    assert.equal(gitBlobSha1(selectedBytes), selectedState.file.gitBlobSha1)
    const selectedText = selectedBytes.toString('utf8')
    const selectedNodes = printSourceNodes(ts, selectedFilename, selectedText)
    assertPrintSourceNodes(selectedText, selectedNodes, selectedState, true)
  },
)

test(
  'the exact taskSummary graph proves the owner and the static replay boundary',
  { skip: selected ? false : `not applicable to ${selectedCase}` },
  async () => {
    const ts = await loadTypeScript()
    const historicalText = gitSource(
      fixture.inputs.sourceCommits.target,
      fixture.inputs.sourceFiles.targetTaskSummary,
    )
    const selectedFilename = path.join(selectedSourceRoot, 'utils/taskSummary.ts')
    const selectedBytes = readExact(
      selectedFilename,
      fixture.sourceGraph.taskSummary.file,
      'selected taskSummary.ts',
    )
    assert.equal(selectedBytes.toString('utf8'), historicalText)
    const graph = taskSummaryGraph(ts, selectedFilename, historicalText)

    for (const expected of fixture.sourceGraph.taskSummary.declarations) {
      const declaration = graph.declarations.get(expected.name)
      assert(declaration, expected.name)
      assert.deepEqual(
        typeScriptNodeDescriptor(
          historicalText,
          graph.sourceFile,
          declaration,
        ),
        {
          characterStart: expected.characterStart,
          characterEnd: expected.characterEnd,
          bytes: expected.bytes,
          sha256: expected.sha256,
        },
      )
    }
    assert.deepEqual(
      [...graph.reachable].sort(),
      [...fixture.sourceGraph.taskSummary.reachableLocalFunctions].sort(),
    )
    for (const excluded of fixture.sourceGraph.taskSummary.excludedExportedSiblingFunctions) {
      assert.equal(graph.reachable.has(excluded), false)
    }
    const expectedExternal = fixture.sourceGraph.taskSummary.externalRuntimeImports
    assert.deepEqual(
      [...graph.externalCalls].sort(),
      expectedExternal.map(row => row.name).sort(),
    )
    for (const expected of expectedExternal) {
      assert.equal(graph.importedValues.get(expected.name), expected.module)
    }
    assert.equal(expectedExternal.length, 6)
    assert.equal(fixture.replayDisposition.mode, 'static-only')
    assert.equal(fixture.replayDisposition.sourceReplayAuthorized, false)
    assert.equal(
      fixture.compiledGraph.moduleInitializerExternalCalls.length,
      5,
    )
    assert.equal(fixture.wiringRecipe.replayExport, null)
    assert.equal(fixture.wiringRecipe.combinedHarnessChangeRequired, false)
    assert.deepEqual(fixture.postWiring.expectedImpact, {
      productionStrictRowsChanged: 0,
      ownerPathsChanged: 0,
      coverageRowsEvidenceStrengthened: 1,
      sourceFilesChanged: 0,
      sourceReplayFiles: 0,
    })
  },
)
