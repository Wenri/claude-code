import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import {
  applyTarget117CcdSessionRatingTelemetrySourceRecovery,
  TARGET117_CCD_SESSION_RATING_CONTEXT_FILE,
  TARGET117_CCD_SESSION_RATING_OWNER_OVERRIDES,
  TARGET117_CCD_SESSION_RATING_RAW_PRINT_FILE,
  TARGET117_CCD_SESSION_RATING_RAW_PRINT_POSTIMAGE,
  TARGET117_CCD_SESSION_RATING_RECOVERED_FILE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-ccd-session-rating-telemetry-source-gap.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-ccd-session-rating-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'bdc34b7da0e4a2998be084e1bfdf658c0aac020ed42cb30a90a7b0b4767ecf4a'
const artifactRoot = path.join(
  repositoryRoot,
  '.recovery-tmp/authenticated-artifacts',
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, expected.bytes, `${label}: bytes`)
  assert.equal(sha256(bytes), expected.sha256, `${label}: SHA-256`)
  return bytes
}

function artifactPath(environmentName, input) {
  const explicit = process.env[environmentName]
  if (explicit) return path.resolve(explicit)
  return path.join(artifactRoot, input.artifact)
}

function sourceFilename(sourceRoot, sourcePath) {
  assert.match(sourcePath, /^src\//, `${sourcePath}: normalized source path`)
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(root, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of [
    fixture.inputs.printFile,
    fixture.inputs.schemaContextFile,
  ]) {
    const bytes = execFileSync(
      'git',
      ['show', `${fixture.inputs.rawTargetSourceCommit}:${input.path}`],
      { cwd: repositoryRoot },
    )
    const expected = input.input ?? input
    assert.deepEqual(descriptor(bytes), {
      bytes: expected.bytes,
      sha256: expected.sha256,
    })
    const filename = sourceFilename(sourceRoot, input.path)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, bytes)
  }
  return { temporaryRoot, sourceRoot }
}

function copyPackagedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  for (const input of [
    fixture.inputs.printFile,
    fixture.inputs.schemaContextFile,
    fixture.inputs.recoveredFile,
  ]) {
    const source = sourceFilename(sourceRoot, input.path)
    if (!fs.existsSync(source)) continue
    const destination = sourceFilename(outputRoot, input.path)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
  return { temporaryRoot, sourceRoot: outputRoot }
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walk(child, visit)
    }
  }
}

function bundleOccurrences(source, values) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const strings = new Map(values.strings.map(value => [value, []]))
  const properties = new Map(values.properties.map(value => [value, []]))
  walk(ast, node => {
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      strings.has(node.value)
    ) {
      strings.get(node.value).push({ start: node.start, end: node.end })
    }

    let key
    if (node.type === 'Property' && node.computed === false) key = node.key
    if (node.type === 'MemberExpression' && node.computed === false) {
      key = node.property
    }
    if (
      ['MethodDefinition', 'PropertyDefinition'].includes(node.type) &&
      node.computed === false
    ) {
      key = node.key
    }
    if (
      key?.type === 'Identifier' &&
      properties.has(key.name)
    ) {
      properties.get(key.name).push({ start: key.start, end: key.end })
    }
  })
  for (const occurrences of [...strings.values(), ...properties.values()]) {
    occurrences.sort((left, right) => left.start - right.start)
  }
  return { properties, strings }
}

async function loadTypeScript() {
  const filename = path.join(
    repositoryRoot,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  )
  assert.ok(fs.existsSync(filename), 'repo-pinned TypeScript is available')
  const module = await import(pathToFileURL(filename).href)
  return module.default ?? module
}

function parseSource(ts, filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parses`)
  return sourceFile
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

function namedDeclaration(ts, sourceFile, expected) {
  const matches = descendants(
    ts,
    sourceFile,
    node => node.name && ts.isIdentifier(node.name) && node.name.text === expected.name,
  )
  assert.equal(matches.length, 1, `${expected.name}: one named declaration`)
  let declaration = matches[0]
  if (ts.isVariableDeclaration(declaration)) declaration = declaration.parent.parent
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
  return declaration
}

function exactDeclaration(ts, sourceFile, source, expected) {
  const declaration = namedDeclaration(ts, sourceFile, expected)
  assert.equal(declaration.getStart(sourceFile), expected.start)
  assert.equal(declaration.end, expected.end)
  const bytes = Buffer.from(
    source.slice(declaration.getStart(sourceFile), declaration.end),
  )
  assert.deepEqual(descriptor(bytes), {
    bytes: expected.bytes,
    sha256: expected.sha256,
  })
  return declaration
}

function assertLedgerUnit(ledger, expected) {
  const [
    index,
    classification,
    nodeType,
    start,
    end,
    tokenCount,
    sourceHash,
    coarseHash,
  ] = expected
  const entry = ledger.unresolvedTarget.find(
    candidate => candidate.target.index === index,
  )
  assert.deepEqual(
    [
      entry.target.index,
      entry.classification,
      entry.target.nodeType,
      entry.target.start,
      entry.target.end,
      entry.target.tokenCount,
      entry.target.sourceHash,
      entry.target.coarseHash,
    ],
    [
      index,
      classification,
      nodeType,
      start,
      end,
      tokenCount,
      sourceHash,
      coarseHash,
    ],
  )
}

function importBindings(ts, sourceFile) {
  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map(statement => ({
      module: statement.moduleSpecifier.text,
      names:
        statement.importClause?.namedBindings?.elements?.map(
          element => element.name.text,
        ) ?? [],
    }))
}

function setupCalls(ts, root) {
  return descendants(
    ts,
    root,
    node =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['setupVscodeSdkMcp', 'setupCcdSessionMcp'].includes(node.expression.text),
  ).map(node => ({
    name: node.expression.text,
    argument: node.arguments[0]?.getText(),
  }))
}

function assertRecoveredSource(ts, sourceRoot, exactPrint = false) {
  const moduleBytes = readExact(
    sourceFilename(sourceRoot, fixture.inputs.recoveredFile.path),
    fixture.inputs.recoveredFile,
    'recovered ccdSessionMcp.ts',
  )
  const moduleSource = moduleBytes.toString('utf8')
  const moduleFile = parseSource(
    ts,
    fixture.inputs.recoveredFile.path,
    moduleSource,
  )
  for (const declaration of fixture.inputs.recoveredFile.declarations) {
    exactDeclaration(ts, moduleFile, moduleSource, declaration)
  }

  const printBytes = fs.readFileSync(
    sourceFilename(sourceRoot, fixture.inputs.printFile.path),
  )
  if (exactPrint) {
    assert.deepEqual(descriptor(printBytes), fixture.inputs.printFile.output)
  }
  const printSource = printBytes.toString('utf8')
  const printFile = parseSource(ts, fixture.inputs.printFile.path, printSource)
  const imports = importBindings(ts, printFile)
  assert.deepEqual(
    imports.filter(entry =>
      [
        'src/services/mcp/vscodeSdkMcp.js',
        'src/services/mcp/ccdSessionMcp.js',
      ].includes(entry.module),
    ),
    [
      {
        module: 'src/services/mcp/vscodeSdkMcp.js',
        names: ['setupVscodeSdkMcp'],
      },
      {
        module: 'src/services/mcp/ccdSessionMcp.js',
        names: ['setupCcdSessionMcp'],
      },
    ],
  )
  const update = descendants(
    ts,
    printFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'updateSdkMcp',
  )
  assert.equal(update.length, 1)
  assert.deepEqual(setupCalls(ts, update[0]), [
    { name: 'setupVscodeSdkMcp', argument: 'sdkClients' },
    { name: 'setupCcdSessionMcp', argument: 'sdkClients' },
  ])
  return { moduleFile, moduleSource, printFile, printSource, update: update[0] }
}

test(
  '2.1.117 CCD rating fixture pins raw context, recovered owner, and rejected map spill',
  { skip: !selected },
  async () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 3,
      recoveredFiles: 2,
      ownerOverrides: 1,
      behaviorWitnessUnits: 1,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'case-owned helper',
    )
    assert.deepEqual(TARGET117_CCD_SESSION_RATING_CONTEXT_FILE, {
      path: fixture.inputs.schemaContextFile.path,
      bytes: fixture.inputs.schemaContextFile.bytes,
      sha256: fixture.inputs.schemaContextFile.sha256,
    })
    assert.deepEqual(TARGET117_CCD_SESSION_RATING_RAW_PRINT_FILE, {
      path: fixture.inputs.printFile.path,
      ...fixture.inputs.printFile.input,
    })
    assert.deepEqual(TARGET117_CCD_SESSION_RATING_RAW_PRINT_POSTIMAGE, {
      path: fixture.inputs.printFile.path,
      ...fixture.inputs.printFile.output,
    })
    assert.deepEqual(TARGET117_CCD_SESSION_RATING_RECOVERED_FILE, {
      path: fixture.inputs.recoveredFile.path,
      bytes: fixture.inputs.recoveredFile.bytes,
      sha256: fixture.inputs.recoveredFile.sha256,
    })
    assert.deepEqual(
      TARGET117_CCD_SESSION_RATING_OWNER_OVERRIDES.map(override => ({
        key: override.key,
        targetIndex: override.targetIndex,
        paths: [...override.paths],
        declarations: [...override.declarations],
        evidenceIds: [...override.evidenceIds],
      })),
      [
        {
          key: `${caseName}:${fixture.row.targetIndex}`,
          targetIndex: fixture.row.targetIndex,
          paths: [fixture.row.owner],
          declarations: fixture.row.declarations,
          evidenceIds: fixture.evidenceIds,
        },
      ],
    )

    const ts = await loadTypeScript()
    for (const input of [
      fixture.inputs.printFile,
      fixture.inputs.schemaContextFile,
      ...fixture.inputs.rejectedSourceMapCandidates,
    ]) {
      const revision = `${fixture.inputs.rawTargetSourceCommit}:${input.path}`
      assert.equal(
        execFileSync('git', ['rev-parse', revision], {
          cwd: repositoryRoot,
          encoding: 'utf8',
        }).trim(),
        input.blob,
      )
      const bytes = execFileSync('git', ['show', revision], {
        cwd: repositoryRoot,
      })
      const expected = input.input ?? input
      assert.deepEqual(descriptor(bytes), {
        bytes: expected.bytes,
        sha256: expected.sha256,
      })
      if (fixture.inputs.rejectedSourceMapCandidates.includes(input)) {
        const source = bytes.toString('utf8')
        assert.doesNotMatch(source, /ccd_session/)
        assert.doesNotMatch(source, /setNotificationHandler/)
      }
    }

    const absent = spawnSync(
      'git',
      [
        'cat-file',
        '-e',
        `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.recoveredFile.path}`,
      ],
      { cwd: repositoryRoot },
    )
    assert.notEqual(absent.status, 0, 'raw Target117 lacks recovered module')

    const schemaSource = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.schemaContextFile.path}`,
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    const schemaFile = parseSource(
      ts,
      fixture.inputs.schemaContextFile.path,
      schemaSource,
    )
    exactDeclaration(
      ts,
      schemaFile,
      schemaSource,
      fixture.inputs.schemaContextFile.declaration,
    )

    const printSource = execFileSync(
      'git',
      [
        'show',
        `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.printFile.path}`,
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    const printFile = parseSource(ts, fixture.inputs.printFile.path, printSource)
    exactDeclaration(
      ts,
      printFile,
      printSource,
      fixture.inputs.printFile.inputDeclaration,
    )
    assert.deepEqual(
      importBindings(ts, printFile).filter(entry =>
        entry.module.endsWith('SdkMcp.js'),
      ),
      [
        {
          module: 'src/services/mcp/vscodeSdkMcp.js',
          names: ['setupVscodeSdkMcp'],
        },
      ],
    )
    assert.deepEqual(setupCalls(ts, printFile), [
      { name: 'setupVscodeSdkMcp', argument: 'sdkClients' },
    ])
  },
)

test(
  '2.1.117 bundles authenticate the complete CCD handler, allowlist, residues, and paired callsite',
  { skip: !selected },
  () => {
    const baseline = readExact(
      artifactPath(
        'CLAUDE_CODE_BASELINE_2_1_116_BUNDLE',
        fixture.inputs.baselineBundle,
      ),
      fixture.inputs.baselineBundle,
      'authenticated 2.1.116 bundle',
    ).toString('utf8')
    const target = readExact(
      artifactPath(
        'CLAUDE_CODE_TARGET_2_1_117_BUNDLE',
        fixture.inputs.targetBundle,
      ),
      fixture.inputs.targetBundle,
      'authenticated 2.1.117 bundle',
    ).toString('utf8')
    const ledgerBytes = readExact(
      path.join(repositoryRoot, fixture.inputs.structuralLedger.path),
      fixture.inputs.structuralLedger,
      'structural ledger',
    )
    const ledger = JSON.parse(gunzipSync(ledgerBytes))

    assertLedgerUnit(ledger, fixture.row.targetUnit)
    const [, , , start, end, , sourceHash] = fixture.row.targetUnit
    const unit = Buffer.from(target.slice(start, end))
    assert.deepEqual(descriptor(unit), {
      bytes: end - start,
      sha256: sourceHash,
    })
    assert.equal(unit.toString('utf8'), fixture.row.exactSource)

    const baselineOccurrences = bundleOccurrences(baseline, {
      strings: ['ccd_session', 'tengu_message_rated'],
      properties: ['eventName', 'eventData'],
    })
    const targetOccurrences = bundleOccurrences(target, {
      strings: ['ccd_session', 'tengu_message_rated'],
      properties: ['eventName', 'eventData'],
    })
    assert.equal(
      baselineOccurrences.strings.get('ccd_session').length,
      fixture.baselineAbsence.ccdSessionStringOccurrences,
    )
    assert.equal(
      baselineOccurrences.strings.get('tengu_message_rated').length,
      fixture.baselineAbsence.allowedEventStringOccurrences,
    )
    assert.equal(
      baselineOccurrences.properties.get('eventName').length,
      fixture.baselineAbsence.eventNamePropertyOccurrences,
    )
    assert.equal(
      baselineOccurrences.properties.get('eventData').length,
      fixture.baselineAbsence.eventDataPropertyOccurrences,
    )
    for (const [kind, value, residueStart, residueEnd, occurrence, baselineCount] of
      fixture.row.residues) {
      const occurrences =
        kind === 'string'
          ? targetOccurrences.strings.get(value)
          : targetOccurrences.properties.get(value)
      assert.equal(occurrences.length, baselineCount + 1)
      assert.deepEqual(occurrences[occurrence - 1], {
        start: residueStart,
        end: residueEnd,
      })
      assert.equal(
        target.slice(residueStart, residueEnd),
        kind === 'string' ? JSON.stringify(value) : value,
      )
      assert.ok(residueStart >= start && residueEnd <= end)
    }

    const unitAst = parse(unit.toString('utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    const functionNode = unitAst.body[0]
    assert.equal(functionNode.type, 'FunctionDeclaration')
    assert.equal(functionNode.id.name, 'TO4')
    const findCalls = []
    const handlerCalls = []
    const logCalls = []
    walk(functionNode, node => {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee.property?.name === 'find'
      ) {
        findCalls.push(node)
      }
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        node.callee.property?.name === 'setNotificationHandler'
      ) {
        handlerCalls.push(node)
      }
      if (node.type === 'CallExpression' && node.callee?.name === 'l') {
        logCalls.push(node)
      }
    })
    assert.equal(findCalls.length, 1)
    assert.equal(findCalls[0].arguments[0].body.operator, '===')
    assert.equal(findCalls[0].arguments[0].body.right.value, 'ccd_session')
    assert.equal(handlerCalls.length, 1)
    assert.equal(handlerCalls[0].callee.object.type, 'MemberExpression')
    assert.equal(handlerCalls[0].callee.object.property.name, 'client')
    assert.equal(handlerCalls[0].arguments[0].callee.name, '$c8')
    assert.equal(handlerCalls[0].arguments[1].async, true)
    assert.equal(logCalls.length, 1)
    assert.equal(logCalls[0].arguments[0].name, 'K')
    assert.deepEqual(
      logCalls[0].arguments[1].properties.map(property => property.key.name),
      ['message_uuid', 'sentiment', 'surface', 'cleared'],
    )

    assertLedgerUnit(ledger, fixture.behaviorWitness.allowlistUnit)
    const [, , , setStart, setEnd, , setHash] =
      fixture.behaviorWitness.allowlistUnit
    const allowlistUnit = Buffer.from(target.slice(setStart, setEnd))
    assert.deepEqual(descriptor(allowlistUnit), {
      bytes: setEnd - setStart,
      sha256: setHash,
    })
    assert.equal(
      allowlistUnit.toString('utf8'),
      fixture.behaviorWitness.allowlistExactSource,
    )
    const allowedOccurrences = targetOccurrences.strings.get(
      'tengu_message_rated',
    )
    assert.equal(
      allowedOccurrences.length,
      fixture.baselineAbsence.allowedEventStringOccurrences + 1,
    )
    assert.deepEqual(allowedOccurrences[1], {
      start: 12915048,
      end: 12915069,
    })

    const callsite = fixture.behaviorWitness.callsite
    const callsiteBytes = Buffer.from(target.slice(callsite.start, callsite.end))
    assert.deepEqual(descriptor(callsiteBytes), {
      bytes: callsite.bytes,
      sha256: callsite.sha256,
    })
    assert.equal(callsiteBytes.toString('utf8'), callsite.exactSource)
    const callAst = parse(callsite.exactSource, {
      ecmaVersion: 'latest',
      sourceType: 'script',
    })
    assert.deepEqual(
      callAst.body[0].expression.expressions.map(expression => ({
        callee: expression.callee.name,
        argument: expression.arguments[0].name,
      })),
      [
        { callee: 'CMK', argument: 'OH' },
        { callee: 'TO4', argument: 'OH' },
      ],
    )
  },
)

test(
  '2.1.117 CCD rating replay is dual-state, declaration-local, and executable',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const raw = materializeRawSource('target117-ccd-rating-raw-')
    try {
      assert.equal(
        applyTarget117CcdSessionRatingTelemetrySourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'recovered',
      )
      assert.equal(
        applyTarget117CcdSessionRatingTelemetrySourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'already-recovered',
      )
      const recovered = assertRecoveredSource(ts, raw.sourceRoot, true)
      exactDeclaration(
        ts,
        recovered.printFile,
        recovered.printSource,
        fixture.inputs.printFile.outputDeclaration,
      )

      const imports = importBindings(ts, recovered.moduleFile)
      assert.deepEqual(imports, [
        {
          module: '../analytics/index.js',
          names: [
            'AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS',
            'logEvent',
          ],
        },
        {
          module: './vscodeSdkMcp.js',
          names: ['LogEventNotificationSchema'],
        },
        {
          module: './types.js',
          names: ['MCPServerConnection'],
        },
      ])
      const setup = namedDeclaration(
        ts,
        recovered.moduleFile,
        fixture.inputs.recoveredFile.declarations[1],
      )
      const stringLiterals = descendants(
        ts,
        setup,
        node => ts.isStringLiteral(node),
      ).map(node => node.text)
      assert.deepEqual(stringLiterals, ['ccd_session', 'connected'])
      const handlerCalls = descendants(
        ts,
        setup,
        node =>
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'setNotificationHandler',
      )
      assert.equal(handlerCalls.length, 1)
      assert.equal(
        handlerCalls[0].arguments[0].getText(recovered.moduleFile),
        'LogEventNotificationSchema()',
      )
      assert.ok(ts.isArrowFunction(handlerCalls[0].arguments[1]))
      assert.ok(
        handlerCalls[0].arguments[1].modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword,
        ),
      )

      const javascript = ts.transpileModule(recovered.moduleSource, {
        compilerOptions: {
          esModuleInterop: true,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
      const logged = []
      const schema = Object.freeze({ method: 'log_event' })
      const module = { exports: {} }
      const require = specifier => {
        if (specifier === '../analytics/index.js') {
          return { logEvent: (eventName, eventData) => logged.push({ eventName, eventData }) }
        }
        if (specifier === './vscodeSdkMcp.js') {
          return { LogEventNotificationSchema: () => schema }
        }
        throw new Error(`unexpected runtime import: ${specifier}`)
      }
      Function('require', 'exports', 'module', javascript)(
        require,
        module.exports,
        module,
      )
      const runtimeSetup = module.exports.setupCcdSessionMcp
      assert.equal(typeof runtimeSetup, 'function')
      let registered
      const connected = {
        name: 'ccd_session',
        type: 'connected',
        client: {
          setNotificationHandler(actualSchema, handler) {
            registered = { actualSchema, handler }
          },
        },
      }
      runtimeSetup([{ name: 'other', type: 'connected', client: {} }])
      runtimeSetup([{ name: 'ccd_session', type: 'pending' }])
      assert.equal(registered, undefined)
      runtimeSetup([connected])
      assert.equal(registered.actualSchema, schema)

      await registered.handler({
        params: {
          eventName: 'untrusted_event',
          eventData: { message_uuid: 'ignored' },
        },
      })
      assert.deepEqual(logged, [])
      await registered.handler({
        params: {
          eventName: 'tengu_message_rated',
          eventData: {
            message_uuid: 42,
            sentiment: 'positive',
            surface: null,
            cleared: 1,
          },
        },
      })
      await registered.handler({
        params: {
          eventName: 'tengu_message_rated',
          eventData: {
            message_uuid: null,
            sentiment: false,
            surface: 'tool_use',
            cleared: true,
          },
        },
      })
      assert.deepEqual(logged, [
        {
          eventName: 'tengu_message_rated',
          eventData: {
            message_uuid: '42',
            sentiment: 'positive',
            surface: undefined,
            cleared: false,
          },
        },
        {
          eventName: 'tengu_message_rated',
          eventData: {
            message_uuid: undefined,
            sentiment: 'false',
            surface: 'tool_use',
            cleared: true,
          },
        },
      ])
    } finally {
      fs.rmSync(raw.temporaryRoot, { recursive: true, force: true })
    }

    const packagedRoot = path.resolve(
      process.env.CLAUDE_CODE_RECOVERED_2_1_117_SOURCE_ROOT ??
        path.join(repositoryRoot, '.recovery-tmp/semantic-trees/2.1.117/src'),
    )
    assert.ok(fs.existsSync(packagedRoot), 'packaged Target117 source root exists')
    const packaged = copyPackagedSource(
      packagedRoot,
      'target117-ccd-rating-packaged-',
    )
    try {
      const result = applyTarget117CcdSessionRatingTelemetrySourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      assertRecoveredSource(ts, packaged.sourceRoot)
      assert.equal(
        applyTarget117CcdSessionRatingTelemetrySourceRecovery({
          sourceRoot: packaged.sourceRoot,
        }).status,
        'already-recovered',
      )
    } finally {
      fs.rmSync(packaged.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 CCD rating replay rejects mixed state and local mutations before writing',
  { skip: !selected },
  () => {
    const mixed = materializeRawSource('target117-ccd-rating-mixed-')
    try {
      const printFilename = sourceFilename(
        mixed.sourceRoot,
        fixture.inputs.printFile.path,
      )
      const before = fs.readFileSync(printFilename)
      fs.writeFileSync(
        printFilename,
        before
          .toString('utf8')
          .replace(
            "import { setupVscodeSdkMcp } from 'src/services/mcp/vscodeSdkMcp.js'",
            "import { setupVscodeSdkMcp } from 'src/services/mcp/vscodeSdkMcp.js'\nimport { setupCcdSessionMcp } from 'src/services/mcp/ccdSessionMcp.js'",
          ),
      )
      const mutated = fs.readFileSync(printFilename)
      assert.throws(
        () =>
          applyTarget117CcdSessionRatingTelemetrySourceRecovery({
            sourceRoot: mixed.sourceRoot,
          }),
        /refusing mixed or non-target CCD setup state/,
      )
      assert.deepEqual(fs.readFileSync(printFilename), mutated)
      assert.equal(
        fs.existsSync(
          sourceFilename(mixed.sourceRoot, fixture.inputs.recoveredFile.path),
        ),
        false,
      )
    } finally {
      fs.rmSync(mixed.temporaryRoot, { recursive: true, force: true })
    }

    const contextMutation = materializeRawSource(
      'target117-ccd-rating-context-mutation-',
    )
    try {
      const contextFilename = sourceFilename(
        contextMutation.sourceRoot,
        fixture.inputs.schemaContextFile.path,
      )
      fs.appendFileSync(contextFilename, '\n// mutation\n')
      const printFilename = sourceFilename(
        contextMutation.sourceRoot,
        fixture.inputs.printFile.path,
      )
      const before = fs.readFileSync(printFilename)
      assert.throws(
        () =>
          applyTarget117CcdSessionRatingTelemetrySourceRecovery({
            sourceRoot: contextMutation.sourceRoot,
          }),
        /refusing non-target schema context/,
      )
      assert.deepEqual(fs.readFileSync(printFilename), before)
      assert.equal(
        fs.existsSync(
          sourceFilename(
            contextMutation.sourceRoot,
            fixture.inputs.recoveredFile.path,
          ),
        ),
        false,
      )
    } finally {
      fs.rmSync(contextMutation.temporaryRoot, {
        recursive: true,
        force: true,
      })
    }

    const moduleMutation = materializeRawSource(
      'target117-ccd-rating-module-mutation-',
    )
    try {
      applyTarget117CcdSessionRatingTelemetrySourceRecovery({
        sourceRoot: moduleMutation.sourceRoot,
      })
      const moduleFilename = sourceFilename(
        moduleMutation.sourceRoot,
        fixture.inputs.recoveredFile.path,
      )
      fs.appendFileSync(moduleFilename, '\n// mutation\n')
      const printFilename = sourceFilename(
        moduleMutation.sourceRoot,
        fixture.inputs.printFile.path,
      )
      const before = fs.readFileSync(printFilename)
      assert.throws(
        () =>
          applyTarget117CcdSessionRatingTelemetrySourceRecovery({
            sourceRoot: moduleMutation.sourceRoot,
          }),
        /expected absent or recovered/,
      )
      assert.deepEqual(fs.readFileSync(printFilename), before)
    } finally {
      fs.rmSync(moduleMutation.temporaryRoot, {
        recursive: true,
        force: true,
      })
    }
  },
)
