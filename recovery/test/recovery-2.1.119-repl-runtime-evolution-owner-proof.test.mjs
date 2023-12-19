import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { parse, tokenizer } from '../node_modules/acorn/dist/acorn.mjs'
import {
  TARGET119_REPL_PRO_TRIAL_INPUT_FILES,
  TARGET119_REPL_PRO_TRIAL_OUTPUT_FILES,
  applyTarget119ReplProTrialSourceRecovery,
  buildTarget119ReplProTrialOutputs,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-repl-scroll-reasons-pro-trial-source-gap.mjs'
import {
  TARGET119_REPL_RUNTIME_EVOLUTION_EVIDENCE_IDS,
  TARGET119_REPL_RUNTIME_EVOLUTION_OWNER_OVERRIDES,
} from '../cases/2.1.118-to-2.1.119/recovered/repl-runtime-evolution-owner-overrides.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const ts = require(
  path.join(
    root,
    '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
  ),
)
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const testPath =
  'recovery/test/recovery-2.1.119-repl-runtime-evolution-owner-proof.test.mjs'
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-repl-runtime-evolution-owner-proof.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  '950950c2ba084d5e56409a2c7602f9993e992e03c25207c735340d6b9c8244ae'
const configuredSourceRoot =
  process.env.CLAUDE_CODE_2_1_119_SOURCE_ROOT ??
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
const sourceRoot = configuredSourceRoot
  ? path.resolve(configuredSourceRoot)
  : path.join(root, '.recovery-tmp/semantic-trees/2.1.119/src')

const sha256 = value =>
  crypto.createHash('sha256').update(value).digest('hex')
const descriptor = value => ({
  bytes: Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value),
  sha256: sha256(value),
})
const canonicalDigest = value => sha256(Buffer.from(JSON.stringify(value)))

function partitionDescriptor(rows) {
  const bytes = Buffer.from(JSON.stringify(rows))
  return { rows: rows.length, jsonBytes: bytes.length, sha256: sha256(bytes) }
}

function selectArtifactPhase(typedAudit, sourceCoverage, sourceCoverageRaw) {
  const matches = fixture.artifactPhasePolicy.acceptedPairs.filter(
    pair =>
      pair.typedAudit.bytes === typedAudit.bytes &&
      pair.typedAudit.sha256 === typedAudit.sha256 &&
      pair.sourceCoverage.bytes === sourceCoverage.bytes &&
      pair.sourceCoverage.sha256 === sourceCoverage.sha256 &&
      pair.sourceCoverageRaw.bytes === sourceCoverageRaw.bytes &&
      pair.sourceCoverageRaw.sha256 === sourceCoverageRaw.sha256,
  )
  assert.equal(matches.length, 1, 'unknown or hybrid report/coverage pair')
  return matches[0]
}

function coverageTuple(row) {
  return [
    row.targetIndex,
    row.start,
    row.end,
    row.nodeType,
    row.sourceHash,
    row.structuralClass,
    row.disposition,
    row.ownerIds,
    row.evidenceIds,
    row.behavior,
  ]
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function sourceFilename(base, sourcePath) {
  return path.join(base, sourcePath.slice('src/'.length))
}

function findRegion(ledger, targetIndex) {
  return [...ledger.regions, ...(ledger.unresolvedTarget ?? [])].find(
    candidate => candidate.target.index === targetIndex,
  )
}

function assertRegion(ledger, expected) {
  const region = findRegion(ledger, expected.targetIndex)
  assert.ok(region, `u${expected.targetIndex}`)
  assert.deepEqual(
    {
      classification: region.classification,
      nodeType: region.target.nodeType,
      start: region.target.start,
      end: region.target.end,
      bytes: region.target.end - region.target.start,
      tokens: region.target.tokenCount,
      sha256: region.target.sourceHash,
      ...(expected.coarseHash
        ? { coarseHash: region.target.coarseHash }
        : {}),
      ...(expected.unknownFreeIdentifierCount !== undefined
        ? { unknownFreeIdentifierCount: region.unknownFreeIdentifierCount }
        : {}),
      ...(expected.baselineUnitIndex !== undefined
        ? { baselineUnitIndex: region.baselineUnitIndex }
        : {}),
    },
    {
      classification: expected.classification,
      nodeType: expected.nodeType,
      start: expected.start,
      end: expected.end,
      bytes: expected.bytes,
      tokens: expected.tokens,
      sha256: expected.sha256,
      ...(expected.coarseHash ? { coarseHash: expected.coarseHash } : {}),
      ...(expected.unknownFreeIdentifierCount !== undefined
        ? { unknownFreeIdentifierCount: expected.unknownFreeIdentifierCount }
        : {}),
      ...(expected.baselineUnitIndex !== undefined
        ? { baselineUnitIndex: expected.baselineUnitIndex }
        : {}),
    },
  )
  return region
}

function tokenValue(token) {
  if (token.type.label === 'name') return 'ID'
  if (token.type.label === 'num' || token.type.label === 'string') {
    return `${token.type.label}:${JSON.stringify(token.value)}`
  }
  if (token.type.label === 'regexp') {
    return `regexp:/${token.value.pattern}/${token.value.flags}`
  }
  return token.type.label
}

function normalizedTokens(value) {
  const tokens = []
  const stream = tokenizer(value.toString(), { ecmaVersion: 'latest' })
  while (true) {
    const token = stream.getToken()
    if (token.type.label === 'eof') break
    tokens.push(token)
  }
  return {
    tokens,
    text: `${tokens.map(tokenValue).join('\n')}\n`,
  }
}

function assertNormalizedTransition(baseline, target, expected, t, label) {
  const baselineNormalized = normalizedTokens(baseline)
  const targetNormalized = normalizedTokens(target)
  for (const [name, actual, pinned] of [
    ['baseline', baselineNormalized, expected.baseline],
    ['target', targetNormalized, expected.target],
  ]) {
    assert.equal(actual.tokens.length, pinned.tokens, `${label}:${name}`)
    assert.deepEqual(descriptor(actual.text), {
      bytes: pinned.bytes,
      sha256: pinned.sha256,
    })
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `${label}.`))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const baselinePath = path.join(temporary, 'baseline.tokens')
  const targetPath = path.join(temporary, 'target.tokens')
  fs.writeFileSync(baselinePath, baselineNormalized.text)
  fs.writeFileSync(targetPath, targetNormalized.text)
  const diff = spawnSync(
    'diff',
    ['--label', 'baseline', '--label', 'target', '-U1', baselinePath, targetPath],
    { encoding: 'utf8' },
  )
  assert.equal(diff.status, 1)
  assert.equal(diff.stderr, '')
  assert.deepEqual(descriptor(diff.stdout), {
    bytes: expected.diff.bytes,
    sha256: expected.diff.sha256,
  })
  assert.equal(diff.stdout.match(/^@@/gm)?.length, expected.diff.hunks)
  assert.equal(
    diff.stdout.match(/^\+[^+]/gm)?.length,
    expected.diff.addedTokenLines,
  )
  assert.equal(
    diff.stdout.match(/^-[^-]/gm)?.length,
    expected.diff.removedTokenLines,
  )
}

function canonicalResidue(row) {
  return [
    row.structural.index,
    row.literalKind,
    row.value,
    row.target.start,
    row.target.end,
    row.baselineOccurrenceCount,
    row.targetOccurrenceNumber,
  ]
}

function residueWithAdded(row) {
  return [...canonicalResidue(row), row.targetAdded]
}

function parseSource(sourcePath, source, scriptKind) {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, sourcePath)
  return sourceFile
}

function findNodes(sourceFile, predicate) {
  const matches = []
  const visit = node => {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return matches
}

function sourceNodeDescriptor(sourceFile, source, node) {
  const start = node.getStart(sourceFile)
  const end = node.end
  return {
    ...(node.name && ts.isIdentifier(node.name)
      ? { name: node.name.text }
      : {}),
    kind: ts.SyntaxKind[node.kind],
    start,
    end,
    ...descriptor(source.slice(start, end)),
  }
}

function variableStatement(sourceFile, name) {
  const matches = findNodes(
    sourceFile,
    node =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0].parent.parent
}

function currentGraph(base) {
  const inputs = Object.fromEntries(
    TARGET119_REPL_PRO_TRIAL_INPUT_FILES.map(input => {
      const value = fs.readFileSync(sourceFilename(base, input.path))
      return [input.path, value]
    }),
  )
  const actual = Object.fromEntries(
    Object.entries(inputs).map(([sourcePath, value]) => [
      sourcePath,
      descriptor(value),
    ]),
  )
  const allRaw = TARGET119_REPL_PRO_TRIAL_INPUT_FILES.every(input =>
    assertDescriptorEqual(actual[input.path], input),
  )
  const allRecovered = TARGET119_REPL_PRO_TRIAL_OUTPUT_FILES.every(output =>
    assertDescriptorEqual(actual[output.path], output),
  )
  assert.notEqual(allRaw, allRecovered, 'source graph must be exactly raw or recovered')
  return { values: inputs, allRaw, allRecovered }
}

function assertDescriptorEqual(left, right) {
  return left.bytes === right.bytes && left.sha256 === right.sha256
}

test(
  'Target119 REPL/pro-trial atomic fixture, helper, and overrides are frozen',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    readPinned(fixture.inputs.override)
    readPinned(fixture.inputs.helper)
    assert.deepEqual(
      TARGET119_REPL_RUNTIME_EVOLUTION_EVIDENCE_IDS,
      fixture.evidenceIds,
    )
    assert.deepEqual(
      TARGET119_REPL_RUNTIME_EVOLUTION_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      fixture.ownerOverrides.map(row => ({
        ...row,
        evidenceIds: fixture.evidenceIds,
      })),
    )
    assert.deepEqual(
      fixture.evidenceCatalog.map(item => item.id),
      fixture.evidenceIds,
    )
    assert.ok(fixture.evidenceCatalog.every(item => item.path === testPath))
    assert.ok(
      fixture.evidenceCatalog.every(item =>
        ['semantic-test', 'static-ast', 'target-fragment'].includes(item.kind),
      ),
    )
    assert.deepEqual(
      TARGET119_REPL_PRO_TRIAL_INPUT_FILES,
      fixture.sourceGraph.inputFiles.map(({ gitBlob: _gitBlob, ...item }) =>
        Object.freeze(item),
      ),
    )
    assert.deepEqual(
      TARGET119_REPL_PRO_TRIAL_OUTPUT_FILES,
      fixture.sourceGraph.outputFiles,
    )
    assert.equal(
      canonicalDigest(fixture.ownerOverrides.map(row => row.targetIndex)),
      fixture.summary.targetIndicesSha256,
    )
  },
)

test(
  'complete generated REPL, helper, and command transition close the runtime graph',
  { skip: !selected },
  t => {
    const ledger = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
    )
    assertRegion(ledger, fixture.replUnits.target)
    assertRegion(ledger, fixture.commandUnits.target)
    assertRegion(ledger, fixture.dependencyUnit)
    const baselineProof = JSON.parse(
      readPinned(fixture.inputs.baselineProofFixture),
    )
    assert.deepEqual(
      {
        targetIndex: baselineProof.targetUnit.targetIndex,
        nodeType: baselineProof.targetUnit.nodeType,
        start: baselineProof.targetUnit.start,
        end: baselineProof.targetUnit.end,
        bytes: baselineProof.targetUnit.bytes,
        tokens: baselineProof.targetUnit.tokens,
        sha256: baselineProof.targetUnit.sha256,
        coarseHash: baselineProof.targetUnit.coarseHash,
      },
      fixture.replUnits.baseline,
    )
    const baselineBundle = readPinned(fixture.inputs.baselineBundle)
    const targetBundle = readPinned(fixture.inputs.targetBundle)
    const baselineRepl = baselineBundle.subarray(
      fixture.replUnits.baseline.start,
      fixture.replUnits.baseline.end,
    )
    const targetRepl = targetBundle.subarray(
      fixture.replUnits.target.start,
      fixture.replUnits.target.end,
    )
    assert.deepEqual(descriptor(baselineRepl), {
      bytes: fixture.replUnits.baseline.bytes,
      sha256: fixture.replUnits.baseline.sha256,
    })
    assert.deepEqual(descriptor(targetRepl), {
      bytes: fixture.replUnits.target.bytes,
      sha256: fixture.replUnits.target.sha256,
    })
    assertNormalizedTransition(
      baselineRepl,
      targetRepl,
      fixture.replUnits.normalized,
      t,
      'target119-repl-transition',
    )
    const baselineCommand = baselineBundle.subarray(
      fixture.commandUnits.baseline.start,
      fixture.commandUnits.baseline.end,
    )
    const targetCommand = targetBundle.subarray(
      fixture.commandUnits.target.start,
      fixture.commandUnits.target.end,
    )
    assert.deepEqual(descriptor(baselineCommand), {
      bytes: fixture.commandUnits.baseline.bytes,
      sha256: fixture.commandUnits.baseline.sha256,
    })
    assert.deepEqual(descriptor(targetCommand), {
      bytes: fixture.commandUnits.target.bytes,
      sha256: fixture.commandUnits.target.sha256,
    })
    assertNormalizedTransition(
      baselineCommand,
      targetCommand,
      fixture.commandUnits.normalized,
      t,
      'target119-pro-trial-command-transition',
    )
    assert.equal(baselineCommand.toString().includes('return!1'), true)
    assert.equal(targetCommand.toString().includes('return!0'), true)

    const fragments = Object.values(fixture.targetSemanticFragments)
    for (const fragment of fragments) {
      const value = targetBundle.subarray(fragment.start, fragment.end)
      assert.deepEqual(descriptor(value), {
        bytes: fragment.bytes,
        sha256: fragment.sha256,
      })
      assert.equal(fragment.start >= fixture.replUnits.target.start, true)
      assert.equal(fragment.end <= fixture.replUnits.target.end, true)
    }
    for (const row of fixture.productionStrictResidues) {
      assert.equal(
        fragments.some(
          fragment => row[3] >= fragment.start && row[4] <= fragment.end,
        ),
        true,
        `${row[1]}:${row[2]}`,
      )
      const raw = targetBundle.subarray(row[3], row[4]).toString()
      assert.equal(
        row[1] === 'property'
          ? raw === row[2]
          : [row[2], JSON.stringify(row[2])].includes(raw) ||
              raw.replaceAll('\\u2192', '→') === row[2],
        true,
        `${row[1]}:${row[2]}:${raw}`,
      )
    }
  },
)

test(
  'raw or packaged source graph deterministically builds the exact replay postimages',
  { skip: !selected },
  () => {
    const graph = currentGraph(sourceRoot)
    const gitInputs = Object.fromEntries(
      fixture.sourceGraph.inputFiles.map(input => {
        const result = spawnSync(
          'git',
          ['show', `${fixture.sourceGraph.targetCommit}:${input.path}`],
          { cwd: root, encoding: null },
        )
        assert.equal(result.status, 0, result.stderr?.toString())
        assert.deepEqual(descriptor(result.stdout), {
          bytes: input.bytes,
          sha256: input.sha256,
        })
        const blob = spawnSync(
          'git',
          ['rev-parse', `${fixture.sourceGraph.targetCommit}:${input.path}`],
          { cwd: root, encoding: 'utf8' },
        )
        assert.equal(blob.status, 0)
        assert.equal(blob.stdout.trim(), input.gitBlob)
        return [input.path, result.stdout]
      }),
    )
    const built = buildTarget119ReplProTrialOutputs({
      replSource: gitInputs['src/screens/REPL.tsx'].toString('utf8'),
      commandSource:
        gitInputs['src/commands/pro-trial-expired/index.ts'].toString('utf8'),
    })
    for (const output of fixture.sourceGraph.outputFiles) {
      assert.deepEqual(descriptor(built[output.path]), {
        bytes: output.bytes,
        sha256: output.sha256,
      })
      if (graph.allRecovered) {
        assert.equal(
          graph.values[output.path].toString('utf8'),
          built[output.path],
        )
      }
    }
    for (const dependency of fixture.sourceGraph.dependencies) {
      const value = fs.readFileSync(sourceFilename(sourceRoot, dependency.path))
      assert.deepEqual(descriptor(value), {
        bytes: dependency.bytes,
        sha256: dependency.sha256,
      })
      for (const fragment of dependency.requiredFragments) {
        assert.equal(value.toString('utf8').includes(fragment), true, fragment)
      }
      const blob = spawnSync(
        'git',
        ['rev-parse', `${fixture.sourceGraph.targetCommit}:${dependency.path}`],
        { cwd: root, encoding: 'utf8' },
      )
      assert.equal(blob.status, 0)
      assert.equal(blob.stdout.trim(), dependency.gitBlob)
    }

    const repl = built['src/screens/REPL.tsx']
    const replFile = parseSource(
      'src/screens/REPL.tsx',
      repl,
      ts.ScriptKind.TSX,
    )
    const replDeclaration = findNodes(
      replFile,
      node => ts.isFunctionDeclaration(node) && node.name?.text === 'REPL',
    )
    assert.equal(replDeclaration.length, 1)
    assert.deepEqual(
      sourceNodeDescriptor(replFile, repl, replDeclaration[0]),
      fixture.sourceGraph.outputAst.repl,
    )
    assert.deepEqual(
      sourceNodeDescriptor(
        replFile,
        repl,
        variableStatement(replFile, 'repinScroll'),
      ),
      fixture.sourceGraph.outputAst.repinScroll,
    )
    assert.deepEqual(
      sourceNodeDescriptor(
        replFile,
        repl,
        variableStatement(replFile, 'hasAutoOpenedProTrialExpiredRef'),
      ),
      fixture.sourceGraph.outputAst.proTrialRef,
    )
    const proTrialEffects = findNodes(
      replFile,
      node =>
        ts.isExpressionStatement(node) &&
        node.getText(replFile).includes('shouldAutoOpenProTrialExpired()'),
    )
    assert.equal(proTrialEffects.length, 1)
    assert.deepEqual(
      sourceNodeDescriptor(replFile, repl, proTrialEffects[0]),
      fixture.sourceGraph.outputAst.proTrialEffect,
    )
    const helperImports = findNodes(
      replFile,
      node =>
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier.text === '../services/proTrial.js',
    )
    assert.equal(helperImports.length, 1)
    const repinStatement = variableStatement(replFile, 'repinScroll')
    const repinDeclaration = findNodes(
      repinStatement,
      node =>
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'repinScroll',
    )[0]
    const repinCallback = repinDeclaration.initializer.arguments[0]
    assert.equal(ts.isArrowFunction(repinCallback), true)
    assert.equal(repinCallback.parameters.length, 2)
    assert.equal(repinCallback.parameters[1].name.getText(replFile), 'reason')
    assert.equal(repinCallback.parameters[1].initializer.text, '?')
    const repinCalls = findNodes(
      replDeclaration[0],
      node =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'repinScroll',
    )
    assert.equal(repinCalls.length, 6)
    assert.deepEqual(
      repinCalls.map(call => call.arguments.map(arg => arg.getText(replFile))),
      [
        ['false', "'lastMsgIsHuman'"],
        ['false', "'typedIntoEmpty'"],
        ['true', "'permissionDialogAppear'"],
        ['true', "'permissionDialogDismiss'"],
        ['false', '`toolJsxDialog→${hasToolJsx}`'],
        ['false', "'onSubmit'"],
      ],
    )
    const requiredReplFragments = [
      'repinScroll(${reason}, force=${force}): yanking from scrollTop=',
      'scrollHandle.getScrollHeight() - scrollHandle.getViewportHeight()',
      "onSubmitRef.current('/pro-trial-expired'",
      '!shouldAutoOpenProTrialExpired()',
    ]
    for (const fragment of requiredReplFragments) {
      assert.equal(repl.includes(fragment), true, fragment)
    }
    assert.equal(repl.includes('cursorRef'), false)

    const command = built['src/commands/pro-trial-expired/index.ts']
    const commandFile = parseSource(
      'src/commands/pro-trial-expired/index.ts',
      command,
      ts.ScriptKind.TS,
    )
    assert.deepEqual(
      sourceNodeDescriptor(
        commandFile,
        command,
        variableStatement(commandFile, 'proTrialExpired'),
      ),
      fixture.sourceGraph.outputAst.command,
    )
    assert.equal(command.includes('isEnabled: () => true'), true)
    assert.equal(command.includes('isEnabled: () => false'), false)
  },
)

test(
  'atomic helper is idempotent and rejects a mixed two-file source graph',
  { skip: !selected },
  t => {
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target119-repl-pro-trial-replay.'),
    )
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
    for (const input of fixture.sourceGraph.inputFiles) {
      const destination = sourceFilename(temporary, input.path)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      const result = spawnSync(
        'git',
        ['show', `${fixture.sourceGraph.targetCommit}:${input.path}`],
        { cwd: root, encoding: null },
      )
      assert.equal(result.status, 0)
      fs.writeFileSync(destination, result.stdout)
    }
    assert.deepEqual(
      applyTarget119ReplProTrialSourceRecovery({ sourceRoot: temporary }),
      {
        status: 'recovered',
        files: fixture.sourceGraph.outputFiles.map(output => output.path),
      },
    )
    for (const output of fixture.sourceGraph.outputFiles) {
      assert.deepEqual(
        descriptor(fs.readFileSync(sourceFilename(temporary, output.path))),
        { bytes: output.bytes, sha256: output.sha256 },
      )
    }
    assert.deepEqual(
      applyTarget119ReplProTrialSourceRecovery({ sourceRoot: temporary }),
      { status: 'already-recovered', files: [] },
    )
    const commandInput = fixture.sourceGraph.inputFiles.find(
      input => input.path.endsWith('/index.ts'),
    )
    const rawCommand = spawnSync(
      'git',
      ['show', `${fixture.sourceGraph.targetCommit}:${commandInput.path}`],
      { cwd: root, encoding: null },
    )
    assert.equal(rawCommand.status, 0)
    fs.writeFileSync(
      sourceFilename(temporary, commandInput.path),
      rawCommand.stdout,
    )
    assert.throws(
      () =>
        applyTarget119ReplProTrialSourceRecovery({ sourceRoot: temporary }),
      /exact all-raw or all-recovered source graph/,
    )
  },
)

test(
  'owner-residue, coverage, and adjacency evolution remain fail-closed',
  { skip: !selected },
  () => {
    const ledger = JSON.parse(
      gunzipSync(readPinned(fixture.inputs.targetStructuralLedger)),
    )
    const accepted = fixture.artifactPhasePolicy.acceptedPairs[0]
    const reportPath = path.resolve(
      process.env.CLAUDE_CODE_TYPED_AUDIT_PATH ??
        path.join(root, accepted.typedAudit.path),
    )
    const reportBytes = fs.readFileSync(reportPath)
    const report = JSON.parse(reportBytes)
    const coveragePath = path.resolve(
      process.env.CLAUDE_CODE_SOURCE_COVERAGE_PATH ??
        path.join(root, accepted.sourceCoverage.path),
    )
    const coverageBytes = fs.readFileSync(coveragePath)
    const coverageRaw = gunzipSync(coverageBytes)
    const artifactPair = selectArtifactPhase(
      descriptor(reportBytes),
      descriptor(coverageBytes),
      descriptor(coverageRaw),
    )
    assert.ok(
      ['provisional', 'post-streaming', 'post-u21759', 'post-u21878'].includes(
        artifactPair.phase,
      ),
    )
    for (const pair of fixture.artifactPhasePolicy.acceptedPairs) {
      assert.equal(
        selectArtifactPhase(
          pair.typedAudit,
          pair.sourceCoverage,
          pair.sourceCoverageRaw,
        ).phase,
        pair.phase,
      )
    }
    const [provisionalPair, , postU21759Pair, postU21878Pair] =
      fixture.artifactPhasePolicy.acceptedPairs
    assert.throws(
      () =>
        selectArtifactPhase(
          provisionalPair.typedAudit,
          postU21878Pair.sourceCoverage,
          provisionalPair.sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          postU21878Pair.typedAudit,
          postU21878Pair.sourceCoverage,
          postU21759Pair.sourceCoverageRaw,
        ),
      /unknown or hybrid/,
    )
    assert.throws(
      () =>
        selectArtifactPhase(
          { ...descriptor(reportBytes), bytes: reportBytes.length + 1 },
          descriptor(coverageBytes),
          descriptor(coverageRaw),
        ),
      /unknown or hybrid/,
    )
    const artifactProjection =
      fixture.artifactProjections[artifactPair.projection]
    for (const targetIndex of [18089, 21167]) {
      const expected = artifactProjection.reportUnits[targetIndex]
      for (const [key, reportKey] of [
        ['owner', 'sourceRuntimeOwnerResidueRows'],
        ['added', 'sourceRuntimeAddedOwnerResidueRows'],
        ['strict', 'rows'],
      ]) {
        assert.deepEqual(
          partitionDescriptor(
            report[reportKey].filter(
              row => row.structural?.index === targetIndex,
            ),
          ),
          expected[key],
          `${artifactPair.phase}:${key}:u${targetIndex}`,
        )
      }
    }
    const replIndex = fixture.replUnits.target.targetIndex
    const forRepl = rows =>
      rows.filter(row => row.structural?.index === replIndex)
    const ownerIdentities = forRepl(
      report.sourceRuntimeOwnerResidueRows,
    ).map(residueWithAdded)
    const addedIdentities = forRepl(
      report.sourceRuntimeAddedOwnerResidueRows,
    ).map(residueWithAdded)
    const strictIdentities = forRepl(report.rows).map(residueWithAdded)
    assert.deepEqual(
      {
        ownerRows: ownerIdentities.length,
        ownerRowsBytes: Buffer.byteLength(JSON.stringify(ownerIdentities)),
        ownerRowsWithTargetAddedSha256: canonicalDigest(ownerIdentities),
        addedRows: addedIdentities.length,
        addedRowsBytes: Buffer.byteLength(JSON.stringify(addedIdentities)),
        addedRowsWithTargetAddedSha256: canonicalDigest(addedIdentities),
      },
      {
        ownerRows: fixture.residueEvolution.ownerRows,
        ownerRowsBytes: fixture.residueEvolution.ownerRowsBytes,
        ownerRowsWithTargetAddedSha256:
          fixture.residueEvolution.ownerRowsWithTargetAddedSha256,
        addedRows: fixture.residueEvolution.addedRows,
        addedRowsBytes: fixture.residueEvolution.addedRowsBytes,
        addedRowsWithTargetAddedSha256:
          fixture.residueEvolution.addedRowsWithTargetAddedSha256,
      },
    )
    if (strictIdentities.length === fixture.residueEvolution.strictRows) {
      assert.deepEqual(strictIdentities, fixture.productionStrictResidues)
      assert.equal(
        Buffer.byteLength(JSON.stringify(strictIdentities)),
        fixture.residueEvolution.strictRowsBytes,
      )
      assert.equal(
        canonicalDigest(strictIdentities),
        fixture.residueEvolution.strictRowsWithTargetAddedSha256,
      )
    } else {
      assert.deepEqual(strictIdentities, [])
    }
    for (const adjacent of fixture.adjacentUnits) {
      assertRegion(ledger, adjacent)
      for (const [key, expected] of [
        ['sourceRuntimeOwnerResidueRows', adjacent.ownerRows],
        ['sourceRuntimeAddedOwnerResidueRows', adjacent.addedOwnerRows],
        ['rows', adjacent.strictRows],
      ]) {
        assert.equal(
          report[key].filter(
            row => row.structural?.index === adjacent.targetIndex,
          ).length,
          expected,
          `${key}:u${adjacent.targetIndex}`,
        )
      }
    }

    const coverage = JSON.parse(coverageRaw)
    const rows = fixture.ownerOverrides.map(expected => {
      const matches = coverage.rows.filter(
        row => row.targetIndex === expected.targetIndex,
      )
      assert.equal(matches.length, 1, `coverage u${expected.targetIndex}`)
      return matches[0]
    })
    assert.deepEqual(
      partitionDescriptor(rows),
      artifactProjection.coverageRows,
    )
    assert.deepEqual(
      partitionDescriptor(rows.map(coverageTuple)),
      artifactProjection.coverageTuples,
    )
    const provisionalCoverage = artifactPair.projection === 'provisional'
    const correctedOwnerIds = {
      18089: ['owner-src-commands-pro-trial-expired-index-ts'],
      21167: ['owner-src-screens-REPL-tsx'],
    }
    for (const [index, row] of rows.entries()) {
      const expected = fixture.ownerOverrides[index]
      const provisional = fixture.provisionalCoverage[index]
      assert.equal(row.targetIndex, expected.targetIndex)
      assert.equal(row.disposition, 'source-runtime-covered')
      if (provisionalCoverage) {
        assert.deepEqual(row.ownerIds, provisional.ownerIds)
        assert.deepEqual(row.evidenceIds, provisional.evidenceIds)
        assert.equal(row.behavior, provisional.behavior)
      } else {
        assert.deepEqual(row.ownerIds, correctedOwnerIds[row.targetIndex])
        assert.deepEqual(row.evidenceIds, fixture.evidenceIds)
        assert.equal(row.behavior, expected.behavior)
      }
    }
    if (provisionalCoverage) {
      assert.deepEqual(strictIdentities, fixture.productionStrictResidues)
    }
  },
)
