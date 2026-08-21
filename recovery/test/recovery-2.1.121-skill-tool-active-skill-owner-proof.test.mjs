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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/skill-tool-active-skill-owner-overrides.mjs'

const {
  TARGET121_SKILL_TOOL_ACTIVE_SKILL_EVIDENCE_IDS,
  TARGET121_SKILL_TOOL_ACTIVE_SKILL_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-skill-tool-active-skill-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'd6fb78d6ff502cdc8e58432e6633d51dce0f124ed1376cec39b89578ff9a8fd1'

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

function memberName(node) {
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
  assert.equal(
    [...tokenizer(source, { ecmaVersion: 'latest' })].length,
    expected.tokenCount,
  )
  const factoryBody = node.declarations[0].init.arguments[0].body.body
  assert.equal(factoryBody.length, expected.factoryBodyStatementCount)
  return { node, source }
}

function skillToolCallProperty(unit) {
  const candidates = []
  walk(unit, node => {
    if (
      node.type === 'Property' &&
      node.method &&
      node.key?.type === 'Identifier' &&
      node.key.name === 'call' &&
      node.value?.async
    ) {
      candidates.push(node)
    }
  })
  assert.equal(candidates.length, 1, 'one async SkillTool call method')
  return candidates[0]
}

function invocationObject(callProperty) {
  const candidates = []
  walk(callProperty.value.body, node => {
    if (
      node.type === 'CallExpression' &&
      node.arguments[0]?.type === 'Literal' &&
      node.arguments[0].value === 'tengu_skill_tool_invocation' &&
      node.arguments[1]?.type === 'ObjectExpression'
    ) {
      candidates.push(node.arguments[1])
    }
  })
  assert.equal(candidates.length, 1, 'one SkillTool invocation event')
  return candidates[0]
}

function pluginTelemetrySpread(callProperty) {
  const invocation = invocationObject(callProperty)
  const spread = invocation.properties.at(-1)
  assert.equal(spread.type, 'SpreadElement')
  const pluginObject = spread.argument.right
  assert.equal(pluginObject.type, 'ObjectExpression')
  return { invocation, spread, pluginObject }
}

function exactNodeSlice(parsed, expected, label) {
  const localStart = expected.start - parsed.unitStart
  const localEnd = expected.end - parsed.unitStart
  const raw = parsed.source.slice(localStart, localEnd)
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

function sourceEvidence(ts, filename, expected) {
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
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        child => child.name.getText(sourceFile) === fixture.sourceState.declarationName,
      ),
  )
  assert.ok(declaration, fixture.sourceState.declarationName)
  let callMethod
  const visit = node => {
    if (
      !callMethod &&
      ts.isMethodDeclaration(node) &&
      node.name.getText(sourceFile) === 'call'
    ) {
      callMethod = node
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  assert.ok(callMethod, 'SkillTool.call')
  for (const [node, descriptorKey] of [
    [declaration, 'declaration'],
    [callMethod, 'callMethod'],
  ]) {
    const pinned = expected[descriptorKey]
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
      pinned,
    )
  }
  return {
    source,
    callText: source.slice(callMethod.getStart(sourceFile), callMethod.end),
  }
}

function toolUseContextEvidence(ts, filename, expected) {
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
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === expected.declaration.name,
  )
  assert.ok(declaration)
  const start = declaration.getStart(sourceFile)
  const end = declaration.end
  const text = source.slice(start, end)
  assert.deepEqual(
    {
      name: declaration.name.text,
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
    },
    expected.declaration,
  )
  const options = declaration.type.members.find(
    member => member.name?.getText(sourceFile) === 'options',
  )
  assert.ok(options && ts.isTypeLiteralNode(options.type))
  const names = options.type.members.map(member => member.name?.getText(sourceFile))
  assert.equal(names.length, expected.optionsMemberNames.count)
  assert.deepEqual(canonicalDigest(names), {
    bytes: expected.optionsMemberNames.bytes,
    sha256: expected.optionsMemberNames.sha256,
  })
  return text
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 SkillTool fixture and owner override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET121_SKILL_TOOL_ACTIVE_SKILL_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET121_SKILL_TOOL_ACTIVE_SKILL_OWNER_OVERRIDES, [
      {
        key: `${caseName}:13120`,
        targetIndex: 13120,
        paths: [fixture.ownerResidues.correctedOwner],
        declarations: [fixture.sourceState.declarationName],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET121_SKILL_TOOL_ACTIVE_SKILL_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.equal(
      Object.isFrozen(TARGET121_SKILL_TOOL_ACTIVE_SKILL_OWNER_OVERRIDES),
      true,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_SKILL_TOOL_ACTIVE_SKILL_EVIDENCE_IDS',
      'TARGET121_SKILL_TOOL_ACTIVE_SKILL_OWNER_OVERRIDES',
    ])
  },
)

test(
  'authenticated ledger, report, and all fourteen u13120 owner rows are pinned',
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
      'Target120 SkillTool unit',
    )
    exactBufferSlice(target, fixture.targetUnit, 'Target121 u13120')

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
  },
)

test(
  'the complete SkillTool delta is confined to active-skill provenance and plugin telemetry',
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
    const baseline = {
      ...parseUnit(
        baselineBundle,
        fixture.baselineSemanticCounterpart,
        'Target120 SkillTool unit',
      ),
      unitStart: fixture.baselineSemanticCounterpart.start,
    }
    const target = {
      ...parseUnit(targetBundle, fixture.targetUnit, 'Target121 SkillTool unit'),
      unitStart: fixture.targetUnit.start,
    }
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

    const baselineCall = skillToolCallProperty(baseline.node)
    const targetCall = skillToolCallProperty(target.node)
    for (const [parsed, node, expected, label] of [
      [
        baseline,
        baselineCall,
        fixture.wholeUnitSemanticDelta.callBoundary.baseline,
        'Target120 SkillTool.call',
      ],
      [
        target,
        targetCall,
        fixture.wholeUnitSemanticDelta.callBoundary.target,
        'Target121 SkillTool.call',
      ],
    ]) {
      exactNodeSlice(parsed, expected, label)
      assert.equal(node.type, expected.nodeType)
      assert.equal(parsed.unitStart + node.start, expected.start)
      assert.equal(parsed.unitStart + node.end, expected.end)
      assert.equal(node.value.body.body.length, expected.bodyStatementCount)
      assert.equal(canonicalDescriptor(node).sha256, expected.canonicalSha256)
    }

    const baselineBody = baselineCall.value.body.body
    const targetBody = targetCall.value.body.body
    const addition = fixture.wholeUnitSemanticDelta.activeSkillAddition
    const additionStatement = targetBody[1]
    assert.equal(additionStatement.type, addition.nodeType)
    assert.equal(additionStatement.expression.type, 'AssignmentExpression')
    assert.equal(memberName(additionStatement.expression.left), 'activeSkill')
    assert.equal(memberName(additionStatement.expression.left.object), 'options')
    assert.equal(additionStatement.expression.right.type, 'Identifier')
    exactNodeSlice(target, addition, 'Target121 activeSkill statement')
    exactNodeSlice(
      target,
      addition.assignment,
      'Target121 activeSkill assignment',
    )
    assert.equal(
      canonicalDescriptor(additionStatement).sha256,
      addition.canonicalSha256,
    )
    assert.equal(
      canonicalDescriptor(additionStatement.expression).sha256,
      addition.assignment.canonicalSha256,
    )

    const marketplace =
      fixture.wholeUnitSemanticDelta.baselineOnlyMarketplaceDeclarator
    const marketplaceNode = baselineBody[4].declarations[8]
    assert.equal(marketplaceNode.type, marketplace.nodeType)
    exactNodeSlice(baseline, marketplace, 'Target120 marketplace declarator')
    assert.equal(
      canonicalDescriptor(marketplaceNode).sha256,
      marketplace.canonicalSha256,
    )

    const baselinePlugin = pluginTelemetrySpread(baselineCall)
    const targetPlugin = pluginTelemetrySpread(targetCall)
    const pluginFixture =
      fixture.wholeUnitSemanticDelta.pluginTelemetrySubstitution
    for (const [parsed, found, expected, label] of [
      [baseline, baselinePlugin.spread, pluginFixture.baseline, 'Target120 plugin telemetry'],
      [target, targetPlugin.spread, pluginFixture.target, 'Target121 plugin telemetry'],
    ]) {
      exactNodeSlice(parsed, expected, label)
      assert.equal(found.type, expected.nodeType)
      assert.equal(canonicalDescriptor(found).sha256, expected.canonicalSha256)
    }
    const baseProperties = baselinePlugin.pluginObject.properties
    const targetProperties = targetPlugin.pluginObject.properties
    assert.equal(baseProperties[0].key.name, '_PROTO_plugin_name')
    assert.equal(
      baseProperties[1].argument.right.properties[0].key.name,
      '_PROTO_marketplace_name',
    )
    assert.equal(baseProperties[2].key.name, 'plugin_name')
    assert.equal(baseProperties[3].key.name, 'plugin_repository')
    assert.equal(targetProperties[1].key.name, 'plugin_name')
    assert.equal(targetProperties[2].key.name, 'plugin_repository')
    assert.deepEqual(
      canonicalDescriptor(baseProperties[2]),
      canonicalDescriptor(targetProperties[1]),
    )
    assert.deepEqual(
      canonicalDescriptor(baseProperties[3]),
      canonicalDescriptor(targetProperties[2]),
    )
    assert.deepEqual(
      canonicalDescriptor(baseProperties[4].argument),
      canonicalDescriptor(targetProperties[0].argument),
    )

    assert.deepEqual(
      canonicalDescriptor(baselineBody[0]),
      canonicalDescriptor({
        ...targetBody[0],
        declarations: [
          ...targetBody[0].declarations,
          ...targetBody[2].declarations,
        ],
      }),
    )
    baselineBody[4].declarations.splice(8, 1)
    baselinePlugin.invocation.properties.splice(12, 1)
    targetBody[0].declarations.push(...targetBody[2].declarations)
    targetBody.splice(1, 2)
    pluginTelemetrySpread(targetCall).invocation.properties.splice(12, 1)
    const transformedBaseline = canonicalDescriptor(baseline.node)
    const transformedTarget = canonicalDescriptor(target.node)
    assert.deepEqual(
      transformedBaseline,
      fixture.wholeUnitSemanticDelta.transform.commonCanonical,
    )
    assert.deepEqual(transformedTarget, transformedBaseline)
  },
)

test(
  'the recovered SkillTool and ToolUseContext establish a fail-closed source gap',
  { skip: !selected },
  () => {
    const ts = typescript()
    const ownerEvidence = []
    for (const [root, expected] of [
      [selectedBaselineSourceRoot(), fixture.sourceState.target120],
      [selectedSourceRoot(), fixture.sourceState.target121],
    ]) {
      const result = sourceEvidence(
        ts,
        sourceFilename(root, fixture.sourceState.path),
        expected,
      )
      ownerEvidence.push(result)
      for (const [marker, count] of Object.entries(
        fixture.sourceState.callMarkerCounts,
      )) {
        assert.equal(countOccurrences(result.callText, marker), count, marker)
      }
    }
    assert.equal(ownerEvidence[0].source, ownerEvidence[1].source)
    assert.equal(ownerEvidence[0].callText, ownerEvidence[1].callText)
    assert.match(fixture.sourceState.declarationRelation, /byte-identical/)

    const toolContext = fixture.sourceState.toolUseContext
    const typeText = toolUseContextEvidence(
      ts,
      sourceFilename(selectedSourceRoot(), toolContext.path),
      toolContext,
    )
    assert.equal(
      countOccurrences(typeText, 'activeSkill'),
      toolContext.activeSkillOccurrences,
    )
    assert.equal(
      countOccurrences(typeText, 'spawnedBySkill'),
      toolContext.spawnedBySkillOccurrences,
    )

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
            'activeSkill',
          )
        }
      }
    }
    assert.equal(sourceOccurrences, fixture.provenanceGraph.targetSourceOccurrences)

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
    assert.equal(
      git(semanticTrees[1], [
        'rev-parse',
        `HEAD:${toolContext.path}`,
      ]),
      toolContext.gitBlob,
    )
  },
)

test(
  'the authenticated producer-consumer graph is exact and bounded to u13120',
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
      countOccurrences(baseline.toString('utf8'), 'activeSkill'),
      fixture.provenanceGraph.baselineBundleOccurrences,
    )
    assert.equal(
      countOccurrences(target.toString('utf8'), 'activeSkill'),
      fixture.provenanceGraph.targetBundleOccurrences,
    )
    for (const [label, evidence] of Object.entries({
      currentSkillToolProducer:
        fixture.provenanceGraph.currentSkillToolProducer,
      siblingSlashCommandProducer:
        fixture.provenanceGraph.siblingSlashCommandProducer,
      downstreamAgentToolConsumer:
        fixture.provenanceGraph.downstreamAgentToolConsumer,
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
    assert.match(fixture.provenanceGraph.boundary, /owns only u13120/)
    assert.match(fixture.provenanceGraph.boundary, /u13110 producer/)
    assert.match(fixture.provenanceGraph.boundary, /u13026 consumer/)
  },
)

test(
  'the static proof removes one residue and the override is idempotent',
  { skip: !selected },
  async () => {
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 55,
      unsupportedResidues: 472,
      firstTargetIndex: 13120,
      productionTupleSha256:
        'e94a262792281055c8fcd3736663bb20f973140bd81685354185a45f914a39a8',
    })
    assert.deepEqual(fixture.strictEvolution.removes.targetIndices, [13120])
    assert.equal(fixture.strictEvolution.removes.units, 1)
    assert.equal(fixture.strictEvolution.removes.residueCount, 1)
    assert.deepEqual(
      fixture.strictEvolution.removes.residues,
      fixture.ownerResidues.strictRowsExact,
    )
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 54,
      unsupportedResidues: 471,
    })
    assert.match(
      fixture.sourceReplayBlocker.decision,
      /static whole-unit owner proof only; no replay helper and no source writes/,
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /byte-identical to Target120.*no activeSkill member.*telemetry substitution/,
    )
    const first = await import(
      `../cases/2.1.120-to-2.1.121/recovered/skill-tool-active-skill-owner-overrides.mjs?first`
    )
    const second = await import(
      `../cases/2.1.120-to-2.1.121/recovered/skill-tool-active-skill-owner-overrides.mjs?second`
    )
    assert.deepEqual(
      first.TARGET121_SKILL_TOOL_ACTIVE_SKILL_OWNER_OVERRIDES,
      second.TARGET121_SKILL_TOOL_ACTIVE_SKILL_OWNER_OVERRIDES,
    )
    assert.equal(
      Object.isFrozen(
        first.TARGET121_SKILL_TOOL_ACTIVE_SKILL_OWNER_OVERRIDES[0].paths,
      ),
      true,
    )
  },
)
