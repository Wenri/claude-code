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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/slash-command-active-skill-owner-overrides.mjs'

const {
  TARGET121_SLASH_COMMAND_ACTIVE_SKILL_EVIDENCE_IDS,
  TARGET121_SLASH_COMMAND_ACTIVE_SKILL_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-slash-command-active-skill-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c5e44e3c5b7c6451c12c7ca9c6aa2de3bbee52785cbca74a857b8c4a62441170'

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

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function exactBufferSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) {
    assert.equal(value.toString('utf8'), expected.exact, label)
  }
  return value.toString('utf8')
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

function walk(node, visit, ancestors = []) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, ancestors)
    return
  }
  const nextAncestors =
    typeof node.type === 'string' ? [...ancestors, node] : ancestors
  if (typeof node.type === 'string') visit(node, ancestors)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit, nextAncestors)
    }
  }
}

function noncomputedMemberName(node) {
  if (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.type === 'Identifier'
  ) {
    return node.property.name
  }
  return undefined
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
  return { node, source }
}

function activeSkillAssignment(node) {
  return (
    node?.type === 'AssignmentExpression' &&
    noncomputedMemberName(node.left) === 'activeSkill' &&
    node.left.object?.type === 'MemberExpression' &&
    noncomputedMemberName(node.left.object) === 'options' &&
    node.right?.type === 'MemberExpression' &&
    noncomputedMemberName(node.right) === 'name'
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

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function sourceDeclaration(ts, filename, expected, name, kind) {
  const bytes = readExact(filename, expected, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declaration = sourceFile.statements.find(statement => {
    if (kind === 'function') {
      return ts.isFunctionDeclaration(statement) && statement.name?.text === name
    }
    return ts.isTypeAliasDeclaration(statement) && statement.name.text === name
  })
  assert.ok(declaration, name)
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  const text = source.slice(start, end)
  const startLocation = sourceFile.getLineAndCharacterOfPosition(start)
  const endLocation = sourceFile.getLineAndCharacterOfPosition(end)
  assert.deepEqual(
    {
      ...('name' in expected.declaration
        ? { name: expected.declaration.name }
        : {}),
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: startLocation.line + 1,
      endLine: endLocation.line + 1,
    },
    expected.declaration,
  )
  return { source, text }
}

test(
  'Target121 slash-command active-skill fixture and owner override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET121_SLASH_COMMAND_ACTIVE_SKILL_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET121_SLASH_COMMAND_ACTIVE_SKILL_OWNER_OVERRIDES, [
      {
        key: `${caseName}:13110`,
        targetIndex: 13110,
        paths: [fixture.ownerResidues.correctedOwner],
        declarations: ['getMessagesForPromptSlashCommand'],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET121_SLASH_COMMAND_ACTIVE_SKILL_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.equal(
      Object.isFrozen(TARGET121_SLASH_COMMAND_ACTIVE_SKILL_OWNER_OVERRIDES),
      true,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_SLASH_COMMAND_ACTIVE_SKILL_EVIDENCE_IDS',
      'TARGET121_SLASH_COMMAND_ACTIVE_SKILL_OWNER_OVERRIDES',
    ])
  },
)

test(
  'authenticated ledger, report, and sole u13110 row are pinned',
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
      'Target120 prompt slash-command unit',
    )
    exactBufferSlice(target, fixture.targetUnit, 'Target121 u13110')

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
    const identities = ownerRows.map(row => [
      row.literalKind,
      row.value,
      row.target.start,
      row.target.end,
      row.baselineOccurrenceCount,
      row.targetOccurrenceNumber,
      row.targetAdded,
    ])
    assert.deepEqual(
      canonicalDigest(identities),
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
    assert.deepEqual(ownerRows[0].ownerPaths, [fixture.ownerResidues.reportedOwner])
    assert.deepEqual(ownerRows[0].ownerSourceMatches, [])

    const activeSkillRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.value === 'activeSkill',
    )
    assert.equal(
      activeSkillRows.length,
      fixture.provenanceGraph.targetPropertyOccurrences,
    )
  },
)

test(
  'the complete unit delta is exactly one post-record activeSkill assignment',
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
    const baselineBundle = readExact(
      baselinePath,
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const targetBundle = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineSemanticCounterpart,
      'Target120 prompt slash-command unit',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target121 prompt slash-command unit',
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

    const baselineStatement = baseline.node.body.body[3]
    const targetStatement = target.node.body.body[3]
    assert.equal(baselineStatement.type, 'ExpressionStatement')
    assert.equal(baselineStatement.expression.type, 'CallExpression')
    assert.equal(targetStatement.type, 'ExpressionStatement')
    assert.equal(targetStatement.expression.type, 'SequenceExpression')
    assert.equal(targetStatement.expression.expressions.length, 2)
    const [retainedCall, addition] = targetStatement.expression.expressions
    assert.equal(retainedCall.type, 'CallExpression')
    assert.equal(activeSkillAssignment(addition), true)

    const expectedAddition = fixture.wholeUnitSemanticDelta.addition
    const additionRaw = target.source.slice(addition.start, addition.end)
    assert.equal(fixture.targetUnit.start + addition.start, expectedAddition.start)
    assert.equal(fixture.targetUnit.start + addition.end, expectedAddition.end)
    assert.equal(additionRaw, expectedAddition.exact)
    assert.deepEqual(descriptor(additionRaw), expectedDescriptor(expectedAddition))
    assert.equal(
      canonicalDescriptor(addition).sha256,
      expectedAddition.canonicalSha256,
    )
    const additionDescriptor = [
      [
        expectedAddition.path,
        null,
        [
          addition.type,
          expectedAddition.start,
          expectedAddition.end,
          expectedAddition.bytes,
          expectedAddition.sha256,
          expectedAddition.canonicalSha256,
        ],
      ],
    ]
    assert.deepEqual(
      canonicalDigest(additionDescriptor),
      expectedAddition.descriptor,
    )

    const retained = fixture.wholeUnitSemanticDelta.retainedInvokedSkillCall
    const baselineCallRaw = baseline.source.slice(
      baselineStatement.expression.start,
      baselineStatement.expression.end,
    )
    const targetCallRaw = target.source.slice(retainedCall.start, retainedCall.end)
    assert.equal(baselineCallRaw, retained.baseline.exact)
    assert.equal(targetCallRaw, retained.target.exact)
    assert.deepEqual(
      descriptor(baselineCallRaw),
      expectedDescriptor(retained.baseline),
    )
    assert.deepEqual(
      descriptor(targetCallRaw),
      expectedDescriptor(retained.target),
    )
    assert.equal(
      canonicalDescriptor(baselineStatement.expression).sha256,
      retained.baseline.canonicalSha256,
    )
    assert.equal(
      canonicalDescriptor(retainedCall).sha256,
      retained.target.canonicalSha256,
    )

    targetStatement.expression = retainedCall
    const transformedTarget = canonicalDescriptor(target.node)
    assert.deepEqual(
      transformedTarget,
      fixture.wholeUnitSemanticDelta.transform.commonCanonical,
    )
    assert.deepEqual(transformedTarget, canonicalDescriptor(baseline.node))
  },
)

test(
  'the producer assignment is linked to the authenticated AgentTool consumer only',
  { skip: !selected },
  t => {
    const targetPath = artifactPath(
      'CLAUDE_CODE_2_1_121_INNER_BUNDLE',
      fixture.inputs.targetBundle,
    )
    if (!fs.existsSync(targetPath)) {
      t.skip('authenticated Target121 bundle is unavailable')
      return
    }
    const target = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const consumer = fixture.provenanceGraph.downstreamAgentToolConsumer
    exactBufferSlice(
      target,
      {
        start: consumer.unitStart,
        end: consumer.unitEnd,
        bytes: consumer.unitBytes,
        sha256: consumer.unitSha256,
      },
      'Target121 AgentTool consumer unit',
    )
    assert.equal(
      exactBufferSlice(target, consumer, 'Target121 active-skill consumer'),
      consumer.exact,
    )
    const sibling = fixture.provenanceGraph.siblingSkillToolProducer
    exactBufferSlice(
      target,
      {
        start: sibling.unitStart,
        end: sibling.unitEnd,
        bytes: sibling.unitBytes,
        sha256: sibling.unitSha256,
      },
      'Target121 SkillTool sibling unit',
    )
    assert.equal(
      exactBufferSlice(target, sibling, 'Target121 sibling activeSkill token'),
      sibling.exact,
    )
    assert.match(fixture.provenanceGraph.boundary, /owns only u13110/)
    assert.match(fixture.provenanceGraph.boundary, /independent u13120/)
  },
)

test(
  'recovered owner and ToolUseContext prove the type-incomplete source gap',
  { skip: !selected },
  () => {
    const ts = typescript()
    const ownerSources = []
    for (const [root, expected] of [
      [selectedBaselineSourceRoot(), fixture.sourceState.target120],
      [selectedSourceRoot(), fixture.sourceState.target121],
    ]) {
      const filename = sourceFilename(root, fixture.sourceState.path)
      const result = sourceDeclaration(
        ts,
        filename,
        expected,
        fixture.sourceState.declarationName,
        'function',
      )
      ownerSources.push(result.text)
      for (const [marker, count] of Object.entries(
        fixture.sourceState.retainedAnchorCounts,
      )) {
        assert.equal(countOccurrences(result.text, marker), count, marker)
      }
      for (const [marker, count] of Object.entries(
        fixture.sourceState.missingMarkerCounts,
      )) {
        assert.equal(countOccurrences(result.text, marker), count, marker)
      }
    }
    assert.equal(ownerSources[0], ownerSources[1])
    assert.match(fixture.sourceState.declarationRelation, /byte-identical/)

    const toolContext = fixture.sourceState.toolUseContext
    const toolResult = sourceDeclaration(
      ts,
      sourceFilename(selectedSourceRoot(), toolContext.path),
      toolContext,
      toolContext.declaration.name,
      'type',
    )
    assert.equal(
      countOccurrences(toolResult.text, 'activeSkill'),
      toolContext.activeSkillOccurrences,
    )
    assert.equal(
      countOccurrences(toolResult.text, 'spawnedBySkill'),
      toolContext.spawnedBySkillOccurrences,
    )

    let sourcePropertyOccurrences = 0
    const pending = [selectedSourceRoot()]
    while (pending.length > 0) {
      const directory = pending.pop()
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name)
        if (entry.isDirectory()) pending.push(filename)
        else if (/\.tsx?$/.test(entry.name)) {
          sourcePropertyOccurrences += countOccurrences(
            fs.readFileSync(filename, 'utf8'),
            'activeSkill',
          )
        }
      }
    }
    assert.equal(
      sourcePropertyOccurrences,
      fixture.provenanceGraph.sourcePropertyOccurrences,
    )

    const semanticTrees = [
      selectedBaselineRepositoryRoot(),
      selectedTargetRepositoryRoot(),
    ]
    const expectedSources = [
      fixture.sourceState.target120,
      fixture.sourceState.target121,
    ]
    for (let index = 0; index < semanticTrees.length; index += 1) {
      const root = semanticTrees[index]
      const expected = expectedSources[index]
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
    const target121Tree = semanticTrees[1]
    assert.equal(
      git(target121Tree, ['rev-parse', `HEAD:${toolContext.path}`]),
      toolContext.gitBlob,
    )
  },
)

test(
  'the static proof removes only u13110 and is idempotent',
  { skip: !selected },
  async () => {
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 56,
      unsupportedResidues: 473,
      firstTargetIndex: 13110,
      productionTupleSha256:
        '0fca2f274fa6840a713a9a8524a2afe87ea5003f46cbee054a05d718201081b2',
    })
    assert.deepEqual(fixture.strictEvolution.removes.targetIndices, [13110])
    assert.equal(fixture.strictEvolution.removes.units, 1)
    assert.equal(fixture.strictEvolution.removes.residueCount, 1)
    assert.deepEqual(
      fixture.strictEvolution.removes.residues,
      fixture.ownerResidues.strictRowsExact,
    )
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 55,
      unsupportedResidues: 472,
    })
    assert.match(
      fixture.sourceReplayBlocker.decision,
      /static whole-unit owner proof only; no replay helper and no source writes/,
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /exact Target120 declaration.*no activeSkill member.*type-incomplete graph/,
    )
    const first = await import(
      `../cases/2.1.120-to-2.1.121/recovered/slash-command-active-skill-owner-overrides.mjs?first`
    )
    const second = await import(
      `../cases/2.1.120-to-2.1.121/recovered/slash-command-active-skill-owner-overrides.mjs?second`
    )
    assert.deepEqual(
      first.TARGET121_SLASH_COMMAND_ACTIVE_SKILL_OWNER_OVERRIDES,
      second.TARGET121_SLASH_COMMAND_ACTIVE_SKILL_OWNER_OVERRIDES,
    )
    assert.equal(
      Object.isFrozen(
        first.TARGET121_SLASH_COMMAND_ACTIVE_SKILL_OWNER_OVERRIDES[0].paths,
      ),
      true,
    )
  },
)
