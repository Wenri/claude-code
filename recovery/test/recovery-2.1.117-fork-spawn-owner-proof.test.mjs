import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET117_FORK_SPAWN_EVIDENCE_IDS,
  TARGET117_FORK_SPAWN_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/fork-spawn-owner-overrides.mjs'

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-fork-spawn-owner-proof.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '97e6f9850855e4902020304482d72040b1ed24397c6c2e52af2c3502cf9d5c48'

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

function canonicalAst(source) {
  const program = parse(source, { ecmaVersion: 'latest' })

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
  return {
    normalized,
    chars: normalized.length,
    ...descriptor(normalized),
  }
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

function replaceExactlyOnce(input, before, after, label) {
  const first = input.indexOf(before)
  assert.ok(first >= 0, `${label}: anchor exists`)
  assert.equal(
    input.indexOf(before, first + before.length),
    -1,
    `${label}: anchor is unique`,
  )
  return input.slice(0, first) + after + input.slice(first + before.length)
}

function deriveBoundedCandidate(source) {
  let output = source
  output = replaceExactlyOnce(
    output,
    '  const rootSetAppState = context.setAppStateForTasks ?? context.setAppState',
    '  const { taskRegistry } = context',
    'task registry destructure',
  )
  output = replaceExactlyOnce(
    output,
    '    setAppState: rootSetAppState,',
    '    taskRegistry,',
    'registerAsyncAgent registry',
  )
  output = replaceExactlyOnce(
    output,
    [
      '  rootSetAppState(previous => {',
      '    const agentNameRegistry = new Map(previous.agentNameRegistry)',
      '    agentNameRegistry.set(name, asAgentId(agentId))',
      '    return { ...previous, agentNameRegistry }',
      '  })',
    ].join('\n'),
    '  context.agentLifecycle.registerName(name, asAgentId(agentId))',
    'agent lifecycle registration',
  )
  output = replaceExactlyOnce(
    output,
    '            description,\n            name,',
    '            description,',
    'later runAgent name',
  )
  output = replaceExactlyOnce(
    output,
    '        rootSetAppState,',
    '        taskRegistry,',
    'async lifecycle registry',
  )
  return output
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

test(
  'Target117 fork spawn fixture and static override wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-static-owner-proof-source-replay-blocked')
    assert.deepEqual(TARGET117_FORK_SPAWN_EVIDENCE_IDS, fixture.evidenceIds)
    assert.equal(TARGET117_FORK_SPAWN_OWNER_OVERRIDES.length, 1)
    assert.deepEqual(TARGET117_FORK_SPAWN_OWNER_OVERRIDES[0], {
      key: `${caseName}:17725`,
      targetIndex: 17725,
      paths: ['src/commands/fork/fork.ts'],
      declarations: ['spawnFork'],
      evidenceIds: fixture.evidenceIds,
      behavior: TARGET117_FORK_SPAWN_OWNER_OVERRIDES[0].behavior,
    })
    assert.match(
      TARGET117_FORK_SPAWN_OWNER_OVERRIDES[0].behavior,
      /agentLifecycle.*taskRegistry.*static whole-unit owner proof.*never a partial source replay/,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET117_FORK_SPAWN_OWNER_OVERRIDES',
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
    assert.ok(target, 'u17725 remains an authenticated unresolved structural unit')
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

    const target118Ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.target118StructuralLedger.path),
          fixture.target118StructuralLedger,
          'Target118 structural ledger',
        ),
      ),
    )
    const later = target118Ledger.unresolvedTarget.find(
      row => row.target.index === fixture.target118TemporalLineage.targetIndex,
    )
    assert.ok(later, 'Target118 temporal donor is independently unresolved')
    assert.equal(later.classification, fixture.target118TemporalLineage.classification)
    assert.equal(later.target.sourceHash, fixture.target118TemporalLineage.sha256)
    assert.equal(later.target.coarseHash, fixture.target118TemporalLineage.coarseHash)
    assert.equal(
      later.unknownFreeIdentifierCount,
      fixture.target118TemporalLineage.unknownFreeIdentifierCount,
    )

    assert.equal(fixture.ownerResidues.rows.length, fixture.ownerResidues.totalRows)
    assert.equal(
      fixture.ownerResidues.rows.filter(row => row.trueOwnerSourceMatch).length,
      fixture.ownerResidues.trueOwnerSourceMatchedRows,
    )
    assert.equal(
      fixture.ownerResidues.rows.filter(row => row.strict).length,
      fixture.ownerResidues.strictRows,
    )
  },
)

test(
  'authenticated Target117 bundle binds the whole spawnFork unit, residue tail, and fork module graph',
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
    assert.equal(
      countOccurrences(
        baselineBundle.toString('utf8'),
        fixture.baselineAbsence.targetForkUsageString,
      ),
      fixture.baselineAbsence.baselineOccurrenceCount,
    )
    assert.equal(
      countOccurrences(
        targetBundle.toString('utf8'),
        fixture.baselineAbsence.targetForkUsageString,
      ),
      fixture.baselineAbsence.targetOccurrenceCount,
    )

    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target117 spawnFork')
    assert.equal(target.node.async, fixture.targetUnit.async)
    const registerCalls = []
    const memoAllocations = []
    walk(target.node, candidate => {
      if (
        candidate.type === 'CallExpression' &&
        candidate.callee?.type === 'MemberExpression' &&
        !candidate.callee.computed &&
        candidate.callee.property?.name === 'registerName'
      ) {
        registerCalls.push(candidate)
      }
      if (
        candidate.type === 'CallExpression' &&
        candidate.callee?.type === 'MemberExpression' &&
        !candidate.callee.computed &&
        candidate.callee.property?.name === 'c' &&
        candidate.arguments.length === 1 &&
        candidate.arguments[0]?.type === 'Literal'
      ) {
        memoAllocations.push(candidate)
      }
    })
    assert.equal(registerCalls.length, 1, 'one lifecycle registerName call')
    assert.equal(registerCalls[0].arguments.length, 2)
    assert.equal(memoAllocations.length, 0, 'spawnFork is not a React cache unit')
    assert.equal(
      exactSlice(targetBundle, fixture.strictCall, 'strict registerName call'),
      fixture.strictCall.exact,
    )

    for (const residue of fixture.ownerResidues.rows) {
      assert.ok(residue.start >= fixture.targetUnit.start)
      assert.ok(residue.end <= fixture.targetUnit.end)
      const literal = targetBundle
        .subarray(residue.start, residue.end)
        .toString('utf8')
      if (residue.literalKind === 'string') {
        assert.equal(JSON.parse(literal), residue.value)
      } else {
        assert.equal(literal, residue.value)
      }
    }

    const ledger = JSON.parse(
      gunzipSync(
        fs.readFileSync(path.join(repositoryRoot, fixture.structuralLedger.path)),
      ),
    )
    for (const expected of fixture.adjacentTargetUnits) {
      const row = ledger.unresolvedTarget.find(
        candidate => candidate.target.index === expected.targetIndex,
      )
      assert.ok(row, `${expected.role}: structural row`)
      assert.equal(row.target.sourceHash, expected.sha256)
      assert.equal(row.target.tokenCount, expected.tokenCount)
      const unit = parseUnit(targetBundle, expected, expected.role)
      if (expected.role === 'fork-command-index-initializer') {
        assert.match(unit.source, /name:"fork"/)
      }
    }
    assert.equal(
      exactSlice(
        targetBundle,
        fixture.exportedInvocation,
        'exported spawnFork invocation',
      ),
      fixture.exportedInvocation.exact,
    )

    for (const dependency of fixture.retainedRuntimeDependencies) {
      parseUnit(targetBundle, dependency, dependency.role)
      const row = ledger.regions.find(
        candidate => candidate.target.index === dependency.targetIndex,
      )
      assert.deepEqual(
        {
          classification: row.classification,
          baselineUnitIndex: row.baselineUnitIndex,
          pairReason: row.pairReason,
          sha256: row.target.sourceHash,
        },
        {
          classification: 'matched',
          baselineUnitIndex: dependency.baselineUnitIndex,
          pairReason: dependency.pairReason,
          sha256: dependency.sha256,
        },
      )
    }
  },
)

test(
  'Target118 donor differs only by the later name property under a conservative AST proof',
  { skip: !selected },
  () => {
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 inner bundle',
    )
    const target118Bundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_118_INNER_BUNDLE', fixture.target118Bundle),
      fixture.target118Bundle,
      'Target118 inner bundle',
    )
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target117 spawnFork')
    const later = parseUnit(
      target118Bundle,
      fixture.target118TemporalLineage,
      'Target118 spawnFork',
    )
    const fragment = fixture.target118TemporalLineage.laterOnlyFragment
    assert.equal(
      exactSlice(target118Bundle, fragment, 'Target118 later-only fragment'),
      fragment.exact,
    )
    assert.equal(later.source.indexOf(fragment.exact), fragment.localStart)
    assert.equal(
      countOccurrences(target.source, fragment.exact),
      fragment.target117OccurrenceCount,
    )
    assert.equal(
      countOccurrences(later.source, fragment.exact),
      fragment.target118OccurrenceCount,
    )
    const derived =
      later.source.slice(0, fragment.localStart) +
      later.source.slice(fragment.localEnd)
    assert.equal(
      countOccurrences(derived, fragment.exact),
      fragment.derivedOccurrenceCount,
    )
    assert.deepEqual(
      descriptor(derived),
      expectedDescriptor(fixture.target118TemporalLineage.derivedTarget117Shape),
    )
    assert.equal(
      parse(derived, { ecmaVersion: 'latest' }).body[0].async,
      true,
    )

    const normalizedTarget = canonicalAst(target.source)
    const normalizedDerived = canonicalAst(derived)
    assert.equal(normalizedTarget.normalized, normalizedDerived.normalized)
    assert.deepEqual(
      {
        chars: normalizedTarget.chars,
        bytes: normalizedTarget.bytes,
        sha256: normalizedTarget.sha256,
      },
      {
        chars:
          fixture.target118TemporalLineage.canonicalAstEquivalence
            .normalizedChars,
        bytes:
          fixture.target118TemporalLineage.canonicalAstEquivalence
            .normalizedBytes,
        sha256:
          fixture.target118TemporalLineage.canonicalAstEquivalence.sha256,
      },
    )
  },
)

test(
  'raw and packaged source expose only an absent-or-exact stale owner and keep the lifecycle graph fail closed',
  { skip: !selected },
  () => {
    const root = selectedSourceRoot()
    const selectedOwner = sourceFilename(root, fixture.legacyOwnerSource.path)
    const selectedIndex = sourceFilename(
      root,
      fixture.legacyOwnerSource.index.path,
    )
    const ownerExists = fs.existsSync(selectedOwner)
    const indexExists = fs.existsSync(selectedIndex)
    assert.equal(ownerExists, indexExists, 'fork owner and index are atomically absent/present')
    if (ownerExists) {
      assertRealFile(selectedOwner, 'selected fork owner')
      assertRealFile(selectedIndex, 'selected fork index')
      readExact(selectedOwner, fixture.legacyOwnerSource, 'selected stale fork owner')
      readExact(selectedIndex, fixture.legacyOwnerSource.index, 'selected fork index')
    }

    const evidenceOwner = path.join(
      repositoryRoot,
      fixture.legacyOwnerSource.path,
    )
    const evidenceIndex = path.join(
      repositoryRoot,
      fixture.legacyOwnerSource.index.path,
    )
    assertRealFile(evidenceOwner, 'repository stale fork owner')
    assertRealFile(evidenceIndex, 'repository fork index')
    const sourceBytes = readExact(
      evidenceOwner,
      fixture.legacyOwnerSource,
      'repository stale fork owner',
    )
    const source = sourceBytes.toString('utf8')
    assert.equal(source.length, fixture.legacyOwnerSource.chars)
    const index = readExact(
      evidenceIndex,
      fixture.legacyOwnerSource.index,
      'repository fork index',
    ).toString('utf8')
    assert.equal(index.length, fixture.legacyOwnerSource.index.chars)

    const ts = typescript()
    const sourceFile = ts.createSourceFile(
      fixture.legacyOwnerSource.path,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    const functions = new Map(
      sourceFile.statements
        .filter(ts.isFunctionDeclaration)
        .map(node => [node.name?.text, node]),
    )
    for (const [name, expected] of [
      ['getForkName', fixture.legacyOwnerSource.getForkName],
      ['getRenderedSystemPrompt', fixture.legacyOwnerSource.getRenderedSystemPrompt],
      ['spawnFork', fixture.legacyOwnerSource.spawnFork],
      ['call', fixture.legacyOwnerSource.call],
    ]) {
      const node = functions.get(name)
      assert.ok(node, `${name}: declaration`)
      assert.equal(node.getStart(sourceFile), expected.start)
      assert.equal(node.end, expected.end)
      exactStringSlice(source, expected, `${name}: exact source declaration`)
    }
    const indexDeclaration = exactStringSlice(
      index,
      fixture.legacyOwnerSource.index.declaration,
      'fork command index declaration',
    )
    assert.match(indexDeclaration, /name: 'fork'/)
    assert.match(indexDeclaration, /import\('\.\/fork\.js'\)/)

    for (const residue of fixture.ownerResidues.rows) {
      assert.equal(
        source.includes(residue.value),
        residue.trueOwnerSourceMatch,
        `${residue.value}: stale true-owner source match`,
      )
    }

    const candidate = deriveBoundedCandidate(source)
    const expectedCandidate = fixture.legacyOwnerSource.boundedSemanticCandidate
    assert.equal(candidate.length, expectedCandidate.chars)
    assert.deepEqual(descriptor(candidate), expectedDescriptor(expectedCandidate))
    const candidateFile = ts.createSourceFile(
      fixture.legacyOwnerSource.path,
      candidate,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    assert.equal(candidateFile.parseDiagnostics.length, 0)
    const candidateSpawn = candidateFile.statements.find(
      node => ts.isFunctionDeclaration(node) && node.name?.text === 'spawnFork',
    )
    const candidateCall = candidateFile.statements.find(
      node => ts.isFunctionDeclaration(node) && node.name?.text === 'call',
    )
    assert.equal(candidateSpawn.getStart(candidateFile), expectedCandidate.spawnFork.start)
    assert.equal(candidateSpawn.end, expectedCandidate.spawnFork.end)
    exactStringSlice(candidate, expectedCandidate.spawnFork, 'candidate spawnFork')
    assert.equal(candidateCall.getStart(candidateFile), expectedCandidate.call.start)
    assert.equal(candidateCall.end, expectedCandidate.call.end)
    exactStringSlice(candidate, expectedCandidate.call, 'candidate call')
    for (const transform of expectedCandidate.transforms) {
      exactStringSlice(source, transform.raw, `${transform.name}: raw`)
      exactStringSlice(candidate, transform.candidate, `${transform.name}: candidate`)
    }
    assert.match(candidate, /context\.agentLifecycle\.registerName\(name, asAgentId\(agentId\)\)/)
    assert.match(candidate, /const \{ taskRegistry \} = context/)
    assert.equal(candidate.includes('rootSetAppState'), false)

    for (const stale of fixture.sourceReplayBlocker.staleFiles) {
      const filename = sourceFilename(root, stale.path)
      assertRealFile(filename, `${stale.path}: selected blocker`)
      const staleSource = readExact(
        filename,
        stale,
        `${stale.path}: pinned stale source`,
      ).toString('utf8')
      const declaration = exactStringSlice(
        staleSource,
        stale.declaration,
        `${stale.path}: stale declaration`,
      )
      for (const needle of stale.requiresPresent ?? []) {
        assert.equal(declaration.includes(needle), true, `${stale.path}: has ${needle}`)
      }
      for (const needle of stale.requiresAbsent ?? []) {
        assert.equal(declaration.includes(needle), false, `${stale.path}: lacks ${needle}`)
      }
    }
    assert.match(fixture.sourceReplayBlocker.decision, /no helper.*no source writes/)
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(descriptor(sourceBytes), expectedDescriptor(fixture.legacyOwnerSource))
  },
)
