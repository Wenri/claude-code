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
import * as replayModule from '../cases/2.1.120-to-2.1.121/recovered/replay-rename-generated-session-name-source-gap.mjs'
import {
  applyTarget121RenameGeneratedSourceRecovery,
  buildTarget121RenameGeneratedOutput,
  TARGET121_RENAME_GENERATED_EVIDENCE_IDS,
  TARGET121_RENAME_GENERATED_INPUT_FILES,
  TARGET121_RENAME_GENERATED_OUTPUT_FILES,
  TARGET121_RENAME_GENERATED_OWNER_OVERRIDES,
} from '../cases/2.1.120-to-2.1.121/recovered/replay-rename-generated-session-name-source-gap.mjs'

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
  'recovery/test/recovery-2.1.121-rename-generated-session-name-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '622d892118484b65b06663b8eacd8efc70d391c5bb0e22cbc1c50843804731fc'

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

function parseSource(ts, source, sourcePath = fixture.inputs.sourceFile.path) {
  const parsed = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(parsed.parseDiagnostics.length, 0)
  return parsed
}

function functionDeclaration(ts, parsed, name) {
  const matches = parsed.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0]
}

function sourceRegion(source, node, parsed) {
  return descriptor(
    Buffer.from(source.slice(node.getStart(parsed), node.end), 'utf8'),
  )
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

function canonicalize(node, parent = null, key = null) {
  if (Array.isArray(node)) {
    return node.map(child => canonicalize(child, parent, key))
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
  if (node.type === 'VariableDeclaration') {
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: canonicalize(node.declarations, node, 'declarations'),
    }
  }
  const result = {}
  for (const [childKey, child] of Object.entries(node)) {
    if (
      !['start', 'end', 'loc', 'range', 'raw', 'shorthand'].includes(childKey)
    ) {
      result[childKey] = canonicalize(child, node, childKey)
    }
  }
  return result
}

function canonicalDescriptor(node) {
  const value = JSON.stringify(canonicalize(node))
  return descriptor(Buffer.from(value))
}

function canonicalRows(rows) {
  const value = rows.map(JSON.stringify).join('\n')
  return { ...descriptor(Buffer.from(value)), tuples: rows }
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

function removeTargetDelta(performRename, call) {
  const normalizedPerform = structuredClone(performRename)
  const declaration = normalizedPerform.body.body[1]
  const generatedTest = declaration.declarations[0].init
  declaration.declarations[0].init = null
  declaration.declarations.splice(1, 1)
  normalizedPerform.body.body[2].test = generatedTest
  const returnExpressions =
    normalizedPerform.body.body[10].argument.expressions
  returnExpressions[0].argument.arguments.pop()
  returnExpressions[2].properties.pop()

  const normalizedCall = structuredClone(call)
  normalizedCall.body.body[0].declarations[0].id.properties.pop()
  const metaMessages = normalizedCall.body.body[1].argument.expressions[0]
    .arguments[1].properties.find(property => property.key.name === 'metaMessages')
    .value
  metaMessages.test = metaMessages.test.left
  return [normalizedPerform, normalizedCall]
}

// Bun's isolated transpiler retains import() and source-level getter spelling,
// while the authenticated bundle has bootstrap wrappers, a getter alias, and
// coalesced declarations/sequences. Normalize only those compiler forms.
function normalizeCompilerForms(node) {
  const normalized = structuredClone(node)
  function walk(value, parent = null, key = null) {
    if (!value || typeof value !== 'object') return
    if (
      value.type === 'MemberExpression' &&
      !value.computed &&
      value.property?.name === 'remote' &&
      value.object?.type === 'CallExpression'
    ) {
      if (parent) parent[key] = value.object
      value = value.object
    }
    if (
      value.type === 'CallExpression' &&
      value.callee?.type === 'MemberExpression' &&
      !value.callee.computed &&
      value.callee.property?.name === 'then' &&
      value.arguments?.[0]?.type === 'ArrowFunctionExpression'
    ) {
      const pattern = value.arguments[0].params?.[0]
      const properties =
        pattern?.type === 'ObjectPattern'
          ? pattern.properties.map(property => property.key?.name)
          : []
      if (
        properties.includes('updateBridgeSessionTitle') ||
        properties.includes('updateSessionTitle')
      ) {
        value.callee.object = { type: 'Identifier', name: 'DYNAMIC_IMPORT' }
      }
    }
    for (const [childKey, child] of Object.entries(value)) {
      if (!child || typeof child !== 'object') continue
      if (Array.isArray(child)) {
        child.forEach((entry, index) => walk(entry, child, index))
      } else {
        walk(child, value, childKey)
      }
    }
  }
  walk(normalized)

  const body = []
  for (const statement of normalized.body.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        body.push({
          type: 'VariableDeclaration',
          kind: 'var',
          declarations: [declaration],
        })
      }
    } else if (
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'SequenceExpression'
    ) {
      for (const expression of statement.expression.expressions) {
        body.push({ type: 'ExpressionStatement', expression })
      }
    } else if (
      statement.type === 'ReturnStatement' &&
      statement.argument?.type === 'SequenceExpression'
    ) {
      const expressions = statement.argument.expressions
      for (const expression of expressions.slice(0, -1)) {
        body.push({ type: 'ExpressionStatement', expression })
      }
      body.push({ type: 'ReturnStatement', argument: expressions.at(-1) })
    } else {
      body.push(statement)
    }
  }
  normalized.body.body = body
  return normalized
}

function compileWithFrozenBun(source) {
  const compiler = path.join(
    repositoryRoot,
    fixture.wholeUnitProof.compiler.path,
  )
  const program = [
    'const input = await Bun.stdin.text()',
    `const transpiler = new Bun.Transpiler(${JSON.stringify(
      fixture.wholeUnitProof.compiler.options,
    )})`,
    'process.stdout.write(await transpiler.transform(input))',
  ].join(';')
  const result = spawnSync(compiler, ['-e', program], {
    cwd: repositoryRoot,
    encoding: null,
    input: Buffer.from(source),
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  return result.stdout.toString()
}

function materializeRawSource() {
  const result = spawnSync(
    'git',
    [
      'show',
      `${fixture.sourceProvenance.commit}:${fixture.sourceProvenance.path}`,
    ],
    { cwd: gitEvidenceRepositoryRoot, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(
    descriptor(result.stdout),
    fixture.inputs.sourceFile.input,
  )
  return result.stdout.toString()
}

function proofSource(ts, recovered) {
  const parsed = parseSource(ts, recovered)
  return ['performRename', 'call']
    .map(name => functionDeclaration(ts, parsed, name).getText(parsed))
    .join('\n')
    .replaceAll('export async function', 'async function')
}

function runtimeContext({ generatedName, teammate = false, target = false }) {
  const log = []
  const generated = async () => generatedName
  const saveCustom = async (...args) => log.push(['custom', ...args])
  const saveAgent = async (...args) => log.push(['agent', ...args])
  const rename = async (...args) => log.push(['rename', ...args])
  const update = async (...args) => log.push(['update', ...args])
  const common = {
    console,
    Promise,
    setTimeout,
  }
  const bindings = target
    ? {
        OA: () => teammate,
        XcH: generated,
        DO: messages => messages,
        'y$': () => 'session-id',
        zz: () => '/tmp/transcript.jsonl',
        x0: saveCustom,
        Tc: () => undefined,
        yF: saveAgent,
        LY: () => undefined,
        N3H: rename,
        nV: update,
        yz8: name => `reminder:${name}`,
      }
    : {
        isTeammate: () => teammate,
        generateSessionName: generated,
        getMessagesAfterCompactBoundary: messages => messages,
        getSessionId: () => 'session-id',
        getTranscriptPath: () => '/tmp/transcript.jsonl',
        saveCustomTitle: saveCustom,
        getBridgeTokenOverride: () => undefined,
        saveAgentName: saveAgent,
        getRuntimeCapabilities: () => ({ remote: undefined }),
        renameJob: rename,
        updateSessionName: update,
        renameSystemReminder: name => `reminder:${name}`,
      }
  return { context: vm.createContext({ ...common, ...bindings }), log }
}

async function runRuntime(source, args, options) {
  const { context, log } = runtimeContext(options)
  new vm.Script(source).runInContext(context)
  const calls = []
  const commandContext = {
    messages: ['message'],
    abortController: { signal: {} },
    getAppState: () => ({ replBridgeSessionId: undefined }),
    setAppState: update => {
      const previous = { standaloneAgentContext: { stable: true } }
      log.push(['state', JSON.parse(JSON.stringify(update(previous)))])
    },
  }
  const callName = options.target ? '$H5' : 'call'
  const result = await context[callName](
    (...values) => calls.push(JSON.parse(JSON.stringify(values))),
    commandContext,
    args,
  )
  return { result, calls, log: JSON.parse(JSON.stringify(log)) }
}

test(
  'Target121 rename fixture and atomic two-unit replay are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      Object.keys(replayModule).sort(),
      [
        'TARGET121_RENAME_GENERATED_EVIDENCE_IDS',
        'TARGET121_RENAME_GENERATED_INPUT_FILES',
        'TARGET121_RENAME_GENERATED_OUTPUT_FILES',
        'TARGET121_RENAME_GENERATED_OWNER_OVERRIDES',
        'applyTarget121RenameGeneratedSourceRecovery',
        'buildTarget121RenameGeneratedOutput',
      ],
    )
    assert.deepEqual(
      TARGET121_RENAME_GENERATED_INPUT_FILES,
      [{ path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.input }],
    )
    assert.deepEqual(
      TARGET121_RENAME_GENERATED_OUTPUT_FILES,
      [{ path: fixture.inputs.sourceFile.path, ...fixture.inputs.sourceFile.output }],
    )
    assert.deepEqual(
      TARGET121_RENAME_GENERATED_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: override.paths,
        declarations: override.declarations,
        evidenceIds: override.evidenceIds,
      })),
      [
        {
          key: `${caseName}:17014`,
          targetIndex: 17014,
          paths: [fixture.inputs.sourceFile.path],
          declarations: ['performRename'],
          evidenceIds: TARGET121_RENAME_GENERATED_EVIDENCE_IDS,
        },
        {
          key: `${caseName}:17015`,
          targetIndex: 17015,
          paths: [fixture.inputs.sourceFile.path],
          declarations: ['call'],
          evidenceIds: TARGET121_RENAME_GENERATED_EVIDENCE_IDS,
        },
      ],
    )
    assert.equal(Object.isFrozen(TARGET121_RENAME_GENERATED_OWNER_OVERRIDES), true)
    assert.deepEqual(fixture.expectedStrictEvolution, {
      before: { units: 45, residues: 426 },
      after: { units: 43, residues: 424 },
      removedIndices: [17014, 17015],
      removedAddedOwnerRows: 2,
    })
  },
)

test(
  'authenticated bundle units form one exact producer-consumer delta',
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
        fs.readFileSync(
          path.join(
            repositoryRoot,
            'recovery/cases/2.1.120-to-2.1.121/structural/generated-delta.json.gz',
          ),
        ),
      ),
    )
    fixture.targetUnits.forEach(unit => {
      const ledgerUnit = ledger.regions[unit.index]
      assert.equal(ledgerUnit.classification, 'unresolved')
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
        assert.equal(ledgerUnit.target[key], unit[key])
      }
    })
    fixture.baselineUnits.forEach(unit => {
      const ledgerUnit = ledger.unmatchedBaseline.find(
        candidate => candidate.index === unit.index,
      )
      assert.ok(ledgerUnit)
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
        assert.equal(ledgerUnit[key], unit[key])
      }
    })

    const baselineParsed = fixture.baselineUnits.map(unit =>
      parseUnit(baseline, unit),
    )
    const targetParsed = fixture.targetUnits.map(unit => parseUnit(target, unit))
    for (const [side, parsed, bundle] of [
      ['baselinePerform', baselineParsed[0], baseline],
      ['baselineCall', baselineParsed[1], baseline],
      ['targetPerform', targetParsed[0], target],
      ['targetCall', targetParsed[1], target],
    ]) {
      for (const expected of fixture.bundleDelta[side]) {
        const statement = parsed.node.body.body[expected.statementIndex]
        assert.equal(statement.type, expected.nodeType)
        assert.equal(parsed.start + statement.start, expected.start)
        assert.equal(parsed.start + statement.end, expected.end)
        const value = bundle.subarray(expected.start, expected.end)
        assert.deepEqual(descriptor(value), expectedDescriptor(expected))
        assert.equal(value.toString(), expected.text)
      }
    }

    assert.deepEqual(
      baselineParsed.map(unit => canonicalDescriptor(unit.node)),
      fixture.bundleDelta.deltaNormalization.baseline,
    )
    assert.deepEqual(
      targetParsed.map(unit => canonicalDescriptor(unit.node)),
      fixture.bundleDelta.deltaNormalization.targetBefore,
    )
    const removed = removeTargetDelta(
      targetParsed[0].node,
      targetParsed[1].node,
    )
    assert.deepEqual(
      removed.map(canonicalDescriptor),
      fixture.bundleDelta.deltaNormalization.targetAfter,
    )
    assert.deepEqual(
      removed.map(canonicalDescriptor),
      baselineParsed.map(unit => canonicalDescriptor(unit.node)),
    )
  },
)

test(
  'typed report pins both isGenerated rows and complete owner residue sets',
  { skip: !selected },
  () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, fixture.inputs.typedReport.path),
        'utf8',
      ),
    )
    const indices = fixture.expectedStrictEvolution.removedIndices
    const observed = Object.fromEntries(
      indices.map(index => [
        index,
        {
          addedOwner: report.sourceRuntimeAddedOwnerResidueRows
            .filter(row => row.structural.index === index)
            .map(rowTuple),
          owner: report.sourceRuntimeOwnerResidueRows
            .filter(row => row.structural.index === index)
            .map(rowTuple),
        },
      ]),
    )
    const same = (left, right) =>
      JSON.stringify(left) === JSON.stringify(right)
    const provisional = indices.every(
      index =>
        same(observed[index].addedOwner, fixture.rows[index].addedOwner.tuples) &&
        same(observed[index].owner, fixture.rows[index].owner.tuples),
    )
    const correctedOwnerRows = index =>
      fixture.rows[index].owner.tuples.filter(row => {
        if (row[2] === 'isGenerated') return false
        return !(index === 17014 && row[1] === 'string' && row[2] === 'user')
      })
    const corrected = indices.every(
      index =>
        observed[index].addedOwner.length === 0 &&
        same(observed[index].owner, correctedOwnerRows(index)),
    )
    assert.equal(provisional || corrected, true)

    for (const index of indices) {
      const expected = fixture.rows[index]
      const strict = report.rows
        .filter(row => row.structural.index === index)
        .map(rowTuple)
      if (provisional) {
        const actual = canonicalRows(strict)
        assert.equal(actual.bytes, expected.strict.canonicalBytes)
        assert.equal(actual.sha256, expected.strict.canonicalSha256)
        assert.deepEqual(actual.tuples, expected.strict.tuples)
      } else {
        assert.deepEqual(strict, [])
      }
      const row = expected.strict.tuples[0]
      const value = fs
        .readFileSync(path.join(repositoryRoot, fixture.inputs.targetBundle.path))
        .subarray(row[3], row[4])
      assert.equal(value.toString(), 'isGenerated')
    }
    if (corrected) {
      const selectedDescriptor = descriptor(
        fs.readFileSync(selectedSourcePath(fixture.inputs.sourceFile.path)),
      )
      assert.equal(
        [fixture.inputs.sourceFile.input, fixture.inputs.sourceFile.output].some(
          expected => same(selectedDescriptor, expected),
        ),
        true,
      )
    }
  },
)

test(
  'raw Git source has one bounded gap and replay is parse-clean and fail-closed',
  { skip: !selected },
  async () => {
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
    const raw = materializeRawSource()
    const recovered = buildTarget121RenameGeneratedOutput(raw)
    assert.deepEqual(
      descriptor(Buffer.from(recovered)),
      fixture.inputs.sourceFile.output,
    )
    assert.equal(occurrenceCount(raw, 'isGenerated'), 0)
    assert.equal(occurrenceCount(recovered, 'isGenerated'), 6)
    assert.equal(occurrenceCount(raw, "renameJob(sessionId, newName, 'user')"), 0)
    assert.equal(
      occurrenceCount(recovered, "renameJob(sessionId, newName, 'user')"),
      1,
    )

    const ts = await loadTypeScript()
    for (const [source, expectedPerform, expectedCall] of [
      [raw, fixture.sourceRegions.rawPerformRename, fixture.sourceRegions.rawCall],
      [
        recovered,
        fixture.sourceRegions.recoveredPerformRename,
        fixture.sourceRegions.recoveredCall,
      ],
    ]) {
      const parsed = parseSource(ts, source)
      for (const [name, expected] of [
        ['performRename', expectedPerform],
        ['call', expectedCall],
      ]) {
        const declaration = functionDeclaration(ts, parsed, name)
        assert.equal(declaration.getStart(parsed), expected.charStart)
        assert.equal(declaration.end, expected.charEnd)
        assert.deepEqual(sourceRegion(source, declaration, parsed), expectedDescriptor(expected))
      }
    }
    for (const expected of fixture.sourceRegions.recoveredTransforms) {
      const value = recovered.slice(expected.charStart, expected.charEnd)
      assert.deepEqual(descriptor(Buffer.from(value)), expectedDescriptor(expected))
    }
    const rawParsed = parseSource(ts, raw)
    const renameImport = rawParsed.statements.find(
      statement =>
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.text === '../../daemon/jobs.js',
    )
    assert.ok(renameImport)
    assert.equal(
      renameImport.getStart(rawParsed),
      fixture.sourceRegions.renameJobImport.charStart,
    )
    assert.equal(renameImport.end, fixture.sourceRegions.renameJobImport.charEnd)
    assert.deepEqual(
      sourceRegion(raw, renameImport, rawParsed),
      expectedDescriptor(fixture.sourceRegions.renameJobImport),
    )

    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target121-rename-generated-'),
    )
    try {
      const sourceRoot = path.join(temporary, 'src')
      const filename = path.join(sourceRoot, 'commands/rename/rename.ts')
      fs.mkdirSync(path.dirname(filename), { recursive: true })
      fs.writeFileSync(filename, raw)
      assert.deepEqual(
        applyTarget121RenameGeneratedSourceRecovery({ sourceRoot }),
        { status: 'recovered', files: [fixture.inputs.sourceFile.path] },
      )
      assert.deepEqual(
        descriptor(fs.readFileSync(filename)),
        fixture.inputs.sourceFile.output,
      )
      assert.deepEqual(
        applyTarget121RenameGeneratedSourceRecovery({ sourceRoot }),
        { status: 'already-recovered', files: [] },
      )
      fs.appendFileSync(filename, '\n// mutation')
      assert.throws(
        () => applyTarget121RenameGeneratedSourceRecovery({ sourceRoot }),
        /requires exact raw or recovered/,
      )
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true })
    }
  },
)

test(
  'selected package has the exact renameJob dependency contract',
  { skip: !selected },
  async () => {
    const selectedRename = fs.readFileSync(
      selectedSourcePath(fixture.inputs.sourceFile.path),
    )
    const selectedDescriptor = descriptor(selectedRename)
    assert.ok(
      [fixture.inputs.sourceFile.input, fixture.inputs.sourceFile.output].some(
        expected =>
          expected.bytes === selectedDescriptor.bytes &&
          expected.sha256 === selectedDescriptor.sha256,
      ),
    )
    const jobs = readExact(
      selectedSourcePath(fixture.inputs.dependencyFile.path),
      fixture.inputs.dependencyFile,
    ).toString()
    const ts = await loadTypeScript()
    const parsed = parseSource(ts, jobs, fixture.inputs.dependencyFile.path)
    const declaration = functionDeclaration(ts, parsed, 'renameJob')
    assert.equal(declaration.getStart(parsed), fixture.dependency.renameJob.charStart)
    assert.equal(declaration.end, fixture.dependency.renameJob.charEnd)
    assert.deepEqual(
      sourceRegion(jobs, declaration, parsed),
      expectedDescriptor(fixture.dependency.renameJob),
    )
    assert.equal(declaration.parameters.length, 3)
    assert.equal(declaration.parameters[2].name.getText(parsed), 'source')
    assert.equal(declaration.parameters[2].initializer.getText(parsed), "'user'")
    assert.match(
      declaration.getText(parsed),
      /source === 'auto' && latest\.name/,
    )
  },
)

test(
  'recovered declarations compile to the exact complete Target121 unit ASTs',
  { skip: !selected },
  async () => {
    const compiler = path.join(
      repositoryRoot,
      fixture.wholeUnitProof.compiler.path,
    )
    const version = spawnSync(compiler, ['--version'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    assert.equal(version.status, 0, version.stderr)
    assert.equal(version.stdout.trim(), fixture.wholeUnitProof.compiler.version)

    const raw = materializeRawSource()
    const recovered = buildTarget121RenameGeneratedOutput(raw)
    const ts = await loadTypeScript()
    const source = proofSource(ts, recovered)
    assert.deepEqual(
      descriptor(Buffer.from(source)),
      fixture.wholeUnitProof.proofSource,
    )
    const compiled = compileWithFrozenBun(source)
    assert.deepEqual(
      descriptor(Buffer.from(compiled)),
      fixture.wholeUnitProof.compiled,
    )
    const compiledAst = parse(compiled, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    }).body
    assert.equal(compiledAst.length, 2)

    const target = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.targetBundle.path),
    )
    const targetAst = fixture.targetUnits.map(
      unit => parseUnit(target, unit).node,
    )
    const sourceCanonical = JSON.stringify(
      compiledAst.map(node => canonicalize(normalizeCompilerForms(node))),
    )
    const targetCanonical = JSON.stringify(
      targetAst.map(node => canonicalize(normalizeCompilerForms(node))),
    )
    assert.equal(sourceCanonical, targetCanonical)
    assert.deepEqual(
      descriptor(Buffer.from(sourceCanonical)),
      fixture.wholeUnitProof.normalizedCanonical,
    )
  },
)

test(
  'manual, generated, empty-context, and teammate rename paths have runtime parity',
  { skip: !selected },
  async () => {
    const raw = materializeRawSource()
    const recovered = buildTarget121RenameGeneratedOutput(raw)
    const ts = await loadTypeScript()
    const sourceRuntime = compileWithFrozenBun(proofSource(ts, recovered))
    const targetBundle = fs.readFileSync(
      path.join(repositoryRoot, fixture.inputs.targetBundle.path),
    )
    const targetRuntime = fixture.targetUnits
      .map(unit => targetBundle.subarray(unit.start, unit.end).toString())
      .join(';')

    for (const runtimeCase of [
      { args: '  explicit name  ', generatedName: 'unused', teammate: false },
      { args: '', generatedName: 'generated name', teammate: false },
      { args: '   ', generatedName: 'generated whitespace', teammate: false },
      { args: '', generatedName: null, teammate: false },
      { args: 'ignored', generatedName: 'unused', teammate: true },
    ]) {
      const sourceResult = await runRuntime(sourceRuntime, runtimeCase.args, {
        generatedName: runtimeCase.generatedName,
        teammate: runtimeCase.teammate,
        target: false,
      })
      const targetResult = await runRuntime(targetRuntime, runtimeCase.args, {
        generatedName: runtimeCase.generatedName,
        teammate: runtimeCase.teammate,
        target: true,
      })
      assert.deepEqual(targetResult, sourceResult, JSON.stringify(runtimeCase))
    }

    const manual = await runRuntime(sourceRuntime, 'manual', {
      generatedName: 'unused',
      target: false,
    })
    assert.deepEqual(manual.calls[0][1].metaMessages, ['reminder:manual'])
    assert.deepEqual(
      manual.log.find(entry => entry[0] === 'rename').slice(-1),
      ['user'],
    )
    const generated = await runRuntime(sourceRuntime, '', {
      generatedName: 'automatic',
      target: false,
    })
    assert.equal(generated.calls[0][1].metaMessages, undefined)
  },
)
