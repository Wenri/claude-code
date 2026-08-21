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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/session-state-internal-metadata-owner-overrides.mjs'

const {
  TARGET121_SESSION_STATE_INTERNAL_METADATA_EVIDENCE_IDS,
  TARGET121_SESSION_STATE_INTERNAL_METADATA_OWNER_OVERRIDES,
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
    './recovery-2.1.121-session-state-internal-metadata-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '6119576dc873597ab386d20e10f7d5688b7534ad376b6c35dacc8f64b9525397'

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
        (parent?.type === 'PropertyDefinition' &&
          key === 'key' &&
          !parent.computed) ||
        (parent?.type === 'MethodDefinition' &&
          key === 'key' &&
          !parent.computed) ||
        (parent?.type === 'Property' &&
          key === 'key' &&
          !parent.computed &&
          !parent.shorthand)
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
  return { node, source }
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

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function sourceFilename(root, selectedPath) {
  assert.ok(selectedPath.startsWith('src/'))
  return path.join(root, selectedPath.slice(4))
}

function parseTsSource(expected, root) {
  const filename = sourceFilename(root, expected.selectedPath)
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false)
  assert.equal(stat.isFile(), true)
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
  assert.equal(sourceFile.parseDiagnostics.length, 0, expected.selectedPath)
  return { source, sourceFile, ts }
}

function assertLedgerRegion(region, expected) {
  const usesUnitDescriptor = expected.unitStart !== undefined
  assert.equal(region.classification, 'unresolved')
  assert.equal(region.target.index, expected.targetIndex)
  assert.equal(
    region.target.nodeType,
    usesUnitDescriptor ? expected.unitNodeType : expected.nodeType,
  )
  assert.equal(
    region.target.start,
    usesUnitDescriptor ? expected.unitStart : expected.start,
  )
  assert.equal(
    region.target.end,
    usesUnitDescriptor ? expected.unitEnd : expected.end,
  )
  assert.equal(
    region.target.tokenCount,
    usesUnitDescriptor ? expected.unitTokenCount : expected.tokenCount,
  )
  assert.equal(
    region.target.sourceHash,
    usesUnitDescriptor ? expected.unitSha256 : expected.sha256,
  )
  assert.equal(
    region.target.coarseHash,
    usesUnitDescriptor ? expected.unitCoarseHash : expected.coarseHash,
  )
  assert.equal(region.unknownFreeIdentifierCount, expected.unknownFreeIdentifierCount)
}

test(
  'Target121 session-state internal-metadata owner proof exports are exact and static',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.deepEqual(
      TARGET121_SESSION_STATE_INTERNAL_METADATA_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.equal(TARGET121_SESSION_STATE_INTERNAL_METADATA_OWNER_OVERRIDES.length, 1)
    const [override] = TARGET121_SESSION_STATE_INTERNAL_METADATA_OWNER_OVERRIDES
    assert.deepEqual(
      {
        key: override.key,
        targetIndex: override.targetIndex,
        paths: override.paths,
        declarations: override.declarations,
        evidenceIds: override.evidenceIds,
      },
      {
        key: `${caseName}:21128`,
        targetIndex: 21128,
        paths: ['src/utils/sessionState.ts'],
        declarations: ['SessionStateManager'],
        evidenceIds: fixture.evidenceIds,
      },
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
  },
)

test(
  'Target121 class is exactly Target120 plus the internal metadata field and method',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_120_INNER_BUNDLE', fixture.inputs.baselineBundle),
      fixture.inputs.baselineBundle,
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const baseline = parseUnit(
      baselineBundle,
      fixture.wholeClass.baseline,
      'Target120 SessionStateManager',
    )
    const target = parseUnit(
      targetBundle,
      fixture.wholeClass.target,
      'Target121 SessionStateManager',
    )
    assertLedgerRegion(ledger.regions[21128], fixture.wholeClass.target)
    const unmatched = ledger.unmatchedBaseline.find(
      unit => unit.index === fixture.wholeClass.baseline.baselineUnitIndex,
    )
    assert.ok(unmatched)
    assert.equal(unmatched.sourceHash, fixture.wholeClass.baseline.sha256)
    assert.equal(unmatched.start, fixture.wholeClass.baseline.start)
    assert.equal(unmatched.end, fixture.wholeClass.baseline.end)

    const addedNames = new Set(
      fixture.wholeClass.addedNodes.map(node => node.name),
    )
    const actualAdded = target.node.body.body.filter(
      node => addedNames.has(node.key?.name),
    )
    assert.equal(actualAdded.length, 2)
    for (const expected of fixture.wholeClass.addedNodes) {
      const node = actualAdded.find(candidate => candidate.key.name === expected.name)
      assert.ok(node)
      assert.equal(node.type, expected.nodeType)
      exactBufferSlice(targetBundle, expected, expected.name)
    }
    target.node.body.body = target.node.body.body.filter(
      node => !addedNames.has(node.key?.name),
    )
    assert.deepEqual(
      canonicalDescriptor(baseline.node),
      expectedDescriptor(fixture.wholeClass.baselineCanonical),
    )
    assert.deepEqual(
      canonicalDescriptor(target.node),
      expectedDescriptor(fixture.wholeClass.targetWithoutAddedNodesCanonical),
    )
    for (const row of fixture.addedResidues) {
      const [kind, value, start, end] = row
      const actual = targetBundle.subarray(start, end).toString('utf8')
      assert.equal(actual, kind === 'string' ? JSON.stringify(value) : value)
    }
  },
)

test(
  'Target121 compiled consumers authenticate the complete internal-metadata flow',
  { skip: !selected },
  () => {
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
        ),
      ),
    )
    const seenUnits = new Set()
    for (const consumer of fixture.runtimeConsumers) {
      if (!seenUnits.has(consumer.targetIndex)) {
        assertLedgerRegion(ledger.regions[consumer.targetIndex], consumer)
        seenUnits.add(consumer.targetIndex)
      }
      exactBufferSlice(targetBundle, consumer, consumer.role)
    }
    assert.deepEqual([...seenUnits], [19683, 21913, 21958])
  },
)

test(
  'Target121 source proves semantics and fails closed on the stale global architecture',
  { skip: !selected },
  () => {
    const baselineRoot = path.resolve(
      process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
        path.join(
          repositoryRoot,
          '.recovery-tmp/semantic-trees/2.1.120/src',
        ),
    )
    const targetRoot = path.resolve(
      process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
        process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
    )
    const baseline = fixture.sourceStates.baselineSessionState
    const target = fixture.sourceStates.targetSessionState
    assertGitFile(baseline)
    assertGitFile(target)
    const parsedBaseline = parseTsSource(baseline, baselineRoot)
    const parsedTarget = parseTsSource(target, targetRoot)
    assert.equal(parsedBaseline.source.includes('SessionStateManager'), false)
    assert.equal(parsedTarget.source.includes('export class SessionStateManager'), false)
    for (const expected of target.nodes) {
      exactStringSlice(parsedTarget.source, expected, expected.name)
    }

    const structuredExpected = fixture.sourceStates.targetStructuredIO
    assertGitFile(structuredExpected)
    const structured = parseTsSource(structuredExpected, targetRoot)
    assert.equal(structured.source.includes('SessionStateManager'), false)
    const structuredClass = structured.sourceFile.statements.find(
      node => structured.ts.isClassDeclaration(node) && node.name?.text === 'StructuredIO',
    )
    assert.ok(structuredClass)
    const constructor = structuredClass.members.find(structured.ts.isConstructorDeclaration)
    assert.ok(constructor)
    assert.equal(constructor.parameters.length, 2)

    for (const expected of fixture.sourceStates.targetConsumerFiles) {
      assertGitFile(expected)
      const parsed = parseTsSource(expected, targetRoot)
      for (const fragment of expected.required) {
        assert.ok(parsed.source.includes(fragment), `${expected.selectedPath}: ${fragment}`)
      }
    }
    assert.match(fixture.sourceReplayBlocker.reason, /mixed global\/instance graph/)
  },
)

test(
  'Target121 frozen residue partition and expected impact remain explicit',
  { skip: !selected },
  () => {
    assert.deepEqual(
      [
        fixture.frozenSharedSnapshot.ownerRows.count,
        fixture.frozenSharedSnapshot.addedRows.count,
        fixture.frozenSharedSnapshot.rawStrictRows.count,
      ],
      [53, 4, 3],
    )
    assert.deepEqual(fixture.strictResidueIndexes, [0, 2, 3])
    assert.deepEqual(fixture.generatorWiring.expectedAddedOwnerImpact, {
      units: -1,
      residues: -4,
    })
    assert.deepEqual(fixture.generatorWiring.expectedRawStrictImpact, {
      units: -1,
      residues: -3,
    })
  },
)
