import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_EVIDENCE_IDS,
  TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/subagent-status-line-schema-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-subagent-status-line-schema-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '66f0eeacf46de48aeca3e4b8fb606ac745507713f488a36ae74e29985dad2c4d'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function sourceDescriptor(value) {
  return {
    chars: value.length,
    bytes: Buffer.byteLength(value),
    sha256: sha256(value),
  }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function readLedger(input) {
  return JSON.parse(gunzipSync(readPinned(input)))
}

function slicePinned(bundle, input) {
  const value = bundle.subarray(input.start, input.end)
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function canonicalAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalAst(entry, value, index))
  }
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (key === 'name' && value.type === 'Identifier') {
      const preserve =
        (parent?.type === 'MemberExpression' &&
          parent.computed === false &&
          parentKey === 'property') ||
        (parent?.type === 'Property' &&
          parent.computed === false &&
          parent.shorthand === false &&
          parentKey === 'key') ||
        (parent?.type === 'MethodDefinition' &&
          parent.computed === false &&
          parentKey === 'key')
      result[key] = preserve ? child : '@id'
    } else {
      result[key] = canonicalAst(child, value, key)
    }
  }
  return result
}

function canonicalDescriptor(value) {
  const ast = parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const serialized = JSON.stringify(canonicalAst(ast))
  return {
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function walkAcorn(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walkAcorn(child, predicate, values)
    } else {
      walkAcorn(value, predicate, values)
    }
  }
  return values
}

function rawDifferenceRuns(baseline, target) {
  assert.equal(baseline.length, target.length)
  const rows = []
  for (let index = 0; index < baseline.length; ) {
    if (baseline[index] === target[index]) {
      index += 1
      continue
    }
    const start = index
    while (index < baseline.length && baseline[index] !== target[index]) {
      index += 1
    }
    rows.push([
      start,
      index,
      baseline.subarray(start, index).toString(),
      target.subarray(start, index).toString(),
    ])
  }
  const serialized = JSON.stringify(rows)
  return {
    rows,
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function schemaInitializerFacts(value) {
  const ast = parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  assert.equal(ast.body.length, 1)
  const declaration = ast.body[0]
  assert.equal(declaration.type, 'VariableDeclaration')
  assert.equal(declaration.declarations.length, 1)
  const outerCall = declaration.declarations[0].init
  assert.equal(outerCall.type, 'CallExpression')
  assert.equal(outerCall.arguments.length, 1)
  const moduleArrow = outerCall.arguments[0]
  assert.equal(moduleArrow.type, 'ArrowFunctionExpression')
  assert.equal(moduleArrow.body.type, 'BlockStatement')
  const statements = moduleArrow.body.body
  const dependencyStatements = statements.slice(0, -1)
  for (const statement of dependencyStatements) {
    assert.equal(statement.type, 'ExpressionStatement')
    assert.equal(statement.expression.type, 'CallExpression')
    assert.equal(statement.expression.arguments.length, 0)
  }
  const assignment = statements.at(-1).expression
  assert.equal(assignment.type, 'AssignmentExpression')
  assert.equal(assignment.operator, '=')
  assert.equal(assignment.right.type, 'CallExpression')
  assert.equal(assignment.right.arguments.length, 1)
  const lazyArrow = assignment.right.arguments[0]
  assert.equal(lazyArrow.type, 'ArrowFunctionExpression')
  const schemaCall = lazyArrow.body
  assert.equal(schemaCall.type, 'CallExpression')
  assert.equal(schemaCall.callee.type, 'MemberExpression')
  assert.equal(schemaCall.callee.property.name, 'object')
  assert.equal(schemaCall.arguments.length, 1)
  const schemaObject = schemaCall.arguments[0]
  assert.equal(schemaObject.type, 'ObjectExpression')
  const keys = schemaObject.properties.map(
    property => property.key.name ?? property.key.value,
  )
  const valueCallees = schemaObject.properties.map(property => {
    assert.equal(property.value.type, 'CallExpression')
    assert.equal(property.value.callee.type, 'MemberExpression')
    assert.equal(property.value.arguments.length, 0)
    return property.value.callee.property.name
  })
  return {
    dependencyCalls: dependencyStatements.length,
    assignment,
    schemaCall,
    keys,
    valueCallees,
  }
}

function assertTargetRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert.ok(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokenCount: region.target.tokenCount,
      sha256: region.target.sourceHash,
      coarseHash: region.target.coarseHash,
    },
    {
      classification: expected.classification,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokenCount: expected.tokenCount,
      sha256: expected.sha256,
      coarseHash: expected.coarseHash,
    },
  )
  if ('baselineUnitIndex' in expected) {
    assert.equal(region.baselineUnitIndex, expected.baselineUnitIndex)
    assert.equal(region.pairReason, expected.pairReason)
  }
  if ('unknownFreeIdentifierCount' in expected) {
    assert.equal(
      region.unknownFreeIdentifierCount,
      expected.unknownFreeIdentifierCount,
    )
  }
  return region
}

function rowIdentity(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
    row.targetAdded,
  ]
}

function rowSetDescriptor(rows) {
  const serialized = JSON.stringify(rows.map(rowIdentity))
  return {
    rows: rows.length,
    jsonBytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
}

function runGit(args, options = {}) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? null,
  })
}

function gitShow(commit, sourcePath) {
  const result = runGit(['show', `${commit}:${sourcePath}`])
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout
}

function gitRevParse(spec) {
  const result = runGit(['rev-parse', spec], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        root,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function assertSourceSlice(source, input) {
  const value = source.slice(input.start, input.end)
  assert.deepEqual(sourceDescriptor(value), {
    chars: input.chars,
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

test('Target119 subagent-status-line fixture exposes one frozen static override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.deepEqual(
    TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_OWNER_OVERRIDES,
    [
      {
        key: '2.1.118-to-2.1.119:20274',
        targetIndex: 20274,
        paths: ['src/utils/subagentStatusLine.ts'],
        declarations: [
          'SubagentStatusLineOutputSchema',
          'executeSubagentStatusLine',
        ],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_OWNER_OVERRIDES[0]
            .behavior,
      },
    ],
  )
  readPinned(fixture.inputs.ownerOverride)
  assert.deepEqual(fixture.expectedImpact, {
    ownerOverrideCount: 1,
    strictUnitsRemoved: 1,
    strictResiduesRemoved: 1,
    sourceFilesReplayed: 0,
    packageCallOrder: null,
    mode: 'static-coverage-only',
  })
})

test('complete Target118 and Target119 schema initializers are alpha-identical', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const ledger = readLedger(fixture.inputs.targetLedger)
  assertTargetRegion(ledger, fixture.targetUnit)
  const baselineUnit = slicePinned(baselineBundle, fixture.baselineUnit)
  const targetUnit = slicePinned(targetBundle, fixture.targetUnit)
  const baselineCanonical = canonicalDescriptor(baselineUnit)
  const targetCanonical = canonicalDescriptor(targetUnit)
  assert.deepEqual(baselineCanonical, {
    bytes: fixture.wholeUnitEquivalence.canonicalAstBytes,
    sha256: fixture.wholeUnitEquivalence.canonicalAstSha256,
  })
  assert.deepEqual(targetCanonical, baselineCanonical)
  assert.notEqual(targetUnit.toString(), baselineUnit.toString())
  const differences = rawDifferenceRuns(baselineUnit, targetUnit)
  assert.deepEqual(
    {
      rows: differences.rows.length,
      jsonBytes: differences.bytes,
      sha256: differences.sha256,
    },
    {
      rows: fixture.wholeUnitEquivalence.rawDifferenceRuns,
      jsonBytes: fixture.wholeUnitEquivalence.rawDifferenceRunsJsonBytes,
      sha256: fixture.wholeUnitEquivalence.rawDifferenceRunsSha256,
    },
  )

  for (const [unit, absoluteStart, assignment, expression] of [
    [
      baselineUnit,
      fixture.baselineUnit.start,
      fixture.schema.baselineAssignment,
      fixture.schema.baselineExpression,
    ],
    [
      targetUnit,
      fixture.targetUnit.start,
      fixture.schema.targetAssignment,
      fixture.schema.targetExpression,
    ],
  ]) {
    const facts = schemaInitializerFacts(unit)
    assert.equal(
      facts.dependencyCalls,
      fixture.wholeUnitEquivalence.dependencyInitializerCalls,
    )
    assert.deepEqual(facts.keys, fixture.schema.keys)
    assert.deepEqual(facts.valueCallees, fixture.schema.valueCallees)
    for (const [node, expected] of [
      [facts.assignment, assignment],
      [facts.schemaCall, expression],
    ]) {
      const value = unit.subarray(node.start, node.end)
      assert.deepEqual(
        {
          start: absoluteStart + node.start,
          end: absoluteStart + node.end,
          ...descriptor(value),
        },
        expected,
      )
    }
  }

  for (const row of fixture.residueProof.ownerRows) {
    const target = targetBundle.subarray(row.identity[3], row.identity[4])
    const baseline = baselineBundle.subarray(
      row.baselineStart,
      row.baselineEnd,
    )
    assert.equal(row.identity[3] - fixture.targetUnit.start, row.relativeOffset)
    assert.equal(row.baselineStart - fixture.baselineUnit.start, row.relativeOffset)
    assert.deepEqual(descriptor(target), {
      bytes: row.bytes,
      sha256: row.sha256,
    })
    assert.deepEqual(descriptor(baseline), descriptor(target))
    assert.equal(target.toString(), row.text)
    assert.equal(baseline.toString(), row.text)
  }
})

test('retained caller and constants bind schema validation to decoration output', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const ledger = readLedger(fixture.inputs.targetLedger)
  const expected = fixture.runtimeCallerBoundary
  for (const input of [expected.targetCaller, expected.targetConstants]) {
    assertTargetRegion(ledger, {
      targetIndex: input.index,
      classification: input.classification,
      nodeType:
        input === expected.targetCaller
          ? 'FunctionDeclaration'
          : 'VariableDeclaration',
      start: input.start,
      end: input.end,
      bytes: input.bytes,
      tokenCount: input.tokenCount,
      sha256: input.sha256,
      coarseHash: input.coarseHash,
      baselineUnitIndex: input.baselineUnitIndex,
      pairReason: input.pairReason,
      unknownFreeIdentifierCount: input.unknownFreeIdentifierCount,
    })
  }
  const baselineCaller = slicePinned(baselineBundle, expected.baselineCaller)
  const targetCaller = slicePinned(targetBundle, expected.targetCaller)
  assert.deepEqual(canonicalDescriptor(baselineCaller), {
    bytes: expected.baselineCaller.canonicalAstBytes,
    sha256: expected.baselineCaller.canonicalAstSha256,
  })
  assert.deepEqual(canonicalDescriptor(targetCaller), {
    bytes: expected.targetCaller.canonicalAstBytes,
    sha256: expected.targetCaller.canonicalAstSha256,
  })
  assert.deepEqual(canonicalDescriptor(targetCaller), canonicalDescriptor(baselineCaller))

  const baselineConstants = slicePinned(
    baselineBundle,
    expected.baselineConstants,
  )
  const targetConstants = slicePinned(targetBundle, expected.targetConstants)
  assert.deepEqual(
    canonicalDescriptor(targetConstants),
    canonicalDescriptor(baselineConstants),
  )

  for (const [bundle, input] of [
    [baselineBundle, expected.baselineSafeParse],
    [targetBundle, expected.targetSafeParse],
    [baselineBundle, expected.baselineDecorationAssignment],
    [targetBundle, expected.targetDecorationAssignment],
  ]) {
    slicePinned(bundle, input)
  }
  assert.equal(
    targetBundle
      .subarray(expected.targetSafeParse.start, expected.targetSafeParse.end)
      .toString(),
    expected.targetSafeParse.text,
  )
  assert.equal(
    targetBundle
      .subarray(
        expected.targetDecorationAssignment.start,
        expected.targetDecorationAssignment.end,
      )
      .toString(),
    expected.targetDecorationAssignment.text,
  )
})

test('later runtime keeps the schema but expands caller and initializer semantics', () => {
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const targetUnit = slicePinned(targetBundle, fixture.targetUnit)
  const targetFacts = schemaInitializerFacts(targetUnit)
  const expected = fixture.laterRuntimeBoundary
  const target120Bundle = readPinned(fixture.inputs.target120Bundle)
  const target120Ledger = readLedger(fixture.inputs.target120Ledger)
  assertTargetRegion(target120Ledger, expected.target120Caller)
  assertTargetRegion(target120Ledger, expected.target120Initializer)
  slicePinned(target120Bundle, expected.target120Caller)
  const target120Unit = slicePinned(
    target120Bundle,
    expected.target120Initializer,
  )
  const target120Facts = schemaInitializerFacts(target120Unit)
  assert.deepEqual(canonicalDescriptor(target120Unit), {
    bytes: expected.target120Initializer.canonicalAstBytes,
    sha256: expected.target120Initializer.canonicalAstSha256,
  })

  const target121Bundle = readPinned(fixture.inputs.target121Bundle)
  const target121Ledger = readLedger(fixture.inputs.target121Ledger)
  assertTargetRegion(target121Ledger, expected.target121Initializer)
  const target121Unit = slicePinned(
    target121Bundle,
    expected.target121Initializer,
  )
  const target121Facts = schemaInitializerFacts(target121Unit)
  assert.deepEqual(canonicalDescriptor(target121Unit), {
    bytes: expected.target121Initializer.canonicalAstBytes,
    sha256: expected.target121Initializer.canonicalAstSha256,
  })
  assert.deepEqual(
    canonicalDescriptor(target121Unit),
    canonicalDescriptor(target120Unit),
  )

  for (const [bundle, input, facts, unit] of [
    [
      target120Bundle,
      expected.target120Initializer,
      target120Facts,
      target120Unit,
    ],
    [
      target121Bundle,
      expected.target121Initializer,
      target121Facts,
      target121Unit,
    ],
  ]) {
    assert.equal(facts.dependencyCalls, input.dependencyInitializerCalls)
    assert.deepEqual(facts.keys, fixture.schema.keys)
    assert.deepEqual(facts.valueCallees, fixture.schema.valueCallees)
    const schema = unit.subarray(facts.schemaCall.start, facts.schemaCall.end)
    assert.deepEqual(
      {
        start: input.start + facts.schemaCall.start,
        end: input.start + facts.schemaCall.end,
        ...descriptor(schema),
      },
      input.schemaExpression,
    )
    assert.equal(
      bundle
        .subarray(
          input.schemaExpression.start,
          input.schemaExpression.end,
        )
        .toString()
        .includes('object({id:'),
      true,
    )
  }

  assert.deepEqual(
    {
      callerBytes:
        expected.target120Caller.bytes -
        fixture.runtimeCallerBoundary.targetCaller.bytes,
      callerTokens:
        expected.target120Caller.tokenCount -
        fixture.runtimeCallerBoundary.targetCaller.tokenCount,
      initializerBytes:
        expected.target120Initializer.bytes - fixture.targetUnit.bytes,
      initializerTokens:
        expected.target120Initializer.tokenCount - fixture.targetUnit.tokenCount,
      initializerDependencyCalls:
        target120Facts.dependencyCalls - targetFacts.dependencyCalls,
    },
    expected.temporalDelta,
  )
})

test('authored owner first appears in later source and is not a Target119 replay donor', async () => {
  const ts = await loadTypeScript()
  const expected = fixture.sourceBoundary
  const currentOwner = path.join(
    sourceRoot,
    expected.correctedPath.replace(/^src\//, ''),
  )
  assert.equal(fs.existsSync(currentOwner), false)
  const target119GitOwner = runGit([
    'cat-file',
    '-e',
    `${expected.target119Commit}:${expected.correctedPath}`,
  ])
  assert.notEqual(target119GitOwner.status, 0)
  assert.equal(expected.target119OwnerAbsent, true)

  for (const release of [expected.target120, expected.target121]) {
    const bytes = gitShow(release.commit, expected.correctedPath)
    assert.deepEqual(descriptor(bytes), {
      bytes: release.file.bytes,
      sha256: release.file.sha256,
    })
    assert.equal(
      gitRevParse(`${release.commit}:${expected.correctedPath}`),
      release.blob,
    )
    const source = bytes.toString()
    const sourceFile = ts.createSourceFile(
      expected.correctedPath,
      source,
      ts.ScriptTarget.Latest,
      true,
    )
    assert.equal(sourceFile.parseDiagnostics.length, 0)
    const nodes = []
    const visit = node => {
      nodes.push(node)
      node.forEachChild(visit)
    }
    visit(sourceFile)
    const schemaStatement = nodes.find(
      node =>
        ts.isVariableStatement(node) &&
        node.declarationList.declarations.some(
          declaration =>
            declaration.name.getText(sourceFile) ===
            'SubagentStatusLineOutputSchema',
        ),
    )
    assert.ok(schemaStatement)
    assert.equal(
      assertSourceSlice(source, release.schemaDeclaration),
      expected.schemaDeclarationText,
    )
    if (release.executeDeclaration) {
      const execute = nodes.find(
        node =>
          ts.isFunctionDeclaration(node) &&
          node.name?.text === 'executeSubagentStatusLine',
      )
      const safeParse = nodes.find(
        node =>
          ts.isCallExpression(node) &&
          node.expression.getText(sourceFile) ===
            'SubagentStatusLineOutputSchema.safeParse',
      )
      assert.ok(execute)
      assert.ok(safeParse)
      assert.deepEqual(
        {
          start: execute.getStart(sourceFile),
          end: execute.end,
          ...sourceDescriptor(
            source.slice(execute.getStart(sourceFile), execute.end),
          ),
        },
        release.executeDeclaration,
      )
      assert.deepEqual(
        {
          start: safeParse.getStart(sourceFile),
          end: safeParse.end,
          ...sourceDescriptor(
            source.slice(safeParse.getStart(sourceFile), safeParse.end),
          ),
        },
        release.safeParseCall,
      )
    }
  }

  const consumer = fixture.consumerBoundary
  const currentPath = path.join(
    sourceRoot,
    consumer.path.replace(/^src\//, ''),
  )
  const stat = fs.lstatSync(currentPath)
  assert.equal(stat.isFile(), true)
  assert.equal(stat.isSymbolicLink(), false)
  const currentSource = fs.readFileSync(currentPath, 'utf8')
  assert.deepEqual(sourceDescriptor(currentSource), consumer.target119.file)
  assert.equal(
    (currentSource.match(/subagentStatusLine/g) ?? []).length,
    consumer.target119.subagentStatusLineImportCount,
  )
  assert.equal(
    (currentSource.match(/taskDecorations/g) ?? []).length,
    consumer.target119.taskDecorationsIdentifierCount,
  )
  assert.deepEqual(
    descriptor(gitShow(consumer.target119.commit, consumer.path)),
    {
      bytes: consumer.target119.file.bytes,
      sha256: consumer.target119.file.sha256,
    },
  )
  assert.equal(
    gitRevParse(`${consumer.target119.commit}:${consumer.path}`),
    consumer.target119.blob,
  )

  const laterBytes = gitShow(consumer.target120.commit, consumer.path)
  assert.deepEqual(descriptor(laterBytes), {
    bytes: consumer.target120.file.bytes,
    sha256: consumer.target120.file.sha256,
  })
  assert.equal(
    gitRevParse(`${consumer.target120.commit}:${consumer.path}`),
    consumer.target120.blob,
  )
  const laterSource = laterBytes.toString()
  const laterImport = assertSourceSlice(
    laterSource,
    consumer.target120.typeImport,
  )
  assert.equal(laterImport.includes('../utils/subagentStatusLine.js'), true)
  assert.equal(laterImport.startsWith('import type '), true)
})

test('scanner partition is exact before correction and absent-or-exact afterward', () => {
  const observed = fixture.inputs.observedReport
  const reportPath = path.join(root, observed.path)
  if (!fs.existsSync(reportPath)) return
  const bytes = fs.readFileSync(reportPath)
  assert.equal(observed.mutableAfterCorrection, true)
  if (sha256(bytes) === observed.observedSha256) {
    assert.equal(bytes.length, observed.observedBytes)
  }
  const report = JSON.parse(bytes)
  const select = rows =>
    rows.filter(row => row.structural.index === fixture.targetUnit.targetIndex)
  const allOwnerRows = select(report.sourceRuntimeOwnerResidueRows)
  const addedOwnerRows = select(report.sourceRuntimeAddedOwnerResidueRows)
  const rawRows = select(report.rows)
  const expectedRows = fixture.residueProof.ownerRows.map(row => row.identity)
  const expectedAdded = expectedRows.filter(row => row[7])

  if (allOwnerRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(allOwnerRows),
      fixture.residueProof.allOwnerRows,
    )
    assert.deepEqual(allOwnerRows.map(rowIdentity), expectedRows)
  }
  assert.ok(
    addedOwnerRows.length === 0 ||
      JSON.stringify(addedOwnerRows.map(rowIdentity)) ===
        JSON.stringify(expectedAdded),
  )
  if (addedOwnerRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(addedOwnerRows),
      fixture.residueProof.addedOwnerRows,
    )
    for (const row of addedOwnerRows) {
      assert.ok(
        JSON.stringify(row.ownerPaths) ===
          JSON.stringify(['components/BridgeDialog.tsx']) ||
          JSON.stringify(row.ownerPaths) ===
            JSON.stringify(['utils/subagentStatusLine.ts']),
        'row owner must be the exact provisional or corrected source path',
      )
      assert.deepEqual(row.ownerSourceMatches, [])
    }
  }
  assert.deepEqual(rowSetDescriptor(rawRows), fixture.residueProof.rawReportRows)
  assert.deepEqual(
    expectedAdded.map(row => row[2]),
    fixture.residueProof.addedValues,
  )
})
