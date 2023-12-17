import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import vm from 'node:vm'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget121InkFrameTimingLiveCountsSourceRecovery,
  buildTarget121InkFrameTimingLiveCountsOutput,
  TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_INPUT_FILES,
  TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_OUTPUT_FILES,
  TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-ink-frame-timing-live-counts-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-ink-frame-timing-live-counts-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })
const artifactDescriptor = row => ({ bytes: row.bytes, sha256: row.sha256 })
const countOccurrences = (source, needle) => source.split(needle).length - 1

let typescriptPromise
function loadTypeScript() {
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

function walk(node, visit) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['start', 'end', 'loc', 'range'].includes(key)) walk(child, visit)
  }
}

function parseUnit(bundle, unit) {
  const value = bundle.subarray(unit.start, unit.end)
  assert.deepEqual(descriptor(value), {
    bytes: unit.bytes,
    sha256: unit.sourceHash,
  })
  const ast = parse(value.toString('utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  return { value, text: value.toString('utf8'), node: ast.body[0] }
}

function sourceFile(ts, text) {
  const parsed = ts.createSourceFile(
    'src/ink/ink.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function sourceDeclarations(ts, parsed) {
  const declarations = new Map()
  function visit(node) {
    const supported =
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    if (supported && node.name) {
      assert(!declarations.has(node.name.text), node.name.text)
      declarations.set(node.name.text, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return declarations
}

function findOne(ts, rootNode, predicate, label) {
  const matches = []
  function visit(node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(rootNode)
  assert.equal(matches.length, 1, label)
  return matches[0]
}

function unwrapParentheses(ts, node) {
  while (ts.isParenthesizedExpression(node)) node = node.expression
  return node
}

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-ink-frame-live-counts-'),
  )
  const sourceRoot = path.join(temporary, 'src')
  const spec = fixture.inputs.sourceFiles[0]
  const result = spawnSync(
    'git',
    ['show', `${fixture.sourceCommit}:${spec.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), spec.input)
  const filename = path.join(sourceRoot, spec.path.slice(4))
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, result.stdout)
  return { temporary, sourceRoot, filename, source: result.stdout.toString() }
}

function compileSourceRuntime(ts, source, parsed) {
  const declarations = sourceDeclarations(ts, parsed)
  const helperSource = ['FiberNode', 'countFiberNodes', 'countDOMNodes']
    .map(name => {
      const node = declarations.get(name)
      assert(node, name)
      return source.slice(node.getStart(parsed), node.end)
    })
    .join('\n')
  const phases = findOne(
    ts,
    parsed,
    node =>
      ts.isPropertyAssignment(node) &&
      node.name.getText(parsed) === 'phases' &&
      ts.isObjectLiteralExpression(node.initializer) &&
      node.initializer.getText(parsed).includes('fiberLive'),
    'recovered phases object',
  ).initializer
  const program = `${helperSource}
function framePhases(rootNode: unknown, current: unknown, enabled: string | undefined) {
  const process = { env: { CLAUDE_CODE_FRAME_TIMING_LOG: enabled } };
  const rendererMs = 1, diffMs = 2, optimizeMs = 3, writeMs = 4;
  const yogaMs = 5, commitMs = 6, diff = [1, 2];
  const yc = { visited: 7, measured: 8, cacheHits: 9, live: 10 };
  return (function (this: any) { return ${phases.getText(parsed)}; }).call({
    rootNode,
    container: { current }
  });
}
globalThis.api = { countFiberNodes, countDOMNodes, framePhases };
`
  const transpiled = ts.transpileModule(program, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (transpiled.diagnostics ?? [])
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnostic =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )
  assert.deepEqual(errors, [])
  const context = {}
  vm.runInNewContext(transpiled.outputText, context)
  return context.api
}

function compileTargetRuntime(targetBundle) {
  const byIndex = new Map(fixture.targetUnits.map(unit => [unit.index, unit]))
  const definitions = [7458, 7459]
    .map(index => {
      const unit = byIndex.get(index)
      return targetBundle.subarray(unit.start, unit.end).toString()
    })
    .join('\n')
  const spread = fixture.targetFragments.find(
    fragment => fragment.name === 'gatedPhaseSpread',
  ).text
  const context = {}
  vm.runInNewContext(
    `${definitions}
function frameFields(rootNode, current, enabled) {
  const process = { env: { CLAUDE_CODE_FRAME_TIMING_LOG: enabled } };
  return (function () { return ({${spread}}); }).call({
    rootNode,
    container: { current }
  });
}
globalThis.api = { countFiberNodes: fLK, countDOMNodes: YLK, frameFields }`,
    context,
  )
  return context.api
}

function graphSamples() {
  const fiber = Array.from({ length: 7 }, () => ({
    child: null,
    sibling: null,
    alternate: null,
  }))
  fiber[0].child = fiber[1]
  fiber[0].sibling = fiber[2]
  fiber[0].alternate = fiber[3]
  fiber[1].child = fiber[4]
  fiber[1].sibling = fiber[2]
  fiber[1].alternate = fiber[0]
  fiber[2].alternate = fiber[5]
  fiber[3].sibling = fiber[4]
  fiber[5].child = fiber[6]
  fiber[6].alternate = fiber[1]

  const textA = { nodeName: '#text', nodeValue: 'a' }
  const textB = { nodeName: '#text', nodeValue: 'b' }
  const nested = { nodeName: 'ink-box', childNodes: [textB] }
  const sibling = { nodeName: 'ink-text', childNodes: [] }
  const dom = { nodeName: 'ink-root', childNodes: [textA, nested, sibling] }
  return { fiber: fiber[0], dom, fiberCount: 7, domCount: 5 }
}

test('Target121 Ink fixture freezes the exact strict and dependent evidence', () => {
  assert.equal(
    sha256(fixtureBytes),
    'bdbc23ce7cc4894925e22596f7d058de260499125dffedd9fcbe1860dd453595',
  )
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.deepEqual(fixture.summary, {
    strictUnits: 2,
    dependentUnits: 1,
    ownerResidues: 65,
    targetAddedResidues: 6,
    strictIndicesSha256: sha256(JSON.stringify([7458, 7556])),
    targetAddedResiduesSha256: sha256(
      JSON.stringify(fixture.targetAddedResidues),
    ),
  })
  assert.deepEqual(
    fixture.typedResidueSummaries.map(row => [
      row.targetIndex,
      row.rowCount,
      row.targetAddedCount,
    ]),
    [
      [7458, 10, 4],
      [7459, 3, 0],
      [7556, 55, 2],
    ],
  )
  assert.deepEqual(
    TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_INPUT_FILES,
    fixture.inputs.sourceFiles.map(row => ({ path: row.path, ...row.input })),
  )
  assert.deepEqual(
    TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_OUTPUT_FILES,
    fixture.inputs.sourceFiles.map(row => ({ path: row.path, ...row.output })),
  )
  assert.deepEqual(
    TARGET121_INK_FRAME_TIMING_LIVE_COUNTS_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      declarations: [...row.declarations],
      evidenceIds: [...row.evidenceIds],
    })),
    fixture.strictRows.map(row => ({
      targetIndex: row.targetIndex,
      paths: [row.ownerPath],
      declarations: row.declarations,
      evidenceIds: row.evidenceIds,
    })),
  )
  assert.deepEqual(
    fixture.strictRows.map(row => row.ownerPath),
    ['src/ink/ink.tsx', 'src/ink/ink.tsx'],
  )
  assert.deepEqual(fixture.strictRows[0].reportedOwnerPaths, [
    'ink/log-update.ts',
  ])
  const helper = fs.readFileSync(path.join(root, fixture.inputs.replayHelper.path))
  assert.deepEqual(
    descriptor(helper),
    artifactDescriptor(fixture.inputs.replayHelper),
  )
})

test('authenticated bundles prove absence to addition and exact target units', () => {
  const baselineBundle = fs.readFileSync(
    path.join(root, fixture.inputs.baselineBundle.path),
  )
  const targetBundle = fs.readFileSync(
    path.join(root, fixture.inputs.targetBundle.path),
  )
  const ledgerBytes = fs.readFileSync(
    path.join(root, fixture.inputs.structuralLedger.path),
  )
  assert.deepEqual(
    descriptor(baselineBundle),
    artifactDescriptor(fixture.inputs.baselineBundle),
  )
  assert.deepEqual(
    descriptor(targetBundle),
    artifactDescriptor(fixture.inputs.targetBundle),
  )
  assert.deepEqual(
    descriptor(ledgerBytes),
    artifactDescriptor(fixture.inputs.structuralLedger),
  )
  const ledger = JSON.parse(gunzipSync(ledgerBytes))

  for (const unit of fixture.baselineUnits) {
    const row = ledger.unmatchedBaseline.find(item => item.index === unit.index)
    assert(row, `baseline u${unit.index}`)
    assert.deepEqual(
      {
        nodeType: row.nodeType,
        start: row.start,
        end: row.end,
        tokenCount: row.tokenCount,
        sourceHash: row.sourceHash,
        coarseHash: row.coarseHash,
      },
      {
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        tokenCount: unit.tokenCount,
        sourceHash: unit.sourceHash,
        coarseHash: unit.coarseHash,
      },
    )
    parseUnit(baselineBundle, unit)
  }
  const parsedTarget = new Map()
  for (const unit of fixture.targetUnits) {
    const region = ledger.regions.find(row => row.target?.index === unit.index)
    assert(region, `target u${unit.index}`)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      {
        nodeType: region.target.nodeType,
        start: region.target.start,
        end: region.target.end,
        tokenCount: region.target.tokenCount,
        sourceHash: region.target.sourceHash,
        coarseHash: region.target.coarseHash,
      },
      {
        nodeType: unit.nodeType,
        start: unit.start,
        end: unit.end,
        tokenCount: unit.tokenCount,
        sourceHash: unit.sourceHash,
        coarseHash: unit.coarseHash,
      },
    )
    parsedTarget.set(unit.index, parseUnit(targetBundle, unit))
  }

  for (const fragment of fixture.targetFragments) {
    const value = targetBundle.subarray(fragment.start, fragment.end)
    assert.deepEqual(descriptor(value), artifactDescriptor(fragment))
    assert.equal(value.toString(), fragment.text)
    const unit = fixture.targetUnits.find(row => row.index === fragment.unitIndex)
    assert(fragment.start >= unit.start && fragment.end <= unit.end)
  }

  const fiberProperties = []
  walk(parsedTarget.get(7458).node, node => {
    if (node.type === 'MemberExpression' && !node.computed) {
      fiberProperties.push(node.property.name)
    }
  })
  for (const [name, count] of [
    ['child', 2],
    ['sibling', 2],
    ['alternate', 2],
    ['has', 1],
    ['add', 1],
    ['size', 1],
  ]) {
    assert.equal(fiberProperties.filter(value => value === name).length, count)
  }
  let fiberSetCount = 0
  walk(parsedTarget.get(7458).node, node => {
    if (node.type === 'NewExpression' && node.callee.name === 'Set') fiberSetCount++
  })
  assert.equal(fiberSetCount, 1)

  const domText = parsedTarget.get(7459).text
  assert.equal(countOccurrences(domText, 'childNodes'), 2)
  assert(domText.includes('"childNodes"in'))

  const baselineClass = baselineBundle.subarray(
    fixture.baselineUnits[0].start,
    fixture.baselineUnits[0].end,
  )
  assert(baselineClass.includes('yogaLive'))
  assert(!baselineBundle.includes('domLive'))
  assert(!baselineBundle.includes('fiberLive'))
  assert.equal(countOccurrences(targetBundle.toString(), 'domLive'), 1)
  assert.equal(countOccurrences(targetBundle.toString(), 'fiberLive'), 1)

  const spreadAst = parse(
    `({${fixture.targetFragments.find(row => row.name === 'gatedPhaseSpread').text}})`,
    { ecmaVersion: 'latest' },
  )
  const spread = spreadAst.body[0].expression.properties[0]
  assert.equal(spread.type, 'SpreadElement')
  assert.equal(spread.argument.type, 'LogicalExpression')
  assert.equal(spread.argument.operator, '&&')
  assert.deepEqual(
    spread.argument.right.properties.map(property => property.key.name),
    ['domLive', 'fiberLive'],
  )
})

test('raw source provenance is exact and omits the authenticated live counts', async () => {
  const { temporary, source } = materializeRawSource()
  try {
    const tree = spawnSync(
      'git',
      ['ls-tree', fixture.sourceCommit, fixture.sourceBlob.path],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(tree.status, 0, tree.stderr)
    assert.match(tree.stdout, new RegExp(`blob ${fixture.sourceBlob.gitObject}\\s`))
    assert.deepEqual(
      descriptor(Buffer.from(source)),
      fixture.inputs.sourceFiles[0].input,
    )
    const ts = await loadTypeScript()
    sourceFile(ts, source)
    for (const omitted of [
      'type FiberNode =',
      'function countFiberNodes',
      'function countDOMNodes',
      'domLive:',
      'fiberLive:',
    ]) {
      assert.equal(countOccurrences(source, omitted), 0, omitted)
    }
    assert.equal(countOccurrences(source, 'yogaLive: yc.live'), 1)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('source replay restores exact declarations and the exact lazy gate AST', async () => {
  const { temporary, source } = materializeRawSource()
  try {
    const recovered = buildTarget121InkFrameTimingLiveCountsOutput(source)
    assert.deepEqual(
      descriptor(Buffer.from(recovered)),
      fixture.inputs.sourceFiles[0].output,
    )
    const ts = await loadTypeScript()
    const parsed = sourceFile(ts, recovered)
    const declarations = sourceDeclarations(ts, parsed)
    for (const expected of fixture.sourceDeclarations) {
      const node = declarations.get(expected.name)
      assert(node, expected.name)
      assert.equal(node.getStart(parsed), expected.charStart)
      assert.equal(node.end, expected.charEnd)
      assert.deepEqual(
        descriptor(Buffer.from(recovered.slice(node.getStart(parsed), node.end))),
        artifactDescriptor(expected),
      )
    }

    const fiber = declarations.get('countFiberNodes')
    const fiberText = fiber.getText(parsed)
    for (const property of ['child', 'sibling', 'alternate']) {
      assert.equal(countOccurrences(fiberText, `node.${property}`), 2)
    }
    assert.equal(countOccurrences(fiberText, 'seen.has(node)'), 1)
    assert.equal(countOccurrences(fiberText, 'seen.add(node)'), 1)
    assert.equal(countOccurrences(fiberText, 'return seen.size'), 1)

    const dom = declarations.get('countDOMNodes')
    const inExpression = findOne(
      ts,
      dom,
      node =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.InKeyword,
      'DOM childNodes in-guard',
    )
    assert.equal(inExpression.left.getText(parsed), "'childNodes'")
    findOne(ts, dom, node => ts.isForOfStatement(node), 'DOM child for-of')

    const ink = declarations.get('Ink')
    const onRender = ink.members.find(
      member =>
        ts.isMethodDeclaration(member) && member.name.getText(parsed) === 'onRender',
    )
    assert(onRender)
    const phasesProperty = findOne(
      ts,
      onRender,
      node =>
        ts.isPropertyAssignment(node) &&
        node.name.getText(parsed) === 'phases' &&
        ts.isObjectLiteralExpression(node.initializer),
      'Ink.onRender phases',
    )
    const phaseProperties = phasesProperty.initializer.properties
    assert.equal(phaseProperties.at(-2).name.getText(parsed), 'yogaLive')
    const spread = phaseProperties.at(-1)
    assert(ts.isSpreadAssignment(spread))
    assert.equal(spread.getStart(parsed), fixture.sourceGate.charStart)
    assert.equal(spread.end, fixture.sourceGate.charEnd)
    assert.deepEqual(
      descriptor(Buffer.from(recovered.slice(spread.getStart(parsed), spread.end))),
      artifactDescriptor(fixture.sourceGate),
    )
    const gate = unwrapParentheses(ts, spread.expression)
    assert(ts.isBinaryExpression(gate))
    assert.equal(gate.operatorToken.kind, ts.SyntaxKind.AmpersandAmpersandToken)
    assert.equal(
      gate.left.getText(parsed),
      'process.env.CLAUDE_CODE_FRAME_TIMING_LOG',
    )
    assert(ts.isObjectLiteralExpression(gate.right))
    assert.deepEqual(
      gate.right.properties.map(property => [
        property.name.getText(parsed),
        property.initializer.getText(parsed),
      ]),
      [
        ['domLive', 'countDOMNodes(this.rootNode)'],
        ['fiberLive', 'countFiberNodes(this.container.current)'],
      ],
    )
    assert.equal(
      countOccurrences(recovered, 'CLAUDE_CODE_FRAME_TIMING_LOG &&'),
      1,
    )
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('source and authenticated target count the same cyclic graphs lazily', async () => {
  const { temporary, source } = materializeRawSource()
  try {
    const ts = await loadTypeScript()
    const recovered = buildTarget121InkFrameTimingLiveCountsOutput(source)
    const sourceApi = compileSourceRuntime(ts, recovered, sourceFile(ts, recovered))
    const targetBundle = fs.readFileSync(
      path.join(root, fixture.inputs.targetBundle.path),
    )
    const targetApi = compileTargetRuntime(targetBundle)
    const sample = graphSamples()

    for (const api of [sourceApi, targetApi]) {
      assert.equal(api.countFiberNodes(null), 0)
      assert.equal(api.countDOMNodes(null), 0)
      assert.equal(api.countFiberNodes(sample.fiber), sample.fiberCount)
      assert.equal(api.countDOMNodes(sample.dom), sample.domCount)
    }

    const poisonFiber = new Proxy(
      {},
      { get: () => assert.fail('disabled gate traversed Fiber') },
    )
    const poisonDOM = new Proxy(
      {},
      { has: () => assert.fail('disabled gate traversed DOM') },
    )
    const disabledSource = sourceApi.framePhases(poisonDOM, poisonFiber, undefined)
    assert.equal(Object.hasOwn(disabledSource, 'domLive'), false)
    assert.equal(Object.hasOwn(disabledSource, 'fiberLive'), false)
    const disabledTarget = targetApi.frameFields(poisonDOM, poisonFiber, '')
    assert.equal(Object.hasOwn(disabledTarget, 'domLive'), false)
    assert.equal(Object.hasOwn(disabledTarget, 'fiberLive'), false)

    const enabledSource = sourceApi.framePhases(sample.dom, sample.fiber, '1')
    const enabledTarget = targetApi.frameFields(sample.dom, sample.fiber, '1')
    assert.equal(enabledSource.yogaLive, 10)
    assert.equal(enabledSource.domLive, sample.domCount)
    assert.equal(enabledSource.fiberLive, sample.fiberCount)
    assert.equal(enabledTarget.domLive, enabledSource.domLive)
    assert.equal(enabledTarget.fiberLive, enabledSource.fiberLive)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('replay is exact, package-applicable, and idempotent', () => {
  const { temporary, sourceRoot, filename } = materializeRawSource()
  try {
    assert.deepEqual(
      applyTarget121InkFrameTimingLiveCountsSourceRecovery({ sourceRoot }),
      { status: 'recovered', files: ['src/ink/ink.tsx'] },
    )
    const once = fs.readFileSync(filename)
    assert.deepEqual(descriptor(once), fixture.inputs.sourceFiles[0].output)
    assert.deepEqual(
      applyTarget121InkFrameTimingLiveCountsSourceRecovery({ sourceRoot }),
      { status: 'already-recovered', files: [] },
    )
    assert.deepEqual(fs.readFileSync(filename), once)

    const selectedRoot =
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src')
    const selectedFile = path.join(selectedRoot, 'ink/ink.tsx')
    const selectedDescriptor = descriptor(fs.readFileSync(selectedFile))
    const selectedIsInput =
      selectedDescriptor.bytes === fixture.inputs.sourceFiles[0].input.bytes &&
      selectedDescriptor.sha256 === fixture.inputs.sourceFiles[0].input.sha256
    const selectedIsOutput =
      selectedDescriptor.bytes === fixture.inputs.sourceFiles[0].output.bytes &&
      selectedDescriptor.sha256 === fixture.inputs.sourceFiles[0].output.sha256
    assert.equal(
      selectedIsInput || selectedIsOutput,
      true,
      `unexpected selected Ink source ${JSON.stringify(selectedDescriptor)}`,
    )
    const packageCopy = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-ink-selected-package-'),
    )
    try {
      const packageRoot = path.join(packageCopy, 'src')
      const packageFile = path.join(packageRoot, 'ink/ink.tsx')
      fs.mkdirSync(path.dirname(packageFile), { recursive: true })
      fs.copyFileSync(selectedFile, packageFile)
      assert.deepEqual(
        applyTarget121InkFrameTimingLiveCountsSourceRecovery({
          sourceRoot: packageRoot,
        }),
        selectedIsInput
          ? { status: 'recovered', files: ['src/ink/ink.tsx'] }
          : { status: 'already-recovered', files: [] },
      )
      assert.deepEqual(
        descriptor(fs.readFileSync(packageFile)),
        fixture.inputs.sourceFiles[0].output,
      )
    } finally {
      fs.rmSync(packageCopy, { recursive: true, force: true })
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('replay fails closed on drift, missing anchors, and symlinks', () => {
  assert.throws(
    () => applyTarget121InkFrameTimingLiveCountsSourceRecovery(),
    /sourceRoot is required/,
  )
  assert.throws(
    () => buildTarget121InkFrameTimingLiveCountsOutput('export type Other = {}'),
    /helper insertion expected one anchor, got 0/,
  )
  const { temporary, sourceRoot, filename } = materializeRawSource()
  try {
    fs.appendFileSync(filename, '\n// drift\n')
    const drift = fs.readFileSync(filename)
    assert.throws(
      () =>
        applyTarget121InkFrameTimingLiveCountsSourceRecovery({ sourceRoot }),
      /requires exact raw or recovered/,
    )
    assert.deepEqual(fs.readFileSync(filename), drift)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }

  const materialized = materializeRawSource()
  try {
    const real = `${materialized.filename}.real`
    fs.renameSync(materialized.filename, real)
    fs.symlinkSync(real, materialized.filename)
    assert.throws(
      () =>
        applyTarget121InkFrameTimingLiveCountsSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }),
      /expected a real source file/,
    )
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }
})
