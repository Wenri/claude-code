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
  applyTarget117AnthropicApiIdleTimeoutSourceRecovery,
  TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_HISTORICAL_INPUT_FILE,
  TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_INPUT_FILE,
  TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_OUTPUT_FILE,
  TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_RAW_OUTPUT_FILE,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-anthropic-api-idle-timeout-source-gap.mjs'
import {
  applyTarget117HistoricalOwnerSourceGapRecovery,
  TARGET117_HISTORICAL_GAP_INPUT_FILES,
} from '../cases/2.1.116-to-2.1.117/recovered/replay-historical-owner-source-gaps.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-anthropic-api-idle-timeout-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = 'ac28053f6a1bdc3729bd38b7b8d063dcb5cc4c7e5d449000a13e5aad749cbdc5'
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

function sourceFilename(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const filename = path.resolve(
    root,
    fixture.inputs.sourceFile.path.slice(4),
  )
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  return filename
}

function materializeRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  const bytes = execFileSync(
    'git',
    [
      'show',
      `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`,
    ],
    { cwd: repositoryRoot },
  )
  assert.deepEqual(descriptor(bytes), fixture.inputs.sourceFile.input)
  const filename = sourceFilename(sourceRoot)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, bytes)
  return { temporaryRoot, sourceRoot }
}

function materializeFullRawSource(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const input of TARGET117_HISTORICAL_GAP_INPUT_FILES) {
    const bytes = execFileSync(
      'git',
      ['show', `${fixture.inputs.rawTargetSourceCommit}:${input.path}`],
      { cwd: repositoryRoot },
    )
    assert.deepEqual(descriptor(bytes), {
      bytes: input.bytes,
      sha256: input.sha256,
    })
    const filename = path.join(sourceRoot, input.path.slice(4))
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, bytes)
  }
  return { temporaryRoot, sourceRoot }
}

function copyPackagedSource(sourceRoot, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const outputRoot = path.join(temporaryRoot, 'src')
  const destination = sourceFilename(outputRoot)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(sourceFilename(sourceRoot), destination)
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

function propertyOccurrences(source, value) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = []
  walk(ast, node => {
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
    if (key?.type === 'Identifier' && key.name === value) {
      occurrences.push({ start: key.start, end: key.end })
    }
  })
  occurrences.sort((left, right) => left.start - right.start)
  return occurrences
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

function exactDeclaration(ts, sourceFile, source, expected) {
  const matches = descendants(
    ts,
    sourceFile,
    node => ts.isFunctionDeclaration(node) && node.name?.text === expected.name,
  )
  assert.equal(matches.length, 1, `${expected.name}: one declaration`)
  const declaration = matches[0]
  assert.equal(ts.SyntaxKind[declaration.kind], expected.nodeType)
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

function assertTargetUnit(ledger, expected) {
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

test(
  '2.1.117 Anthropic API idle-timeout fixture pins exact raw owner and replay',
  { skip: !selected },
  async () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      residues: 1,
      recoveredFiles: 1,
      ownerOverrides: 0,
      behaviorWitnessUnits: 1,
      acceptedPreimageStates: 2,
    })
    readExact(
      path.join(repositoryRoot, fixture.inputs.helper.path),
      fixture.inputs.helper,
      'case-owned helper',
    )
    assert.deepEqual(TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_INPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.input,
    })
    assert.deepEqual(TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.output,
    })
    assert.deepEqual(
      TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_HISTORICAL_INPUT_FILE,
      {
        path: fixture.inputs.sourceFile.path,
        ...fixture.inputs.sourceFile.historicalInput,
      },
    )
    assert.deepEqual(TARGET117_ANTHROPIC_API_IDLE_TIMEOUT_RAW_OUTPUT_FILE, {
      path: fixture.inputs.sourceFile.path,
      ...fixture.inputs.sourceFile.rawOutput,
    })
    assert.deepEqual(fixture.inputs.requiredReplayOrder, [
      'applyTarget117HistoricalOwnerSourceGapRecovery',
      'applyTarget117AnthropicApiIdleTimeoutSourceRecovery',
    ])

    const revision =
      `${fixture.inputs.rawTargetSourceCommit}:${fixture.inputs.sourceFile.path}`
    assert.equal(
      execFileSync('git', ['rev-parse', revision], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      fixture.inputs.sourceFile.blob,
    )
    const raw = execFileSync('git', ['show', revision], {
      cwd: repositoryRoot,
    })
    assert.deepEqual(descriptor(raw), fixture.inputs.sourceFile.input)
    const source = raw.toString('utf8')
    const ts = await loadTypeScript()
    const sourceFile = parseSource(ts, fixture.inputs.sourceFile.path, source)
    const declaration = exactDeclaration(
      ts,
      sourceFile,
      source,
      fixture.inputs.sourceFile.inputDeclaration,
    )
    assert.equal(
      descendants(
        ts,
        declaration,
        node =>
          ts.isPropertyAccessExpression(node) &&
          node.name.text === fixture.row.residue[1],
      ).length,
      0,
    )
    assert.equal(
      descendants(
        ts,
        declaration,
        node =>
          ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === 'timeout',
      ).length,
      0,
    )
  },
)

test(
  '2.1.117 bundles authenticate baseline timeout behavior and the exact Target117 force-idle guard',
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

    const [
      baselineIndex,
      ,
      baselineNodeType,
      baselineStart,
      baselineEnd,
      baselineTokens,
      baselineHash,
      baselineCoarseHash,
    ] = fixture.baselineWitness.baselineUnit
    const baselineEntry = ledger.unmatchedBaseline.find(
      entry => entry.index === baselineIndex,
    )
    assert.deepEqual(
      [
        baselineEntry.index,
        baselineEntry.nodeType,
        baselineEntry.start,
        baselineEntry.end,
        baselineEntry.tokenCount,
        baselineEntry.sourceHash,
        baselineEntry.coarseHash,
      ],
      [
        baselineIndex,
        baselineNodeType,
        baselineStart,
        baselineEnd,
        baselineTokens,
        baselineHash,
        baselineCoarseHash,
      ],
    )
    const baselineUnit = Buffer.from(
      baseline.slice(baselineStart, baselineEnd),
    )
    assert.deepEqual(descriptor(baselineUnit), {
      bytes: baselineEnd - baselineStart,
      sha256: baselineHash,
    })
    assert.equal(
      baselineUnit.toString('utf8'),
      fixture.baselineWitness.exactSource,
    )

    assertTargetUnit(ledger, fixture.row.targetUnit)
    const [, , , start, end, , targetHash] = fixture.row.targetUnit
    const targetUnit = Buffer.from(target.slice(start, end))
    assert.deepEqual(descriptor(targetUnit), {
      bytes: end - start,
      sha256: targetHash,
    })
    assert.equal(targetUnit.toString('utf8'), fixture.row.exactSource)

    const [, value, residueStart, residueEnd, occurrence, baselineCount] =
      fixture.row.residue
    const baselineOccurrences = propertyOccurrences(baseline, value)
    const targetOccurrences = propertyOccurrences(target, value)
    assert.equal(baselineOccurrences.length, baselineCount)
    assert.equal(targetOccurrences.length, baselineCount + 1)
    assert.deepEqual(targetOccurrences[occurrence - 1], {
      start: residueStart,
      end: residueEnd,
    })
    assert.equal(target.slice(residueStart, residueEnd), value)
    assert.ok(residueStart >= start && residueEnd <= end)

    for (const [source, hasForceGuard] of [
      [baselineUnit.toString('utf8'), false],
      [targetUnit.toString('utf8'), true],
    ]) {
      const ast = parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'script',
      })
      const declaration = ast.body[0]
      const base = declaration.body.body[0].declarations[0].init
      assert.equal(base.type, 'ObjectExpression')
      assert.equal(base.properties.length, 2)
      assert.ok(base.properties.every(property => property.type === 'SpreadElement'))
      const timeoutAssignments = []
      const forceProperties = []
      walk(base.properties[1], node => {
        if (
          node.type === 'Property' &&
          node.key?.name === 'timeout' &&
          node.value?.type === 'UnaryExpression' &&
          node.value.operator === '!' &&
          node.value.argument?.value === 1
        ) {
          timeoutAssignments.push(node)
        }
        if (
          node.type === 'MemberExpression' &&
          node.property?.name === 'API_FORCE_IDLE_TIMEOUT'
        ) {
          forceProperties.push(node)
        }
      })
      assert.equal(timeoutAssignments.length, 1)
      assert.equal(forceProperties.length, hasForceGuard ? 1 : 0)
      if (hasForceGuard) {
        assert.equal(forceProperties[0].object.property.name, 'env')
        assert.equal(forceProperties[0].object.object.name, 'process')
      }
    }
  },
)

test(
  '2.1.117 Anthropic API idle-timeout replay is dual-state, typed, and executable',
  { skip: !selected },
  async () => {
    const raw = materializeRawSource('target117-api-idle-timeout-raw-')
    try {
      assert.equal(
        applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'recovered',
      )
      assert.equal(
        applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
          sourceRoot: raw.sourceRoot,
        }).status,
        'already-recovered',
      )
      const bytes = readExact(
        sourceFilename(raw.sourceRoot),
        fixture.inputs.sourceFile.rawOutput,
        'recovered proxy.ts',
      )
      const source = bytes.toString('utf8')
      const ts = await loadTypeScript()
      const sourceFile = parseSource(ts, fixture.inputs.sourceFile.path, source)
      const declaration = exactDeclaration(
        ts,
        sourceFile,
        source,
        fixture.inputs.sourceFile.rawOutputDeclaration,
      )

      assert.ok(ts.isTypeLiteralNode(declaration.type))
      const returnMembers = Object.fromEntries(
        declaration.type.members.map(member => [
          member.name?.getText(sourceFile),
          {
            optional: member.questionToken !== undefined,
            type: member.type?.getText(sourceFile),
          },
        ]),
      )
      assert.deepEqual(returnMembers.keepalive, { optional: true, type: 'false' })
      assert.deepEqual(returnMembers.timeout, { optional: true, type: 'false' })

      const baseDeclarations = descendants(
        ts,
        declaration,
        node => ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'base',
      )
      assert.equal(baseDeclarations.length, 1)
      assert.ok(ts.isObjectLiteralExpression(baseDeclarations[0].initializer))
      const spreads = baseDeclarations[0].initializer.properties.filter(
        ts.isSpreadAssignment,
      )
      assert.equal(spreads.length, 2)
      assert.match(
        spreads[1].expression.getText(sourceFile),
        /opts\?\.forAnthropicAPI[\s\S]*typeof Bun !== 'undefined'[\s\S]*!isEnvTruthy\(process\.env\.API_FORCE_IDLE_TIMEOUT\)[\s\S]*timeout: false as const/,
      )

      const declarationSource = declaration
        .getText(sourceFile)
        .replace(/^export\s+/, '')
      const javascript = ts.transpileModule(declarationSource, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
      function buildGetProxyFetchOptions({
        bun,
        env = {},
        keepAliveDisabled = false,
      } = {}) {
        return Function(
          'keepAliveDisabled',
          'Bun',
          'process',
          'isEnvTruthy',
          'getProxyUrl',
          'shouldBypassProxy',
          'getTLSFetchOptions',
          'getProxyAgent',
          `${javascript}\nreturn getProxyFetchOptions`,
        )(
          keepAliveDisabled,
          bun,
          { env },
          value => ['1', 'true', 'yes'].includes(String(value).toLowerCase()),
          () => undefined,
          () => false,
          () => ({}),
          () => ({ dispatcher: true }),
        )
      }

      assert.deepEqual(
        buildGetProxyFetchOptions({ bun: {} })({ forAnthropicAPI: true }),
        { timeout: false },
      )
      assert.deepEqual(
        buildGetProxyFetchOptions({
          bun: {},
          env: { API_FORCE_IDLE_TIMEOUT: '1' },
        })({ forAnthropicAPI: true }),
        {},
      )
      assert.deepEqual(buildGetProxyFetchOptions({ bun: {} })({}), {})
      assert.deepEqual(
        buildGetProxyFetchOptions({ bun: undefined })({
          forAnthropicAPI: true,
        }),
        {},
      )
      assert.deepEqual(
        buildGetProxyFetchOptions({
          bun: {},
          keepAliveDisabled: true,
        })({ forAnthropicAPI: true }),
        { keepalive: false, timeout: false },
      )
      assert.deepEqual(
        buildGetProxyFetchOptions({
          bun: {},
          env: { ANTHROPIC_UNIX_SOCKET: '/tmp/anthropic.sock' },
        })({ forAnthropicAPI: true }),
        { timeout: false, unix: '/tmp/anthropic.sock' },
      )
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
      'target117-api-idle-timeout-packaged-',
    )
    try {
      const before = descriptor(fs.readFileSync(sourceFilename(packaged.sourceRoot)))
      const result = applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
        sourceRoot: packaged.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      const rawStates = [
        fixture.inputs.sourceFile.input.sha256,
        fixture.inputs.sourceFile.rawOutput.sha256,
      ]
      const expected = rawStates.includes(before.sha256)
        ? fixture.inputs.sourceFile.rawOutput
        : fixture.inputs.sourceFile.output
      readExact(
        sourceFilename(packaged.sourceRoot),
        expected,
      )
      assert.equal(
        applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
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
  '2.1.117 idle-timeout replay composes fail-closed after historical-owner recovery',
  { skip: !selected },
  async () => {
    const ordered = materializeFullRawSource(
      'target117-api-idle-timeout-ordered-',
    )
    const reversed = materializeFullRawSource(
      'target117-api-idle-timeout-reversed-',
    )
    try {
      assert.equal(
        applyTarget117HistoricalOwnerSourceGapRecovery({
          sourceRoot: ordered.sourceRoot,
        }).status,
        'recovered',
      )
      const historicalBytes = readExact(
        sourceFilename(ordered.sourceRoot),
        fixture.inputs.sourceFile.historicalInput,
        'historical-owner proxy preimage',
      )
      const ts = await loadTypeScript()
      const historicalSource = historicalBytes.toString('utf8')
      exactDeclaration(
        ts,
        parseSource(ts, fixture.inputs.sourceFile.path, historicalSource),
        historicalSource,
        fixture.inputs.sourceFile.historicalInputDeclaration,
      )

      const result = applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
        sourceRoot: ordered.sourceRoot,
      })
      assert.equal(result.status, 'recovered')
      assert.equal(result.sourceState, 'historical-owner-recovered')
      const combinedBytes = readExact(
        sourceFilename(ordered.sourceRoot),
        fixture.inputs.sourceFile.output,
        'combined proxy postimage',
      )
      const combinedSource = combinedBytes.toString('utf8')
      exactDeclaration(
        ts,
        parseSource(ts, fixture.inputs.sourceFile.path, combinedSource),
        combinedSource,
        fixture.inputs.sourceFile.outputDeclaration,
      )
      assert.equal(
        applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
          sourceRoot: ordered.sourceRoot,
        }).status,
        'already-recovered',
      )

      const direct = applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
        sourceRoot: reversed.sourceRoot,
      })
      assert.equal(direct.sourceState, 'raw')
      readExact(
        sourceFilename(reversed.sourceRoot),
        fixture.inputs.sourceFile.rawOutput,
        'raw-only idle postimage',
      )
      assert.throws(
        () =>
          applyTarget117HistoricalOwnerSourceGapRecovery({
            sourceRoot: reversed.sourceRoot,
          }),
        /src\/utils\/proxy\.ts: expected raw .* or recovered/,
      )
    } finally {
      fs.rmSync(ordered.temporaryRoot, { recursive: true, force: true })
      fs.rmSync(reversed.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  '2.1.117 Anthropic API idle-timeout replay rejects mutation before writing',
  { skip: !selected },
  () => {
    const mutated = materializeRawSource('target117-api-idle-timeout-mutated-')
    const historical = materializeFullRawSource(
      'target117-api-idle-timeout-mutated-historical-',
    )
    try {
      const filename = sourceFilename(mutated.sourceRoot)
      fs.appendFileSync(filename, '\n// mutation\n')
      const before = fs.readFileSync(filename)
      assert.throws(
        () =>
          applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
            sourceRoot: mutated.sourceRoot,
          }),
        /refusing non-target idle-timeout recovery/,
      )
      assert.deepEqual(fs.readFileSync(filename), before)

      applyTarget117HistoricalOwnerSourceGapRecovery({
        sourceRoot: historical.sourceRoot,
      })
      const historicalFilename = sourceFilename(historical.sourceRoot)
      fs.appendFileSync(historicalFilename, '\n// mutation\n')
      const historicalBefore = fs.readFileSync(historicalFilename)
      assert.throws(
        () =>
          applyTarget117AnthropicApiIdleTimeoutSourceRecovery({
            sourceRoot: historical.sourceRoot,
          }),
        /refusing non-target idle-timeout recovery/,
      )
      assert.deepEqual(
        fs.readFileSync(historicalFilename),
        historicalBefore,
      )
    } finally {
      fs.rmSync(mutated.temporaryRoot, { recursive: true, force: true })
      fs.rmSync(historical.temporaryRoot, { recursive: true, force: true })
    }
  },
)
