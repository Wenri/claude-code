import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.116-to-2.1.117/recovered/main-entrypoint-whole-unit-owner-overrides.mjs'

const {
  TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS,
  TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const packageSourceRoot = process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-main-entrypoint-whole-unit-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '16fc840a14057d50b91d5a0231dfaea54eeb0a33f3fa984160943993b25c90ce'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

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

function exactSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value.toString('utf8')
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function walk(node, visit, parent = undefined, key = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      walk(node[index], visit, node, index)
    }
    return
  }
  if (typeof node.type === 'string') visit(node, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, visit, node, childKey)
    }
  }
}

function propertyName(node) {
  return node.key?.name ?? node.key?.value
}

function canonicalAst(node) {
  function canonicalize(value, parent = undefined, key = undefined) {
    if (Array.isArray(value)) {
      return value.map((child, index) => canonicalize(child, value, index))
    }
    if (value === null || typeof value !== 'object') return value
    const result = {}
    for (const [childKey, child] of Object.entries(value)) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
      if (value.type === 'Identifier' && childKey === 'name') {
        const retain =
          (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
          (parent?.type === 'MemberExpression' &&
            key === 'property' &&
            !parent.computed) ||
          (parent?.type === 'MethodDefinition' &&
            key === 'key' &&
            !parent.computed)
        result[childKey] = retain ? child : '@id'
      } else {
        result[childKey] = canonicalize(child, value, childKey)
      }
    }
    return result
  }
  return JSON.stringify(canonicalize(node))
}

function parseUnit(bundle, expected, label) {
  const source = exactSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { source, node: program.body[0] }
}

function normalizedTokens(source) {
  const program = parse(source, { ecmaVersion: 'latest' })
  const preservedIdentifierStarts = new Set()
  const buildLiteralStarts = new Set()
  walk(program, (node, parent, key) => {
    if (node.type === 'Identifier') {
      const retain =
        (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed) ||
        (parent?.type === 'MethodDefinition' &&
          key === 'key' &&
          !parent.computed) ||
        (parent?.type === 'LabeledStatement' && key === 'label') ||
        (parent?.type === 'BreakStatement' && key === 'label') ||
        (parent?.type === 'ContinueStatement' && key === 'label')
      if (retain) preservedIdentifierStarts.add(node.start)
    }
    if (
      node.type === 'Property' &&
      !node.computed &&
      ['VERSION', 'BUILD_TIME', 'GIT_SHA'].includes(propertyName(node))
    ) {
      assert.equal(node.value.type, 'Literal')
      assert.equal(typeof node.value.value, 'string')
      buildLiteralStarts.add(node.value.start)
    }
  })

  const tokens = [...tokenizer(source, { ecmaVersion: 'latest' })].map(token => {
    let key
    if (token.type.label === 'name') {
      key = preservedIdentifierStarts.has(token.start)
        ? `name:${token.value}`
        : 'name:@id'
    } else if (buildLiteralStarts.has(token.start)) {
      key = 'string:<BUILD>'
    } else {
      key = `${token.type.label}:${JSON.stringify(
        token.value ?? token.type.label,
      )}`
    }
    return {
      start: token.start,
      end: token.end,
      key,
    }
  })
  return {
    tokens,
    buildMetadataProperties: buildLiteralStarts.size,
  }
}

function findSyncRun(
  baseline,
  target,
  baselineIndex,
  targetIndex,
  syncRunLength,
  maxLookahead,
) {
  let best = null
  for (
    let baselineDelta = 0;
    baselineDelta <= maxLookahead && baselineIndex + baselineDelta < baseline.length;
    baselineDelta += 1
  ) {
    for (
      let targetDelta = 0;
      targetDelta <= maxLookahead && targetIndex + targetDelta < target.length;
      targetDelta += 1
    ) {
      if (best && baselineDelta + targetDelta > best.score) continue
      let matches = true
      for (let offset = 0; offset < syncRunLength; offset += 1) {
        if (
          baseline[baselineIndex + baselineDelta + offset]?.key !==
          target[targetIndex + targetDelta + offset]?.key
        ) {
          matches = false
          break
        }
      }
      if (!matches) continue
      const candidate = {
        baselineDelta,
        targetDelta,
        score: baselineDelta + targetDelta,
      }
      if (
        !best ||
        candidate.score < best.score ||
        (candidate.score === best.score &&
          candidate.baselineDelta < best.baselineDelta)
      ) {
        best = candidate
      }
    }
  }
  return best
}

function tokenEditHunks(baseline, target, proof) {
  let baselineIndex = 0
  let targetIndex = 0
  const hunks = []
  while (baselineIndex < baseline.length && targetIndex < target.length) {
    if (baseline[baselineIndex].key === target[targetIndex].key) {
      baselineIndex += 1
      targetIndex += 1
      continue
    }
    const sync = findSyncRun(
      baseline,
      target,
      baselineIndex,
      targetIndex,
      proof.syncRunLength,
      proof.maxLookahead,
    )
    assert.ok(sync, 'every edit reaches a bounded synchronization run')
    hunks.push([
      baselineIndex,
      baselineIndex + sync.baselineDelta,
      targetIndex,
      targetIndex + sync.targetDelta,
    ])
    baselineIndex += sync.baselineDelta
    targetIndex += sync.targetDelta
  }
  if (baselineIndex < baseline.length || targetIndex < target.length) {
    hunks.push([
      baselineIndex,
      baseline.length,
      targetIndex,
      target.length,
    ])
  }
  return hunks
}

function transcript(hunks, baseline, target, baselineLength, targetLength) {
  return hunks.map(([baselineStart, baselineEnd, targetStart, targetEnd]) => [
    baselineStart,
    baselineEnd,
    targetStart,
    targetEnd,
    baseline[baselineStart]?.start ?? baselineLength,
    baselineEnd > baselineStart
      ? baseline[baselineEnd - 1].end
      : baseline[baselineStart]?.start ?? baselineLength,
    target[targetStart]?.start ?? targetLength,
    targetEnd > targetStart
      ? target[targetEnd - 1].end
      : target[targetStart]?.start ?? targetLength,
  ])
}

function tupleDescriptor(rows) {
  const mapped = rows.map(row => row.slice(0, 7))
  return { rows: mapped.length, ...descriptor(JSON.stringify(mapped)) }
}

function decodeRow(raw, kind) {
  return kind === 'string' ? JSON.parse(raw) : raw
}

function gitBytes(commit, sourcePath) {
  return execFileSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
  })
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function assertSource(bytes, expected, label) {
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars, `${label}: UTF-16 length`)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    expected.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${label}: parses`)
  const declarations = []
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === expected.runDeclaration.name
    ) {
      declarations.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.equal(declarations.length, 1, `${label}: one run declaration`)
  const run = declarations[0]
  assert.equal(ts.SyntaxKind[run.kind], expected.runDeclaration.nodeType)
  assert.deepEqual(
    [run.getStart(sourceFile), run.end],
    [expected.runDeclaration.start, expected.runDeclaration.end],
  )
  const runSlice = Buffer.from(
    source.slice(run.getStart(sourceFile), run.end),
  )
  assert.deepEqual(
    descriptor(runSlice),
    expectedDescriptor(expected.runDeclaration),
  )
  for (const [marker, count] of Object.entries(expected.missingMarkerCounts)) {
    assert.equal(source.split(marker).length - 1, count, `${label}: ${marker}`)
  }
}

test(
  '2.1.117 main-entrypoint fixture exposes one static whole-unit override',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      addedOwnerRows: 17,
      retainedCorrespondenceRows: 6,
      runtimeAddedRows: 5,
      buildMetadataRows: 6,
      completeTokenEditHunks: 17,
      ownerOverrides: 1,
      sourceReplayHelpers: 0,
    })
    readExact(
      path.join(repositoryRoot, fixture.ownerOverride.path),
      fixture.ownerOverride,
      'owner override module',
    )
    assert.deepEqual(
      TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES, [
      {
        key: `${caseName}:20785`,
        targetIndex: 20785,
        paths: ['src/main.tsx'],
        declarations: ['run'],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_EVIDENCE_IDS',
      'TARGET117_MAIN_ENTRYPOINT_WHOLE_UNIT_OWNER_OVERRIDES',
    ])
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.match(fixture.sourceReplayBlocker.reason, /partial insertion.*overstate/)
  },
)

test(
  'authenticated run units have one changed statement and a complete 17-hunk edit proof',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_116_INNER_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'Target116 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 inner bundle',
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const targetLedger = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetLedger)
    assert.deepEqual(
      {
        classification: targetLedger.classification,
        baselineUnitIndex: targetLedger.baselineUnitIndex ?? null,
        nodeType: targetLedger.target.nodeType,
        start: targetLedger.target.start,
        end: targetLedger.target.end,
        tokenCount: targetLedger.target.tokenCount,
        topDefinitionCount: targetLedger.target.topDefinitionCount,
        unknownFreeIdentifierCount: targetLedger.unknownFreeIdentifierCount,
        sha256: targetLedger.target.sourceHash,
        coarseHash: targetLedger.target.coarseHash,
      },
      {
        classification: fixture.targetUnit.classification,
        baselineUnitIndex: fixture.targetUnit.baselineUnitIndex,
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
        sha256: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
      },
    )
    const baselineLedger = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.baselineIndex,
    )
    assert.ok(baselineLedger)
    assert.deepEqual(
      {
        nodeType: baselineLedger.nodeType,
        start: baselineLedger.start,
        end: baselineLedger.end,
        tokenCount: baselineLedger.tokenCount,
        topDefinitionCount: baselineLedger.topDefinitionCount,
        sha256: baselineLedger.sourceHash,
        coarseHash: baselineLedger.coarseHash,
      },
      {
        nodeType: fixture.baselineUnit.nodeType,
        start: fixture.baselineUnit.start,
        end: fixture.baselineUnit.end,
        tokenCount: fixture.baselineUnit.tokenCount,
        topDefinitionCount: fixture.baselineUnit.topDefinitionCount,
        sha256: fixture.baselineUnit.sha256,
        coarseHash: fixture.baselineUnit.coarseHash,
      },
    )

    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineUnit,
      'Target116 run unit',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target117 run unit',
    )
    const topLevel = fixture.topLevelStatementProof
    assert.equal(baseline.node.body.body.length, topLevel.statementCount)
    assert.equal(target.node.body.body.length, topLevel.statementCount)
    const baselineStatementHashes = baseline.node.body.body.map(statement =>
      sha256(canonicalAst(statement)),
    )
    const targetStatementHashes = target.node.body.body.map(statement =>
      sha256(canonicalAst(statement)),
    )
    const changed = baselineStatementHashes
      .map((hash, index) => (hash === targetStatementHashes[index] ? null : index))
      .filter(index => index !== null)
    assert.deepEqual(changed, [topLevel.soleChangedStatementIndex])
    const commonHashes = baselineStatementHashes.filter(
      (_hash, index) => index !== topLevel.soleChangedStatementIndex,
    )
    assert.deepEqual(
      descriptor(JSON.stringify(commonHashes)),
      topLevel.commonCanonicalHashList,
    )
    exactSlice(
      baselineBundle,
      topLevel.baselineChangedStatement,
      'baseline changed statement',
    )
    exactSlice(
      targetBundle,
      topLevel.targetChangedStatement,
      'target changed statement',
    )

    const proof = fixture.normalizedTokenProof
    const normalizedBaseline = normalizedTokens(baseline.source)
    const normalizedTarget = normalizedTokens(target.source)
    assert.equal(normalizedBaseline.tokens.length, proof.baselineTokens)
    assert.equal(normalizedTarget.tokens.length, proof.targetTokens)
    assert.equal(
      normalizedBaseline.buildMetadataProperties,
      proof.buildMetadataPropertiesPerUnit,
    )
    assert.equal(
      normalizedTarget.buildMetadataProperties,
      proof.buildMetadataPropertiesPerUnit,
    )
    assert.deepEqual(
      descriptor(JSON.stringify(normalizedBaseline.tokens.map(token => token.key))),
      proof.baselineNormalizedTokenArray,
    )

    const hunks = tokenEditHunks(
      normalizedBaseline.tokens,
      normalizedTarget.tokens,
      proof,
    )
    assert.equal(hunks.length, proof.hunks.length)
    const actualTranscript = transcript(
      hunks,
      normalizedBaseline.tokens,
      normalizedTarget.tokens,
      baseline.source.length,
      target.source.length,
    )
    assert.deepEqual(
      descriptor(JSON.stringify(actualTranscript)),
      proof.editTranscript,
    )
    assert.deepEqual(
      hunks,
      proof.hunks.map(hunk => [
        ...hunk.baselineTokens,
        ...hunk.targetTokens,
      ]),
    )
    for (let index = 0; index < proof.hunks.length; index += 1) {
      const expected = proof.hunks[index]
      exactSlice(
        baselineBundle,
        expected.baseline,
        `${expected.id}: baseline edit`,
      )
      exactSlice(targetBundle, expected.target, `${expected.id}: target edit`)
      assert.deepEqual(actualTranscript[index].slice(4), [
        expected.baseline.start - fixture.baselineUnit.start,
        expected.baseline.end - fixture.baselineUnit.start,
        expected.target.start - fixture.targetUnit.start,
        expected.target.end - fixture.targetUnit.start,
      ])
    }

    const reconstructed = normalizedTarget.tokens.map(token => token.key)
    for (let index = hunks.length - 1; index >= 0; index -= 1) {
      const [baselineStart, baselineEnd, targetStart, targetEnd] = hunks[index]
      reconstructed.splice(
        targetStart,
        targetEnd - targetStart,
        ...normalizedBaseline.tokens
          .slice(baselineStart, baselineEnd)
          .map(token => token.key),
      )
    }
    assert.deepEqual(
      reconstructed,
      normalizedBaseline.tokens.map(token => token.key),
      'the pinned hunks explain every normalized token difference',
    )
  },
)

test(
  'all 17 added-owner rows are authenticated as retained, runtime-added, or metadata',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_116_INNER_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'Target116 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 inner bundle',
    )
    const rows = fixture.ownerResidues.rows
    assert.deepEqual(tupleDescriptor(rows), fixture.ownerResidues.addedOwnerRows)
    assert.deepEqual(
      tupleDescriptor(rows.filter(row => row[7] === 'build-metadata')),
      fixture.ownerResidues.legacyStrictRows,
    )
    for (const [classification, expected] of [
      ['retained-correspondence', fixture.summary.retainedCorrespondenceRows],
      ['runtime-added', fixture.summary.runtimeAddedRows],
      ['build-metadata', fixture.summary.buildMetadataRows],
    ]) {
      assert.equal(
        rows.filter(row => row[7] === classification).length,
        expected,
      )
    }

    const runtimeHunks = fixture.normalizedTokenProof.hunks.filter(hunk =>
      [
        'thinking-summary-settings-default',
        'model-settings-source-telemetry',
        'bridge-skip-next-archive-default',
      ].includes(hunk.id),
    )
    for (const row of rows) {
      const targetRaw = targetBundle
        .subarray(row[2], row[3])
        .toString('utf8')
      assert.equal(decodeRow(targetRaw, row[0]), row[1])
      if (row[7] === 'retained-correspondence') {
        assert.notEqual(row[8], null)
        const baselineRaw = baselineBundle
          .subarray(row[8], row[8] + (row[3] - row[2]))
          .toString('utf8')
        assert.equal(baselineRaw, targetRaw, `${row[1]} exact paired token`)
      } else if (row[7] === 'runtime-added') {
        assert.equal(row[8], null)
        assert.ok(
          runtimeHunks.some(
            hunk => row[2] >= hunk.target.start && row[3] <= hunk.target.end,
          ),
          `${row[1]} is contained by an authenticated runtime hunk`,
        )
      } else {
        assert.notEqual(row[8], null)
        assert.match(
          baselineBundle
            .subarray(row[8], row[8] + (row[3] - row[2]))
            .toString('utf8'),
          /^"(?:2\.1\.116|2026-04-20T13:57:26Z|9e176d)/,
        )
      }
    }
  },
)

test(
  'the exact Target117 main source and every reachable main history revision fail closed for replay',
  { skip: !selected },
  () => {
    const source = fixture.sourceReplayBlocker
    assert.equal(
      execFileSync('git', ['rev-parse', `${source.commit}^{tree}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      source.tree,
    )
    const line = execFileSync('git', ['ls-tree', source.commit, source.path], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim()
    assert.equal(line.split(/\s+/)[2], source.blob)
    assertSource(gitBytes(source.commit, source.path), source, 'raw Target117 main')

    const revisions = [
      ...new Set(
        execFileSync('git', ['log', '--all', '--format=%H', '--', source.path], {
          cwd: repositoryRoot,
          encoding: 'utf8',
        })
          .trim()
          .split('\n')
          .filter(Boolean),
      ),
    ]
    assert.equal(revisions.length, source.mainHistoryRevisions)
    for (const revision of revisions) {
      const candidate = gitBytes(revision, source.path).toString('utf8')
      for (const marker of source.historyMissingMarkers) {
        assert.equal(
          candidate.includes(marker),
          false,
          `${revision}: no unauthenticated ${marker} donor`,
        )
      }
    }
    for (const witness of source.laterWitnesses) {
      const bytes = gitBytes(witness.commit, source.path)
      assert.deepEqual(descriptor(bytes), expectedDescriptor(witness))
      const text = bytes.toString('utf8')
      assert.equal(
        text.split('thinkingDisplay').length - 1,
        witness.thinkingDisplay,
      )
      assert.equal(
        text.split('showThinkingSummaries').length - 1,
        witness.showThinkingSummaries,
      )
      const witnessLine = execFileSync(
        'git',
        ['ls-tree', witness.commit, source.path],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim()
      assert.equal(witnessLine.split(/\s+/)[2], witness.blob)
    }
  },
)

test(
  'packaged Target117 main remains the exact blocked historical source snapshot',
  { skip: !selected || !packageSourceRoot },
  () => {
    const source = fixture.sourceReplayBlocker
    const filename = path.resolve(packageSourceRoot, source.path.slice(4))
    assert.ok(filename.startsWith(`${path.resolve(packageSourceRoot)}${path.sep}`))
    const status = fs.lstatSync(filename)
    assert.equal(status.isSymbolicLink(), false)
    assert.equal(status.isFile(), true)
    assertSource(fs.readFileSync(filename), source, 'packaged Target117 main')
  },
)
