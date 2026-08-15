import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.104-to-2.1.105'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_104_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_105_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
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

const units = new Map([
  [
    11253,
    [
      8796056,
      8796752,
      'FunctionDeclaration',
      'e341b95963e574f31c23f1fca6a6878693d3b11aa97d09830fe9f908a75901f0',
    ],
  ],
  [
    17853,
    [
      12515420,
      12515679,
      'FunctionDeclaration',
      '90fdfcad41286609fb06fedc38ebe7c846d825dab4def23f30bbc9f957dd3574',
    ],
  ],
  [
    18906,
    [
      13385353,
      13389608,
      'FunctionDeclaration',
      '3339564afd87ee84808e67d88ebff02b11dcbe94c6d4a467ab32e5a910509715',
    ],
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
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

async function executeCostHook(contents, initialLastGracefulShutdown) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(contents, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const fps = { averageFps: 54, low1PctFps: 21 }
  const state = {
    config: { lastGracefulShutdown: initialLastGracefulShutdown },
    configWrites: 0,
    costSaves: [],
    shutdown: false,
  }
  let cleanup
  const beforeListeners = new Set(process.listeners('exit'))
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id === 'react') {
        return {
          useEffect(callback) {
            cleanup = callback()
          },
        }
      }
      if (id.endsWith('/cost-tracker.js')) {
        return {
          formatTotalCost: () => '$0.00',
          saveCurrentSessionCosts: metrics => state.costSaves.push(metrics),
        }
      }
      if (id.endsWith('/billing.js')) {
        return { hasConsoleBillingAccess: () => false }
      }
      if (id.endsWith('/config.js')) {
        return {
          getCurrentProjectConfig: () => state.config,
          saveCurrentProjectConfig: update => {
            state.configWrites++
            state.config = update(state.config)
          },
        }
      }
      if (id.endsWith('/gracefulShutdown.js')) {
        return { isShuttingDown: () => state.shutdown }
      }
      throw new Error(`unexpected cost-hook import: ${id}`)
    },
    module.exports,
    module,
  )

  try {
    module.exports.useCostSummary(() => fps)
    assert.equal(typeof cleanup, 'function')
    const addedListeners = process
      .listeners('exit')
      .filter(listener => !beforeListeners.has(listener))
    assert.equal(addedListeners.length, 1)
    return {
      cleanup,
      exitListener: addedListeners[0],
      fps,
      state,
    }
  } catch (error) {
    for (const listener of process.listeners('exit')) {
      if (!beforeListeners.has(listener)) process.off('exit', listener)
    }
    throw error
  }
}

test(
  'authenticated target105 pins the complete graceful-shutdown persistence boundary',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    for (const [index, [start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [start, end, nodeType, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    assert.equal(occurrences(baseline, 'lastGracefulShutdown'), 0)
    assert.equal(occurrences(target, 'lastGracefulShutdown'), 4)
    assert.equal(occurrences(latest, 'lastGracefulShutdown'), 4)
    assert.equal(occurrences(baseline, 'last_session_graceful_shutdown'), 0)
    assert.equal(occurrences(target, 'last_session_graceful_shutdown'), 1)
    assert.equal(occurrences(latest, 'last_session_graceful_shutdown'), 1)

    assert.match(
      target.slice(8796056, 8796752),
      /lastGracefulShutdown:\w+\(\)/,
    )
    assert.match(
      target.slice(12515420, 12515679),
      /lastGracefulShutdown!==!1/,
    )
    assert.match(
      target.slice(12515420, 12515679),
      /lastGracefulShutdown:!1/,
    )
    assert.match(
      target.slice(13385353, 13389608),
      /last_session_graceful_shutdown:\w+\.lastGracefulShutdown\?\?!1/,
    )
  },
)

test(
  'authored source preserves save, reset, cleanup, config, and telemetry edges',
  sourceOptions,
  () => {
    const tracker = source('cost-tracker.ts')
    const hook = source('costHook.ts')
    const config = source('utils/config.ts')
    const setup = source('setup.ts')

    assert.match(
      tracker,
      /import \{ isShuttingDown \} from '\.\/utils\/gracefulShutdown\.js'/,
    )
    assert.match(tracker, /lastGracefulShutdown: isShuttingDown\(\)/)
    assert.match(config, /lastGracefulShutdown\?: boolean/)
    assert.match(
      hook,
      /getCurrentProjectConfig\(\)\.lastGracefulShutdown !== false/,
    )
    assert.match(hook, /lastGracefulShutdown: false/)
    assert.match(
      hook,
      /if \(isShuttingDown\(\)\) \{\s*saveCurrentSessionCosts\(getFpsMetrics\?\.\(\)\)/,
    )
    assert.match(
      setup,
      /last_session_graceful_shutdown:\s*projectConfig\.lastGracefulShutdown \?\? false/,
    )
  },
)

test(
  'cost hook resets an unknown prior state and saves only for exit or shutdown cleanup',
  sourceOptions,
  async () => {
    const contents = source('costHook.ts')

    const ordinary = await executeCostHook(contents, undefined)
    try {
      assert.equal(ordinary.state.configWrites, 1)
      assert.equal(ordinary.state.config.lastGracefulShutdown, false)
      ordinary.cleanup()
      assert.deepEqual(ordinary.state.costSaves, [])
    } finally {
      ordinary.cleanup()
    }

    const graceful = await executeCostHook(contents, false)
    try {
      assert.equal(graceful.state.configWrites, 0)
      graceful.exitListener()
      assert.deepEqual(graceful.state.costSaves, [graceful.fps])
      graceful.state.shutdown = true
      graceful.cleanup()
      assert.deepEqual(graceful.state.costSaves, [graceful.fps, graceful.fps])
    } finally {
      graceful.cleanup()
    }
  },
)
