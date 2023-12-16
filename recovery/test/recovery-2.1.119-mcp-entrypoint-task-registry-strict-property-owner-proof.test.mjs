import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as helper from '../cases/2.1.118-to-2.1.119/recovered/mcp-entrypoint-task-registry-strict-property-owner-overrides.mjs'
import * as target118Helper from '../cases/2.1.117-to-2.1.118/recovered/mcp-entrypoint-build-context-owner-overrides.mjs'

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
  'recovery/test/recovery-2.1.119-mcp-entrypoint-task-registry-strict-property-owner-proof.json',
)
const helperPath = path.join(
  root,
  'recovery/cases/2.1.118-to-2.1.119/recovered/mcp-entrypoint-task-registry-strict-property-owner-overrides.mjs',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const FIXTURE_SHA256 =
  'a222e5ba8884f5429405249d7bdbcc2a34dad1507b095329c6ce15237511e0b2'
const HELPER_SHA256 =
  '78ef9b62c1389482a35474d624f25ac529f991fb4b661d99bf55bd735e7e775f'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function jsonDescriptor(value) {
  const bytes = Buffer.from(JSON.stringify(value))
  return { jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function partitionDescriptor(rows) {
  return { rows: rows.length, ...jsonDescriptor(rows) }
}

function gitBlobSha1(value) {
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${value.length}\0`))
    .update(value)
    .digest('hex')
}

function readExact(input, base = root) {
  const value = fs.readFileSync(path.join(base, input.path))
  assert.deepEqual(
    descriptor(value),
    { bytes: input.bytes, sha256: input.sha256 },
    input.path,
  )
  return value
}

function readArtifact(input) {
  const value = fs.readFileSync(path.join(artifactRoot, input.artifact))
  assert.deepEqual(
    descriptor(value),
    { bytes: input.bytes, sha256: input.sha256 },
    input.artifact,
  )
  return value
}

function sliceExact(value, input, label) {
  const result = value.subarray(input.start, input.end)
  assert.deepEqual(
    descriptor(result),
    { bytes: input.bytes, sha256: input.sha256 },
    label,
  )
  return result
}

function canonicalToken(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'string') return `S:${JSON.stringify(token.value)}`
  if (token.type.label === 'num') return `N:${token.value}`
  if (token.type.label === 'bigint') return `B:${token.value}`
  if (token.type.label === 'regexp') {
    return `R:${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function tokens(source, globalOffset = 0) {
  const output = []
  const stream = tokenizer(source, { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') return output
    output.push({
      canonical: canonicalToken(token),
      raw: source.slice(token.start, token.end),
      value: token.value,
      start: globalOffset + token.start,
      end: globalOffset + token.end,
    })
  }
}

function parseUnit(bundle, input) {
  const bytes = sliceExact(bundle, input, `u${input.index}`)
  const text = bytes.toString('utf8')
  const program = parse(text, { ecmaVersion: 'latest', sourceType: 'script' })
  assert.equal(program.body.length, 1)
  assert.equal(program.body[0].type, input.nodeType)
  const unitTokens = tokens(text, input.start)
  assert.equal(unitTokens.length, input.tokenCount)
  return { bytes, text, node: program.body[0], program, tokens: unitTokens, input }
}

const buildValues = new Map(
  Object.entries(fixture.buildMacroProof).flatMap(([name, proof]) => [
    [proof.baselineValue, `<${name}>`],
    [proof.targetValue, `<${name}>`],
  ]),
)

function canonicalAst(value, normalizeBuilds = true, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) =>
      canonicalAst(child, normalizeBuilds, value, index),
    )
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
      continue
    }
    if (
      key === 'value' &&
      value.type === 'Literal' &&
      normalizeBuilds &&
      buildValues.has(child)
    ) {
      output[key] = buildValues.get(child)
      continue
    }
    output[key] = canonicalAst(child, normalizeBuilds, value, key)
  }
  return output
}

function differences(left, right, valuePath = '$', output = []) {
  if (Object.is(left, right)) return output
  if (
    typeof left !== typeof right ||
    left === null ||
    right === null ||
    typeof left !== 'object'
  ) {
    output.push({ path: valuePath, left, right })
    return output
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    differences(left[key], right[key], `${valuePath}.${key}`, output)
  }
  return output
}

function walk(node, visitor) {
  if (node === null || typeof node !== 'object') return
  visitor(node)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const nested of child) walk(nested, visitor)
    } else {
      walk(child, visitor)
    }
  }
}

function propertyRecord(unit, propertyName) {
  const result = []
  walk(unit.node, node => {
    if (node.type !== 'Property') return
    const key = node.key?.type === 'Identifier' ? node.key.name : node.key?.value
    if (key !== propertyName) return
    const bytes = unit.bytes.subarray(node.start, node.end)
    result.push({
      start: unit.input.start + node.start,
      end: unit.input.start + node.end,
      ...descriptor(bytes),
      canonical: jsonDescriptor(canonicalAst(node)),
    })
  })
  assert.equal(result.length, 1, propertyName)
  return result[0]
}

function literalRecord(unit, value) {
  const result = []
  walk(unit.node, node => {
    if (node.type !== 'Literal' || node.value !== value) return
    const bytes = unit.bytes.subarray(node.start, node.end)
    result.push({
      start: unit.input.start + node.start,
      end: unit.input.start + node.end,
      ...descriptor(bytes),
    })
  })
  assert.equal(result.length, 1, value)
  return result[0]
}

function normalizedTokenDescriptor(unit) {
  const normalized = unit.tokens.map((token, index) =>
    fixture.completeUnitProof.macroTokenIndices.includes(index)
      ? fixture.completeUnitProof.normalizedToken
      : token.canonical,
  )
  return { tokens: normalized.length, ...jsonDescriptor(normalized) }
}

function occurrenceNeighborhood(unit, value, radius) {
  const index = unit.tokens.findIndex(token => token.raw === value)
  assert.notEqual(index, -1, value)
  assert.equal(
    unit.tokens.filter(token => token.raw === value).length,
    1,
    value,
  )
  const token = unit.tokens[index]
  const neighborhood = unit.tokens
    .slice(Math.max(0, index - radius), index + radius + 1)
    .map(row => row.canonical)
  return {
    tokenIndex: index,
    start: token.start,
    end: token.end,
    neighborhood: {
      radius,
      tokens: neighborhood.length,
      ...jsonDescriptor(neighborhood),
    },
  }
}

function rowTuple(row) {
  return [
    row.value,
    row.literalKind,
    row.targetAdded,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.target.start,
    row.target.end,
    row.structural.index,
    row.structural.classification,
    row.structural.sourceHash,
    row.disposition,
    row.ownerPaths,
  ]
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const phase = fixture.artifactPhasePolicy.acceptedPairs.find(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
      pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256,
  )
  assert.ok(phase, 'unknown or hybrid report/coverage pair')
  return phase.phase
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

let typescriptPromise
function loadTypeScript() {
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

function byteOffset(source, characterOffset) {
  return Buffer.byteLength(source.slice(0, characterOffset))
}

function sourceNodeRecord(bytes, source, sourceFile, node) {
  const characterStart = node.getStart(sourceFile)
  const characterEnd = node.end
  const byteStart = byteOffset(source, characterStart)
  const byteEnd = byteOffset(source, characterEnd)
  return {
    characterStart,
    characterEnd,
    byteStart,
    byteEnd,
    ...descriptor(bytes.subarray(byteStart, byteEnd)),
  }
}

async function inspectSource(bytes, label) {
  assert.deepEqual(descriptor(bytes), {
    bytes: fixture.sourceGraph.file.bytes,
    sha256: fixture.sourceGraph.file.sha256,
  })
  assert.equal(gitBlobSha1(bytes), fixture.sourceGraph.file.gitBlobSha1)
  const ts = await loadTypeScript()
  const source = bytes.toString('utf8')
  const sourceFile = ts.createSourceFile(
    fixture.sourceGraph.sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, label)
  const imports = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    const moduleName = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (clause?.name) imports.set(clause.name.text, moduleName)
    const bindings = clause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, moduleName)
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, moduleName)
      }
    }
  }
  const exports = []
  let declaration
  const visitFile = node => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      exports.push(node.name?.text)
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === fixture.sourceGraph.declaration.name
    ) {
      declaration = node
    }
    ts.forEachChild(node, visitFile)
  }
  visitFile(sourceFile)
  assert.ok(declaration, label)
  assert.deepEqual(
    sourceNodeRecord(bytes, source, sourceFile, declaration),
    {
      characterStart: fixture.sourceGraph.declaration.characterStart,
      characterEnd: fixture.sourceGraph.declaration.characterEnd,
      byteStart: fixture.sourceGraph.declaration.byteStart,
      byteEnd: fixture.sourceGraph.declaration.byteEnd,
      bytes: fixture.sourceGraph.declaration.bytes,
      sha256: fixture.sourceGraph.declaration.sha256,
    },
  )
  const declarationText = declaration.getText(sourceFile)
  const markerCounts = Object.fromEntries(
    Object.keys(fixture.sourceGraph.markerCounts).map(marker => [
      marker,
      declarationText.split(marker).length - 1,
    ]),
  )
  const directCalls = new Set()
  const nestedFunctions = []
  const visitDeclaration = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      directCalls.add(node.expression.text)
    }
    if (ts.isFunctionDeclaration(node) && node !== declaration) {
      nestedFunctions.push(node.name?.text)
    }
    ts.forEachChild(node, visitDeclaration)
  }
  visitDeclaration(declaration)
  const directIdentifierCalls = [...directCalls].sort()
  const runtimeDependencyBindings = directIdentifierCalls
    .filter(name => imports.has(name))
    .map(name => [name, imports.get(name)])
  return {
    exports: exports.sort(),
    nestedFunctions: nestedFunctions.sort(),
    markerCounts,
    directIdentifierCalls,
    runtimeDependencyBindings,
  }
}

test(
  'Target119 u21776 helper and Target118 predecessor contracts are frozen static-only evidence',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(sha256(fs.readFileSync(helperPath)), HELPER_SHA256)
    assert.deepEqual(
      helper.TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      helper.TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_DEPENDENCY_TARGET_INDICES,
      fixture.override.dependencyTargetIndices,
    )
    const overrides =
      helper.TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_STRICT_PROPERTY_OWNER_OVERRIDES
    assert.equal(overrides.length, 1)
    assert.deepEqual(
      {
        key: overrides[0].key,
        targetIndex: overrides[0].targetIndex,
        paths: [...overrides[0].paths],
        declarations: [...overrides[0].declarations],
        dependencyTargetIndices: [...overrides[0].dependencyTargetIndices],
        evidenceIds: [...overrides[0].evidenceIds],
      },
      {
        key: fixture.override.key,
        targetIndex: fixture.override.targetIndex,
        paths: fixture.override.ownerPaths,
        declarations: fixture.override.declarations,
        dependencyTargetIndices: fixture.override.dependencyTargetIndices,
        evidenceIds: fixture.evidenceIds,
      },
    )
    assert.ok(overrides[0].behavior.includes('Target118 u20870'))
    assert.ok(overrides[0].behavior.includes('token index 385'))
    assert.ok(overrides[0].behavior.includes('VERSION, BUILD_TIME, and GIT_SHA'))
    assert.ok(overrides[0].behavior.includes('no source replay'))
    assert.ok(Object.isFrozen(overrides))
    assert.ok(Object.isFrozen(overrides[0]))

    for (const input of Object.values(fixture.inputs.target118ProofContracts)) {
      readExact(input)
    }
    const previous =
      target118Helper.TARGET118_MCP_ENTRYPOINT_BUILD_CONTEXT_OWNER_OVERRIDES[0]
    assert.equal(previous.targetIndex, fixture.units.baselineCreateServer.index)
    assert.deepEqual([...previous.paths], fixture.override.ownerPaths)
    assert.deepEqual([...previous.declarations], fixture.override.declarations)
    const previousFixture = JSON.parse(
      readExact(fixture.inputs.target118ProofContracts.fixture),
    )
    assert.equal(
      previousFixture.targetUnit.sourceHash,
      fixture.units.baselineCreateServer.sha256,
    )
    assert.deepEqual(
      previousFixture.canonicalTokenProof.macroTokenIndices,
      fixture.completeUnitProof.macroTokenIndices,
    )
    assert.deepEqual(
      previousFixture.canonicalTokenProof.baseline,
      {
        tokens: fixture.completeUnitProof.normalizedCanonicalTokenStream.tokens,
        bytes: fixture.completeUnitProof.normalizedCanonicalTokenStream.jsonBytes,
        sha256: fixture.completeUnitProof.normalizedCanonicalTokenStream.sha256,
      },
    )
    assert.ok(
      previousFixture.targetUnit.residues.some(
        row =>
          row[1] === 'taskRegistry' &&
          row[2] === fixture.taskRegistryProof.baseline.start &&
          row[5] === fixture.taskRegistryProof.baselineGlobalOccurrenceNumber,
      ),
    )
  },
)

test(
  'Target119 u21776 final owner, added, strict, and coverage partitions are exact',
  { skip: !selected },
  () => {
    const accepted = fixture.artifactPhasePolicy.acceptedPairs[0]
    const typedAuditPath = path.resolve(
      process.env.CLAUDE_CODE_TYPED_AUDIT_PATH ??
        path.join(root, accepted.typedAudit.path),
    )
    const sourceCoveragePath = path.resolve(
      process.env.CLAUDE_CODE_SOURCE_COVERAGE_PATH ??
        path.join(root, accepted.sourceCoverage.path),
    )
    const typedAuditBytes = fs.readFileSync(typedAuditPath)
    const sourceCoverageBytes = fs.readFileSync(sourceCoveragePath)
    const sourceCoverageRaw = gunzipSync(sourceCoverageBytes)
    const typedAuditDescriptor = descriptor(typedAuditBytes)
    const sourceCoverageDescriptor = descriptor(sourceCoverageBytes)
    const sourceCoverageRawDescriptor = descriptor(sourceCoverageRaw)
    const artifactPhase = selectArtifactPhase(
      typedAuditDescriptor,
      sourceCoverageDescriptor,
      sourceCoverageRawDescriptor,
    )
    assert.ok(['post-u21759', 'post-u21878'].includes(artifactPhase))
    for (const pair of fixture.artifactPhasePolicy.acceptedPairs) {
      assert.equal(
        selectArtifactPhase(
          pair.typedAudit,
          pair.sourceCoverage,
          pair.sourceCoverageRaw,
        ),
        pair.phase,
      )
    }
    assert.throws(
      () =>
        selectArtifactPhase(
          { ...typedAuditDescriptor, bytes: typedAuditDescriptor.bytes + 1 },
          sourceCoverageDescriptor,
          sourceCoverageRawDescriptor,
        ),
      /unknown or hybrid/,
    )
    const [postU21759, postU21878] =
      fixture.artifactPhasePolicy.acceptedPairs
    assert.throws(
      () =>
        selectArtifactPhase(
          postU21759.typedAudit,
          postU21878.sourceCoverage,
          postU21759.sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          typedAuditDescriptor,
          sourceCoverageDescriptor,
          { ...sourceCoverageRawDescriptor, sha256: '0'.repeat(64) },
        ),
      /unknown or hybrid/,
    )

    const report = JSON.parse(typedAuditBytes)
    const coverage = JSON.parse(sourceCoverageRaw)
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === 21776,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === 21776,
    )
    const strictRows = report.rows.filter(row => row.structural.index === 21776)
    assert.deepEqual(
      partitionDescriptor(ownerRows),
      fixture.snapshotPartitions.ownerDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(ownerRows.map(rowTuple)),
      fixture.snapshotPartitions.ownerTupleDescriptor,
    )
    assert.deepEqual(
      ownerRows.map(row => row.value),
      fixture.snapshotPartitions.ownerValueSequence,
    )
    assert.deepEqual(
      partitionDescriptor(addedRows),
      fixture.snapshotPartitions.addedDescriptor,
    )
    assert.deepEqual(addedRows.map(rowTuple), fixture.snapshotPartitions.addedTuples)
    assert.deepEqual(
      partitionDescriptor(addedRows.map(rowTuple)),
      fixture.snapshotPartitions.addedTupleDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(strictRows),
      fixture.snapshotPartitions.strictDescriptor,
    )
    const strictTuples = strictRows.map(rowTuple)
    assert.deepEqual(strictTuples, fixture.snapshotPartitions.strictTuples)
    assert.deepEqual(
      partitionDescriptor(strictTuples),
      fixture.snapshotPartitions.strictTupleDescriptor,
    )
    assert.deepEqual(
      fixture.snapshotPartitions.strictPartition.buildMacroTupleIndexes.map(
        index => strictTuples[index][0],
      ),
      Object.values(fixture.buildMacroProof).map(proof => proof.targetValue),
    )
    assert.deepEqual(
      fixture.snapshotPartitions.strictPartition.retainedLocalOccurrenceTupleIndexes.map(
        index => strictTuples[index][0],
      ),
      ['taskRegistry'],
    )

    const coverageTarget = coverage.rows.filter(row => row.targetIndex === 21776)
    const coverageProjection =
      artifactPhase === 'post-u21878'
        ? fixture.snapshotPartitions.postU21878Coverage
        : fixture.snapshotPartitions
    assert.deepEqual(coverageTarget, coverageProjection.coverageTarget)
    assert.deepEqual(
      partitionDescriptor(coverageTarget),
      coverageProjection.coverageTargetDescriptor,
    )
    assert.deepEqual(
      partitionDescriptor(
        coverage.rows.filter(row => [21774, 21775].includes(row.targetIndex)),
      ),
      fixture.snapshotPartitions.dependencyCoverageDescriptor,
    )
    const owners = coverage.owners.filter(
      owner => owner.id === 'owner-src-entrypoints-mcp-ts',
    )
    assert.deepEqual(owners, fixture.snapshotPartitions.ownerCatalog)
    assert.deepEqual(
      partitionDescriptor(owners),
      fixture.snapshotPartitions.ownerCatalogDescriptor,
    )
  },
)

test(
  'Target119 u21776 is complete-unit equal to u20870 after exactly three build macros',
  { skip: !selected },
  () => {
    const structural = JSON.parse(gunzipSync(readExact(fixture.inputs.structural)))
    const baselineBundle = readArtifact(fixture.inputs.baselineBundle)
    const targetBundle = readArtifact(fixture.inputs.targetBundle)
    const baseline = parseUnit(baselineBundle, fixture.units.baselineCreateServer)
    const target = parseUnit(targetBundle, fixture.units.targetCreateServer)
    assert.equal(
      baseline.node.body.body.length,
      fixture.units.baselineCreateServer.bodyStatements,
    )
    assert.equal(
      target.node.body.body.length,
      fixture.units.targetCreateServer.bodyStatements,
    )
    const region = structural.regions[21776]
    assert.equal(region.classification, 'unresolved')
    assert.equal(region.unknownFreeIdentifierCount, 1)
    assert.deepEqual(
      structuralProjection(region.target),
      expectedStructural(fixture.units.targetCreateServer),
    )
    const structuralBaseline = structural.unmatchedBaseline.find(
      unit => unit.index === 20870,
    )
    assert.ok(structuralBaseline)
    assert.deepEqual(
      structuralProjection(structuralBaseline),
      expectedStructural(fixture.units.baselineCreateServer),
    )

    assert.deepEqual(
      normalizedTokenDescriptor(baseline),
      fixture.completeUnitProof.normalizedCanonicalTokenStream,
    )
    assert.deepEqual(
      normalizedTokenDescriptor(target),
      fixture.completeUnitProof.normalizedCanonicalTokenStream,
    )
    const baselineCanonicalAst = canonicalAst(baseline.program)
    const targetCanonicalAst = canonicalAst(target.program)
    assert.deepEqual(
      jsonDescriptor(baselineCanonicalAst),
      fixture.completeUnitProof.normalizedCanonicalAst,
    )
    assert.deepEqual(targetCanonicalAst, baselineCanonicalAst)
    assert.deepEqual(
      differences(
        canonicalAst(baseline.program, false),
        canonicalAst(target.program, false),
      ),
      fixture.completeUnitProof.alphaOnlyDifferences,
    )

    for (const [name, proof] of Object.entries(fixture.buildMacroProof)) {
      const baselineToken = baseline.tokens[proof.tokenIndex]
      const targetToken = target.tokens[proof.tokenIndex]
      assert.equal(baselineToken.value, proof.baselineValue, `${name} baseline`)
      assert.equal(targetToken.value, proof.targetValue, `${name} target`)
      assert.deepEqual(
        {
          start: baselineToken.start,
          end: baselineToken.end,
          ...descriptor(
            baseline.bytes.subarray(
              baselineToken.start - baseline.input.start,
              baselineToken.end - baseline.input.start,
            ),
          ),
        },
        proof.baselineLiteral,
      )
      assert.deepEqual(
        {
          start: targetToken.start,
          end: targetToken.end,
          ...descriptor(
            target.bytes.subarray(
              targetToken.start - target.input.start,
              targetToken.end - target.input.start,
            ),
          ),
        },
        proof.targetLiteral,
      )
      assert.deepEqual(literalRecord(baseline, proof.baselineValue), proof.baselineLiteral)
      assert.deepEqual(literalRecord(target, proof.targetValue), proof.targetLiteral)
    }

    const baselineTask = occurrenceNeighborhood(
      baseline,
      'taskRegistry',
      fixture.taskRegistryProof.canonicalNeighborhood.radius,
    )
    const targetTask = occurrenceNeighborhood(
      target,
      'taskRegistry',
      fixture.taskRegistryProof.canonicalNeighborhood.radius,
    )
    assert.deepEqual(
      {
        tokenIndex: baselineTask.tokenIndex,
        start: baselineTask.start,
        end: baselineTask.end,
      },
      {
        tokenIndex: fixture.taskRegistryProof.baseline.tokenIndex,
        start: fixture.taskRegistryProof.baseline.start,
        end: fixture.taskRegistryProof.baseline.end,
      },
    )
    assert.deepEqual(
      {
        tokenIndex: targetTask.tokenIndex,
        start: targetTask.start,
        end: targetTask.end,
      },
      {
        tokenIndex: fixture.taskRegistryProof.target.tokenIndex,
        start: fixture.taskRegistryProof.target.start,
        end: fixture.taskRegistryProof.target.end,
      },
    )
    assert.deepEqual(
      baselineTask.neighborhood,
      fixture.taskRegistryProof.canonicalNeighborhood,
    )
    assert.deepEqual(targetTask.neighborhood, baselineTask.neighborhood)
    const baselineProperty = propertyRecord(baseline, 'taskRegistry')
    const targetProperty = propertyRecord(target, 'taskRegistry')
    assert.deepEqual(
      {
        start: baselineProperty.start,
        end: baselineProperty.end,
        bytes: baselineProperty.bytes,
        sha256: baselineProperty.sha256,
      },
      fixture.taskRegistryProof.baseline.property,
    )
    assert.deepEqual(
      {
        start: targetProperty.start,
        end: targetProperty.end,
        bytes: targetProperty.bytes,
        sha256: targetProperty.sha256,
      },
      fixture.taskRegistryProof.target.property,
    )
    assert.deepEqual(
      baselineProperty.canonical,
      fixture.taskRegistryProof.canonicalProperty,
    )
    assert.deepEqual(targetProperty.canonical, baselineProperty.canonical)
    assert.equal(
      fixture.taskRegistryProof.classification,
      'retained-local-occurrence-global-ordinal-spill',
    )
  },
)

test(
  'Target119 matched export and wrapper units close the create/start MCP server boundary',
  { skip: !selected },
  () => {
    const structural = JSON.parse(gunzipSync(readExact(fixture.inputs.structural)))
    const baselineBundle = readArtifact(fixture.inputs.baselineBundle)
    const targetBundle = readArtifact(fixture.inputs.targetBundle)
    for (const dependency of [
      fixture.units.exportBinding,
      fixture.units.startWrapper,
    ]) {
      const baseline = parseUnit(baselineBundle, dependency.baseline)
      const target = parseUnit(targetBundle, dependency.target)
      const region = structural.regions[dependency.target.index]
      assert.equal(region.classification, 'matched')
      assert.equal(region.baselineUnitIndex, dependency.baseline.index)
      assert.equal(region.pairReason, 'exact-scope-normalized-token-hash')
      assert.equal(region.unknownFreeIdentifierCount, 0)
      assert.deepEqual(
        structuralProjection(region.target),
        expectedStructural(dependency.target),
      )
      const baselineCanonical = canonicalAst(baseline.program)
      const targetCanonical = canonicalAst(target.program)
      assert.deepEqual(jsonDescriptor(baselineCanonical), dependency.canonical)
      assert.deepEqual(targetCanonical, baselineCanonical)
    }
    const exportTarget = parseUnit(targetBundle, fixture.units.exportBinding.target)
    const exportProperties = []
    walk(exportTarget.node, node => {
      if (node.type !== 'Property') return
      exportProperties.push(node.key.name ?? node.key.value)
    })
    assert.deepEqual(exportProperties, fixture.units.exportBinding.requiredProperties)
    const wrapperTarget = parseUnit(targetBundle, fixture.units.startWrapper.target)
    assert.ok(wrapperTarget.text.includes('wh4($,q)'))
    assert.ok(wrapperTarget.text.includes('.connect('))
  },
)

test(
  'Target119 u21776 exact source states prove ownership and forbid replay of generated context',
  { skip: !selected },
  async () => {
    const historicalBytes = []
    for (const state of fixture.sourceGraph.states.slice(0, 2)) {
      const bytes = fs.readFileSync(path.join(root, state.path))
      historicalBytes.push(bytes)
      const inspection = await inspectSource(bytes, state.name)
      assert.deepEqual(inspection.exports, fixture.sourceGraph.exports)
      assert.deepEqual(
        inspection.nestedFunctions,
        fixture.sourceGraph.nestedFunctions,
      )
      assert.deepEqual(inspection.markerCounts, fixture.sourceGraph.markerCounts)
      assert.deepEqual(
        inspection.directIdentifierCalls,
        fixture.sourceGraph.directIdentifierCalls,
      )
      assert.deepEqual(
        inspection.runtimeDependencyBindings,
        fixture.sourceGraph.runtimeDependencyBindings,
      )
    }
    assert.deepEqual(historicalBytes[1], historicalBytes[0])
    for (const commit of Object.values(fixture.inputs.sourceCommits)) {
      const result = spawnSync(
        'git',
        ['show', `${commit.commit}:${fixture.sourceGraph.sourcePath}`],
        { cwd: root, encoding: null },
      )
      assert.equal(result.status, 0, result.stderr?.toString())
      assert.deepEqual(result.stdout, historicalBytes[0])
    }

    const selectedBytes = fs.readFileSync(
      path.join(
        selectedSourceRoot,
        fixture.sourceGraph.sourcePath.replace(/^src\//, ''),
      ),
    )
    const selectedInspection = await inspectSource(
      selectedBytes,
      'selected Target119 source',
    )
    assert.deepEqual(selectedBytes, historicalBytes[0])
    assert.deepEqual(selectedInspection.exports, fixture.sourceGraph.exports)
    assert.deepEqual(
      selectedInspection.markerCounts,
      fixture.sourceGraph.markerCounts,
    )
    assert.deepEqual(
      selectedInspection.directIdentifierCalls,
      fixture.sourceGraph.directIdentifierCalls,
    )
    assert.deepEqual(
      selectedInspection.runtimeDependencyBindings,
      fixture.sourceGraph.runtimeDependencyBindings,
    )
    assert.equal(fixture.sourceGraph.markerCounts.MACRO, 1)
    assert.equal(fixture.sourceGraph.markerCounts.VERSION, 1)
    assert.equal(fixture.sourceGraph.markerCounts.BUILD_TIME, 0)
    assert.equal(fixture.sourceGraph.markerCounts.GIT_SHA, 0)
    assert.equal(fixture.sourceGraph.markerCounts.taskRegistry, 0)
    assert.deepEqual(fixture.sourceGraph.sourceGap, {
      compiledTaskRegistryPresent: true,
      sourceTaskRegistryPresent: false,
      compiledBuildIdentityFields: ['VERSION', 'BUILD_TIME', 'GIT_SHA'],
      sourceBuildIdentityAccess: 'MACRO.VERSION',
      replayForbidden: true,
    })
    assert.equal(fixture.replayDisposition.mode, 'static-only')
    assert.equal(fixture.replayDisposition.sourceReplayAuthorized, false)
    assert.equal(fixture.replayDisposition.replayHelper, null)
    assert.equal(fixture.wiringRecipe.replayExport, null)
    assert.deepEqual(fixture.postWiring.expectedImpact, {
      productionStrictRowsChanged: 0,
      ownerPathsChanged: 0,
      coverageRowsEvidenceStrengthened: 1,
      sourceReplayFiles: 0,
    })
  },
)
