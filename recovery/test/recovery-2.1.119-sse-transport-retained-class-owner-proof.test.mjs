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
  TARGET119_SSE_TRANSPORT_RETAINED_CLASS_EVIDENCE_IDS,
  TARGET119_SSE_TRANSPORT_RETAINED_CLASS_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/sse-transport-retained-class-owner-overrides.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-sse-transport-retained-class-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'fad869e76e9bf5bca3edb4a0e5d48766e3fc7afefe6d982378d3f907ec901f69'
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
  return canonicalNodeDescriptor(ast)
}

function canonicalNodeDescriptor(node) {
  const serialized = JSON.stringify(canonicalAst(node))
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

function findRuntimeClass(unitText) {
  const ast = parse(unitText.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'script',
  })
  const classes = walkAcorn(ast, node => node.type === 'ClassExpression')
  assert.equal(classes.length, 1)
  return classes[0]
}

function runtimeMemberKey(node) {
  if (node.key?.type === 'Identifier') return node.key.name
  if (
    node.computed &&
    node.key?.type === 'MemberExpression' &&
    node.key.object?.type === 'Identifier' &&
    node.key.property?.type === 'Identifier'
  ) {
    return `${node.key.object.name}.${node.key.property.name}`
  }
  if (node.key?.type === 'Literal') return String(node.key.value)
  return node.key?.type ?? null
}

function runtimeMemberShape(unitText, runtimeClass) {
  const rows = runtimeClass.body.body.map((node, index) => ({
    index,
    type: node.type,
    kind: node.kind ?? null,
    computed: Boolean(node.computed),
    key: runtimeMemberKey(node),
    bytes: Buffer.byteLength(unitText.slice(node.start, node.end)),
  }))
  const serialized = JSON.stringify(rows)
  return {
    rows,
    bytes: Buffer.byteLength(serialized),
    sha256: sha256(serialized),
  }
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

function assertTargetRegion(ledger, expected) {
  const region = ledger.regions.find(
    candidate => candidate.target.index === expected.targetIndex,
  )
  assert.ok(region, `u${expected.targetIndex}`)
  const actual = {
    classification: region.classification,
    nodeType: region.target.nodeType,
    start: region.target.start,
    end: region.target.end,
    bytes: region.target.end - region.target.start,
    tokenCount: region.target.tokenCount,
    sha256: region.target.sourceHash,
    coarseHash: region.target.coarseHash,
  }
  const wanted = {
    classification: expected.classification,
    nodeType: expected.nodeType,
    start: expected.start,
    end: expected.end,
    bytes: expected.bytes,
    tokenCount: expected.tokenCount,
    sha256: expected.sha256,
    coarseHash: expected.coarseHash,
  }
  assert.deepEqual(actual, wanted)
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

function boundarySlice(bundle, input) {
  const value = slicePinned(bundle, input)
  assert.deepEqual(canonicalDescriptor(value), {
    bytes: input.canonicalAstBytes,
    sha256: input.canonicalAstSha256,
  })
  return value
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
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? null,
  })
  return result
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

function readSource(input) {
  const sourcePath = path.join(sourceRoot, input.path.replace(/^src\//, ''))
  const stat = fs.lstatSync(sourcePath)
  assert.equal(stat.isFile(), true)
  assert.equal(stat.isSymbolicLink(), false)
  const value = fs.readFileSync(sourcePath, 'utf8')
  assert.deepEqual(sourceDescriptor(value), input.file)
  return { sourcePath, value }
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

test('Target119 SSETransport fixture exposes one frozen static override', () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.118-to-2.1.119')
  assert.deepEqual(
    TARGET119_SSE_TRANSPORT_RETAINED_CLASS_EVIDENCE_IDS,
    fixture.evidenceIds,
  )
  assert.deepEqual(
    TARGET119_SSE_TRANSPORT_RETAINED_CLASS_OWNER_OVERRIDES,
    [
      {
        key: '2.1.118-to-2.1.119:19732',
        targetIndex: 19732,
        paths: ['src/cli/transports/SSETransport.ts'],
        declarations: [
          'SSETransport',
          'constructor',
          'readStream',
          'close',
        ],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET119_SSE_TRANSPORT_RETAINED_CLASS_OWNER_OVERRIDES[0]
            .behavior,
      },
    ],
  )
  readPinned(fixture.inputs.ownerOverride)
  assert.deepEqual(fixture.expectedImpact, {
    ownerOverrideCount: 1,
    strictUnitsRemoved: 1,
    strictResiduesRemoved: 3,
    sourceFilesReplayed: 0,
    packageCallOrder: null,
    mode: 'static-coverage-only',
  })
})

test('authenticated Target118 and Target119 whole class units are alpha-identical', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const targetLedger = readLedger(fixture.inputs.targetLedger)
  assertTargetRegion(targetLedger, fixture.targetUnit)

  const baselineUnit = slicePinned(baselineBundle, fixture.baselineUnit)
  const targetUnit = slicePinned(targetBundle, fixture.targetUnit)
  const baselineCanonical = canonicalDescriptor(baselineUnit)
  const targetCanonical = canonicalDescriptor(targetUnit)
  assert.deepEqual(baselineCanonical, {
    bytes: fixture.wholeUnitEquivalence.canonicalAstBytes,
    sha256: fixture.wholeUnitEquivalence.canonicalAstSha256,
  })
  assert.deepEqual(targetCanonical, baselineCanonical)
  assert.equal(baselineUnit.length, targetUnit.length)
  assert.notEqual(baselineUnit.toString(), targetUnit.toString())

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

  const baselineClass = findRuntimeClass(baselineUnit)
  const targetClass = findRuntimeClass(targetUnit)
  const targetClassBytes = targetUnit.subarray(
    targetClass.start,
    targetClass.end,
  )
  assert.deepEqual(
    {
      start: fixture.targetUnit.start + targetClass.start,
      end: fixture.targetUnit.start + targetClass.end,
      ...descriptor(targetClassBytes),
    },
    fixture.runtimeClass.target,
  )
  const baselineShape = runtimeMemberShape(baselineUnit, baselineClass)
  const targetShape = runtimeMemberShape(targetUnit, targetClass)
  assert.deepEqual(targetShape.rows, baselineShape.rows)
  assert.deepEqual(
    {
      memberCount: targetShape.rows.length,
      memberShapeJsonBytes: targetShape.bytes,
      memberShapeSha256: targetShape.sha256,
    },
    {
      memberCount: fixture.runtimeClass.memberCount,
      memberShapeJsonBytes: fixture.runtimeClass.memberShapeJsonBytes,
      memberShapeSha256: fixture.runtimeClass.memberShapeSha256,
    },
  )

  for (const [name, input] of Object.entries(
    fixture.runtimeClass.importantMembers,
  )) {
    const baselineMember = baselineClass.body.body.find(
      node => runtimeMemberKey(node) === name,
    )
    const targetMember = targetClass.body.body.find(
      node => runtimeMemberKey(node) === name,
    )
    assert.ok(baselineMember, name)
    assert.ok(targetMember, name)
    const baselineValue = baselineUnit.subarray(
      baselineMember.start,
      baselineMember.end,
    )
    const targetValue = targetUnit.subarray(
      targetMember.start,
      targetMember.end,
    )
    assert.deepEqual(
      {
        start: fixture.baselineUnit.start + baselineMember.start,
        end: fixture.baselineUnit.start + baselineMember.end,
        ...descriptor(baselineValue),
      },
      input.baseline,
    )
    assert.deepEqual(
      {
        start: fixture.targetUnit.start + targetMember.start,
        end: fixture.targetUnit.start + targetMember.end,
        ...descriptor(targetValue),
      },
      input.target,
    )
    assert.deepEqual(canonicalNodeDescriptor(baselineMember), {
      bytes: input.canonicalAstBytes,
      sha256: input.canonicalAstSha256,
    })
    assert.deepEqual(
      canonicalNodeDescriptor(targetMember),
      canonicalNodeDescriptor(baselineMember),
    )
    if (input.text) {
      assert.equal(baselineValue.toString(), input.text)
      assert.equal(targetValue.toString(), input.text)
    }
  }

  for (const row of fixture.residueProof.ownerRows) {
    const targetValue = targetBundle.subarray(
      row.identity[3],
      row.identity[4],
    )
    const baselineValue = baselineBundle.subarray(
      row.baselineStart,
      row.baselineEnd,
    )
    assert.equal(row.identity[3] - fixture.targetUnit.start, row.relativeOffset)
    assert.equal(row.baselineStart - fixture.baselineUnit.start, row.relativeOffset)
    assert.deepEqual(descriptor(targetValue), {
      bytes: row.bytes,
      sha256: row.sha256,
    })
    assert.deepEqual(descriptor(baselineValue), descriptor(targetValue))
    assert.equal(targetValue.toString(), row.text)
    assert.equal(baselineValue.toString(), row.text)
  }
})

test('runtime prebinding, six-argument caller, and initializer boundaries are retained', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const ledger = readLedger(fixture.inputs.targetLedger)

  for (const key of ['prebinding', 'caller', 'initializer']) {
    const baselineInput = fixture.runtimeBoundary.baseline[key]
    const targetInput = fixture.runtimeBoundary.target[key]
    assertTargetRegion(ledger, {
      targetIndex: targetInput.index,
      classification: targetInput.classification,
      nodeType:
        key === 'caller' ? 'FunctionDeclaration' : 'VariableDeclaration',
      start: targetInput.start,
      end: targetInput.end,
      bytes: targetInput.bytes,
      tokenCount: targetInput.tokenCount,
      sha256: targetInput.sha256,
      coarseHash: targetInput.coarseHash,
      ...(targetInput.baselineUnitIndex == null
        ? {}
        : {
            baselineUnitIndex: targetInput.baselineUnitIndex,
            pairReason: targetInput.pairReason,
          }),
      ...(targetInput.unknownFreeIdentifierCount == null
        ? {}
        : {
            unknownFreeIdentifierCount:
              targetInput.unknownFreeIdentifierCount,
          }),
    })
    const baselineValue = boundarySlice(baselineBundle, baselineInput)
    const targetValue = boundarySlice(targetBundle, targetInput)
    assert.deepEqual(
      canonicalDescriptor(targetValue),
      canonicalDescriptor(baselineValue),
    )
  }

  for (const [bundle, caller, expression, expectedArguments] of [
    [
      baselineBundle,
      fixture.runtimeBoundary.baseline.caller,
      fixture.runtimeBoundary.baseline.newExpression,
      6,
    ],
    [
      targetBundle,
      fixture.runtimeBoundary.target.caller,
      fixture.runtimeBoundary.target.newExpression,
      6,
    ],
  ]) {
    const callerText = bundle.subarray(caller.start, caller.end)
    const ast = parse(callerText.toString(), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const nodes = walkAcorn(
      ast,
      node => node.type === 'NewExpression' && node.arguments.length === 6,
    )
    assert.equal(nodes.length, 1)
    const node = nodes[0]
    assert.equal(node.arguments.length, expectedArguments)
    const value = callerText.subarray(node.start, node.end)
    assert.deepEqual(
      {
        start: caller.start + node.start,
        end: caller.start + node.end,
        ...descriptor(value),
      },
      {
        start: expression.start,
        end: expression.end,
        bytes: expression.bytes,
        sha256: expression.sha256,
      },
    )
  }
  assert.equal(
    targetBundle
      .subarray(
        fixture.runtimeBoundary.target.newExpression.start,
        fixture.runtimeBoundary.target.newExpression.end,
      )
      .toString(),
    fixture.runtimeBoundary.target.newExpression.text,
  )
})

test('Target120 and Target121 retain the exact whole-class contract', () => {
  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const baselineUnit = slicePinned(baselineBundle, fixture.baselineUnit)
  const baselineCanonical = canonicalDescriptor(baselineUnit)

  for (const lineage of fixture.crossReleaseLineage) {
    const inputPrefix = lineage.version === '2.1.120' ? 'target120' : 'target121'
    const bundle = readPinned(fixture.inputs[`${inputPrefix}Bundle`])
    const ledger = readLedger(fixture.inputs[`${inputPrefix}Ledger`])
    assertTargetRegion(ledger, lineage)
    const unit = slicePinned(bundle, lineage)
    assert.deepEqual(canonicalDescriptor(unit), baselineCanonical)
    const runtimeClass = findRuntimeClass(unit)
    const shape = runtimeMemberShape(unit, runtimeClass)
    assert.equal(shape.rows.length, fixture.runtimeClass.memberCount)
    assert.equal(shape.sha256, fixture.runtimeClass.memberShapeSha256)
    for (const row of fixture.residueProof.ownerRows) {
      const value = unit.subarray(
        row.relativeOffset,
        row.relativeOffset + row.bytes,
      )
      assert.deepEqual(descriptor(value), {
        bytes: row.bytes,
        sha256: row.sha256,
      })
      assert.equal(value.toString(), row.text)
    }
    const dispose = runtimeClass.body.body.find(
      node => runtimeMemberKey(node) === 'Symbol.dispose',
    )
    assert.ok(dispose)
    assert.equal(
      unit.subarray(dispose.start, dispose.end).toString(),
      fixture.runtimeClass.importantMembers['Symbol.dispose'].text,
    )
  }
})

test('stable authored source owns the class but is not a replay-complete graph', async () => {
  const ts = await loadTypeScript()
  const expected = fixture.sourceBoundary
  const { sourcePath, value: source } = readSource(expected)
  const sourceFile = ts.createSourceFile(
    sourcePath,
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
  const typeImport = nodes.find(
    node =>
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === './Transport.js',
  )
  const declaration = nodes.find(
    node =>
      ts.isClassDeclaration(node) && node.name?.text === 'SSETransport',
  )
  assert.ok(typeImport)
  assert.ok(declaration)
  assert.equal(typeImport.importClause?.isTypeOnly, true)
  assert.equal(
    declaration.heritageClauses?.some(
      clause =>
        clause.token === ts.SyntaxKind.ImplementsKeyword &&
        clause.types.some(type => type.expression.getText(sourceFile) === 'Transport'),
    ),
    true,
  )
  assert.equal(
    assertSourceSlice(source, expected.typeImport),
    expected.typeImport.text,
  )
  assert.deepEqual(
    {
      start: declaration.getStart(sourceFile),
      end: declaration.end,
      ...sourceDescriptor(
        source.slice(declaration.getStart(sourceFile), declaration.end),
      ),
    },
    {
      start: expected.class.start,
      end: expected.class.end,
      chars: expected.class.chars,
      bytes: expected.class.bytes,
      sha256: expected.class.sha256,
    },
  )

  const sourceMemberRows = declaration.members.map((node, index) => ({
    index,
    kind: ts.SyntaxKind[node.kind],
    name: node.name?.getText(sourceFile) ?? null,
    chars: node.end - node.getStart(sourceFile),
    bytes: Buffer.byteLength(
      source.slice(node.getStart(sourceFile), node.end),
    ),
  }))
  const serializedMembers = JSON.stringify(sourceMemberRows)
  assert.deepEqual(
    {
      memberCount: sourceMemberRows.length,
      memberShapeJsonBytes: Buffer.byteLength(serializedMembers),
      memberShapeSha256: sha256(serializedMembers),
    },
    {
      memberCount: expected.class.memberCount,
      memberShapeJsonBytes: expected.class.memberShapeJsonBytes,
      memberShapeSha256: expected.class.memberShapeSha256,
    },
  )

  const constructor = declaration.members.find(ts.isConstructorDeclaration)
  const method = name =>
    declaration.members.find(
      node =>
        ts.isMethodDeclaration(node) &&
        node.name?.getText(sourceFile) === name,
    )
  for (const [node, input] of [
    [constructor, expected.constructor],
    [method('readStream'), expected.readStream],
    [method('close'), expected.close],
  ]) {
    assert.ok(node)
    assert.deepEqual(
      {
        start: node.getStart(sourceFile),
        end: node.end,
        ...sourceDescriptor(
          source.slice(node.getStart(sourceFile), node.end),
        ),
      },
      input,
    )
  }

  const readBindings = nodes.filter(
    node =>
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.name.elements.map(element => element.name.getText(sourceFile)).join(',') ===
        'done,value',
  )
  assert.equal(readBindings.length, 1)
  const readBinding = readBindings[0]
  assert.equal(
    assertSourceSlice(source, expected.readResultBinding),
    expected.readResultBinding.text,
  )
  assert.equal(readBinding.getStart(sourceFile), expected.readResultBinding.start)
  assert.equal(source.includes(expected.runtimeOnlyMember), false)
  assert.equal(expected.runtimeOnlyMemberAbsent, true)

  for (const extension of ['.ts', '.tsx', '.js']) {
    const dependency = path.join(
      sourceRoot,
      expected.missingDependency
        .replace(/^src\//, '')
        .replace(/\.ts$/, extension),
    )
    assert.equal(fs.existsSync(dependency), false, dependency)
  }
  assert.equal(expected.missingDependencyAcrossGitLineage, true)

  assert.equal(
    gitRevParse(`${expected.git.targetCommit}^{tree}`),
    expected.git.targetTree,
  )
  for (const commit of expected.git.stableCommits) {
    const historical = gitShow(commit, expected.path)
    assert.deepEqual(descriptor(historical), {
      bytes: expected.file.bytes,
      sha256: expected.file.sha256,
    })
    assert.equal(
      gitRevParse(`${commit}:${expected.path}`),
      expected.git.blob,
    )
    const missing = runGit([
      'cat-file',
      '-e',
      `${commit}:${expected.missingDependency}`,
    ])
    assert.notEqual(missing.status, 0)
  }
})

test('authored bridge and transport-utils callers pin both constructor contracts', async () => {
  const ts = await loadTypeScript()
  for (const expected of Object.values(fixture.sourceCallers)) {
    const { sourcePath, value: source } = readSource(expected)
    const sourceFile = ts.createSourceFile(
      sourcePath,
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
    const declaration = nodes.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === expected.declaration.name,
    )
    const constructors = nodes.filter(
      node =>
        ts.isNewExpression(node) &&
        node.expression.getText(sourceFile) === 'SSETransport',
    )
    assert.ok(declaration)
    assert.equal(constructors.length, 1)
    assert.deepEqual(
      {
        start: declaration.getStart(sourceFile),
        end: declaration.end,
        ...sourceDescriptor(
          source.slice(declaration.getStart(sourceFile), declaration.end),
        ),
      },
      {
        start: expected.declaration.start,
        end: expected.declaration.end,
        chars: expected.declaration.chars,
        bytes: expected.declaration.bytes,
        sha256: expected.declaration.sha256,
      },
    )
    const constructor = constructors[0]
    assert.equal(constructor.arguments.length, expected.newExpression.argumentCount)
    assert.deepEqual(
      {
        start: constructor.getStart(sourceFile),
        end: constructor.end,
        ...sourceDescriptor(
          source.slice(constructor.getStart(sourceFile), constructor.end),
        ),
      },
      {
        start: expected.newExpression.start,
        end: expected.newExpression.end,
        chars: expected.newExpression.chars,
        bytes: expected.newExpression.bytes,
        sha256: expected.newExpression.sha256,
      },
    )
    assert.equal(
      gitRevParse(`${fixture.sourceBoundary.git.targetCommit}:${expected.path}`),
      expected.gitBlob,
    )
    assert.deepEqual(
      descriptor(gitShow(fixture.sourceBoundary.git.targetCommit, expected.path)),
      {
        bytes: expected.file.bytes,
        sha256: expected.file.sha256,
      },
    )
  }
})

test('scanner rows are exact before correction and absent-or-exact afterward', () => {
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
  const expectedIdentities = fixture.residueProof.ownerRows.map(
    row => row.identity,
  )
  const expectedAdded = expectedIdentities.filter(row => row[7])

  if (allOwnerRows.length > 0) {
    assert.deepEqual(
      rowSetDescriptor(allOwnerRows),
      fixture.residueProof.allOwnerRows,
    )
    assert.deepEqual(allOwnerRows.map(rowIdentity), expectedIdentities)
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
      assert.deepEqual(row.ownerPaths, ['cli/transports/SSETransport.ts'])
      assert.deepEqual(row.ownerSourceMatches, [])
    }
  }
  assert.deepEqual(
    rowSetDescriptor(rawRows),
    fixture.residueProof.rawReportRows,
  )
  assert.deepEqual(
    expectedAdded.map(row => row[2]),
    fixture.residueProof.addedValues,
  )
})
