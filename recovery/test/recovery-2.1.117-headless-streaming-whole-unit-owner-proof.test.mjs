import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.116-to-2.1.117/recovered/headless-streaming-whole-unit-owner-overrides.mjs'

const {
  TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_EVIDENCE_IDS,
  TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const packageSourceRoot = process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-headless-streaming-whole-unit-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'c70e522399efb663b75a423a142bba168cde6f88c892064338efb7bdda01e16d'

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
  assert.deepEqual(
    descriptor(Buffer.from(value)),
    expectedDescriptor(expected),
    label,
  )
  return value
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  const resolvedRoot = path.resolve(root)
  const filename = path.resolve(resolvedRoot, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${resolvedRoot}${path.sep}`))
  return filename
}

function assertRealFile(filename, label) {
  const stat = fs.lstatSync(filename)
  assert.equal(stat.isSymbolicLink(), false, `${label}: no symlink`)
  assert.equal(stat.isFile(), true, `${label}: regular file`)
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

function findNodes(node, predicate) {
  const matches = []
  walk(node, candidate => {
    if (predicate(candidate)) matches.push(candidate)
  })
  return matches
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
  return { normalized, ...descriptor(normalized) }
}

function propertyName(node) {
  return node.key?.name ?? node.key?.value
}

function propertyCounts(node, names) {
  const counts = Object.fromEntries(names.map(name => [name, 0]))
  walk(node, candidate => {
    if (
      candidate.type === 'Property' &&
      !candidate.computed &&
      Object.hasOwn(counts, propertyName(candidate))
    ) {
      counts[propertyName(candidate)] += 1
    }
  })
  return counts
}

function decodeResidue(raw, row) {
  if (row.literalKind !== 'string') return raw
  if (raw.startsWith('"')) return JSON.parse(raw)
  if (raw.startsWith("'")) return raw.slice(1, -1)
  return raw
}

function gitBytes(commit, sourcePath) {
  return execFileSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
  })
}

function gitText(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function tsDescendants(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function tsPropertyName(node, sourceFile) {
  return node.name?.text ?? node.name?.getText(sourceFile)
}

function assertPrintSource(bytes, expected, label) {
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.chars, `${label}: UTF-16 length`)
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    expected.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${label}: parses`)
  const declarations = sourceFile.statements.filter(
    node =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'runHeadlessStreaming',
  )
  assert.equal(declarations.length, 1, `${label}: one runHeadlessStreaming`)
  const declaration = declarations[0]
  assert.deepEqual(
    [declaration.getStart(sourceFile), declaration.end],
    [expected.declaration.start, expected.declaration.end],
  )
  exactStringSlice(
    source,
    expected.declaration,
    `${label}: runHeadlessStreaming declaration`,
  )

  const ultrareview = tsDescendants(
    ts,
    declaration,
    node =>
      ts.isIfStatement(node) &&
      node.expression.getText(sourceFile).includes("'ultrareview_launch'"),
  )
  assert.equal(ultrareview.length, 1, `${label}: ultrareview branch`)
  const outer = ultrareview[0]
  if (expected.ultrareviewCondition) {
    assert.deepEqual(
      [outer.expression.getStart(sourceFile), outer.expression.end],
      [expected.ultrareviewCondition.start, expected.ultrareviewCondition.end],
    )
    exactStringSlice(
      source,
      expected.ultrareviewCondition,
      `${label}: ultrareview condition`,
    )
  }
  assert.ok(ts.isBlock(outer.thenStatement), `${label}: branch block`)
  assert.deepEqual(
    [outer.thenStatement.getStart(sourceFile), outer.thenStatement.end],
    [expected.ultrareviewBlock.start, expected.ultrareviewBlock.end],
  )
  exactStringSlice(
    source,
    expected.ultrareviewBlock,
    `${label}: ultrareview block`,
  )

  const launched = tsDescendants(
    ts,
    outer.thenStatement,
    node =>
      ts.isIfStatement(node) &&
      node.expression.getText(sourceFile).includes(".status === 'launched'"),
  )
  assert.equal(launched.length, 1, `${label}: launched branch`)
  assert.deepEqual(
    [launched[0].getStart(sourceFile), launched[0].end],
    [expected.launchedIf.start, expected.launchedIf.end],
  )
  exactStringSlice(source, expected.launchedIf, `${label}: launched branch`)
  if (expected.launchedBlock) {
    assert.ok(ts.isBlock(launched[0].thenStatement))
    assert.deepEqual(
      [launched[0].thenStatement.getStart(sourceFile), launched[0].thenStatement.end],
      [expected.launchedBlock.start, expected.launchedBlock.end],
    )
    exactStringSlice(source, expected.launchedBlock, `${label}: launched block`)
  }

  const reviewDeclarations = tsDescendants(
    ts,
    launched[0].thenStatement,
    node =>
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'reviewMessages',
  )
  assert.equal(reviewDeclarations.length, 1, `${label}: reviewMessages declaration`)
  const reviewArray = reviewDeclarations[0].initializer
  assert.ok(reviewArray && ts.isArrayLiteralExpression(reviewArray))
  assert.equal(reviewArray.elements.length, 2)
  for (const element of reviewArray.elements) {
    assert.ok(ts.isCallExpression(element))
    assert.equal(element.expression.getText(sourceFile), 'createUserMessage')
    assert.equal(element.arguments.length, 1)
    assert.ok(ts.isObjectLiteralExpression(element.arguments[0]))
    const properties = element.arguments[0].properties
    assert.deepEqual(
      properties.map(property => tsPropertyName(property, sourceFile)),
      ['content', 'isMeta'],
    )
    assert.equal(properties[1].initializer.kind, ts.SyntaxKind.TrueKeyword)
  }
  const firstTemplate = reviewArray.elements[0].arguments[0].properties[0].initializer
  const secondTemplate = reviewArray.elements[1].arguments[0].properties[0].initializer
  assert.ok(ts.isTemplateExpression(firstTemplate))
  assert.ok(ts.isTemplateExpression(secondTemplate))
  assert.deepEqual(
    [firstTemplate.getStart(sourceFile), firstTemplate.end],
    [expected.commandTemplate.start, expected.commandTemplate.end],
  )
  exactStringSlice(source, expected.commandTemplate, `${label}: command template`)
  assert.match(firstTemplate.getText(sourceFile), /COMMAND_NAME_TAG.*\/ultrareview/)
  assert.match(secondTemplate.getText(sourceFile), /LOCAL_COMMAND_STDOUT_TAG/)

  const pushes = tsDescendants(
    ts,
    launched[0].thenStatement,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'mutableMessages.push',
  )
  assert.equal(pushes.length, 1, `${label}: one mutableMessages push`)
  assert.equal(pushes[0].arguments.length, 1)
  assert.ok(ts.isSpreadElement(pushes[0].arguments[0]))
  assert.equal(pushes[0].arguments[0].expression.getText(sourceFile), 'reviewMessages')

  const loops = tsDescendants(
    ts,
    launched[0].thenStatement,
    node => ts.isForOfStatement(node),
  )
  assert.equal(loops.length, 1, `${label}: one replay loop`)
  assert.equal(loops[0].expression.getText(sourceFile), 'reviewMessages')
  const enqueueCalls = tsDescendants(
    ts,
    loops[0].statement,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'output.enqueue',
  )
  assert.equal(enqueueCalls.length, 1, `${label}: one replay enqueue`)
  let replayObject = enqueueCalls[0].arguments[0]
  if (ts.isSatisfiesExpression(replayObject)) replayObject = replayObject.expression
  assert.ok(ts.isObjectLiteralExpression(replayObject))
  assert.deepEqual(
    replayObject.properties.map(property => tsPropertyName(property, sourceFile)),
    [
      'type',
      'message',
      'session_id',
      'parent_tool_use_id',
      'uuid',
      'timestamp',
      'isReplay',
    ],
  )
  const isReplay = replayObject.properties.at(-1)
  assert.equal(isReplay.initializer.kind, ts.SyntaxKind.TrueKeyword)

  const responses = tsDescendants(
    ts,
    outer.thenStatement,
    node =>
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'sendControlResponseSuccess',
  )
  assert.equal(responses.length, 1, `${label}: one success response`)
  assert.ok(responses[0].getStart(sourceFile) > launched[0].end)

  const retainedPropertyAssignments = tsDescendants(
    ts,
    declaration,
    node =>
      (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
      ['taskRegistry', 'synthetic', 'forkContextMessages'].includes(
        tsPropertyName(node, sourceFile),
      ),
  )
  assert.deepEqual(
    retainedPropertyAssignments.map(node => tsPropertyName(node, sourceFile)),
    [],
    `${label}: retained generated-only contracts stay absent`,
  )
  return { source, sourceFile, declaration, outer, launched: launched[0] }
}

function assertXmlSource(bytes, expected, label) {
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  const source = bytes.toString('utf8')
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    expected.path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${label}: parses`)
  for (const name of ['COMMAND_NAME_TAG', 'LOCAL_COMMAND_STDOUT_TAG']) {
    const descriptorForConstant = expected[name]
    exactStringSlice(source, descriptorForConstant, `${label}: ${name}`)
    const declarations = tsDescendants(
      ts,
      sourceFile,
      node =>
        ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === name,
    )
    assert.equal(declarations.length, 1, `${label}: one ${name}`)
    assert.ok(ts.isStringLiteral(declarations[0].initializer))
    assert.equal(declarations[0].initializer.text, descriptorForConstant.value)
  }
}

test(
  'Target117 headless fixture, structural units, rows, and static wiring are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.status,
      'case-owned-static-owner-proof-source-replay-blocked',
    )
    readExact(
      path.join(repositoryRoot, fixture.ownerOverride.path),
      fixture.ownerOverride,
      'headless owner override module',
    )
    assert.deepEqual(
      TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_OWNER_OVERRIDES, [
      {
        key: `${caseName}:20646`,
        targetIndex: 20646,
        paths: ['src/cli/print.ts', 'src/constants/xml.ts'],
        declarations: [
          'runHeadlessStreaming',
          'COMMAND_NAME_TAG',
          'LOCAL_COMMAND_STDOUT_TAG',
        ],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.match(
      TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_OWNER_OVERRIDES[0].behavior,
      /two synthetic user messages.*task-registry.*synthetic-result.*static whole-unit proof.*never a source replay/,
    )
    assert.deepEqual(
      Object.keys(ownerProofModule).sort(),
      [
        'TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_EVIDENCE_IDS',
        'TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_OWNER_OVERRIDES',
      ],
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.equal(
      fixture.generatorWiring.ownerOverrideExport,
      'TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_OWNER_OVERRIDES',
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
    assert.ok(target, 'u20646 unresolved target unit')
    assert.deepEqual(
      {
        classification: target.classification,
        baselineUnitIndex: target.baselineUnitIndex ?? null,
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
    const baseline = ledger.unmatchedBaseline.find(
      unit => unit.index === fixture.baselineUnit.baselineIndex,
    )
    assert.ok(baseline, 'u20581 unmatched baseline unit')
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

    const rows = fixture.ownerResidues.rows
    assert.equal(rows.length, fixture.ownerResidues.totalRows)
    assert.equal(rows.filter(row => row.strict).length, fixture.ownerResidues.strictRows)
    for (const [semanticClass, expectedCount] of [
      ['source-covered-context', fixture.ownerResidues.sourceCoveredContextRows],
      ['retained-source-gap', fixture.ownerResidues.retainedSourceGapRows],
      [
        'authenticated-launched-replay',
        fixture.ownerResidues.authenticatedLaunchedReplayRows,
      ],
    ]) {
      assert.equal(
        rows.filter(row => row.semanticClass === semanticClass).length,
        expectedCount,
      )
    }
    assert.equal(new Set(rows.map(row => `${row.start}:${row.end}`)).size, rows.length)
    assert.ok(
      rows.every(
        row =>
          row.start >= fixture.targetUnit.start && row.end <= fixture.targetUnit.end,
      ),
    )
  },
)

test(
  'authenticated bundles prove the ultrareview replay and retained generated contracts',
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
      'Target116 runHeadlessStreaming',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target117 runHeadlessStreaming',
    )

    for (const row of fixture.ownerResidues.rows) {
      const raw = exactSlice(
        targetBundle,
        row,
        `u20646 ${row.value} occurrence ${row.targetOccurrenceNumber}`,
      )
      assert.equal(decodeResidue(raw, row), row.value)
    }
    assert.deepEqual(
      propertyCounts(baseline.node, ['taskRegistry', 'synthetic']),
      fixture.retainedGeneratedContracts.withinUnitCounts.baseline,
    )
    assert.deepEqual(
      propertyCounts(target.node, ['taskRegistry', 'synthetic']),
      fixture.retainedGeneratedContracts.withinUnitCounts.target,
    )

    for (const [name, proof] of Object.entries(
      fixture.retainedGeneratedContracts,
    )) {
      if (name === 'withinUnitCounts') continue
      const normalized = []
      for (const expected of proof.baselineProperties) {
        normalized.push(
          canonicalAst(
            `{${exactSlice(
              baselineBundle,
              expected,
              `Target116 ${name} property`,
            )}}`,
            true,
          ),
        )
      }
      for (const expected of proof.targetProperties) {
        normalized.push(
          canonicalAst(
            `{${exactSlice(
              targetBundle,
              expected,
              `Target117 ${name} property`,
            )}}`,
            true,
          ),
        )
      }
      assert.ok(
        normalized.every(item => item.normalized === normalized[0].normalized),
        `${name}: baseline and target property ASTs are equivalent`,
      )
      assert.deepEqual(
        { bytes: normalized[0].bytes, sha256: normalized[0].sha256 },
        { bytes: proof.canonicalBytes, sha256: proof.canonicalSha256 },
      )
    }

    const targetCondition = exactSlice(
      targetBundle,
      fixture.targetUltrareview.condition,
      'Target117 ultrareview condition',
    )
    const targetConsequent = exactSlice(
      targetBundle,
      fixture.targetUltrareview.consequent,
      'Target117 ultrareview consequent',
    )
    const targetLaunched = exactSlice(
      targetBundle,
      fixture.targetUltrareview.launchedIf,
      'Target117 launched branch',
    )
    exactSlice(
      targetBundle,
      fixture.targetUltrareview.launchedBlock,
      'Target117 launched block',
    )
    assert.equal(
      exactSlice(
        targetBundle,
        fixture.targetUltrareview.commandTemplate,
        'Target117 command template',
      ),
      fixture.targetUltrareview.commandTemplate.exact,
    )
    assert.match(targetCondition, /\.request\.subtype==="ultrareview_launch"/)
    assert.equal(countOccurrences(targetConsequent, 'status==="launched"'), 1)
    assert.equal(countOccurrences(targetLaunched, '<command-name>/ultrareview'), 1)
    assert.equal(countOccurrences(targetLaunched, '${OL}'), 2)

    const baselineConsequent = exactSlice(
      baselineBundle,
      fixture.baselineUltrareview.consequent,
      'Target116 ultrareview consequent',
    )
    exactSlice(
      baselineBundle,
      fixture.baselineUltrareview.condition,
      'Target116 ultrareview condition',
    )
    assert.equal(
      countOccurrences(baselineConsequent, 'status==="launched"'),
      fixture.baselineUltrareview.launchedIfCount,
    )
    assert.equal(
      countOccurrences(baselineConsequent, '<command-name>/ultrareview'),
      fixture.baselineUltrareview.commandTemplateCount,
    )

    const launchedProgram = parse(targetLaunched, { ecmaVersion: 'latest' })
    const arrayCandidates = findNodes(
      launchedProgram,
      node =>
        node.type === 'ArrayExpression' &&
        node.elements.length === 2 &&
        node.elements.every(element => element?.type === 'CallExpression'),
    )
    assert.equal(arrayCandidates.length, 1, 'two synthetic message calls')
    const messageBinding = findNodes(
      launchedProgram,
      node =>
        node.type === 'VariableDeclarator' && node.init === arrayCandidates[0],
    )[0].id.name
    const messageObjects = arrayCandidates[0].elements.map(
      call => call.arguments[0],
    )
    assert.ok(messageObjects.every(object => object.type === 'ObjectExpression'))
    assert.ok(
      messageObjects.every(object =>
        object.properties.some(property => propertyName(property) === 'isMeta'),
      ),
    )
    const pushes = findNodes(
      launchedProgram,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.name === 'push' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'SpreadElement' &&
        node.arguments[0].argument.name === messageBinding,
    )
    assert.equal(pushes.length, 1, 'both messages are persisted')
    const loops = findNodes(
      launchedProgram,
      node => node.type === 'ForOfStatement' && node.right.name === messageBinding,
    )
    assert.equal(loops.length, 1, 'both messages are emitted')
    const replayObjects = findNodes(
      loops[0],
      node =>
        node.type === 'ObjectExpression' &&
        node.properties.some(property => propertyName(property) === 'isReplay'),
    )
    assert.equal(replayObjects.length, 1)
    assert.deepEqual(
      replayObjects[0].properties.map(propertyName),
      [
        'type',
        'message',
        'session_id',
        'parent_tool_use_id',
        'uuid',
        'timestamp',
        'isReplay',
      ],
    )
  },
)

test(
  'raw Target117 source contains the exact replay while retained runtime contracts stay absent',
  { skip: !selected },
  () => {
    assert.equal(gitText(['rev-parse', `${fixture.source.commit}^{tree}`]), fixture.source.tree)
    assert.equal(
      gitText([
        'rev-parse',
        `${fixture.source.commit}:${fixture.source.rawPrint.path}`,
      ]),
      fixture.source.rawPrint.blob,
    )
    assert.equal(
      gitText([
        'rev-parse',
        `${fixture.source.commit}:${fixture.source.xmlConstants.path}`,
      ]),
      fixture.source.xmlConstants.blob,
    )
    const printBytes = gitBytes(fixture.source.commit, fixture.source.rawPrint.path)
    const xmlBytes = gitBytes(
      fixture.source.commit,
      fixture.source.xmlConstants.path,
    )
    const parsed = assertPrintSource(
      printBytes,
      fixture.source.rawPrint,
      'raw Target117 print source',
    )
    assertXmlSource(
      xmlBytes,
      fixture.source.xmlConstants,
      'raw Target117 XML constants',
    )
    exactStringSlice(
      parsed.source,
      fixture.source.rawPrint.xmlImport,
      'raw Target117 XML import',
    )
  },
)

test(
  'packaged Target117 source preserves the exact raw replay and static-only boundary',
  { skip: !selected || !packageSourceRoot },
  () => {
    const printFilename = sourceFilename(
      packageSourceRoot,
      fixture.source.packagedPrint.path,
    )
    const xmlFilename = sourceFilename(
      packageSourceRoot,
      fixture.source.xmlConstants.path,
    )
    assertRealFile(printFilename, 'packaged Target117 print source')
    assertRealFile(xmlFilename, 'packaged Target117 XML constants')
    assertPrintSource(
      fs.readFileSync(printFilename),
      fixture.source.packagedPrint,
      'packaged Target117 print source',
    )
    assertXmlSource(
      fs.readFileSync(xmlFilename),
      fixture.source.xmlConstants,
      'packaged Target117 XML constants',
    )
    for (const producer of fixture.source.packagedPrint.producers) {
      readExact(path.join(repositoryRoot, producer.path), producer, producer.path)
    }
    assert.equal(
      fixture.sourceReplayBlocker.decision,
      'static whole-unit owner proof only; no replay helper and no source writes',
    )
    assert.match(
      fixture.sourceReplayBlocker.reason,
      /already contains.*launched-message replay.*omits.*taskRegistry.*synthetic.*forkContextMessages.*later source.*unrelated release evolution/,
    )
    assert.equal(
      fs.existsSync(
        path.join(
          repositoryRoot,
          'recovery/cases/2.1.116-to-2.1.117/recovered/replay-headless-streaming-whole-unit-source-gap.mjs',
        ),
      ),
      false,
    )
  },
)
