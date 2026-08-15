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

const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'
const units = {
  baselineToggle: {
    index: 16802,
    start: 10577435,
    end: 10577747,
    sourceHash:
      '26ef987b6b8d5a1fb7202f9d8b6c654b5816ad696d9cc93752024d9675d41a1e',
  },
  targetToggle: {
    index: 16947,
    start: 10632609,
    end: 10632914,
    sourceHash:
      '4dbd96907e0c8eb35d4ee0417f80874d120d8c6796647ce0661359860ef7770f',
  },
  bridgeHandler: {
    index: 16961,
    start: 10636747,
    end: 10637116,
    sourceHash:
      'b3c3e39dba5721340ebb5be7a0c407ae2333d13028686323cb032152c8f1d062',
  },
  descriptors: {
    index: 16964,
    start: 10637160,
    end: 10637629,
    sourceHash:
      'b56a58a674e2156e5faef38ea6252143a734c541b73281bf6fa60dc6f3c6c3d2',
  },
  commandRegistry: {
    index: 17739,
    start: 11007229,
    end: 11010099,
    sourceHash:
      '81ac5df822d04b88f9386f0eb4a69a6c33085df1cfc302acdb8420c6d30c2a8a',
  },
}
const typedRows = [
  {
    historicalRow: 674,
    currentRow: 551,
    literalKind: 'string',
    value: 'Fast mode is not available.',
    baselineOccurrenceCount: 0,
    targetOccurrenceNumber: 1,
    start: 10636805,
    end: 10636834,
    structuralIndex: 16961,
    targetText: '"Fast mode is not available."',
  },
  {
    historicalRow: 675,
    currentRow: 552,
    literalKind: 'string',
    value: 'Unknown argument "',
    baselineOccurrenceCount: 0,
    targetOccurrenceNumber: 1,
    start: 10636993,
    end: 10637011,
    structuralIndex: 16961,
    targetText: 'Unknown argument "',
  },
  {
    historicalRow: 676,
    currentRow: 553,
    literalKind: 'string',
    value: '". Use: /fast [on|off]',
    baselineOccurrenceCount: 0,
    targetOccurrenceNumber: 1,
    start: 10637015,
    end: 10637037,
    structuralIndex: 16961,
    targetText: '". Use: /fast [on|off]',
  },
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

async function createRuntime(overrides = {}) {
  const runtime = {
    featureEnabled: true,
    unavailableReason: null,
    prefetches: 0,
    cooldownClears: 0,
    appState: {
      fastMode: false,
      mainLoopModel: 'unsupported-model',
      mainLoopModelForSession: 'session-model',
    },
    settingsWrites: [],
    events: [],
    ...overrides,
  }
  const fastMode = {
    clearFastModeCooldown() {
      runtime.cooldownClears += 1
    },
    FAST_MODE_MODEL_DISPLAY: 'Opus 4.6',
    getFastModeModel: () => 'fast-model',
    getFastModeUnavailableReason: () => runtime.unavailableReason,
    isFastModeSupportedByModel: model =>
      model === 'fast-model' || model === 'supported-model',
    isFastModeEnabled: () => runtime.featureEnabled,
    async prefetchFastModeStatus() {
      runtime.prefetches += 1
    },
  }
  const sharedJavascript = await transpile(
    'commands/fast/fastModeShared.ts',
  )
  const shared = instantiate(sharedJavascript, specifier => {
    if (specifier.endsWith('/components/FastIcon.js')) {
      return { getFastIconString: () => '⚡' }
    }
    if (specifier.endsWith('/services/analytics/index.js')) {
      return {
        logEvent(name, attributes) {
          runtime.events.push({ name, attributes })
        },
      }
    }
    if (specifier.endsWith('/utils/fastMode.js')) return fastMode
    if (specifier.endsWith('/utils/modelCost.js')) {
      return {
        formatModelPricing: () => '$5',
        getOpus46CostTier: () => ({ tier: 'test' }),
      }
    }
    if (specifier.endsWith('/utils/settings/settings.js')) {
      return {
        updateSettingsForSource(sourceName, settings) {
          runtime.settingsWrites.push({ sourceName, settings })
        },
      }
    }
    throw new Error(`unexpected shared fast-mode import: ${specifier}`)
  })

  const handlerJavascript = await transpile(
    'commands/fast/fast-noninteractive.ts',
  )
  const handler = instantiate(handlerJavascript, specifier => {
    if (specifier.endsWith('/utils/fastMode.js')) return fastMode
    if (specifier.endsWith('/fastModeShared.js')) return shared
    throw new Error(`unexpected noninteractive fast-mode import: ${specifier}`)
  })
  runtime.context = {
    getAppState: () => runtime.appState,
    setAppState(updater) {
      runtime.appState = updater(runtime.appState)
    },
  }
  runtime.call = args => handler.call(args, runtime.context)
  return runtime
}

test(
  'authenticated target116 adds a bridge-safe text counterpart for /fast',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    const baselineRegion = structural.unmatchedBaseline.find(
      candidate => candidate.index === units.baselineToggle.index,
    )
    assert.ok(baselineRegion)
    assert.deepEqual(
      [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
      [
        units.baselineToggle.start,
        units.baselineToggle.end,
        units.baselineToggle.sourceHash,
      ],
    )
    const baselineToggle = baseline.slice(
      units.baselineToggle.start,
      units.baselineToggle.end,
    )
    assert.equal(sha256(baselineToggle), units.baselineToggle.sourceHash)
    assert.match(baselineToggle, /source:"shortcut"/)

    for (const unit of [
      units.targetToggle,
      units.bridgeHandler,
      units.descriptors,
      units.commandRegistry,
    ]) {
      const region = structural.regions[unit.index]
      assert.ok(region)
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
      )
    }

    for (const row of typedRows) {
      assert.equal(row.literalKind, 'string')
      assert.equal(row.baselineOccurrenceCount, 0)
      assert.equal(row.targetOccurrenceNumber, 1)
      assert.equal(row.structuralIndex, units.bridgeHandler.index)
      assert.equal(target.slice(row.start, row.end), row.targetText)
    }

    const targetToggle = target.slice(
      units.targetToggle.start,
      units.targetToggle.end,
    )
    const bridgeHandler = target.slice(
      units.bridgeHandler.start,
      units.bridgeHandler.end,
    )
    const descriptors = target.slice(
      units.descriptors.start,
      units.descriptors.end,
    )
    const registry = target.slice(
      units.commandRegistry.start,
      units.commandRegistry.end,
    )
    assert.match(targetToggle, /async function B88\(H,\$,q,K\)/)
    assert.match(targetToggle, /source:K/)
    assert.match(bridgeHandler, /Fast mode is not available\./)
    assert.match(bridgeHandler, /q===""\)K=!\$\.getAppState\(\)\.fastMode/)
    assert.match(bridgeHandler, /Use: \/fast \[on\|off\]/)
    assert.match(bridgeHandler, /B88\(K,\$\.getAppState,\$\.setAppState,"bridge"\)/)
    assert.match(descriptors, /type:"local",name:"fast",supportsNonInteractive:!0/)
    assert.match(descriptors, /argumentHint:"\[on\|off\]"/)
    assert.match(registry, /Gl7=new Set\(\[[^\]]*CB7/)
  },
)

test(
  'source executes the target bridge argument matrix and preserves telemetry provenance',
  sourceOptions,
  async () => {
    const disabled = await createRuntime({ featureEnabled: false })
    assert.deepEqual(await disabled.call(''), {
      type: 'text',
      value: 'Fast mode is not available.',
    })
    assert.equal(disabled.prefetches, 0)
    assert.deepEqual(disabled.events, [])

    const invalid = await createRuntime()
    assert.deepEqual(await invalid.call(' Wat '), {
      type: 'text',
      value: 'Unknown argument "wat". Use: /fast [on|off]',
    })
    assert.equal(invalid.prefetches, 1)
    assert.deepEqual(invalid.events, [])

    const toggled = await createRuntime()
    assert.deepEqual(await toggled.call(''), {
      type: 'text',
      value: '⚡ Fast mode ON · model set to Opus 4.6 · $5',
    })
    assert.deepEqual(toggled.appState, {
      fastMode: true,
      mainLoopModel: 'fast-model',
      mainLoopModelForSession: null,
    })
    assert.deepEqual(toggled.settingsWrites.at(-1), {
      sourceName: 'userSettings',
      settings: { fastMode: true },
    })
    assert.deepEqual(toggled.events.at(-1), {
      name: 'tengu_fast_mode_toggled',
      attributes: { enabled: true, source: 'bridge' },
    })

    assert.deepEqual(await toggled.call(' OFF '), {
      type: 'text',
      value: 'Fast mode OFF',
    })
    assert.equal(toggled.appState.fastMode, false)
    assert.deepEqual(toggled.settingsWrites.at(-1), {
      sourceName: 'userSettings',
      settings: { fastMode: undefined },
    })
    assert.deepEqual(toggled.events.at(-1), {
      name: 'tengu_fast_mode_toggled',
      attributes: { enabled: false, source: 'bridge' },
    })

    const unavailable = await createRuntime({
      unavailableReason: 'disabled by organization',
    })
    assert.deepEqual(await unavailable.call('on'), {
      type: 'text',
      value: 'Fast mode unavailable: disabled by organization',
    })
    assert.equal(unavailable.prefetches, 1)
    assert.deepEqual(unavailable.settingsWrites, [])
    assert.deepEqual(unavailable.events, [])

    const supported = await createRuntime({
      appState: {
        fastMode: false,
        mainLoopModel: 'supported-model',
        mainLoopModelForSession: 'session-model',
      },
    })
    assert.deepEqual(await supported.call('ON'), {
      type: 'text',
      value: '⚡ Fast mode ON · $5',
    })
    assert.equal(supported.appState.mainLoopModel, 'supported-model')
    assert.equal(supported.appState.mainLoopModelForSession, 'session-model')
  },
)

test(
  'source registers only the text counterpart as bridge-safe and keeps TUI telemetry distinct',
  sourceOptions,
  async () => {
    const indexSource = source('commands/fast/index.ts')
    const interactiveSource = source('commands/fast/fast.tsx')
    const handlerSource = source('commands/fast/fast-noninteractive.ts')
    const commandSource = source('commands.ts')

    assert.doesNotMatch(handlerSource, /from ['"]react/)
    assert.match(
      indexSource,
      /export const fastNonInteractive = \{[\s\S]*type: 'local',[\s\S]*supportsNonInteractive: true/,
    )
    assert.match(indexSource, /import\('\.\/fast-noninteractive\.js'\)/)
    assert.match(
      interactiveSource,
      /handleFastModeShortcut\([\s\S]*?'shortcut'\)/,
    )
    assert.match(
      commandSource,
      /import fast, \{ fastNonInteractive \} from '\.\/commands\/fast\/index\.js'/,
    )
    const bridgeSafeBlock = commandSource.match(
      /export const BRIDGE_SAFE_COMMANDS[\s\S]*?\n\)/,
    )?.[0]
    assert.ok(bridgeSafeBlock)
    assert.match(bridgeSafeBlock, /fastNonInteractive/)
    assert.doesNotMatch(bridgeSafeBlock, /\n\s*fast,/)

    await Promise.all([
      transpile('commands/fast/fastModeShared.ts'),
      transpile('commands/fast/fast-noninteractive.ts'),
      transpile('commands/fast/index.ts'),
      transpile('commands/fast/fast.tsx', true),
      transpile('commands.ts'),
    ])
  },
)
