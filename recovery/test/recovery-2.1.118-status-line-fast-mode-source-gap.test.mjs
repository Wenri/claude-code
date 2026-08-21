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
  applyTarget118StatusLineFastModeSourceRecovery,
  buildTarget118StatusLineFastModeOutput,
  TARGET118_STATUS_LINE_FAST_MODE_INPUT_FILE,
  TARGET118_STATUS_LINE_FAST_MODE_OUTPUT_FILE,
  TARGET118_STATUS_LINE_FAST_MODE_OWNER_OVERRIDES,
} from '../cases/2.1.117-to-2.1.118/recovered/replay-status-line-fast-mode-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.117-to-2.1.118'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.118-status-line-fast-mode-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 = '0e5d1a4215edfc38474fd5189cd223e07dddb5e2de7a6e8620689edaaa1a6d08'
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

function canonicalDigest(value) {
  return sha256(Buffer.from(JSON.stringify(value)))
}

function readPinnedFile(input) {
  const bytes = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(bytes), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return bytes
}

function artifactPath(input, environmentVariable) {
  return path.resolve(
    process.env[environmentVariable] ??
      path.join(root, '.recovery-tmp/authenticated-artifacts', input.artifact),
  )
}

function gitFile() {
  const input = fixture.inputs.rawSource.file
  const commit = fixture.inputs.rawSource.commit
  const result = spawnSync('git', ['show', `${commit}:${input.path}`], {
    cwd: root,
    encoding: null,
  })
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  assert.equal(
    spawnSync('git', ['rev-parse', `${commit}:${input.path}`], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim(),
    input.blob,
  )
  return result.stdout
}

function sourceFilePath(sourceRootPath) {
  return path.join(
    sourceRootPath,
    fixture.inputs.rawSource.file.path.replace(/^src\//, ''),
  )
}

function recoveredFile() {
  const output = buildTarget118StatusLineFastModeOutput(gitFile().toString())
  assert.deepEqual(descriptor(output), {
    bytes: fixture.inputs.recoveredSource.file.bytes,
    sha256: fixture.inputs.recoveredSource.file.sha256,
  })
  return output
}

function sourceState(sourceRootPath) {
  const actual = descriptor(fs.readFileSync(sourceFilePath(sourceRootPath)))
  const raw = fixture.inputs.rawSource.file
  const recovered = fixture.inputs.recoveredSource.file
  if (actual.bytes === raw.bytes && actual.sha256 === raw.sha256) return 'raw'
  if (
    actual.bytes === recovered.bytes &&
    actual.sha256 === recovered.sha256
  ) {
    return 'recovered'
  }
  assert.fail(`configured StatusLine is not exact: ${actual.bytes}/${actual.sha256}`)
}

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

function findFunction(ts, sourceFile, name) {
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.equal(matches.length, 1, name)
  return matches[0]
}

function pinDeclaration(ts, sourceFile, text, bytes, expected) {
  const declaration = findFunction(ts, sourceFile, expected.name)
  const characterStart = declaration.getStart(sourceFile)
  const characterEnd = declaration.end
  const byteStart = Buffer.byteLength(text.slice(0, characterStart))
  const byteEnd = Buffer.byteLength(text.slice(0, characterEnd))
  assert.deepEqual(
    {
      name: declaration.name.text,
      characterStart,
      characterEnd,
      byteStart,
      byteEnd,
      ...descriptor(bytes.subarray(byteStart, byteEnd)),
    },
    expected,
  )
  return declaration
}

test(
  'Target118 status-line fixture pins one mixed unit and its sole source gap',
  { skip: !selected },
  () => {
    assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
    assert.equal(fixture.case, caseName)
    assert.equal(fixture.status, 'authenticated-bounded-source-replay')
    assert.deepEqual(
      descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
      {
        bytes: fixture.inputs.helper.bytes,
        sha256: fixture.inputs.helper.sha256,
      },
    )
    assert.deepEqual(TARGET118_STATUS_LINE_FAST_MODE_INPUT_FILE, {
      path: fixture.inputs.rawSource.file.path,
      bytes: fixture.inputs.rawSource.file.bytes,
      sha256: fixture.inputs.rawSource.file.sha256,
    })
    assert.deepEqual(TARGET118_STATUS_LINE_FAST_MODE_OUTPUT_FILE, {
      path: fixture.inputs.recoveredSource.file.path,
      bytes: fixture.inputs.recoveredSource.file.bytes,
      sha256: fixture.inputs.recoveredSource.file.sha256,
    })
    assert.deepEqual(
      TARGET118_STATUS_LINE_FAST_MODE_OWNER_OVERRIDES.map(row => ({
        targetIndex: row.targetIndex,
        paths: [...row.paths],
        declarations: [...row.declarations],
        evidenceIds: [...row.evidenceIds],
        behavior: row.behavior,
      })),
      [
        {
          targetIndex: fixture.targetUnit.targetIndex,
          paths: [fixture.targetUnit.ownerPath],
          declarations: fixture.targetUnit.declarations,
          evidenceIds: fixture.evidenceIds,
          behavior: fixture.targetUnit.behavior,
        },
      ],
    )
    assert.equal(
      canonicalDigest([fixture.targetUnit.targetIndex]),
      fixture.summary.targetIndicesSha256,
    )
    const rows = fixture.targetUnit.residues.map(residue => [
      fixture.targetUnit.targetIndex,
      ...residue,
    ])
    assert.deepEqual(fixture.scannerPartition.rows, rows)
    assert.equal(
      canonicalDigest(rows),
      fixture.scannerPartition.residueIdentitiesSha256,
    )
    assert.equal(
      canonicalDigest(fixture.scannerPartition.strictUnsupportedRows),
      fixture.summary.residueIdentitiesSha256,
    )

    const analysis = JSON.parse(readPinnedFile(fixture.inputs.ownerAnalysis))
    const mapping = analysis.analysis.sourceSupplementGaps.find(
      row => row.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(mapping)
    assert.deepEqual(
      {
        ownerPaths: mapping.ownerPaths,
        target: mapping.target,
        residues: mapping.residues,
        unsupportedResidues: mapping.unsupportedResidues,
        residueIdentitiesSha256: mapping.residueIdentitiesSha256,
        unsupportedResidueIdentitiesSha256:
          mapping.unsupportedResidueIdentitiesSha256,
        rowScopedEvidence: mapping.rowScopedEvidence,
      },
      {
        ownerPaths: [fixture.targetUnit.ownerPath.replace(/^src\//, '')],
        target: {
          classification: fixture.targetUnit.classification,
          start: fixture.targetUnit.start,
          end: fixture.targetUnit.end,
          nodeType: fixture.targetUnit.nodeType,
          sourceHash: fixture.targetUnit.sourceHash,
        },
        residues: fixture.scannerPartition.residues,
        unsupportedResidues: fixture.scannerPartition.unsupportedResidues,
        residueIdentitiesSha256:
          fixture.scannerPartition.residueIdentitiesSha256,
        unsupportedResidueIdentitiesSha256:
          fixture.scannerPartition.unsupportedResidueIdentitiesSha256,
        rowScopedEvidence: {
          obligationIds: [],
          sourcePaths: [],
          testIds: [],
        },
      },
    )
    const buildFixture = JSON.parse(
      readPinnedFile(fixture.inputs.buildMetadataEvidence.fixture),
    )
    assert.deepEqual(buildFixture.macro, fixture.inputs.buildMetadataEvidence.macro)
    readPinnedFile(fixture.inputs.buildMetadataEvidence.test)
    assert.deepEqual(
      rows.slice(0, 3).map(row => row[2]),
      [
        buildFixture.macro.VERSION,
        buildFixture.macro.BUILD_TIME,
        buildFixture.macro.GIT_SHA,
      ],
    )

    assert.equal(
      spawnSync(
        'git',
        ['rev-parse', `${fixture.inputs.rawSource.commit}^{tree}`],
        { cwd: root, encoding: 'utf8' },
      ).stdout.trim(),
      fixture.inputs.rawSource.tree,
    )
    gitFile()
  },
)

test(
  'authenticated builder and caller pin fast mode and one sampled cwd',
  { skip: !selected },
  () => {
    const bundle = fs.readFileSync(
      artifactPath(fixture.inputs.targetBundle, 'CLAUDE_CODE_2_1_118_BUNDLE'),
    )
    assert.deepEqual(descriptor(bundle), {
      bytes: fixture.inputs.targetBundle.bytes,
      sha256: fixture.inputs.targetBundle.sha256,
    })
    const ledger = JSON.parse(
      gunzipSync(readPinnedFile(fixture.inputs.targetStructuralLedger)),
    )
    for (const expected of [fixture.targetUnit, fixture.supportingTargetUnit]) {
      const region = ledger.regions.find(
        candidate => candidate.target.index === expected.targetIndex,
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
          coarseHash: region.target.coarseHash,
        },
        {
          classification: expected.classification,
          start: expected.start,
          end: expected.end,
          bytes: expected.bytes,
          tokenCount: expected.tokenCount,
          nodeType: expected.nodeType,
          sourceHash: expected.sourceHash,
          coarseHash: expected.coarseHash,
        },
      )
      const bytes = bundle.subarray(expected.start, expected.end)
      assert.deepEqual(descriptor(bytes), {
        bytes: expected.bytes,
        sha256: expected.sourceHash,
      })
      const ast = parse(bytes.toString(), { ecmaVersion: 'latest' })
      assert.equal(ast.body.length, 1)
      assert.equal(ast.body[0].type, expected.nodeType)
    }
    const builderText = bundle
      .subarray(fixture.targetUnit.start, fixture.targetUnit.end)
      .toString()
    for (const marker of [
      'function Fe1(H,$,q,K,_,A,f,z,Y,O)',
      '...Q_(),cwd:O',
      'workspace:{current_dir:O',
      'fast_mode:q',
      'rate_limits:Z',
      'vim:{mode:Y??"INSERT"}',
    ]) {
      assert.ok(builderText.includes(marker), marker)
    }
    const callerText = bundle
      .subarray(
        fixture.supportingTargetUnit.start,
        fixture.supportingTargetUnit.end,
      )
      .toString()
    for (const marker of [
      'fastMode??!1',
      'useRef(D)',
      'fastMode:D',
      'let i=N$(),a=await DW8(i)',
      'Fe1(X.current,Q,P.current,w.current,g,Array.from(J.current.keys()),L.current,a,j.current,i)',
      'D!==G.current.fastMode',
      'G.current.fastMode=D',
    ]) {
      assert.ok(callerText.includes(marker), marker)
    }
    for (const [index, row] of fixture.scannerPartition.rows.entries()) {
      assert.equal(
        bundle.subarray(row[3], row[4]).toString(),
        fixture.scannerPartition.rawTargetSlices[index],
      )
    }
  },
)

test(
  'bounded status-line replay is fail-closed and idempotent in package mode',
  { skip: !selected },
  t => {
    sourceState(sourceRoot)
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'target118-status-line-fast-mode-'),
    )
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
    const filename = sourceFilePath(tempRoot)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, gitFile())
    assert.deepEqual(
      applyTarget118StatusLineFastModeSourceRecovery({ sourceRoot: tempRoot }),
      {
        status: 'recovered',
        files: [fixture.inputs.recoveredSource.file.path],
      },
    )
    assert.deepEqual(fs.readFileSync(filename), recoveredFile())
    assert.deepEqual(
      applyTarget118StatusLineFastModeSourceRecovery({ sourceRoot: tempRoot }),
      {
        status: 'already-recovered',
        files: [fixture.inputs.recoveredSource.file.path],
      },
    )
    fs.appendFileSync(filename, '\n// unpinned mutation\n')
    assert.throws(
      () =>
        applyTarget118StatusLineFastModeSourceRecovery({
          sourceRoot: tempRoot,
        }),
      /requires exact raw or recovered state/,
    )
  },
)

test(
  'replayed builder is runtime-equivalent to the complete target unit',
  { skip: !selected },
  async () => {
    const ts = await loadTypeScript()
    const rawBytes = gitFile()
    const recoveredBytes = recoveredFile()
    const rawText = rawBytes.toString()
    const recoveredText = recoveredBytes.toString()
    const rawSource = ts.createSourceFile(
      'StatusLine.raw.tsx',
      rawText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const recoveredSource = ts.createSourceFile(
      'StatusLine.recovered.tsx',
      recoveredText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(rawSource.parseDiagnostics.length, 0)
    assert.equal(recoveredSource.parseDiagnostics.length, 0)
    for (const expected of fixture.inputs.rawSource.file.declarations) {
      pinDeclaration(ts, rawSource, rawText, rawBytes, expected)
    }
    const recoveredDeclarations = new Map()
    for (const expected of fixture.inputs.recoveredSource.file.declarations) {
      recoveredDeclarations.set(
        expected.name,
        pinDeclaration(
          ts,
          recoveredSource,
          recoveredText,
          recoveredBytes,
          expected,
        ),
      )
    }
    const rawBuilderText = findFunction(
      ts,
      rawSource,
      'buildStatusLineCommandInput',
    ).getText(rawSource)
    assert.equal(rawBuilderText.includes('fast_mode'), false)
    assert.ok(rawBuilderText.includes('current_dir: getCwd()'))

    const builder = recoveredDeclarations.get('buildStatusLineCommandInput')
    const builderText = builder.getText(recoveredSource)
    assert.deepEqual(
      builder.parameters.map(parameter => parameter.name.getText(recoveredSource)),
      [
        'permissionMode',
        'exceeds200kTokens',
        'fastMode',
        'settings',
        'messages',
        'addedDirs',
        'mainLoopModel',
        'gitWorktree',
        'vimMode',
        'cwd',
      ],
    )
    for (const marker of [
      '...createBaseHookInput(),\n    cwd,',
      'current_dir: cwd',
      'fast_mode: fastMode',
    ]) {
      assert.ok(builderText.includes(marker), marker)
    }
    for (const absent of ['effort:', 'thinking:', 'getDisplayedEffortLevel']) {
      assert.equal(builderText.includes(absent), false, absent)
    }

    const caller = recoveredDeclarations.get('StatusLineInner')
    const callerText = caller.getText(recoveredSource)
    for (const marker of [
      'useAppState(s => s.fastMode ?? false)',
      'const fastModeRef = useRef(fastMode)',
      'fastModeRef.current = fastMode',
      'fastMode: boolean',
      'fastMode !== previousStateRef.current.fastMode',
      'previousStateRef.current.fastMode = fastMode',
      'const cwd = getCwd()',
      'const gitWorktree = await getGitWorktreeName(cwd)',
      'fastModeRef.current, settingsRef.current',
      'gitWorktree, vimModeRef.current, cwd',
    ]) {
      assert.ok(callerText.includes(marker), marker)
    }

    const emittedBuilder = ts.transpileModule(builderText, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const bundle = fs.readFileSync(
      artifactPath(fixture.inputs.targetBundle, 'CLAUDE_CODE_2_1_118_BUNDLE'),
    )
    const targetBuilderText = bundle
      .subarray(fixture.targetUnit.start, fixture.targetUnit.end)
      .toString()
    const targetBuilderName = parse(targetBuilderText, {
      ecmaVersion: 'latest',
    }).body[0].id.name

    for (const scenario of [
      {
        agentType: 'main-agent',
        worktree: {
          worktreeName: 'tree',
          worktreePath: '/tree',
          worktreeBranch: 'branch',
          originalCwd: '/original-cwd',
          originalBranch: 'main',
        },
        rawUtil: {
          five_hour: { utilization: 0.25, resets_at: 123 },
          seven_day: { utilization: 0.5, resets_at: 456 },
        },
        sessionName: 'session-name',
        vimEnabled: true,
        remote: true,
        fastMode: true,
      },
      {
        agentType: undefined,
        worktree: undefined,
        rawUtil: {},
        sessionName: undefined,
        vimEnabled: false,
        remote: false,
        fastMode: false,
      },
    ]) {
      const mocks = {
        agentType: () => scenario.agentType,
        worktree: () => scenario.worktree,
        runtimeModel: () => 'runtime-model',
        defaultStyle: 'default-style',
        currentUsage: () => ({ input_tokens: 12 }),
        contextWindow: () => 200000,
        sdkBetas: () => ['beta'],
        percentages: () => ({ used: 25, remaining: 75 }),
        sessionId: () => 'session-id',
        sessionName: () => scenario.sessionName,
        rawUtil: () => scenario.rawUtil,
        baseHook: () => ({ hook_event_name: 'Status', cwd: '/stale-cwd' }),
        renderModel: () => 'Runtime Model',
        originalCwd: () => '/project',
        totalCost: () => 1.25,
        totalDuration: () => 200,
        apiDuration: () => 100,
        linesAdded: () => 7,
        linesRemoved: () => 3,
        inputTokens: () => 40,
        outputTokens: () => 5,
        vimEnabled: () => scenario.vimEnabled,
        remote: () => scenario.remote,
      }
      const sourceBuilder = Function(
        'getMainThreadAgentType',
        'getCurrentWorktreeSession',
        'getRuntimeMainLoopModel',
        'DEFAULT_OUTPUT_STYLE_NAME',
        'getCurrentUsage',
        'getContextWindowForModel',
        'getSdkBetas',
        'calculateContextPercentages',
        'getSessionId',
        'getCurrentSessionTitle',
        'getRawUtilization',
        'createBaseHookInput',
        'renderModelName',
        'getOriginalCwd',
        'getTotalCost',
        'getTotalDuration',
        'getTotalAPIDuration',
        'getTotalLinesAdded',
        'getTotalLinesRemoved',
        'getTotalInputTokens',
        'getTotalOutputTokens',
        'isVimModeEnabled',
        'getIsRemoteMode',
        'MACRO',
        `${emittedBuilder}; return buildStatusLineCommandInput`,
      )(
        mocks.agentType,
        mocks.worktree,
        mocks.runtimeModel,
        mocks.defaultStyle,
        mocks.currentUsage,
        mocks.contextWindow,
        mocks.sdkBetas,
        mocks.percentages,
        mocks.sessionId,
        mocks.sessionName,
        mocks.rawUtil,
        mocks.baseHook,
        mocks.renderModel,
        mocks.originalCwd,
        mocks.totalCost,
        mocks.totalDuration,
        mocks.apiDuration,
        mocks.linesAdded,
        mocks.linesRemoved,
        mocks.inputTokens,
        mocks.outputTokens,
        mocks.vimEnabled,
        mocks.remote,
        fixture.inputs.buildMetadataEvidence.macro,
      )
      const targetBuilder = Function(
        'qb',
        'hz',
        'ZB',
        'wN',
        'Fp$',
        'x2',
        'fJ',
        'LI$',
        'S$',
        'kD',
        'R$$',
        'Q_',
        'qw',
        'A6',
        'AJ',
        'PZH',
        'rP',
        'HYH',
        '$YH',
        'qYH',
        'yp',
        'Q$H',
        'm6',
        `${targetBuilderText}; return ${targetBuilderName}`,
      )(
        mocks.agentType,
        mocks.worktree,
        mocks.runtimeModel,
        mocks.defaultStyle,
        mocks.currentUsage,
        mocks.contextWindow,
        mocks.sdkBetas,
        mocks.percentages,
        mocks.sessionId,
        mocks.sessionName,
        mocks.rawUtil,
        mocks.baseHook,
        mocks.renderModel,
        mocks.originalCwd,
        mocks.totalCost,
        mocks.totalDuration,
        mocks.apiDuration,
        mocks.linesAdded,
        mocks.linesRemoved,
        mocks.inputTokens,
        mocks.outputTokens,
        mocks.vimEnabled,
        mocks.remote,
      )
      const args = [
        'default',
        true,
        scenario.fastMode,
        { outputStyle: 'custom-style' },
        [{ type: 'user' }],
        ['/added'],
        'main-model',
        '/git-worktree',
        'NORMAL',
        '/sampled-cwd',
      ]
      assert.deepEqual(sourceBuilder(...args), targetBuilder(...args))
    }
  },
)

test(
  'status-line fast-mode coverage evolves only as the complete replay proof',
  { skip: !selected },
  () => {
    const coverage = JSON.parse(
      gunzipSync(
        fs.readFileSync(
          path.join(
            root,
            'recovery/cases/2.1.117-to-2.1.118/semantic/source-coverage.json.gz',
          ),
        ),
      ),
    )
    const row = coverage.rows.find(
      candidate => candidate.targetIndex === fixture.targetUnit.targetIndex,
    )
    assert.ok(row)
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    const paths = row.ownerIds.map(ownerId => owners.get(ownerId))
    const exactOwner =
      JSON.stringify(paths) === JSON.stringify([fixture.targetUnit.ownerPath])
    const provisional =
      exactOwner &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test'])
    const corrected =
      exactOwner &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(fixture.evidenceIds) &&
      row.behavior === fixture.targetUnit.behavior
    assert.ok(provisional || corrected)
  },
)
