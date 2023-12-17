import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import * as ownerProofModule from '../cases/2.1.120-to-2.1.121/recovered/handle-prompt-submit-active-skill-owner-overrides.mjs'

const {
  TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_EVIDENCE_IDS,
  TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_OWNER_OVERRIDES,
} = ownerProofModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.120-to-2.1.121'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.121-handle-prompt-submit-active-skill-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'e9345e6ca24fcf83e5ed686f907800c581d92361596f41b229278abb6da1b859'

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function canonicalDigest(value) {
  return descriptor(Buffer.from(JSON.stringify(value)))
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function exactBufferSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  if (expected.exact !== undefined) {
    assert.equal(value.toString('utf8'), expected.exact, label)
  }
  return value.toString('utf8')
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function baselineSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_120_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.120/src'),
  )
}

function targetSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.121/src'),
  )
}

function freshPackageSourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_121_FRESH_PACKAGE_SOURCE_ROOT ??
      fixture.sourceState.freshPackage.defaultSourceRoot,
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
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

function occurrenceStarts(source, needle) {
  const starts = []
  let offset = 0
  while (true) {
    const next = source.indexOf(needle, offset)
    if (next < 0) return starts
    starts.push(next)
    offset = next + needle.length
  }
}

function walk(node, visit, currentPath = [], parent = null, key = null) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((child, index) =>
      walk(child, visit, [...currentPath, index], parent, index),
    )
    return
  }
  if (typeof node.type === 'string') {
    visit(node, currentPath, parent, key)
  }
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, visit, [...currentPath, childKey], node, childKey)
    }
  }
}

function canonicalize(value, parent = null, key = null) {
  if (Array.isArray(value)) {
    return value.map((child, index) => canonicalize(child, parent, index))
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

function canonicalDescriptor(node) {
  return canonicalDigest(canonicalize(node))
}

function normalizedToken(token) {
  return [
    token.type.label,
    token.type.label === 'name' ? '@id' : (token.value ?? null),
  ]
}

function parseUnit(bundle, expected, label) {
  const source = exactBufferSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  const node = program.body[0]
  assert.equal(node.type, expected.nodeType)
  if (expected.async !== undefined) assert.equal(node.async, expected.async)
  if (expected.generator !== undefined) {
    assert.equal(node.generator, expected.generator)
  }
  if (expected.bodyStatementCount !== undefined) {
    assert.equal(node.body.body.length, expected.bodyStatementCount)
  }
  const tokens = [...tokenizer(source, { ecmaVersion: 'latest' })]
  if (expected.tokenCount !== undefined) {
    assert.equal(tokens.length, expected.tokenCount)
  }
  return { node, source, tokens, unitStart: expected.start }
}

function findNode(unit, predicate, label) {
  const matches = []
  walk(unit.node, (node, nodePath, parent, key) => {
    const raw = unit.source.slice(node.start, node.end)
    if (predicate(node, raw)) {
      matches.push({ node, path: nodePath.join('.'), parent, key, raw })
    }
  })
  assert.equal(matches.length, 1, `${label}: unique AST node`)
  return matches[0]
}

function assertBundleNode(unit, expected, label) {
  const candidate = findNode(
    unit,
    node =>
      node.type === expected.nodeType &&
      unit.unitStart + node.start === expected.start &&
      unit.unitStart + node.end === expected.end,
    label,
  )
  assert.equal(candidate.node.start, expected.localStart ?? candidate.node.start)
  assert.equal(candidate.node.end, expected.localEnd ?? candidate.node.end)
  if (expected.path !== undefined) assert.equal(candidate.path, expected.path)
  assert.equal(candidate.raw, expected.exact)
  assert.deepEqual(descriptor(candidate.raw), expectedDescriptor(expected))
  if (expected.canonicalBytes !== undefined) {
    assert.deepEqual(canonicalDescriptor(candidate.node), {
      bytes: expected.canonicalBytes,
      sha256: expected.canonicalSha256,
    })
  }
  return candidate
}

function lcsAlignmentRuns(left, right) {
  const rows = Array.from(
    { length: left.length + 1 },
    () => new Uint16Array(right.length + 1),
  )
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (
      let rightIndex = right.length - 1;
      rightIndex >= 0;
      rightIndex -= 1
    ) {
      rows[leftIndex][rightIndex] =
        left[leftIndex] === right[rightIndex]
          ? rows[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(
              rows[leftIndex + 1][rightIndex],
              rows[leftIndex][rightIndex + 1],
            )
    }
  }
  let leftIndex = 0
  let rightIndex = 0
  const operations = []
  while (leftIndex < left.length || rightIndex < right.length) {
    if (
      leftIndex < left.length &&
      rightIndex < right.length &&
      left[leftIndex] === right[rightIndex]
    ) {
      operations.push('=')
      leftIndex += 1
      rightIndex += 1
    } else if (
      rightIndex < right.length &&
      (leftIndex === left.length ||
        rows[leftIndex][rightIndex + 1] >=
          rows[leftIndex + 1][rightIndex])
    ) {
      operations.push('+')
      rightIndex += 1
    } else {
      operations.push('-')
      leftIndex += 1
    }
  }
  const runs = []
  for (const operation of operations) {
    const last = runs.at(-1)
    if (last?.[0] === operation) last[1] += 1
    else runs.push([operation, 1])
  }
  return { equalTokens: rows[0][0], runs }
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function findTsNodes(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function tsNodeDescriptor(ts, sourceFile, source, node, expected, extra = {}) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const text = source.slice(start, end)
  assert.deepEqual(
    {
      start,
      end,
      chars: text.length,
      ...descriptor(text),
      line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
      ...extra,
    },
    expected,
  )
  return text
}

function handlePromptSubmitEvidence(ts, root, expected) {
  const filename = sourceFilename(root, expected.path)
  const bytes = readExact(filename, expected.file, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.file.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const base = findTsNodes(
    ts,
    sourceFile,
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'BaseExecutionParams',
  )
  assert.equal(base.length, 1)
  assert.ok(ts.isTypeLiteralNode(base[0].type))
  const baseMemberNames = base[0].type.members
    .map(member => member.name?.getText(sourceFile))
    .filter(Boolean)
  const onQueryMember = base[0].type.members.find(
    member => member.name?.getText(sourceFile) === 'onQuery',
  )
  assert.ok(onQueryMember?.type && ts.isFunctionTypeNode(onQueryMember.type))
  tsNodeDescriptor(ts, sourceFile, source, base[0], expected.baseExecutionParams, {
    memberCount: base[0].type.members.length,
    memberNames: canonicalDigest(baseMemberNames),
    onQueryParameterCount: onQueryMember.type.parameters.length,
    onQueryParameterNames: onQueryMember.type.parameters.map(parameter =>
      parameter.name.getText(sourceFile),
    ),
  })

  const execute = findTsNodes(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'executeUserInput',
  )
  assert.equal(execute.length, 1)
  tsNodeDescriptor(ts, sourceFile, source, execute[0], expected.executeUserInput, {
    parameterCount: execute[0].parameters.length,
    bodyStatementCount: execute[0].body.statements.length,
  })
  const makeContext = findTsNodes(
    ts,
    execute[0],
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'makeContext',
  )
  assert.equal(makeContext.length, 1)
  tsNodeDescriptor(ts, sourceFile, source, makeContext[0], expected.makeContext, {
    bodyStatementCount: makeContext[0].body.statements.length,
  })
  const processCalls = findTsNodes(
    ts,
    execute[0],
    node =>
      ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'processUserInput',
  )
  assert.equal(processCalls.length, 1)
  const processObject = processCalls[0].arguments[0]
  assert.ok(ts.isObjectLiteralExpression(processObject))
  const contextProperty = processObject.properties.find(
    property => property.name?.getText(sourceFile) === 'context',
  )
  tsNodeDescriptor(
    ts,
    sourceFile,
    source,
    processCalls[0],
    expected.processUserInputCall,
    {
      argumentCount: processCalls[0].arguments.length,
      contextProperty: contextProperty.getText(sourceFile),
    },
  )
  const onQueryCalls = findTsNodes(
    ts,
    execute[0],
    node =>
      ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'onQuery',
  )
  assert.equal(onQueryCalls.length, 1)
  tsNodeDescriptor(
    ts,
    sourceFile,
    source,
    onQueryCalls[0],
    expected.onQueryCall,
    { argumentCount: onQueryCalls[0].arguments.length },
  )
  for (const marker of ['spawnedBySkill', 'activeSkill']) {
    assert.equal(countOccurrences(source, marker), 0, `${filename}: ${marker}`)
  }
  return source
}

function toolUseContextEvidence(ts, root, expected) {
  const filename = sourceFilename(root, expected.path)
  const bytes = readExact(filename, expected.file, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.file.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declarations = findTsNodes(
    ts,
    sourceFile,
    node => ts.isTypeAliasDeclaration(node) && node.name.text === 'ToolUseContext',
  )
  assert.equal(declarations.length, 1)
  const declaration = declarations[0]
  assert.ok(ts.isTypeLiteralNode(declaration.type))
  tsNodeDescriptor(ts, sourceFile, source, declaration, expected.declaration, {
    memberCount: declaration.type.members.length,
  })
  const optionsMember = declaration.type.members.find(
    member => member.name?.getText(sourceFile) === 'options',
  )
  assert.ok(optionsMember?.type && ts.isTypeLiteralNode(optionsMember.type))
  const optionNames = optionsMember.type.members
    .map(member => member.name?.getText(sourceFile))
    .filter(Boolean)
  tsNodeDescriptor(ts, sourceFile, source, optionsMember.type, expected.optionsType, {
    memberCount: optionsMember.type.members.length,
    memberNames: canonicalDigest(optionNames),
  })
  for (const marker of ['spawnedBySkill', 'activeSkill']) {
    assert.equal(optionNames.includes(marker), false, marker)
  }
}

function processUserInputContextEvidence(ts, root, expected) {
  const filename = sourceFilename(root, expected.path)
  const bytes = readExact(filename, expected.file, filename)
  const source = bytes.toString('utf8')
  assert.equal(source.length, expected.file.chars)
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  const declarations = findTsNodes(
    ts,
    sourceFile,
    node =>
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === 'ProcessUserInputContext',
  )
  assert.equal(declarations.length, 1)
  const { exact: expectedExact, ...expectedDescriptorFields } =
    expected.declaration
  const exact = tsNodeDescriptor(
    ts,
    sourceFile,
    source,
    declarations[0],
    expectedDescriptorFields,
  )
  assert.equal(exact, expectedExact)
}

function sourceRootMarkerCounts(root) {
  const counts = Object.fromEntries(
    Object.keys(fixture.sourceState.sourceRootMarkerCounts).map(marker => [
      marker,
      0,
    ]),
  )
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(filename)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        const source = fs.readFileSync(filename, 'utf8')
        for (const marker of Object.keys(counts)) {
          counts[marker] += countOccurrences(source, marker)
        }
      }
    }
  }
  return counts
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

test(
  'Target121 handlePromptSubmit active-skill fixture and override are exact',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.targetUnit.targetIndex, 20775)
    assert.equal(fixture.inputs.clearedMutableSnapshot.consultedOnceOnly, true)
    assert.match(
      fixture.inputs.clearedMutableSnapshot.testPolicy,
      /never reopens either mutable artifact/,
    )
    assert.deepEqual(
      TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_OWNER_OVERRIDES,
      [
        {
          key: `${caseName}:20775`,
          targetIndex: 20775,
          paths: [fixture.ownerResidues.correctedOwner],
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior:
            TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_OWNER_OVERRIDES[0]
              .behavior,
        },
      ],
    )
    assert.equal(
      Object.isFrozen(
        TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_OWNER_OVERRIDES,
      ),
      true,
    )
    assert.equal(fixture.generatorWiring.replayHelper, null)
    assert.deepEqual(Object.keys(ownerProofModule).sort(), [
      'TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_EVIDENCE_IDS',
      'TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_OWNER_OVERRIDES',
    ])
  },
)

test(
  'u20775 ledger identity and the complete provenance occurrence graph are exact',
  { skip: !selected },
  () => {
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
          fixture.inputs.structuralLedger,
          'Target121 structural ledger',
        ),
      ),
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const targetSource = targetBundle.toString('utf8')
    const baselineSource = baselineBundle.toString('utf8')
    const parsedUnits = new Map()
    const graphIdentities = []
    for (const expected of fixture.provenanceGraph.units) {
      assert.ok(expected.role.length > 0)
      const region = ledger.regions.find(
        row => row.target.index === expected.targetIndex,
      )
      assert.ok(region, `ledger u${expected.targetIndex}`)
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        {
          start: region.target.start,
          end: region.target.end,
          nodeType: region.target.nodeType,
          sourceHash: region.target.sourceHash,
        },
        {
          start: expected.start,
          end: expected.end,
          nodeType: expected.nodeType,
          sourceHash: expected.sha256,
        },
      )
      const unitSource = targetBundle
        .subarray(expected.start, expected.end)
        .toString('utf8')
      assert.deepEqual(descriptor(unitSource), {
        bytes: expected.end - expected.start,
        sha256: expected.sha256,
      })
      const program = parse(unitSource, { ecmaVersion: 'latest' })
      assert.equal(program.body.length, 1)
      assert.equal(program.body[0].type, expected.nodeType)
      parsedUnits.set(expected.targetIndex, {
        node: program.body[0],
        source: unitSource,
        unitStart: expected.start,
      })
      for (const [property, start, end, occurrence] of expected.occurrences) {
        assert.equal(targetSource.slice(start, end), property)
        graphIdentities.push([property, start, end, occurrence, expected.targetIndex])
      }
    }
    for (const [property, expectedCount] of Object.entries(
      fixture.provenanceGraph.bundleOccurrenceCounts.target,
    )) {
      assert.equal(countOccurrences(targetSource, property), expectedCount)
      const identities = graphIdentities
        .filter(identity => identity[0] === property)
        .sort((left, right) => left[3] - right[3])
      assert.deepEqual(
        identities.map(identity => identity[1]),
        occurrenceStarts(targetSource, property),
      )
      assert.deepEqual(
        identities.map(identity => identity[3]),
        Array.from({ length: expectedCount }, (_, index) => index + 1),
      )
    }
    for (const [property, expectedCount] of Object.entries(
      fixture.provenanceGraph.bundleOccurrenceCounts.baseline,
    )) {
      assert.equal(countOccurrences(baselineSource, property), expectedCount)
    }
    assert.equal(graphIdentities.length, 28)

    for (const expected of fixture.provenanceGraph.edgeAnchors) {
      const unit = parsedUnits.get(expected.targetIndex)
      assert.ok(unit, expected.id)
      const raw = targetSource.slice(expected.start, expected.end)
      assert.equal(raw, expected.exact, expected.id)
      assert.deepEqual(descriptor(raw), expectedDescriptor(expected), expected.id)
      const matches = []
      walk(unit.node, node => {
        if (
          node.type === expected.nodeType &&
          unit.unitStart + node.start === expected.start &&
          unit.unitStart + node.end === expected.end
        ) {
          matches.push(node)
        }
      })
      assert.equal(matches.length, 1, `${expected.id}: unique AST anchor`)
    }
    const unitIndices = new Set(
      fixture.provenanceGraph.units.map(unit => unit.targetIndex),
    )
    for (const edge of fixture.provenanceGraph.edges) {
      assert.ok(edge.behavior.length > 0)
      for (const index of [...edge.from, ...edge.through, ...edge.to]) {
        assert.equal(unitIndices.has(index), true, `${edge.id}: u${index}`)
      }
    }

    const ownedOccurrence = graphIdentities.filter(
      identity => identity[4] === fixture.targetUnit.targetIndex,
    )
    const strictIdentities = ownedOccurrence.map(
      ([property, start, end, occurrence]) => [
        fixture.targetUnit.targetIndex,
        'property',
        property,
        start,
        end,
        occurrence,
      ],
    )
    assert.deepEqual(strictIdentities, fixture.ownerResidues.strictRowsExact)
    assert.deepEqual(
      canonicalDigest(strictIdentities),
      fixture.ownerResidues.strictIdentities,
    )
    assert.equal(fixture.ownerResidues.baselineOccurrenceCount, 0)
    assert.equal(fixture.ownerResidues.targetAdded, true)
    assert.match(fixture.provenanceGraph.boundary, /only u20775/)
    assert.match(fixture.provenanceGraph.boundary, /independently owned/)
  },
)

test(
  'complete-unit lineage proves the cached mutable-context forwarding edge',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath(
        'CLAUDE_CODE_2_1_120_INNER_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'Target120 bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_121_INNER_BUNDLE', fixture.inputs.targetBundle),
      fixture.inputs.targetBundle,
      'Target121 bundle',
    )
    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineSemanticCounterpart,
      'Target120 executeUserInput predecessor',
    )
    const target = parseUnit(targetBundle, fixture.targetUnit, 'Target121 u20775')
    assert.equal(
      fixture.targetUnit.bytes - fixture.baselineSemanticCounterpart.bytes,
      fixture.wholeUnitLineage.rawByteDelta,
    )
    assert.equal(
      fixture.targetUnit.tokenCount -
        fixture.baselineSemanticCounterpart.tokenCount,
      fixture.wholeUnitLineage.tokenDelta,
    )
    assert.deepEqual(
      canonicalDescriptor(baseline.node),
      fixture.wholeUnitLineage.baselineCanonical,
    )
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitLineage.targetCanonical,
    )

    const edits = fixture.wholeUnitLineage.edits
    assertBundleNode(target, edits.contextFactory, 'context factory')
    const cached = assertBundleNode(
      target,
      edits.cachedContextDeclaration,
      'cached context declaration',
    )
    const processContext = assertBundleNode(
      target,
      edits.targetProcessContext,
      'target process context',
    )
    assertBundleNode(
      baseline,
      edits.baselineInlineProcessContext,
      'baseline inline process context',
    )
    const activeChain = assertBundleNode(
      target,
      edits.activeSkillChain,
      'active-skill chain',
    )
    const targetOnQuery = assertBundleNode(
      target,
      edits.targetOnQueryCall,
      'target onQuery call',
    )
    const baselineOnQuery = assertBundleNode(
      baseline,
      edits.baselineOnQueryCall,
      'baseline onQuery call',
    )
    assert.equal(targetOnQuery.node.arguments.length, edits.targetOnQueryCall.argumentCount)
    assert.equal(
      baselineOnQuery.node.arguments.length,
      edits.baselineOnQueryCall.argumentCount,
    )
    assert.equal(targetOnQuery.node.arguments.at(-1), activeChain.node)
    assert.equal(
      target.source.slice(
        edits.activeSkillArgumentInsertion.localStart,
        edits.activeSkillArgumentInsertion.localEnd,
      ),
      edits.activeSkillArgumentInsertion.exact,
    )
    assert.deepEqual(
      descriptor(
        target.source.slice(
          edits.activeSkillArgumentInsertion.localStart,
          edits.activeSkillArgumentInsertion.localEnd,
        ),
      ),
      expectedDescriptor(edits.activeSkillArgumentInsertion),
    )

    const normalizedBaseline = baseline.tokens.map(normalizedToken)
    const normalizedTarget = target.tokens.map(normalizedToken)
    assert.deepEqual(
      { count: normalizedBaseline.length, ...canonicalDigest(normalizedBaseline) },
      fixture.wholeUnitLineage.identifierNormalizedTokens.baseline,
    )
    assert.deepEqual(
      { count: normalizedTarget.length, ...canonicalDigest(normalizedTarget) },
      fixture.wholeUnitLineage.identifierNormalizedTokens.target,
    )
    const alignment = lcsAlignmentRuns(
      normalizedBaseline.map(JSON.stringify),
      normalizedTarget.map(JSON.stringify),
    )
    assert.deepEqual(alignment, {
      equalTokens: fixture.wholeUnitLineage.lcsAlignment.equalTokens,
      runs: fixture.wholeUnitLineage.lcsAlignment.runs,
    })
    assert.deepEqual(
      canonicalDigest(alignment.runs),
      fixture.wholeUnitLineage.lcsAlignment.runsDescriptor,
    )

    const cachedTokens = target.tokens.filter(
      token =>
        token.start >= edits.cachedContextDeclaration.localStart &&
        token.end <= edits.cachedContextDeclaration.localEnd,
    )
    const insertedTokens = target.tokens.filter(
      token =>
        token.start >= edits.activeSkillArgumentInsertion.localStart &&
        token.end <= edits.activeSkillArgumentInsertion.localEnd,
    )
    assert.deepEqual(
      { count: cachedTokens.length, ...canonicalDigest(cachedTokens.map(normalizedToken)) },
      fixture.wholeUnitLineage.identifierNormalizedTokens.cachedContextDeclaration,
    )
    assert.deepEqual(
      {
        count: insertedTokens.length,
        ...canonicalDigest(insertedTokens.map(normalizedToken)),
      },
      fixture.wholeUnitLineage.identifierNormalizedTokens
        .activeSkillArgumentInsertion,
    )

    const retainedTokens = target.tokens.filter(
      token =>
        !(
          token.start >= edits.cachedContextDeclaration.localStart &&
          token.end <= edits.cachedContextDeclaration.localEnd
        ) &&
        !(
          token.start >= edits.activeSkillArgumentInsertion.localStart &&
          token.end <= edits.activeSkillArgumentInsertion.localEnd
        ),
    )
    const contextValueStart = processContext.node.value.start
    const contextValueEnd = processContext.node.value.end
    const valueIndex = retainedTokens.findIndex(
      token => token.start === contextValueStart && token.end === contextValueEnd,
    )
    assert.ok(valueIndex >= 0)
    const reconstructedTokens = retainedTokens.map(normalizedToken)
    reconstructedTokens.splice(valueIndex + 1, 0, ['(', null], [')', null])
    assert.deepEqual(reconstructedTokens, normalizedBaseline)
    assert.deepEqual(
      {
        count: reconstructedTokens.length,
        ...canonicalDigest(reconstructedTokens),
      },
      fixture.wholeUnitLineage.identifierNormalizedTokens.reconstructedTarget,
    )

    assert.ok(Array.isArray(cached.parent.body))
    cached.parent.body.splice(cached.key, 1)
    processContext.node.value = parse('G()', {
      ecmaVersion: 'latest',
    }).body[0].expression
    targetOnQuery.node.arguments.pop()
    assert.deepEqual(canonicalize(target.node), canonicalize(baseline.node))
    assert.deepEqual(
      canonicalDescriptor(target.node),
      fixture.wholeUnitLineage.reconstructedTargetCanonical,
    )
    assert.equal(countOccurrences(target.source, 'activeSkill'), 1)
    assert.equal(countOccurrences(target.source, 'spawnedBySkill'), 0)
  },
)

test(
  'raw source authenticates executeUserInput while proving the type graph incomplete',
  { skip: !selected },
  () => {
    const ts = typescript()
    const expected = fixture.sourceState.handlePromptSubmit
    const baselineRoot = baselineSourceRoot()
    const targetRoot = targetSourceRoot()
    const baseline = handlePromptSubmitEvidence(ts, baselineRoot, expected)
    const target = handlePromptSubmitEvidence(ts, targetRoot, expected)
    assert.equal(baseline, target)
    toolUseContextEvidence(ts, targetRoot, fixture.sourceState.toolUseContext)
    processUserInputContextEvidence(
      ts,
      targetRoot,
      fixture.sourceState.processUserInputContext,
    )
    assert.deepEqual(
      sourceRootMarkerCounts(baselineRoot),
      fixture.sourceState.sourceRootMarkerCounts,
    )
    assert.deepEqual(
      sourceRootMarkerCounts(targetRoot),
      fixture.sourceState.sourceRootMarkerCounts,
    )
    assert.equal(
      git(path.dirname(baselineRoot), ['rev-parse', 'HEAD']),
      expected.target120.gitCommit,
    )
    assert.equal(
      git(path.dirname(baselineRoot), ['rev-parse', `HEAD:${expected.path}`]),
      expected.target120.gitBlob,
    )
    assert.equal(
      git(path.dirname(targetRoot), ['rev-parse', 'HEAD']),
      expected.target121.gitCommit,
    )
    assert.equal(
      git(path.dirname(targetRoot), ['rev-parse', `HEAD:${expected.path}`]),
      expected.target121.gitBlob,
    )
    assert.equal(
      git(path.dirname(targetRoot), [
        'rev-parse',
        `HEAD:${fixture.sourceState.toolUseContext.path}`,
      ]),
      fixture.sourceState.toolUseContext.gitBlob,
    )
    assert.equal(
      git(path.dirname(targetRoot), [
        'rev-parse',
        `HEAD:${fixture.sourceState.processUserInputContext.path}`,
      ]),
      fixture.sourceState.processUserInputContext.gitBlob,
    )
  },
)

test(
  'fresh Target121 package independently preserves the complete source blocker',
  { skip: !selected },
  t => {
    const root = freshPackageSourceRoot()
    if (!fs.existsSync(root)) {
      t.skip(`fresh Target121 package source is unavailable: ${root}`)
      return
    }
    const ts = typescript()
    const raw = handlePromptSubmitEvidence(
      ts,
      targetSourceRoot(),
      fixture.sourceState.handlePromptSubmit,
    )
    const fresh = handlePromptSubmitEvidence(
      ts,
      root,
      fixture.sourceState.handlePromptSubmit,
    )
    assert.equal(fresh, raw)
    toolUseContextEvidence(ts, root, fixture.sourceState.toolUseContext)
    processUserInputContextEvidence(
      ts,
      root,
      fixture.sourceState.processUserInputContext,
    )
    assert.deepEqual(
      sourceRootMarkerCounts(root),
      fixture.sourceState.sourceRootMarkerCounts,
    )
  },
)

test(
  'the static proof removes exactly one residue and is import-idempotent',
  { skip: !selected },
  async () => {
    const evolution = fixture.strictEvolution
    assert.equal(evolution.integrationOrder, 'u19537 is integrated before u20775')
    assert.deepEqual(evolution.removes.targetIndices, [20775])
    assert.equal(evolution.removes.units, 1)
    assert.equal(evolution.removes.residueCount, 1)
    assert.deepEqual(evolution.removes.residues, fixture.ownerResidues.strictRowsExact)
    assert.equal(
      evolution.before.unsupportedUnits - evolution.removes.units,
      evolution.predictedAfter.unsupportedUnits,
    )
    assert.equal(
      evolution.before.unsupportedResidues - evolution.removes.residueCount,
      evolution.predictedAfter.unsupportedResidues,
    )
    assert.match(fixture.sourceReplayBlocker.decision, /static whole-unit/)
    assert.equal(fixture.sourceReplayBlocker.reasons.length, 4)
    const moduleUrl = new URL(
      '../cases/2.1.120-to-2.1.121/recovered/handle-prompt-submit-active-skill-owner-overrides.mjs',
      import.meta.url,
    )
    const freshImport = await import(`${moduleUrl.href}?proof=${Date.now()}`)
    assert.deepEqual(
      freshImport.TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_OWNER_OVERRIDES,
      TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_OWNER_OVERRIDES,
    )
    assert.deepEqual(
      freshImport.TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_EVIDENCE_IDS,
      TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_EVIDENCE_IDS,
    )
  },
)
