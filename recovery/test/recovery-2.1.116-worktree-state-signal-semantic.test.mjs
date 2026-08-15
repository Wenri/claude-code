import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnits = {
  runner: {
    index: 17641,
    start: 10970628,
    end: 10971082,
    sourceHash:
      '740cb8c6acbefbc60fa0750fc922264793330ccc62884784633c5b28e99c241b',
  },
  initializer: {
    index: 17688,
    start: 10993204,
    end: 10994784,
    sourceHash:
      '932e301cc052b5a596761c13e975069635fddfda31fd3a217eac5cd53556a61e',
  },
}

const targetUnits = {
  exports: {
    index: 17741,
    start: 11010110,
    end: 11013357,
    sourceHash:
      'a9d2a77686f90b7365cdcfbda36a58951c92acb41a30dfa016b878b5e4627ddf',
  },
  runner: {
    index: 17834,
    start: 11040454,
    end: 11040921,
    sourceHash:
      '0348d50dcc60c5c4c5a8507af1fce748877f161272c3cb2b943313d1cb8de182',
  },
  initializer: {
    index: 17882,
    start: 11065013,
    end: 11066688,
    sourceHash:
      '086e09da15fc8cdc86f487c23d8c111b80c9a64373510fd05ff4a16d9d076b60',
  },
}

const typedProperty = {
  row: 649,
  value: 'worktreeStateSignal',
  start: 11010178,
  end: 11010197,
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

const structural = JSON.parse(
  gunzipSync(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'recovery/cases',
        caseName,
        'structural/generated-delta.json.gz',
      ),
    ),
  ),
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

async function loadTypeScript() {
  const candidates = [
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/typescript/lib/typescript.js',
    ),
    path.join(
      repositoryRoot,
      '.pixi/envs/default/lib/node_modules/typescript/lib/typescript.js',
    ),
  ]
  const candidate = candidates.find(fs.existsSync)
  assert.ok(candidate, 'the pinned TypeScript compiler must be available')
  const module = await import(pathToFileURL(candidate).href)
  return module.default ?? module
}

async function loadSignalModule() {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source('src/utils/signal.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    () => {
      throw new Error('signal.ts must not import runtime dependencies')
    },
  )
  return module.exports
}

async function instantiateSourceRunner({
  project,
  signal,
  appendEntryToFile,
}) {
  const ts = await loadTypeScript()
  const text = source('src/utils/sessionStorage.ts')
  const file = ts.createSourceFile(
    'sessionStorage.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = file.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'saveWorktreeState',
  )
  assert.ok(declaration, 'saveWorktreeState declaration')
  const functionSource = text.slice(declaration.getStart(file), declaration.end)
  const javascript = ts.transpileModule(
    `${functionSource}\nmodule.exports = { saveWorktreeState }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function(
    'exports',
    'module',
    'getProject',
    'worktreeStateSignal',
    'appendEntryToFile',
    'getSessionId',
    javascript,
  )(
    module.exports,
    module,
    () => project,
    signal,
    appendEntryToFile,
    () => 'session-116',
  )
  return module.exports.saveWorktreeState
}

function persistedWorktree() {
  return {
    originalCwd: '/repo',
    worktreePath: '/repo/.claude/worktrees/repair',
    worktreeName: 'repair',
    worktreeBranch: 'worktree-repair',
    originalBranch: 'main',
    originalHeadCommit: 'abc123',
    sessionId: 'session-116',
    tmuxSessionName: 'claude-repair',
    hookBased: true,
    enteredExisting: false,
  }
}

test(
  'target116 authenticates and executes the added worktree state signal graph',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const unit of Object.values(baselineUnits)) {
      assert.equal(
        sha256(baseline.slice(unit.start, unit.end)),
        unit.sourceHash,
        `baseline structural unit ${unit.index}`,
      )
    }
    for (const unit of Object.values(targetUnits)) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
        `target structural unit ${unit.index}`,
      )
    }
    assert.equal(
      target.slice(typedProperty.start, typedProperty.end),
      typedProperty.value,
      `typed-audit row ${typedProperty.row}`,
    )
    assert.doesNotMatch(baseline, /worktreeStateSignal/)

    const baselineRunner = baseline.slice(
      baselineUnits.runner.start,
      baselineUnits.runner.end,
    )
    const targetRunner = target.slice(
      targetUnits.runner.start,
      targetUnits.runner.end,
    )
    const targetExports = target.slice(
      targetUnits.exports.start,
      targetUnits.exports.end,
    )
    const targetInitializer = target.slice(
      targetUnits.initializer.start,
      targetUnits.initializer.end,
    )
    assert.match(targetExports, /worktreeStateSignal:\(\)=>gl7/)
    assert.match(targetInitializer, /gl7=o4\(\)/)
    assert.doesNotMatch(baselineRunner, /\.emit\(/)
    assert.match(targetRunner, /gl7\.emit\(\$\)/)

    const baselineProject = { sessionFile: null }
    const baselineEvents = []
    const runBaseline = new Function(
      'T1',
      'PT',
      'R$',
      `return (${baselineRunner})`,
    )(
      () => baselineProject,
      (...args) => baselineEvents.push(['append', ...args]),
      () => 'session-114',
    )
    const targetProject = { sessionFile: null }
    const targetEvents = []
    const runTarget = new Function(
      'M1',
      'yPH',
      'E$',
      'gl7',
      `return (${targetRunner})`,
    )(
      () => targetProject,
      (...args) => targetEvents.push(['append', ...args]),
      () => 'session-116',
      { emit: value => targetEvents.push(['emit', value]) },
    )

    const input = {
      ...persistedWorktree(),
      creationDurationMs: 123,
      usedSparsePaths: true,
    }
    runBaseline(input)
    runTarget(input)
    assert.deepEqual(baselineEvents, [])
    assert.deepEqual(targetEvents, [['emit', persistedWorktree()]])
    assert.deepEqual(baselineProject.currentSessionWorktree, persistedWorktree())
    assert.deepEqual(targetProject.currentSessionWorktree, persistedWorktree())

    baselineProject.sessionFile = '/tmp/baseline.jsonl'
    targetProject.sessionFile = '/tmp/target.jsonl'
    runBaseline(null)
    runTarget(null)
    assert.equal(baselineEvents[0][0], 'append')
    assert.deepEqual(targetEvents.slice(1).map(event => event[0]), [
      'emit',
      'append',
    ])
    assert.equal(targetEvents[1][1], null)
    assert.equal(targetEvents[2][2].worktreeSession, null)
  },
)

test(
  'source emits stripped worktree state before optional persistence',
  sourceOptions,
  async () => {
    const sessionStorageSource = source('src/utils/sessionStorage.ts')
    assert.match(
      sessionStorageSource,
      /export const worktreeStateSignal\s*=\s*createSignal<\[worktreeSession: PersistedWorktreeSession \| null\]>\(\)/,
    )
    assert.match(sessionStorageSource, /worktreeStateSignal\.emit\(stripped\)/)

    const { createSignal } = await loadSignalModule()
    const signal = createSignal()
    const project = { sessionFile: null }
    const events = []
    const unsubscribe = signal.subscribe(value => events.push(['emit', value]))
    const runner = await instantiateSourceRunner({
      project,
      signal,
      appendEntryToFile: (...args) => events.push(['append', ...args]),
    })
    const input = {
      ...persistedWorktree(),
      creationDurationMs: 123,
      usedSparsePaths: true,
    }

    runner(input)
    assert.deepEqual(events, [['emit', persistedWorktree()]])
    assert.deepEqual(project.currentSessionWorktree, persistedWorktree())
    assert.equal('creationDurationMs' in events[0][1], false)
    assert.equal('usedSparsePaths' in events[0][1], false)

    project.sessionFile = '/tmp/source.jsonl'
    runner(null)
    assert.deepEqual(events.slice(1).map(event => event[0]), ['emit', 'append'])
    assert.equal(events[1][1], null)
    assert.deepEqual(events[2][2], {
      type: 'worktree-state',
      worktreeSession: null,
      sessionId: 'session-116',
    })

    unsubscribe()
    project.sessionFile = null
    runner(input)
    assert.equal(events.length, 3)
  },
)
