import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/agent-tool-skill-provenance-owner-overrides.mjs'

const {
  TARGET121_AGENT_TOOL_SKILL_PROVENANCE_EVIDENCE_IDS,
  TARGET121_AGENT_TOOL_SKILL_PROVENANCE_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const gitEvidenceRepositoryRoot = path.resolve(
  process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ?? repositoryRoot,
)
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-agent-tool-skill-provenance-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '0e18ab83170204d5ee170216766ec9dbf3bbf64daa9dce0e02ef2eb7e55403e4'

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

function exactStringSlice(source, expected, label) {
  const value = source.slice(expected.start, expected.end)
  assert.equal(value.length, expected.chars ?? expected.end - expected.start)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value
}

function canonicalDigest(rows) {
  return descriptor(Buffer.from(JSON.stringify(rows)))
}

function walk(node, visit, ancestors = []) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, ancestors)
    return
  }
  if (typeof node.type === 'string') visit(node, ancestors)
  const nextAncestors =
    typeof node.type === 'string' ? [...ancestors, node] : ancestors
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) {
      walk(child, visit, nextAncestors)
    }
  }
}

function propertyName(node) {
  if (node?.computed) return undefined
  if (node?.key?.type === 'Identifier') return node.key.name
  if (node?.key?.type === 'Literal') return node.key.value
  return undefined
}

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { source, node: program.body[0] }
}

function initializerCallCount(unit) {
  assert.equal(unit.type, 'VariableDeclaration')
  assert.equal(unit.declarations.length, 1)
  const initializer = unit.declarations[0].init
  assert.equal(initializer.type, 'CallExpression')
  const callback = initializer.arguments.find(
    argument => argument.type === 'ArrowFunctionExpression',
  )
  assert.ok(callback)
  assert.equal(callback.body.type, 'BlockStatement')
  return callback.body.body.filter(
    statement =>
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'CallExpression' &&
      statement.expression.callee.type === 'Identifier' &&
      statement.expression.arguments.length === 0,
  ).length
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

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: gitEvidenceRepositoryRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 AgentTool fixture and static-only owner override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      TARGET121_AGENT_TOOL_SKILL_PROVENANCE_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_AGENT_TOOL_SKILL_PROVENANCE_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:13026`,
          targetIndex: 13026,
          paths: ['src/tools/AgentTool/AgentTool.tsx'],
          declarations: ['AgentTool'],
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_AGENT_TOOL_SKILL_PROVENANCE_OWNER_OVERRIDES[0]
              .behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(
        TARGET121_AGENT_TOOL_SKILL_PROVENANCE_OWNER_OVERRIDES,
      ),
      true,
    )
    assert.match(
      TARGET121_AGENT_TOOL_SKILL_PROVENANCE_OWNER_OVERRIDES[0].behavior,
      /system prompt.*plugin-agent telemetry.*spawnedBySkill.*activeSkill.*static whole-unit owner proof.*never a partial source replay/,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET121_AGENT_TOOL_SKILL_PROVENANCE_OWNER_OVERRIDES',
    )
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_AGENT_TOOL_SKILL_PROVENANCE_EVIDENCE_IDS',
      'TARGET121_AGENT_TOOL_SKILL_PROVENANCE_OWNER_OVERRIDES',
    ])
  },
)

test(
  'authenticated bundles, structural ledger, and all 46 owner rows pin u13026',
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
          'Target121 structural ledger',
        ),
      ),
    )
    const targetRegion = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetRegion)
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      {
        nodeType: targetRegion.target.nodeType,
        start: targetRegion.target.start,
        end: targetRegion.target.end,
        tokenCount: targetRegion.target.tokenCount,
        topDefinitionCount: targetRegion.target.topDefinitionCount,
        unknownFreeIdentifierCount: targetRegion.unknownFreeIdentifierCount,
        sha256: targetRegion.target.sourceHash,
        coarseHash: targetRegion.target.coarseHash,
      },
      {
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount:
          fixture.targetUnit.unknownFreeIdentifierCount,
        sha256: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
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
        topDefinitionCount: baselineRegion.topDefinitionCount,
        sha256: baselineRegion.sourceHash,
        coarseHash: baselineRegion.coarseHash,
      },
      {
        nodeType: fixture.baselineSemanticCounterpart.nodeType,
        start: fixture.baselineSemanticCounterpart.start,
        end: fixture.baselineSemanticCounterpart.end,
        tokenCount: fixture.baselineSemanticCounterpart.tokenCount,
        topDefinitionCount:
          fixture.baselineSemanticCounterpart.topDefinitionCount,
        sha256: fixture.baselineSemanticCounterpart.sha256,
        coarseHash: fixture.baselineSemanticCounterpart.coarseHash,
      },
    )

    const targetParsed = parseUnit(target, fixture.targetUnit, 'Target121 u13026')
    const baselineParsed = parseUnit(
      baseline,
      fixture.baselineSemanticCounterpart,
      'Target120 u12915',
    )
    assert.equal(
      initializerCallCount(targetParsed.node),
      fixture.targetUnit.moduleInitializerCallCount,
    )
    assert.equal(
      initializerCallCount(baselineParsed.node),
      fixture.baselineSemanticCounterpart.moduleInitializerCallCount,
    )
    for (const marker of [
      'A short (3-5 word) description of the task',
      '. MCP servers with tools: ',
      '. Use /mcp to configure and authenticate the required MCP servers.',
      'tengu_agent_tool_selected',
      'skipReplFilter',
      'forksParentContext',
    ]) {
      assert.ok(targetParsed.source.includes(marker), marker)
      assert.ok(baselineParsed.source.includes(marker), marker)
    }

    const { report } = readTypedReportPhase()
    const compact = row => ({
      literalKind: row.literalKind,
      value: row.value,
      baselineOccurrenceCount: row.baselineOccurrenceCount,
      targetOccurrenceNumber: row.targetOccurrenceNumber,
      targetAdded: row.targetAdded,
      start: row.target.start,
      end: row.target.end,
    })
    const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    const strictRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.targetUnit.targetIndex,
    )
    assert.deepEqual(ownerRows.map(compact), fixture.ownerResidues.rows)
    assert.equal(ownerRows.length, fixture.ownerResidues.totalRows)
    assert.equal(strictRows.length, fixture.ownerResidues.strictRows)
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
    assert.deepEqual(
      canonicalDigest(
        strictRows.map(row => [
          row.literalKind,
          row.value,
          row.target.start,
          row.target.end,
          row.baselineOccurrenceCount,
          row.targetOccurrenceNumber,
          row.targetAdded,
        ]),
      ),
      fixture.ownerResidues.targetAddedRowIdentities,
    )
    assert.deepEqual(
      canonicalDigest(
        strictRows.map(row => [
          row.structural.index,
          row.literalKind,
          row.value,
          row.target.start,
          row.target.end,
          row.targetOccurrenceNumber,
        ]),
      ),
      fixture.ownerResidues.strictIdentities,
    )
    for (const row of fixture.ownerResidues.rows) {
      assert.ok(row.start >= fixture.targetUnit.start)
      assert.ok(row.end <= fixture.targetUnit.end)
      const raw = target.subarray(row.start, row.end).toString('utf8')
      assert.equal(raw === row.value ? raw : JSON.parse(raw), row.value)
    }
  },
)

test(
  'whole-unit AST proves prompt telemetry, plugin metadata, and skill provenance semantics',
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
    const baseline = fs.readFileSync(baselinePath)
    const target = fs.readFileSync(targetPath)
    const baselineParsed = parseUnit(
      baseline,
      fixture.baselineSemanticCounterpart,
      'Target120 AgentTool predecessor',
    )
    const targetParsed = parseUnit(target, fixture.targetUnit, 'Target121 AgentTool')

    for (const [name, expected] of Object.entries(fixture.semanticDelta)) {
      if (name === 'invariants') continue
      const bytes = name.startsWith('baseline') ? baseline : target
      exactBufferSlice(bytes, expected, name)
    }

    function inspect(parsed) {
      const result = {
        telemetry: [],
        promptGetters: [],
        queryObjects: [],
      }
      walk(parsed.node, (node, ancestors) => {
        if (
          node.type === 'CallExpression' &&
          node.arguments[0]?.type === 'Literal' &&
          node.arguments[0].value === 'tengu_agent_tool_selected'
        ) {
          result.telemetry.push(node)
        }
        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.property?.name === 'getSystemPrompt'
        ) {
          result.promptGetters.push({ node, ancestors })
        }
        if (
          node.type === 'ObjectExpression' &&
          node.properties.some(
            property => propertyName(property) === 'agentDefinition',
          ) &&
          node.properties.some(property => propertyName(property) === 'querySource')
        ) {
          result.queryObjects.push(node)
        }
      })
      return result
    }

    const before = inspect(baselineParsed)
    const after = inspect(targetParsed)
    assert.equal(before.telemetry.length, 1)
    assert.equal(after.telemetry.length, 1)
    assert.equal(before.promptGetters.length, 1)
    assert.equal(after.promptGetters.length, 1)
    assert.equal(before.queryObjects.length, 1)
    assert.equal(after.queryObjects.length, 1)
    assert.ok(before.telemetry[0].end < before.promptGetters[0].node.start)
    assert.ok(after.promptGetters[0].node.end < after.telemetry[0].start)

    const targetPromptDeclarator = after.promptGetters[0].ancestors.findLast(
      ancestor => ancestor.type === 'VariableDeclarator',
    )
    assert.equal(targetPromptDeclarator.id.type, 'Identifier')
    const promptBinding = targetPromptDeclarator.id.name
    const targetTelemetryObject = after.telemetry[0].arguments[1]
    const baselineTelemetryObject = before.telemetry[0].arguments[1]
    assert.equal(targetTelemetryObject.type, 'ObjectExpression')
    assert.equal(baselineTelemetryObject.type, 'ObjectExpression')
    const promptLength = targetTelemetryObject.properties.find(
      property => propertyName(property) === 'agent_system_prompt_chars',
    )
    assert.ok(promptLength)
    assert.equal(promptLength.value.type, 'MemberExpression')
    assert.equal(promptLength.value.object.name, promptBinding)
    assert.equal(promptLength.value.property.name, 'length')
    assert.equal(
      baselineTelemetryObject.properties.some(
        property => propertyName(property) === 'agent_system_prompt_chars',
      ),
      false,
    )

    const pluginSpread = targetTelemetryObject.properties.find(
      property => property.type === 'SpreadElement',
    )
    assert.ok(pluginSpread)
    assert.equal(pluginSpread.argument.type, 'LogicalExpression')
    assert.equal(pluginSpread.argument.operator, '&&')
    assert.equal(pluginSpread.argument.right.type, 'CallExpression')
    assert.deepEqual(
      pluginSpread.argument.right.arguments.map(argument => argument.property.name),
      ['name', 'marketplace'],
    )
    assert.equal(
      baselineTelemetryObject.properties.some(
        property => property.type === 'SpreadElement',
      ),
      false,
    )

    const targetQueryProperty = after.queryObjects[0].properties.find(
      property => propertyName(property) === 'spawnedBySkill',
    )
    assert.ok(targetQueryProperty)
    assert.equal(targetQueryProperty.value.type, 'LogicalExpression')
    assert.equal(targetQueryProperty.value.operator, '??')
    assert.equal(targetQueryProperty.value.left.property.name, 'spawnedBySkill')
    assert.equal(targetQueryProperty.value.left.object.property.name, 'options')
    assert.equal(targetQueryProperty.value.right.property.name, 'activeSkill')
    assert.equal(targetQueryProperty.value.right.object.property.name, 'options')
    assert.equal(
      before.queryObjects[0].properties.some(
        property => propertyName(property) === 'spawnedBySkill',
      ),
      false,
    )

    const targetEnhancementLocal = {
      start:
        fixture.semanticDelta.targetPromptEnhancementCall.start -
        fixture.targetUnit.start,
      end:
        fixture.semanticDelta.targetPromptEnhancementCall.end -
        fixture.targetUnit.start,
    }
    let enhancement
    walk(targetParsed.node, node => {
      if (
        node.type === 'CallExpression' &&
        node.start === targetEnhancementLocal.start &&
        node.end === targetEnhancementLocal.end
      ) {
        enhancement = node
      }
    })
    assert.ok(enhancement)
    assert.equal(enhancement.arguments[0].type, 'ArrayExpression')
    assert.equal(enhancement.arguments[0].elements[0].name, promptBinding)
  },
)

test(
  'plugin telemetry dependencies are exact and expose the additional source-graph blocker',
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
    const target = fs.readFileSync(targetPath)
    const ledger = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
        ),
      ),
    )
    const names = []
    for (const expected of fixture.retainedDependencies) {
      const region = ledger.regions.find(
        row => row.target.index === expected.targetIndex,
      )
      assert.ok(region)
      assert.equal(region.classification, expected.classification)
      assert.equal(
        region.baselineUnitIndex ?? null,
        expected.baselineUnitIndex,
      )
      assert.equal(region.target.sourceHash, expected.sha256)
      assert.equal(region.target.coarseHash, expected.coarseHash)
      const parsed = parseUnit(
        target,
        expected,
        `Target121 dependency u${expected.targetIndex}`,
      )
      assert.equal(parsed.node.type, 'FunctionDeclaration')
      names.push(parsed.node.id.name)
    }
    const [parsePluginIdentifierName, baseTelemetryName, wrapperName, guardName] =
      names
    assert.match(fixture.retainedDependencies[0].exact, /includes\("@"\)/)
    assert.match(fixture.retainedDependencies[0].exact, /marketplace/)
    assert.match(fixture.retainedDependencies[1].exact, /plugin_id_hash/)
    assert.match(fixture.retainedDependencies[1].exact, /plugin_scope/)
    assert.match(fixture.retainedDependencies[2].exact, /_PROTO_plugin_name/)
    assert.match(
      fixture.retainedDependencies[2].exact,
      /_PROTO_marketplace_name/,
    )
    assert.match(fixture.retainedDependencies[3].exact, /source==="plugin"/)
    assert.equal(fixture.retainedDependencies[2].classification, 'unresolved')
    assert.equal(fixture.retainedDependencies[2].baselineUnitIndex, null)

    const wrapper = parse(fixture.retainedDependencies[2].exact, {
      ecmaVersion: 'latest',
    }).body[0]
    const wrapperCalls = []
    walk(wrapper, node => {
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
        wrapperCalls.push(node.callee.name)
      }
    })
    assert.deepEqual(wrapperCalls, [baseTelemetryName])

    const agentTool = exactBufferSlice(
      target,
      fixture.targetUnit,
      'Target121 AgentTool dependency consumer',
    )
    assert.ok(agentTool.includes(`${guardName}(`))
    assert.ok(agentTool.includes(`${parsePluginIdentifierName}(`))
    assert.ok(agentTool.includes(`${wrapperName}(`))
  },
)

test(
  'recovered Target121 source pins the AgentTool owner while preserving the strict gaps',
  { skip: !selected },
  () => {
    const ts = typescript()
    const roots = [
      [selectedBaselineSourceRoot(), fixture.sourceState.target120],
      [selectedSourceRoot(), fixture.sourceState.target121],
    ]
    const sourceTexts = []
    for (const [root, expected] of roots) {
      const filename = sourceFilename(root, expected.path)
      const bytes = readExact(filename, expected, expected.path)
      const source = bytes.toString('utf8')
      sourceTexts.push(source)
      assert.equal(source.length, expected.chars)
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      let declaration
      function visit(node) {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === expected.declaration.name
        ) {
          declaration = node.parent.parent
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      assert.ok(declaration)
      assert.equal(ts.isVariableStatement(declaration), true)
      const actual = {
        name: expected.declaration.name,
        kind: 'VariableStatement',
        start: declaration.getStart(sourceFile),
        end: declaration.end,
        chars: source.slice(declaration.getStart(sourceFile), declaration.end)
          .length,
        ...descriptor(
          source.slice(declaration.getStart(sourceFile), declaration.end),
        ),
      }
      assert.deepEqual(actual, expected.declaration)
    }
    const [source120, source121] = sourceTexts
    for (const marker of fixture.sourceState.sourceCoveredTarget121Markers) {
      assert.equal(countOccurrences(source120, marker), 0, marker)
      assert.equal(countOccurrences(source121, marker), 1, marker)
    }
    for (const marker of fixture.sourceState.sourceGapMarkers) {
      assert.equal(countOccurrences(source120, marker), 0, marker)
      assert.equal(countOccurrences(source121, marker), 0, marker)
    }
    for (const [name, expected] of Object.entries(
      fixture.sourceState.target121.anchors,
    )) {
      exactStringSlice(source121, expected, `Target121 source ${name}`)
    }
    assert.match(
      exactStringSlice(
        source121,
        fixture.sourceState.target121.anchors.telemetryCall,
        'stale source telemetry call',
      ),
      /is_fork: isForkPath\s*\}\)/,
    )
    assert.match(
      exactStringSlice(
        source121,
        fixture.sourceState.target121.anchors.deferredPromptDeclaration,
        'stale deferred prompt declaration',
      ),
      /selectedAgent\.getSystemPrompt/,
    )
    assert.doesNotMatch(
      exactStringSlice(
        source121,
        fixture.sourceState.target121.anchors.runAgentParamsDeclaration,
        'stale runAgent params declaration',
      ),
      /spawnedBySkill|activeSkill/,
    )

    for (const expected of fixture.sourceState.dependencies) {
      const filename = sourceFilename(selectedSourceRoot(), expected.path)
      const bytes = fs.readFileSync(filename)
      const source = bytes.toString('utf8')
      assert.deepEqual(
        { bytes: bytes.length, chars: source.length, sha256: sha256(bytes) },
        {
          bytes: expected.fileBytes,
          chars: expected.fileChars,
          sha256: expected.fileSha256,
        },
      )
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      let declaration
      function visit(node) {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name?.text === expected.declaration
        ) {
          declaration = node
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      assert.ok(declaration, expected.declaration)
      assert.deepEqual(
        {
          start: declaration.getStart(sourceFile),
          end: declaration.end,
          chars: source.slice(declaration.getStart(sourceFile), declaration.end)
            .length,
          ...descriptor(
            source.slice(declaration.getStart(sourceFile), declaration.end),
          ),
        },
        expected.declarationDescriptor,
      )
      if (expected.declaration === 'buildPluginTelemetryFields') {
        assert.doesNotMatch(
          source.slice(declaration.getStart(sourceFile), declaration.end),
          /_PROTO_plugin_name|_PROTO_marketplace_name/,
        )
      }
    }
    for (const missingImport of fixture.sourceState.missingAgentToolImports) {
      if (missingImport.startsWith('target-added ')) continue
      assert.doesNotMatch(
        source121.slice(0, fixture.sourceState.target121.declaration.start),
        new RegExp(`\\b${missingImport}\\b`),
      )
    }
  },
)

test(
  'the authenticated skill-provenance graph is wider than u13026 and absent from the recovered tree',
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
    const target = fs.readFileSync(targetPath)
    const targetText = target.toString('utf8')
    const ledger = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
        ),
      ),
    )
    const { name: reportPhase, report } = readTypedReportPhase()
    const expectedOccurrences = fixture.skillProvenanceGraph.units
      .flatMap(unit =>
        unit.occurrences.map(occurrence => ({
          targetIndex: unit.targetIndex,
          ...occurrence,
        })),
      )
      .sort((a, b) => a.start - b.start)
    const actualOccurrences = []
    for (const property of ['spawnedBySkill', 'activeSkill']) {
      let offset = -1
      while ((offset = targetText.indexOf(property, offset + 1)) >= 0) {
        const region = ledger.regions.find(
          row => row.target.start <= offset && row.target.end > offset,
        )
        const residue = report.sourceRuntimeOwnerResidueRows.find(
          row => row.target.start === offset && row.value === property,
        )
        actualOccurrences.push({
          targetIndex: region.target.index,
          property,
          start: offset,
          end: offset + property.length,
          targetOccurrenceNumber: residue.targetOccurrenceNumber,
        })
      }
    }
    actualOccurrences.sort((a, b) => a.start - b.start)
    assert.deepEqual(actualOccurrences, expectedOccurrences)
    assert.equal(
      actualOccurrences.filter(row => row.property === 'spawnedBySkill').length,
      fixture.skillProvenanceGraph.propertyOccurrenceCounts.spawnedBySkill,
    )
    assert.equal(
      actualOccurrences.filter(row => row.property === 'activeSkill').length,
      fixture.skillProvenanceGraph.propertyOccurrenceCounts.activeSkill,
    )
    for (const expected of fixture.skillProvenanceGraph.units) {
      const region = ledger.regions.find(
        row => row.target.index === expected.targetIndex,
      )
      assert.ok(region)
      assert.equal(region.classification, expected.classification)
      assert.equal(region.target.start, expected.start)
      assert.equal(region.target.end, expected.end)
      assert.equal(region.target.sourceHash, expected.sha256)
      assert.deepEqual(
        [
          ...new Set(
            report.sourceRuntimeOwnerResidueRows
              .filter(
                row =>
                  row.structural.index === expected.targetIndex &&
                  ['spawnedBySkill', 'activeSkill'].includes(row.value),
              )
              .flatMap(row => row.ownerPaths),
          ),
        ],
        reportPhase === 'postDaemonOwner'
          ? (expected.postDaemonOwnerReportedOwners ?? expected.reportedOwners)
          : expected.reportedOwners,
      )
    }

    const sourceRoot = selectedSourceRoot()
    const sourceFiles = []
    const pending = [sourceRoot]
    while (pending.length > 0) {
      const directory = pending.pop()
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name)
        if (entry.isDirectory()) pending.push(filename)
        else if (/\.tsx?$/.test(entry.name)) sourceFiles.push(filename)
      }
    }
    const sourceMarkerCounts = Object.fromEntries(
      fixture.sourceState.sourceGapMarkers.map(marker => [marker, 0]),
    )
    for (const filename of sourceFiles) {
      const source = fs.readFileSync(filename, 'utf8')
      for (const marker of fixture.sourceState.sourceGapMarkers) {
        sourceMarkerCounts[marker] += countOccurrences(source, marker)
      }
    }
    assert.deepEqual(sourceMarkerCounts, {
      agent_system_prompt_chars: 0,
      spawnedBySkill: 0,
      activeSkill: 0,
    })

    assert.equal(
      git([
        'rev-parse',
        `${fixture.sourceState.target120.gitCommit}:${fixture.sourceState.target120.path}`,
      ]),
      fixture.sourceState.target120.gitBlob,
    )
    assert.equal(
      git([
        'rev-parse',
        `${fixture.sourceState.target121.gitCommit}:${fixture.sourceState.target121.path}`,
      ]),
      fixture.sourceState.target121.gitBlob,
    )
    for (const marker of fixture.sourceState.gitDonorAudit.markers) {
      assert.equal(
        git([
          'log',
          '--all',
          '--format=%H',
          `-S${marker}`,
          '--',
          fixture.sourceState.gitDonorAudit.path,
        ]),
        '',
        marker,
      )
    }
  },
)

test(
  'the proof removes exactly four u13026 residues and remains fail-closed elsewhere',
  { skip: !selected },
  () => {
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 58,
      unsupportedResidues: 479,
      firstTargetIndex: 13026,
      reportOrderSevenFieldSha256:
        'c954ed6f6a6142173870a5292251dd9ca8076ddeb036f273f096e0471dfdaa6c',
    })
    assert.deepEqual(fixture.strictEvolution.removes.targetIndices, [13026])
    assert.equal(fixture.strictEvolution.removes.units, 1)
    assert.equal(fixture.strictEvolution.removes.residueCount, 4)
    assert.deepEqual(
      fixture.strictEvolution.removes.residues,
      [
        [13026, 'property', 'agent_system_prompt_chars', 8059276, 8059301, 1],
        [13026, 'property', 'spawnedBySkill', 8060710, 8060724, 1],
        [13026, 'property', 'spawnedBySkill', 8060735, 8060749, 2],
        [13026, 'property', 'activeSkill', 8060761, 8060772, 1],
      ],
    )
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 57,
      unsupportedResidues: 475,
    })
    assert.equal(
      fixture.strictEvolution.before.unsupportedUnits -
        fixture.strictEvolution.removes.units,
      fixture.strictEvolution.predictedAfter.unsupportedUnits,
    )
    assert.equal(
      fixture.strictEvolution.before.unsupportedResidues -
        fixture.strictEvolution.removes.residueCount,
      fixture.strictEvolution.predictedAfter.unsupportedResidues,
    )
    assert.match(
      fixture.sourceReplayBlocker.decision,
      /static whole-unit owner proof only; no replay helper and no source writes/,
    )
    assert.match(
      fixture.skillProvenanceGraph.boundary,
      /Only u13026.*other graph units remain independent fail-closed strict obligations/,
    )
  },
)
