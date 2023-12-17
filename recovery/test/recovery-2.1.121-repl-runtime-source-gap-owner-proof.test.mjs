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
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/repl-runtime-source-gap-owner-overrides.mjs'

const {
  TARGET121_REPL_RUNTIME_SOURCE_GAP_EVIDENCE_IDS,
  TARGET121_REPL_RUNTIME_SOURCE_GAP_OWNER_OVERRIDES,
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
    './recovery-2.1.121-repl-runtime-source-gap-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'f00d8cc095c9cacd7a2c3112c5b20851fe6b56b0e9dc68ff92862f0de963d334'

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

function canonicalSource(node) {
  return JSON.stringify(canonicalize(node))
}

function canonicalDescriptor(node) {
  return descriptor(canonicalSource(node))
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
  assert.equal(node.body.body.length, expected.bodyStatementCount)
  return { node, source, unitStart: expected.start }
}

function semanticCounts(node, names) {
  const counts = Object.fromEntries(names.map(name => [name, 0]))
  walk(node, candidate => {
    if (
      candidate.type === 'MemberExpression' &&
      !candidate.computed &&
      candidate.property?.type === 'Identifier' &&
      candidate.property.name in counts
    ) {
      counts[candidate.property.name] += 1
    }
    if (candidate.type === 'Property' && !candidate.computed) {
      const name = candidate.key?.name ?? candidate.key?.value
      if (name in counts) counts[name] += 1
    }
  })
  return counts
}

function layoutEffectStatements(parsed) {
  return parsed.node.body.body.filter(statement => {
    const callee = statement.expression?.callee
    return (
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'CallExpression' &&
      callee?.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property?.name === 'useLayoutEffect'
    )
  })
}

function statementEvidence(baseline, target) {
  const baselineCanonical = baseline.node.body.body.map(canonicalSource)
  const targetCanonical = target.node.body.body.map(canonicalSource)
  const changed = []
  const same = []
  for (let index = 0; index < targetCanonical.length; index += 1) {
    if (baselineCanonical[index] === targetCanonical[index]) same.push(index)
    else changed.push(index)
  }
  const statementList = (parsed, canonical) =>
    JSON.stringify(
      canonical.map((value, index) => ({
        index,
        nodeType: parsed.node.body.body[index].type,
        canonicalSha256: sha256(value),
      })),
    )
  const details = []
  for (const index of changed) {
    for (const [side, parsed, canonical] of [
      ['baseline', baseline, baselineCanonical],
      ['target', target, targetCanonical],
    ]) {
      const node = parsed.node.body.body[index]
      const raw = parsed.source.slice(node.start, node.end)
      details.push({
        side,
        index,
        nodeType: node.type,
        start: parsed.unitStart + node.start,
        end: parsed.unitStart + node.end,
        bytes: Buffer.byteLength(raw),
        sha256: sha256(raw),
        canonicalBytes: Buffer.byteLength(canonical[index]),
        canonicalSha256: sha256(canonical[index]),
      })
    }
  }
  return {
    same,
    changed,
    baselineList: statementList(baseline, baselineCanonical),
    targetList: statementList(target, targetCanonical),
    details,
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

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
}

function parseReplSource(expected, root) {
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
    ts.ScriptKind.TSX,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, 'REPL source parses')
  const declaration = sourceFile.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'REPL',
  )
  assert.ok(declaration, 'REPL declaration')
  assert.equal(declaration.getStart(sourceFile), expected.declaration.start)
  assert.equal(declaration.end, expected.declaration.end)
  const declarationSource = exactStringSlice(
    source,
    expected.declaration,
    `${expected.selectedPath}: REPL declaration`,
  )
  return { declaration, declarationSource, source, sourceFile, ts }
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

function tsWalk(ts, node, visit) {
  visit(node)
  ts.forEachChild(node, child => tsWalk(ts, child, visit))
}

function tsLayoutEffectCalls(parsed) {
  const calls = []
  tsWalk(parsed.ts, parsed.declaration, node => {
    if (
      parsed.ts.isCallExpression(node) &&
      parsed.ts.isIdentifier(node.expression) &&
      node.expression.text === 'useLayoutEffect'
    ) {
      calls.push(node)
    }
  })
  return calls
}

function jsxName(node, sourceFile) {
  return node.getText(sourceFile)
}

function promptInputElement(parsed) {
  const matches = []
  tsWalk(parsed.ts, parsed.declaration, node => {
    if (
      parsed.ts.isJsxSelfClosingElement(node) &&
      jsxName(node.tagName, parsed.sourceFile) === 'PromptInput'
    ) {
      matches.push(node)
    }
  })
  assert.equal(matches.length, 1, 'one PromptInput JSX element')
  return matches[0]
}

function gitText(args) {
  return execFileSync('git', args, {
    cwd: gitEvidenceRepositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function assertGitSource(expected) {
  assert.equal(gitText(['rev-parse', `${expected.commit}^{tree}`]), expected.tree)
  assert.equal(
    gitText(['rev-parse', `${expected.commit}:src/screens/REPL.tsx`]),
    expected.blob,
  )
}

test(
  'Target121 REPL fixture and owner override remain fail-closed',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-static-owner-proof-source-replay-blocked')
    assert.deepEqual(
      Object.keys(ownerProofModule).sort(),
      [
        'TARGET121_REPL_RUNTIME_SOURCE_GAP_EVIDENCE_IDS',
        'TARGET121_REPL_RUNTIME_SOURCE_GAP_OWNER_OVERRIDES',
      ],
    )
    assert.deepEqual(
      [...TARGET121_REPL_RUNTIME_SOURCE_GAP_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.equal(TARGET121_REPL_RUNTIME_SOURCE_GAP_OWNER_OVERRIDES.length, 1)
    const override = TARGET121_REPL_RUNTIME_SOURCE_GAP_OWNER_OVERRIDES[0]
    assert.equal(override.key, `${caseName}:21373`)
    assert.equal(override.targetIndex, fixture.ownerCorrection.targetIndex)
    assert.deepEqual([...override.paths], [fixture.ownerCorrection.correctedOwner])
    assert.deepEqual([...override.declarations], [fixture.ownerCorrection.declaration])
    assert.deepEqual([...override.evidenceIds], fixture.evidenceIds)
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(fixture.generatorWiring.expectedStrictImpact, {
      units: -1,
      residues: -8,
    })
  },
)

test(
  'Target121 u21373 authenticates the complete REPL unit and all eight residue boundaries',
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
    const baseline = parseUnit(baselineBundle, fixture.baselineUnit, 'Target120 REPL')
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target121 REPL')
    assert.match(baseline.source, /^function QC6\(/)
    assert.match(target.source, /^function Kx6\(/)

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
    assert.equal(targetLedger.classification, fixture.targetUnit.classification)
    assert.equal(targetLedger.unknownFreeIdentifierCount, fixture.targetUnit.unknownFreeIdentifierCount)
    for (const key of [
      'index',
      'nodeType',
      'start',
      'end',
      'tokenCount',
      'sourceHash',
      'coarseHash',
      'topDefinitionCount',
    ]) {
      const expectedKey =
        key === 'index' ? 'targetIndex' : key === 'sourceHash' ? 'sha256' : key
      assert.equal(targetLedger.target[key], fixture.targetUnit[expectedKey])
    }
    for (const key of [
      'index',
      'nodeType',
      'start',
      'end',
      'tokenCount',
      'sourceHash',
      'coarseHash',
      'topDefinitionCount',
    ]) {
      const expectedKey =
        key === 'index'
          ? 'baselineUnitIndex'
          : key === 'sourceHash'
            ? 'sha256'
            : key
      assert.equal(baselineLedger[key], fixture.baselineUnit[expectedKey])
    }

    const relation = statementEvidence(baseline, target)
    assert.deepEqual(relation.same, fixture.wholeUnitRelation.sameIndices.values)
    assert.deepEqual(relation.changed, fixture.wholeUnitRelation.changedIndices.values)
    assert.deepEqual(
      descriptor(JSON.stringify(relation.same)),
      expectedDescriptor(fixture.wholeUnitRelation.sameIndices),
    )
    assert.deepEqual(
      descriptor(JSON.stringify(relation.changed)),
      expectedDescriptor(fixture.wholeUnitRelation.changedIndices),
    )
    assert.deepEqual(
      descriptor(relation.baselineList),
      expectedDescriptor(fixture.wholeUnitRelation.baselineStatementList),
    )
    assert.deepEqual(
      descriptor(relation.targetList),
      expectedDescriptor(fixture.wholeUnitRelation.targetStatementList),
    )
    assert.equal(
      relation.details.length,
      fixture.wholeUnitRelation.changedStatementDescriptors.count,
    )
    assert.deepEqual(
      descriptor(JSON.stringify(relation.details)),
      expectedDescriptor(fixture.wholeUnitRelation.changedStatementDescriptors),
    )

    const names = Object.keys(fixture.withinUnitSemanticCounts.target)
    assert.deepEqual(
      semanticCounts(baseline.node, names),
      fixture.withinUnitSemanticCounts.baseline,
    )
    assert.deepEqual(
      semanticCounts(target.node, names),
      fixture.withinUnitSemanticCounts.target,
    )

    assert.equal(fixture.strictResidues.rows.length, fixture.strictResidues.total)
    for (const row of fixture.strictResidues.rows) {
      const value = exactBufferSlice(targetBundle, row, `${row.value} residue`)
      assert.equal(value, row.value)
    }
    assert.equal(
      fixture.strictResidues.rows.filter(
        row => row.semanticClass === 'retained-owner-global-occurrence-shift',
      ).length,
      fixture.strictResidues.retainedGlobalOccurrenceRows,
    )
    assert.equal(
      fixture.strictResidues.rows.filter(
        row => row.semanticClass === 'authentic-target121-source-gap',
      ).length,
      fixture.strictResidues.authenticTargetDeltaRows,
    )

    for (const [name, expected] of Object.entries(fixture.targetRuntimeNodes)) {
      exactBufferSlice(targetBundle, expected, `Target121 ${name}`)
    }

    const baselineLayout = layoutEffectStatements(baseline)
    const targetLayout = layoutEffectStatements(target)
    assert.equal(baselineLayout.length, 2)
    assert.equal(targetLayout.length, 2)
    for (const [parsed, nodes, expectedRows] of [
      [baseline, baselineLayout, fixture.layoutEffectLineage.baseline],
      [target, targetLayout, fixture.layoutEffectLineage.target],
    ]) {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]
        const expected = expectedRows[index]
        assert.equal(parsed.unitStart + node.start, expected.start)
        assert.equal(parsed.unitStart + node.end, expected.end)
        assert.deepEqual(
          descriptor(parsed.source.slice(node.start, node.end)),
          expectedDescriptor(expected),
        )
        assert.deepEqual(canonicalDescriptor(node), {
          bytes: expected.canonicalBytes,
          sha256: expected.canonicalSha256,
        })
      }
    }
  },
)

test(
  'Target121 REPL source proves ownership while refusing the partial runtime replay',
  { skip: !selected },
  () => {
    const baselineExpected = fixture.sourceStates.baseline120
    const targetExpected = fixture.sourceStates.target121
    const baseline = parseReplSource(baselineExpected, selectedBaselineSourceRoot())
    const target = parseReplSource(targetExpected, selectedSourceRoot())
    assertGitSource(baselineExpected)
    assertGitSource(targetExpected)

    const calls = tsLayoutEffectCalls(target)
    assert.equal(calls.length, targetExpected.layoutEffectCalls.length)
    for (let index = 0; index < calls.length; index += 1) {
      const node = calls[index]
      const expected = targetExpected.layoutEffectCalls[index]
      assert.equal(node.getStart(target.sourceFile), expected.start)
      assert.equal(node.end, expected.end)
      exactStringSlice(target.source, expected, `source useLayoutEffect ${index + 1}`)
    }

    for (const [needle, expectedCount] of Object.entries(
      targetExpected.declarationLexicalCounts,
    )) {
      assert.equal(
        countOccurrences(target.declarationSource, needle),
        expectedCount,
        `REPL lexical count for ${needle}`,
      )
    }
    for (const needle of targetExpected.requiredRuntimeAbsent) {
      assert.equal(
        countOccurrences(target.declarationSource, needle),
        0,
        `${needle} remains absent from source REPL`,
      )
    }
    for (const needle of targetExpected.legacyRuntimePresent) {
      assert.ok(target.declarationSource.includes(needle), `${needle} remains present`)
    }

    exactStringSlice(
      target.source,
      targetExpected.legacySurveyFragment,
      'legacy survey fragment',
    )
    const promptInput = promptInputElement(target)
    assert.equal(promptInput.getStart(target.sourceFile), targetExpected.legacyPromptInput.start)
    assert.equal(promptInput.end, targetExpected.legacyPromptInput.end)
    exactStringSlice(
      target.source,
      targetExpected.legacyPromptInput,
      'legacy PromptInput element',
    )
    assert.deepEqual(
      promptInput.attributes.properties
        .map(attribute => attribute.name?.getText(target.sourceFile))
        .filter(Boolean),
      targetExpected.legacyPromptInput.attributeNames,
    )

    assert.equal(
      countOccurrences(baseline.declarationSource, 'activeSkill'),
      0,
      'Target120 source also lacks activeSkill',
    )
    assert.match(fixture.sourceReplayBlocker.decision, /^static complete-unit/)
    assert.equal(fixture.generatorWiring.replayHelper, null)
  },
)
