import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/query-run-agent-runtime-state-owner-overrides.mjs'

const {
  TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_EVIDENCE_IDS,
  TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-query-run-agent-runtime-state-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '6f5b8a7096671c5ff9fe3cb2e00dca4ba5f22178d4dda89d746dd72950fb0537'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}


function sameDescriptor(actual, expected) {
  return (
    actual?.bytes === expected?.bytes && actual?.sha256 === expected?.sha256
  )
}

function selectArtifactPhase(reportDescriptor, coverageDescriptor) {
  const legacy = fixture.inputs.typedReport
  const post = fixture.inputs.postDaemonOwnerSnapshot
  if (sameDescriptor(reportDescriptor, legacy)) {
    if (coverageDescriptor !== undefined) {
      throw new Error('unknown-or-hybrid-target121-proof-phase')
    }
    return { name: 'legacy', snapshot: { typedReport: legacy } }
  }
  if (
    sameDescriptor(reportDescriptor, post.typedReport) &&
    sameDescriptor(coverageDescriptor, post.sourceCoverage)
  ) {
    return { name: 'postDaemonOwner', snapshot: post }
  }
  throw new Error('unknown-or-hybrid-target121-proof-phase')
}

function readTypedReportPhase() {
  const post = fixture.inputs.postDaemonOwnerSnapshot
  assert.equal(
    selectArtifactPhase(expectedDescriptor(fixture.inputs.typedReport)).name,
    'legacy',
  )
  assert.equal(
    selectArtifactPhase(
      expectedDescriptor(post.typedReport),
      expectedDescriptor(post.sourceCoverage),
    ).name,
    'postDaemonOwner',
  )
  assert.throws(
    () =>
      selectArtifactPhase(
        expectedDescriptor(fixture.inputs.typedReport),
        expectedDescriptor(post.sourceCoverage),
      ),
    /unknown-or-hybrid-target121-proof-phase/,
  )
  assert.throws(
    () => selectArtifactPhase(expectedDescriptor(post.typedReport)),
    /unknown-or-hybrid-target121-proof-phase/,
  )
  assert.throws(
    () =>
      selectArtifactPhase(
        { ...expectedDescriptor(post.typedReport), bytes: post.typedReport.bytes + 1 },
        expectedDescriptor(post.sourceCoverage),
      ),
    /unknown-or-hybrid-target121-proof-phase/,
  )

  const reportBytes = fs.readFileSync(
    path.join(repositoryRoot, fixture.inputs.typedReport.path),
  )
  const reportDescriptor = descriptor(reportBytes)
  if (sameDescriptor(reportDescriptor, fixture.inputs.typedReport)) {
    selectArtifactPhase(reportDescriptor)
    return { name: 'legacy', report: JSON.parse(reportBytes) }
  }

  const coverageBytes = fs.readFileSync(
    path.join(repositoryRoot, post.sourceCoverage.path),
  )
  const phase = selectArtifactPhase(
    reportDescriptor,
    descriptor(coverageBytes),
  )
  const rawCoverage = gunzipSync(coverageBytes)
  assert.deepEqual(descriptor(rawCoverage), {
    bytes: post.sourceCoverage.rawBytes,
    sha256: post.sourceCoverage.rawSha256,
  })
  const coverage = JSON.parse(rawCoverage)
  const projection = post.coverageProjection
  const coverageRows = coverage.rows.filter(row =>
    projection.targetIndices.includes(row.targetIndex),
  )
  assert.equal(coverageRows.length, projection.count)
  assert.deepEqual(descriptor(Buffer.from(JSON.stringify(coverageRows))), {
    bytes: projection.canonicalBytes,
    sha256: projection.canonicalSha256,
  })
  return { name: phase.name, report: JSON.parse(reportBytes) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function exactBufferSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) {
    assert.equal(value.toString('utf8'), expected.exact, label)
  }
  return value.toString('utf8')
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function canonicalDigest(rows) {
  return descriptor(Buffer.from(JSON.stringify(rows)))
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return count
    count += 1
    offset = next + needle.length
  }
}

function occurrencePositions(source, needle) {
  const positions = []
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return positions
    positions.push(next)
    offset = next + needle.length
  }
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit)
    }
  }
}

function canonicalize(value, parent = null, key = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalize(child, parent, index))
  }
  if (value === null || typeof value !== 'object') return value
  const result = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
    if (value.type === 'Identifier' && childKey === 'name') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed) ||
        (parent?.type === 'Property' &&
          key === 'key' &&
          !parent.computed &&
          !parent.shorthand) ||
        (parent?.type === 'MethodDefinition' &&
          key === 'key' &&
          !parent.computed)
      result[childKey] = preserve ? child : '@id'
    } else {
      result[childKey] = canonicalize(child, value, childKey)
    }
  }
  return result
}

function canonicalDescriptor(node) {
  return descriptor(Buffer.from(JSON.stringify(canonicalize(node))))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function propertyName(property) {
  if (property?.computed) return undefined
  return property?.key?.name ?? property?.key?.value
}

function deleteProperties(value, names) {
  let count = 0
  const visit = node => {
    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        const child = node[index]
        if (child?.type === 'Property' && names.has(propertyName(child))) {
          node.splice(index, 1)
          count += 1
        } else {
          visit(child)
        }
      }
      return
    }
    if (node === null || typeof node !== 'object') return
    for (const [key, child] of Object.entries(node)) {
      if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) visit(child)
    }
  }
  visit(value)
  return count
}

function renamePropertyKeys(value, from, to) {
  let count = 0
  walk(value, node => {
    if (node.type !== 'Property' || propertyName(node) !== from) return
    if (node.key.type === 'Identifier') node.key.name = to
    else node.key.value = to
    count += 1
  })
  return count
}

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  assert.equal(node.body.body.length, expected.bodyStatementCount)
  return { node, source, unitStart: expected.start }
}

function exactNodeSlice(parsed, node, expected, label) {
  assert.equal(parsed.unitStart + node.start, expected.start)
  assert.equal(parsed.unitStart + node.end, expected.end)
  const source = parsed.source.slice(node.start, node.end)
  assert.deepEqual(descriptor(source), expectedDescriptor(expected), label)
  if (expected.canonicalSha256) {
    assert.equal(canonicalDescriptor(node).sha256, expected.canonicalSha256)
  }
  return source
}

function objectPropertyNames(node) {
  return node.properties
    .filter(property => property.type === 'Property')
    .map(propertyName)
}

function findCallModelOptions(unit) {
  const candidates = []
  walk(unit, node => {
    if (node.type !== 'ObjectExpression') return
    const names = objectPropertyNames(node)
    if (
      names.includes('querySource') &&
      names.includes('mcpTools') &&
      names.includes('isNonInteractiveSession')
    ) {
      candidates.push(node)
    }
  })
  assert.equal(candidates.length, 1)
  return candidates[0]
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
  )
}

function selectedBaselineSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.120/src'),
  )
}

function selectedBaselineRepositoryRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_REPOSITORY_ROOT ??
      path.dirname(selectedBaselineSourceRoot()),
  )
}

function selectedTargetRepositoryRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ??
      path.dirname(selectedSourceRoot()),
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function tsNodeDescriptor(sourceFile, source, node, expected, label) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  assert.deepEqual(
    {
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
    },
    {
      start: expected.start,
      end: expected.end,
      chars: expected.chars,
      bytes: expected.bytes,
      sha256: expected.sha256,
      line: expected.line,
      endLine: expected.endLine,
    },
    label,
  )
  if (expected.exact !== undefined) assert.equal(text, expected.exact, label)
  return text
}

function parseSourceFile(ts, filename, expected, kind) {
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declarations = {}
  if (kind === 'query') {
    for (const name of ['QueryParams', 'State', 'query', 'queryLoop']) {
      const node = sourceFile.statements.find(
        statement =>
          ((ts.isTypeAliasDeclaration(statement) ||
            ts.isFunctionDeclaration(statement)) &&
            statement.name?.text === name),
      )
      assert.ok(node)
      declarations[name] = tsNodeDescriptor(
        sourceFile,
        source,
        node,
        expected[name],
        name,
      )
    }
  } else {
    const declaration = sourceFile.statements.find(
      statement =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === 'runAgent',
    )
    const queryImport = sourceFile.statements.find(
      statement =>
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.text === '../../query.js',
    )
    assert.ok(declaration && queryImport)
    declarations.declaration = tsNodeDescriptor(
      sourceFile,
      source,
      declaration,
      expected.declaration,
      'runAgent declaration',
    )
    declarations.import = tsNodeDescriptor(
      sourceFile,
      source,
      queryImport,
      expected.import,
      'query import',
    )
    const calls = []
    const visit = node => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(sourceFile) === 'query'
      ) {
        calls.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    assert.equal(calls.length, 1)
    declarations.queryCall = tsNodeDescriptor(
      sourceFile,
      source,
      calls[0],
      expected.queryCall,
      'query call',
    )
  }
  return { source, declarations }
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 query/runAgent fixture and static owner overrides are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_OWNER_OVERRIDES.map(row => ({
        key: row.key,
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
      })),
      fixture.ownerCorrections.map(row => ({
        key: `${caseName}:${row.targetIndex}`,
        targetIndex: row.targetIndex,
        paths: [row.correctedOwner],
        declarations: row.declarations,
        evidenceIds: fixture.evidenceIds,
      })),
    )
    assert.ok(
      TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_OWNER_OVERRIDES.every(
        row =>
          Object.isFrozen(row) &&
          Object.isFrozen(row.paths) &&
          Object.isFrozen(row.declarations),
      ),
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
  },
)

test(
  'authenticated ledger and every query/runAgent owner residue are pinned',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const baseline = readExact(
      baselinePath,
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const target = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const { report } = readTypedReportPhase()
    for (let index = 0; index < fixture.units.length; index += 1) {
      const unit = fixture.units[index]
      exactBufferSlice(baseline, unit.baseline, 'baseline unit')
      exactBufferSlice(target, unit.target, `Target121 u${unit.target.targetIndex}`)
      const targetRegion = ledger.regions.find(
        row => row.target.index === unit.target.targetIndex,
      )
      assert.ok(targetRegion)
      assert.equal(targetRegion.classification, unit.target.classification)
      assert.equal(targetRegion.baselineUnitIndex, undefined)
      assert.deepEqual(
        {
          nodeType: targetRegion.target.nodeType,
          start: targetRegion.target.start,
          end: targetRegion.target.end,
          tokenCount: targetRegion.target.tokenCount,
          sourceHash: targetRegion.target.sourceHash,
          coarseHash: targetRegion.target.coarseHash,
          topDefinitionCount: targetRegion.target.topDefinitionCount,
          unknownFreeIdentifierCount: targetRegion.unknownFreeIdentifierCount,
        },
        {
          nodeType: unit.target.nodeType,
          start: unit.target.start,
          end: unit.target.end,
          tokenCount: unit.target.tokenCount,
          sourceHash: unit.target.sha256,
          coarseHash: unit.target.coarseHash,
          topDefinitionCount: unit.target.topDefinitionCount,
          unknownFreeIdentifierCount: unit.target.unknownFreeIdentifierCount,
        },
      )
      const baselineRegion = ledger.unmatchedBaseline.find(
        row => row.index === unit.baseline.baselineUnitIndex,
      )
      assert.ok(baselineRegion)
      assert.equal(baselineRegion.sourceHash, unit.baseline.sha256)
      assert.equal(baselineRegion.coarseHash, unit.baseline.coarseHash)

      const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
        row => row.structural.index === unit.target.targetIndex,
      )
      const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
        row => row.structural.index === unit.target.targetIndex,
      )
      const strictRows = report.rows.filter(
        row => row.structural.index === unit.target.targetIndex,
      )
      assert.equal(ownerRows.length, unit.ownerResidues.totalRows)
      assert.equal(addedRows.length, unit.ownerResidues.targetAddedRows)
      assert.equal(strictRows.length, unit.ownerResidues.strictRows)
      assert.ok(
        ownerRows.every(
          row =>
            JSON.stringify(row.ownerPaths) ===
            JSON.stringify([fixture.ownerCorrections[index].reportedOwner]),
        ),
      )
      assert.deepEqual(
        canonicalDigest(
          ownerRows.map(row => [
            row.literalKind,
            row.value,
            row.target.start,
            row.target.end,
            row.baselineOccurrenceCount,
            row.targetOccurrenceNumber,
            row.targetAdded,
          ]),
        ),
        unit.ownerResidues.rowIdentities,
      )
      assert.deepEqual(
        canonicalDigest(
          addedRows.map(row => [
            row.literalKind,
            row.value,
            row.target.start,
            row.target.end,
            row.targetOccurrenceNumber,
          ]),
        ),
        unit.ownerResidues.addedIdentities,
      )
      const strictIdentities = strictRows.map(row => [
        row.structural.index,
        row.literalKind,
        row.value,
        row.target.start,
        row.target.end,
        row.targetOccurrenceNumber,
      ])
      assert.deepEqual(strictIdentities, unit.ownerResidues.strictRowsExact)
      assert.deepEqual(
        canonicalDigest(strictIdentities),
        unit.ownerResidues.strictIdentities,
      )
    }
  },
)

test(
  'u14201 is the complete queryLoop pair and every strict property is exact',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const unit = fixture.units[0]
    const evidence = fixture.wholeUnitEvidence.u14201
    const baselineBytes = readExact(
      baselinePath,
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const targetBytes = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const baseline = parseUnit(
      baselineBytes,
      unit.baseline,
      'Target120 queryLoop',
    )
    const target = parseUnit(targetBytes, unit.target, 'Target121 queryLoop')
    assert.equal(unit.target.bytes - unit.baseline.bytes, evidence.rawByteDelta)
    assert.equal(
      unit.target.tokenCount - unit.baseline.tokenCount,
      evidence.tokenDelta,
    )
    assert.deepEqual(canonicalDescriptor(baseline.node), evidence.baselineCanonical)
    assert.deepEqual(canonicalDescriptor(target.node), evidence.targetCanonical)

    const initial = evidence.initialStateStatement
    exactNodeSlice(
      baseline,
      baseline.node.body.body[0],
      initial.baseline,
      'baseline initial state',
    )
    exactNodeSlice(
      target,
      target.node.body.body[0],
      initial.target,
      'target initial state',
    )
    assert.deepEqual(
      canonicalDescriptor(baseline.node.body.body[0]),
      initial.baseline.canonical,
    )
    assert.deepEqual(
      canonicalDescriptor(target.node.body.body[0]),
      initial.target.canonical,
    )
    const normalizedInitial = clone(target.node.body.body[0])
    assert.equal(deleteProperties(normalizedInitial, new Set(['spawnedBySkill'])), 1)
    assert.equal(
      renamePropertyKeys(
        normalizedInitial,
        'compactTracking',
        'autoCompactTracking',
      ),
      1,
    )
    assert.deepEqual(
      canonicalDescriptor(normalizedInitial),
      initial.normalizedCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(normalizedInitial),
      canonicalDescriptor(baseline.node.body.body[0]),
    )
    assert.deepEqual(
      canonicalDescriptor(baseline.node.body.body[1]),
      evidence.unchangedBudgetTrackerStatement.canonical,
    )
    assert.deepEqual(
      canonicalDescriptor(target.node.body.body[1]),
      evidence.unchangedBudgetTrackerStatement.canonical,
    )

    const baselineOptions = findCallModelOptions(baseline.node)
    const targetOptions = findCallModelOptions(target.node)
    exactNodeSlice(
      baseline,
      baselineOptions,
      evidence.callModelOptions.baseline,
      'baseline callModel options',
    )
    exactNodeSlice(
      target,
      targetOptions,
      evidence.callModelOptions.target,
      'target callModel options',
    )
    assert.deepEqual(
      canonicalDescriptor(baselineOptions),
      evidence.callModelOptions.baseline.canonical,
    )
    assert.deepEqual(
      canonicalDescriptor(targetOptions),
      evidence.callModelOptions.target.canonical,
    )
    const normalizedOptions = clone(targetOptions)
    assert.equal(
      deleteProperties(
        normalizedOptions,
        new Set(['spawnedBySkill', 'activeSkill', 'userSystemPrompt']),
      ),
      3,
    )
    assert.deepEqual(
      canonicalDescriptor(normalizedOptions),
      evidence.callModelOptions.normalizedCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(normalizedOptions),
      canonicalDescriptor(baselineOptions),
    )
    exactBufferSlice(
      targetBytes,
      evidence.callModelOptions.skillContext,
      'skill context pair',
    )
    for (const [start, end, bytes, hash, exact] of evidence.strictPropertyContexts) {
      assert.equal(
        exactBufferSlice(
          targetBytes,
          { start, end, bytes, sha256: hash, exact },
          `strict property context ${start}`,
        ),
        exact,
      )
    }
  },
)

test(
  'u14209 adds exactly three spawnedBySkill properties to runAgent',
  { skip: !selected },
  t => {
    const baselinePath = artifactPath(
      'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
      fixture.inputs.baselineBundle,
    )
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(baselinePath) || !fs.existsSync(targetPath)) {
      t.skip('authenticated Target120/121 bundles are unavailable')
      return
    }
    const unit = fixture.units[1]
    const evidence = fixture.wholeUnitEvidence.u14209
    const baselineBytes = readExact(baselinePath, fixture.inputs.baselineBundle)
    const targetBytes = readExact(targetPath, fixture.inputs.targetBundle)
    const baseline = parseUnit(
      baselineBytes,
      unit.baseline,
      'Target120 runAgent',
    )
    const target = parseUnit(targetBytes, unit.target, 'Target121 runAgent')
    assert.equal(unit.target.bytes - unit.baseline.bytes, evidence.rawByteDelta)
    assert.equal(
      unit.target.tokenCount - unit.baseline.tokenCount,
      evidence.tokenDelta,
    )
    assert.deepEqual(canonicalDescriptor(baseline.node), evidence.baselineCanonical)
    assert.deepEqual(canonicalDescriptor(target.node), evidence.targetCanonical)

    const excluded = new Set(evidence.retainedStatements.excludedIndices)
    const retained = []
    for (let index = 0; index < target.node.body.body.length; index += 1) {
      if (excluded.has(index)) continue
      assert.deepEqual(
        canonicalDescriptor(target.node.body.body[index]),
        canonicalDescriptor(baseline.node.body.body[index]),
      )
      retained.push([
        index,
        canonicalDescriptor(target.node.body.body[index]).sha256,
      ])
    }
    assert.equal(retained.length, evidence.retainedStatements.count)
    assert.deepEqual(
      canonicalDigest(retained),
      expectedDescriptor(evidence.retainedStatements),
    )
    for (const changed of evidence.changedStatements) {
      exactNodeSlice(
        baseline,
        baseline.node.body.body[changed.bodyIndex],
        changed.baseline,
        `baseline statement ${changed.bodyIndex}`,
      )
      exactNodeSlice(
        target,
        target.node.body.body[changed.bodyIndex],
        changed.target,
        `target statement ${changed.bodyIndex}`,
      )
    }
    for (const [name, expected] of Object.entries(
      evidence.contractFragments,
    )) {
      if (name === 'targetProperties') continue
      const bytes = name.startsWith('baseline') ? baselineBytes : targetBytes
      exactBufferSlice(bytes, expected, name)
    }
    for (const [start, end, bytes, hash, exact] of evidence.contractFragments
      .targetProperties) {
      exactBufferSlice(
        targetBytes,
        { start, end, bytes, sha256: hash, exact },
        `spawnedBySkill property ${start}`,
      )
    }
    const normalized = clone(target.node)
    assert.equal(deleteProperties(normalized, new Set(['spawnedBySkill'])), 3)
    assert.deepEqual(
      canonicalDescriptor(normalized),
      evidence.transform.normalizedCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(normalized),
      canonicalDescriptor(baseline.node),
    )
  },
)

test(
  'recovered sources prove both owners and the type-complete replay blocker',
  { skip: !selected },
  () => {
    const ts = typescript()
    const baselineRoot = selectedBaselineSourceRoot()
    const targetRoot = selectedSourceRoot()
    const baselineQuery = parseSourceFile(
      ts,
      sourceFilename(baselineRoot, fixture.sourceState.queryPath),
      fixture.sourceState.target120.query,
      'query',
    )
    const targetQuery = parseSourceFile(
      ts,
      sourceFilename(targetRoot, fixture.sourceState.queryPath),
      fixture.sourceState.target121.query,
      'query',
    )
    const baselineRunAgent = parseSourceFile(
      ts,
      sourceFilename(baselineRoot, fixture.sourceState.runAgentPath),
      fixture.sourceState.target120.runAgent,
      'runAgent',
    )
    const targetRunAgent = parseSourceFile(
      ts,
      sourceFilename(targetRoot, fixture.sourceState.runAgentPath),
      fixture.sourceState.target121.runAgent,
      'runAgent',
    )
    for (const name of ['QueryParams', 'State', 'query']) {
      assert.equal(
        baselineQuery.declarations[name],
        targetQuery.declarations[name],
        `${name} is byte-identical across recovered versions`,
      )
    }
    assert.equal(
      baselineRunAgent.declarations.import,
      targetRunAgent.declarations.import,
    )
    assert.equal(
      baselineRunAgent.declarations.queryCall,
      targetRunAgent.declarations.queryCall,
    )
    for (const [marker, count] of Object.entries(
      fixture.sourceState.target121.markerCounts.query,
    )) {
      assert.equal(countOccurrences(targetQuery.source, marker), count, marker)
    }
    for (const [marker, count] of Object.entries(
      fixture.sourceState.target121.markerCounts.runAgent,
    )) {
      assert.equal(countOccurrences(targetRunAgent.source, marker), count, marker)
    }
    assert.deepEqual(
      occurrencePositions(targetQuery.source, 'autoCompactTracking'),
      fixture.sourceState.target121.query.autoCompactTrackingPositions,
    )
    assert.deepEqual(
      canonicalDigest(
        fixture.sourceState.target121.query.autoCompactTrackingPositions,
      ),
      fixture.sourceState.target121.query.autoCompactTrackingPositionDigest,
    )
    assert.deepEqual(
      occurrencePositions(baselineQuery.source, 'autoCompactTracking'),
      fixture.sourceState.target120.query.autoCompactTrackingPositions,
    )
    assert.match(fixture.sourceReplayBlocker.reason, /type-incomplete/)

    for (const [tree, expected] of [
      [selectedBaselineRepositoryRoot(), fixture.sourceState.target120],
      [selectedTargetRepositoryRoot(), fixture.sourceState.target121],
    ]) {
      assert.equal(git(tree, ['rev-parse', 'HEAD']), expected.gitCommit)
      assert.equal(
        git(tree, ['rev-parse', `HEAD:${fixture.sourceState.queryPath}`]),
        expected.query.gitBlob,
      )
      assert.equal(
        git(tree, ['rev-parse', `HEAD:${fixture.sourceState.runAgentPath}`]),
        expected.runAgent.gitBlob,
      )
      for (const marker of fixture.sourceState.gitDonorAudit.markers) {
        assert.equal(
          git(tree, [
            'log',
            '--all',
            '--format=%H',
            `-S${marker}`,
            '--',
            ...fixture.sourceState.gitDonorAudit.paths,
          ]),
          '',
        )
      }
    }
  },
)

test(
  'the bounded provenance graph removes fifteen residues and stays idempotent',
  { skip: !selected },
  async () => {
    const target = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    exactBufferSlice(
      target,
      fixture.provenanceBoundary.initialProducer,
      'initial AgentTool producer',
    )
    exactBufferSlice(
      target,
      fixture.provenanceBoundary.resumeClear,
      'resume clear',
    )
    assert.match(fixture.provenanceBoundary.excluded, /remain independent/)
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 51,
      unsupportedResidues: 460,
      firstTargetIndices: [14201, 14209],
      productionIndexSha256:
        'c0996a44ceaaae0c6cc62871295c1c9ec037434cd3d29cb3d69b9554f70c0d4a',
      productionTupleSha256:
        '820117a73b2ab3a97a45c0d7046edb56e5d3b91d9878ede4e0168ca7366f283c',
    })
    assert.deepEqual(fixture.strictEvolution.removes.targetIndices, [14201, 14209])
    assert.equal(fixture.strictEvolution.removes.units, 2)
    assert.equal(fixture.strictEvolution.removes.residueCount, 15)
    assert.equal(
      fixture.units.reduce(
        (count, unit) => count + unit.ownerResidues.targetAddedRows,
        0,
      ),
      15,
    )
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 49,
      unsupportedResidues: 445,
    })
    assert.match(
      fixture.sourceReplayBlocker.decision,
      /static complete-unit owner proof only; no replay helper and no source writes/,
    )
    const first = await import(
      `../cases/2.1.120-to-2.1.121/recovered/query-run-agent-runtime-state-owner-overrides.mjs?first`
    )
    const second = await import(
      `../cases/2.1.120-to-2.1.121/recovered/query-run-agent-runtime-state-owner-overrides.mjs?second`
    )
    assert.deepEqual(
      first.TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_OWNER_OVERRIDES,
      second.TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_OWNER_OVERRIDES,
    )
  },
)
