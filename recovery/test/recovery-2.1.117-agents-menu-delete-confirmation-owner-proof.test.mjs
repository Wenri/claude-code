import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET117_AGENTS_MENU_DELETE_CONFIRMATION_EVIDENCE_IDS,
  TARGET117_AGENTS_MENU_DELETE_CONFIRMATION_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/agents-menu-delete-confirmation-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-agents-menu-delete-confirmation-owner-proof.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '4c091e45d1920437471f8abfe0a64bb550933fdf9603ef2d4667f8a8c00749a1'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function bundlePath(environmentName, input) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, input.path),
  )
}

function sourceRoot() {
  return path.resolve(
    process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT ??
      path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
  )
}

function sourceFilename(root, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  return path.join(root, sourcePath.slice(4))
}

function walk(node, visit, parent = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent)
    return
  }
  if (typeof node.type === 'string') visit(node, parent)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit, node)
    }
  }
}

function parseUnit(bundleBytes, expected, label) {
  const value = bundleBytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  const program = parse(value.toString('utf8'), { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level node`)
  assert.equal(program.body[0].type, expected.nodeType ?? 'FunctionDeclaration')
  return { value, program, node: program.body[0], offset: expected.start }
}

function exactSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value.toString('utf8')
}

function findDeleteCase(node) {
  const matches = []
  walk(node, candidate => {
    if (
      candidate.type === 'SwitchCase' &&
      candidate.test?.type === 'Literal' &&
      candidate.test.value === fixture.targetDeleteCase.label
    ) {
      matches.push(candidate)
    }
  })
  assert.equal(matches.length, 1, 'one delete-confirm case')
  return matches[0]
}

function cacheFacts(node, expected, label) {
  const declarations = []
  walk(node, candidate => {
    if (
      candidate.type === 'VariableDeclarator' &&
      candidate.id?.type === 'Identifier' &&
      candidate.init?.type === 'CallExpression' &&
      candidate.init.arguments.length === 1 &&
      candidate.init.arguments[0].type === 'Literal' &&
      candidate.init.arguments[0].value === expected.arity
    ) {
      declarations.push(candidate)
    }
  })
  assert.equal(declarations.length, 1, `${label}: one memo allocation`)
  const declaration = declarations[0]
  assert.equal(declaration.id.name, '$', `${label}: cache binding`)
  assert.equal(declaration.init.callee.type, 'MemberExpression')
  assert.equal(declaration.init.callee.computed, false)
  assert.equal(declaration.init.callee.property.name, 'c')

  const accesses = []
  const invalid = []
  walk(node, (candidate, parent) => {
    if (
      candidate.type !== 'Identifier' ||
      candidate.name !== declaration.id.name ||
      candidate === declaration.id
    ) {
      return
    }
    if (
      parent?.type === 'MemberExpression' &&
      parent.object === candidate &&
      parent.computed &&
      parent.property?.type === 'Literal' &&
      Number.isInteger(parent.property.value)
    ) {
      accesses.push(parent.property.value)
    } else {
      invalid.push(parent?.type)
    }
  })
  assert.deepEqual(invalid, [], `${label}: no non-slot cache uses`)
  assert.equal(accesses.length, expected.memberAccesses)
  assert.equal(
    sha256(Buffer.from(JSON.stringify(accesses))),
    expected.accessSequenceSha256,
    `${label}: access sequence`,
  )
  const slots = [...new Set(accesses)].sort((left, right) => left - right)
  assert.equal(slots.length, expected.uniqueSlots)
  assert.equal(slots[0], expected.minimumSlot)
  assert.equal(slots.at(-1), expected.maximumSlot)
  assert.deepEqual(
    slots,
    Array.from({ length: expected.arity }, (_, index) => index),
    `${label}: closed cache allocation`,
  )
  return { declaration, accesses }
}

function caseCacheFacts(caseNode, expected, label) {
  const accesses = []
  walk(caseNode, candidate => {
    if (
      candidate.type === 'MemberExpression' &&
      candidate.computed &&
      candidate.object?.type === 'Identifier' &&
      candidate.object.name === '$' &&
      candidate.property?.type === 'Literal' &&
      Number.isInteger(candidate.property.value)
    ) {
      accesses.push(candidate.property.value)
    }
  })
  assert.equal(accesses.length, expected.memberAccesses, `${label}: accesses`)
  assert.equal(
    sha256(Buffer.from(JSON.stringify(accesses))),
    expected.accessSequenceSha256,
    `${label}: sequence`,
  )
  const slots = [...new Set(accesses)].sort((left, right) => left - right)
  assert.deepEqual(
    {
      minimum: slots[0],
      maximum: slots.at(-1),
      unique: slots.length,
    },
    {
      minimum: expected.minimum,
      maximum: expected.maximum,
      unique: expected.unique,
    },
    `${label}: slot range`,
  )
}

function cacheAccessesOutsideCase(functionNode, caseNode, relation) {
  const accesses = []
  walk(functionNode, candidate => {
    if (
      candidate.type !== 'MemberExpression' ||
      !candidate.computed ||
      candidate.object?.type !== 'Identifier' ||
      candidate.object.name !== '$' ||
      candidate.property?.type !== 'Literal' ||
      !Number.isInteger(candidate.property.value)
    ) {
      return
    }
    if (
      (relation === 'before' && candidate.start < caseNode.start) ||
      (relation === 'after' && candidate.start > caseNode.end)
    ) {
      accesses.push(candidate.property.value)
    }
  })
  return accesses
}

function canonicalize(node, parent = undefined) {
  if (Array.isArray(node)) {
    return node.map(child => canonicalize(child, parent))
  }
  if (node === null || typeof node !== 'object') return node
  const result = {}
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (node.type === 'Identifier' && key === 'name') {
      const retained =
        (parent?.type === 'MemberExpression' &&
          parent.property === node &&
          !parent.computed) ||
        (parent?.type === 'Property' &&
          parent.key === node &&
          !parent.computed &&
          !parent.shorthand) ||
        (parent?.type === 'MethodDefinition' &&
          parent.key === node &&
          !parent.computed) ||
        ((parent?.type === 'LabeledStatement' ||
          parent?.type === 'BreakStatement' ||
          parent?.type === 'ContinueStatement') &&
          parent.label === node)
      result[key] = retained ? value : '@id'
    } else {
      result[key] = canonicalize(value, node)
    }
  }
  return result
}

function normalizedOutsideDeleteCase(unitText, baseline) {
  const program = parse(unitText, { ecmaVersion: 'latest' })
  const functionNode = program.body[0]
  const deleteCase = findDeleteCase(functionNode)
  const originalCaseEnd = deleteCase.end
  deleteCase.consequent = [{
    type: 'ReturnStatement',
    argument: { type: 'Literal', value: 'DELETE_CASE', raw: '"DELETE_CASE"' },
  }]
  const first = functionNode.body.body[0]
  assert.equal(first.type, 'VariableDeclaration')
  assert.equal(first.declarations[0].init.type, 'CallExpression')
  first.declarations[0].init.arguments[0] = {
    type: 'Literal',
    value: fixture.targetMemoCache.arity,
    raw: String(fixture.targetMemoCache.arity),
  }
  if (baseline) {
    walk(program, candidate => {
      if (
        candidate.type === 'MemberExpression' &&
        candidate.computed &&
        candidate.object?.type === 'Identifier' &&
        candidate.object.name === '$' &&
        candidate.property?.type === 'Literal' &&
        Number.isInteger(candidate.property.value) &&
        candidate.start > originalCaseEnd &&
        candidate.property.value >= 178
      ) {
        candidate.property.value -= 3
        candidate.property.raw = String(candidate.property.value)
      }
    })
  }
  return JSON.stringify(canonicalize(program))
}

function normalizedInitializerWithoutConfirmation(unitText, target) {
  const program = parse(unitText, { ecmaVersion: 'latest' })
  const declaration = program.body[0]
  assert.equal(declaration.type, 'VariableDeclaration')
  const callback = declaration.declarations[0].init.arguments[0]
  assert.equal(callback.type, 'ArrowFunctionExpression')
  assert.equal(callback.body.type, 'BlockStatement')
  if (target) {
    const matches = callback.body.body.filter(
      statement =>
        statement.type === 'ExpressionStatement' &&
        statement.expression?.type === 'CallExpression' &&
        statement.expression.callee?.type === 'Identifier' &&
        statement.expression.callee.name ===
          fixture.confirmationComponent.agentsInitializer
            .dependencyInitializerBinding,
    )
    assert.equal(matches.length, 1, 'one ConfirmationButtons initializer edge')
    callback.body.body = callback.body.body.filter(row => row !== matches[0])
  }
  return JSON.stringify(canonicalize(program))
}

function propertyName(property) {
  if (property.computed) return undefined
  if (property.key?.type === 'Identifier') return property.key.name
  if (property.key?.type === 'Literal') return property.key.value
  return undefined
}

function jsxTagName(ts, node, sourceFile) {
  return node.tagName.getText(sourceFile)
}

function extractRawMapSource(cookedSource, label) {
  const match = cookedSource.match(
    /\/\/# sourceMappingURL=data:application\/json[^,]*,([^\n]+)$/m,
  )
  assert.ok(match, `${label}: inline source map`)
  const map = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'))
  assert.equal(map.sourcesContent.length, 1, `${label}: one raw source`)
  return map.sourcesContent[0]
}

let typescriptPromise
async function loadTypeScript() {
  typescriptPromise ??= import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
      ),
    ).href,
  ).then(imported => imported.default ?? imported)
  return typescriptPromise
}

function descendants(ts, root, predicate) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function exactTsNode(source, sourceFile, node, expected, label) {
  const start = node.getStart(sourceFile)
  const end = node.end
  const bytes = Buffer.from(source.slice(start, end))
  assert.deepEqual(
    { start, end, ...descriptor(bytes) },
    {
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      sha256: expected.sha256,
    },
    label,
  )
}

test(
  '2.1.117 AgentsMenu fixture freezes one six-residue static owner proof',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'case-owned-static-owner-proof')
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 6,
      sourceFiles: 1,
      sourceReplays: 0,
      ownerOverrides: 1,
      compilerOnlyResidues: 3,
      semanticResidues: 3,
    })
    assert.deepEqual(
      [...TARGET117_AGENTS_MENU_DELETE_CONFIRMATION_EVIDENCE_IDS],
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET117_AGENTS_MENU_DELETE_CONFIRMATION_OWNER_OVERRIDES.map(row => ({
        key: row.key,
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
      })),
      [{
        key: `${caseName}:${fixture.targetUnit.targetIndex}`,
        targetIndex: fixture.targetUnit.targetIndex,
        paths: [fixture.source.path],
        declarations: [fixture.source.declaration.name],
        evidenceIds: fixture.evidenceIds,
      }],
    )
    const behavior =
      TARGET117_AGENTS_MENU_DELETE_CONFIRMATION_OWNER_OVERRIDES[0].behavior
    assert.match(behavior, /complete authenticated Target117 AgentsMenu unit/)
    assert.match(behavior, /three numeric residues are React compiler cache-slot indices/)
    assert.match(behavior, /deliberately does not claim or perform a partial source replay/)
    assert.equal(
      fixture.source.replayDisposition,
      'blocked-stale-source-no-partial-replay',
    )
  },
)

test(
  '2.1.117 exact ledgers and historical map bind u17275 to AgentsMenu',
  { skip: !selected },
  () => {
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const targetRow = ledger.regions.find(
      row => row.target?.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetRow)
    assert.deepEqual({
      classification: targetRow.classification,
      nodeType: targetRow.target.nodeType,
      start: targetRow.target.start,
      end: targetRow.target.end,
      tokenCount: targetRow.target.tokenCount,
      sha256: targetRow.target.sourceHash,
      coarseHash: targetRow.target.coarseHash,
    }, {
      classification: fixture.targetUnit.classification,
      nodeType: fixture.targetUnit.nodeType,
      start: fixture.targetUnit.start,
      end: fixture.targetUnit.end,
      tokenCount: fixture.targetUnit.tokenCount,
      sha256: fixture.targetUnit.sha256,
      coarseHash: fixture.targetUnit.coarseHash,
    })
    const baselineRow = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.baselineIndex,
    )
    assert.ok(baselineRow)
    assert.deepEqual({
      nodeType: baselineRow.nodeType,
      start: baselineRow.start,
      end: baselineRow.end,
      tokenCount: baselineRow.tokenCount,
      sha256: baselineRow.sourceHash,
      coarseHash: baselineRow.coarseHash,
    }, {
      nodeType: fixture.baselineUnit.nodeType,
      start: fixture.baselineUnit.start,
      end: fixture.baselineUnit.end,
      tokenCount: fixture.baselineUnit.tokenCount,
      sha256: fixture.baselineUnit.sha256,
      coarseHash: fixture.baselineUnit.coarseHash,
    })
    for (const expected of [
      fixture.confirmationComponent,
      fixture.confirmationComponent.initializer,
      fixture.confirmationComponent.agentsInitializer,
      fixture.keyboardShortcutContext.targetUnit,
      fixture.agentNavigationFooterContext.targetUnit,
      fixture.agentsCommandCallerContext.targetUnit,
    ]) {
      const row = ledger.regions.find(
        candidate => candidate.target?.index === expected.targetIndex,
      )
      assert.ok(row, `u${expected.targetIndex}`)
      assert.equal(row.target.start, expected.start)
      assert.equal(row.target.end, expected.end)
      assert.equal(row.target.sourceHash, expected.sha256)
      if (expected.classification) {
        assert.equal(row.classification, expected.classification)
      }
      if (expected.baselineUnitIndex) {
        assert.equal(row.baselineUnitIndex, expected.baselineUnitIndex)
      }
    }
    assert.ok(
      ledger.regions.some(
        row =>
          row.baselineUnitIndex ===
          fixture.confirmationComponent.baselineAgentsInitializer.baselineIndex,
      ),
      'baseline AgentsMenu initializer remains represented by its exact index',
    )

    const attribution = gunzipSync(
      readExact(
        path.join(repositoryRoot, fixture.attributionSources.path),
        fixture.attributionSources,
        'attribution sources',
      ),
    )
      .toString('utf8')
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line))
    const row = attribution.find(
      candidate =>
        candidate.sourceIndex === fixture.attributionSources.row.sourceIndex,
    )
    assert.ok(row)
    const expected = fixture.attributionSources.row
    assert.deepEqual({
      runIndex: row.runIndex,
      sourceIndex: row.sourceIndex,
      source: row.source,
      envelopeStart: row.envelopeStart,
      envelopeEnd: row.envelopeEnd,
      exactAnchorCount: row.exactAnchorCount,
      monotoneAnchorCount: row.monotoneAnchorCount,
      nonMonotoneAnchorCount: row.nonMonotoneAnchorCount,
    }, {
      runIndex: expected.runIndex,
      sourceIndex: expected.sourceIndex,
      source: expected.source,
      envelopeStart: expected.envelopeStart,
      envelopeEnd: expected.envelopeEnd,
      exactAnchorCount: expected.exactAnchorCount,
      monotoneAnchorCount: expected.monotoneAnchorCount,
      nonMonotoneAnchorCount: expected.nonMonotoneAnchorCount,
    })
    assert.deepEqual(row.targetAnchorClusters, [{
      sourceIndex: expected.sourceIndex,
      ...expected.targetCluster,
    }])
    assert.ok(
      expected.targetCluster.targetStart > fixture.targetUnit.start &&
        expected.targetCluster.targetEnd < fixture.targetUnit.end,
      'all ten historical ownership anchors land inside u17275',
    )
  },
)

test(
  '2.1.117 bundle proves the exact delete-control migration and cache-only tail',
  { skip: !selected },
  () => {
    const baselineBytes = readExact(
      bundlePath('CLAUDE_CODE_2_1_116_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'baseline bundle',
    )
    const targetBytes = readExact(
      bundlePath('CLAUDE_CODE_2_1_117_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'target bundle',
    )
    const baseline = parseUnit(
      baselineBytes,
      fixture.baselineUnit,
      'baseline AgentsMenu',
    )
    const target = parseUnit(targetBytes, fixture.targetUnit, 'target AgentsMenu')
    const baselineCache = cacheFacts(
      baseline.node,
      fixture.baselineMemoCache,
      'baseline cache',
    )
    const targetCache = cacheFacts(
      target.node,
      fixture.targetMemoCache,
      'target cache',
    )
    assert.equal(
      baselineCache.declaration.init.arguments[0].value -
        targetCache.declaration.init.arguments[0].value,
      3,
      'delete migration removes exactly three cache slots',
    )

    const baselineCase = findDeleteCase(baseline.node)
    const targetCase = findDeleteCase(target.node)
    const baselineCaseBytes = baseline.value.subarray(
      baselineCase.start,
      baselineCase.end,
    )
    const targetCaseBytes = target.value.subarray(targetCase.start, targetCase.end)
    assert.deepEqual({
      start: baseline.offset + baselineCase.start,
      end: baseline.offset + baselineCase.end,
      ...descriptor(baselineCaseBytes),
    }, {
      start: fixture.baselineDeleteCase.start,
      end: fixture.baselineDeleteCase.end,
      bytes: fixture.baselineDeleteCase.bytes,
      sha256: fixture.baselineDeleteCase.sha256,
    })
    assert.deepEqual({
      start: target.offset + targetCase.start,
      end: target.offset + targetCase.end,
      ...descriptor(targetCaseBytes),
    }, {
      start: fixture.targetDeleteCase.start,
      end: fixture.targetDeleteCase.end,
      bytes: fixture.targetDeleteCase.bytes,
      sha256: fixture.targetDeleteCase.sha256,
    })
    caseCacheFacts(
      baselineCase,
      fixture.baselineDeleteCase.cacheSlots,
      'baseline delete case',
    )
    caseCacheFacts(
      targetCase,
      fixture.targetDeleteCase.cacheSlots,
      'target delete case',
    )

    const baselineSelectCalls = []
    const targetConfirmationCalls = []
    walk(baselineCase, node => {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.arguments[0]?.type === 'Identifier' &&
        node.arguments[0].name === 'A8'
      ) {
        baselineSelectCalls.push(node)
      }
    })
    walk(targetCase, node => {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.arguments[0]?.type === 'Identifier' &&
        node.arguments[0].name ===
          fixture.targetDeleteCase.confirmationCall.componentBinding
      ) {
        targetConfirmationCalls.push(node)
      }
    })
    assert.equal(baselineSelectCalls.length, 1, 'one baseline Select call')
    assert.equal(targetConfirmationCalls.length, 1, 'one target confirmation call')
    const select = baselineSelectCalls[0]
    const confirmation = targetConfirmationCalls[0]
    assert.deepEqual({
      start: baseline.offset + select.start,
      end: baseline.offset + select.end,
      ...descriptor(baseline.value.subarray(select.start, select.end)),
    }, fixture.baselineDeleteCase.selectCall)
    assert.deepEqual({
      start: target.offset + confirmation.start,
      end: target.offset + confirmation.end,
      ...descriptor(target.value.subarray(confirmation.start, confirmation.end)),
    }, {
      start: fixture.targetDeleteCase.confirmationCall.start,
      end: fixture.targetDeleteCase.confirmationCall.end,
      bytes: fixture.targetDeleteCase.confirmationCall.bytes,
      sha256: fixture.targetDeleteCase.confirmationCall.sha256,
    })
    const props = confirmation.arguments[1]
    assert.equal(props.type, 'ObjectExpression')
    assert.deepEqual(
      props.properties.map(propertyName),
      fixture.targetDeleteCase.confirmationCall.propertyOrder,
    )
    const byName = Object.fromEntries(
      props.properties.map(property => [propertyName(property), property.value]),
    )
    assert.equal(
      byName.confirmLabel.value,
      fixture.targetDeleteCase.confirmationCall.confirmLabel,
    )
    assert.equal(
      byName.cancelLabel.value,
      fixture.targetDeleteCase.confirmationCall.cancelLabel,
    )
    assert.equal(byName.onConfirm.type, 'Identifier')
    assert.equal(byName.onCancel.type, 'Identifier')

    const targetArrows = []
    const baselineArrows = []
    walk(targetCase, node => {
      if (node.type === 'ArrowFunctionExpression') targetArrows.push(node)
    })
    walk(baselineCase, node => {
      if (node.type === 'ArrowFunctionExpression') baselineArrows.push(node)
    })
    assert.equal(targetArrows.length, 2, 'one cancel and one direct confirm callback')
    assert.equal(baselineArrows.length, 3, 'choice adapter and two cancel callbacks')
    const targetArrowTexts = targetArrows.map(node =>
      target.value.subarray(node.start, node.end).toString('utf8'),
    )
    assert.equal(
      targetArrowTexts.filter(text => text === '()=>{if("previousMode"in f)z(f.previousMode)}').length,
      1,
      'one shared target cancel callback',
    )
    assert.ok(targetArrowTexts.includes('()=>void AH(f.agent)'))
    assert.ok(
      baseline.value
        .subarray(baselineCase.start, baselineCase.end)
        .toString('utf8')
        .includes('if(iH==="yes")AH(f.agent)'),
      'baseline uses a yes/no choice adapter',
    )

    const preBaseline = cacheAccessesOutsideCase(
      baseline.node,
      baselineCase,
      'before',
    )
    const preTarget = cacheAccessesOutsideCase(target.node, targetCase, 'before')
    assert.deepEqual(preTarget, preBaseline, 'pre-case cache sequence is identical')
    const equivalence = fixture.outsideDeleteCaseEquivalence
    assert.equal(preTarget.length, equivalence.preCaseCacheAccesses)
    assert.equal(Math.min(...preTarget), equivalence.preCaseCacheMinimum)
    assert.equal(Math.max(...preTarget), equivalence.preCaseCacheMaximum)
    assert.equal(
      sha256(Buffer.from(JSON.stringify(preTarget))),
      equivalence.preCaseCacheSequenceSha256,
    )
    const postBaseline = cacheAccessesOutsideCase(
      baseline.node,
      baselineCase,
      'after',
    )
    const postTarget = cacheAccessesOutsideCase(target.node, targetCase, 'after')
    const shifted = postBaseline.map(slot => slot - 3)
    assert.deepEqual(postTarget, shifted, 'post-case cache sequence shifts by -3')
    assert.equal(postTarget.length, equivalence.postCaseCacheAccesses)
    assert.equal(Math.min(...postTarget), equivalence.targetPostCaseCacheMinimum)
    assert.equal(Math.max(...postTarget), equivalence.targetPostCaseCacheMaximum)
    assert.equal(Math.min(...postBaseline), equivalence.baselinePostCaseCacheMinimum)
    assert.equal(Math.max(...postBaseline), equivalence.baselinePostCaseCacheMaximum)
    assert.equal(
      sha256(Buffer.from(JSON.stringify(shifted))),
      equivalence.shiftedPostCaseCacheSequenceSha256,
    )

    const normalizedBaseline = normalizedOutsideDeleteCase(
      baseline.value.toString('utf8'),
      true,
    )
    const normalizedTarget = normalizedOutsideDeleteCase(
      target.value.toString('utf8'),
      false,
    )
    assert.equal(normalizedBaseline, normalizedTarget)
    assert.equal(normalizedTarget.length, equivalence.normalizedChars)
    assert.deepEqual(descriptor(Buffer.from(normalizedTarget)), {
      bytes: equivalence.normalizedBytes,
      sha256: equivalence.normalizedSha256,
    })

    for (const [kind, value, start, end] of fixture.residues) {
      const localStart = start - target.offset
      const localEnd = end - target.offset
      assert.equal(target.value.subarray(localStart, localEnd).toString('utf8'), String(value))
      const matches = []
      walk(target.node, (node, parent) => {
        if (node.start !== localStart || node.end !== localEnd) return
        if (kind === 'property') {
          if (
            node.type === 'Identifier' &&
            node.name === value &&
            parent?.type === 'Property' &&
            parent.key === node
          ) {
            matches.push({ node, parent })
          }
        } else if (
          node.type === 'Literal' &&
          node.value === value &&
          parent?.type === 'MemberExpression' &&
          parent.object?.type === 'Identifier' &&
          parent.object.name === '$' &&
          parent.property === node
        ) {
          matches.push({ node, parent })
        }
      })
      assert.equal(matches.length, 1, `${kind} ${value} exact structural residue`)
    }

    const generic = parseUnit(
      targetBytes,
      fixture.confirmationComponent,
      'ConfirmationButtons target unit',
    )
    assert.equal(generic.node.id.name, fixture.confirmationComponent.binding)
    const genericText = generic.value.toString('utf8')
    assert.match(genericText, /confirmLabel/)
    assert.match(genericText, /cancelLabel/)
    assert.match(genericText, /W==="confirm"\?q\(\):K\(\)/)
    const genericInitializer = exactSlice(
      targetBytes,
      fixture.confirmationComponent.initializer,
      'ConfirmationButtons initializer',
    )
    assert.match(genericInitializer, /^var YM=v/)
    const targetInitializer = exactSlice(
      targetBytes,
      fixture.confirmationComponent.agentsInitializer,
      'target AgentsMenu initializer',
    )
    const baselineInitializer = exactSlice(
      baselineBytes,
      fixture.confirmationComponent.baselineAgentsInitializer,
      'baseline AgentsMenu initializer',
    )
    assert.equal(
      exactSlice(
        targetBytes,
        fixture.confirmationComponent.agentsInitializer.dependencyCall,
        'exact YM dependency edge',
      ),
      'YM();',
    )
    assert.match(targetInitializer, /R4\(\);YM\(\);VK\(\)/)
    assert.doesNotMatch(baselineInitializer, /YM\(\)/)
    const normalizedTargetInitializer = normalizedInitializerWithoutConfirmation(
      targetInitializer,
      true,
    )
    const normalizedBaselineInitializer = normalizedInitializerWithoutConfirmation(
      baselineInitializer,
      false,
    )
    assert.equal(normalizedTargetInitializer, normalizedBaselineInitializer)
    assert.deepEqual(descriptor(Buffer.from(normalizedTargetInitializer)), {
      bytes:
        fixture.confirmationComponent.agentsInitializer
          .withoutDependencyNormalizedBytes,
      sha256:
        fixture.confirmationComponent.agentsInitializer
          .withoutDependencyNormalizedSha256,
    })

    const keyboard = parseUnit(
      targetBytes,
      fixture.keyboardShortcutContext.targetUnit,
      'KeyboardShortcutHint target unit',
    )
    assert.equal(
      keyboard.node.id.name,
      fixture.keyboardShortcutContext.targetUnit.binding,
    )
    assert.match(keyboard.value.toString('utf8'), /chord/)
    assert.match(keyboard.value.toString('utf8'), /action/)
    const footer = parseUnit(
      targetBytes,
      fixture.agentNavigationFooterContext.targetUnit,
      'AgentNavigationFooter target unit',
    )
    assert.equal(
      footer.value.toString('utf8').match(/createElement\(K\$/g)?.length,
      3,
      'retained target footer owns three KeyboardShortcutHint calls',
    )
    const caller = parseUnit(
      targetBytes,
      fixture.agentsCommandCallerContext.targetUnit,
      'agents command caller',
    )
    assert.equal(
      exactSlice(
        targetBytes,
        fixture.agentsCommandCallerContext.targetCall,
        'target command call',
      ).includes('toolUseContext:$'),
      true,
    )
    assert.match(caller.value.toString('utf8'), /toolUseContext:\$/)
    assert.match(
      exactSlice(
        baselineBytes,
        fixture.agentsCommandCallerContext.baselineCall,
        'baseline command call',
      ),
      /toolUseContext:\$/,
    )
  },
)

test(
  '2.1.117 raw and packaged source prove why u17275 must not be partially replayed',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    assert.equal(
      execFileSync(
        'git',
        ['rev-parse', `${fixture.source.rawTargetSourceCommit}^{tree}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.source.rawTargetSourceTree,
    )
    assert.equal(
      execFileSync(
        'git',
        ['rev-parse', `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.source.blob,
    )
    const gitBytes = execFileSync(
      'git',
      ['show', `${fixture.source.rawTargetSourceCommit}:${fixture.source.path}`],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(gitBytes), expectedDescriptor(fixture.source))

    const root = sourceRoot()
    const ownerFilename = sourceFilename(root, fixture.source.path)
    const ownerStat = fs.lstatSync(ownerFilename)
    assert.ok(ownerStat.isFile() && !ownerStat.isSymbolicLink(), 'real owner file')
    const ownerBytes = readExact(ownerFilename, fixture.source, 'AgentsMenu source')
    const ownerSource = ownerBytes.toString('utf8')
    const ownerFile = ts.createSourceFile(
      ownerFilename,
      ownerSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(ownerFile.parseDiagnostics.length, 0)
    const declarations = descendants(
      ts,
      ownerFile,
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === fixture.source.declaration.name,
    )
    assert.equal(declarations.length, 1)
    const declaration = declarations[0]
    exactTsNode(
      ownerSource,
      ownerFile,
      declaration,
      fixture.source.declaration,
      'cooked AgentsMenu declaration',
    )
    const cacheCalls = descendants(
      ts,
      declaration,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(ownerFile) === '_c' &&
        node.arguments.length === 1 &&
        ts.isNumericLiteral(node.arguments[0]),
    )
    assert.equal(cacheCalls.length, 1)
    assert.equal(
      Number(cacheCalls[0].arguments[0].text),
      fixture.source.declaration.memoCacheArity,
    )
    assert.notEqual(
      fixture.source.declaration.memoCacheArity,
      fixture.targetMemoCache.arity,
      'cooked owner is not the Target117 compiler postimage',
    )

    const props = ownerFile.statements.filter(
      node => ts.isTypeAliasDeclaration(node) && node.name.text === 'Props',
    )
    assert.equal(props.length, 1)
    exactTsNode(ownerSource, ownerFile, props[0], fixture.source.props, 'cooked Props')
    assert.deepEqual(
      props[0].type.members.map(member => member.name.getText(ownerFile)),
      fixture.source.props.members,
    )
    const cases = descendants(
      ts,
      declaration,
      node =>
        ts.isCaseClause(node) &&
        ts.isStringLiteral(node.expression) &&
        node.expression.text === fixture.targetDeleteCase.label,
    )
    assert.equal(cases.length, 1)
    exactTsNode(
      ownerSource,
      ownerFile,
      cases[0],
      fixture.source.deleteCase,
      'cooked legacy delete case',
    )
    const selectCalls = descendants(
      ts,
      cases[0],
      node =>
        ts.isJsxSelfClosingElement(node) &&
        jsxTagName(ts, node, ownerFile) === 'Select',
    )
    assert.equal(selectCalls.length, 1)
    exactTsNode(
      ownerSource,
      ownerFile,
      selectCalls[0],
      fixture.source.selectCall,
      'cooked legacy Select call',
    )
    const footers = descendants(
      ts,
      cases[0],
      node =>
        ts.isJsxSelfClosingElement(node) &&
        jsxTagName(ts, node, ownerFile) === 'AgentNavigationFooter',
    )
    assert.equal(footers.length, 1)
    exactTsNode(
      ownerSource,
      ownerFile,
      footers[0],
      fixture.source.manualFooter,
      'cooked manual navigation footer',
    )
    const imports = ownerFile.statements.filter(ts.isImportDeclaration)
    assert.equal(
      imports.filter(
        node => node.moduleSpecifier.text === fixture.source.selectImport.module,
      ).length,
      1,
    )
    assert.equal(
      imports.filter(
        node => node.moduleSpecifier.text === fixture.source.missingTargetImport,
      ).length,
      0,
    )
    assert.equal(
      imports.filter(node =>
        node.moduleSpecifier.text.endsWith('/KeyboardShortcutHint.js'),
      ).length,
      0,
    )

    const rawSource = extractRawMapSource(ownerSource, 'AgentsMenu')
    const raw = fixture.source.rawMapSource
    assert.equal(rawSource.length, raw.chars)
    assert.deepEqual(descriptor(Buffer.from(rawSource)), expectedDescriptor(raw))
    const rawFile = ts.createSourceFile(
      'AgentsMenu.tsx',
      rawSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(rawFile.parseDiagnostics.length, 0)
    const rawProps = rawFile.statements.find(
      node => ts.isTypeAliasDeclaration(node) && node.name.text === 'Props',
    )
    const rawDeclaration = rawFile.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === fixture.source.declaration.name,
    )
    assert.ok(rawProps && rawDeclaration)
    exactTsNode(rawSource, rawFile, rawProps, raw.props, 'raw-map Props')
    exactTsNode(
      rawSource,
      rawFile,
      rawDeclaration,
      raw.declaration,
      'raw-map AgentsMenu declaration',
    )
    const rawCase = descendants(
      ts,
      rawDeclaration,
      node =>
        ts.isCaseClause(node) &&
        ts.isStringLiteral(node.expression) &&
        node.expression.text === fixture.targetDeleteCase.label,
    )[0]
    assert.ok(rawCase)
    exactTsNode(rawSource, rawFile, rawCase, raw.deleteCase, 'raw-map delete case')
    const rawSelect = descendants(
      ts,
      rawCase,
      node =>
        ts.isJsxSelfClosingElement(node) &&
        jsxTagName(ts, node, rawFile) === 'Select',
    )[0]
    const rawFooter = descendants(
      ts,
      rawCase,
      node =>
        ts.isJsxSelfClosingElement(node) &&
        jsxTagName(ts, node, rawFile) === 'AgentNavigationFooter',
    )[0]
    assert.ok(rawSelect && rawFooter)
    exactTsNode(rawSource, rawFile, rawSelect, raw.selectJsx, 'raw-map Select')
    exactTsNode(rawSource, rawFile, rawFooter, raw.manualFooter, 'raw-map footer')

    const caller = fixture.agentsCommandCallerContext.legacySource
    const callerBytes = readExact(
      sourceFilename(root, caller.path),
      caller,
      'legacy agents command source',
    )
    const callerSource = callerBytes.toString('utf8')
    const callerFile = ts.createSourceFile(
      caller.path,
      callerSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const callerDeclaration = callerFile.statements.find(
      node => ts.isFunctionDeclaration(node) && node.name?.text === caller.declaration.name,
    )
    assert.ok(callerDeclaration)
    exactTsNode(
      callerSource,
      callerFile,
      callerDeclaration,
      caller.declaration,
      'legacy command declaration',
    )
    const agentsJsx = descendants(
      ts,
      callerDeclaration,
      node =>
        ts.isJsxSelfClosingElement(node) &&
        jsxTagName(ts, node, callerFile) === 'AgentsMenu',
    )
    assert.equal(agentsJsx.length, 1)
    exactTsNode(
      callerSource,
      callerFile,
      agentsJsx[0],
      caller.agentsMenuJsx,
      'legacy caller JSX',
    )
    assert.equal(
      agentsJsx[0].attributes.properties.some(
        attribute => attribute.name?.text === caller.missingProp,
      ),
      false,
      'legacy source omits the retained toolUseContext prop',
    )

    const footerContext = fixture.agentNavigationFooterContext.legacySource
    const footerBytes = readExact(
      sourceFilename(root, footerContext.path),
      footerContext,
      'legacy AgentNavigationFooter source',
    )
    const footerSource = footerBytes.toString('utf8')
    const footerFile = ts.createSourceFile(
      footerContext.path,
      footerSource,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const footerProps = footerFile.statements.find(
      node => ts.isTypeAliasDeclaration(node) && node.name.text === 'Props',
    )
    const footerDeclaration = footerFile.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === footerContext.declaration.name,
    )
    assert.ok(footerProps && footerDeclaration)
    exactTsNode(
      footerSource,
      footerFile,
      footerProps,
      footerContext.props,
      'legacy footer Props',
    )
    exactTsNode(
      footerSource,
      footerFile,
      footerDeclaration,
      footerContext.declaration,
      'legacy footer declaration',
    )
    assert.equal(footerProps.getText(footerFile).includes('React.ReactNode'), false)
    assert.match(footerProps.getText(footerFile), /instructions\?: string/)
    const footerRaw = extractRawMapSource(footerSource, 'AgentNavigationFooter')
    assert.equal(footerRaw.length, footerContext.rawMapSource.chars)
    assert.deepEqual(
      descriptor(Buffer.from(footerRaw)),
      expectedDescriptor(footerContext.rawMapSource),
    )

    const confirmationContext = fixture.confirmationComponent.sourceContext
    const confirmationFilename = sourceFilename(root, confirmationContext.path)
    if (fs.existsSync(confirmationFilename)) {
      const confirmationBytes = readExact(
        confirmationFilename,
        confirmationContext,
        'recovered ConfirmationButtons context',
      )
      const confirmationSource = confirmationBytes.toString('utf8')
      const confirmationFile = ts.createSourceFile(
        confirmationContext.path,
        confirmationSource,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      const confirmationDeclaration = confirmationFile.statements.find(
        node =>
          ts.isFunctionDeclaration(node) &&
          node.name?.text === confirmationContext.declaration.name,
      )
      assert.ok(confirmationDeclaration)
      exactTsNode(
        confirmationSource,
        confirmationFile,
        confirmationDeclaration,
        confirmationContext.declaration,
        'recovered ConfirmationButtons declaration',
      )
    } else {
      assert.equal(
        process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT,
        undefined,
        'an explicit packaged source root must contain ConfirmationButtons',
      )
    }

    const keyboardContext = fixture.keyboardShortcutContext
    const keyboardFilename = sourceFilename(root, keyboardContext.sourceContext.path)
    const keyboardBytes = fs.readFileSync(keyboardFilename)
    const keyboardIdentity = descriptor(keyboardBytes)
    const postKeyboard = expectedDescriptor(keyboardContext.sourceContext)
    const rawKeyboard = expectedDescriptor(keyboardContext.rawSourceContext)
    assert.ok(
      (keyboardIdentity.bytes === postKeyboard.bytes &&
        keyboardIdentity.sha256 === postKeyboard.sha256) ||
        (keyboardIdentity.bytes === rawKeyboard.bytes &&
          keyboardIdentity.sha256 === rawKeyboard.sha256),
      'keyboard source is exact raw or recovered compatibility postimage',
    )
    if (keyboardIdentity.sha256 === postKeyboard.sha256) {
      const keyboardSource = keyboardBytes.toString('utf8')
      const keyboardFile = ts.createSourceFile(
        keyboardContext.sourceContext.path,
        keyboardSource,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      const keyboardDeclaration = keyboardFile.statements.find(
        node =>
          ts.isFunctionDeclaration(node) &&
          node.name?.text === keyboardContext.sourceContext.declaration.name,
      )
      assert.ok(keyboardDeclaration)
      exactTsNode(
        keyboardSource,
        keyboardFile,
        keyboardDeclaration,
        keyboardContext.sourceContext.declaration,
        'recovered KeyboardShortcutHint declaration',
      )
    }
  },
)
