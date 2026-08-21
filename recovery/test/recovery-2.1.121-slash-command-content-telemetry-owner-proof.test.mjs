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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/slash-command-content-telemetry-owner-overrides.mjs'

const {
  TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_EVIDENCE_IDS,
  TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-slash-command-content-telemetry-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '7551ab80df70ea571fd11da0cc983d2c966fb8c66b00541bb51950e79338de00'

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

function noncomputedPropertyName(node) {
  if (node?.type !== 'Property' || node.computed) return undefined
  if (node.key?.type === 'Identifier') return node.key.name
  if (node.key?.type === 'Literal') return node.key.value
  return undefined
}

function containsNode(node, predicate) {
  let found = false
  walk(node, child => {
    if (predicate(child)) found = true
  })
  return found
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

function baselineRemoval(node) {
  return (
    node?.type === 'IfStatement' &&
    containsNode(
      node.test,
      child =>
        child.type === 'AssignmentExpression' &&
        noncomputedMemberName(child.left) === '_PROTO_plugin_name',
    )
  )
}

function targetRemoval(node) {
  return (
    node?.type === 'SpreadElement' &&
    containsNode(
      node,
      child => noncomputedPropertyName(child) === 'command_content_chars',
    )
  )
}

function removeArrayNodes(node, predicate) {
  let removed = 0
  function visit(value) {
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (predicate(value[index])) {
          value.splice(index, 1)
          removed += 1
        } else {
          visit(value[index])
        }
      }
      return
    }
    if (value === null || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (!['end', 'loc', 'range', 'raw', 'start'].includes(key)) visit(child)
    }
  }
  visit(node)
  return removed
}

function sideDescriptor(node, absoluteUnitStart, source, expected) {
  const raw = source.slice(node.start, node.end)
  assert.equal(absoluteUnitStart + node.start, expected.start)
  assert.equal(absoluteUnitStart + node.end, expected.end)
  assert.equal(raw, expected.exact)
  assert.deepEqual(descriptor(raw), expectedDescriptor(expected))
  const canonical = canonicalDescriptor(node)
  assert.equal(canonical.sha256, expected.canonicalSha256)
  return [
    node.type,
    expected.start,
    expected.end,
    expected.bytes,
    expected.sha256,
    expected.canonicalSha256,
  ]
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

test(
  'Target121 slash-command fixture and static owner override are exact',
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
      TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:13102`,
          targetIndex: 13102,
          paths: [fixture.ownerResidues.correctedOwner],
          declarations: ['processSlashCommand'],
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES[0]
              .behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(
        TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES,
      ),
      true,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES',
    )
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_EVIDENCE_IDS',
      'TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES',
    ])
  },
)

test(
  'authenticated ledger, report, and all u13102 rows are pinned',
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
      'Target120 processSlashCommand unit',
    )
    exactBufferSlice(target, fixture.targetUnit, 'Target121 u13102')

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
        index: targetRegion.target.index,
        nodeType: targetRegion.target.nodeType,
        start: targetRegion.target.start,
        end: targetRegion.target.end,
        tokenCount: targetRegion.target.tokenCount,
        sourceHash: targetRegion.target.sourceHash,
        coarseHash: targetRegion.target.coarseHash,
        topDefinitionCount: targetRegion.target.topDefinitionCount,
      },
      {
        index: fixture.targetUnit.targetIndex,
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        sourceHash: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
      },
    )
    assert.equal(
      targetRegion.unknownFreeIdentifierCount,
      fixture.targetUnit.unknownFreeIdentifierCount,
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
        topDefinitionCount: baselineRegion.topDefinitionCount,
      },
      {
        nodeType: fixture.baselineSemanticCounterpart.nodeType,
        start: fixture.baselineSemanticCounterpart.start,
        end: fixture.baselineSemanticCounterpart.end,
        tokenCount: fixture.baselineSemanticCounterpart.tokenCount,
        sourceHash: fixture.baselineSemanticCounterpart.sha256,
        coarseHash: fixture.baselineSemanticCounterpart.coarseHash,
        topDefinitionCount:
          fixture.baselineSemanticCounterpart.topDefinitionCount,
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
    const identities = rows =>
      rows.map(row => [
        row.literalKind,
        row.value,
        row.target.start,
        row.target.end,
        row.baselineOccurrenceCount,
        row.targetOccurrenceNumber,
        row.targetAdded,
      ])
    assert.deepEqual(
      canonicalDigest(identities(ownerRows)),
      fixture.ownerResidues.rowIdentities,
    )
    assert.deepEqual(
      canonicalDigest(identities(addedRows)),
      fixture.ownerResidues.targetAddedRowIdentities,
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
    for (const row of ownerRows) {
      assert.deepEqual(row.ownerPaths, [fixture.ownerResidues.reportedOwner])
      assert.deepEqual(row.ownerSourceMatches, [])
    }
    assert.ok(addedRows.every(row => row.value === 'command_content_chars'))
    assert.ok(addedRows.every(row => row.baselineOccurrenceCount === 0))
    assert.ok(addedRows.every(row => row.targetAdded === true))
  },
)

test(
  'the complete units differ by exactly four semantic AST substitutions',
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
      'Target120 processSlashCommand',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target121 processSlashCommand',
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

    const baselineRemoved = []
    const targetAdded = []
    walk(baseline.node, node => {
      if (baselineRemoval(node)) baselineRemoved.push(node)
    })
    walk(target.node, node => {
      if (targetRemoval(node)) targetAdded.push(node)
    })
    baselineRemoved.sort((left, right) => left.start - right.start)
    targetAdded.sort((left, right) => left.start - right.start)
    assert.equal(baselineRemoved.length, 2)
    assert.equal(targetAdded.length, 2)

    const edits = fixture.wholeUnitSemanticDelta.edits
    const actualEditDescriptors = [
      [
        edits[0].path,
        sideDescriptor(
          baselineRemoved[0],
          fixture.baselineSemanticCounterpart.start,
          baseline.source,
          edits[0].baseline,
        ),
        null,
      ],
      [
        edits[1].path,
        null,
        sideDescriptor(
          targetAdded[0],
          fixture.targetUnit.start,
          target.source,
          edits[1].target,
        ),
      ],
      [
        edits[2].path,
        sideDescriptor(
          baselineRemoved[1],
          fixture.baselineSemanticCounterpart.start,
          baseline.source,
          edits[2].baseline,
        ),
        null,
      ],
      [
        edits[3].path,
        null,
        sideDescriptor(
          targetAdded[1],
          fixture.targetUnit.start,
          target.source,
          edits[3].target,
        ),
      ],
    ]
    assert.deepEqual(
      canonicalDigest(actualEditDescriptors),
      fixture.wholeUnitSemanticDelta.editDescriptors,
    )

    const baselineForTransform = parse(baseline.source, {
      ecmaVersion: 'latest',
    }).body[0]
    const targetForTransform = parse(target.source, {
      ecmaVersion: 'latest',
    }).body[0]
    assert.equal(
      removeArrayNodes(baselineForTransform, baselineRemoval),
      fixture.wholeUnitSemanticDelta.transform.baselineRemovals,
    )
    assert.equal(
      removeArrayNodes(targetForTransform, targetRemoval),
      fixture.wholeUnitSemanticDelta.transform.targetRemovals,
    )
    const baselineCanonical = canonicalDescriptor(baselineForTransform)
    const targetCanonical = canonicalDescriptor(targetForTransform)
    assert.deepEqual(
      baselineCanonical,
      fixture.wholeUnitSemanticDelta.transform.commonCanonical,
    )
    assert.deepEqual(targetCanonical, baselineCanonical)
  },
)

test(
  'both Target121 content telemetry spreads are prompt-only and cover both command exits',
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
    const targetBundle = readExact(
      targetPath,
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const { node } = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target121 processSlashCommand',
    )
    const telemetrySpreads = []
    walk(node, (child, ancestors) => {
      if (!targetRemoval(child)) return
      const call = [...ancestors]
        .reverse()
        .find(
          ancestor =>
            ancestor.type === 'CallExpression' &&
            ancestor.arguments[0]?.type === 'Literal' &&
            ancestor.arguments[0].value === 'tengu_input_command',
        )
      assert.ok(call, 'spread belongs to tengu_input_command')
      assert.equal(child.argument.type, 'LogicalExpression')
      assert.equal(child.argument.operator, '&&')
      assert.equal(child.argument.left.type, 'BinaryExpression')
      assert.equal(child.argument.left.operator, '===')
      assert.equal(child.argument.left.right.type, 'Literal')
      assert.equal(child.argument.left.right.value, 'prompt')
      assert.equal(child.argument.right.type, 'ObjectExpression')
      assert.equal(child.argument.right.properties.length, 1)
      const property = child.argument.right.properties[0]
      assert.equal(noncomputedPropertyName(property), 'command_content_chars')
      assert.equal(property.value.type, 'MemberExpression')
      assert.equal(noncomputedMemberName(property.value), 'contentLength')
      telemetrySpreads.push({
        start: fixture.targetUnit.start + child.start,
        returnPath: ancestors.some(ancestor => ancestor.type === 'ReturnStatement'),
      })
    })
    assert.deepEqual(telemetrySpreads, [
      { start: 8088355, returnPath: true },
      { start: 8089359, returnPath: false },
    ])
  },
)

test(
  'recovered Target120 and Target121 source declarations are the same stale preimage',
  { skip: !selected },
  () => {
    const ts = typescript()
    const roots = [
      [selectedBaselineSourceRoot(), fixture.sourceState.target120],
      [selectedSourceRoot(), fixture.sourceState.target121],
    ]
    const declarations = []
    for (const [root, expected] of roots) {
      const filename = sourceFilename(root, fixture.sourceState.path)
      const bytes = readExact(filename, expected, filename)
      const source = bytes.toString('utf8')
      assert.equal(source.length, expected.chars)
      const sourceFile = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      const declaration = sourceFile.statements.find(
        statement =>
          ts.isFunctionDeclaration(statement) &&
          statement.name?.text === fixture.sourceState.declarationName,
      )
      assert.ok(declaration)
      const start = declaration.getStart(sourceFile)
      const end = declaration.end
      const declarationText = source.slice(start, end)
      const startLocation = sourceFile.getLineAndCharacterOfPosition(start)
      const endLocation = sourceFile.getLineAndCharacterOfPosition(end)
      assert.deepEqual(
        {
          start,
          end,
          chars: declarationText.length,
          ...descriptor(declarationText),
          line: startLocation.line + 1,
          endLine: endLocation.line + 1,
        },
        expected.declaration,
      )
      declarations.push(declarationText)
      for (const [marker, count] of Object.entries(
        fixture.sourceState.staleMarkerCounts,
      )) {
        assert.equal(countOccurrences(declarationText, marker), count, marker)
      }
      for (const [marker, count] of Object.entries(
        fixture.sourceState.missingMarkerCounts,
      )) {
        assert.equal(countOccurrences(declarationText, marker), count, marker)
      }
    }
    assert.equal(declarations[0], declarations[1])
    assert.match(fixture.sourceState.declarationRelation, /byte-identical/)

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
          fixture.sourceState.path,
        ]),
        '',
      )
    }
  },
)

test(
  'the proof is static, idempotent, and removes only the two u13102 residues',
  { skip: !selected },
  async () => {
    assert.deepEqual(fixture.strictEvolution.before, {
      unsupportedUnits: 57,
      unsupportedResidues: 475,
      firstTargetIndex: 13102,
      productionResidueSha256:
        '6fede1637d9b0bbb696b033f2bc5413d8b10dee73f0d1bffead4bfaefd227061',
    })
    assert.deepEqual(fixture.strictEvolution.removes.targetIndices, [13102])
    assert.equal(fixture.strictEvolution.removes.units, 1)
    assert.equal(fixture.strictEvolution.removes.residueCount, 2)
    assert.deepEqual(
      fixture.strictEvolution.removes.residues,
      fixture.ownerResidues.strictRowsExact,
    )
    assert.deepEqual(fixture.strictEvolution.predictedAfter, {
      unsupportedUnits: 56,
      unsupportedResidues: 473,
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
      fixture.sourceReplayBlocker.reason,
      /exact Target120 declaration.*retains both.*lacks both.*No authored donor/,
    )

    const first = await import(
      `../cases/2.1.120-to-2.1.121/recovered/slash-command-content-telemetry-owner-overrides.mjs?first`
    )
    const second = await import(
      `../cases/2.1.120-to-2.1.121/recovered/slash-command-content-telemetry-owner-overrides.mjs?second`
    )
    assert.deepEqual(
      first.TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES,
      second.TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES,
    )
    assert.equal(
      Object.isFrozen(
        first.TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES[0]
          .paths,
      ),
      true,
    )
    assert.equal(
      Object.isFrozen(
        first.TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES[0]
          .declarations,
      ),
      true,
    )
  },
)
