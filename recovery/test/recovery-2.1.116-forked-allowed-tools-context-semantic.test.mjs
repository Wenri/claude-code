import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineUnits = {
  prepare: {
    index: 10092,
    start: 5056534,
    end: 5057008,
    sourceHash:
      '2dafa7a7316ac6402223a3a3a0bcbf3907caf55b25962b8abbc562a1ae15478b',
  },
  slashCaller: {
    index: 12461,
    start: 7827894,
    end: 7829699,
    sourceHash:
      '077d06f5038d4c614d2d5b83e2ff794e27c97a406462988100cdc4715c65f64c',
  },
  skillCaller: {
    index: 12475,
    start: 7838437,
    end: 7840081,
    sourceHash:
      '049938e62d2b82b0b15a08fa08c811545c8a98a0732da09fb1d89797751dfae3',
  },
}

const targetUnits = {
  prepare: {
    index: 10202,
    start: 5093777,
    end: 5094368,
    sourceHash:
      'ca7230fc15c9b11e20b1c22b37bfa316de34ef887c1f179487624c8c934c482c',
  },
  slashCaller: {
    index: 12587,
    start: 7872561,
    end: 7874450,
    sourceHash:
      'fd94a25d679f75b5b2e21f36bb19dcbfa14a3272846adbaf827410a7fd806a6d',
  },
  skillCaller: {
    index: 12602,
    start: 7884277,
    end: 7885983,
    sourceHash:
      'f2d39f57cf4f802558ec93dd0215d977cc2030eedbbb5e98e8348f3924775897',
  },
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

function assertOneStatement(unit, label) {
  assert.equal(
    parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
    1,
    `${label}: one top-level statement`,
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

async function instantiateForkedContextHarness() {
  const owner = source('src/utils/forkedAgent.ts')
  const start = owner.indexOf(
    '/** Adds allowed tools to a permission context without mutating the parent. */',
  )
  const end = owner.indexOf('/**\n * Extracts result text', start)
  assert.ok(start >= 0 && end > start, 'forked allowed-tools implementation range')

  const preamble = `
const parseToolListFromCLI = value => value;
const createUserMessage = value => ({ type: 'user', value });
`
  const ts = await loadTypeScript()
  const result = ts.transpileModule(`${preamble}\n${owner.slice(start, end)}`, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'forked allowed-tools slice must transpile')

  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports
}

test('target116 authenticates the three-owner dual-accessor boundary', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(baselineBytes.length, 12_986_755)
  assert.equal(targetBytes.length, 13_102_272)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)

  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')
  for (const [name, identity] of Object.entries(baselineUnits)) {
    const unit = baseline.slice(identity.start, identity.end)
    assert.equal(sha256(unit), identity.sourceHash, `${name}: baseline bytes`)
    assertOneStatement(unit, `${name}: baseline`)
    assert.equal(
      unit.includes('getToolPermissionContext'),
      false,
      `${name}: baseline has only getAppState`,
    )
  }

  for (const [name, identity] of Object.entries(targetUnits)) {
    const region = structural.regions[identity.index]
    assert.equal(region.classification, 'unresolved', `${name}: classification`)
    assert.deepEqual(
      [
        region.target.start,
        region.target.end,
        region.target.sourceHash,
      ],
      [identity.start, identity.end, identity.sourceHash],
      `${name}: target structural identity`,
    )
    const unit = target.slice(identity.start, identity.end)
    assert.equal(sha256(unit), identity.sourceHash, `${name}: target bytes`)
    assertOneStatement(unit, `${name}: target`)
    assert.equal(
      unit.includes('getToolPermissionContext'),
      true,
      `${name}: target carries the direct accessor`,
    )
  }

  const targetPrepare = target.slice(
    targetUnits.prepare.start,
    targetUnits.prepare.end,
  )
  assert.ok(
    targetPrepare.includes(
      'A.length===0?q.getToolPermissionContext:()=>h6$(q.getToolPermissionContext(),A)',
    ),
  )
  assert.ok(
    target
      .slice(targetUnits.slashCaller.start, targetUnits.slashCaller.end)
      .includes('getAppState:M,getToolPermissionContext:w'),
  )
  assert.ok(
    target
      .slice(targetUnits.skillCaller.start, targetUnits.skillCaller.end)
      .includes('getAppState:P,getToolPermissionContext:G'),
  )
})

test('source threads both permission accessors through every forked caller', sourceOptions, () => {
  const forked = source('src/utils/forkedAgent.ts')
  for (const fragment of [
    'export function addAllowedToolsToPermissionContext(',
    'if (allowedTools.length === 0) return permissionContext',
    'toolPermissionContext: addAllowedToolsToPermissionContext(',
    'const modifiedGetToolPermissionContext =',
    '? context.getToolPermissionContext',
    'context.getToolPermissionContext!()',
    'modifiedGetToolPermissionContext,',
  ]) {
    assert.ok(forked.includes(fragment), `forkedAgent.ts: ${fragment}`)
  }

  const slash = source('src/utils/processUserInput/processSlashCommand.tsx')
  assert.ok(slash.includes('modifiedGetToolPermissionContext,'))
  assert.equal(
    slash.split('getToolPermissionContext: modifiedGetToolPermissionContext')
      .length - 1,
    2,
    'sync and background slash forks both carry the direct accessor',
  )

  const skill = source('src/tools/SkillTool/SkillTool.ts')
  assert.ok(skill.includes('modifiedGetToolPermissionContext,'))
  assert.equal(
    skill.split('getToolPermissionContext: modifiedGetToolPermissionContext')
      .length - 1,
    1,
    'SkillTool fork carries the direct accessor',
  )
})

test('forked allowed tools remain fresh, deduplicated, and parent-isolated', sourceOptions, async () => {
  const harness = await instantiateForkedContextHarness()
  const statePermissionContext = {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {
      command: ['Read', 'Bash(git *)'],
      mcp: ['server'],
    },
    alwaysDenyRules: { command: ['Bash(rm *)'] },
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
  let appState = {
    marker: 'state-v1',
    toolPermissionContext: statePermissionContext,
  }
  let directPermissionContext = {
    ...statePermissionContext,
    alwaysAllowRules: { command: ['Write'] },
  }
  const getAppState = () => appState
  const getToolPermissionContext = () => directPermissionContext
  const context = {
    getAppState,
    getToolPermissionContext,
    options: {
      agentDefinitions: {
        activeAgents: [{ agentType: 'general-purpose' }],
      },
    },
  }
  const command = {
    allowedTools: ['Bash(git *)', 'Edit', 'Edit'],
    async getPromptForCommand() {
      return [{ type: 'text', text: 'execute safely' }]
    },
  }

  const prepared = await harness.prepareForkedCommandContext(
    command,
    '',
    context,
  )
  assert.deepEqual(
    prepared.modifiedGetAppState().toolPermissionContext.alwaysAllowRules,
    {
      command: ['Read', 'Bash(git *)', 'Edit'],
      mcp: ['server'],
    },
  )
  assert.deepEqual(
    prepared.modifiedGetToolPermissionContext().alwaysAllowRules,
    { command: ['Write', 'Bash(git *)', 'Edit'] },
  )
  assert.deepEqual(statePermissionContext.alwaysAllowRules.command, [
    'Read',
    'Bash(git *)',
  ])
  assert.deepEqual(directPermissionContext.alwaysAllowRules.command, ['Write'])

  appState = {
    marker: 'state-v2',
    toolPermissionContext: {
      ...statePermissionContext,
      alwaysAllowRules: { command: ['Glob'] },
    },
  }
  directPermissionContext = {
    ...directPermissionContext,
    alwaysAllowRules: { command: ['Grep'] },
  }
  assert.equal(prepared.modifiedGetAppState().marker, 'state-v2')
  assert.deepEqual(
    prepared.modifiedGetAppState().toolPermissionContext.alwaysAllowRules
      .command,
    ['Glob', 'Bash(git *)', 'Edit'],
  )
  assert.deepEqual(
    prepared.modifiedGetToolPermissionContext().alwaysAllowRules.command,
    ['Grep', 'Bash(git *)', 'Edit'],
  )

  const empty = await harness.prepareForkedCommandContext(
    { ...command, allowedTools: [] },
    '',
    context,
  )
  assert.strictEqual(empty.modifiedGetAppState, getAppState)
  assert.strictEqual(
    empty.modifiedGetToolPermissionContext,
    getToolPermissionContext,
  )
  assert.strictEqual(
    harness.addAllowedToolsToPermissionContext(directPermissionContext, []),
    directPermissionContext,
  )
})
