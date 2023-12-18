import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/fleet-view-frame-child-row-owner-overrides.mjs'

const {
  TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_EVIDENCE_IDS,
  TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_OWNER_OVERRIDES,
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
    './recovery-2.1.121-fleet-view-frame-child-row-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'e6d184a40edba7ed33ac72207ada7fa5f378fa3b745dbd386311ca969af5e1e0'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
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

function exactStringSlice(source, expected, label) {
  const value = source.slice(expected.start, expected.end)
  assert.equal(value.length, expected.chars ?? expected.end - expected.start)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) assert.equal(value, expected.exact, label)
  return value
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function canonicalize(value, parent = null, key = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalize(child, value, index))
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
  return descriptor(JSON.stringify(canonicalize(node)))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
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
  return { node, source, unitStart: expected.start }
}

function mapCallbackBody(functionNode) {
  const returned = functionNode.body.body[0]
  assert.equal(returned.type, 'ReturnStatement')
  const sortCall = returned.argument
  assert.equal(sortCall.type, 'CallExpression')
  const mapCall = sortCall.arguments[0]
  assert.equal(mapCall.type, 'CallExpression')
  const callback = mapCall.arguments[0]
  assert.equal(callback.type, 'ArrowFunctionExpression')
  assert.equal(callback.body.type, 'BlockStatement')
  return callback.body.body
}

function unitCounts(node) {
  const counts = { frame: 0, sortRank: 0 }
  walk(node, candidate => {
    if (candidate.type === 'Literal' && candidate.value === 'frame') {
      counts.frame += 1
    }
    if (
      candidate.type === 'Property' &&
      !candidate.computed &&
      (candidate.key.name ?? candidate.key.value) === 'sortRank'
    ) {
      counts.sortRank += 1
    }
  })
  return counts
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function selectedTargetSourceRoot() {
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

function sourceFilename(root, selectedPath) {
  assert.ok(selectedPath.startsWith('src/'))
  return path.join(root, selectedPath.slice(4))
}

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
}

function parseTsSource(expected, root) {
  const filename = sourceFilename(root, expected.selectedPath)
  assertRealFile(filename, expected.selectedPath)
  const bytes = readExact(filename, expected, expected.selectedPath)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    expected.selectedPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    expected.selectedPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${expected.selectedPath}: parse clean`)
  return { bytes, source, sourceFile, ts }
}

function functionDeclaration(parsed, name) {
  const declaration = parsed.sourceFile.statements.find(
    node => parsed.ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.ok(declaration, `${name} declaration`)
  return declaration
}

function assertTsNode(parsed, node, expected, label) {
  assert.equal(node.getStart(parsed.sourceFile), expected.start, `${label}: start`)
  assert.equal(node.end, expected.end, `${label}: end`)
  exactStringSlice(parsed.source, expected, label)
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

function gitText(args) {
  return execFileSync('git', args, {
    cwd: gitEvidenceRepositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function assertGitFile(expected) {
  assert.equal(
    gitText(['rev-parse', `${expected.commit}:${expected.selectedPath}`]),
    expected.blob,
  )
}

test(
  'Target121 FleetView frame-row fixture and override remain fail-closed',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-static-owner-proof-source-replay-blocked')
    assert.deepEqual(
      Object.keys(ownerProofModule).sort(),
      [
        'TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_EVIDENCE_IDS',
        'TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_OWNER_OVERRIDES',
      ],
    )
    assert.deepEqual(
      [...TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.equal(TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_OWNER_OVERRIDES.length, 1)
    const override = TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_OWNER_OVERRIDES[0]
    assert.equal(override.key, `${caseName}:20909`)
    assert.equal(override.targetIndex, fixture.ownerCorrection.targetIndex)
    assert.deepEqual([...override.paths], [fixture.ownerCorrection.correctedOwner])
    assert.deepEqual([...override.declarations], [fixture.ownerCorrection.declaration])
    assert.deepEqual([...override.evidenceIds], fixture.evidenceIds)
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(fixture.generatorWiring.expectedAddedOwnerImpact, {
      units: -1,
      residues: -2,
    })
  },
)

test(
  'Target121 u20909 is exactly the Target120 decorator plus one frame branch',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_120_INNER_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
      'Target120 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target121 inner bundle',
    )
    const baseline = parseUnit(baselineBundle, fixture.baselineUnit, 'Target120 row decorator')
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target121 row decorator')
    assert.match(baseline.source, /^function xO4\(/)
    assert.match(target.source, /^function tZ4\(/)

    const baselineBody = mapCallbackBody(baseline.node)
    const targetBody = mapCallbackBody(target.node)
    assert.equal(baselineBody.length, 2)
    assert.equal(targetBody.length, 3)
    assert.equal(targetBody[0].type, 'IfStatement')
    assert.equal(
      target.unitStart + targetBody[0].start,
      fixture.wholeUnitRelation.targetAddedBranch.start,
    )
    assert.equal(
      target.unitStart + targetBody[0].end,
      fixture.wholeUnitRelation.targetAddedBranch.end,
    )
    assert.equal(
      exactBufferSlice(
        targetBundle,
        fixture.wholeUnitRelation.targetAddedBranch,
        'frame branch',
      ),
      fixture.wholeUnitRelation.targetAddedBranch.exact,
    )
    assert.equal(
      exactBufferSlice(
        targetBundle,
        fixture.wholeUnitRelation.branchSortRank,
        'frame branch sortRank',
      ),
      'sortRank',
    )

    const targetWithoutBranch = clone(target.node)
    mapCallbackBody(targetWithoutBranch).splice(0, 1)
    assert.deepEqual(
      canonicalDescriptor(baseline.node),
      expectedDescriptor(fixture.wholeUnitRelation.baselineCanonical),
    )
    assert.deepEqual(
      canonicalDescriptor(targetWithoutBranch),
      expectedDescriptor(fixture.wholeUnitRelation.targetWithoutBranchCanonical),
    )
    assert.deepEqual(canonicalize(baseline.node), canonicalize(targetWithoutBranch))
    assert.deepEqual(unitCounts(baseline.node), fixture.wholeUnitRelation.withinUnitCounts.baseline)
    assert.deepEqual(unitCounts(target.node), fixture.wholeUnitRelation.withinUnitCounts.target)

    assert.equal(fixture.addedResidues.length, 2)
    for (const residue of fixture.addedResidues) {
      const exact = exactBufferSlice(targetBundle, residue, `${residue.value} residue`)
      assert.equal(
        exact,
        residue.literalKind === 'string' ? JSON.stringify(residue.value) : residue.value,
      )
      if (residue.semanticClass === 'authentic-frame-branch') {
        assert.ok(
          residue.start >= fixture.wholeUnitRelation.targetAddedBranch.start &&
            residue.end <= fixture.wholeUnitRelation.targetAddedBranch.end,
        )
      } else {
        assert.equal(
          residue.semanticClass,
          'retained-pr-row-global-occurrence-shift-caused-by-branch-sortRank',
        )
        assert.ok(residue.start > fixture.wholeUnitRelation.targetAddedBranch.end)
      }
    }

    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
      'structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))
    const targetLedger = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    const baselineLedger = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.baselineUnitIndex,
    )
    assert.ok(targetLedger)
    assert.ok(baselineLedger)
    assert.equal(targetLedger.target.sourceHash, fixture.targetUnit.sha256)
    assert.equal(targetLedger.target.coarseHash, fixture.targetUnit.coarseHash)
    assert.equal(targetLedger.target.tokenCount, fixture.targetUnit.tokenCount)
    assert.equal(targetLedger.unknownFreeIdentifierCount, 0)
    assert.equal(baselineLedger.sourceHash, fixture.baselineUnit.sha256)
    assert.equal(baselineLedger.coarseHash, fixture.baselineUnit.coarseHash)
    assert.equal(baselineLedger.tokenCount, fixture.baselineUnit.tokenCount)
  },
)

test(
  'Target121 FleetView module boundary owns the decorator and its two consumers',
  { skip: !selected },
  () => {
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target121 inner bundle',
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
    for (const expected of fixture.moduleBoundary.adjacentUnits) {
      const region = ledger.regions.find(row => row.target.index === expected.targetIndex)
      assert.ok(region, `ledger unit ${expected.targetIndex}`)
      assert.equal(region.classification, expected.classification)
      assert.equal(region.baselineUnitIndex ?? null, expected.baselineUnitIndex)
      assert.equal(region.target.sourceHash, expected.sha256)
      assert.equal(region.target.tokenCount, expected.tokenCount)
      exactBufferSlice(targetBundle, expected, `adjacent unit ${expected.targetIndex}`)
    }

    const runtimeExpected = fixture.moduleBoundary.fleetViewRuntimeUnit
    const runtime = parseUnit(targetBundle, runtimeExpected, 'Target121 FleetView runtime')
    const calls = []
    walk(runtime.node, node => {
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'tZ4'
      ) {
        calls.push(node)
      }
    })
    assert.equal(calls.length, fixture.moduleBoundary.consumerCalls.length)
    for (let index = 0; index < calls.length; index += 1) {
      const node = calls[index]
      const expected = fixture.moduleBoundary.consumerCalls[index]
      assert.equal(runtime.unitStart + node.start, expected.start)
      assert.equal(runtime.unitStart + node.end, expected.end)
      assert.equal(
        exactBufferSlice(targetBundle, expected, `FleetView consumer ${index + 1}`),
        expected.exact,
      )
    }

    const initializer = fixture.moduleBoundary.moduleInitializer
    const initializerRegion = ledger.regions.find(
      row => row.target.index === initializer.targetIndex,
    )
    assert.ok(initializerRegion)
    assert.equal(initializerRegion.target.sourceHash, initializer.sha256)
    assert.equal(initializerRegion.target.coarseHash, initializer.coarseHash)
    parseUnit(targetBundle, initializer, 'FleetView module initializer')
  },
)

test(
  'FleetView source and job schema prove the owner while blocking partial replay',
  { skip: !selected },
  () => {
    const baselineFleetExpected = fixture.sourceStates.baseline120FleetView
    const targetFleetExpected = fixture.sourceStates.target121FleetView
    const baselineFleet = parseTsSource(baselineFleetExpected, selectedBaselineSourceRoot())
    const targetFleet = parseTsSource(targetFleetExpected, selectedTargetSourceRoot())
    assertGitFile(baselineFleetExpected)
    assertGitFile(targetFleetExpected)
    assert.equal(
      gitText(['rev-parse', `${targetFleetExpected.commit}^{tree}`]),
      targetFleetExpected.tree,
    )

    const baselineFleetView = functionDeclaration(baselineFleet, 'FleetView')
    const targetFleetView = functionDeclaration(targetFleet, 'FleetView')
    assertTsNode(
      baselineFleet,
      baselineFleetView,
      baselineFleetExpected.fleetViewDeclaration,
      'Target120 FleetView declaration',
    )
    assertTsNode(
      targetFleet,
      targetFleetView,
      targetFleetExpected.fleetViewDeclaration,
      'Target121 FleetView declaration',
    )
    exactStringSlice(
      baselineFleet.source,
      baselineFleetExpected.legacyChildRows,
      'Target120 legacy childRows',
    )
    exactStringSlice(
      targetFleet.source,
      targetFleetExpected.legacyChildRows,
      'Target121 legacy childRows',
    )
    assert.equal(
      baselineFleetExpected.legacyChildRows.sha256,
      targetFleetExpected.legacyChildRows.sha256,
      'legacy childRows stayed byte-identical',
    )
    exactStringSlice(
      targetFleet.source,
      targetFleetExpected.legacyDetailChildrenMap,
      'Target121 legacy detail child map',
    )
    for (const [needle, count] of Object.entries(targetFleetExpected.lexicalCounts)) {
      assert.equal(countOccurrences(targetFleet.source, needle), count)
    }
    for (const [name, expected] of Object.entries(
      targetFleetExpected.declarationAnchors,
    )) {
      assertTsNode(
        targetFleet,
        functionDeclaration(targetFleet, name),
        expected,
        `Target121 ${name}`,
      )
    }

    const baselineJobExpected = fixture.sourceStates.baseline120JobSchema
    const targetJobExpected = fixture.sourceStates.target121JobSchema
    const baselineJobs = parseTsSource(baselineJobExpected, selectedBaselineSourceRoot())
    const targetJobs = parseTsSource(targetJobExpected, selectedTargetSourceRoot())
    assertGitFile(baselineJobExpected)
    assertGitFile(targetJobExpected)
    exactStringSlice(
      baselineJobs.source,
      baselineJobExpected.childrenSchema,
      'Target120 job children schema',
    )
    exactStringSlice(
      targetJobs.source,
      targetJobExpected.childrenSchema,
      'Target121 job children schema',
    )
    assert.equal(
      countOccurrences(baselineJobs.source, targetJobExpected.frameEnum.exact),
      baselineJobExpected.frameEnumCount,
    )
    exactStringSlice(
      targetJobs.source,
      targetJobExpected.frameEnum,
      'Target121 pr/frame enum',
    )
    assert.match(fixture.sourceReplayBlocker.decision, /^static complete-unit/)
    assert.equal(fixture.generatorWiring.replayHelper, null)
  },
)
