import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import {
  applyTarget118StandaloneInProcessSourceRecovery,
  buildTarget118StandaloneAutofixOutput,
  buildTarget118StandaloneInProcessRunnerOutput,
  TARGET118_STANDALONE_IN_PROCESS_INPUT_FILES,
  TARGET118_STANDALONE_IN_PROCESS_OUTPUT_FILES,
  TARGET118_STANDALONE_IN_PROCESS_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-standalone-in-process-runner-source-gap.mjs'

const root = process.cwd()
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'recovery/test/recovery-2.1.118-standalone-in-process-runner-source-gap.json',
    ),
    'utf8',
  ),
)
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const sourceRoot =
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
  path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({ bytes: value.length, sha256: sha256(value) })

function walk(node, predicate, values = []) {
  if (!node || typeof node !== 'object') return values
  if (predicate(node)) values.push(node)
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const child of value) walk(child, predicate, values)
    } else {
      walk(value, predicate, values)
    }
  }
  return values
}

function propertyName(property) {
  return property.key?.name ?? property.key?.value
}

function gitSource(input) {
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.rawSource.commit}:${input.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return result.stdout
}

function readCoverage() {
  return JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
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

function copySourceFiles(directory, files) {
  for (const file of files) {
    const filename = path.join(directory, file.path.replace(/^src\//, ''))
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, gitSource(file))
  }
}

test('Target118 standalone-runner fixture, helper, and overrides are deterministic', () => {
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.case, '2.1.117-to-2.1.118')
  const helper = fs.readFileSync(path.join(root, fixture.inputs.helper.path))
  assert.deepEqual(descriptor(helper), {
    bytes: fixture.inputs.helper.bytes,
    sha256: fixture.inputs.helper.sha256,
  })
  assert.deepEqual(
    TARGET118_STANDALONE_IN_PROCESS_INPUT_FILES,
    fixture.inputs.rawSource.files.map(file => ({
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256,
    })),
  )
  assert.deepEqual(
    TARGET118_STANDALONE_IN_PROCESS_OUTPUT_FILES,
    fixture.inputs.recoveredSource.files,
  )
  assert.deepEqual(
    TARGET118_STANDALONE_IN_PROCESS_OWNER_OVERRIDES.map(row => ({
      targetIndex: row.targetIndex,
      paths: [...row.paths],
      evidenceIds: [...row.evidenceIds],
      behavior: row.behavior,
    })),
    fixture.targetUnits.map(unit => ({
      targetIndex: unit.index,
      paths: [unit.ownerPath],
      evidenceIds: fixture.evidenceIds,
      behavior: unit.behavior,
    })),
  )
  const indices = fixture.targetUnits.map(unit => unit.index)
  const residues = fixture.targetUnits.flatMap(unit =>
    unit.residues.map(residue => [unit.index, ...residue]),
  )
  assert.equal(sha256(JSON.stringify(indices)), fixture.summary.indicesSha256)
  assert.equal(
    sha256(JSON.stringify(residues)),
    fixture.summary.residueIdentitiesSha256,
  )
  assert.deepEqual(
    { units: indices.length, residues: residues.length },
    { units: fixture.summary.units, residues: fixture.summary.residues },
  )
})

test('authenticated Target118 units pin standalone caller, runner, and poller bindings', () => {
  if (!fs.existsSync(targetBundlePath)) {
    return test.skip('authenticated Target118 bundle is unavailable')
  }
  const target = fs.readFileSync(targetBundlePath)
  assert.deepEqual(descriptor(target), {
    bytes: fixture.inputs.targetBundle.bytes,
    sha256: fixture.inputs.targetBundle.sha256,
  })
  const structural = fs.readFileSync(
    path.join(root, fixture.inputs.targetStructuralLedger.path),
  )
  assert.deepEqual(descriptor(structural), {
    bytes: fixture.inputs.targetStructuralLedger.bytes,
    sha256: fixture.inputs.targetStructuralLedger.sha256,
  })

  const parseUnit = unit => {
    const bytes = target.subarray(unit.start, unit.end)
    assert.deepEqual(descriptor(bytes), {
      bytes: unit.bytes,
      sha256: unit.sourceHash,
    })
    return parse(bytes.toString(), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    }).body[0]
  }
  const runnerUnit = fixture.targetUnits.find(unit => unit.index === 13777)
  const autofixUnit = fixture.targetUnits.find(unit => unit.index === 15195)
  const runner = parseUnit(runnerUnit)
  const poller = parseUnit(fixture.supportingTargetUnit)
  const autofix = parseUnit(autofixUnit)
  for (const unit of fixture.targetUnits) {
    for (const residue of unit.residues) {
      const raw = target.subarray(residue[2], residue[3]).toString()
      if (raw !== residue[1]) assert.equal(JSON.parse(raw), residue[1])
    }
  }

  assert.equal(runner.type, 'FunctionDeclaration')
  assert.equal(runner.params.length, 1)
  assert.equal(runner.params[0].type, 'Identifier')
  const parameterDestructurings = walk(
    runner,
    node =>
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'ObjectPattern' &&
      node.init?.type === 'Identifier' &&
      node.init.name === runner.params[0].name,
  )
  assert.equal(parameterDestructurings.length, 1)
  const standaloneParameter = parameterDestructurings[0].id.properties.find(
    property => propertyName(property) === fixture.runtimeContract.field,
  )
  assert(standaloneParameter)
  assert.equal(standaloneParameter.value.type, 'AssignmentPattern')
  assert.equal(standaloneParameter.value.right.type, 'UnaryExpression')
  assert.equal(standaloneParameter.value.right.operator, '!')
  assert.equal(standaloneParameter.value.right.argument.value, 1)
  const standaloneBinding = standaloneParameter.value.left.name
  assert.equal(
    walk(
      runner,
      node =>
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === poller.id.name &&
        node.arguments.at(-1)?.type === 'Identifier' &&
        node.arguments.at(-1).name === standaloneBinding,
    ).length,
    1,
  )
  assert(
    walk(
      runner,
      node =>
        node.type === 'IfStatement' &&
        walk(
          node.test,
          child => child.type === 'Identifier' && child.name === standaloneBinding,
        ).length > 0,
    ).length >= 3,
  )

  const pollerBinding = poller.params.at(-1).name
  assert.equal(
    walk(
      poller,
      node =>
        node.type === 'IfStatement' &&
        walk(
          node.test,
          child =>
            child.type === 'MemberExpression' &&
            child.property?.name === fixture.runtimeContract.standaloneShutdownState.split('.')[1],
        ).length === 1 &&
        walk(
          node.test,
          child => child.type === 'Identifier' && child.name === pollerBinding,
        ).length >= 1,
    ).length,
    1,
  )
  assert.equal(
    walk(
      poller,
      node =>
        node.type === 'IfStatement' &&
        node.test.type === 'Identifier' &&
        node.test.name === pollerBinding &&
        node.consequent.type === 'ContinueStatement',
    ).length,
    1,
  )

  const autofixProperties = walk(
    autofix,
    node =>
      node.type === 'Property' &&
      propertyName(node) === fixture.runtimeContract.field,
  )
  assert.equal(autofixProperties.length, 1)
  assert.equal(autofixProperties[0].value.type, 'UnaryExpression')
  assert.equal(autofixProperties[0].value.operator, '!')
  assert.equal(autofixProperties[0].value.argument.value, 0)
})

test('bounded standalone source helper is exact and idempotent', () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-standalone-runner.'),
  )
  try {
    copySourceFiles(temporaryRoot, fixture.inputs.rawSource.files)
    const first = applyTarget118StandaloneInProcessSourceRecovery({
      sourceRoot: temporaryRoot,
    })
    assert.deepEqual(
      first.map(result => result.status),
      ['recovered', 'recovered'],
    )
    const second = applyTarget118StandaloneInProcessSourceRecovery({
      sourceRoot: temporaryRoot,
    })
    assert.deepEqual(
      second.map(result => result.status),
      ['already-recovered', 'already-recovered'],
    )
    for (const output of fixture.inputs.recoveredSource.files) {
      const bytes = fs.readFileSync(
        path.join(temporaryRoot, output.path.replace(/^src\//, '')),
      )
      assert.deepEqual(descriptor(bytes), {
        bytes: output.bytes,
        sha256: output.sha256,
      })
    }
    const rawRunner = gitSource(fixture.inputs.rawSource.files[0]).toString('utf8')
    const rawAutofix = gitSource(fixture.inputs.rawSource.files[1]).toString('utf8')
    assert.deepEqual(descriptor(Buffer.from(buildTarget118StandaloneInProcessRunnerOutput(rawRunner))), {
      bytes: fixture.inputs.recoveredSource.files[0].bytes,
      sha256: fixture.inputs.recoveredSource.files[0].sha256,
    })
    assert.deepEqual(descriptor(Buffer.from(buildTarget118StandaloneAutofixOutput(rawAutofix))), {
      bytes: fixture.inputs.recoveredSource.files[1].bytes,
      sha256: fixture.inputs.recoveredSource.files[1].sha256,
    })
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('recovered standalone source AST proves the complete runtime contract', async () => {
  const states = []
  for (let index = 0; index < fixture.inputs.rawSource.files.length; index += 1) {
    const raw = fixture.inputs.rawSource.files[index]
    const recovered = fixture.inputs.recoveredSource.files[index]
    const actual = descriptor(
      fs.readFileSync(path.join(sourceRoot, raw.path.replace(/^src\//, ''))),
    )
    if (actual.bytes === raw.bytes && actual.sha256 === raw.sha256) states.push('raw')
    else if (
      actual.bytes === recovered.bytes &&
      actual.sha256 === recovered.sha256
    ) {
      states.push('recovered')
    } else {
      assert.fail(
        `${raw.path} is neither raw nor recovered: ${actual.bytes}/${actual.sha256}`,
      )
    }
  }
  assert.equal(new Set(states).size, 1, 'standalone replay source state is atomic')

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'target118-standalone-source-ast.'),
  )
  try {
    for (const file of fixture.inputs.rawSource.files) {
      const filename = path.join(temporaryRoot, file.path.replace(/^src\//, ''))
      fs.mkdirSync(path.dirname(filename), { recursive: true })
      fs.copyFileSync(
        path.join(sourceRoot, file.path.replace(/^src\//, '')),
        filename,
      )
    }
    applyTarget118StandaloneInProcessSourceRecovery({ sourceRoot: temporaryRoot })

    const ts = await loadTypeScript()
    const sourceFiles = new Map()
    for (const output of fixture.inputs.recoveredSource.files) {
      const filename = path.join(
        temporaryRoot,
        output.path.replace(/^src\//, ''),
      )
      const bytes = fs.readFileSync(filename)
      assert.deepEqual(descriptor(bytes), {
        bytes: output.bytes,
        sha256: output.sha256,
      })
      const sourceFile = ts.createSourceFile(
        filename,
        bytes.toString('utf8'),
        ts.ScriptTarget.Latest,
        true,
        filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      )
      assert.equal(sourceFile.parseDiagnostics.length, 0)
      sourceFiles.set(output.path, sourceFile)
    }
    const findDeclaration = (name, expected) => {
      const sourceFile = sourceFiles.get(expected.path)
      const matches = []
      const visit = node => {
        if (
          (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
          node.name?.text === name
        ) {
          matches.push(node)
        }
        ts.forEachChild(node, visit)
      }
      visit(sourceFile)
      assert.equal(matches.length, 1, name)
      const node = matches[0]
      const text = node.getText(sourceFile)
      assert.equal(node.getStart(sourceFile), expected.start, `${name}:start`)
      assert.equal(node.end, expected.end, `${name}:end`)
      assert.deepEqual(descriptor(Buffer.from(text)), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      return { node, sourceFile }
    }
    const declarations = Object.fromEntries(
      Object.entries(fixture.sourceDeclarations.recovered).map(
        ([name, expected]) => [name, findDeclaration(name, expected)],
      ),
    )
    const nodes = ({ node }, predicate) => {
      const values = []
      const visit = child => {
        if (predicate(child)) values.push(child)
        ts.forEachChild(child, visit)
      }
      visit(node)
      return values
    }

    const config = declarations.InProcessRunnerConfig
    assert.equal(
      nodes(
        config,
        node =>
          ts.isPropertySignature(node) &&
          node.name.getText(config.sourceFile) === fixture.runtimeContract.field &&
          node.questionToken !== undefined &&
          node.type?.kind === ts.SyntaxKind.BooleanKeyword,
      ).length,
      1,
    )
    const runner = declarations.runInProcessTeammate
    assert.equal(
      nodes(
        runner,
        node =>
          ts.isBindingElement(node) &&
          node.name.getText(runner.sourceFile) === fixture.runtimeContract.field &&
          node.initializer?.kind === ts.SyntaxKind.FalseKeyword,
      ).length,
      1,
    )
    const runnerText = runner.node.getText(runner.sourceFile)
    for (const fragment of [
      'if (!standalone) {\n    await tryClaimNextTask',
      'if (!wasAlreadyIdle && !standalone)',
      'identity.parentSessionId,\n        standalone,',
      'if (!standalone) {\n      await sendIdleNotification(',
    ]) {
      assert(runnerText.includes(fragment), fragment)
    }

    const poller = declarations.waitForNextPromptOrShutdown
    assert.equal(
      poller.node.parameters.at(-1).name.getText(poller.sourceFile),
      fixture.runtimeContract.field,
    )
    const pollerText = poller.node.getText(poller.sourceFile)
    assert(pollerText.includes('task.shutdownRequested &&\n      standalone'))
    assert(pollerText.includes('if (standalone) continue'))

    const autofix = declarations.spawnLocalAutofixAgent
    const standaloneProperties = nodes(
      autofix,
      node =>
        ts.isPropertyAssignment(node) &&
        node.name.getText(autofix.sourceFile) === fixture.runtimeContract.field &&
        node.initializer.kind === ts.SyntaxKind.TrueKeyword,
    )
    assert.equal(standaloneProperties.length, 1)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('Target118 standalone coverage is exactly provisional or corrected', () => {
  const coverage = readCoverage()
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const states = new Set()
  for (const unit of fixture.targetUnits) {
    const row = rows.get(unit.index)
    assert(row, `u${unit.index}: coverage row`)
    assert.deepEqual(
      {
        start: row.start,
        end: row.end,
        nodeType: row.nodeType,
        sourceHash: row.sourceHash,
        structuralClass: row.structuralClass,
        disposition: row.disposition,
      },
      {
        start: unit.start,
        end: unit.end,
        nodeType: unit.nodeType,
        sourceHash: unit.sourceHash,
        structuralClass: 'unresolved',
        disposition: 'source-runtime-covered',
      },
    )
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const override = TARGET118_STANDALONE_IN_PROCESS_OWNER_OVERRIDES.find(
      candidate => candidate.targetIndex === unit.index,
    )
    const provisional =
      JSON.stringify(paths) === JSON.stringify([unit.provisionalOwnerPath]) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) === JSON.stringify([...override.paths]) &&
      JSON.stringify(row.evidenceIds) === JSON.stringify([...override.evidenceIds]) &&
      row.behavior === override.behavior
    assert.ok(provisional || corrected, `u${unit.index}: exact coverage state`)
    states.add(corrected ? 'corrected' : 'provisional')
  }
  assert.equal(states.size, 1, 'standalone coverage corrections are atomic')
})
