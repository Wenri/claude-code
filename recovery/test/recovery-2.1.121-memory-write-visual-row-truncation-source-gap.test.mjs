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
  applyTarget121MemoryWriteVisualRowsSourceRecovery,
  buildTarget121MemoryWriteVisualRowsOutput,
  TARGET121_MEMORY_WRITE_VISUAL_ROWS_INPUT_FILES,
  TARGET121_MEMORY_WRITE_VISUAL_ROWS_OUTPUT_FILES,
  TARGET121_MEMORY_WRITE_VISUAL_ROWS_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-memory-write-survey-visual-row-truncation-source-gap.mjs'

const root = process.cwd()
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.121-memory-write-visual-row-truncation-source-gap.json',
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
  const ast = parse(value.toString(), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  assert.equal(ast.body.length, 1)
  assert.equal(ast.body[0].type, unit.nodeType)
  return { text: value.toString(), node: ast.body[0] }
}

function sourceFile(ts, source) {
  const parsed = ts.createSourceFile(
    'src/memdir/memoryWriteSurvey.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function sourceDeclarations(ts, parsed) {
  const declarations = new Map()
  for (const statement of parsed.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      assert(!declarations.has(statement.name.text), statement.name.text)
      declarations.set(statement.name.text, statement)
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          assert(!declarations.has(declaration.name.text), declaration.name.text)
          declarations.set(declaration.name.text, statement)
        }
      }
    }
  }
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

function materializeRawSource() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target121-memory-write-visual-rows-'),
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
  return {
    temporary,
    sourceRoot,
    filename,
    source: result.stdout.toString(),
  }
}

const runtimeHelpers = {
  stringWidth(value) {
    const plain = value.replace(/\x1b\[[0-9;]*m/g, '')
    let width = 0
    for (const character of plain) {
      width += character.codePointAt(0) >= 0x2e80 ? 2 : 1
    }
    return width
  },
  wrapAnsi(value, width) {
    if (!(width > 0)) return value
    const rows = []
    let row = ''
    let rowWidth = 0
    for (const character of value) {
      const characterWidth = this.stringWidth(character)
      if (row && rowWidth + characterWidth > width) {
        rows.push(row)
        row = ''
        rowWidth = 0
      }
      row += character
      rowWidth += characterWidth
    }
    if (row || rows.length === 0) rows.push(row)
    return rows.join('\n')
  },
  sliceAnsi(value, start, end) {
    let width = 0
    let result = ''
    for (const character of value) {
      const characterWidth = this.stringWidth(character)
      if (width >= start && width < end) result += character
      width += characterWidth
      if (width >= end) break
    }
    return result
  },
}

function runtimeContext() {
  const helpers = {
    stringWidth: value => runtimeHelpers.stringWidth(value),
    wrapAnsi: (value, width) => runtimeHelpers.wrapAnsi(value, width),
    sliceAnsi: (value, start, end) =>
      runtimeHelpers.sliceAnsi(value, start, end),
  }
  return { helpers }
}

function sourceRuntime(ts, source, parsed) {
  const declarations = sourceDeclarations(ts, parsed)
  const names = [
    'DIFF_GUTTER_WIDTH',
    'countVisualRows',
    'getDiffContentWidth',
    'countHunkSeparators',
    'truncateMemoryWriteText',
    'truncateMemoryWriteHunks',
    'wrapLine',
  ]
  const definitions = names
    .map(name => {
      const node = declarations.get(name)
      assert(node, name)
      return source
        .slice(node.getStart(parsed), node.end)
        .replace(/^export /, '')
    })
    .join('\n')
  const program = `
const stringWidth = helpers.stringWidth;
const wrapAnsi = helpers.wrapAnsi;
const sliceAnsi = helpers.sliceAnsi;
${definitions}
globalThis.api = { truncateMemoryWriteText, truncateMemoryWriteHunks };
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
  const context = runtimeContext()
  vm.runInNewContext(transpiled.outputText, context)
  return context.api
}

function targetRuntime(targetBundle) {
  const units = new Map(
    [...fixture.supportingTargetUnits, ...fixture.targetUnits].map(unit => [
      unit.index,
      unit,
    ]),
  )
  const definitions = [8751, 8759, 8760, 8762, 8763, 8764]
    .map(index => {
      const unit = units.get(index)
      return targetBundle.subarray(unit.start, unit.end).toString()
    })
    .join('\n')
  const context = runtimeContext()
  vm.runInNewContext(
    `
const RCH = helpers.stringWidth;
const ai = helpers.wrapAnsi;
const KG = helpers.sliceAnsi;
const VNK = 6;
${definitions}
globalThis.api = { truncateMemoryWriteText: SNK, truncateMemoryWriteHunks: RNK };
`,
    context,
  )
  return context.api
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value))
}

test('Target121 memory-write fixture freezes two exact strict units', () => {
  assert.equal(sha256(fixtureBytes), 'bc35dea9fad25c10ac7e4790f74014701d3020d841bb39d3f61c6ff224011b0d')
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.120-to-2.1.121')
  assert.deepEqual(fixture.summary, {
    strictUnits: 2,
    supportingUnits: 4,
    ownerResidues: 28,
    targetAddedResidues: 8,
    strictIndicesSha256: sha256(JSON.stringify([8762, 8763])),
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
      [8762, 15, 5],
      [8763, 13, 3],
    ],
  )
  assert.deepEqual(
    TARGET121_MEMORY_WRITE_VISUAL_ROWS_INPUT_FILES,
    fixture.inputs.sourceFiles.map(row => ({ path: row.path, ...row.input })),
  )
  assert.deepEqual(
    TARGET121_MEMORY_WRITE_VISUAL_ROWS_OUTPUT_FILES,
    fixture.inputs.sourceFiles.map(row => ({ path: row.path, ...row.output })),
  )
  assert.deepEqual(
    TARGET121_MEMORY_WRITE_VISUAL_ROWS_OWNER_OVERRIDES.map(row => ({
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
  for (const row of fixture.strictRows) {
    assert.equal(row.ownerPath, 'src/memdir/memoryWriteSurvey.ts')
    assert.deepEqual(row.reportedOwnerPaths, [
      'utils/permissions/pathValidation.ts',
    ])
  }
  assert.deepEqual(
    fixture.deferredConsumerUnits.map(row => row.index),
    [21015, 21049, 21053],
  )
  const helper = fs.readFileSync(path.join(root, fixture.inputs.replayHelper.path))
  assert.deepEqual(
    descriptor(helper),
    artifactDescriptor(fixture.inputs.replayHelper),
  )
})

test('bundles prove baseline absence, strict units, dependencies, and consumers', () => {
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
      [
        row.nodeType,
        row.start,
        row.end,
        row.tokenCount,
        row.sourceHash,
        row.coarseHash,
      ],
      [
        unit.nodeType,
        unit.start,
        unit.end,
        unit.tokenCount,
        unit.sourceHash,
        unit.coarseHash,
      ],
    )
    parseUnit(baselineBundle, unit)
  }
  for (const unit of [...fixture.supportingTargetUnits, ...fixture.targetUnits]) {
    const region = ledger.regions.find(row => row.target?.index === unit.index)
    assert(region, `target u${unit.index}`)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [
        region.target.nodeType,
        region.target.start,
        region.target.end,
        region.target.tokenCount,
        region.target.sourceHash,
        region.target.coarseHash,
      ],
      [
        unit.nodeType,
        unit.start,
        unit.end,
        unit.tokenCount,
        unit.sourceHash,
        unit.coarseHash,
      ],
    )
    parseUnit(targetBundle, unit)
  }

  for (const fragment of fixture.targetFragments) {
    const value = targetBundle.subarray(fragment.start, fragment.end)
    assert.deepEqual(descriptor(value), artifactDescriptor(fragment))
    if (fragment.text) assert.equal(value.toString(), fragment.text)
  }
  assert.equal(countOccurrences(baselineBundle.toString(), 'hiddenRows'), 0)
  assert.equal(countOccurrences(targetBundle.toString(), 'hiddenRows'), 16)

  const strictAsts = fixture.targetUnits.map(unit =>
    parseUnit(targetBundle, unit),
  )
  const hiddenRowsCounts = strictAsts.map(({ node }) => {
    let count = 0
    walk(node, child => {
      if (
        child.type === 'Property' &&
        !child.computed &&
        child.key.name === 'hiddenRows'
      ) {
        count++
      }
    })
    return count
  })
  assert.deepEqual(hiddenRowsCounts, [5, 3])
  assert(strictAsts[0].text.includes('q<=0'))
  assert(strictAsts[0].text.includes('$<=0'))
  assert(strictAsts[1].text.includes('Y*K'))
})

test('raw source is the exact Git blob and omits rendered-row truncation', async () => {
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
      'hiddenRows',
      'truncateMemoryWriteText',
      'truncateMemoryWriteHunks',
      'countVisualRows',
      'DIFF_GUTTER_WIDTH',
    ]) {
      assert.equal(countOccurrences(source, omitted), 0, omitted)
    }
    assert.equal(countOccurrences(source, 'countMemoryWriteLines'), 1)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('recovered source has exact declarations and strict AST semantics', async () => {
  const { temporary, source } = materializeRawSource()
  try {
    const recovered = buildTarget121MemoryWriteVisualRowsOutput(source)
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
    assert.equal(
      declarations.get('DIFF_GUTTER_WIDTH').declarationList.declarations[0]
        .initializer.text,
      '6',
    )

    const textTruncator = declarations.get('truncateMemoryWriteText')
    const hunkTruncator = declarations.get('truncateMemoryWriteHunks')
    for (const [node, count] of [
      [textTruncator, 5],
      [hunkTruncator, 3],
    ]) {
      let hiddenRows = 0
      function visit(child) {
        if (
          ts.isPropertyAssignment(child) &&
          child.name.getText(parsed) === 'hiddenRows'
        ) {
          hiddenRows++
        }
        ts.forEachChild(child, visit)
      }
      visit(node)
      assert.equal(hiddenRows, count)
    }
    findOne(
      ts,
      textTruncator,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(parsed) === 'wrapLine',
      'text hard-wrap call',
    )
    const sliceCall = findOne(
      ts,
      hunkTruncator,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(parsed) === 'sliceAnsi',
      'partial hunk-line slice',
    )
    assert.deepEqual(
      sliceCall.arguments.map(argument => argument.getText(parsed)),
      ['line', '0', 'remaining * contentWidth'],
    )
    assert.equal(
      countOccurrences(
        declarations.get('countMemoryWriteLines').getText(parsed),
        'width',
      ),
      0,
      'later u21015 width-aware count cluster remains untouched',
    )
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('source truncators have runtime parity with authenticated target units', async () => {
  const { temporary, source } = materializeRawSource()
  try {
    const ts = await loadTypeScript()
    const recovered = buildTarget121MemoryWriteVisualRowsOutput(source)
    const sourceApi = sourceRuntime(ts, recovered, sourceFile(ts, recovered))
    const targetBundle = fs.readFileSync(
      path.join(root, fixture.inputs.targetBundle.path),
    )
    const targetApi = targetRuntime(targetBundle)
    const textCases = [
      ['', 4, 2],
      ['abcde\nx', 3, 0],
      ['a\nb\nc', 0, 2],
      ['ab\ncd', 4, 3],
      ['abcdef\nxy\n12345', 3, 4],
      ['界界界\nx', 4, 2],
    ]
    for (const args of textCases) {
      assert.deepEqual(
        normalize(sourceApi.truncateMemoryWriteText(...args)),
        normalize(targetApi.truncateMemoryWriteText(...args)),
        JSON.stringify(args),
      )
    }
    assert.deepEqual(
      normalize(sourceApi.truncateMemoryWriteText('abcdef\nxy\n12345', 3, 4)),
      { text: 'abc\ndef\nxy\n123', hiddenRows: 1 },
    )

    const hunks = [
      { oldStart: 1, newStart: 1, lines: ['+abcdef', '+x'] },
      { oldStart: 8, newStart: 8, lines: ['-123456'] },
    ]
    for (const maxRows of [0, 4, 5, 20]) {
      assert.deepEqual(
        normalize(sourceApi.truncateMemoryWriteHunks(hunks, 10, maxRows)),
        normalize(targetApi.truncateMemoryWriteHunks(hunks, 10, maxRows)),
        `hunks maxRows=${maxRows}`,
      )
    }
    assert.deepEqual(
      normalize(sourceApi.truncateMemoryWriteHunks(hunks, 10, 5)),
      {
        hunks: [
          hunks[0],
          { oldStart: 8, newStart: 8, lines: ['-123'] },
        ],
        hiddenRows: 1,
      },
    )
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('replay is exact on the fully replayed package and idempotent', () => {
  const { temporary, sourceRoot, filename } = materializeRawSource()
  try {
    assert.deepEqual(
      applyTarget121MemoryWriteVisualRowsSourceRecovery({ sourceRoot }),
      {
        status: 'recovered',
        files: ['src/memdir/memoryWriteSurvey.ts'],
      },
    )
    const once = fs.readFileSync(filename)
    assert.deepEqual(descriptor(once), fixture.inputs.sourceFiles[0].output)
    assert.deepEqual(
      applyTarget121MemoryWriteVisualRowsSourceRecovery({ sourceRoot }),
      { status: 'already-recovered', files: [] },
    )
    assert.deepEqual(fs.readFileSync(filename), once)

    const selectedRoot =
      process.env.CLAUDE_CODE_2_1_121_SOURCE_ROOT ??
      process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
      path.join(root, '.recovery-tmp/semantic-trees/2.1.121/src')
    const selected = path.join(selectedRoot, 'memdir/memoryWriteSurvey.ts')
    const selectedIdentity = descriptor(fs.readFileSync(selected))
    const selectedState =
      selectedIdentity.bytes === fixture.inputs.sourceFiles[0].input.bytes &&
      selectedIdentity.sha256 === fixture.inputs.sourceFiles[0].input.sha256
        ? 'raw'
        : 'recovered'
    if (selectedState === 'recovered') {
      assert.deepEqual(selectedIdentity, fixture.inputs.sourceFiles[0].output)
    }
    const packageCopy = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-memory-write-package-'),
    )
    try {
      const packageRoot = path.join(packageCopy, 'src')
      const packageFile = path.join(packageRoot, 'memdir/memoryWriteSurvey.ts')
      fs.mkdirSync(path.dirname(packageFile), { recursive: true })
      fs.copyFileSync(selected, packageFile)
      assert.deepEqual(
        applyTarget121MemoryWriteVisualRowsSourceRecovery({
          sourceRoot: packageRoot,
        }),
        selectedState === 'raw'
          ? {
              status: 'recovered',
              files: ['src/memdir/memoryWriteSurvey.ts'],
            }
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
    () => applyTarget121MemoryWriteVisualRowsSourceRecovery(),
    /sourceRoot is required/,
  )
  assert.throws(
    () => buildTarget121MemoryWriteVisualRowsOutput("import { z } from 'zod/v3'"),
    /visual-row imports expected one anchor, got 0/,
  )
  const materialized = materializeRawSource()
  try {
    fs.appendFileSync(materialized.filename, '\n// drift\n')
    const drift = fs.readFileSync(materialized.filename)
    assert.throws(
      () =>
        applyTarget121MemoryWriteVisualRowsSourceRecovery({
          sourceRoot: materialized.sourceRoot,
        }),
      /requires exact raw or recovered/,
    )
    assert.deepEqual(fs.readFileSync(materialized.filename), drift)
  } finally {
    fs.rmSync(materialized.temporary, { recursive: true, force: true })
  }

  const linked = materializeRawSource()
  try {
    const real = `${linked.filename}.real`
    fs.renameSync(linked.filename, real)
    fs.symlinkSync(real, linked.filename)
    assert.throws(
      () =>
        applyTarget121MemoryWriteVisualRowsSourceRecovery({
          sourceRoot: linked.sourceRoot,
        }),
      /expected a real source file/,
    )
  } finally {
    fs.rmSync(linked.temporary, { recursive: true, force: true })
  }
})
