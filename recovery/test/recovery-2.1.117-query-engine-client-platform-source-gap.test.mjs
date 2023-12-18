import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget117HistoricalOwnerSourceGapRecovery,
  TARGET117_HISTORICAL_GAP_INPUT_FILES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-historical-owner-source-gaps.mjs'
import {
  applyTarget117QueryEngineClientPlatformSourceRecovery,
  TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_OWNER_OVERRIDES,
  TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_QUERY_TRANSITIONS,
  TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-query-engine-client-platform-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const packageSourceRoot = process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-query-engine-client-platform-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'eaa7a756530911776623d8988c5b77389a9d68e8976667613b79588677963550'
const artifactRoot = path.join(repositoryRoot, '.recovery-tmp/authenticated-artifacts')
const temporaryRoots = []

test.after(() => {
  for (const temporaryRoot of temporaryRoots) {
    fs.rmSync(temporaryRoot, { force: true, recursive: true })
  }
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function tupleDescriptor(tuple) {
  return { bytes: tuple[0], sha256: tuple[1] }
}

function fileTupleDescriptor(tuple) {
  return { bytes: tuple[1], sha256: tuple[2] }
}

function rangeTupleDescriptor(tuple) {
  return { bytes: tuple[2], sha256: tuple[3] }
}

function readExact(filename, expected) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, filename)
  return bytes
}

function sourceFilename(sourceRoot, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function makeTemporarySource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  temporaryRoots.push(temporaryRoot)
  const sourceRoot = path.join(temporaryRoot, 'src')
  fs.mkdirSync(sourceRoot, { recursive: true })
  return { temporaryRoot, sourceRoot }
}

function writeGitSource(sourceRoot, commit, sourcePath) {
  const filename = sourceFilename(sourceRoot, sourcePath)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(
    filename,
    execFileSync('git', ['show', `${commit}:${sourcePath}`], {
      cwd: repositoryRoot,
    }),
  )
}

function materializeRawPair(prefix) {
  const output = makeTemporarySource(prefix)
  for (const input of fixture.inputs.rawSource.files) {
    writeGitSource(output.sourceRoot, fixture.inputs.rawSource.commit, input.path)
  }
  return output
}

function materializeHistoricalInputs(prefix) {
  const output = makeTemporarySource(prefix)
  for (const input of TARGET117_HISTORICAL_GAP_INPUT_FILES) {
    writeGitSource(output.sourceRoot, fixture.inputs.rawSource.commit, input.path)
  }
  writeGitSource(output.sourceRoot, fixture.inputs.rawSource.commit, 'src/Tool.ts')
  return output
}

function copyPair(inputRoot, prefix) {
  const output = makeTemporarySource(prefix)
  for (const sourcePath of ['src/QueryEngine.ts', 'src/Tool.ts']) {
    const filename = sourceFilename(output.sourceRoot, sourcePath)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.copyFileSync(sourceFilename(inputRoot, sourcePath), filename)
  }
  return output
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

function parseTypeScript(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function exactSourceRange(source, tuple) {
  assert.deepEqual(
    descriptor(Buffer.from(source.slice(tuple[0], tuple[1]))),
    rangeTupleDescriptor(tuple),
  )
}

function exactNamedDeclaration(ts, sourceFile, source, kind, name, tuple) {
  const declarations = descendants(ts, sourceFile, node => {
    if (kind === 'class') return ts.isClassDeclaration(node) && node.name?.text === name
    if (kind === 'type') return ts.isTypeAliasDeclaration(node) && node.name.text === name
    if (kind === 'method') {
      return ts.isMethodDeclaration(node) && node.name?.getText(sourceFile) === name
    }
    return false
  })
  assert.equal(declarations.length, 1, `${kind} ${name}`)
  const declaration = declarations[0]
  assert.deepEqual([declaration.getStart(sourceFile), declaration.end], tuple.slice(0, 2))
  exactSourceRange(source, tuple)
  return declaration
}

function propertyName(ts, property, sourceFile) {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text
  }
  return property.name.getText(sourceFile)
}

function assertRecoveredTypeContract(sourceRoot, expectedQuery, requireAskRoute) {
  return loadTypeScript().then(ts => {
    const queryFilename = sourceFilename(sourceRoot, 'src/QueryEngine.ts')
    const toolFilename = sourceFilename(sourceRoot, 'src/Tool.ts')
    const queryBytes = readExact(queryFilename, tupleDescriptor(expectedQuery))
    const toolBytes = readExact(toolFilename, tupleDescriptor(fixture.replay.toolOutput))
    const querySource = queryBytes.toString('utf8')
    const toolSource = toolBytes.toString('utf8')
    const queryFile = parseTypeScript(ts, queryFilename, querySource)
    const toolFile = parseTypeScript(ts, toolFilename, toolSource)

    const queryClass = exactNamedDeclaration(
      ts,
      queryFile,
      querySource,
      'class',
      'QueryEngine',
      fixture.replay.postimageDeclarations.QueryEngine,
    )
    const submitMessage = exactNamedDeclaration(
      ts,
      queryFile,
      querySource,
      'method',
      'submitMessage',
      fixture.replay.postimageDeclarations.submitMessage,
    )
    assert.equal(submitMessage.parameters.length, 2)
    const optionsType = submitMessage.parameters[1].type
    assert.ok(optionsType && ts.isTypeLiteralNode(optionsType))
    const clientPlatformOptions = optionsType.members.filter(
      member =>
        ts.isPropertySignature(member) &&
        propertyName(ts, member, queryFile) === 'clientPlatform',
    )
    assert.equal(clientPlatformOptions.length, 1)
    assert.deepEqual(
      [clientPlatformOptions[0].getStart(queryFile), clientPlatformOptions[0].end],
      fixture.replay.postimageDeclarations.submitOptionsMember.slice(0, 2),
    )
    exactSourceRange(
      querySource,
      fixture.replay.postimageDeclarations.submitOptionsMember,
    )
    assert.equal(clientPlatformOptions[0].questionToken?.kind, ts.SyntaxKind.QuestionToken)
    assert.equal(clientPlatformOptions[0].type?.kind, ts.SyntaxKind.StringKeyword)

    const runtimeProperties = descendants(
      ts,
      queryClass,
      node =>
        ts.isPropertyAssignment(node) &&
        propertyName(ts, node, queryFile) === 'messageClientPlatform',
    )
    assert.equal(runtimeProperties.length, 2)
    for (const [index, property] of runtimeProperties.entries()) {
      const tuple =
        fixture.replay.postimageDeclarations.messageClientPlatformProperties[index]
      assert.deepEqual([property.getStart(queryFile), property.end], tuple.slice(0, 2))
      exactSourceRange(querySource, tuple)
      assert.ok(ts.isPropertyAccessExpression(property.initializer))
      assert.equal(property.initializer.expression.getText(queryFile), 'options')
      assert.equal(property.initializer.name.text, 'clientPlatform')
      assert.ok(property.initializer.questionDotToken)
    }

    const toolContext = exactNamedDeclaration(
      ts,
      toolFile,
      toolSource,
      'type',
      'ToolUseContext',
      fixture.replay.postimageDeclarations.ToolUseContext,
    )
    const toolMembers = descendants(
      ts,
      toolContext,
      node =>
        ts.isPropertySignature(node) &&
        propertyName(ts, node, toolFile) === 'messageClientPlatform',
    )
    assert.equal(toolMembers.length, 1)
    const toolTuple = fixture.replay.postimageDeclarations.toolOptionsMember
    assert.deepEqual([toolMembers[0].getStart(toolFile), toolMembers[0].end], toolTuple.slice(0, 2))
    exactSourceRange(toolSource, toolTuple)
    assert.ok(toolMembers[0].questionToken)
    assert.equal(toolMembers[0].type?.kind, ts.SyntaxKind.StringKeyword)

    const importedProcessContext = descendants(
      ts,
      queryFile,
      node =>
        ts.isImportSpecifier(node) &&
        node.name.text === 'ProcessUserInputContext',
    )
    assert.equal(importedProcessContext.length, 1)

    const askFunctions = descendants(
      ts,
      queryFile,
      node => ts.isFunctionDeclaration(node) && node.name?.text === 'ask',
    )
    assert.equal(askFunctions.length, 1)
    const askClientBindings = descendants(
      ts,
      askFunctions[0],
      node => ts.isBindingElement(node) && node.name.getText(queryFile) === 'clientPlatform',
    )
    const askTypeMembers = descendants(
      ts,
      askFunctions[0].parameters[0].type,
      node =>
        ts.isPropertySignature(node) &&
        propertyName(ts, node, queryFile) === 'clientPlatform',
    )
    const submitCalls = descendants(
      ts,
      askFunctions[0],
      node =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(queryFile) === 'engine' &&
        node.expression.name.text === 'submitMessage',
    )
    assert.equal(submitCalls.length, 1)
    const callOptions = submitCalls[0].arguments[1]
    assert.ok(callOptions && ts.isObjectLiteralExpression(callOptions))
    const callClientProperties = callOptions.properties.filter(
      property => propertyName(ts, property, queryFile) === 'clientPlatform',
    )
    if (requireAskRoute) {
      assert.equal(askClientBindings.length, 1)
      assert.equal(askTypeMembers.length, 1)
      assert.equal(callClientProperties.length, 1)
      assert.ok(ts.isShorthandPropertyAssignment(callClientProperties[0]))
    } else {
      assert.equal(askClientBindings.length, 0)
      assert.equal(askTypeMembers.length, 0)
      assert.equal(callClientProperties.length, 0)
    }
  })
}

function canonicalizeRuntimeAst(value, parent = null, parentKey = null) {
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeRuntimeAst(item, parent, parentKey))
  }
  if (!value || typeof value !== 'object') return value
  const output = {}
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'range', 'raw'].includes(key)) continue
    if (value.type === 'Identifier' && key === 'name') {
      const keepRuntimeName =
        (parent?.type === 'MemberExpression' &&
          parentKey === 'property' &&
          !parent.computed) ||
        (parent?.type === 'Property' && parentKey === 'key' && !parent.computed) ||
        (parent?.type === 'MethodDefinition' &&
          parentKey === 'key' &&
          !parent.computed)
      output[key] = keepRuntimeName ? child : '@id'
    } else {
      output[key] = canonicalizeRuntimeAst(child, value, key)
    }
  }
  return output
}

function walkAcorn(root, callback) {
  if (!root || typeof root !== 'object') return
  callback(root)
  for (const child of Object.values(root)) {
    if (Array.isArray(child)) {
      for (const item of child) walkAcorn(item, callback)
    } else if (child && typeof child === 'object') {
      walkAcorn(child, callback)
    }
  }
}

function runtimeSemanticCounts(source) {
  const ast = parse(source, { ecmaVersion: 'latest' })
  const counts = {
    defaultSystemPrompt: 0,
    messageClientPlatform: 0,
    warn: 0,
    function: 0,
  }
  walkAcorn(ast, node => {
    if (
      node.type === 'Property' &&
      !node.computed &&
      node.key?.type === 'Identifier' &&
      Object.hasOwn(counts, node.key.name)
    ) {
      counts[node.key.name] += 1
    }
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      Object.hasOwn(counts, node.value)
    ) {
      counts[node.value] += 1
    }
  })
  return counts
}

test(
  'Target117 authenticates the u20612 whole-unit delta and only its two client-platform insertions',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    readExact(path.join(repositoryRoot, fixture.inputs.helper.path), {
      bytes: fixture.inputs.helper.bytes,
      sha256: fixture.inputs.helper.sha256,
    })
    readExact(path.join(repositoryRoot, fixture.inputs.historicalReplay.path), {
      bytes: fixture.inputs.historicalReplay.bytes,
      sha256: fixture.inputs.historicalReplay.sha256,
    })
    const baseline = readExact(
      path.join(artifactRoot, fixture.inputs.baselineBundle[0]),
      fileTupleDescriptor(fixture.inputs.baselineBundle),
    )
    const target = readExact(
      path.join(artifactRoot, fixture.inputs.targetBundle[0]),
      fileTupleDescriptor(fixture.inputs.targetBundle),
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.inputs.structuralLedger[0]),
          fileTupleDescriptor(fixture.inputs.structuralLedger),
        ),
      ),
    )

    const targetRegion = ledger.regions.find(
      region => region.target.index === fixture.target117.unit[0],
    )
    assert.ok(targetRegion)
    assert.deepEqual(
      [
        targetRegion.target.index,
        targetRegion.classification,
        targetRegion.target.nodeType,
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.tokenCount,
        targetRegion.target.sourceHash,
        targetRegion.target.coarseHash,
        targetRegion.unknownFreeIdentifierCount,
      ],
      fixture.target117.unit,
    )
    const baselineRegion = ledger.unmatchedBaseline.find(
      region => region.index === fixture.target117.baselineUnit[0],
    )
    assert.ok(baselineRegion)
    assert.deepEqual(
      [
        baselineRegion.index,
        baselineRegion.nodeType,
        baselineRegion.start,
        baselineRegion.end,
        baselineRegion.tokenCount,
        baselineRegion.sourceHash,
        baselineRegion.coarseHash,
      ],
      fixture.target117.baselineUnit,
    )

    const targetUnit = target.subarray(
      fixture.target117.unit[3],
      fixture.target117.unit[4],
    )
    const baselineUnit = baseline.subarray(
      fixture.target117.baselineUnit[2],
      fixture.target117.baselineUnit[3],
    )
    assert.equal(sha256(targetUnit), fixture.target117.unit[6])
    assert.equal(sha256(baselineUnit), fixture.target117.baselineUnit[5])

    const runtimeInsertion = ',messageClientPlatform:$?.clientPlatform'
    assert.equal(Buffer.byteLength(runtimeInsertion), fixture.target117.runtimeProperty[0] + 1)
    assert.equal(
      sha256(runtimeInsertion.slice(1)),
      fixture.target117.runtimeProperty[1],
    )
    assert.equal(targetUnit.toString('utf8').split(runtimeInsertion).length - 1, 2)
    assert.equal(baselineUnit.toString('utf8').includes(runtimeInsertion), false)
    for (const insertion of fixture.target117.runtimeInsertions) {
      assert.deepEqual(
        descriptor(target.subarray(insertion[0], insertion[1])),
        rangeTupleDescriptor(insertion),
      )
      assert.equal(
        target.subarray(insertion[0], insertion[1]).toString('utf8'),
        runtimeInsertion,
      )
    }
    for (const residue of fixture.target117.ownerResidues) {
      const bytes = target.subarray(residue[2], residue[3])
      assert.deepEqual(descriptor(bytes), { bytes: residue[4], sha256: residue[5] })
      assert.equal(bytes.toString('utf8').replaceAll('"', ''), residue[1])
    }

    assert.deepEqual(runtimeSemanticCounts(baselineUnit.toString('utf8')), {
      defaultSystemPrompt: 1,
      messageClientPlatform: 0,
      warn: 1,
      function: 2,
    })
    assert.deepEqual(runtimeSemanticCounts(targetUnit.toString('utf8')), {
      defaultSystemPrompt: 1,
      messageClientPlatform: 2,
      warn: 1,
      function: 2,
    })

    const derivedTarget = targetUnit
      .toString('utf8')
      .split(runtimeInsertion)
      .join('')
    assert.deepEqual(descriptor(Buffer.from(derivedTarget)), {
      bytes: fixture.target117.wholeUnitProof.derivedTargetBytes,
      sha256: fixture.target117.wholeUnitProof.derivedTargetSha256,
    })
    const canonicalBaseline = JSON.stringify(
      canonicalizeRuntimeAst(
        parse(baselineUnit.toString('utf8'), { ecmaVersion: 'latest' }),
      ),
    )
    const canonicalTarget = JSON.stringify(
      canonicalizeRuntimeAst(parse(derivedTarget, { ecmaVersion: 'latest' })),
    )
    assert.equal(canonicalTarget, canonicalBaseline)
    assert.deepEqual(descriptor(Buffer.from(canonicalTarget)), {
      bytes: fixture.target117.wholeUnitProof.canonicalBytes,
      sha256: fixture.target117.wholeUnitProof.canonicalSha256,
    })

    assert.deepEqual(TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_OWNER_OVERRIDES, [
      {
        key: `${caseName}:20612`,
        targetIndex: 20612,
        paths: ['src/QueryEngine.ts', 'src/Tool.ts'],
        declarations: ['QueryEngine', 'ToolUseContext'],
        evidenceIds: fixture.evidenceIds,
        behavior:
          'Target117 carries the inbound client platform into both ProcessUserInputContext option objects; the paired ToolUseContext field and submitMessage option preserve the authenticated runtime contract in typed source.',
      },
    ])
  },
)

test(
  'Target117 source witnesses constrain the exact replay without importing later QueryEngine behavior',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    assert.equal(
      execFileSync('git', ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      fixture.inputs.rawSource.tree,
    )
    assert.equal(
      execFileSync(
        'git',
        ['rev-parse', `${fixture.inputs.laterSourceWitness.commit}^{tree}`],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim(),
      fixture.inputs.laterSourceWitness.tree,
    )

    for (const sourceSet of [
      fixture.inputs.rawSource,
      fixture.inputs.laterSourceWitness,
    ]) {
      for (const input of sourceSet.files) {
        const bytes = execFileSync(
          'git',
          ['show', `${sourceSet.commit}:${input.path}`],
          { cwd: repositoryRoot },
        )
        assert.deepEqual(descriptor(bytes), {
          bytes: input.bytes,
          sha256: input.sha256,
        })
        assert.equal(
          execFileSync('git', ['rev-parse', `${sourceSet.commit}:${input.path}`], {
            cwd: repositoryRoot,
            encoding: 'utf8',
          }).trim(),
          input.blob,
        )
        const source = bytes.toString('utf8')
        const sourceFile = parseTypeScript(ts, input.path, source)
        const declaration = exactNamedDeclaration(
          ts,
          sourceFile,
          source,
          input.path.endsWith('/Tool.ts') ? 'type' : 'class',
          input.path.endsWith('/Tool.ts') ? 'ToolUseContext' : 'QueryEngine',
          input.declarationTuple,
        )
        if (sourceSet === fixture.inputs.rawSource) {
          assert.equal(source.includes('messageClientPlatform'), false)
          continue
        }
        if (input.path.endsWith('/QueryEngine.ts')) {
          const method = declaration.members.find(
            member =>
              ts.isMethodDeclaration(member) &&
              member.name?.getText(sourceFile) === 'submitMessage',
          )
          assert.ok(method)
          const optionMembers = descendants(
            ts,
            method.parameters[1].type,
            node =>
              ts.isPropertySignature(node) &&
              propertyName(ts, node, sourceFile) === 'clientPlatform',
          )
          assert.equal(optionMembers.length, 1)
          assert.deepEqual(
            [optionMembers[0].getStart(sourceFile), optionMembers[0].end],
            input.submitOptionsMember.slice(0, 2),
          )
          exactSourceRange(source, input.submitOptionsMember)
          const properties = descendants(
            ts,
            declaration,
            node =>
              ts.isPropertyAssignment(node) &&
              propertyName(ts, node, sourceFile) === 'messageClientPlatform',
          )
          assert.equal(properties.length, 2)
          for (const [index, property] of properties.entries()) {
            const tuple = input.messageClientPlatformProperties[index]
            assert.deepEqual([property.getStart(sourceFile), property.end], tuple.slice(0, 2))
            exactSourceRange(source, tuple)
          }
        } else {
          const members = descendants(
            ts,
            declaration,
            node =>
              ts.isPropertySignature(node) &&
              propertyName(ts, node, sourceFile) === 'messageClientPlatform',
          )
          assert.equal(members.length, 1)
          assert.deepEqual(
            [members[0].getStart(sourceFile), members[0].end],
            input.messageClientPlatformMember.slice(0, 2),
          )
          exactSourceRange(source, input.messageClientPlatformMember)
        }
      }
    }

    assert.equal(
      fixture.replay.temporalBoundary,
      'The Target117 bundle authenticates both runtime properties. Target119 supplies the exact surviving authored option/property/type spelling only; no other Target119 QueryEngine or Tool source is copied.',
    )
  },
)

test(
  'Target117 replay is idempotent for raw and historical-owner QueryEngine states',
  { skip: !selected },
  async () => {
    assert.deepEqual(
      TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_QUERY_TRANSITIONS.map(
        transition => ({
          state: transition.state,
          queryInput: [transition.input.bytes, transition.input.sha256],
          queryOutput: [transition.output.bytes, transition.output.sha256],
        }),
      ),
      fixture.replay.transitions,
    )
    assert.deepEqual(
      [
        TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.input.bytes,
        TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.input.sha256,
      ],
      fixture.replay.toolInput,
    )
    assert.deepEqual(
      [
        TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.output.bytes,
        TARGET117_QUERY_ENGINE_CLIENT_PLATFORM_TOOL_TRANSITION.output.sha256,
      ],
      fixture.replay.toolOutput,
    )

    const raw = materializeRawPair('target117-query-engine-raw-')
    const rawResult = applyTarget117QueryEngineClientPlatformSourceRecovery({
      sourceRoot: raw.sourceRoot,
    })
    assert.equal(rawResult.status, 'recovered')
    assert.equal(rawResult.sourceState, 'raw-target117')
    await assertRecoveredTypeContract(
      raw.sourceRoot,
      fixture.replay.transitions[0].queryOutput,
      false,
    )
    const rawAgain = applyTarget117QueryEngineClientPlatformSourceRecovery({
      sourceRoot: raw.sourceRoot,
    })
    assert.equal(rawAgain.status, 'already-recovered')
    assert.equal(rawAgain.sourceState, 'raw-target117')

    const historical = materializeHistoricalInputs(
      'target117-query-engine-historical-',
    )
    const historicalResult = applyTarget117HistoricalOwnerSourceGapRecovery({
      sourceRoot: historical.sourceRoot,
    })
    assert.equal(historicalResult.status, 'recovered')
    assert.deepEqual(
      descriptor(fs.readFileSync(sourceFilename(historical.sourceRoot, 'src/QueryEngine.ts'))),
      tupleDescriptor(fixture.inputs.historicalReplay.queryEngineOutput),
    )
    const result = applyTarget117QueryEngineClientPlatformSourceRecovery({
      sourceRoot: historical.sourceRoot,
    })
    assert.equal(result.status, 'recovered')
    assert.equal(result.sourceState, 'historical-owner-recovered')
    await assertRecoveredTypeContract(
      historical.sourceRoot,
      fixture.replay.transitions[1].queryOutput,
      true,
    )
    const again = applyTarget117QueryEngineClientPlatformSourceRecovery({
      sourceRoot: historical.sourceRoot,
    })
    assert.equal(again.status, 'already-recovered')
    assert.equal(again.sourceState, 'historical-owner-recovered')
    assert.deepEqual(fixture.replay.requiredSharedOrder, [
      'applyTarget117HistoricalOwnerSourceGapRecovery',
      'applyTarget117QueryEngineClientPlatformSourceRecovery',
    ])
  },
)

test(
  'Target117 replay rejects drift, symlinks, and mixed two-file states before writes',
  { skip: !selected },
  () => {
    const recovered = materializeRawPair('target117-query-engine-recovered-')
    applyTarget117QueryEngineClientPlatformSourceRecovery({
      sourceRoot: recovered.sourceRoot,
    })

    const mixed = materializeRawPair('target117-query-engine-mixed-')
    fs.copyFileSync(
      sourceFilename(recovered.sourceRoot, 'src/Tool.ts'),
      sourceFilename(mixed.sourceRoot, 'src/Tool.ts'),
    )
    const mixedQueryBefore = fs.readFileSync(
      sourceFilename(mixed.sourceRoot, 'src/QueryEngine.ts'),
    )
    assert.throws(
      () =>
        applyTarget117QueryEngineClientPlatformSourceRecovery({
          sourceRoot: mixed.sourceRoot,
        }),
      /Refusing mixed or non-Target117/,
    )
    assert.deepEqual(
      fs.readFileSync(sourceFilename(mixed.sourceRoot, 'src/QueryEngine.ts')),
      mixedQueryBefore,
    )

    const drift = materializeRawPair('target117-query-engine-drift-')
    fs.appendFileSync(
      sourceFilename(drift.sourceRoot, 'src/QueryEngine.ts'),
      '\n// drift\n',
    )
    const driftToolBefore = fs.readFileSync(
      sourceFilename(drift.sourceRoot, 'src/Tool.ts'),
    )
    assert.throws(
      () =>
        applyTarget117QueryEngineClientPlatformSourceRecovery({
          sourceRoot: drift.sourceRoot,
        }),
      /Refusing mixed or non-Target117/,
    )
    assert.deepEqual(
      fs.readFileSync(sourceFilename(drift.sourceRoot, 'src/Tool.ts')),
      driftToolBefore,
    )

    const symlink = materializeRawPair('target117-query-engine-symlink-')
    const toolFilename = sourceFilename(symlink.sourceRoot, 'src/Tool.ts')
    const realToolFilename = path.join(symlink.temporaryRoot, 'real-Tool.ts')
    fs.renameSync(toolFilename, realToolFilename)
    fs.symlinkSync(realToolFilename, toolFilename)
    assert.throws(
      () =>
        applyTarget117QueryEngineClientPlatformSourceRecovery({
          sourceRoot: symlink.sourceRoot,
        }),
      /expected a real source file/,
    )
  },
)

test(
  'Target117 packaged source accepts or reaches the exact historical-order postimage',
  { skip: !selected || !packageSourceRoot },
  async () => {
    const packaged = copyPair(packageSourceRoot, 'target117-query-engine-package-')
    const result = applyTarget117QueryEngineClientPlatformSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(result.status))
    assert.equal(result.sourceState, 'historical-owner-recovered')
    await assertRecoveredTypeContract(
      packaged.sourceRoot,
      fixture.replay.transitions[1].queryOutput,
      true,
    )
    const again = applyTarget117QueryEngineClientPlatformSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.equal(again.status, 'already-recovered')
    assert.equal(again.sourceState, 'historical-owner-recovered')
  },
)
