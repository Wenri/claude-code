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
  TARGET119_STATUS_LINE_CWD_FAST_MODE_INPUT_FILE,
  TARGET119_STATUS_LINE_CWD_FAST_MODE_OUTPUT_FILE,
  TARGET119_STATUS_LINE_CWD_FAST_MODE_OWNER_OVERRIDES,
  applyTarget119StatusLineCwdFastModeSourceRecovery,
  buildTarget119StatusLineCwdFastModeOutput,
} from '../cases/2.1.118-to-2.1.119/recovered/replay-status-line-cwd-fast-mode-source-gap.mjs'

const root = process.cwd()
const caseName = '2.1.118-to-2.1.119'
const selectedCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !selectedCase || selectedCase === caseName
const fixturePath = path.join(
  root,
  'recovery/test/recovery-2.1.119-status-line-cwd-fast-mode-source-gap.json',
)
const fixtureBytes = fs.readFileSync(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const FIXTURE_SHA256 =
  'a4faa37882de9aa76e83cb4b55dbb2ed95e1f057e4624198af163ac85a747b32'
const configuredSourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function descriptor(value) {
  return { bytes: value.length, sha256: sha256(value) }
}

function readPinned(input) {
  const value = fs.readFileSync(path.join(root, input.path))
  assert.deepEqual(descriptor(value), {
    bytes: input.bytes,
    sha256: input.sha256,
  })
  return value
}

function gitFile() {
  const result = spawnSync(
    'git',
    ['show', `${fixture.inputs.rawSource.commit}:${fixture.inputs.rawSource.file.path}`],
    { cwd: root, maxBuffer: 8 * 1024 * 1024 },
  )
  assert.equal(result.status, 0, result.stderr?.toString())
  assert.deepEqual(descriptor(result.stdout), {
    bytes: fixture.inputs.rawSource.file.bytes,
    sha256: fixture.inputs.rawSource.file.sha256,
  })
  return result.stdout
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
  ]
}

function canonicalRows(rows) {
  const tuples = rows.map(rowTuple)
  return { ...descriptor(Buffer.from(JSON.stringify(tuples))), tuples }
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

function assertDeclaration(ts, sourceFile, text, bytes, expected) {
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

test('Target119 StatusLine fixture, helper, and override are frozen', { skip: !selected }, () => {
  assert.equal(sha256(fixtureBytes), FIXTURE_SHA256)
  assert.equal(fixture.case, caseName)
  assert.deepEqual(
    descriptor(fs.readFileSync(path.join(root, fixture.inputs.helper.path))),
    {
      bytes: fixture.inputs.helper.bytes,
      sha256: fixture.inputs.helper.sha256,
    },
  )
  assert.deepEqual(TARGET119_STATUS_LINE_CWD_FAST_MODE_INPUT_FILE, {
    path: fixture.inputs.rawSource.file.path,
    bytes: fixture.inputs.rawSource.file.bytes,
    sha256: fixture.inputs.rawSource.file.sha256,
  })
  assert.deepEqual(TARGET119_STATUS_LINE_CWD_FAST_MODE_OUTPUT_FILE, {
    path: fixture.inputs.recoveredSource.file.path,
    bytes: fixture.inputs.recoveredSource.file.bytes,
    sha256: fixture.inputs.recoveredSource.file.sha256,
  })
  const override = TARGET119_STATUS_LINE_CWD_FAST_MODE_OWNER_OVERRIDES[0]
  assert.equal(override.key, `${caseName}:${fixture.units.targetBuilder.index}`)
  assert.deepEqual(override.paths, [fixture.inputs.rawSource.file.path])
  assert.deepEqual(override.declarations, [
    'buildStatusLineCommandInput',
    'StatusLineInner',
  ])
  assert.deepEqual(override.evidenceIds, fixture.evidenceIds)
})

test('complete authenticated units retain fast mode and one cwd sample', { skip: !selected }, () => {
  const structural = JSON.parse(gunzipSync(readPinned(fixture.inputs.structuralLedger)))
  for (const unit of [fixture.units.targetBuilder, fixture.units.targetCaller]) {
    const region = structural.regions.find(row => row.target.index === unit.index)
    assert(region)
    for (const key of [
      'nodeType',
      'start',
      'end',
      'tokenCount',
      'sourceHash',
      'coarseHash',
    ]) {
      assert.equal(region.target[key], unit[key])
    }
  }
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const targetBuilder = targetBundle
    .subarray(fixture.units.targetBuilder.start, fixture.units.targetBuilder.end)
    .toString()
  const targetCaller = targetBundle
    .subarray(fixture.units.targetCaller.start, fixture.units.targetCaller.end)
    .toString()
  assert.deepEqual(descriptor(Buffer.from(targetBuilder)), {
    bytes: fixture.units.targetBuilder.bytes,
    sha256: fixture.units.targetBuilder.sourceHash,
  })
  assert.deepEqual(descriptor(Buffer.from(targetCaller)), {
    bytes: fixture.units.targetCaller.bytes,
    sha256: fixture.units.targetCaller.sourceHash,
  })
  for (const marker of [
    'cwd:O',
    'current_dir:O',
    'fast_mode:q',
    'effort:{level:',
    'thinking:{enabled:',
    'rate_limits:k',
  ]) {
    assert.ok(targetBuilder.includes(marker), marker)
  }
  for (const marker of [
    'fastMode??!1',
    'fastMode:D',
    'let a=V$(),HH=await YV8(a)',
  ]) {
    assert.ok(targetCaller.includes(marker), marker)
  }

  const baselineBundle = readPinned(fixture.inputs.baselineBundle)
  const baselineBuilder = baselineBundle
    .subarray(
      fixture.units.target118Builder.start,
      fixture.units.target118Builder.end,
    )
    .toString()
  const baselineCaller = baselineBundle
    .subarray(
      fixture.units.target118Caller.start,
      fixture.units.target118Caller.end,
    )
    .toString()
  assert.deepEqual(descriptor(Buffer.from(baselineBuilder)), {
    bytes: fixture.units.target118Builder.bytes,
    sha256: fixture.units.target118Builder.sourceHash,
  })
  assert.deepEqual(descriptor(Buffer.from(baselineCaller)), {
    bytes: fixture.units.target118Caller.bytes,
    sha256: fixture.units.target118Caller.sourceHash,
  })
  for (const marker of ['cwd:', 'current_dir:', 'fast_mode:']) {
    assert.ok(baselineBuilder.includes(marker), marker)
  }
  assert.equal(baselineBuilder.includes('effort:{level:'), false)
  assert.equal(baselineBuilder.includes('thinking:{enabled:'), false)

  const target = readPinned(fixture.inputs.targetBundle)
  for (const tuple of fixture.rows.addedOwner.tuples) {
    const slice = target.subarray(tuple[3], tuple[4]).toString()
    assert.equal(tuple[1] === 'string' ? JSON.parse(slice) : slice, tuple[2])
  }
  const report = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
      ),
      'utf8',
    ),
  )
  const added = canonicalRows(
    report.sourceRuntimeAddedOwnerResidueRows.filter(
      row => row.structural.index === fixture.units.targetBuilder.index,
    ),
  )
  assert(
    [fixture.rows.addedOwner, fixture.rows.rawScanner].some(
      expected =>
        added.bytes === expected.canonicalBytes &&
        added.sha256 === expected.canonicalSha256 &&
        JSON.stringify(added.tuples) === JSON.stringify(expected.tuples),
    ),
    'scanner must expose the exact raw or recovered source state',
  )
})

test('StatusLine replay is exact, idempotent, root-bounded, and fail closed', { skip: !selected }, () => {
  const raw = gitFile()
  const output = buildTarget119StatusLineCwdFastModeOutput(raw.toString())
  assert.deepEqual(descriptor(output), {
    bytes: fixture.inputs.recoveredSource.file.bytes,
    sha256: fixture.inputs.recoveredSource.file.sha256,
  })
  if (configuredSourceRoot) {
    const actual = fs.readFileSync(
      path.join(configuredSourceRoot, 'components/StatusLine.tsx'),
    )
    const state = descriptor(actual)
    assert(
      [
        fixture.inputs.rawSource.file,
        fixture.inputs.recoveredSource.file,
      ].some(expected =>
        state.bytes === expected.bytes && state.sha256 === expected.sha256,
      ),
      `configured source state differs: ${state.bytes}/${state.sha256}`,
    )
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'target119-status-line-'))
  const filename = path.join(tempRoot, 'components/StatusLine.tsx')
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  fs.writeFileSync(filename, raw)
  assert.deepEqual(
    applyTarget119StatusLineCwdFastModeSourceRecovery({ sourceRoot: tempRoot }),
    { status: 'recovered', files: ['src/components/StatusLine.tsx'] },
  )
  assert.deepEqual(descriptor(fs.readFileSync(filename)), descriptor(output))
  assert.deepEqual(
    applyTarget119StatusLineCwdFastModeSourceRecovery({ sourceRoot: tempRoot }),
    { status: 'already-recovered', files: ['src/components/StatusLine.tsx'] },
  )
  const drift = Buffer.from(raw)
  drift[100] ^= 1
  fs.writeFileSync(filename, drift)
  assert.throws(
    () =>
      applyTarget119StatusLineCwdFastModeSourceRecovery({
        sourceRoot: tempRoot,
      }),
    /requires exact raw or recovered state/,
  )
})

test('recovered source AST and runtime match the authenticated Target119 builder', { skip: !selected }, async () => {
  const ts = await loadTypeScript()
  const raw = gitFile()
  const recovered = buildTarget119StatusLineCwdFastModeOutput(raw.toString())
  const rawText = raw.toString()
  const recoveredText = recovered.toString()
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
    assertDeclaration(ts, rawSource, rawText, raw, expected)
  }
  const recoveredDeclarations = new Map()
  for (const expected of fixture.inputs.recoveredSource.file.declarations) {
    recoveredDeclarations.set(
      expected.name,
      assertDeclaration(ts, recoveredSource, recoveredText, recovered, expected),
    )
  }
  const rawBuilder = findFunction(
    ts,
    rawSource,
    'buildStatusLineCommandInput',
  ).getText(rawSource)
  assert.equal(rawBuilder.includes('fast_mode'), false)
  assert.equal(rawBuilder.includes('    cwd,'), false)
  assert.ok(rawBuilder.includes('current_dir: getCwd()'))

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
      'effortValue',
      'thinkingEnabled',
    ],
  )
  for (const marker of [
    '...createBaseHookInput(),\n    cwd,',
    'current_dir: cwd',
    'fast_mode: fastMode',
    'effort:',
    'thinking:',
    'rate_limits: rateLimits',
  ]) {
    assert.ok(builderText.includes(marker), marker)
  }
  const callerText = recoveredDeclarations.get('StatusLineInner').getText(recoveredSource)
  for (const marker of [
    'useAppState(s => s.fastMode ?? false)',
    'const fastModeRef = useRef(fastMode)',
    'fastMode !== previousStateRef.current.fastMode',
    'previousStateRef.current.fastMode = fastMode',
    'const cwd = getCwd()',
    'const gitWorktree = await getGitWorktreeName(cwd)',
    'fastModeRef.current, settingsRef.current',
    'gitWorktree, vimModeRef.current, cwd, effortValueRef.current',
  ]) {
    assert.ok(callerText.includes(marker), marker)
  }

  const emittedBuilder = ts.transpileModule(builderText, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const targetBundle = readPinned(fixture.inputs.targetBundle)
  const targetBuilderText = targetBundle
    .subarray(fixture.units.targetBuilder.start, fixture.units.targetBuilder.end)
    .toString()
  const targetBuilderName = parse(targetBuilderText, {
    ecmaVersion: 'latest',
  }).body[0].id.name

  for (const scenario of [
    {
      fastMode: true,
      effort: 'high',
      thinking: true,
      agent: 'main-agent',
      worktree: {
        worktreeName: 'tree',
        worktreePath: '/tree',
        worktreeBranch: 'branch',
        originalCwd: '/original',
        originalBranch: 'main',
      },
      utilization: {
        five_hour: { utilization: 0.25, resets_at: 123 },
        seven_day: { utilization: 0.5, resets_at: 456 },
      },
      sessionName: 'session-name',
      vim: true,
      remote: true,
    },
    {
      fastMode: false,
      effort: undefined,
      thinking: false,
      agent: undefined,
      worktree: undefined,
      utilization: {},
      sessionName: undefined,
      vim: false,
      remote: false,
    },
  ]) {
    const mocks = [
      () => scenario.agent,
      () => scenario.worktree,
      () => 'runtime-model',
      'default-style',
      () => ({ input_tokens: 12 }),
      () => 200000,
      () => ['beta'],
      () => ({ used: 25, remaining: 75 }),
      () => 'session-id',
      () => scenario.sessionName,
      () => scenario.utilization,
      () => ({ hook_event_name: 'Status', cwd: '/stale-cwd' }),
      () => 'Runtime Model',
      () => '/project',
      () => 1.25,
      () => 200,
      () => 100,
      () => 7,
      () => 3,
      () => 40,
      () => 5,
      () => true,
      (_model, effort) => effort ?? 'medium',
      () => scenario.vim,
      () => scenario.remote,
    ]
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
      'modelSupportsEffort',
      'getDisplayedEffortLevel',
      'isVimModeEnabled',
      'getIsRemoteMode',
      'MACRO',
      `${emittedBuilder}; return buildStatusLineCommandInput`,
    )(...mocks, { VERSION: fixture.contract.buildMetadata.VERSION })
    const targetBuilder = Function(
      'HN',
      'gf',
      'GU',
      'ly',
      'hc$',
      'gG',
      'LL',
      '_m$',
      'N$',
      'jD',
      'q7$',
      'M_',
      'rw',
      'K6',
      'JL',
      'cvH',
      'tW',
      'qMH',
      'KMH',
      '_MH',
      'ZF',
      'Xy',
      's1H',
      'xa',
      'm6',
      `${targetBuilderText}; return ${targetBuilderName}`,
    )(...mocks)
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
      scenario.effort,
      scenario.thinking,
    ]
    assert.deepEqual(sourceBuilder(...args), targetBuilder(...args))
  }
})

test('StatusLine coverage applies the three-part proof atomically', { skip: !selected }, () => {
  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(
        path.join(
          root,
          'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
        ),
      ),
    ),
  )
  const row = coverage.rows.find(
    candidate => candidate.targetIndex === fixture.units.targetBuilder.index,
  )
  assert(row)
  const override = TARGET119_STATUS_LINE_CWD_FAST_MODE_OWNER_OVERRIDES[0]
  const matched = row.evidenceIds.filter(id => override.evidenceIds.includes(id))
  assert(
    matched.length === 0 || matched.length === override.evidenceIds.length,
    'coverage cannot partially apply the StatusLine proof',
  )
  if (matched.length === override.evidenceIds.length) {
    const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
    assert.deepEqual(row.ownerIds.map(id => owners.get(id)), override.paths)
    assert.deepEqual(row.evidenceIds, override.evidenceIds)
    assert.equal(row.behavior, override.behavior)
  }
})
