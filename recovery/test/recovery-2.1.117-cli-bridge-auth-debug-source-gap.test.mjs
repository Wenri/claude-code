import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from '../node_modules/acorn/dist/acorn.mjs'
import * as replayModule from '../cases/2.1.116-to-2.1.117/recovered/replay-cli-bridge-auth-debug-source-gap.mjs'

const {
  applyTarget117CliBridgeAuthDebugSourceRecovery,
  TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION,
  TARGET117_CLI_BRIDGE_AUTH_DEBUG_DEPENDENCY,
  TARGET117_CLI_BRIDGE_AUTH_DEBUG_EVIDENCE_IDS,
  TARGET117_CLI_BRIDGE_AUTH_DEBUG_OWNER_OVERRIDES,
} = replayModule

const require = createRequire(import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.116-to-2.1.117'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const packageSourceRoot = process.env.CLAUDE_CODE_2_1_117_SOURCE_ROOT
const fixturePath = fileURLToPath(
  new URL(
    './recovery-2.1.117-cli-bridge-auth-debug-source-gap.json',
    import.meta.url,
  ),
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '9453a188b838e4683991733ba44112f7b2c5f1f72380054fa46e12c12f93c111'

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function expectedDescriptor(expected) {
  return { bytes: expected.bytes, sha256: expected.sha256 }
}

function readExact(filename, expected, label = filename) {
  const bytes = fs.readFileSync(filename)
  assert.deepEqual(descriptor(bytes), expectedDescriptor(expected), label)
  return bytes
}

function exactSlice(bytes, expected, label) {
  const value = bytes.subarray(expected.start, expected.end)
  assert.deepEqual(descriptor(value), expectedDescriptor(expected), label)
  return value.toString('utf8')
}

function exactStringSlice(source, expected, label) {
  const value = source.slice(expected.start, expected.end)
  assert.deepEqual(
    descriptor(Buffer.from(value)),
    expectedDescriptor(expected),
    label,
  )
  return value
}

function artifactPath(environmentName, expected) {
  return path.resolve(
    process.env[environmentName] ?? path.join(repositoryRoot, expected.path),
  )
}

function walk(node, visit, parent = undefined, key = undefined) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      walk(node[index], visit, node, index)
    }
    return
  }
  if (typeof node.type === 'string') visit(node, parent, key)
  for (const [childKey, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) {
      walk(child, visit, node, childKey)
    }
  }
}

function propertyName(node) {
  return node.key?.name ?? node.key?.value
}

function parseUnit(bundle, expected, label) {
  const source = exactSlice(bundle, expected, label)
  const program = parse(source, { ecmaVersion: 'latest' })
  assert.equal(program.body.length, 1, `${label}: one top-level unit`)
  assert.equal(program.body[0].type, expected.nodeType)
  return { source, node: program.body[0] }
}

function canonicalUnit(source, { target }) {
  const program = parse(source, { ecmaVersion: 'latest' })
  const counts = {
    buildMetadataProperties: 0,
    debugBindingProperties: 0,
    debugSuffixCalls: 0,
    deadRespawnCases: 0,
  }
  walk(program, (candidate, parent, key) => {
    if (
      candidate.type === 'Property' &&
      !candidate.computed &&
      ['VERSION', 'BUILD_TIME', 'GIT_SHA'].includes(propertyName(candidate))
    ) {
      assert.equal(candidate.value.type, 'Literal')
      assert.equal(typeof candidate.value.value, 'string')
      candidate.value.value = '<BUILD>'
      counts.buildMetadataProperties += 1
    }
    if (target && candidate.type === 'ObjectPattern') {
      const before = candidate.properties.length
      candidate.properties = candidate.properties.filter(
        property => propertyName(property) !== 'getBridgeAuthDebugInfo',
      )
      counts.debugBindingProperties += before - candidate.properties.length
    }
    if (
      target &&
      candidate.type === 'BinaryExpression' &&
      candidate.operator === '+' &&
      candidate.right?.type === 'CallExpression' &&
      candidate.right.callee?.type === 'Identifier' &&
      candidate.right.callee.name === 'Y' &&
      candidate.right.arguments.length === 0
    ) {
      parent[key] = candidate.left
      counts.debugSuffixCalls += 1
    }
    if (target && candidate.type === 'SwitchStatement') {
      const before = candidate.cases.length
      candidate.cases = candidate.cases.filter(
        branch => branch.test?.value !== 'respawn',
      )
      counts.deadRespawnCases += before - candidate.cases.length
    }
  })

  function canonicalize(value, parent = undefined, key = undefined) {
    if (Array.isArray(value)) {
      return value.map((child, index) => canonicalize(child, value, index))
    }
    if (value === null || typeof value !== 'object') return value
    const result = {}
    for (const [childKey, child] of Object.entries(value)) {
      if (['end', 'loc', 'range', 'raw', 'start'].includes(childKey)) continue
      if (value.type === 'Identifier' && childKey === 'name') {
        const retain =
          (parent?.type === 'Property' && key === 'key' && !parent.computed) ||
          (parent?.type === 'MemberExpression' &&
            key === 'property' &&
            !parent.computed) ||
          (parent?.type === 'MethodDefinition' &&
            key === 'key' &&
            !parent.computed)
        result[childKey] = retain ? child : '@id'
      } else {
        result[childKey] = canonicalize(child, value, childKey)
      }
    }
    return result
  }

  const normalized = JSON.stringify(canonicalize(program))
  return { counts, normalized, ...descriptor(normalized) }
}

function tupleDescriptor(rows) {
  const mapped = rows.map(row => row.slice(0, 7))
  return { rows: mapped.length, ...descriptor(JSON.stringify(mapped)) }
}

function typescript() {
  return require(
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  )
}

function parseSource(filename, bytes) {
  const source = bytes.toString('utf8')
  const ts = typescript()
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${filename}: parses`)
  return { ts, source, sourceFile }
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

function declaration(parsed, name) {
  const matches = descendants(
    parsed.ts,
    parsed.sourceFile,
    node => node.name && parsed.ts.isIdentifier(node.name) && node.name.text === name,
  )
  assert.equal(matches.length, 1, `${name}: one declaration`)
  return matches[0]
}

function gitBytes(commit, sourcePath) {
  return execFileSync('git', ['show', `${commit}:${sourcePath}`], {
    cwd: repositoryRoot,
  })
}

function sourceFilename(root, sourcePath) {
  const resolvedRoot = path.resolve(root)
  const filename = path.resolve(resolvedRoot, sourcePath.slice(4))
  assert.ok(filename.startsWith(`${resolvedRoot}${path.sep}`))
  return filename
}

function materializeSourcePair(cliBytes, dependencyBytes, prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const sourceRoot = path.join(temporaryRoot, 'src')
  for (const [sourcePath, bytes] of [
    [fixture.sourceReplay.cli.path, cliBytes],
    [fixture.sourceReplay.dependency.path, dependencyBytes],
  ]) {
    const filename = sourceFilename(sourceRoot, sourcePath)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, bytes)
  }
  return { temporaryRoot, sourceRoot }
}

function assertRecoveredSource(cliBytes, dependencyBytes) {
  const cliExpected = fixture.sourceReplay.cli
  const dependencyExpected = fixture.sourceReplay.dependency
  assert.deepEqual(descriptor(cliBytes), expectedDescriptor(cliExpected.output))
  assert.deepEqual(descriptor(dependencyBytes), expectedDescriptor(dependencyExpected))

  const cli = parseSource(cliExpected.path, cliBytes)
  assert.equal(cli.source.length, cliExpected.output.chars)
  const main = declaration(cli, 'main')
  assert.deepEqual(
    [main.getStart(cli.sourceFile), main.end],
    [cliExpected.outputMain.start, cliExpected.outputMain.end],
  )
  exactStringSlice(cli.source, cliExpected.outputMain, 'recovered main')
  for (const anchor of cliExpected.outputAnchors) {
    exactStringSlice(cli.source, anchor, `recovered ${anchor.kind}`)
  }

  const debugCalls = descendants(
    cli.ts,
    main,
    node =>
      cli.ts.isCallExpression(node) &&
      node.expression.getText(cli.sourceFile) === 'getBridgeAuthDebugInfo',
  )
  assert.equal(debugCalls.length, 2, 'two bridge diagnostic suffix calls')
  for (const call of debugCalls) {
    assert.ok(cli.ts.isBinaryExpression(call.parent))
    assert.equal(call.parent.operatorToken.kind, cli.ts.SyntaxKind.PlusToken)
    assert.ok(cli.ts.isCallExpression(call.parent.parent))
    assert.equal(
      call.parent.parent.expression.getText(cli.sourceFile),
      'exitWithError',
    )
  }
  const binding = descendants(
    cli.ts,
    main,
    node =>
      cli.ts.isBindingElement(node) &&
      node.name.getText(cli.sourceFile) === 'getBridgeAuthDebugInfo',
  )
  assert.equal(binding.length, 1, 'one dynamic-import binding')

  const dependency = parseSource(dependencyExpected.path, dependencyBytes)
  assert.equal(dependency.source.length, dependencyExpected.chars)
  const helper = declaration(dependency, dependencyExpected.declaration.name)
  assert.equal(
    dependency.ts.SyntaxKind[helper.kind],
    dependencyExpected.declaration.nodeType,
  )
  assert.deepEqual(
    [helper.getStart(dependency.sourceFile), helper.end],
    [dependencyExpected.declaration.start, dependencyExpected.declaration.end],
  )
  exactStringSlice(
    dependency.source,
    dependencyExpected.declaration,
    'getBridgeAuthDebugInfo declaration',
  )
  assert.ok(
    helper.modifiers?.some(
      modifier => modifier.kind === dependency.ts.SyntaxKind.ExportKeyword,
    ),
    'dependency helper is exported',
  )
}

test(
  '2.1.117 CLI bridge-auth fixture pins one replay and one complete paired unit',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.deepEqual(fixture.summary, {
      units: 1,
      strictResidues: 10,
      sourceReplayResidues: 1,
      buildMetadataResidues: 9,
      deadDceRows: 1,
      recoveredFiles: 1,
      authenticatedDependencies: 1,
      ownerOverrides: 1,
    })
    readExact(
      path.join(repositoryRoot, fixture.ownerOverride.path),
      fixture.ownerOverride,
      'replay helper',
    )
    assert.deepEqual(
      TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION,
      {
        input: {
          path: fixture.sourceReplay.cli.path,
          ...expectedDescriptor(fixture.sourceReplay.cli.input),
        },
        output: {
          path: fixture.sourceReplay.cli.path,
          ...expectedDescriptor(fixture.sourceReplay.cli.output),
        },
      },
    )
    assert.deepEqual(TARGET117_CLI_BRIDGE_AUTH_DEBUG_DEPENDENCY, {
      path: fixture.sourceReplay.dependency.path,
      ...expectedDescriptor(fixture.sourceReplay.dependency),
    })
    assert.deepEqual(
      TARGET117_CLI_BRIDGE_AUTH_DEBUG_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(TARGET117_CLI_BRIDGE_AUTH_DEBUG_OWNER_OVERRIDES, [
      {
        key: `${caseName}:20797`,
        targetIndex: 20797,
        paths: [
          fixture.sourceReplay.cli.path,
          fixture.sourceReplay.dependency.path,
        ],
        declarations: ['main', 'getBridgeAuthDebugInfo'],
        evidenceIds: fixture.evidenceIds,
        behavior:
          TARGET117_CLI_BRIDGE_AUTH_DEBUG_OWNER_OVERRIDES[0].behavior,
      },
    ])
    assert.deepEqual(Object.keys(replayModule).sort(), [
      'TARGET117_CLI_BRIDGE_AUTH_DEBUG_CLI_TRANSITION',
      'TARGET117_CLI_BRIDGE_AUTH_DEBUG_DEPENDENCY',
      'TARGET117_CLI_BRIDGE_AUTH_DEBUG_EVIDENCE_IDS',
      'TARGET117_CLI_BRIDGE_AUTH_DEBUG_OWNER_OVERRIDES',
      'applyTarget117CliBridgeAuthDebugSourceRecovery',
    ])
    assert.match(fixture.classification, /compile-closed bounded source gap/)
    assert.match(fixture.classification, /dead switch label under if\(!1\)/)
    assert.equal(
      fixture.ownerResidues.rows.filter(row => row[7]).length,
      fixture.ownerResidues.strictRows,
    )
    assert.deepEqual(
      tupleDescriptor(fixture.ownerResidues.rows),
      fixture.ownerResidues.tupleDigests.addedOwnerRows,
    )
    assert.deepEqual(
      tupleDescriptor(fixture.ownerResidues.rows.filter(row => row[7])),
      fixture.ownerResidues.tupleDigests.strictRows,
    )
  },
)

test(
  'authenticated Target116/117 CLI units differ only by the proven replay, metadata, and dead DCE',
  { skip: !selected },
  () => {
    const baselineBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_116_INNER_BUNDLE', fixture.baselineBundle),
      fixture.baselineBundle,
      'Target116 inner bundle',
    )
    const targetBundle = readExact(
      artifactPath('CLAUDE_CODE_2_1_117_INNER_BUNDLE', fixture.targetBundle),
      fixture.targetBundle,
      'Target117 inner bundle',
    )
    const ledger = JSON.parse(
      gunzipSync(
        readExact(
          path.join(repositoryRoot, fixture.structuralLedger.path),
          fixture.structuralLedger,
          'structural ledger',
        ),
      ),
    )
    const targetLedger = ledger.unresolvedTarget.find(
      row => row.target.index === fixture.targetUnit.targetIndex,
    )
    assert.ok(targetLedger)
    assert.deepEqual(
      {
        classification: targetLedger.classification,
        baselineUnitIndex: targetLedger.baselineUnitIndex ?? null,
        nodeType: targetLedger.target.nodeType,
        start: targetLedger.target.start,
        end: targetLedger.target.end,
        tokenCount: targetLedger.target.tokenCount,
        topDefinitionCount: targetLedger.target.topDefinitionCount,
        unknownFreeIdentifierCount: targetLedger.unknownFreeIdentifierCount,
        sha256: targetLedger.target.sourceHash,
        coarseHash: targetLedger.target.coarseHash,
      },
      {
        classification: fixture.targetUnit.classification,
        baselineUnitIndex: fixture.targetUnit.baselineUnitIndex,
        nodeType: fixture.targetUnit.nodeType,
        start: fixture.targetUnit.start,
        end: fixture.targetUnit.end,
        tokenCount: fixture.targetUnit.tokenCount,
        topDefinitionCount: fixture.targetUnit.topDefinitionCount,
        unknownFreeIdentifierCount: fixture.targetUnit.unknownFreeIdentifierCount,
        sha256: fixture.targetUnit.sha256,
        coarseHash: fixture.targetUnit.coarseHash,
      },
    )
    const baselineLedger = ledger.unmatchedBaseline.find(
      row => row.index === fixture.baselineUnit.baselineIndex,
    )
    assert.ok(baselineLedger)
    assert.deepEqual(
      {
        nodeType: baselineLedger.nodeType,
        start: baselineLedger.start,
        end: baselineLedger.end,
        tokenCount: baselineLedger.tokenCount,
        topDefinitionCount: baselineLedger.topDefinitionCount,
        sha256: baselineLedger.sourceHash,
        coarseHash: baselineLedger.coarseHash,
      },
      {
        nodeType: fixture.baselineUnit.nodeType,
        start: fixture.baselineUnit.start,
        end: fixture.baselineUnit.end,
        tokenCount: fixture.baselineUnit.tokenCount,
        topDefinitionCount: fixture.baselineUnit.topDefinitionCount,
        sha256: fixture.baselineUnit.sha256,
        coarseHash: fixture.baselineUnit.coarseHash,
      },
    )

    const baseline = parseUnit(
      baselineBundle,
      fixture.baselineUnit,
      'Target116 CLI unit',
    )
    const target = parseUnit(
      targetBundle,
      fixture.targetUnit,
      'Target117 CLI unit',
    )
    for (const row of fixture.ownerResidues.rows) {
      const expected = {
        start: row[2],
        end: row[3],
        bytes: row[3] - row[2],
        sha256: sha256(targetBundle.subarray(row[2], row[3])),
      }
      const raw = exactSlice(targetBundle, expected, `${row[1]} row`)
      assert.equal(row[0] === 'string' ? JSON.parse(raw) : raw, row[1])
    }
    exactSlice(
      targetBundle,
      fixture.pairedWholeUnitProof.targetDebugBinding,
      'target debug binding',
    )
    for (const expected of fixture.pairedWholeUnitProof.targetExitCalls) {
      exactSlice(targetBundle, expected, 'target bridge error call')
    }
    exactSlice(
      targetBundle,
      fixture.pairedWholeUnitProof.targetDeadRespawnCase,
      'target dead respawn case',
    )

    const normalizedBaseline = canonicalUnit(baseline.source, { target: false })
    const normalizedTarget = canonicalUnit(target.source, { target: true })
    assert.deepEqual(
      normalizedBaseline.counts,
      fixture.pairedWholeUnitProof.baselineTransformCounts,
    )
    assert.deepEqual(
      normalizedTarget.counts,
      fixture.pairedWholeUnitProof.targetTransformCounts,
    )
    assert.equal(normalizedBaseline.normalized, normalizedTarget.normalized)
    assert.deepEqual(
      { bytes: normalizedTarget.bytes, sha256: normalizedTarget.sha256 },
      {
        bytes: fixture.pairedWholeUnitProof.canonicalBytes,
        sha256: fixture.pairedWholeUnitProof.canonicalSha256,
      },
    )
  },
)

test(
  'raw Target117 source replays exactly and is idempotent against its retained dependency',
  { skip: !selected },
  () => {
    assert.equal(
      execFileSync('git', ['rev-parse', `${fixture.sourceReplay.commit}^{tree}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      }).trim(),
      fixture.sourceReplay.tree,
    )
    for (const expected of [
      fixture.sourceReplay.cli,
      fixture.sourceReplay.dependency,
    ]) {
      const line = execFileSync(
        'git',
        ['ls-tree', fixture.sourceReplay.commit, expected.path],
        { cwd: repositoryRoot, encoding: 'utf8' },
      ).trim()
      assert.equal(line.split(/\s+/)[2], expected.blob)
    }
    const rawCli = gitBytes(
      fixture.sourceReplay.commit,
      fixture.sourceReplay.cli.path,
    )
    const dependency = gitBytes(
      fixture.sourceReplay.commit,
      fixture.sourceReplay.dependency.path,
    )
    assert.deepEqual(
      descriptor(rawCli),
      expectedDescriptor(fixture.sourceReplay.cli.input),
    )
    assert.deepEqual(
      descriptor(dependency),
      expectedDescriptor(fixture.sourceReplay.dependency),
    )
    const rawSource = rawCli.toString('utf8')
    assert.equal(rawSource.length, fixture.sourceReplay.cli.input.chars)
    exactStringSlice(rawSource, fixture.sourceReplay.cli.inputMain, 'raw main')
    for (const anchor of fixture.sourceReplay.cli.inputAnchors) {
      exactStringSlice(rawSource, anchor, `raw ${anchor.kind}`)
    }

    const temporary = materializeSourcePair(
      rawCli,
      dependency,
      'target117-cli-bridge-auth-raw.',
    )
    try {
      const first = applyTarget117CliBridgeAuthDebugSourceRecovery({
        sourceRoot: temporary.sourceRoot,
      })
      assert.equal(first.status, 'recovered')
      const second = applyTarget117CliBridgeAuthDebugSourceRecovery({
        sourceRoot: temporary.sourceRoot,
      })
      assert.equal(second.status, 'already-recovered')
      const outputCli = fs.readFileSync(
        sourceFilename(temporary.sourceRoot, fixture.sourceReplay.cli.path),
      )
      const outputDependency = fs.readFileSync(
        sourceFilename(
          temporary.sourceRoot,
          fixture.sourceReplay.dependency.path,
        ),
      )
      assertRecoveredSource(outputCli, outputDependency)
    } finally {
      fs.rmSync(temporary.temporaryRoot, { recursive: true, force: true })
    }
  },
)

test(
  'packaged Target117 source accepts raw or exact postimage and every drift fails before write',
  { skip: !selected || !packageSourceRoot },
  () => {
    const packageCli = readExact(
      sourceFilename(packageSourceRoot, fixture.sourceReplay.cli.path),
      [fixture.sourceReplay.cli.input, fixture.sourceReplay.cli.output].find(
        expected => {
          const bytes = fs.readFileSync(
            sourceFilename(packageSourceRoot, fixture.sourceReplay.cli.path),
          )
          return descriptor(bytes).sha256 === expected.sha256
        },
      ),
      'packaged cli.tsx',
    )
    const packageDependency = readExact(
      sourceFilename(packageSourceRoot, fixture.sourceReplay.dependency.path),
      fixture.sourceReplay.dependency,
      'packaged bridgeEnabled.ts',
    )
    const clean = materializeSourcePair(
      packageCli,
      packageDependency,
      'target117-cli-bridge-auth-package.',
    )
    try {
      const result = applyTarget117CliBridgeAuthDebugSourceRecovery({
        sourceRoot: clean.sourceRoot,
      })
      assert.ok(['recovered', 'already-recovered'].includes(result.status))
      assertRecoveredSource(
        fs.readFileSync(
          sourceFilename(clean.sourceRoot, fixture.sourceReplay.cli.path),
        ),
        fs.readFileSync(
          sourceFilename(clean.sourceRoot, fixture.sourceReplay.dependency.path),
        ),
      )
    } finally {
      fs.rmSync(clean.temporaryRoot, { recursive: true, force: true })
    }

    const rawCli = gitBytes(
      fixture.sourceReplay.commit,
      fixture.sourceReplay.cli.path,
    )
    const rawDependency = gitBytes(
      fixture.sourceReplay.commit,
      fixture.sourceReplay.dependency.path,
    )
    for (const mutation of ['cli-drift', 'dependency-drift', 'dependency-symlink']) {
      const candidate = materializeSourcePair(
        rawCli,
        rawDependency,
        `target117-cli-bridge-auth-${mutation}.`,
      )
      const cliFilename = sourceFilename(
        candidate.sourceRoot,
        fixture.sourceReplay.cli.path,
      )
      const dependencyFilename = sourceFilename(
        candidate.sourceRoot,
        fixture.sourceReplay.dependency.path,
      )
      try {
        if (mutation === 'cli-drift') fs.appendFileSync(cliFilename, ' ')
        if (mutation === 'dependency-drift') {
          fs.appendFileSync(dependencyFilename, ' ')
        }
        if (mutation === 'dependency-symlink') {
          const realDependency = `${dependencyFilename}.real`
          fs.renameSync(dependencyFilename, realDependency)
          fs.symlinkSync(realDependency, dependencyFilename)
        }
        const beforeCli = fs.readFileSync(cliFilename)
        assert.throws(
          () =>
            applyTarget117CliBridgeAuthDebugSourceRecovery({
              sourceRoot: candidate.sourceRoot,
            }),
          /expected a real source file|expected 10168|Refusing to recover/,
        )
        assert.deepEqual(fs.readFileSync(cliFilename), beforeCli)
      } finally {
        fs.rmSync(candidate.temporaryRoot, { recursive: true, force: true })
      }
    }
  },
)
