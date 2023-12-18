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
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const units = [
  {
    index: 14870,
    nodeType: 'FunctionDeclaration',
    start: 9294795,
    end: 9295468,
    sourceHash:
      'a94d24027a5a131c0fe4bc260b2e807e861c46663ac58b7135cc814b89a237d7',
  },
  {
    index: 17377,
    nodeType: 'FunctionDeclaration',
    start: 10830784,
    end: 10831521,
    sourceHash:
      '287a3876ef74dc8e830f46e14c4f7a7b6e9b5345a13291e0dfaa0bb0eac1c047',
  },
  {
    index: 17378,
    nodeType: 'FunctionDeclaration',
    start: 10831521,
    end: 10831877,
    sourceHash:
      '766017ee7ccacdc384793436183bacbb2c56b8e1d2811849d01de516a8cb4615',
  },
  {
    index: 17383,
    nodeType: 'FunctionDeclaration',
    start: 10832210,
    end: 10832494,
    sourceHash:
      '63d2247c984283d2c7d0afe66f962cebfd6a56de51c60f6b691cb23a8dcc9a40',
  },
  {
    index: 17476,
    nodeType: 'VariableDeclaration',
    start: 10858486,
    end: 10858553,
    sourceHash:
      '9a7fa1d41022f9a848301f861f526f8f89032efe05e19d859e537ef08305ad17',
  },
  {
    index: 17479,
    nodeType: 'FunctionDeclaration',
    start: 10858587,
    end: 10859129,
    sourceHash:
      'a8401df2ac637e3168274938c3a85004aaf16438c4972accbcee59a9985e921d',
  },
  {
    index: 17481,
    nodeType: 'VariableDeclaration',
    start: 10859137,
    end: 10859208,
    sourceHash:
      'd096154fbea2afae48912990d2fb1bee13891a457b3f190e3ce3c7a1aa6cbf2d',
  },
  {
    index: 17483,
    nodeType: 'VariableDeclaration',
    start: 10859220,
    end: 10859481,
    sourceHash:
      '96bd2fbfbc1caf41d75b8ce90e7474085489565e6fcd1a2a781213c95a68d940',
  },
  {
    index: 17486,
    nodeType: 'FunctionDeclaration',
    start: 10859515,
    end: 10859813,
    sourceHash:
      '4cead62036e972e1d31bf3010ec00a5c096b015016ca78c2eda7e0f2f85d9da7',
  },
  {
    index: 17488,
    nodeType: 'VariableDeclaration',
    start: 10859821,
    end: 10859946,
    sourceHash:
      '85f1d6f300fa3ab5871a10afd228c59b2a7c8acc377df9ee78299db1f34b4d0f',
  },
  {
    index: 17502,
    nodeType: 'VariableDeclaration',
    start: 10863492,
    end: 10863923,
    sourceHash:
      'b0b8abfa73e0299074b520111e84110af27374e8148e89cce908b34978f7d9e1',
  },
  {
    index: 17558,
    nodeType: 'FunctionDeclaration',
    start: 10882998,
    end: 10883494,
    sourceHash:
      '0bfea73ebe0c2304fbb4be2f571395af29dcb06a40f3eb3fb29bd6f44d8ba1c0',
  },
  {
    index: 17561,
    nodeType: 'VariableDeclaration',
    start: 10883543,
    end: 10883992,
    sourceHash:
      '7d4af9cdfec8cc752d74e3f1193957e3fd82eaf9521fe3c0d026a38ba7a2074c',
  },
  {
    index: 17739,
    nodeType: 'VariableDeclaration',
    start: 11007229,
    end: 11010099,
    sourceHash:
      '81ac5df822d04b88f9386f0eb4a69a6c33085df1cfc302acdb8420c6d30c2a8a',
  },
]

const literalPins = [
  { historicalRow: 690, currentRow: 560, value: 'Current mode: ', start: 10858702, end: 10858716, structuralIndex: 17479 },
  { historicalRow: 691, currentRow: 561, value: 'bypassPermissions is not available via /mode. Use the local TUI (shift+tab) instead.', targetText: '"bypassPermissions is not available via /mode. Use the local TUI (shift+tab) instead."', start: 10858803, end: 10858889, structuralIndex: 17479 },
  { historicalRow: 692, currentRow: 562, value: 'Unknown mode "', start: 10858937, end: 10858951, structuralIndex: 17479 },
  { historicalRow: 693, currentRow: 563, value: 'Permission mode set to ', start: 10859078, end: 10859101, structuralIndex: 17479 },
  { historicalRow: 694, currentRow: 564, value: 'Usage: /mode <', start: 10859173, end: 10859187, structuralIndex: 17481 },
  { historicalRow: 695, currentRow: 565, value: 'Set the permission mode (', start: 10859284, end: 10859309, structuralIndex: 17483 },
  { historicalRow: 697, currentRow: 567, value: 'Usage: /model <name>. Available: ', start: 10859863, end: 10859896, structuralIndex: 17488 },
  { historicalRow: 698, currentRow: 568, value: ', default, or a full model ID.', start: 10859912, end: 10859942, structuralIndex: 17488 },
  { historicalRow: 699, currentRow: 569, value: 'Set the AI model for Claude Code', targetText: '"Set the AI model for Claude Code"', start: 10863587, end: 10863621, structuralIndex: 17502 },
  { historicalRow: 701, currentRow: 571, value: 'Usage: /effort <low|medium|high|xhigh|max|auto>', targetText: '"Usage: /effort <low|medium|high|xhigh|max|auto>"', start: 10883287, end: 10883336, structuralIndex: 17558 },
]

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

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
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

async function transpile(relative, jsx = false) {
  const ts = await loadTypeScript()
  const result = ts.transpileModule(source(relative), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
    fileName: relative,
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], `${relative} must syntax-transpile cleanly`)
  return result.outputText
}

function instantiate(javascript, requireStub) {
  const module = { exports: {} }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return module.exports
}

async function extractFunction(relative, functionName) {
  const ts = await loadTypeScript()
  const owner = source(relative)
  const ast = ts.createSourceFile(
    relative,
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = ast.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName,
  )
  assert.ok(declaration, `${functionName} must be declared in ${relative}`)
  return ts.transpileModule(
    owner.slice(declaration.getFullStart(), declaration.end),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
}

test(
  'authenticated target116 adds the noninteractive mode/model/effort graph',
  bundleOptions,
  () => {
    const baseline = fs.readFileSync(baselinePath, 'utf8')
    const target = fs.readFileSync(targetPath, 'utf8')
    assert.equal(sha256(baseline), baselineSha256)
    assert.equal(sha256(target), targetSha256)

    for (const unit of units) {
      const region = structural.regions[unit.index]
      assert.ok(region, `target unit ${unit.index}: structural row`)
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [
          region.target.nodeType,
          region.target.start,
          region.target.end,
          region.target.sourceHash,
        ],
        [unit.nodeType, unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
      )
    }

    assert.equal(
      baseline.includes('bypassPermissions is not available via /mode'),
      false,
    )
    assert.equal(baseline.includes('Usage: /model <name>. Available: '), false)
    assert.equal(
      baseline.includes('Usage: /effort <low|medium|high|xhigh|max|auto>'),
      false,
    )
    assert.equal(target.includes('bypassPermissions is not available via /mode'), true)
    assert.equal(target.includes('Usage: /model <name>. Available: '), true)
    assert.equal(
      target.includes('Usage: /effort <low|medium|high|xhigh|max|auto>'),
      true,
    )

    for (const pin of literalPins) {
      assert.equal(target.slice(pin.start, pin.end), pin.targetText ?? pin.value)
    }

    const permissionHelper = target.slice(units[0].start, units[0].end)
    assert.match(permissionHelper, /isBypassPermissionsModeAvailable/)
    assert.match(permissionHelper, /setImmediate/)
    assert.match(permissionHelper, /recheckPermission/)

    const modelHandler = target.slice(units[8].start, units[8].end)
    assert.match(modelHandler, /tengu_model_command_inline/)
    assert.match(modelHandler, /getAppState/)
    assert.match(modelHandler, /setAppState/)

    const registry = target.slice(units.at(-1).start, units.at(-1).end)
    assert.match(registry, /tc7,hc7/)
    assert.match(registry, /Ij6/)
  },
)

test('source exposes dual descriptors and only the text counterparts are bridge-safe', sourceOptions, async () => {
  const commands = source('commands.ts')
  const modeIndex = source('commands/mode/index.ts')
  const modelIndex = source('commands/model/index.ts')
  const effortIndex = source('commands/effort/index.ts')
  const modelJSX = source('commands/model/model.tsx')

  assert.match(modeIndex, /type: 'local'/)
  assert.match(modeIndex, /supportsNonInteractive: true/)
  assert.match(modeIndex, /isEnabled: \(\) => false/)
  assert.match(modeIndex, /return true/)
  assert.match(modelIndex, /export const modelNonInteractive/)
  assert.match(modelIndex, /export const model =/)
  assert.match(effortIndex, /export const effortNonInteractive/)
  assert.match(effortIndex, /export const effort =/)
  assert.match(modelJSX, /executeModelChange\(args, store\.getState, setAppState\)/)
  assert.match(modelJSX, /renderCurrentModel/)
  assert.doesNotMatch(modelJSX, /function isKnownAlias/)

  assert.match(
    commands,
    /import model, \{ modelNonInteractive \} from '\.\/commands\/model\/index\.js'/,
  )
  assert.match(
    commands,
    /import effort, \{ effortNonInteractive \} from '\.\/commands\/effort\/index\.js'/,
  )
  assert.match(commands, /import mode from '\.\/commands\/mode\/index\.js'/)
  const bridgeStart = commands.indexOf('export const BRIDGE_SAFE_COMMANDS')
  const bridgeEnd = commands.indexOf('/**', bridgeStart + 3)
  const bridge = commands.slice(bridgeStart, bridgeEnd)
  assert.match(bridge, /effortNonInteractive/)
  assert.match(bridge, /modelNonInteractive/)
  assert.match(bridge, /mode/)
  assert.doesNotMatch(bridge, /\n\s+effort,/)
  assert.doesNotMatch(bridge, /\n\s+model,/)

  for (const [relative, jsx] of [
    ['utils/permissions/permissionSetup.ts', false],
    ['commands/mode/availableModes.ts', false],
    ['commands/mode/mode.ts', false],
    ['commands/mode/index.ts', false],
    ['commands/model/modelCommand.ts', false],
    ['commands/model/model-noninteractive.ts', false],
    ['commands/model/model.tsx', true],
    ['commands/model/index.ts', false],
    ['commands/effort/effort-noninteractive.ts', false],
    ['commands/effort/effort.tsx', true],
    ['commands/effort/index.ts', false],
    ['commands.ts', false],
  ]) {
    await transpile(relative, jsx)
  }
})

test('permission-mode helper rejects unsafe transitions and rechecks queued prompts', sourceOptions, async () => {
  const javascript = await extractFunction(
    'utils/permissions/permissionSetup.ts',
    'setPermissionMode',
  )
  const runtime = {
    bypassDisabled: false,
    autoEnabled: true,
    reason: null,
    transitions: [],
    rechecks: 0,
  }
  const module = { exports: {} }
  new Function(
    'exports',
    'module',
    'isBypassPermissionsModeDisabled',
    'isAutoModeGateEnabled',
    'getAutoModeUnavailableReason',
    'getAutoModeUnavailableNotification',
    'transitionPermissionMode',
    'getLeaderToolUseConfirmQueue',
    'setImmediate',
    javascript,
  )(
    module.exports,
    module,
    () => runtime.bypassDisabled,
    () => runtime.autoEnabled,
    () => runtime.reason,
    reason => `unavailable:${reason}`,
    (from, to, context) => {
      runtime.transitions.push({ from, to })
      return { ...context, transitioned: true }
    },
    () => updater =>
      updater([
        {
          recheckPermission() {
            runtime.rechecks += 1
          },
        },
      ]),
    callback => callback(),
  )
  const { setPermissionMode } = module.exports

  let state = { mode: 'default', isBypassPermissionsModeAvailable: false }
  const setContext = updater => {
    state = updater(state)
  }

  runtime.bypassDisabled = true
  assert.match(
    setPermissionMode('bypassPermissions', state, setContext).error,
    /disabled by settings or configuration/,
  )
  runtime.bypassDisabled = false
  assert.match(
    setPermissionMode('bypassPermissions', state, setContext).error,
    /session was not launched/,
  )
  runtime.autoEnabled = false
  runtime.reason = 'model'
  assert.equal(
    setPermissionMode('auto', state, setContext).error,
    'Cannot set permission mode to auto: unavailable:model',
  )

  runtime.autoEnabled = true
  const result = setPermissionMode('plan', state, setContext)
  assert.deepEqual(result, { ok: true, mode: 'plan' })
  assert.equal(state.mode, 'plan')
  assert.equal(state.transitioned, true)
  assert.deepEqual(runtime.transitions, [
    { from: 'default', to: 'plan' },
  ])
  assert.equal(runtime.rechecks, 1)
})

test('actual text handlers execute mode, model, and effort state transitions', sourceOptions, async () => {
  const modelRuntime = {
    state: {
      fastMode: true,
      mainLoopModel: null,
      mainLoopModelForSession: 'session-model',
      effortValue: 'high',
    },
    validation: { valid: true },
    events: [],
    cooldowns: 0,
  }
  const modelShared = instantiate(
    await transpile('commands/model/modelCommand.ts'),
    specifier => {
      if (specifier === 'chalk') {
        return { bold: value => `<${value}>` }
      }
      if (specifier.endsWith('/utils/errors.js')) {
        return { errorMessage: error => error.message }
      }
      if (specifier.endsWith('/utils/extraUsage.js')) {
        return { isBilledAsExtraUsage: () => false }
      }
      if (specifier.endsWith('/utils/fastMode.js')) {
        return {
          clearFastModeCooldown() {
            modelRuntime.cooldowns += 1
          },
          isFastModeEnabled: () => true,
          isFastModeSupportedByModel: model => model === 'opus',
        }
      }
      if (specifier.endsWith('/utils/model/aliases.js')) {
        return { MODEL_ALIASES: ['sonnet', 'opus', 'haiku'] }
      }
      if (specifier.endsWith('/utils/model/check1mAccess.js')) {
        return { checkOpus1mAccess: () => true, checkSonnet1mAccess: () => true }
      }
      if (specifier.endsWith('/utils/model/model.js')) {
        return {
          getDefaultMainLoopModelSetting: () => 'sonnet',
          isOpus1mMergeEnabled: () => false,
          renderDefaultModelSetting: value => value,
        }
      }
      if (specifier.endsWith('/utils/model/modelAllowlist.js')) {
        return { isModelAllowed: model => model !== 'blocked' }
      }
      if (specifier.endsWith('/utils/model/validateModel.js')) {
        return { validateModel: async () => modelRuntime.validation }
      }
      throw new Error(`unexpected model command import: ${specifier}`)
    },
  )
  const setAppState = updater => {
    modelRuntime.state = updater(modelRuntime.state)
  }

  assert.equal(
    modelShared.renderCurrentModel(modelRuntime.state),
    'Current model: session-model (session override from plan mode)\nBase model: sonnet (default) (effort: high)',
  )
  const setSonnet = await modelShared.executeModelChange(
    'sonnet',
    () => modelRuntime.state,
    setAppState,
  )
  assert.equal(setSonnet.ok, true)
  assert.match(setSonnet.message, /Set model to <sonnet>/)
  assert.match(setSonnet.message, /Fast mode OFF/)
  assert.equal(modelRuntime.state.fastMode, false)
  assert.equal(modelRuntime.state.mainLoopModel, 'sonnet')

  const blocked = await modelShared.executeModelChange(
    'blocked',
    () => modelRuntime.state,
    setAppState,
  )
  assert.equal(blocked.ok, false)
  assert.match(blocked.message, /organization restricts model selection/)

  const modelHandler = instantiate(
    await transpile('commands/model/model-noninteractive.ts'),
    specifier => {
      if (specifier.endsWith('/constants/xml.js')) {
        return { COMMON_HELP_ARGS: ['help'], COMMON_INFO_ARGS: ['current'] }
      }
      if (specifier.endsWith('/services/analytics/index.js')) {
        return {
          logEvent(name, metadata) {
            modelRuntime.events.push({ name, metadata })
          },
        }
      }
      if (specifier.endsWith('/utils/model/aliases.js')) {
        return { MODEL_ALIASES: ['sonnet', 'opus', 'haiku'] }
      }
      if (specifier.endsWith('/modelCommand.js')) return modelShared
      throw new Error(`unexpected model handler import: ${specifier}`)
    },
  )
  const context = {
    getAppState: () => modelRuntime.state,
    setAppState,
  }
  assert.match((await modelHandler.call('', context)).value, /^Current model:/)
  assert.equal(
    (await modelHandler.call('help', context)).value,
    'Usage: /model <name>. Available: sonnet, opus, haiku, default, or a full model ID.',
  )
  assert.equal((await modelHandler.call('opus', context)).type, 'text')
  assert.equal(modelRuntime.events.at(-1).name, 'tengu_model_command_inline')

  const modeHandler = instantiate(
    await transpile('commands/mode/mode.ts'),
    specifier => {
      if (specifier.endsWith('/utils/permissions/PermissionMode.js')) {
        return { permissionModeTitle: mode => `title:${mode}` }
      }
      if (specifier.endsWith('/utils/permissions/permissionSetup.js')) {
        return {
          setPermissionMode: mode => ({ ok: true, mode }),
        }
      }
      if (specifier.endsWith('/availableModes.js')) {
        return { MODE_COMMAND_MODES: ['acceptEdits', 'auto', 'default', 'dontAsk', 'plan'] }
      }
      throw new Error(`unexpected mode handler import: ${specifier}`)
    },
  )
  const modeContext = {
    getAppState: () => ({
      toolPermissionContext: {
        mode: 'default',
        isBypassPermissionsModeAvailable: false,
      },
    }),
    setToolPermissionContext() {},
  }
  assert.match((await modeHandler.call('', modeContext)).value, /Current mode: default/)
  assert.match(
    (await modeHandler.call('bypassPermissions', modeContext)).value,
    /not available via \/mode/,
  )
  assert.match((await modeHandler.call('invalid', modeContext)).value, /Unknown mode/)
  assert.equal(
    (await modeHandler.call('plan', modeContext)).value,
    'Permission mode set to plan (title:plan)',
  )

  const effortRuntime = {
    state: {
      mainLoopModel: null,
      mainLoopModelForSession: null,
      effortValue: undefined,
    },
  }
  const effortHandler = instantiate(
    await transpile('commands/effort/effort-noninteractive.ts'),
    specifier => {
      if (specifier.endsWith('/constants/xml.js')) {
        return { COMMON_HELP_ARGS: ['help'] }
      }
      if (specifier.endsWith('/utils/model/model.js')) {
        return {
          getCanonicalName: model => `canonical:${model}`,
          getDefaultMainLoopModelSetting: () => 'default-model',
        }
      }
      if (specifier.endsWith('/effort.js')) {
        return {
          HELP: 'full effort help',
          executeEffort: value => ({
            message: `effort:${value}`,
            effortUpdate: { value },
          }),
          showCurrentEffort: (value, model) => ({
            message: `current:${String(value)}:${model}`,
          }),
        }
      }
      throw new Error(`unexpected effort handler import: ${specifier}`)
    },
  )
  const effortContext = {
    getAppState: () => effortRuntime.state,
    setAppState(updater) {
      effortRuntime.state = updater(effortRuntime.state)
    },
  }
  assert.equal((await effortHandler.call('help', effortContext)).value, 'full effort help')
  assert.equal(
    (await effortHandler.call('current', effortContext)).value,
    'current:undefined:canonical:default-model',
  )
  assert.equal(
    (await effortHandler.call('', effortContext)).value,
    'Usage: /effort <low|medium|high|xhigh|max|auto>',
  )
  assert.equal((await effortHandler.call('xhigh', effortContext)).value, 'effort:xhigh')
  assert.equal(effortRuntime.state.effortValue, 'xhigh')
})
