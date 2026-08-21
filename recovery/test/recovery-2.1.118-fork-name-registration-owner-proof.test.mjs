import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import { TARGET118_FORK_NAME_REGISTRATION_OWNER_OVERRIDES } from '../cases/2.1.117-to-2.1.118/recovered/fork-name-registration-owner-overrides.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-fork-name-registration-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '2aa0643338f61fd0467141678137db68a73a0fcbac769fe6ad8e447e510a054a'
const targetBundlePath =
  process.env.CLAUDE_CODE_2_1_118_BUNDLE ??
  path.join(
    root,
    '.recovery-tmp/authenticated-artifacts/2.1.118-linux-x64/cli.inner.js',
  )
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(root, '.recovery-tmp/semantic-trees/2.1.118/src'),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function walk(node, predicate, matches = []) {
  if (!node || typeof node !== 'object') return matches
  if (predicate(node)) matches.push(node)
  for (const [key, child] of Object.entries(node)) {
    if (['end', 'loc', 'range', 'raw', 'start'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const value of child) walk(value, predicate, matches)
    } else {
      walk(child, predicate, matches)
    }
  }
  return matches
}

function propertyName(node) {
  if (node?.computed) return node.property?.value
  return node?.property?.name ?? node?.key?.name ?? node?.key?.value
}

function gitSource() {
  const input = fixture.inputs.historicalSource
  const result = spawnSync(
    'git',
    ['show', `${input.commit}:${input.file.path}`],
    { cwd: root, encoding: null },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.file.bytes,
    sha256: input.file.sha256,
  })
  return result.stdout
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

function parseSource(ts, bytes) {
  const sourceFile = ts.createSourceFile(
    fixture.inputs.historicalSource.file.path,
    bytes.toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0)
  return sourceFile
}

function spawnForkDeclaration(ts, sourceFile) {
  const declarations = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'spawnFork',
  )
  assert.equal(declarations.length, 1)
  return declarations[0]
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

test(
  'Target118 fork-name fixture pins the exact source owner and override',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(
      descriptor(
        fs.readFileSync(path.join(root, fixture.inputs.overrideModule.path)),
      ),
      {
        bytes: fixture.inputs.overrideModule.bytes,
        sha256: fixture.inputs.overrideModule.sha256,
      },
    )
    assert.deepEqual(
      TARGET118_FORK_NAME_REGISTRATION_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: fixture.ownerOverride.paths,
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.ownerOverride.evidenceIds,
          behavior: fixture.ownerOverride.behavior,
        },
      ],
    )
    assert.equal(
      sha256(JSON.stringify([fixture.targetUnit.targetIndex])),
      fixture.summary.targetIndicesSha256,
    )
    assert.equal(
      sha256(
        JSON.stringify(
          fixture.targetUnit.residues.map(residue => [
            fixture.targetUnit.targetIndex,
            ...residue,
          ]),
        ),
      ),
      fixture.summary.residueIdentitiesSha256,
    )
    const source = fixture.inputs.historicalSource
    assert.equal(
      spawnSync('git', ['rev-parse', `${source.commit}^{tree}`], {
        cwd: root,
        encoding: 'utf8',
      }).stdout.trim(),
      source.tree,
    )
    assert.equal(
      spawnSync('git', ['rev-parse', `${source.commit}:${source.file.path}`], {
        cwd: root,
        encoding: 'utf8',
      }).stdout.trim(),
      source.file.blob,
    )
    gitSource()
  },
)

test(
  'authenticated Target118 fork and lifecycle units prove the extracted registerName call',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(targetBundlePath)
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const structuralBytes = fs.readFileSync(
      path.join(root, fixture.inputs.targetStructuralLedger.path),
    )
    assert.deepEqual(descriptor(structuralBytes), {
      bytes: fixture.inputs.targetStructuralLedger.bytes,
      sha256: fixture.inputs.targetStructuralLedger.sha256,
    })
    const structural = JSON.parse(gunzipSync(structuralBytes))
    for (const expected of [fixture.supportingTargetUnit, fixture.targetUnit]) {
      const region = structural.regions.find(
        item => item.target.index === expected.targetIndex,
      )
      assert.ok(region)
      assert.deepEqual(
        {
          classification: region.classification,
          start: region.target.start,
          end: region.target.end,
          bytes: region.target.end - region.target.start,
          tokenCount: region.target.tokenCount,
          nodeType: region.target.nodeType,
          sourceHash: region.target.sourceHash,
        },
        {
          classification: expected.classification,
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          tokenCount: expected.tokenCount,
          nodeType: expected.nodeType,
          sourceHash: expected.sourceHash,
        },
      )
      assert.equal(
        sha256(bundle.subarray(expected.start, expected.end)),
        expected.sourceHash,
      )
    }

    const lifecycleText = bundle.subarray(
      fixture.supportingTargetUnit.start,
      fixture.supportingTargetUnit.end,
    )
    const lifecycleAst = parse(lifecycleText.toString(), {
      ecmaVersion: 'latest',
    })
    assert.equal(lifecycleAst.body.length, 1)
    assert.equal(lifecycleAst.body[0].type, 'FunctionDeclaration')
    const registerMethods = walk(
      lifecycleAst,
      node =>
        (node.type === 'Property' || node.type === 'MethodDefinition') &&
        propertyName(node) === 'registerName',
    )
    assert.equal(registerMethods.length, 1)
    const lifecycleMembers = walk(
      registerMethods[0],
      node => node.type === 'MemberExpression',
    ).map(propertyName)
    assert.ok(lifecycleMembers.includes('agentNameRegistry'))
    assert.ok(lifecycleMembers.includes('get'))
    assert.ok(lifecycleMembers.includes('set'))

    const targetText = bundle.subarray(
      fixture.targetUnit.start,
      fixture.targetUnit.end,
    )
    const targetAst = parse(targetText.toString(), { ecmaVersion: 'latest' })
    assert.equal(targetAst.body.length, 1)
    assert.equal(targetAst.body[0].type, 'FunctionDeclaration')
    assert.equal(targetAst.body[0].async, true)
    const registrationCalls = walk(
      targetAst,
      node =>
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        propertyName(node.callee) === 'registerName',
    )
    assert.equal(registrationCalls.length, 1)
    assert.equal(registrationCalls[0].arguments.length, 2)
    const targetLiterals = new Set(
      walk(targetAst, node => node.type === 'Literal').map(node => node.value),
    )
    for (const literal of [
      'fork',
      'resume',
      'subagent',
      'spawn',
      'text',
    ]) {
      assert.ok(targetLiterals.has(literal), `Target118 fork literal ${literal}`)
    }
    const [residue] = fixture.targetUnit.residues
    assert.equal(
      bundle.subarray(residue[2], residue[3]).toString(),
      residue[1],
    )
  },
)

test(
  'historical Target118 spawnFork owns the complete inline registry transition',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const historical = gitSource()
    const configured = fs.readFileSync(
      path.join(
        sourceRoot,
        fixture.inputs.historicalSource.file.path.slice('src/'.length),
      ),
    )
    assert.deepEqual(configured, historical)
    const sourceFile = parseSource(ts, historical)
    const declaration = spawnForkDeclaration(ts, sourceFile)
    const start = declaration.getStart(sourceFile)
    const end = declaration.end
    assert.deepEqual(
      {
        name: declaration.name.text,
        start,
        end,
        ...descriptor(historical.subarray(start, end)),
      },
      fixture.inputs.historicalSource.declaration,
    )
    const registry = fixture.inputs.historicalSource.registryBlock
    assert.deepEqual(
      descriptor(historical.subarray(registry.start, registry.end)),
      { bytes: registry.bytes, sha256: registry.sha256 },
    )

    const rootSetCalls = []
    const visit = node => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(sourceFile) === 'rootSetAppState'
      ) {
        rootSetCalls.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(declaration)
    assert.equal(rootSetCalls.length, 1)
    const callback = rootSetCalls[0].arguments[0]
    assert.ok(ts.isArrowFunction(callback))
    const callbackText = callback.getText(sourceFile)
    for (const marker of [
      'new Map(previous.agentNameRegistry)',
      'agentNameRegistry.set(name, asAgentId(agentId))',
      'return { ...previous, agentNameRegistry }',
    ]) {
      assert.ok(callbackText.includes(marker), `inline registry marker ${marker}`)
    }
    const declarationText = declaration.getText(sourceFile)
    for (const marker of fixture.sourceProof.sharedBehaviorMarkers) {
      assert.ok(declarationText.includes(marker), `spawnFork marker ${marker}`)
    }
    assert.equal(declarationText.includes('remote-setup'), false)
  },
)

test(
  'inline and extracted name registration are state-equivalent and coverage is atomic',
  { skip: !selected },
  () => {
    const inlineTransition = (previous, name, agentId) => {
      const agentNameRegistry = new Map(previous.agentNameRegistry)
      agentNameRegistry.set(name, agentId)
      return { ...previous, agentNameRegistry }
    }
    const extractedTransition = (previous, name, agentId) => {
      if (previous.agentNameRegistry.get(name) === agentId) return previous
      const agentNameRegistry = new Map(previous.agentNameRegistry)
      agentNameRegistry.set(name, agentId)
      return { ...previous, agentNameRegistry }
    }
    for (const scenario of [
      { entries: [], name: 'fork-one', agentId: 'agent-1' },
      {
        entries: [['other', 'agent-0']],
        name: 'fork-one',
        agentId: 'agent-1',
      },
      {
        entries: [['fork-one', 'agent-old']],
        name: 'fork-one',
        agentId: 'agent-1',
      },
      {
        entries: [['fork-one', 'agent-1']],
        name: 'fork-one',
        agentId: 'agent-1',
      },
    ]) {
      const previous = {
        untouched: { pinned: true },
        agentNameRegistry: new Map(scenario.entries),
      }
      const inline = inlineTransition(previous, scenario.name, scenario.agentId)
      const extracted = extractedTransition(
        previous,
        scenario.name,
        scenario.agentId,
      )
      assert.deepEqual([...inline.agentNameRegistry], [
        ...extracted.agentNameRegistry,
      ])
      assert.equal(inline.untouched, previous.untouched)
      assert.equal(extracted.untouched, previous.untouched)
    }

    const coverage = readCoverage()
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const row = coverage.rows.find(
      item => item.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const provisional =
      JSON.stringify(paths) ===
        JSON.stringify([fixture.targetUnit.provisionalOwnerPath]) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      JSON.stringify(paths) === JSON.stringify(fixture.ownerOverride.paths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(fixture.ownerOverride.evidenceIds) &&
      row.behavior === fixture.ownerOverride.behavior
    assert.ok(provisional || corrected)
  },
)
