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

const targetUnits = new Map([
  [
    17594,
    [
      10890358,
      10890480,
      '3155fb21253d7b2028d3e4d4b9f0a69fc1509820ca613f69afa8c581bf360df9',
    ],
  ],
  [
    17595,
    [
      10890480,
      10890630,
      '2b1b3134cb619e72e1cac8aeb2bd1567a4ddebb82b45b0ca9dabe1204138c2a1',
    ],
  ],
  [
    17596,
    [
      10890630,
      10890746,
      '9b2d2396bebe99584923ed552b45f7e0f6109fa72cf12f5cb60a4f7d5d63d757',
    ],
  ],
  [
    17597,
    [
      10890746,
      10890763,
      '8fea74261aad7becc3600f92b862d8d9210092ec843bee03e5dd2d38a4e042c7',
    ],
  ],
  [
    17598,
    [
      10890763,
      10890790,
      '06beb51aca2d8d070bbdfeb810efce6419d82b1c13a85431ad6f83cfcb80cd45',
    ],
  ],
  [
    17601,
    [
      10890824,
      10891888,
      '349ec82717fb4c901bdcf64dfbaecb09a09291e6371d1e290c6f87c31b30085d',
    ],
  ],
  [
    19756,
    [
      11999818,
      12000242,
      'c394b82c762ddc1ee069310034eac4c7261a911c5d10d5bcdd8f0c64026ad8ad',
    ],
  ],
  [
    19757,
    [
      12000242,
      12000625,
      'db69a02de42eed44e3746d289cdd9fc71acc134690e3c482db7fa636d12b6cbd',
    ],
  ],
  [
    19758,
    [
      12000625,
      12000695,
      'aaf1dfc76e8156de8200171627bcc8424d04faae18d6d87922d8c7dcc8dc3fca',
    ],
  ],
  [
    19759,
    [
      12000695,
      12000731,
      'e3b52a0ef340cd5c18560cdb78bd14b71ef78903cd90fcafbecf43733e0e64f3',
    ],
  ],
  [
    19760,
    [
      12000731,
      12000820,
      '3f002261e9ead3f552f94374bce8797a0cfa6136f2e695e551e5670c93a1c2ec',
    ],
  ],
  [
    19998,
    [
      12102133,
      12160049,
      '3b17ff0bd496c0d7f39baa8f2542135ed7dd3f220d3f6a628ae7f7040c9492c5',
    ],
  ],
])

const addedOccurrences = [
  ['remoteControlUpsellSeenCount', 10890443, 10890471],
  ['remoteControlUpsellSeenCount', 10890507, 10890535],
  ['remoteControlUpsellSeenCount', 10890553, 10890581],
  ['remoteControlUpsellSeenCount', 10890597, 10890625],
  ['control this session from your phone \\xB7 ', 12000391, 12000435],
  ['tengu_rc_upsell_notification_shown', 12000540, 12000576],
  ['rc-idle-upsell', 12000714, 12000730],
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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

async function compileCommonJs(contents, jsx = false) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: {
      jsx: jsx ? ts.JsxEmit.ReactJSX : undefined,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

function executeCommonJs(javascript, mocks, extra = {}) {
  const module = { exports: {} }
  new Function(
    'require',
    'exports',
    'module',
    ...Object.keys(extra),
    javascript,
  )(
    id => {
      assert.ok(id in mocks, `unexpected import ${id}`)
      return mocks[id]
    },
    module.exports,
    module,
    ...Object.values(extra),
  )
  return module.exports
}

test(
  'authenticated target116 adds the capped Remote Control idle upsell graph',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.114 and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(targetBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    for (const [index, [start, end, hash]] of targetUnits) {
      const region = structural.regions[index]
      assert.ok(region, `target unit ${index} must exist`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
      )
      assert.equal(sha256(target.slice(start, end)), hash)
    }

    for (const [value, start, end] of addedOccurrences) {
      assert.equal(baseline.split(value).length - 1, 0)
      assert.ok(target.slice(start, end).includes(value))
    }
    assert.equal(
      target.split('remoteControlUpsellSeenCount').length - 1,
      4,
    )
    const helperGraph = target.slice(10890358, 10890790)
    assert.match(helperGraph, /<Ku1/)
    assert.match(helperGraph, /Ku1=3,WQ7=20/)
    const hookGraph = target.slice(11999818, 12000820)
    assert.match(hookGraph, /Z7\(\)\|\|H===0\|\|\$\|\|A/)
    assert.match(hookGraph, /timeoutMs:2147483647/)
    assert.ok(target.slice(12102133, 12160049).includes('o74(xG,FK)'))
  },
)

test(
  'source idle upsell enforces eligibility, persists the cap, and cleans up the notification',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const utility = fs.readFileSync(
      path.join(sourceRoot, 'utils/remoteControlUpsell.ts'),
      'utf8',
    )
    const configSource = fs.readFileSync(
      path.join(sourceRoot, 'utils/config.ts'),
      'utf8',
    )
    const hook = fs.readFileSync(
      path.join(sourceRoot, 'hooks/notifs/useRemoteControlIdleUpsell.tsx'),
      'utf8',
    )
    const bridge = fs.readFileSync(
      path.join(sourceRoot, 'commands/bridge/bridge.tsx'),
      'utf8',
    )
    const repl = fs.readFileSync(
      path.join(sourceRoot, 'screens/REPL.tsx'),
      'utf8',
    )

    assert.match(
      configSource,
      /remoteControlUpsellSeenCount\?: number/,
    )
    assert.match(
      bridge,
      /markRemoteControlUsed\(\);\s*if \(shouldShowRemoteCallout\(\)\)/,
    )
    assert.match(
      repl,
      /useRemoteControlIdleUpsell\(lastQueryCompletionTime, isLoading\)/,
    )

    let bridgeEnabled = true
    let startupEnabled = false
    let config = {}
    const utilityExports = executeCommonJs(
      await compileCommonJs(utility),
      {
        '../bridge/bridgeEnabled.js': {
          isBridgeEnabled: () => bridgeEnabled,
        },
        './config.js': {
          getGlobalConfig: () => config,
          getRemoteControlAtStartup: () => startupEnabled,
          saveGlobalConfig: update => {
            config = update(config)
          },
        },
      },
    )

    assert.equal(utilityExports.REMOTE_CONTROL_UPSELL_MAX_SHOW_COUNT, 3)
    assert.equal(utilityExports.REMOTE_CONTROL_UPSELL_IDLE_MINUTES, 20)
    assert.equal(utilityExports.shouldShowRemoteControlUpsell(), true)
    bridgeEnabled = false
    assert.equal(utilityExports.shouldShowRemoteControlUpsell(), false)
    bridgeEnabled = true
    startupEnabled = true
    assert.equal(utilityExports.shouldShowRemoteControlUpsell(), false)
    startupEnabled = false
    config = { hasUsedRemoteControl: true }
    assert.equal(utilityExports.shouldShowRemoteControlUpsell(), false)
    config = { remoteControlUpsellSeenCount: 3 }
    assert.equal(utilityExports.shouldShowRemoteControlUpsell(), false)
    config = { remoteControlUpsellSeenCount: 1 }
    utilityExports.markRemoteControlUpsellShown()
    assert.equal(config.remoteControlUpsellSeenCount, 2)
    utilityExports.markRemoteControlUsed()
    assert.equal(config.hasUsedRemoteControl, true)

    const notifications = []
    const removals = []
    const events = []
    const timers = []
    let cleanup
    let remoteMode = false
    let appState = {
      replBridgeEnabled: false,
      replBridgeOutboundOnly: false,
    }
    let eligible = true
    let shown = 0
    const hookExports = executeCommonJs(
      await compileCommonJs(hook, true),
      {
        react: {
          useEffect: effect => {
            cleanup = effect()
          },
          useRef: value => ({ current: value }),
        },
        'react/jsx-runtime': {
          Fragment: Symbol.for('fragment'),
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        },
        '../../bootstrap/state.js': {
          getIsRemoteMode: () => remoteMode,
        },
        '../../context/notifications.js': {
          useNotifications: () => ({
            addNotification: notification => notifications.push(notification),
            removeNotification: key => removals.push(key),
          }),
        },
        '../../ink.js': { Text: 'Text' },
        '../../services/analytics/index.js': {
          logEvent: (...args) => events.push(args),
        },
        '../../state/AppState.js': {
          useAppState: selector => selector(appState),
        },
        '../../utils/remoteControlUpsell.js': {
          markRemoteControlUpsellShown: () => shown++,
          REMOTE_CONTROL_UPSELL_IDLE_MINUTES: 20,
          shouldShowRemoteControlUpsell: () => eligible,
        },
      },
      {
        setTimeout: (callback, delay, ...args) => {
          const timer = { callback, delay, args }
          timers.push(timer)
          return timer
        },
        clearTimeout: timer => {
          timer.cleared = true
        },
      },
    )

    const completedAt = Date.now() - 21 * 60_000
    hookExports.useRemoteControlIdleUpsell(completedAt, false)
    assert.equal(timers.length, 1)
    assert.equal(timers[0].delay, 0)
    timers[0].callback(...timers[0].args)
    timers[0].callback(...timers[0].args)
    assert.equal(shown, 1)
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].key, 'rc-idle-upsell')
    assert.equal(notifications[0].priority, 'medium')
    assert.equal(notifications[0].timeoutMs, 2_147_483_647)
    assert.deepEqual(events.map(([name]) => name), [
      'tengu_rc_upsell_notification_shown',
    ])
    cleanup()
    assert.equal(timers[0].cleared, true)
    assert.deepEqual(removals, ['rc-idle-upsell'])

    appState = { replBridgeEnabled: true, replBridgeOutboundOnly: false }
    hookExports.useRemoteControlIdleUpsell(completedAt, false)
    remoteMode = true
    appState = { replBridgeEnabled: false, replBridgeOutboundOnly: false }
    hookExports.useRemoteControlIdleUpsell(completedAt, false)
    eligible = false
    remoteMode = false
    hookExports.useRemoteControlIdleUpsell(completedAt, false)
    assert.equal(timers.length, 1)
  },
)
