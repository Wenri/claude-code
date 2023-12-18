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
    7171,
    [
      5122831,
      5124677,
      'FunctionDeclaration',
      '8f19284ce6f736a9233ea731e65b918588f8938573647760f343c9f979ac6238',
    ],
  ],
  [
    7173,
    [
      5124701,
      5124857,
      'VariableDeclaration',
      'a90c0a1f8cdefea418d09ac126c14e9e807a2c9faa0b3f37f3a285a7f69bd006',
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

async function executeWatcherModule(contents) {
  const ts = await loadTypeScript()
  const instrumented = contents.replace(
    'function createFileChangedWatcher()',
    'export function createFileChangedWatcher()',
  )
  assert.notEqual(instrumented, contents, 'watcher factory must be instrumented')
  const javascript = ts.transpileModule(instrumented, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const state = {
    cleanupCallbacks: new Set(),
    cleanupRegistrations: 0,
    cleanupUnregistrations: 0,
    clears: 0,
    config: {
      CwdChanged: [{ hooks: [{}] }],
      FileChanged: [{ matcher: '.env|.envrc', hooks: [{}] }],
    },
    cwdResult: { results: [], watchPaths: [], systemMessages: [] },
    fileResult: { results: [], watchPaths: [], systemMessages: [] },
    logs: [],
    watchers: [],
  }

  const chokidar = {
    watch(paths, options) {
      const watcher = {
        closeCount: 0,
        handlers: new Map(),
        options,
        paths: [...paths],
        close() {
          this.closeCount++
          return Promise.resolve()
        },
        on(event, callback) {
          this.handlers.set(event, callback)
          return this
        },
      }
      state.watchers.push(watcher)
      return watcher
    },
  }

  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id === 'chokidar') return chokidar
      if (id === 'path') return { isAbsolute: path.isAbsolute, join: path.join }
      if (id.endsWith('/bootstrap/state.js')) {
        return { getMainThreadAgentHooks: () => undefined }
      }
      if (id.endsWith('/cleanupRegistry.js')) {
        return {
          registerCleanup: callback => {
            state.cleanupRegistrations++
            state.cleanupCallbacks.add(callback)
            return () => {
              state.cleanupUnregistrations++
              state.cleanupCallbacks.delete(callback)
            }
          },
        }
      }
      if (id.endsWith('/debug.js')) {
        return { logForDebugging: (...args) => state.logs.push(args) }
      }
      if (id.endsWith('/errors.js')) {
        return { errorMessage: error => String(error) }
      }
      if (id.endsWith('/hooks.js')) {
        return {
          executeCwdChangedHooks: async () => state.cwdResult,
          executeFileChangedHooks: async () => state.fileResult,
        }
      }
      if (id.endsWith('/sessionEnvironment.js')) {
        return {
          clearCwdEnvFiles: async () => {
            state.clears++
          },
        }
      }
      if (id.endsWith('/hooksConfigSnapshot.js')) {
        return {
          getHooksConfigFromSnapshot: () => state.config,
          shouldAllowManagedHooksOnly: () => false,
        }
      }
      throw new Error(`unexpected watcher import: ${id}`)
    },
    module.exports,
    module,
  )
  return { exports: module.exports, state }
}

function settle() {
  return new Promise(resolve => setImmediate(resolve))
}

test(
  'authenticated target105 pins the watcher factory and singleton method-binding boundary',
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

    for (const property of [
      'setEnvHookNotifier',
      'updateWatchPaths',
      'onCwdChanged',
    ]) {
      assert.equal(occurrences(baseline, property), 0, `${property}: baseline`)
      assert.equal(occurrences(target, property), 2, `${property}: target`)
      assert.equal(occurrences(latest, property), 2, `${property}: latest`)
    }
    const targetFactory = target.slice(5122831, 5124677)
    assert.ok(targetFactory.includes('return{initialize:'))
    assert.ok(targetFactory.includes('dispose:'))
    assert.ok(targetFactory.includes('ignorePermissionErrors:!0'))
    assert.ok(targetFactory.includes('stabilityThreshold:500'))
    assert.ok(targetFactory.includes('pollInterval:200'))
  },
)

test(
  'source root scopes every mutable watcher field inside the recovered factory',
  sourceOptions,
  () => {
    const contents = source('utils/hooks/fileChangedWatcher.ts')
    const factoryStart = contents.indexOf('function createFileChangedWatcher()')
    const singletonStart = contents.indexOf(
      'const fileChangedWatcher = createFileChangedWatcher()',
    )
    assert.ok(factoryStart > 0)
    assert.ok(singletonStart > factoryStart)
    const beforeFactory = contents.slice(0, factoryStart)
    const factory = contents.slice(factoryStart, singletonStart)

    assert.equal(beforeFactory.includes('let watcher:'), false)
    for (const fragment of [
      'let watcher: FSWatcher | null = null',
      'let dynamicWatchPaths: string[] = []',
      'let dynamicWatchPathsSorted: string[] = []',
      'let initialized = false',
      'let hasEnvHooks = false',
      'let notifyCallback:',
      'let cleanupUnregister:',
      'cleanupUnregister = registerCleanup(async () => dispose())',
      'cleanupUnregister()',
      'return {\n    initialize,',
      'setEnvHookNotifier,',
      'updateWatchPaths,',
      'onCwdChanged,',
      'dispose,',
    ]) {
      assert.ok(factory.includes(fragment), fragment)
    }
    assert.ok(
      contents.includes('initialize: initializeFileChangedWatcher'),
    )
    assert.ok(contents.includes('onCwdChanged: onCwdChangedForHooks'))
    assert.ok(contents.includes('fileChangedWatcher.dispose()'))

    const currentSource =
      sourceRoot === path.resolve(path.join(repositoryRoot, 'src'))
    assert.equal(contents.includes('getMainAgentEnvHooks()'), currentSource)
    assert.equal(
      contents.includes('shouldAllowManagedHooksOnly()'),
      currentSource,
    )
  },
)

test(
  'factory instances isolate paths, callbacks, cleanup handles, and cwd transitions',
  sourceOptions,
  async () => {
    const { exports, state } = await executeWatcherModule(
      source('utils/hooks/fileChangedWatcher.ts'),
    )
    const first = exports.createFileChangedWatcher()
    const second = exports.createFileChangedWatcher()
    const firstNotifications = []
    const secondNotifications = []
    first.setEnvHookNotifier((...args) => firstNotifications.push(args))
    second.setEnvHookNotifier((...args) => secondNotifications.push(args))

    first.initialize('/first')
    second.initialize('/second')
    assert.equal(state.cleanupRegistrations, 2)
    assert.deepEqual(state.watchers[0].paths, ['/first/.env', '/first/.envrc'])
    assert.deepEqual(state.watchers[1].paths, ['/second/.env', '/second/.envrc'])

    first.updateWatchPaths(['/dynamic-first'])
    assert.equal(state.watchers[0].closeCount, 1)
    assert.deepEqual(state.watchers[2].paths, [
      '/first/.env',
      '/first/.envrc',
      '/dynamic-first',
    ])
    assert.equal(state.watchers[1].closeCount, 0)

    state.fileResult = {
      results: [{ succeeded: false, output: 'file-error' }],
      watchPaths: [],
      systemMessages: ['file-message'],
    }
    state.watchers[1].handlers.get('change')('/second/.env')
    await settle()
    assert.deepEqual(firstNotifications, [])
    assert.deepEqual(secondNotifications, [
      ['file-message', false],
      ['file-error', true],
    ])

    state.cwdResult = {
      results: [],
      watchPaths: ['/cwd-dynamic'],
      systemMessages: ['cwd-message'],
    }
    await first.onCwdChanged('/first', '/first-next')
    assert.equal(state.clears, 1)
    assert.deepEqual(firstNotifications, [['cwd-message', false]])
    assert.deepEqual(state.watchers.at(-1).paths, [
      '/first-next/.env',
      '/first-next/.envrc',
      '/cwd-dynamic',
    ])

    first.dispose()
    assert.equal(state.cleanupUnregistrations, 1)
    assert.equal(state.cleanupCallbacks.size, 1)
    assert.equal(state.watchers.at(-1).closeCount, 1)
    assert.equal(state.watchers[1].closeCount, 0)
  },
)
