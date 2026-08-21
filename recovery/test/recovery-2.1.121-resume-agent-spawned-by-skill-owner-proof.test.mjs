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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/resume-agent-spawned-by-skill-owner-overrides.mjs'

const {
  TARGET121_RESUME_AGENT_SKILL_PROVENANCE_EVIDENCE_IDS,
  TARGET121_RESUME_AGENT_SKILL_PROVENANCE_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-resume-agent-spawned-by-skill-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '9497ec51cb6fc46322dfbdfe152d26b71c790992b73fbe8a797aace3f2d72d0a'

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

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  assert.equal(node.body.body.length, expected.bodyStatementCount)
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  return { node, source, unitStart: expected.start }
}

function runAgentParameterObject(unit) {
  const candidates = []
  walk(unit, node => {
    if (node.type !== 'ObjectExpression') return
    const names = new Set(
      node.properties
        .filter(property => property.type === 'Property')
        .map(property => property.key?.name),
    )
    if (
      names.has('agentDefinition') &&
      names.has('querySource') &&
      names.has('resumePersistedCount') &&
      names.has('contentReplacementState')
    ) {
      candidates.push(node)
    }
  })
  assert.equal(candidates.length, 1, 'one resume runAgent parameter object')
  return candidates[0]
}

function exactNodeSlice(parsed, node, expected, label) {
  assert.equal(node.type, expected.nodeType)
  assert.equal(parsed.unitStart + node.start, expected.start)
  assert.equal(parsed.unitStart + node.end, expected.end)
  const raw = parsed.source.slice(node.start, node.end)
  assert.deepEqual(descriptor(raw), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) assert.equal(raw, expected.exact, label)
  return raw
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

function nodeDescriptor(sourceFile, source, node, expected, extra = {}) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  assert.deepEqual(
    {
      ...extra,
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
    },
    expected,
  )
  return text
}

function resumeSourceEvidence(ts, filename, expected) {
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
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === fixture.sourceState.declarationName,
  )
  assert.ok(declaration)
  return {
    source,
    declaration: nodeDescriptor(
      sourceFile,
      source,
      declaration,
      expected.declaration,
    ),
  }
}

function runAgentSourceEvidence(ts, filename, expected) {
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
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === expected.declaration.name,
  )
  assert.ok(declaration)
  nodeDescriptor(sourceFile, source, declaration, expected.declaration, {
    name: declaration.name.text,
  })
  const parameterType = declaration.parameters[0].type
  assert.ok(parameterType && ts.isTypeLiteralNode(parameterType))
  nodeDescriptor(
    sourceFile,
    source,
    parameterType,
    expected.parameterType,
  )
  const names = parameterType.members
    .map(member => member.name?.getText(sourceFile))
    .filter(Boolean)
  assert.equal(names.length, expected.parameterMemberNames.count)
  assert.deepEqual(canonicalDigest(names), {
    bytes: expected.parameterMemberNames.bytes,
    sha256: expected.parameterMemberNames.sha256,
  })
  return { source, declaration, names }
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 resume-agent fixture and owner override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET121_RESUME_AGENT_SKILL_PROVENANCE_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_RESUME_AGENT_SKILL_PROVENANCE_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:13973`,
          targetIndex: 13973,
          paths: [fixture.ownerResidues.correctedOwner],
          declarations: [fixture.sourceState.declarationName],
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_RESUME_AGENT_SKILL_PROVENANCE_OWNER_OVERRIDES[0]
              .behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(
        TARGET121_RESUME_AGENT_SKILL_PROVENANCE_OWNER_OVERRIDES,
      ),
      true,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_RESUME_AGENT_SKILL_PROVENANCE_EVIDENCE_IDS',
      'TARGET121_RESUME_AGENT_SKILL_PROVENANCE_OWNER_OVERRIDES',
    ])
  },
)

test(
  'authenticated ledger, report, and all twenty-seven u13973 owner rows are pinned',
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
    exactBufferSlice(
      baseline,
      fixture.baselineSemanticCounterpart,
      'Target120 resume-agent unit',
    )
    exactBufferSlice(target, fixture.targetUnit, 'Target121 u13973')

    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'Target121 structural ledger',
        ),
      ),
    )
    const targetRegion = ledger.regions.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetRegion)
    assert.equal(targetRegion.classification, fixture.targetUnit.classification)
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
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
      },
    )
    const baselineRegion = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineSemanticCounterpart.baselineUnitIndex,
    )
    assert.ok(baselineRegion)
    assert.deepEqual(
      {
        nodeType: baselineRegion.nodeType,
        start: baselineRegion.start,
        end: baselineRegion.end,
        tokenCount: baselineRegion.tokenCount,
        sourceHash: baselineRegion.sourceHash,
        coarseHash: baselineRegion.coarseHash,
      },
      {
        nodeType: fixture.baselineSemanticCounterpart.nodeType,
        start: fixture.baselineSemanticCounterpart.start,
        end: fixture.baselineSemanticCounterpart.end,
        tokenCount: fixture.baselineSemanticCounterpart.tokenCount,
        sourceHash: fixture.baselineSemanticCounterpart.sha256,
        coarseHash: fixture.baselineSemanticCounterpart.coarseHash,
      },
    )

    const { report } = readTypedReportPhase()
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const strictRows = report.rows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    assert.equal(ownerRows.length, fixture.ownerResidues.totalRows)
    assert.equal(addedRows.length, fixture.ownerResidues.targetAddedRows)
    assert.equal(strictRows.length, fixture.ownerResidues.strictRows)
    assert.ok(
      ownerRows.every(
        row =>
          JSON.stringify(row.ownerPaths) ===
            JSON.stringify([fixture.ownerResidues.reportedOwner]) &&
          row.ownerSourceMatches.length === 0,
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
      fixture.ownerResidues.rowIdentities,
    )
    const strictIdentities = strictRows.map(row => [
      row.structural.index,
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.targetOccurrenceNumber,
    ])
    assert.deepEqual(strictIdentities, fixture.ownerResidues.strictRowsExact)
    assert.deepEqual(
      canonicalDigest(strictIdentities),
      fixture.ownerResidues.strictIdentities,
    )
    assert.deepEqual(addedRows, strictRows)
  },
)

test(
  'the complete resume-agent unit delta is exactly one undefined provenance field',
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
    const baseline = parseUnit(
      readExact(
        baselinePath,
        fixture.inputs.baselineBundle,
        'Target120 bundle',
      ),
      fixture.baselineSemanticCounterpart,
      'Target120 resume-agent unit',
    )
    const target = parseUnit(
      readExact(targetPath, fixture.inputs.targetBundle, 'Target121 bundle'),
      fixture.targetUnit,
      'Target121 resume-agent unit',
    )
    assert.equal(
      fixture.targetUnit.bytes - fixture.baselineSemanticCounterpart.bytes,
      fixture.wholeUnitSemanticDelta.rawByteDelta,
    )
    assert.equal(
      fixture.targetUnit.tokenCount -
        fixture.baselineSemanticCounterpart.tokenCount,
      fixture.wholeUnitSemanticDelta.tokenDelta,
    )
    assert.deepEqual(
      canonicalDescriptor(baseline.node),
      fixture.wholeUnitSemanticDelta.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitSemanticDelta.targetCanonical,
    )

    const baselineObject = runAgentParameterObject(baseline.node)
    const targetObject = runAgentParameterObject(target.node)
    for (const [parsed, node, expected, label] of [
      [
        baseline,
        baselineObject,
        fixture.wholeUnitSemanticDelta.runAgentParameterObject.baseline,
        'Target120 runAgent parameters',
      ],
      [
        target,
        targetObject,
        fixture.wholeUnitSemanticDelta.runAgentParameterObject.target,
        'Target121 runAgent parameters',
      ],
    ]) {
      exactNodeSlice(parsed, node, expected, label)
      assert.equal(node.properties.length, expected.propertyCount)
      assert.deepEqual(canonicalDescriptor(node), {
        bytes: expected.canonicalBytes,
        sha256: expected.canonicalSha256,
      })
    }
    const addition = targetObject.properties[6]
    const expectedAddition = fixture.wholeUnitSemanticDelta.addition
    exactNodeSlice(target, addition, expectedAddition, 'spawnedBySkill clear')
    assert.equal(addition.key.name, expectedAddition.key)
    assert.equal(addition.value.type, expectedAddition.valueType)
    assert.equal(addition.value.operator, expectedAddition.valueOperator)
    assert.equal(addition.value.argument.value, expectedAddition.valueArgument)
    assert.equal(
      canonicalDescriptor(addition).sha256,
      expectedAddition.canonicalSha256,
    )
    targetObject.properties.splice(6, 1)
    const transformed = canonicalDescriptor(target.node)
    assert.deepEqual(
      transformed,
      fixture.wholeUnitSemanticDelta.transform.commonCanonical,
    )
    assert.deepEqual(transformed, canonicalDescriptor(baseline.node))
  },
)

test(
  'recovered resumeAgent and runAgent prove a type-incomplete source graph',
  { skip: !selected },
  () => {
    const ts = typescript()
    const owners = []
    for (const [root, expected] of [
      [selectedBaselineSourceRoot(), fixture.sourceState.target120],
      [selectedSourceRoot(), fixture.sourceState.target121],
    ]) {
      const result = resumeSourceEvidence(
        ts,
        sourceFilename(root, fixture.sourceState.path),
        expected,
      )
      owners.push(result)
      for (const [marker, count] of Object.entries(
        fixture.sourceState.declarationMarkerCounts,
      )) {
        assert.equal(
          countOccurrences(result.declaration, marker),
          count,
          marker,
        )
      }
    }
    assert.equal(owners[0].source, owners[1].source)
    assert.equal(owners[0].declaration, owners[1].declaration)
    assert.match(fixture.sourceState.declarationRelation, /byte-identical/)

    const runAgent = fixture.sourceState.runAgentDependency
    const dependency = runAgentSourceEvidence(
      ts,
      sourceFilename(selectedSourceRoot(), runAgent.path),
      runAgent,
    )
    assert.equal(
      countOccurrences(dependency.source, 'spawnedBySkill'),
      runAgent.spawnedBySkillOccurrences,
    )
    assert.equal(dependency.names.includes('spawnedBySkill'), false)

    let sourceOccurrences = 0
    const pending = [selectedSourceRoot()]
    while (pending.length > 0) {
      const directory = pending.pop()
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name)
        if (entry.isDirectory()) pending.push(filename)
        else if (/\.tsx?$/.test(entry.name)) {
          sourceOccurrences += countOccurrences(
            fs.readFileSync(filename, 'utf8'),
            'spawnedBySkill',
          )
        }
      }
    }
    assert.equal(sourceOccurrences, fixture.provenanceGraph.targetSourceOccurrences)

    const semanticTrees = [
      selectedBaselineRepositoryRoot(),
      selectedTargetRepositoryRoot(),
    ]
    const expectedOwners = [
      fixture.sourceState.target120,
      fixture.sourceState.target121,
    ]
    for (let index = 0; index < semanticTrees.length; index += 1) {
      const root = semanticTrees[index]
      const expected = expectedOwners[index]
      assert.equal(git(root, ['rev-parse', 'HEAD']), expected.gitCommit)
      assert.equal(
        git(root, ['rev-parse', `HEAD:${fixture.sourceState.path}`]),
        expected.gitBlob,
      )
      assert.equal(
        git(root, [
          'log',
          '--all',
          '--format=%H',
          `-S${fixture.sourceState.gitDonorAudit.marker}`,
          '--',
          ...fixture.sourceState.gitDonorAudit.paths,
        ]),
        '',
      )
    }
    assert.equal(
      git(semanticTrees[1], [
        'rev-parse',
        `HEAD:${runAgent.path}`,
      ]),
      runAgent.gitBlob,
    )
  },
)

test(
  'the authenticated producer, clear, and forwarding graph is exact and bounded',
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
    assert.equal(
      countOccurrences(baseline.toString('utf8'), 'spawnedBySkill'),
      fixture.provenanceGraph.baselineBundleOccurrences,
    )
    assert.equal(
      countOccurrences(target.toString('utf8'), 'spawnedBySkill'),
      fixture.provenanceGraph.targetBundleOccurrences,
    )
    for (const [label, evidence] of Object.entries({
      initialAgentToolProducer:
        fixture.provenanceGraph.initialAgentToolProducer,
      resumeAgentClear: fixture.provenanceGraph.resumeAgentClear,
    })) {
      exactBufferSlice(
        target,
        {
          start: evidence.unitStart,
          end: evidence.unitEnd,
          bytes: evidence.unitBytes,
          sha256: evidence.unitSha256,
        },
        `${label} unit`,
      )
      assert.equal(exactBufferSlice(target, evidence, label), evidence.exact)
    }
    for (const [label, evidence] of [
      ['queryForwarders', fixture.provenanceGraph.queryForwarders],
      ['runAgentForwarders', fixture.provenanceGraph.runAgentForwarders],
    ]) {
      exactBufferSlice(
        target,
        {
          start: evidence.unitStart,
          end: evidence.unitEnd,
          bytes: evidence.unitBytes,
          sha256: evidence.unitSha256,
        },
        `${label} unit`,
      )
      for (const [start, end, bytes, hash, exact] of evidence.properties) {
        assert.equal(
          exactBufferSlice(
            target,
            { start, end, bytes, sha256: hash, exact },
            label,
          ),
          exact,
        )
      }
    }
    assert.match(fixture.provenanceGraph.boundary, /owns only u13973/)
    assert.match(fixture.provenanceGraph.boundary, /u14201\/u14209/)
  },
)

test(
  'the static proof removes one residue and the override is idempotent',
  { skip: !selected },
  async () => {
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 54,
      unsupportedResidues: 471,
      firstTargetIndex: 13973,
      productionIndexSha256:
        '936f107f34f8a535665e4dc7d0ddf69d3fc6709dd24e7f098c793f6f25de5d4b',
      productionTupleSha256:
        '7d9df1959b6fc8218e29c379ee961769a847241e64863bc7f17c00374e0777ef',
    })
    assert.deepEqual(fixture.strictEvolution.removes.targetIndices, [13973])
    assert.equal(fixture.strictEvolution.removes.units, 1)
    assert.equal(fixture.strictEvolution.removes.residueCount, 1)
    assert.deepEqual(
      fixture.strictEvolution.removes.residues,
      fixture.ownerResidues.strictRowsExact,
    )
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 53,
      unsupportedResidues: 470,
    })
    assert.match(
      fixture.sourceReplayBlocker.decision,
      /static whole-unit owner proof only; no replay helper and no source writes/,
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /byte-identical to Target120.*no matching parameter member.*fourteen-occurrence runtime contract/,
    )
    const first = await import(
      `../cases/2.1.120-to-2.1.121/recovered/resume-agent-spawned-by-skill-owner-overrides.mjs?first`
    )
    const second = await import(
      `../cases/2.1.120-to-2.1.121/recovered/resume-agent-spawned-by-skill-owner-overrides.mjs?second`
    )
    assert.deepEqual(
      first.TARGET121_RESUME_AGENT_SKILL_PROVENANCE_OWNER_OVERRIDES,
      second.TARGET121_RESUME_AGENT_SKILL_PROVENANCE_OWNER_OVERRIDES,
    )
    assert.equal(
      Object.isFrozen(
        first.TARGET121_RESUME_AGENT_SKILL_PROVENANCE_OWNER_OVERRIDES[0]
          .paths,
      ),
      true,
    )
  },
)
