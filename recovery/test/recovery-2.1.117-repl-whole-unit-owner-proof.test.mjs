import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET117_REPL_WHOLE_UNIT_EVIDENCE_IDS,
  TARGET117_REPL_WHOLE_UNIT_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/repl-whole-unit-owner-overrides.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-repl-whole-unit-owner-proof.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '95c52f9e48938d1acc33d7fa7233d7afa77426d599bfd24b5156a52be1c1c99c'

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

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function exactSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value.toString('utf8')
}

function exactStringSlice(source, expected, label) {
  const value = source.slice(expected.start, expected.end)
  assert.equal(value.length, expected.chars ?? expected.end - expected.start)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value
}

function parseUnit(bundle, expected, label) {
  const source = exactSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { source, node: program.body[0] }
}

function walk(node, callback, parent = undefined, key = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      walk(node[index], callback, node, index)
    }
    return
  }
  if (typeof node.type === 'string') callback(node, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, callback, node, childKey)
    }
  }
}

function canonicalAst(source, expression = false) {
  const program = parse(expression ? `(${source})` : source, {
    ecmaVersion: 'latest',
  })

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

  const normalized = JSON.stringify(canonicalize(program))
  return { normalized, chars: normalized.length, ...descriptor(normalized) }
}

function semanticCounts(node) {
  const values = {
    viewerOnly: 0,
    remote: 0,
    ask: 0,
    replHydration: 0,
    messageClientPlatform: 0,
    clientPlatform: 0,
    resultDedupState: 0,
    focus: 0,
    toolUseId: 0,
  }
  walk(node, candidate => {
    if (
      candidate.type === 'MemberExpression' &&
      !candidate.computed &&
      candidate.property.type === 'Identifier' &&
      candidate.property.name in values
    ) {
      values[candidate.property.name] += 1
    }
    if (
      candidate.type === 'Property' &&
      !candidate.computed &&
      (candidate.key.name ?? candidate.key.value) in values
    ) {
      values[candidate.key.name ?? candidate.key.value] += 1
    }
    if (
      candidate.type === 'Literal' &&
      candidate.value === 'ask'
    ) {
      values.ask += 1
    }
  })
  return values
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
    process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
}

function parseReplSource(expected, filename) {
  assertRealFile(filename, expected.path)
  const bytes = readExact(filename, expected, expected.path)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    expected.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${expected.path}: parse clean`)
  const declaration = sourceFile.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'REPL',
  )
  assert.ok(declaration, `${expected.path}: REPL declaration`)
  assert.equal(declaration.getStart(sourceFile), expected.declaration.start)
  assert.equal(declaration.end, expected.declaration.end)
  const declarationSource = exactStringSlice(
    source,
    expected.declaration,
    `${expected.path}: REPL declaration`,
  )
  return { source, declarationSource, sourceFile }
}

function gitText(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function assertGitSource(expected) {
  assert.equal(gitText(['rev-parse', `${expected.commit}^{tree}`]), expected.tree)
  assert.equal(
    gitText(['rev-parse', `${expected.commit}:src/screens/REPL.tsx`]),
    expected.blob,
  )
  const bytes = execFileSync(
    'git',
    ['show', `${expected.commit}:src/screens/REPL.tsx`],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected))
}

test(
  'Target117 REPL fixture, structural units, and static override wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-static-owner-proof-source-replay-blocked')
    assert.deepEqual(
      TARGET117_REPL_WHOLE_UNIT_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET117_REPL_WHOLE_UNIT_OWNER_OVERRIDES[0], {
      key: `${caseName}:20069`,
      targetIndex: 20069,
      paths: ['src/screens/REPL.tsx'],
      declarations: ['REPL'],
      evidenceIds: fixture.evidenceIds,
      behavior: TARGET117_REPL_WHOLE_UNIT_OWNER_OVERRIDES[0].behavior,
    })
    assert.match(
      TARGET117_REPL_WHOLE_UNIT_OWNER_OVERRIDES[0].behavior,
      /viewer\/session metadata.*client-platform.*result-dedup.*static whole-unit owner proof.*never a source replay/,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET117_REPL_WHOLE_UNIT_OWNER_OVERRIDES',
    )

    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'Target117 structural ledger',
        ),
      ),
    )
    const target = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(target, 'u20069 is an authenticated unresolved structural unit')
    assert.equal(target.classification, fixture.targetUnit.classification)
    assert.equal(target.baselineUnitIndex, undefined)
    assert.deepEqual(
      {
        nodeType: target.target.nodeType,
        start: target.target.start,
        end: target.target.end,
        tokenCount: target.target.tokenCount,
        topDefinitionCount: target.target.topDefinitionCount,
        unknownFreeIdentifierCount: target.unknownFreeIdentifierCount,
        sha256: target.target.sourceHash,
        coarseHash: target.target.coarseHash,
      },
      {
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
    const baseline = ledger.unmatchedBaseline.find(
      unit => unit.index === fixture.baselineUnit.baselineIndex,
    )
    assert.ok(baseline, 'u19998 is the unique unmatched baseline REPL unit')
    assert.deepEqual(
      {
        nodeType: baseline.nodeType,
        start: baseline.start,
        end: baseline.end,
        tokenCount: baseline.tokenCount,
        topDefinitionCount: baseline.topDefinitionCount,
        sha256: baseline.sourceHash,
        coarseHash: baseline.coarseHash,
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

    assert.equal(fixture.ownerResidues.rows.length, fixture.ownerResidues.totalRows)
    assert.equal(
      fixture.ownerResidues.rows.filter(row => row.strict).length,
      fixture.ownerResidues.strictRows,
    )
    for (const [semanticClass, expected] of [
      ['authentic-target117-delta', fixture.ownerResidues.authenticDeltaRows],
      [
        'retained-global-occurrence-shift',
        fixture.ownerResidues.retainedOccurrenceShiftRows,
      ],
      ['retained-source-gap', fixture.ownerResidues.retainedSourceGapRows],
    ]) {
      assert.equal(
        fixture.ownerResidues.rows.filter(
          row => row.semanticClass === semanticClass,
        ).length,
        expected,
      )
    }
  },
)

test(
  'authenticated bundles bind the REPL delta, all owner residues, and remote transport helper graph',
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
    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineUnit,
      'Target116 REPL',
    )
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target117 REPL')
    assert.deepEqual(
      semanticCounts(baseline.node),
      fixture.withinUnitSemanticCounts.baseline,
    )
    assert.deepEqual(
      semanticCounts(target.node),
      fixture.withinUnitSemanticCounts.target,
    )
    assert.equal(countOccurrences(baseline.source, '.c('), 0)
    assert.equal(countOccurrences(target.source, '.c('), 0)

    for (const residue of fixture.ownerResidues.rows) {
      assert.ok(residue.start >= fixture.targetUnit.start)
      assert.ok(residue.end <= fixture.targetUnit.end)
      const literal = exactSlice(
        targetBundle,
        residue,
        `${residue.value} residue ${residue.targetOccurrenceNumber}`,
      )
      assert.equal(
        residue.literalKind === 'string' ? JSON.parse(literal) : literal,
        residue.value,
      )
    }

    const conditional = exactSlice(
      targetBundle,
      fixture.targetRemoteTransport.conditional,
      'Target117 active transport conditional',
    )
    assert.equal(conditional, fixture.targetRemoteTransport.conditional.exact)
    const callKinds = []
    walk(target.node, candidate => {
      if (
        candidate.type === 'CallExpression' &&
        candidate.callee.type === 'Identifier' &&
        candidate.callee.name === 'RH8'
      ) {
        callKinds.push(candidate.arguments[0].value)
      }
    })
    assert.deepEqual(callKinds, ['ssh', 'direct', 'ccr'])
    for (const expected of fixture.targetRemoteTransport.calls) {
      assert.equal(
        exactSlice(targetBundle, expected, `${expected.kind} transport call`),
        expected.exact,
      )
    }
    assert.equal(
      exactSlice(
        targetBundle,
        fixture.targetRemoteTransport.stateSyncEffect,
        'Target117 active transport state sync',
      ),
      fixture.targetRemoteTransport.stateSyncEffect.exact,
    )
    for (const expected of Object.values(fixture.targetClientPlatform)) {
      assert.equal(
        exactSlice(targetBundle, expected, 'Target117 client-platform region'),
        expected.exact,
      )
    }

    const ledger = JSON.parse(
      gunzipSync(
        fs.readFileSync(path.join(repositoryRoot, fixture.structuralLedger.path)),
      ),
    )
    for (const expected of fixture.remoteTransportHelpers) {
      const region = ledger.regions.find(
        row => row.target.index === expected.targetIndex,
      )
      assert.ok(region, `u${expected.targetIndex}: ledger region`)
      assert.deepEqual(
        {
          classification: region.classification,
          baselineUnitIndex: region.baselineUnitIndex ?? null,
          pairReason: region.pairReason ?? null,
          tokenCount: region.target.tokenCount,
          unknownFreeIdentifierCount: region.unknownFreeIdentifierCount,
          sha256: region.target.sourceHash,
          coarseHash: region.target.coarseHash,
        },
        {
          classification: expected.classification,
          baselineUnitIndex: expected.baselineUnitIndex,
          pairReason: expected.pairReason ?? null,
          tokenCount: expected.tokenCount,
          unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount,
          sha256: expected.sha256,
          coarseHash: expected.coarseHash,
        },
      )
      const parsed = parseUnit(
        targetBundle,
        expected,
        `Target117 remote helper u${expected.targetIndex}`,
      )
      assert.equal(parsed.source, expected.exact)
    }
  },
)

test(
  'both strict resultDedupState residues are retained Target116 calls under conservative AST equivalence',
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
    for (const proof of fixture.retainedResultDedup) {
      const baselineObject = exactSlice(
        baselineBundle,
        proof.baselineObject,
        `${proof.role}: baseline object`,
      )
      const targetObject = exactSlice(
        targetBundle,
        proof.targetObject,
        `${proof.role}: target object`,
      )
      const baselineCall = exactSlice(
        baselineBundle,
        proof.baselineCall,
        `${proof.role}: baseline call`,
      )
      const targetCall = exactSlice(
        targetBundle,
        proof.targetCall,
        `${proof.role}: target call`,
      )
      for (const source of [baselineObject, targetObject]) {
        assert.equal(countOccurrences(source, 'resultDedupState'), 1)
      }

      const normalizedBaselineObject = canonicalAst(baselineObject, true)
      const normalizedTargetObject = canonicalAst(targetObject, true)
      assert.equal(
        normalizedBaselineObject.normalized,
        normalizedTargetObject.normalized,
      )
      assert.deepEqual(
        {
          chars: normalizedTargetObject.chars,
          bytes: normalizedTargetObject.bytes,
          sha256: normalizedTargetObject.sha256,
        },
        proof.canonicalObject,
      )

      const normalizedBaselineCall = canonicalAst(baselineCall)
      const normalizedTargetCall = canonicalAst(targetCall)
      assert.equal(
        normalizedBaselineCall.normalized,
        normalizedTargetCall.normalized,
      )
      assert.deepEqual(
        {
          chars: normalizedTargetCall.chars,
          bytes: normalizedTargetCall.bytes,
          sha256: normalizedTargetCall.sha256,
        },
        proof.canonicalCall,
      )
    }
  },
)

test(
  'raw and packaged Target117 source stay exact while later REPL witnesses remain non-replayable',
  { skip: !selected },
  () => {
    const selectedFilename = sourceFilename(
      selectedSourceRoot(),
      fixture.sourceStates.raw117.selectedPath,
    )
    const selectedSource = parseReplSource(
      fixture.sourceStates.raw117,
      selectedFilename,
    )
    const rawEvidence = parseReplSource(
      fixture.sourceStates.raw117,
      path.join(repositoryRoot, fixture.sourceStates.raw117.path),
    )
    assert.equal(selectedSource.source, rawEvidence.source)
    assertGitSource(fixture.sourceStates.raw117)

    const rawDeclaration = rawEvidence.declarationSource
    for (const needle of fixture.sourceStates.raw117.runtimeRequiresPresent) {
      assert.equal(rawDeclaration.includes(needle), true, `raw source has ${needle}`)
    }
    for (const needle of fixture.sourceStates.raw117.runtimeRequiresAbsent) {
      assert.equal(rawDeclaration.includes(needle), false, `raw source lacks ${needle}`)
    }
    for (const [needle, expected] of Object.entries(
      fixture.sourceStates.raw117.declarationLexicalCounts,
    )) {
      assert.equal(countOccurrences(rawDeclaration, needle), expected)
    }
    const rawTransport = exactStringSlice(
      rawEvidence.source,
      fixture.sourceStates.raw117.activeRemoteTransport,
      'raw Target117 active transport',
    )
    assert.equal(rawTransport.includes('viewerOnly:'), false)
    exactStringSlice(
      rawEvidence.source,
      fixture.sourceStates.raw117.activeRemoteEffect,
      'raw Target117 active transport effect',
    )

    const laterSources = [
      fixture.sourceStates.target118Witness,
      fixture.sourceStates.target119Witness,
    ]
    const parsedLater = laterSources.map(expected => {
      const parsed = parseReplSource(
        expected,
        path.join(repositoryRoot, expected.path),
      )
      assertGitSource(expected)
      for (const [needle, count] of Object.entries(
        expected.declarationLexicalCounts,
      )) {
        assert.equal(countOccurrences(parsed.declarationSource, needle), count)
      }
      exactStringSlice(
        parsed.source,
        expected.activeRemoteEffect,
        `${expected.path}: active transport effect`,
      )
      return { expected, ...parsed }
    })
    const target118Transport = exactStringSlice(
      parsedLater[0].source,
      parsedLater[0].expected.activeRemoteTransport,
      'Target118 active transport witness',
    )
    assert.equal(target118Transport.includes('viewerOnly:'), true)
    assert.equal(target118Transport.includes('sessionId:'), false)
    const target119Transport = exactStringSlice(
      parsedLater[1].source,
      parsedLater[1].expected.activeRemoteTransport,
      'Target119 active transport witness',
    )
    assert.equal(target119Transport.includes('viewerOnly:'), true)
    assert.equal(target119Transport.includes('sessionId:'), true)
    const resultState = exactStringSlice(
      parsedLater[1].source,
      parsedLater[1].expected.resultDedupStateDeclaration,
      'Target119 result-dedup source witness',
    )
    assert.match(resultState, /reconstructResultDedupState\(initialMessages \?\? \[\]\)/)
    assert.match(
      parsedLater[1].declarationSource,
      /toolUseContext\.options\.messageClientPlatform = clientPlatform/,
    )
    assert.ok(
      parsedLater[0].expected.declaration.sha256 !==
        fixture.sourceStates.raw117.declaration.sha256,
    )
    assert.ok(
      parsedLater[1].expected.declaration.sha256 !==
        parsedLater[0].expected.declaration.sha256,
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /Target118.*viewerOnly.*Target119.*client-platform.*Neither later declaration.*exact Target117 source donor/,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
  },
)
