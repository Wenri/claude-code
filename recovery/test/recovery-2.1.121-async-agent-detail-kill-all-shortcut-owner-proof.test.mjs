import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/async-agent-detail-kill-all-shortcut-owner-overrides.mjs'
import {
  TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_EVIDENCE_IDS,
  TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/async-agent-detail-kill-all-shortcut-owner-overrides.mjs'

const repositoryRoot = process.cwd()
const gitEvidenceRepositoryRoot = path.resolve(
  process.env.CLAUDE_CODE_2_1_121_REPOSITORY_ROOT ?? repositoryRoot,
)
const caseName = '2.1.120-to-2.1.121'
const selected =
  !process.env.CLAUDE_CODE_SEMANTIC_CASE ||
  process.env.CLAUDE_CODE_SEMANTIC_CASE === caseName
const fixturePath = path.join(
  repositoryRoot,
  'recovery/test/recovery-2.1.121-async-agent-detail-kill-all-shortcut-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'ffb7a446b596da7fae18ecbd0db469c334fe2852adb7318c5da6f063929e3ea5'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const expectedDescriptor = row => ({
  bytes: row.bytes,
  sha256: row.sha256 ?? row.sourceHash,
})
const occurrenceCount = (source, needle) => source.split(needle).length - 1

let typescriptPromise
function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function selectedSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      path.join(repositoryRoot, 'src'),
  )
}

function selectedSourcePath(sourcePath) {
  assert.match(sourcePath, /^src\//)
  return path.join(selectedSourceRoot(), sourcePath.slice(4))
}

function readExact(filename, expected) {
  const value = fs.readFileSync(filename)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), filename)
  return value
}

function parseSource(ts, source, sourcePath) {
  const parsed = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function namedDeclaration(ts, parsed, name) {
  const matches = parsed.statements.filter(
    statement =>
      (ts.isFunctionDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name?.text === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0]
}

function sourceRegion(source, node, parsed) {
  return descriptor(
    Buffer.from(source.slice(node.getStart(parsed), node.end), 'utf8'),
  )
}

function parseUnit(bundle, unit) {
  const source = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(source), expectedDescriptor(unit))
  const ast = parse(source.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  assert.equal(ast.body[0].body.body.length, unit.bodyStatementCount)
  return { node: ast.body[0], source: source.toString(), start: unit.start }
}

function cacheIdentifier(node) {
  return node.body.body[0].declarations[0].id.name
}

function canonicalize(node, cacheName, parent = null, key = null) {
  if (Array.isArray(node)) {
    return node.map(child => canonicalize(child, cacheName, parent, key))
  }
  if (!node || typeof node !== 'object') return node
  if (node.type === 'Identifier') {
    const semanticName =
      (parent?.type === 'MemberExpression' &&
        key === 'property' &&
        !parent.computed) ||
      (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
      (parent?.type === 'MethodDefinition' &&
        key === 'key' &&
        !parent.computed)
    return { type: 'Identifier', name: semanticName ? node.name : '@id' }
  }
  if (
    node.type === 'Literal' &&
    parent?.type === 'MemberExpression' &&
    key === 'property' &&
    parent.computed &&
    parent.object?.type === 'Identifier' &&
    parent.object.name === cacheName
  ) {
    return { type: 'Literal', value: '@cache' }
  }
  if (
    node.type === 'Literal' &&
    parent?.type === 'CallExpression' &&
    parent.callee?.type === 'MemberExpression' &&
    parent.callee.property?.name === 'c'
  ) {
    return { type: 'Literal', value: '@cache-size' }
  }
  if (node.type === 'VariableDeclaration') {
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: canonicalize(
        node.declarations,
        cacheName,
        node,
        'declarations',
      ),
    }
  }
  const result = {}
  for (const [childKey, child] of Object.entries(node)) {
    if (
      !['start', 'end', 'loc', 'range', 'raw', 'shorthand'].includes(childKey)
    ) {
      result[childKey] = canonicalize(child, cacheName, node, childKey)
    }
  }
  return result
}

function canonicalDescriptor(node) {
  const value = JSON.stringify(canonicalize(node, cacheIdentifier(node)))
  return descriptor(Buffer.from(value))
}

function canonicalStatement(node, parentUnit) {
  const value = JSON.stringify(
    canonicalize(node, cacheIdentifier(parentUnit)),
  )
  return descriptor(Buffer.from(value))
}

function removeKillAllDelta(target) {
  const normalized = structuredClone(target)
  const parameterPattern = normalized.body.body[0].declarations[1].id
  parameterPattern.properties = parameterPattern.properties.filter(
    property => property.key.name !== 'killAllAgentsShortcut',
  )
  normalized.body.body.splice(29, 2)
  const guide = normalized.body.body[30]
  guide.test = guide.test.left
  const expressions = guide.consequent.expression.expressions
  expressions[0].right.arguments.pop()
  expressions.splice(3, 1)
  return normalized
}

function rowTuple(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
    row.disposition,
    row.ownerPaths,
  ]
}

function canonicalRows(rows) {
  const value = rows.map(JSON.stringify).join('\n')
  return { ...descriptor(Buffer.from(value)), tuples: rows }
}

function assertBundleRegion(bundle, parsedUnit, expected) {
  const statement = parsedUnit.node.body.body[expected.statementIndex]
  assert.equal(statement.type, expected.nodeType)
  assert.equal(parsedUnit.start + statement.start, expected.start)
  assert.equal(parsedUnit.start + statement.end, expected.end)
  const value = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected))
  assert.equal(value.toString(), expected.text)
  return statement
}

function findAsyncAgentCall(ts, parsed) {
  const matches = []
  function visit(node) {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(parsed) === 'AsyncAgentDetailDialog'
    ) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  assert.equal(matches.length, 1)
  return matches[0]
}

function findProperty(node, name) {
  const matches = []
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (value.type === 'Property' && value.key?.name === name) {
      matches.push(value)
    }
    for (const child of Object.values(value)) {
      if (!child || typeof child !== 'object') continue
      if (Array.isArray(child)) child.forEach(visit)
      else visit(child)
    }
  }
  visit(node)
  assert.equal(matches.length, 1, name)
  return matches[0]
}

test(
  'Target121 AsyncAgentDetailDialog static owner proof is frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    assert.deepEqual(
      Object.keys(ownerProofModule).sort(),
      [
        'TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_EVIDENCE_IDS',
        'TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_OWNER_OVERRIDES',
      ],
    )
    assert.deepEqual(
      TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_OWNER_OVERRIDES.map(
        override => ({
          key: override.key,
          targetIndex: override.targetIndex,
          paths: override.paths,
          declarations: override.declarations,
          evidenceIds: override.evidenceIds,
        }),
      ),
      [
        {
          key: `${caseName}:17497`,
          targetIndex: 17497,
          paths: ['src/components/tasks/AsyncAgentDetailDialog.tsx'],
          declarations: ['Props', 'AsyncAgentDetailDialog'],
          evidenceIds:
            TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_EVIDENCE_IDS,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(
        TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_OWNER_OVERRIDES,
      ),
      true,
    )
    assert.match(
      TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_OWNER_OVERRIDES[0].behavior,
      /u17548 caller.*static complete-unit owner proof.*replay is explicitly blocked/s,
    )
    assert.deepEqual(fixture.expectedStrictEvolution, {
      before: { units: 43, residues: 424 },
      after: { units: 42, residues: 423 },
      removedIndices: [17497],
      removedAddedOwnerRows: 1,
    })
  },
)

test(
  'complete Target121 detail unit reduces exactly to its Target120 predecessor',
  { skip: !selected },
  () => {
    const baseline = readExact(
      path.join(repositoryRoot, fixture.inputs.baselineBundle.path),
      fixture.inputs.baselineBundle,
    )
    const target = readExact(
      path.join(repositoryRoot, fixture.inputs.targetBundle.path),
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
    const targetLedger = ledger.regions[fixture.units.target.index]
    assert.equal(targetLedger.classification, 'unresolved')
    const baselineLedger = ledger.unmatchedBaseline.find(
      unit => unit.index === fixture.units.baseline.index,
    )
    assert.ok(baselineLedger)
    for (const key of [
      'index',
      'nodeType',
      'parseStatus',
      'start',
      'end',
      'tokenCount',
      'sourceHash',
      'coarseHash',
    ]) {
      assert.equal(targetLedger.target[key], fixture.units.target[key])
      assert.equal(baselineLedger[key], fixture.units.baseline[key])
    }

    const baselineUnit = parseUnit(baseline, fixture.units.baseline)
    const targetUnit = parseUnit(target, fixture.units.target)
    assert.deepEqual(
      canonicalDescriptor(baselineUnit.node),
      fixture.wholeUnitProof.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(targetUnit.node),
      fixture.wholeUnitProof.targetCanonical,
    )

    const baselineKeyguard = assertBundleRegion(
      baseline,
      baselineUnit,
      fixture.bundleRegions.baselineKeyguard,
    )
    const targetKeyguard = assertBundleRegion(
      target,
      targetUnit,
      fixture.bundleRegions.targetKeyguard,
    )
    assert.deepEqual(
      canonicalStatement(targetKeyguard, targetUnit.node),
      canonicalStatement(baselineKeyguard, baselineUnit.node),
    )
    for (const [bundle, parsed, region] of [
      [baseline, baselineUnit, fixture.bundleRegions.baselineFirst],
      [baseline, baselineUnit, fixture.bundleRegions.baselineGuide],
      [target, targetUnit, fixture.bundleRegions.targetFirst],
      [target, targetUnit, fixture.bundleRegions.targetKillVariable],
      [target, targetUnit, fixture.bundleRegions.targetKillHint],
      [target, targetUnit, fixture.bundleRegions.targetGuide],
    ]) {
      assertBundleRegion(bundle, parsed, region)
    }
    const addedBlock = target.subarray(
      fixture.bundleRegions.targetAddedBlock.start,
      fixture.bundleRegions.targetAddedBlock.end,
    )
    assert.deepEqual(
      descriptor(addedBlock),
      expectedDescriptor(fixture.bundleRegions.targetAddedBlock),
    )

    const normalizedTarget = removeKillAllDelta(targetUnit.node)
    assert.deepEqual(
      canonicalDescriptor(normalizedTarget),
      fixture.wholeUnitProof.targetAfterRemovingDelta,
    )
    assert.deepEqual(
      canonicalDescriptor(normalizedTarget),
      canonicalDescriptor(baselineUnit.node),
    )
  },
)

test(
  'typed report pins the single strict property and all ninety owner rows',
  { skip: !selected },
  () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.inputs.typedReport.path),
        'utf8',
      ),
    )
    for (const [key, reportKey] of [
      ['addedOwner', 'sourceRuntimeAddedOwnerResidueRows'],
      ['owner', 'sourceRuntimeOwnerResidueRows'],
    ]) {
      const rows = report[reportKey]
        .filter(row => row.structural.index === fixture.units.target.index)
        .map(rowTuple)
      const actual = canonicalRows(rows)
      assert.equal(actual.tuples.length, fixture.rows[key].count)
      assert.equal(actual.bytes, fixture.rows[key].canonicalBytes)
      assert.equal(actual.sha256, fixture.rows[key].canonicalSha256)
      if (fixture.rows[key].tuples) {
        assert.deepEqual(actual.tuples, fixture.rows[key].tuples)
      }
    }
    const strict = report.rows
      .filter(row => row.structural.index === fixture.units.target.index)
      .map(rowTuple)
    assert.ok(strict.length === 0 || strict.length === 1)
    if (strict.length === 1) {
      const actual = canonicalRows(strict)
      assert.equal(actual.bytes, fixture.rows.strict.canonicalBytes)
      assert.equal(actual.sha256, fixture.rows.strict.canonicalSha256)
      assert.deepEqual(actual.tuples, fixture.rows.strict.tuples)
    }
    const expected = fixture.rows.strict.tuples[0]
    const target = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.targetBundle.path),
    )
    assert.equal(target.subarray(expected[3], expected[4]).toString(), expected[2])
  },
)

test(
  'mapped source authenticates the owner but proves replay is incomplete',
  { skip: !selected },
  async () => {
    const sourceBytes = readExact(
      selectedSourcePath(fixture.inputs.sourceFile.path),
      fixture.inputs.sourceFile,
    )
    const source = sourceBytes.toString()
    assert.equal(occurrenceCount(source, 'killAllAgentsShortcut'), 0)

    const tree = spawnSync(
      'git',
      [
        'ls-tree',
        fixture.sourceProvenance.commit,
        fixture.sourceProvenance.path,
      ],
      { cwd: gitEvidenceRepositoryRoot, encoding: 'utf8' },
    )
    assert.equal(tree.status, 0, tree.stderr)
    assert.match(
      tree.stdout,
      new RegExp(`blob ${fixture.sourceProvenance.gitObject}\\s`),
    )
    const gitSource = spawnSync(
      'git',
      [
        'show',
        `${fixture.sourceProvenance.commit}:${fixture.sourceProvenance.path}`,
      ],
      { cwd: gitEvidenceRepositoryRoot, encoding: null },
    )
    assert.equal(gitSource.status, 0, gitSource.stderr?.toString())
    assert.deepEqual(
      descriptor(gitSource.stdout),
      expectedDescriptor(fixture.inputs.sourceFile),
    )

    const ts = await loadTypeScript()
    const parsed = parseSource(ts, source, fixture.inputs.sourceFile.path)
    for (const [name, expected] of [
      ['Props', fixture.sourceEvidence.compiledProps],
      [
        'AsyncAgentDetailDialog',
        fixture.sourceEvidence.compiledDeclaration,
      ],
    ]) {
      const declaration = namedDeclaration(ts, parsed, name)
      assert.equal(declaration.getStart(parsed), expected.charStart)
      assert.equal(declaration.end, expected.charEnd)
      assert.deepEqual(
        sourceRegion(source, declaration, parsed),
        expectedDescriptor(expected),
      )
    }

    const prefix =
      '//# sourceMappingURL=data:application/json;charset=utf-8;base64,'
    const tailStart = source.lastIndexOf(prefix)
    assert.equal(tailStart, fixture.sourceEvidence.sourceMap.tailStart)
    assert.deepEqual(
      descriptor(Buffer.from(source.slice(tailStart))),
      fixture.sourceEvidence.sourceMap.tail,
    )
    const encoded = source.slice(tailStart + prefix.length).trim()
    const decoded = Buffer.from(encoded, 'base64')
    assert.deepEqual(
      descriptor(decoded),
      fixture.sourceEvidence.sourceMap.decodedJson,
    )
    const sourceMap = JSON.parse(decoded)
    assert.deepEqual(sourceMap.sources, fixture.sourceEvidence.sourceMap.sources)
    assert.equal(
      sourceMap.sourcesContent.length,
      fixture.sourceEvidence.sourceMap.sourcesContentCount,
    )
    const authored = sourceMap.sourcesContent[0]
    assert.deepEqual(
      descriptor(Buffer.from(authored)),
      fixture.sourceEvidence.sourceMap.authoredContent,
    )
    const authoredParsed = parseSource(
      ts,
      authored,
      sourceMap.sources[0],
    )
    for (const [name, expected] of [
      ['Props', fixture.sourceEvidence.authoredProps],
      [
        'AsyncAgentDetailDialog',
        fixture.sourceEvidence.authoredDeclaration,
      ],
    ]) {
      const declaration = namedDeclaration(ts, authoredParsed, name)
      assert.equal(declaration.getStart(authoredParsed), expected.charStart)
      assert.equal(declaration.end, expected.charEnd)
      assert.deepEqual(
        sourceRegion(authored, declaration, authoredParsed),
        expectedDescriptor(expected),
      )
    }
    assert.equal(occurrenceCount(authored, 'killAllAgentsShortcut'), 0)
    assert.equal(occurrenceCount(authored, '!e.ctrl'), 0)
    assert.match(fixture.bundleRegions.baselineKeyguard.text, /!r\.ctrl&&!r\.meta/)
  },
)

test(
  'u17548 caller and design-system dependencies bound the static proof',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const callerBytes = fs.readFileSync(
      selectedSourcePath(fixture.inputs.callerSourceFile.path),
    )
    const callerActual = descriptor(callerBytes)
    const packageCaller =
      callerActual.sha256 === fixture.inputs.callerSourceFile.sha256
    const expectedCallerFile = packageCaller
      ? fixture.inputs.callerSourceFile
      : fixture.repositoryAlternates.callerSourceFile
    assert.deepEqual(callerActual, expectedDescriptor(expectedCallerFile))
    const caller = callerBytes.toString()
    const callerParsed = parseSource(
      ts,
      caller,
      fixture.inputs.callerSourceFile.path,
    )
    const callerExpected = packageCaller
      ? fixture.callerBoundary.sourceDeclaration
      : fixture.repositoryAlternates.callerDeclaration
    const callerDeclaration = namedDeclaration(
      ts,
      callerParsed,
      'BackgroundTasksDialog',
    )
    assert.equal(callerDeclaration.getStart(callerParsed), callerExpected.charStart)
    assert.equal(callerDeclaration.end, callerExpected.charEnd)
    assert.deepEqual(
      sourceRegion(caller, callerDeclaration, callerParsed),
      expectedDescriptor(callerExpected),
    )
    const asyncAgentCall = findAsyncAgentCall(ts, callerParsed)
    const callExpected = packageCaller
      ? fixture.callerBoundary.sourceAsyncAgentCall
      : fixture.repositoryAlternates.callerAsyncAgentCall
    assert.equal(asyncAgentCall.getStart(callerParsed), callExpected.charStart)
    assert.equal(asyncAgentCall.end, callExpected.charEnd)
    assert.deepEqual(
      sourceRegion(caller, asyncAgentCall, callerParsed),
      expectedDescriptor(callExpected),
    )
    assert.equal(
      occurrenceCount(asyncAgentCall.getText(callerParsed), 'killAllAgentsShortcut'),
      0,
    )

    const target = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.targetBundle.path),
    )
    const baseline = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.baselineBundle.path),
    )
    parseUnit(baseline, fixture.units.callerBaseline)
    const callerTarget = parseUnit(target, fixture.units.callerTarget)
    const targetProperty = findProperty(
      callerTarget.node,
      'killAllAgentsShortcut',
    )
    assert.equal(targetProperty.start, fixture.callerBoundary.targetProperty.charStart)
    assert.equal(targetProperty.end, fixture.callerBoundary.targetProperty.charEnd)
    assert.equal(
      fixture.units.callerTarget.start + targetProperty.start,
      fixture.callerBoundary.targetPropertyAbsolute.start,
    )
    assert.equal(
      fixture.units.callerTarget.start + targetProperty.end,
      fixture.callerBoundary.targetPropertyAbsolute.end,
    )
    assert.deepEqual(
      descriptor(
        Buffer.from(
          callerTarget.source.slice(targetProperty.start, targetProperty.end),
        ),
      ),
      expectedDescriptor(fixture.callerBoundary.targetProperty),
    )
    const countGuard = callerTarget.source.slice(
      fixture.callerBoundary.targetCountGuard.charStart,
      fixture.callerBoundary.targetCountGuard.charEnd,
    )
    assert.deepEqual(
      descriptor(Buffer.from(countGuard)),
      expectedDescriptor(fixture.callerBoundary.targetCountGuard),
    )
    assert.match(countGuard, />1$/)

    for (const [inputKey, declarationName, packageRegion, alternateRegion] of [
      [
        'keyboardHintSourceFile',
        'KeyboardShortcutHint',
        fixture.dependencies.keyboardShortcutHint,
        fixture.repositoryAlternates.keyboardShortcutHint,
      ],
      ['bylineSourceFile', 'Byline', fixture.dependencies.byline, null],
    ]) {
      const bytes = fs.readFileSync(
        selectedSourcePath(fixture.inputs[inputKey].path),
      )
      const actual = descriptor(bytes)
      const packageVariant = actual.sha256 === fixture.inputs[inputKey].sha256
      const expectedFile = packageVariant
        ? fixture.inputs[inputKey]
        : fixture.repositoryAlternates[inputKey]
      assert.deepEqual(actual, expectedDescriptor(expectedFile))
      const source = bytes.toString()
      const parsed = parseSource(ts, source, fixture.inputs[inputKey].path)
      const declaration = namedDeclaration(ts, parsed, declarationName)
      const expected = packageVariant ? packageRegion : alternateRegion
      assert.ok(expected)
      assert.equal(declaration.getStart(parsed), expected.charStart)
      assert.equal(declaration.end, expected.charEnd)
      assert.deepEqual(
        sourceRegion(source, declaration, parsed),
        expectedDescriptor(expected),
      )
    }

    const report = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.inputs.typedReport.path),
        'utf8',
      ),
    )
    const callerStrict = report.rows.filter(
      row => row.structural.index === fixture.units.callerTarget.index,
    )
    assert.equal(callerStrict.length, 1)
    assert.equal(callerStrict[0].value, 'killAllAgentsShortcut')
    assert.deepEqual(callerStrict[0].ownerPaths, [
      'components/tasks/BackgroundTasksDialog.tsx',
    ])
  },
)
