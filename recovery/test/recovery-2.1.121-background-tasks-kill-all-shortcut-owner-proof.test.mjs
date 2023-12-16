import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/background-tasks-kill-all-shortcut-owner-overrides.mjs'
import {
  TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_EVIDENCE_IDS,
  TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/background-tasks-kill-all-shortcut-owner-overrides.mjs'
import {
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
  'recovery/test/recovery-2.1.121-background-tasks-kill-all-shortcut-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '609508f806420ad62c2da2662a8c3794f9c5ee80c127429c19a6daa7bcbdfdd3'
const OWNER_MODULE_SHA256 =
  'f025233a87cc8092efc1053d060494eb49e4a42508a871823d640faf4f288bb3'

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

function assertNodeRegion(bundle, parsedUnit, node, expected) {
  assert.equal(parsedUnit.start + node.start, expected.start)
  assert.equal(parsedUnit.start + node.end, expected.end)
  const value = bundle.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected))
  if (expected.text !== undefined) assert.equal(value.toString(), expected.text)
  return value.toString()
}

function findNodes(root, predicate) {
  const matches = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (predicate(node)) matches.push(node)
    for (const child of Object.values(node)) {
      if (!child || typeof child !== 'object') continue
      if (Array.isArray(child)) child.forEach(visit)
      else visit(child)
    }
  }
  visit(root)
  return matches
}

function findDetailCall(unit) {
  const matches = findNodes(
    unit,
    node =>
      node.type === 'CallExpression' &&
      node.arguments?.[1]?.type === 'ObjectExpression' &&
      node.arguments[1].properties.some(property =>
        property.key?.name === 'agent'
      ) &&
      node.arguments[1].properties.some(property =>
        property.key?.name === 'onKillAgent'
      ),
  )
  assert.equal(matches.length, 1)
  return matches[0]
}

function propertyNames(object) {
  return object.properties.map(property => property.key.name)
}

function canonicalize(root) {
  const privateNames = new Map()
  let nextPrivateName = 0
  function visit(node, parent = null, key = null) {
    if (Array.isArray(node)) {
      return node.map(child => visit(child, parent, key))
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
      if (semanticName) return { type: 'Identifier', name: node.name }
      if (!privateNames.has(node.name)) {
        privateNames.set(node.name, `@id${nextPrivateName++}`)
      }
      return { type: 'Identifier', name: privateNames.get(node.name) }
    }
    if (node.type === 'VariableDeclaration') {
      return {
        type: 'VariableDeclaration',
        kind: 'var',
        declarations: visit(node.declarations, node, 'declarations'),
      }
    }
    const result = {}
    for (const [childKey, child] of Object.entries(node)) {
      if (
        !['start', 'end', 'loc', 'range', 'raw', 'shorthand'].includes(
          childKey,
        )
      ) {
        result[childKey] = visit(child, node, childKey)
      }
    }
    return result
  }
  return visit(root)
}

function canonicalDescriptor(node) {
  return descriptor(Buffer.from(JSON.stringify(canonicalize(node))))
}

function reverseTargetDelta(target) {
  const normalized = structuredClone(target)
  const backAndCount = normalized.body.body[12]
  assert.equal(backAndCount.type, 'VariableDeclaration')
  assert.equal(backAndCount.declarations.length, 2)
  const countName = backAndCount.declarations[1].id.name
  backAndCount.declarations.splice(1, 1)

  const detailCall = findDetailCall(normalized)
  const detailProps = detailCall.arguments[1].properties
  const propertyIndex = detailProps.findIndex(
    property => property.key?.name === 'killAllAgentsShortcut',
  )
  assert.notEqual(propertyIndex, -1)
  detailProps.splice(propertyIndex, 1)

  const categorized = normalized.body.body[2].declarations[0].id
  const agentTasks = categorized.properties.find(
    property => property.key.name === 'agentTasks',
  ).value.name
  const firstSelectorParameter =
    normalized.body.body[0].declarations[0].init.arguments[0].params[0].name
  const actions = normalized.body.body[14].declarations[4].init
  assert.equal(actions.type, 'ArrayExpression')
  assert.equal(actions.elements.length, 5)
  const outerKillSpread = actions.elements[3]
  const nestedKillAllSpread = outerKillSpread.argument.consequent.elements.pop()
  assert.equal(nestedKillAllSpread.type, 'SpreadElement')
  assert.equal(
    nestedKillAllSpread.argument.test.right.name,
    countName,
  )
  nestedKillAllSpread.argument.test = {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: agentTasks },
      property: { type: 'Identifier', name: 'some' },
      computed: false,
      optional: false,
    },
    arguments: [
      {
        type: 'ArrowFunctionExpression',
        id: null,
        expression: true,
        generator: false,
        async: false,
        params: [{ type: 'Identifier', name: firstSelectorParameter }],
        body: {
          type: 'BinaryExpression',
          left: {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: firstSelectorParameter },
            property: { type: 'Identifier', name: 'status' },
            computed: false,
            optional: false,
          },
          operator: '===',
          right: { type: 'Literal', value: 'running', raw: '"running"' },
        },
      },
    ],
    optional: false,
  }
  actions.elements.splice(4, 0, nestedKillAllSpread)
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
  const tuples = rows.map(rowTuple)
  const value = Buffer.from(tuples.map(JSON.stringify).join('\n'))
  return { ...descriptor(value), tuples }
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

function assertSourceNode(source, parsed, node, expected) {
  assert.equal(node.getStart(parsed), expected.charStart)
  assert.equal(node.end, expected.charEnd)
  assert.equal(node.end - node.getStart(parsed), expected.chars)
  assert.deepEqual(sourceRegion(source, node, parsed), expectedDescriptor(expected))
}

function findTsNodes(ts, parsed, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return matches
}

function jsxCall(ts, parsed, name) {
  const matches = findTsNodes(
    ts,
    parsed,
    node =>
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(parsed) === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0]
}

function variableDeclaration(ts, parsed, name) {
  const matches = findTsNodes(
    ts,
    parsed,
    node =>
      ts.isVariableDeclaration(node) && node.name.getText(parsed) === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0]
}

test(
  'Target121 BackgroundTasksDialog static owner proof is frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    const moduleBytes = fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases/2.1.120-to-2.1.121/recovered/background-tasks-kill-all-shortcut-owner-overrides.mjs',
      ),
    )
    assert.equal(sha256(moduleBytes), OWNER_MODULE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-graph-open',
    )
    assert.deepEqual(
      Object.keys(ownerProofModule).sort(),
      [
        'TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_EVIDENCE_IDS',
        'TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_OWNER_OVERRIDES',
      ],
    )
    assert.deepEqual(
      TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_OWNER_OVERRIDES.map(
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
          key: `${caseName}:17548`,
          targetIndex: 17548,
          paths: ['src/components/tasks/BackgroundTasksDialog.tsx'],
          declarations: ['BackgroundTasksDialog'],
          evidenceIds:
            TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_EVIDENCE_IDS,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(
        TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_OWNER_OVERRIDES,
      ),
      true,
    )
    assert.match(
      TARGET121_BACKGROUND_TASKS_KILL_ALL_SHORTCUT_OWNER_OVERRIDES[0]
        .behavior,
      /cohesive with the separately proved u17497 consumer.*source replay remains blocked/s,
    )
    assert.deepEqual(fixture.expectedStrictEvolution, {
      before: { units: 42, residues: 423 },
      after: { units: 41, residues: 422 },
      removedIndices: [17548],
      removedAddedOwnerRows: 1,
    })
  },
)

test(
  'complete u17548 target unit reduces exactly to u17428 after the three semantic reversals',
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

    assertNodeRegion(
      baseline,
      baselineUnit,
      baselineUnit.node.params[0],
      fixture.bundleRegions.baselineParams,
    )
    assertNodeRegion(
      target,
      targetUnit,
      targetUnit.node.params[0],
      fixture.bundleRegions.targetParams,
    )
    assert.deepEqual(
      propertyNames(baselineUnit.node.params[0]),
      ['onDone', 'toolUseContext', 'initialDetailTaskId', 'onBack'],
    )
    assert.deepEqual(
      propertyNames(targetUnit.node.params[0]),
      ['onDone', 'toolUseContext', 'initialDetailTaskId', 'onBack'],
    )

    for (const [bundle, parsed, region] of [
      [baseline, baselineUnit, fixture.bundleRegions.baselineKeyHandler],
      [target, targetUnit, fixture.bundleRegions.targetKeyHandler],
      [baseline, baselineUnit, fixture.bundleRegions.baselineBackStatement],
      [
        target,
        targetUnit,
        fixture.bundleRegions.targetBackAndCountStatement,
      ],
    ]) {
      const node = parsed.node.body.body[region.statementIndex]
      assertNodeRegion(bundle, parsed, node, region)
    }
    const baselineKeyHandler = baseline.subarray(
      fixture.bundleRegions.baselineKeyHandler.start,
      fixture.bundleRegions.baselineKeyHandler.end,
    ).toString()
    const targetKeyHandler = target.subarray(
      fixture.bundleRegions.targetKeyHandler.start,
      fixture.bundleRegions.targetKeyHandler.end,
    ).toString()
    for (const keyguard of ['!r.ctrl&&!r.meta']) {
      assert.equal(occurrenceCount(baselineKeyHandler, keyguard), 2)
      assert.equal(occurrenceCount(targetKeyHandler, keyguard), 2)
    }

    const countDeclarator = targetUnit.node.body.body[12].declarations[1]
    assertNodeRegion(
      target,
      targetUnit,
      countDeclarator,
      fixture.bundleRegions.targetCountDeclarator,
    )
    assert.equal(countDeclarator.init.operator, '>')
    assert.equal(countDeclarator.init.right.value, 1)

    const baselineDetail = findDetailCall(baselineUnit.node)
    const targetDetail = findDetailCall(targetUnit.node)
    assertNodeRegion(
      baseline,
      baselineUnit,
      baselineDetail,
      fixture.bundleRegions.baselineDetailCall,
    )
    assertNodeRegion(
      target,
      targetUnit,
      targetDetail,
      fixture.bundleRegions.targetDetailCall,
    )
    assert.deepEqual(propertyNames(baselineDetail.arguments[1]), [
      'agent',
      'onDone',
      'onKillAgent',
      'onBack',
      'key',
    ])
    assert.deepEqual(propertyNames(targetDetail.arguments[1]), [
      'agent',
      'onDone',
      'onKillAgent',
      'onBack',
      'killAllAgentsShortcut',
      'key',
    ])
    const targetProperty = targetDetail.arguments[1].properties.find(
      property => property.key.name === 'killAllAgentsShortcut',
    )
    assertNodeRegion(
      target,
      targetUnit,
      targetProperty,
      fixture.bundleRegions.targetProperty,
    )

    const baselineActions = baselineUnit.node.body.body[14].declarations[4].init
    const targetActions = targetUnit.node.body.body[14].declarations[4].init
    assertNodeRegion(
      baseline,
      baselineUnit,
      baselineActions,
      fixture.bundleRegions.baselineActions,
    )
    assertNodeRegion(
      target,
      targetUnit,
      targetActions,
      fixture.bundleRegions.targetActions,
    )
    assert.equal(baselineActions.elements.length, 6)
    assert.equal(targetActions.elements.length, 5)
    assertNodeRegion(
      baseline,
      baselineUnit,
      baselineActions.elements[3],
      fixture.bundleRegions.baselineOuterKillSpread,
    )
    assertNodeRegion(
      baseline,
      baselineUnit,
      baselineActions.elements[4],
      fixture.bundleRegions.baselineIndependentKillAllSpread,
    )
    assertNodeRegion(
      target,
      targetUnit,
      targetActions.elements[3],
      fixture.bundleRegions.targetOuterKillSpread,
    )
    assertNodeRegion(
      target,
      targetUnit,
      targetActions.elements[3].argument.consequent.elements[1],
      fixture.bundleRegions.targetNestedKillAllSpread,
    )

    const normalizedTarget = reverseTargetDelta(targetUnit.node)
    assert.deepEqual(
      canonicalDescriptor(normalizedTarget),
      fixture.wholeUnitProof.targetAfterReversingDelta,
    )
    assert.deepEqual(
      canonicalDescriptor(normalizedTarget),
      canonicalDescriptor(baselineUnit.node),
    )
  },
)

test(
  'typed report pins the one strict row and all 138 owner rows evolution-aware',
  { skip: !selected },
  () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.inputs.typedReport.path),
        'utf8',
      ),
    )
    for (const [fixtureKey, reportKey] of [
      ['addedOwner', 'sourceRuntimeAddedOwnerResidueRows'],
      ['owner', 'sourceRuntimeOwnerResidueRows'],
    ]) {
      const actual = canonicalRows(
        report[reportKey].filter(
          row => row.structural.index === fixture.units.target.index,
        ),
      )
      assert.equal(actual.tuples.length, fixture.rows[fixtureKey].count)
      assert.equal(actual.bytes, fixture.rows[fixtureKey].canonicalBytes)
      assert.equal(actual.sha256, fixture.rows[fixtureKey].canonicalSha256)
      if (fixture.rows[fixtureKey].tuples) {
        assert.deepEqual(actual.tuples, fixture.rows[fixtureKey].tuples)
      }
    }
    const strict = report.rows.filter(
      row => row.structural.index === fixture.units.target.index,
    )
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
  'mapped and compiled BackgroundTasksDialog sources authenticate ownership but remain replay-incomplete',
  { skip: !selected },
  async () => {
    const sourceBytes = fs.readFileSync(
      selectedSourcePath(fixture.inputs.sourceFile.path),
    )
    const sourceActual = descriptor(sourceBytes)
    const packageSource =
      sourceActual.sha256 === fixture.inputs.sourceFile.sha256
    assert.deepEqual(
      sourceActual,
      expectedDescriptor(
        packageSource
          ? fixture.inputs.sourceFile
          : fixture.repositoryAlternates.sourceFile,
      ),
    )
    const source = sourceBytes.toString()
    const ts = await loadTypeScript()
    const parsed = parseSource(ts, source, fixture.inputs.sourceFile.path)

    for (const [name, expected] of [
      ['Props', fixture.sourceEvidence.compiledProps],
      [
        'getSelectableBackgroundTasks',
        fixture.sourceEvidence.compiledHelper,
      ],
    ]) {
      assertSourceNode(
        source,
        parsed,
        namedDeclaration(ts, parsed, name),
        expected,
      )
    }
    const declarationExpected = packageSource
      ? fixture.sourceEvidence.compiledDeclaration
      : fixture.repositoryAlternates.sourceDeclaration
    const declaration = namedDeclaration(
      ts,
      parsed,
      'BackgroundTasksDialog',
    )
    assertSourceNode(source, parsed, declaration, declarationExpected)
    assert.deepEqual(
      declaration.parameters[0].name.elements.map(element =>
        element.name.getText(parsed)
      ),
      ['onDone', 'toolUseContext', 'initialDetailTaskId'],
    )

    for (const [moduleName, expected] of [
      ['../../utils/array.js', fixture.sourceEvidence.countImport],
      [
        './AsyncAgentDetailDialog.js',
        fixture.sourceEvidence.asyncDialogImport,
      ],
    ]) {
      const imports = parsed.statements.filter(
        statement =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text === moduleName,
      )
      assert.equal(imports.length, 1)
      assertSourceNode(source, parsed, imports[0], expected)
    }

    const asyncCallExpected = packageSource
      ? fixture.sourceEvidence.compiledAsyncCall
      : fixture.repositoryAlternates.sourceAsyncCall
    const asyncCall = jsxCall(ts, parsed, 'AsyncAgentDetailDialog')
    assertSourceNode(source, parsed, asyncCall, asyncCallExpected)
    assert.equal(
      occurrenceCount(asyncCall.getText(parsed), 'killAllAgentsShortcut'),
      0,
    )

    const handleKeyDown = variableDeclaration(ts, parsed, 'handleKeyDown')
    assertSourceNode(
      source,
      parsed,
      handleKeyDown,
      fixture.sourceEvidence.compiledHandleKeyDown,
    )
    assert.equal(occurrenceCount(handleKeyDown.getText(parsed), '.ctrl'), 0)
    assert.equal(occurrenceCount(handleKeyDown.getText(parsed), '.meta'), 0)

    const runningCountExpected = packageSource
      ? fixture.sourceEvidence.compiledRunningAgentCount
      : fixture.repositoryAlternates.sourceRunningAgentCount
    assertSourceNode(
      source,
      parsed,
      variableDeclaration(ts, parsed, 'runningAgentCount'),
      runningCountExpected,
    )
    const actionsExpected = packageSource
      ? fixture.sourceEvidence.compiledActions
      : fixture.repositoryAlternates.sourceActions
    const actions = variableDeclaration(ts, parsed, 'actions')
    assertSourceNode(source, parsed, actions, actionsExpected)
    assert.equal(actionsExpected.bytes - actionsExpected.chars, 6)
    const killHints = findTsNodes(
      ts,
      actions,
      node =>
        ts.isJsxSelfClosingElement(node) &&
        node.getText(parsed).includes('key="kill-all"'),
    )
    assert.equal(killHints.length, 1)
    const killHintExpected = packageSource
      ? fixture.sourceEvidence.compiledKillAllHint
      : fixture.repositoryAlternates.sourceKillAllHint
    assertSourceNode(source, parsed, killHints[0], killHintExpected)
    assert.equal(occurrenceCount(killHints[0].getText(parsed), 'format'), 0)
    assert.equal(occurrenceCount(source, 'killAllAgentsShortcut'), 0)
    assert.doesNotMatch(
      declaration.getText(parsed),
      /count\(agentTasks,[\s\S]{0,100}status === ['"]running['"][\s\S]{0,20}\)\s*>\s*1/,
    )

    const prefix =
      '//# sourceMappingURL=data:application/json;charset=utf-8;base64,'
    const tailStart = source.lastIndexOf(prefix)
    assert.equal(
      tailStart,
      packageSource
        ? fixture.sourceEvidence.sourceMap.tailStart
        : fixture.repositoryAlternates.sourceMapTailStart,
    )
    const tail = Buffer.from(source.slice(tailStart))
    assert.deepEqual(
      descriptor(tail),
      fixture.sourceEvidence.sourceMap.tail,
    )
    const decoded = Buffer.from(
      source.slice(tailStart + prefix.length).trim(),
      'base64',
    )
    assert.deepEqual(
      descriptor(decoded),
      fixture.sourceEvidence.sourceMap.decodedJson,
    )
    const sourceMap = JSON.parse(decoded)
    assert.deepEqual(sourceMap.sources, fixture.sourceEvidence.sourceMap.sources)
    assert.equal(sourceMap.sourcesContent.length, 1)
    const authored = sourceMap.sourcesContent[0]
    assert.deepEqual(
      descriptor(Buffer.from(authored)),
      fixture.sourceEvidence.sourceMap.authoredContent,
    )
    const authoredParsed = parseSource(ts, authored, sourceMap.sources[0])
    for (const [name, expected] of [
      ['Props', fixture.sourceEvidence.authoredProps],
      [
        'BackgroundTasksDialog',
        fixture.sourceEvidence.authoredDeclaration,
      ],
    ]) {
      assertSourceNode(
        authored,
        authoredParsed,
        namedDeclaration(ts, authoredParsed, name),
        expected,
      )
    }
    assertSourceNode(
      authored,
      authoredParsed,
      jsxCall(ts, authoredParsed, 'AsyncAgentDetailDialog'),
      fixture.sourceEvidence.authoredAsyncCall,
    )
    assertSourceNode(
      authored,
      authoredParsed,
      variableDeclaration(ts, authoredParsed, 'handleKeyDown'),
      fixture.sourceEvidence.authoredHandleKeyDown,
    )
    const authoredActions = variableDeclaration(
      ts,
      authoredParsed,
      'actions',
    )
    assertSourceNode(
      authored,
      authoredParsed,
      authoredActions,
      fixture.sourceEvidence.authoredActions,
    )
    const authoredHints = findTsNodes(
      ts,
      authoredActions,
      node =>
        ts.isJsxSelfClosingElement(node) &&
        node.getText(authoredParsed).includes('key="kill-all"'),
    )
    assert.equal(authoredHints.length, 1)
    assertSourceNode(
      authored,
      authoredParsed,
      authoredHints[0],
      fixture.sourceEvidence.authoredKillAllHint,
    )
    assert.equal(occurrenceCount(authored, 'killAllAgentsShortcut'), 0)
    assert.equal(occurrenceCount(authoredHints[0].getText(authoredParsed), 'format'), 0)

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
  },
)

test(
  'three upstream calls and the u17497 downstream consumer prove the source graph remains open',
  { skip: !selected },
  async () => {
    const baseline = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.baselineBundle.path),
    )
    const target = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.targetBundle.path),
    )
    assert.equal(
      occurrenceCount(target.toString(), fixture.callerGraph.targetSymbol),
      fixture.callerGraph.targetReferenceCountIncludingDefinition,
    )
    assert.equal(
      occurrenceCount(baseline.toString(), fixture.callerGraph.baselineSymbol),
      fixture.callerGraph.baselineReferenceCountIncludingDefinition,
    )
    for (const [bundle, symbol, callers] of [
      [target, fixture.callerGraph.targetSymbol, fixture.callerGraph.targetCallers],
      [
        baseline,
        fixture.callerGraph.baselineSymbol,
        fixture.callerGraph.baselineCallers,
      ],
    ]) {
      for (const caller of callers) {
        const unit = parseUnit(bundle, caller.unit)
        const calls = findNodes(
          unit.node,
          node =>
            node.type === 'CallExpression' &&
            node.arguments?.[0]?.type === 'Identifier' &&
            node.arguments[0].name === symbol,
        )
        assert.equal(calls.length, 1)
        assertNodeRegion(bundle, unit, calls[0], caller.call)
        assert.equal(
          propertyNames(calls[0].arguments[1]).includes(
            'killAllAgentsShortcut',
          ),
          false,
        )
      }
    }
    const targetAgentsCall = fixture.callerGraph.targetCallers[1].call.text
    assert.match(targetAgentsCall, /initialDetailTaskId:.*onBack:.*onDone:/)

    const ts = await loadTypeScript()
    const commandsBytes = readExact(
      selectedSourcePath(fixture.inputs.commandsCallerSourceFile.path),
      fixture.inputs.commandsCallerSourceFile,
    )
    const commands = commandsBytes.toString()
    const commandsParsed = parseSource(
      ts,
      commands,
      fixture.inputs.commandsCallerSourceFile.path,
    )
    assertSourceNode(
      commands,
      commandsParsed,
      jsxCall(ts, commandsParsed, 'BackgroundTasksDialog'),
      fixture.callerGraph.sourceCallers.commands,
    )

    const promptBytes = fs.readFileSync(
      selectedSourcePath(fixture.inputs.promptCallerSourceFile.path),
    )
    const packagePrompt =
      sha256(promptBytes) === fixture.inputs.promptCallerSourceFile.sha256
    assert.deepEqual(
      descriptor(promptBytes),
      expectedDescriptor(
        packagePrompt
          ? fixture.inputs.promptCallerSourceFile
          : fixture.repositoryAlternates.promptCallerSourceFile,
      ),
    )
    const prompt = promptBytes.toString()
    const promptParsed = parseSource(
      ts,
      prompt,
      fixture.inputs.promptCallerSourceFile.path,
    )
    assertSourceNode(
      prompt,
      promptParsed,
      jsxCall(ts, promptParsed, 'BackgroundTasksDialog'),
      packagePrompt
        ? fixture.callerGraph.sourceCallers.prompt
        : fixture.repositoryAlternates.promptCall,
    )

    const agentsBytes = fs.readFileSync(
      selectedSourcePath(fixture.inputs.agentsMenuSourceFile.path),
    )
    const packageAgents =
      sha256(agentsBytes) === fixture.inputs.agentsMenuSourceFile.sha256
    assert.deepEqual(
      descriptor(agentsBytes),
      expectedDescriptor(
        packageAgents
          ? fixture.inputs.agentsMenuSourceFile
          : fixture.repositoryAlternates.agentsMenuSourceFile,
      ),
    )
    const agents = agentsBytes.toString()
    const agentsParsed = parseSource(
      ts,
      agents,
      fixture.inputs.agentsMenuSourceFile.path,
    )
    const agentsDeclarationName = packageAgents
      ? fixture.agentsMenuSourceGap.declarationName
      : fixture.repositoryAlternates.agentsMenuDeclarationName
    const agentsDeclarationExpected = packageAgents
      ? fixture.agentsMenuSourceGap.declaration
      : fixture.repositoryAlternates.agentsMenuDeclaration
    assertSourceNode(
      agents,
      agentsParsed,
      namedDeclaration(ts, agentsParsed, agentsDeclarationName),
      agentsDeclarationExpected,
    )
    assert.equal(
      occurrenceCount(agents, 'BackgroundTasksDialog'),
      fixture.agentsMenuSourceGap.backgroundTasksDialogOccurrences,
    )
    assert.equal(
      occurrenceCount(agents, 'task-detail'),
      fixture.agentsMenuSourceGap.taskDetailOccurrences,
    )

    readExact(
      path.join(repositoryRoot, fixture.inputs.downstreamProofFixture.path),
      fixture.inputs.downstreamProofFixture,
    )
    readExact(
      path.join(repositoryRoot, fixture.inputs.downstreamOverrideModule.path),
      fixture.inputs.downstreamOverrideModule,
    )
    const downstreamFixture = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.inputs.downstreamProofFixture.path),
        'utf8',
      ),
    )
    assert.equal(
      downstreamFixture.units.target.index,
      fixture.downstreamContract.targetUnitIndex,
    )
    assert.equal(
      downstreamFixture.units.baseline.index,
      fixture.downstreamContract.baselineUnitIndex,
    )
    assert.equal(
      downstreamFixture.units.callerTarget.index,
      fixture.units.target.index,
    )
    assert.equal(
      downstreamFixture.callerBoundary.targetPropertyAbsolute.start,
      fixture.bundleRegions.targetProperty.start,
    )
    assert.equal(
      downstreamFixture.bundleRegions.targetKillHint.text.includes(
        `action:"${fixture.downstreamContract.targetHintAction}"`,
      ),
      true,
    )
    assert.equal(
      downstreamFixture.bundleRegions.targetKillHint.text.includes(
        `keyCase:"${fixture.downstreamContract.targetHintKeyCase}"`,
      ),
      true,
    )
    assert.deepEqual(
      TARGET121_ASYNC_AGENT_KILL_ALL_SHORTCUT_OWNER_OVERRIDES.map(
        override => override.key,
      ),
      [`${caseName}:${fixture.downstreamContract.targetUnitIndex}`],
    )
    const downstreamSource = readExact(
      selectedSourcePath(fixture.inputs.downstreamSourceFile.path),
      fixture.inputs.downstreamSourceFile,
    ).toString()
    assert.equal(
      occurrenceCount(
        downstreamSource,
        fixture.downstreamContract.targetPropertyName,
      ),
      fixture.downstreamContract.sourcePropertyOccurrences,
    )
    assert.equal(
      occurrenceCount(downstreamSource, '!e.ctrl'),
      fixture.downstreamContract.sourceCtrlGuardOccurrences,
    )
  },
)

test(
  'kill-all threshold and context truth table is exact',
  { skip: !selected },
  () => {
    const chord = 'ctrl+x ctrl+k'
    for (const row of fixture.behaviorTruthTable) {
      const baselineListHint = row.runningBackgroundLocalAgents > 0
      const guard = row.runningBackgroundLocalAgents > 1
      const selectedRunning = row.selectionStatus === 'running'
      const targetListHint =
        selectedRunning && row.selectionType === 'local_agent' && guard
      const targetDetailProp =
        row.selectionType === 'local_agent' && guard ? chord : undefined
      const targetDetailHint = selectedRunning && Boolean(targetDetailProp)
      assert.equal(baselineListHint, row.baselineListHint)
      assert.equal(targetListHint, row.targetListHint)
      assert.equal(Boolean(targetDetailProp), row.targetDetailProp)
      assert.equal(targetDetailHint, row.targetDetailHint)
    }
  },
)
