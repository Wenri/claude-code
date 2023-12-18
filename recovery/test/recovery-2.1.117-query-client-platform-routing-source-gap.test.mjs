import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  applyTarget117QueryClientPlatformRoutingSourceRecovery,
  TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_FILES,
  TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_OWNER_OVERRIDES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-query-client-platform-routing-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL('./recovery-2.1.117-query-client-platform-routing-source-gap.json', import.meta.url),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = '0aa2179385787cac1599c714df313ec6a21728893cc9242a2e6bf01b0cd97741'
const artifactRoot = path.join(repositoryRoot, '.recovery-tmp/authenticated-artifacts')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expected, filename)
  return bytes
}

function fileTuple(tuple) {
  return { bytes: tuple[1], sha256: tuple[2] }
}

function rangeTuple(tuple) {
  return { bytes: tuple[2], sha256: tuple[3] }
}

function regionTuple(region) {
  return [
    region.target.index,
    region.classification,
    region.target.nodeType,
    region.target.start,
    region.target.end,
    region.target.tokenCount,
    region.target.sourceHash,
    region.target.coarseHash,
  ]
}

function sourceFilename(sourceRoot, sourcePath) {
  assert.ok(sourcePath.startsWith('src/'))
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of fixture.inputs.rawSource.files) {
    const filename = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(
      filename,
      execFileSync(
        'git',
        ['show', `${fixture.inputs.rawSource.commit}:${input.path}`],
        { cwd: repositoryRoot },
      ),
    )
  }
  return { temporaryRoot, sourceRoot }
}

function copySelectedSource(inputRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of fixture.inputs.rawSource.files) {
    const output = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(sourceFilename(inputRoot, input.path), output)
  }
  return { temporaryRoot, sourceRoot }
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

function parseSource(ts, filename, source, kind) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, filename)
  return sourceFile
}

function exactDeclaration(ts, sourceFile, source, name, tuple) {
  const declarations = descendants(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === name,
  )
  assert.equal(declarations.length, 1, name)
  const declaration = declarations[0]
  assert.deepEqual(
    [declaration.getStart(sourceFile), declaration.end],
    tuple.slice(0, 2),
  )
  assert.deepEqual(
    descriptor(Buffer.from(source.slice(tuple[0], tuple[1]))),
    { bytes: tuple[2], sha256: tuple[3] },
  )
  return declaration
}

function propertyName(ts, property, sourceFile) {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text
  }
  return property.name.getText(sourceFile)
}

function exactProperty(ts, object, name, sourceFile) {
  const properties = object.properties.filter(
    property =>
      ts.isPropertyAssignment(property) &&
      propertyName(ts, property, sourceFile) === name,
  )
  assert.equal(properties.length, 1, name)
  return properties[0]
}

test('Target117 authenticates u13748 routing and its matched shared classifier', { skip: !selected }, async () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  readExact(path.join(repositoryRoot, fixture.inputs.helper.path), {
    bytes: fixture.inputs.helper.bytes,
    sha256: fixture.inputs.helper.sha256,
  })
  const baseline = readExact(
    path.join(artifactRoot, fixture.inputs.baselineBundle[0]),
    fileTuple(fixture.inputs.baselineBundle),
  )
  const target = readExact(
    path.join(artifactRoot, fixture.inputs.targetBundle[0]),
    fileTuple(fixture.inputs.targetBundle),
  )
  const ledger = JSON.parse(
    gunzipSync(
      readExact(
        path.join(repositoryRoot, fixture.inputs.structuralLedger[0]),
        fileTuple(fixture.inputs.structuralLedger),
      ),
    ),
  )
  const queryRegion = ledger.regions.find(
    region => region.target.index === fixture.target117.unit[0],
  )
  const classifierRegion = ledger.regions.find(
    region => region.target.index === fixture.target117.classifierUnit[0],
  )
  assert.ok(queryRegion)
  assert.ok(classifierRegion)
  assert.deepEqual(regionTuple(queryRegion), fixture.target117.unit)
  assert.deepEqual(regionTuple(classifierRegion), fixture.target117.classifierUnit)

  const queryBytes = target.subarray(
    fixture.target117.unit[3],
    fixture.target117.unit[4],
  )
  const classifierBytes = target.subarray(
    fixture.target117.classifierUnit[3],
    fixture.target117.classifierUnit[4],
  )
  assert.equal(sha256(queryBytes), fixture.target117.unit[6])
  assert.equal(sha256(classifierBytes), fixture.target117.classifierUnit[6])
  assert.deepEqual(
    descriptor(
      target.subarray(
        fixture.target117.dumpPromptsRange[0],
        fixture.target117.dumpPromptsRange[1],
      ),
    ),
    rangeTuple(fixture.target117.dumpPromptsRange),
  )
  assert.deepEqual(
    descriptor(
      target.subarray(
        fixture.target117.clientPlatformRange[0],
        fixture.target117.clientPlatformRange[1],
      ),
    ),
    rangeTuple(fixture.target117.clientPlatformRange),
  )

  const ts = await loadTypeScript()
  const queryText = queryBytes.toString('utf8')
  const querySource = parseSource(ts, 'u13748.js', queryText, ts.ScriptKind.JS)
  const dumpDeclarations = descendants(
    ts,
    querySource,
    node =>
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isConditionalExpression(node.initializer) &&
      node.initializer.getText(querySource).includes('"auxiliary"'),
  )
  assert.equal(dumpDeclarations.length, 1)
  const dumpConditional = dumpDeclarations[0].initializer
  assert.equal(
    dumpConditional.condition.getText(querySource),
    'J.gates.isAnt&&nB$(z)!=="auxiliary"',
  )
  assert.equal(dumpConditional.whenTrue.getText(querySource), 'HSK(Z.agentId??J.sessionId)')
  assert.equal(dumpConditional.whenFalse.kind, ts.SyntaxKind.VoidExpression)

  const platformProperties = descendants(
    ts,
    querySource,
    node =>
      ts.isPropertyAssignment(node) &&
      propertyName(ts, node, querySource) === 'messageClientPlatform',
  )
  assert.equal(platformProperties.length, 1)
  assert.equal(
    platformProperties[0].initializer.getText(querySource),
    'Z.options.messageClientPlatform',
  )
  assert.equal(classifierBytes.toString('utf8').includes('return"auxiliary"'), true)
  assert.equal((baseline.toString('utf8').match(/"auxiliary"/g) ?? []).length, 1)
  assert.equal((target.toString('utf8').match(/"auxiliary"/g) ?? []).length, 2)
  assert.equal(baseline.includes(Buffer.from('messageClientPlatform')), false)

  for (const residue of fixture.target117.residues) {
    const [kind, value, baselineCount, occurrence, start, end] = residue
    assert.ok(['string', 'property'].includes(kind))
    const rawValue = target.subarray(start, end).toString('utf8')
    assert.equal(kind === 'string' ? JSON.parse(rawValue) : rawValue, value)
    assert.equal(start >= fixture.target117.unit[3], true)
    assert.equal(end <= fixture.target117.unit[4], true)
    assert.equal(occurrence > baselineCount, true)
  }
  assert.deepEqual(
    TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_OWNER_OVERRIDES.map(row => [
      row.key,
      row.paths,
      row.declarations,
      row.evidenceIds,
    ]),
    [[
      `${caseName}:13748`,
      [fixture.target117.owner, fixture.target117.dependency],
      fixture.target117.declarations,
      fixture.evidenceIds,
    ]],
  )
})

test('replay exports the shared classifier, guards auxiliary dumps, and forwards client platform', { skip: !selected }, async () => {
  const raw = fixture.inputs.rawSource
  assert.equal(
    execFileSync('git', ['rev-parse', `${raw.commit}^{tree}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    raw.tree,
  )
  const replay = materializeRawSource('target117-query-routing-ast-')
  try {
    const ts = await loadTypeScript()
    for (const input of raw.files) {
      assert.equal(
        execFileSync('git', ['rev-parse', `${raw.commit}:${input.path}`], {
          cwd: repositoryRoot,
          encoding: 'utf8',
        }).trim(),
        input.blob,
      )
      const bytes = readExact(sourceFilename(replay.sourceRoot, input.path), {
        bytes: input.bytes,
        sha256: input.sha256,
      })
      const source = bytes.toString('utf8')
      exactDeclaration(
        ts,
        parseSource(ts, input.path, source, ts.ScriptKind.TS),
        source,
        input.declaration,
        input.declarationTuple,
      )
    }

    assert.equal(
      applyTarget117QueryClientPlatformRoutingSourceRecovery({
        sourceRoot: replay.sourceRoot,
      }).status,
      'recovered',
    )

    const costPost = fixture.inputs.postimages[0]
    const costBytes = readExact(sourceFilename(replay.sourceRoot, costPost.path), {
      bytes: costPost.bytes,
      sha256: costPost.sha256,
    })
    const costText = costBytes.toString('utf8')
    const costSource = parseSource(ts, costPost.path, costText, ts.ScriptKind.TS)
    const classifier = exactDeclaration(
      ts,
      costSource,
      costText,
      costPost.declaration,
      costPost.declarationTuple,
    )
    assert.equal(
      classifier.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword),
      true,
    )
    assert.deepEqual(
      descendants(
        ts,
        classifier,
        node => ts.isReturnStatement(node) && ts.isStringLiteral(node.expression),
      ).map(statement => statement.expression.text),
      ['main', 'subagent', 'auxiliary'],
    )

    const queryPost = fixture.inputs.postimages[1]
    const queryBytes = readExact(sourceFilename(replay.sourceRoot, queryPost.path), {
      bytes: queryPost.bytes,
      sha256: queryPost.sha256,
    })
    const queryText = queryBytes.toString('utf8')
    const querySource = parseSource(ts, queryPost.path, queryText, ts.ScriptKind.TS)
    const queryLoop = exactDeclaration(
      ts,
      querySource,
      queryText,
      queryPost.declaration,
      queryPost.declarationTuple,
    )
    const imports = querySource.statements.filter(
      statement =>
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier.text === './cost-tracker.js',
    )
    assert.equal(imports.length, 1)
    assert.equal(
      imports[0].importClause.namedBindings.elements[0].name.text,
      'classifyQuerySource',
    )

    const dumpDeclarations = descendants(
      ts,
      queryLoop,
      node =>
        ts.isVariableDeclaration(node) &&
        node.name.getText(querySource) === 'dumpPromptsFetch',
    )
    assert.equal(dumpDeclarations.length, 1)
    const dumpConditional = dumpDeclarations[0].initializer
    assert.equal(ts.isConditionalExpression(dumpConditional), true)
    assert.equal(
      dumpConditional.condition.getText(querySource),
      "config.gates.isAnt &&\n      classifyQuerySource(querySource) !== 'auxiliary'",
    )
    assert.equal(
      dumpConditional.whenTrue.getText(querySource),
      'createDumpPromptsFetch(toolUseContext.agentId ?? config.sessionId)',
    )

    const modelCalls = descendants(
      ts,
      queryLoop,
      node =>
        ts.isCallExpression(node) &&
        node.expression.getText(querySource) === 'deps.callModel',
    )
    assert.equal(modelCalls.length, 1)
    const request = modelCalls[0].arguments[0]
    assert.equal(ts.isObjectLiteralExpression(request), true)
    const options = exactProperty(ts, request, 'options', querySource).initializer
    assert.equal(ts.isObjectLiteralExpression(options), true)
    const platform = exactProperty(ts, options, 'messageClientPlatform', querySource)
    assert.equal(
      platform.initializer.getText(querySource),
      'toolUseContext.options.messageClientPlatform',
    )
    assert.equal(
      options.properties.some(
        property =>
          ts.isShorthandPropertyAssignment(property) &&
          property.name.text === 'querySource',
      ),
      true,
    )
  } finally {
    fs.rmSync(replay.temporaryRoot, { recursive: true, force: true })
  }
})

test('query-routing replay is dual-state, idempotent, atomic, and fail-closed', { skip: !selected }, () => {
  assert.deepEqual(
    TARGET117_QUERY_CLIENT_PLATFORM_ROUTING_FILES.map(file => [
      file.path,
      file.raw,
      file.postimage,
    ]),
    fixture.inputs.rawSource.files.map((raw, index) => [
      raw.path,
      { bytes: raw.bytes, sha256: raw.sha256 },
      {
        bytes: fixture.inputs.postimages[index].bytes,
        sha256: fixture.inputs.postimages[index].sha256,
      },
    ]),
  )
  const raw = materializeRawSource('target117-query-routing-raw-')
  try {
    assert.equal(
      applyTarget117QueryClientPlatformRoutingSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }).status,
      'recovered',
    )
    assert.equal(
      applyTarget117QueryClientPlatformRoutingSourceRecovery({
        sourceRoot: raw.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
  }

  let seed
  const selectedRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
    ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
    : (() => {
        seed = materializeRawSource('target117-query-routing-seed-')
        applyTarget117QueryClientPlatformRoutingSourceRecovery({
          sourceRoot: seed.sourceRoot,
        })
        return seed.sourceRoot
      })()
  const packaged = copySelectedSource(selectedRoot, 'target117-query-routing-package-')
  try {
    const first = applyTarget117QueryClientPlatformRoutingSourceRecovery({
      sourceRoot: packaged.sourceRoot,
    })
    assert.ok(['recovered', 'already-recovered'].includes(first.status))
    assert.equal(
      applyTarget117QueryClientPlatformRoutingSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      }).status,
      'already-recovered',
    )
  } finally {
    fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    if (seed) fs.rmSync(seed.temporaryRoot, { recursive: true, force: true })
  }

  const mixed = materializeRawSource('target117-query-routing-mixed-')
  try {
    applyTarget117QueryClientPlatformRoutingSourceRecovery({
      sourceRoot: mixed.sourceRoot,
    })
    fs.writeFileSync(
      sourceFilename(mixed.sourceRoot, fixture.inputs.rawSource.files[1].path),
      execFileSync(
        'git',
        [
          'show',
          `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.files[1].path}`,
        ],
        { cwd: repositoryRoot },
      ),
    )
    assert.throws(
      () => applyTarget117QueryClientPlatformRoutingSourceRecovery({
        sourceRoot: mixed.sourceRoot,
      }),
      /Refusing mixed Target117 query-routing recovery/,
    )
  } finally {
    fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
  }

  const drift = materializeRawSource('target117-query-routing-drift-')
  try {
    fs.appendFileSync(
      sourceFilename(drift.sourceRoot, fixture.inputs.rawSource.files[0].path),
      '\n// drift\n',
    )
    assert.throws(
      () => applyTarget117QueryClientPlatformRoutingSourceRecovery({
        sourceRoot: drift.sourceRoot,
      }),
      /refusing non-Target117 state/,
    )
  } finally {
    fs.rmSync(drift.temporaryRoot, { recursive: true, force: true })
  }
  assert.throws(
    () => applyTarget117QueryClientPlatformRoutingSourceRecovery(),
    /sourceRoot is required/,
  )
})
