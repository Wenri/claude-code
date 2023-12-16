import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_SESSION_TASK_SUMMARY_STATE_EVIDENCE_IDS,
  TARGET119_SESSION_TASK_SUMMARY_STATE_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/session-task-summary-state-owner-overrides.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const ts = require(
  path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  ),
)
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const testPath =
  'recovery/test/recovery-2.1.119-session-task-summary-state-owner-proof.test.mjs'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-session-task-summary-state-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '84e1a63798479059d2b6732522a3a2bc85eae04ed582cf8d875f8362e8def1f2'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({
  bytes: Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value),
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

function findRegion(ledger, targetIndex) {
  return [...ledger.regions, ...(ledger.unresolvedTarget ?? [])].find(
    candidate => candidate.target.index === targetIndex,
  )
}

function assertRegion(ledger, expected) {
  const region = findRegion(ledger, expected.targetIndex)
  assert.ok(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokens: region.target.tokenCount,
      sha256: region.target.sourceHash,
      ...(expected.coarseHash
        ? { coarseHash: region.target.coarseHash }
        : {}),
      ...(expected.unknownFreeIdentifierCount !== undefined
        ? { unknownFreeIdentifierCount: region.unknownFreeIdentifierCount }
        : {}),
      ...(expected.baselineUnitIndex !== undefined
        ? { baselineUnitIndex: region.baselineUnitIndex }
        : {}),
    },
    {
      classification: expected.classification,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokens: expected.tokens,
      sha256: expected.sha256,
      ...(expected.coarseHash ? { coarseHash: expected.coarseHash } : {}),
      ...(expected.unknownFreeIdentifierCount !== undefined
        ? { unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount }
        : {}),
      ...(expected.baselineUnitIndex !== undefined
        ? { baselineUnitIndex: expected.baselineUnitIndex }
        : {}),
    },
  )
  return region
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

function findSourceDeclaration(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement
    }
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations.find(
        candidate => ts.isIdentifier(candidate.name) && candidate.name.text === name,
      )
      if (declaration) return declaration
    }
  }
  assert.fail(`missing source declaration ${name}`)
}

function sourceDeclarationDescriptor(sourceFile, source, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return {
    kind: ts.SyntaxKind[node.kind],
    start,
    end,
    ...descriptor(source.slice(start, end)),
  }
}

test(
  'Target119 session task-summary fixture and override are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    readPinned(fixture.inputs.override)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetUnit.targetIndex, 20936)
    assert.deepEqual(
      TARGET119_SESSION_TASK_SUMMARY_STATE_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET119_SESSION_TASK_SUMMARY_STATE_OWNER_OVERRIDES.map(row => ({
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
  },
)

test(
  'complete authenticated class diff isolates the task-summary state machine',
  { skip: !selected },
  t => {
    const ledger = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
    )
    assertRegion(ledger, fixture.targetUnit)
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
      path.join(os.tmpdir(), 'target119-session-task-summary-diff.'),
    )
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
    const baselinePath = path.join(temporary, 'baseline.tokens')
    const targetPath = path.join(temporary, 'target.tokens')
    fs.writeFileSync(baselinePath, baseline.text)
    fs.writeFileSync(targetPath, target.text)
    const diff = spawnSync(
      'diff',
      ['--label', 'baseline', '--label', 'target', '-U1', baselinePath, targetPath],
      { encoding: 'utf8' },
    )
    assert.equal(diff.status, 1)
    assert.equal(diff.stderr, '')
    assert.deepEqual(descriptor(diff.stdout), {
      bytes: fixture.normalizedUnitProof.diff.bytes,
      sha256: fixture.normalizedUnitProof.diff.sha256,
    })
    assert.equal(
      diff.stdout.match(/^@@/gm)?.length,
      fixture.normalizedUnitProof.diff.hunks,
    )

    const baselineText = baselineUnit.toString()
    const targetText = targetUnit.toString()
    assert.equal(baselineText.includes('hasTaskSummary'), false)
    assert.equal(targetText.match(/hasTaskSummary/g)?.length, 4)
    assert.equal(targetText.includes('notifyMetadataChanged'), true)
    assert.equal(targetText.includes('task_summary'), true)
    assert.equal(targetText.includes('post_turn_summary'), true)
  },
)

test(
  'historical sessionState source pins the closed task-summary AST and needs no replay',
  { skip: !selected },
  () => {
    const sourcePath = path.join(
      sourceRoot,
      fixture.sourceOwner.path.slice('src/'.length),
    )
    const sourceBytes = fs.readFileSync(sourcePath)
    const source = sourceBytes.toString('utf8')
    assert.deepEqual(descriptor(sourceBytes), {
      bytes: fixture.sourceOwner.target.bytes,
      sha256: fixture.sourceOwner.target.sha256,
    })
    const baselineBytes = execFileSync(
      'git',
      ['show', `${fixture.sourceOwner.baselineCommit}:${fixture.sourceOwner.path}`],
      { cwd: root },
    )
    const targetBytes = execFileSync(
      'git',
      ['show', `${fixture.sourceOwner.targetCommit}:${fixture.sourceOwner.path}`],
      { cwd: root },
    )
    assert.deepEqual(descriptor(baselineBytes), {
      bytes: fixture.sourceOwner.baseline.bytes,
      sha256: fixture.sourceOwner.baseline.sha256,
    })
    assert.deepEqual(targetBytes, sourceBytes)
    for (const [commit, expected] of [
      [fixture.sourceOwner.baselineCommit, fixture.sourceOwner.baseline],
      [fixture.sourceOwner.targetCommit, fixture.sourceOwner.target],
    ]) {
      assert.equal(
        execFileSync(
          'git',
          ['rev-parse', `${commit}:${fixture.sourceOwner.path}`],
          { cwd: root, encoding: 'utf8' },
        ).trim(),
        expected.gitBlob,
      )
    }
    const sourceDiff = execFileSync(
      'git',
      [
        'diff',
        '--no-ext-diff',
        '--unified=0',
        fixture.sourceOwner.baselineCommit,
        fixture.sourceOwner.targetCommit,
        '--',
        fixture.sourceOwner.path,
      ],
      { cwd: root },
    )
    assert.deepEqual(descriptor(sourceDiff), {
      bytes: fixture.sourceOwner.diff.bytes,
      sha256: fixture.sourceOwner.diff.sha256,
    })
    assert.equal(
      sourceDiff.toString().match(/^@@/gm)?.length,
      fixture.sourceOwner.diff.hunks,
    )

    const sourceFile = ts.createSourceFile(
      sourcePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const declarations = Object.fromEntries(
      Object.keys(fixture.sourceOwner.declarations).map(name => [
        name,
        findSourceDeclaration(sourceFile, name),
      ]),
    )
    for (const [name, expected] of Object.entries(
      fixture.sourceOwner.declarations,
    )) {
      assert.deepEqual(
        sourceDeclarationDescriptor(sourceFile, source, declarations[name]),
        expected,
      )
    }
    assert.equal(
      declarations.hasTaskSummary.initializer.kind,
      ts.SyntaxKind.FalseKeyword,
    )
    const stateText = declarations.notifySessionStateChanged.getText(sourceFile)
    const metadataText =
      declarations.notifySessionMetadataChanged.getText(sourceFile)
    for (const fragment of [
      "state === 'idle' && hasTaskSummary",
      'hasTaskSummary = false',
      'notifySessionMetadataChanged({ task_summary: null })',
    ]) {
      assert.equal(stateText.includes(fragment), true, fragment)
    }
    for (const fragment of [
      "'task_summary' in metadata",
      'metadata.task_summary != null',
      'hasTaskSummary = true',
      "subtype: 'task_summary'",
      'detail: metadata.task_summary ?? null',
    ]) {
      assert.equal(metadataText.includes(fragment), true, fragment)
    }
    assert.equal(baselineBytes.toString().includes('hasTaskSummary'), false)
    assert.equal(source.match(/hasTaskSummary/g)?.length, 4)
  },
)

test(
  'owner-residue and coverage evolution accept only exact provisional or corrected state',
  { skip: !selected },
  () => {
    const report = JSON.parse(
      fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
    )
    const forUnit = rows =>
      rows.filter(row => row.structural?.index === fixture.targetUnit.targetIndex)
    const ownerRows = forUnit(report.sourceRuntimeOwnerResidueRows)
    const addedRows = forUnit(report.sourceRuntimeAddedOwnerResidueRows)
    const strictRows = forUnit(report.rows)
    const observedResidues = {
      ownerRows: ownerRows.length,
      ownerRowsWithTargetAddedSha256: canonicalDigest(
        ownerRows.map(residueWithAdded),
      ),
      addedRows: addedRows.length,
      addedRowsWithTargetAddedSha256: canonicalDigest(
        addedRows.map(residueWithAdded),
      ),
    }
    const provisional = fixture.residueEvolution.provisional
    const corrected = fixture.residueEvolution.corrected
    assert.equal(
      JSON.stringify(observedResidues) === JSON.stringify(provisional) ||
        JSON.stringify(observedResidues) === JSON.stringify(corrected),
      true,
      'u20936 report must be the exact provisional or exact owner-corrected partition',
    )
    if (JSON.stringify(observedResidues) === JSON.stringify(provisional)) {
      assert.deepEqual(addedRows.map(residueWithAdded), fixture.addedOwnerResidues)
    } else {
      assert.deepEqual(
        addedRows.map(residueWithAdded),
        fixture.productionStrictResidues,
      )
    }
    assert.equal(strictRows.length, fixture.residueEvolution.strictRows)
    assert.deepEqual(
      strictRows.map(residueWithAdded),
      fixture.productionStrictResidues,
    )
    assert.equal(
      canonicalDigest(strictRows.map(residueWithAdded)),
      fixture.residueEvolution.strictRowsWithTargetAddedSha256,
    )
    assert.equal(
      canonicalDigest(strictRows.map(canonicalResidue)),
      fixture.residueEvolution.strictResidueIdentitiesSha256,
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
    const provisionalCoverage =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.provisionalOwner.paths].sort()) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.provisionalOwner.evidenceIds)
    const correctedCoverage =
      JSON.stringify(paths) ===
        JSON.stringify([...fixture.ownerOverride.paths].sort()) &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
      row.behavior ===
        TARGET119_SESSION_TASK_SUMMARY_STATE_OWNER_OVERRIDES[0].behavior
    assert.equal(row.disposition, 'source-runtime-covered')
    assert.equal(provisionalCoverage || correctedCoverage, true)
    if (correctedCoverage) {
      const evidence = new Map(coverage.evidence.map(item => [item.id, item]))
      for (const evidenceId of fixture.evidenceIds) {
        assert.equal(evidence.get(evidenceId)?.path, testPath, evidenceId)
      }
    }
  },
)

test(
  'adjacent generated units are pinned and rejected from the standalone proof',
  { skip: !selected },
  () => {
    const ledger = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
    )
    const targetBundle = readPinned(fixture.inputs.targetBundle)
    assert.equal(fixture.adjacentUnits[0].end, fixture.targetUnit.start)
    assert.equal(fixture.targetUnit.end, fixture.adjacentUnits[1].start)
    for (const expected of fixture.adjacentUnits) {
      assertRegion(ledger, expected)
      const unit = targetBundle.subarray(expected.start, expected.end)
      assert.deepEqual(descriptor(unit), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      const text = unit.toString()
      assert.equal(text.includes('hasTaskSummary'), false, `u${expected.targetIndex}`)
      assert.equal(text.includes('task_summary'), false, `u${expected.targetIndex}`)
    }
    const report = JSON.parse(
      fs.readFileSync(path.join(root, fixture.inputs.targetReport.path)),
    )
    const adjacent = new Set(
      fixture.adjacentUnits.map(candidate => candidate.targetIndex),
    )
    assert.equal(
      report.rows.some(row => adjacent.has(row.structural?.index)),
      false,
    )
  },
)
