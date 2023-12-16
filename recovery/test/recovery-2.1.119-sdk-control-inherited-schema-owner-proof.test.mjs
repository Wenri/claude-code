import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_SDK_CONTROL_INHERITED_SCHEMA_EVIDENCE_IDS,
  TARGET119_SDK_CONTROL_INHERITED_SCHEMA_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/sdk-control-inherited-schema-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const testPath =
  'recovery/test/recovery-2.1.119-sdk-control-inherited-schema-owner-proof.test.mjs'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-sdk-control-inherited-schema-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '9ab15cac8f93fd21a0b40b59f1b78302029d2535c620592b302952b803ea738d'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({
  bytes: Buffer.byteLength(value),
  sha256: sha256(value),
})
const canonicalDigest = value => sha256(Buffer.from(JSON.stringify(value)))

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function tokenValue(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'num' || token.type.label === 'string') {
    return `${token.type.label}:${JSON.stringify(token.value)}`
  }
  if (token.type.label === 'regexp') {
    return `regexp:/${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function normalizedTokens(value) {
  const tokens = []
  const stream = tokenizer(value.toString(), { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    tokens.push(token)
  }
  return {
    tokens,
    text: `${tokens.map(tokenValue).join('\n')}\n`,
  }
}

function canonicalResidue(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ]
}

function residueWithAdded(row) {
  return [...canonicalResidue(row), row.targetAdded]
}

test('Target119 SDK-control inherited-schema fixture and override are frozen', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readPinned(fixture.inputs.override)
  assert.equal(fixture.case, caseName)
  assert.equal(fixture.targetUnit.targetIndex, 20928)
  assert.deepEqual(
    TARGET119_SDK_CONTROL_INHERITED_SCHEMA_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_SDK_CONTROL_INHERITED_SCHEMA_OWNER_OVERRIDES.map(row => ({
      key: row.key,
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    [
      {
        key: `${caseName}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: fixture.ownerOverride.paths,
        declarations: fixture.ownerOverride.declarations,
        evidenceIds: fixture.evidenceIds,
        behavior: fixture.ownerBehavior,
      },
    ],
  )
  assert.deepEqual(
    fixture.evidenceCatalog.map(item => item.id),
    fixture.evidenceIds,
  )
  assert.ok(fixture.evidenceCatalog.every(item => item.path === testPath))
  assert.equal(
    canonicalDigest([fixture.targetUnit.targetIndex]),
    fixture.summary.targetIndicesSha256,
  )
  assert.equal(fixture.sourceReplay.authorized, false)
})

test('complete unit diff isolates Target119 changes and retains six inherited schema rows', { skip: !selected }, t => {
  const structural = JSON.parse(
    gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
  )
  const region = [...structural.regions, ...structural.unresolvedTarget].find(
    row => row.target.index === fixture.targetUnit.targetIndex,
  )
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokens: region.target.tokenCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
      unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
    },
    {
      classification: fixture.targetUnit.classification,
      nodeType: fixture.targetUnit.nodeType,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      bytes: fixture.targetUnit.bytes,
      tokens: fixture.targetUnit.tokens,
      sha256: fixture.targetUnit.sha256,
      coarseHash: fixture.targetUnit.coarseHash,
      unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
    },
  )
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const baselineUnit = baselineBundle.subarray(
    fixture.baselineUnit.start,
    fixture.baselineUnit.end,
  )
  const targetUnit = targetBundle.subarray(
    fixture.targetUnit.start,
    fixture.targetUnit.end,
  )
  assert.deepEqual(descriptor(baselineUnit), {
    bytes: fixture.baselineUnit.bytes,
    sha256: fixture.baselineUnit.sha256,
  })
  assert.deepEqual(descriptor(targetUnit), {
    bytes: fixture.targetUnit.bytes,
    sha256: fixture.targetUnit.sha256,
  })
  const baseline = normalizedTokens(baselineUnit)
  const target = normalizedTokens(targetUnit)
  for (const [label, actual, expected] of [
    ['baseline', baseline, fixture.normalizedUnitProof.baseline],
    ['target', target, fixture.normalizedUnitProof.target],
  ]) {
    assert.equal(actual.tokens.length, expected.tokens, label)
    assert.deepEqual(descriptor(actual.text), {
      bytes: expected.bytes,
      sha256: expected.sha256,
    })
  }
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target119-sdk-control-unit-diff.'),
  )
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const baselinePath = path.join(temporary, 'baseline.tokens')
  const targetPath = path.join(temporary, 'target.tokens')
  fs.writeFileSync(baselinePath, baseline.text)
  fs.writeFileSync(targetPath, target.text)
  const unitDiff = spawnSync(
    'diff',
    ['--label', 'baseline', '--label', 'target', '-U1', baselinePath, targetPath],
    { encoding: 'utf8' },
  )
  assert.equal(unitDiff.status, 1)
  assert.equal(unitDiff.stderr, '')
  assert.deepEqual(descriptor(unitDiff.stdout), {
    bytes: fixture.normalizedUnitProof.diff.bytes,
    sha256: fixture.normalizedUnitProof.diff.sha256,
  })
  assert.equal(
    unitDiff.stdout.match(/^@@/gm)?.length,
    fixture.normalizedUnitProof.diff.hunks,
  )
  for (const value of fixture.normalizedUnitProof.diff.retainedValuesAbsent) {
    assert.equal(unitDiff.stdout.includes(value), false, value)
    assert.equal(baselineUnit.toString().includes(value), true, `baseline ${value}`)
    assert.equal(targetUnit.toString().includes(value), true, `target ${value}`)
  }

  const graph = fixture.forwardSubagentRuntimeGraph
  const occurrences = bundle =>
    [...bundle.toString().matchAll(new RegExp(graph.value, 'g'))].map(match =>
      match.index,
    )
  assert.equal(occurrences(baselineBundle).length, graph.baselineCount)
  const targetOccurrences = occurrences(targetBundle)
  assert.equal(targetOccurrences.length, graph.targetCount)
  const units = [...structural.regions, ...structural.unresolvedTarget]
  const mapped = targetOccurrences.map(start => {
    const owner = units.find(
      candidate => candidate.target.start <= start && start < candidate.target.end,
    )
    assert.ok(owner, start)
    return [start, owner.target.index]
  })
  assert.deepEqual(mapped, graph.occurrences)
  assert.deepEqual([...new Set(mapped.map(row => row[1]))], graph.unitIndices)
  assert.equal(
    targetOccurrences[graph.schemaOccurrence.ordinal - 1],
    graph.schemaOccurrence.start,
  )
})

test('predecessor replay authenticates inherited schemas while exact Target119 source blocks partial replay', { skip: !selected }, () => {
  readPinned(fixture.inputs.target118ReplayHelper)
  const predecessor = JSON.parse(readPinned(fixture.inputs.target118ReplayFixture))
  assert.equal(predecessor.targetUnit.targetIndex, fixture.baselineUnit.targetIndex)
  assert.deepEqual(
    {
      start: predecessor.targetUnit.start,
      end: predecessor.targetUnit.end,
      bytes: predecessor.targetUnit.bytes,
      tokens: predecessor.targetUnit.tokenCount,
      sha256: predecessor.targetUnit.sourceHash,
      coarseHash: predecessor.targetUnit.coarseHash,
    },
    {
      start: fixture.baselineUnit.start,
      end: fixture.baselineUnit.end,
      bytes: fixture.baselineUnit.bytes,
      tokens: fixture.baselineUnit.tokens,
      sha256: fixture.baselineUnit.sha256,
      coarseHash: fixture.baselineUnit.coarseHash,
    },
  )
  assert.deepEqual(
    predecessor.sourceReplay.contracts,
    fixture.inheritedReplayContracts,
  )
  for (const residue of fixture.addedOwnerResidues.slice(1)) {
    const value = residue[2]
    assert.equal(
      predecessor.sourceReplay.contracts.some(contract =>
        [...contract.properties, ...contract.literals].includes(value),
      ),
      true,
      value,
    )
  }

  const sourcePath = path.join(
    sourceRoot,
    fixture.historicalSource.path.replace(/^src\//, ''),
  )
  const sourceBytes = fs.readFileSync(sourcePath)
  assert.deepEqual(descriptor(sourceBytes), {
    bytes: fixture.historicalSource.bytes,
    sha256: fixture.historicalSource.sha256,
  })
  const historicalBytes = execFileSync(
    'git',
    [
      'show',
      `${fixture.historicalSource.commit}:${fixture.historicalSource.path}`,
    ],
    { cwd: root },
  )
  assert.deepEqual(descriptor(historicalBytes), descriptor(sourceBytes))
  const treeRow = execFileSync(
    'git',
    ['ls-tree', fixture.historicalSource.commit, fixture.historicalSource.path],
    { cwd: root, encoding: 'utf8' },
  ).trim()
  assert.match(
    treeRow,
    new RegExp(`^100644 blob ${fixture.historicalSource.gitBlob}\\t`),
  )
  const source = sourceBytes.toString()
  for (const declaration of fixture.historicalSource.missingDeclarations) {
    assert.equal(source.includes(declaration), false, declaration)
  }
  assert.equal(source.includes(fixture.historicalSource.missingGraphValue), false)
})

test('owner partition and coverage evolve only as one complete static proof', { skip: !selected }, () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
  )
  const ownerRows = report.sourceRuntimeOwnerResidueRows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  const addedRows = report.sourceRuntimeAddedOwnerResidueRows.filter(
    row => row.structural.index === fixture.targetUnit.targetIndex,
  )
  assert.equal(ownerRows.length, fixture.summary.ownerRows)
  assert.equal(addedRows.length, fixture.summary.addedOwnerRows)
  assert.equal(
    canonicalDigest(ownerRows.map(residueWithAdded)),
    fixture.summary.ownerRowsWithTargetAddedSha256,
  )
  assert.equal(
    canonicalDigest(addedRows.map(residueWithAdded)),
    fixture.summary.addedRowsWithTargetAddedSha256,
  )
  assert.deepEqual(addedRows.map(canonicalResidue), fixture.addedOwnerResidues)
  assert.equal(
    canonicalDigest(fixture.addedOwnerResidues),
    fixture.summary.addedOwnerResidueIdentitiesSha256,
  )

  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join(root, fixture.inputs.targetCoverage.path)),
    ),
  )
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
  )
  assert.ok(row)
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const paths = row.ownerIds.map(id => owners.get(id)).sort()
  const expectedPaths = [...fixture.ownerOverride.paths].sort()
  const provisional =
    JSON.stringify(paths) === JSON.stringify(expectedPaths) &&
    JSON.stringify(row.evidenceIds) ===
      JSON.stringify(['source-map-attribution', 'semantic-test'])
  const corrected =
    JSON.stringify(paths) === JSON.stringify(expectedPaths) &&
    JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
    row.behavior ===
      TARGET119_SDK_CONTROL_INHERITED_SCHEMA_OWNER_OVERRIDES[0].behavior
  assert.equal(row.disposition, 'source-runtime-covered')
  assert.equal(provisional || corrected, true)
  if (corrected) {
    const evidence = new Map(coverage.evidence.map(item => [item.id, item]))
    for (const evidenceId of fixture.evidenceIds) {
      assert.equal(evidence.get(evidenceId)?.path, testPath, evidenceId)
    }
  }
})
