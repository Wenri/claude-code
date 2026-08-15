import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.110-to-2.1.111'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_111_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.110, 2.1.111, and 2.1.116 bundles are required'
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
  [5230, ['changed', 3791560, 3792353, 'ClassDeclaration', '91cac358861e87507611c886f8fb2aa09252b83a4f5c50ff0c1a73c37cac3eea']],
  [5233, ['unresolved', 3792400, 3792454, 'FunctionDeclaration', 'a49763020ef8e2924082ee802133eae4cf969e4c54f7f865849da60713335675']],
  [5234, ['changed', 3792454, 3792490, 'FunctionDeclaration', '6e6cf052b783445ed6529f63930a4230a13624dc8987458dd5f3a71daf8fff95']],
  [5236, ['unresolved', 3792498, 3792527, 'VariableDeclaration', '4f376473a9852a4f51a310579494d5777cfe1298e17fe79b996512e1d47300c0']],
  [5251, ['unresolved', 3794832, 3794867, 'ExpressionStatement', '5900444f79df5dd4a29282c52bb31eb51776a479289a6dceae4069b6b57c814d']],
  [5252, ['unresolved', 3794867, 3795638, 'FunctionDeclaration', 'e857dae366eca1e46792b156969ad1bf7eb9e4a2d4357ea1231d6f796ccfbf42']],
  [5253, ['moved', 3795638, 3795651, 'VariableDeclaration', '050e48ec540aeeb9a6b09790ea64894b21e0175612f85b8f6792041c858ab20b']],
  [5254, ['unresolved', 3795651, 3795695, 'VariableDeclaration', 'bfc7b8de0730a2194b32effa9a2d981484387f21a6a758d62ab301c38d925628']],
  [5257, ['unresolved', 3795770, 3796499, 'FunctionDeclaration', '2b39fd97876a0e6489f31aafd7b8896b73ed6c39366f317be8673a8cb873d52d']],
  [5694, ['unresolved', 4072205, 4073385, 'FunctionDeclaration', '98d913c61445349e24de8f00215048171621ca535174ff22c7d1342030e97315']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
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

async function compileCommonJs(contents) {
  const ts = await loadTypeScript()
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

async function executeModule(contents, requireModule) {
  const javascript = await compileCommonJs(contents)
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    requireModule,
    module.exports,
    module,
  )
  return module.exports
}

async function executeThemeWatcher(contents) {
  const subscribers = new Set()
  const state = { cache: undefined, logs: [] }
  const watcher = await executeModule(contents, id => {
    if (id.endsWith('/terminal-querier.js')) {
      return {
        oscColor: code => ({
          request: `osc:${code}`,
          match: response => response.type === 'osc' && response.code === code,
        }),
      }
    }
    if (id.endsWith('/theme-notify.js')) {
      return {
        subscribeToThemeNotifications: subscriber => {
          subscribers.add(subscriber)
          return () => subscribers.delete(subscriber)
        },
      }
    }
    if (id.endsWith('/termio/osc.js')) {
      return {
        OSC: { SET_BG_COLOR: 11 },
        wrapForMultiplexer: request => `mux:${request}`,
      }
    }
    if (id.endsWith('/debug.js')) {
      return { logForDebugging: (...args) => state.logs.push(args) }
    }
    if (id.endsWith('/fullscreen.js')) {
      return { isTmuxControlMode: () => false }
    }
    if (id.endsWith('/sleep.js')) {
      return { sleep: async () => undefined }
    }
    if (id.endsWith('/systemTheme.js')) {
      return {
        setCachedSystemTheme: theme => {
          state.cache = theme
        },
        themeFromOscColor: data =>
          data === 'dark' || data === 'light' ? data : undefined,
      }
    }
    throw new Error(`unexpected watcher import: ${id}`)
  })
  return {
    watcher,
    state,
    notify: () => {
      for (const subscriber of subscribers) subscriber()
    },
  }
}

function fakeQuerier(responses) {
  return {
    sent: [],
    flushCount: 0,
    cancelled: [],
    send(query) {
      this.sent.push(query)
      return Promise.resolve(responses.shift())
    },
    flush() {
      this.flushCount++
      return Promise.resolve()
    },
    cancel(query) {
      this.cancelled.push(query)
    },
  }
}

function settle() {
  return new Promise(resolve => setImmediate(resolve))
}

test(
  'authenticated target111 pins the OSC11 watcher, query cancellation, and reachable theme dispatch',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    assert.equal(
      sha256(targetBytes),
      '8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')
    for (const [index, [classification, start, end, nodeType, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, classification, `${index}: class`)
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

    assert.equal(occurrences(baseline, 'systemTheme: OSC 11 query'), 0)
    assert.equal(occurrences(target, 'systemTheme: OSC 11 query'), 1)
    assert.equal(occurrences(latest, 'systemTheme: OSC 11 query'), 1)
    assert.ok(target.slice(3791560, 3792353).includes('cancel('))
    assert.ok(target.slice(3794867, 3795638).includes('mux-bare'))
    assert.ok(target.slice(3794867, 3795638).includes('muxTimeoutMs'))
    assert.ok(target.slice(4072205, 4073385).includes('themeNotify'))
    assert.ok(baseline.includes('themeNotify'))
    assert.ok(latest.includes('_resetInitialProbeForTesting'))
    assert.equal(target.includes('_resetInitialProbeForTesting'), false)
  },
)

test(
  'source root connects theme notifications to the exact target111 watcher and target116 probe latch',
  sourceOptions,
  () => {
    const terminalQuerier = source('ink/terminal-querier.ts')
    const notifications = source('ink/theme-notify.ts')
    const watcher = source('utils/systemThemeWatcher.ts')
    const app = source('ink/components/App.tsx')
    const provider = source('components/design-system/ThemeProvider.tsx')

    assert.ok(terminalQuerier.includes('cancel(query: TerminalQuery): void'))
    assert.ok(terminalQuerier.includes('pending.match === query.match'))
    assert.ok(notifications.includes('new Set<ThemeNotifySubscriber>()'))
    assert.ok(notifications.includes('subscribers.delete(subscriber)'))
    assert.ok(app.includes("item.response.type === 'themeNotify'"))
    assert.ok(app.includes('notifyThemeChange()'))
    assert.ok(app.includes('ENABLE_THEME_NOTIFY'))
    assert.ok(app.includes('DISABLE_THEME_NOTIFY'))
    assert.ok(provider.includes("import('../../utils/systemThemeWatcher.js')"))
    assert.ok(provider.includes('cleanup = watchSystemTheme('))
    assert.ok(provider.includes('cancelled = true'))

    for (const fragment of [
      "oscColor(OSC.SET_BG_COLOR)",
      'wrapForMultiplexer(directQuery.request)',
      "Boolean(process.env.TMUX || process.env.STY)",
      'sleep(muxTimeoutMs, undefined, { unref: true })',
      "via = 'mux-bare'",
      'querier.cancel(query)',
      'subscribeToThemeNotifications(() => void queryTheme())',
      'setCachedSystemTheme(theme)',
      'onThemeChange(theme)',
    ]) {
      assert.ok(watcher.includes(fragment), fragment)
    }

    const latestSource = sourceRoot === path.join(repositoryRoot, 'src')
    if (latestSource) {
      assert.ok(watcher.includes('let initialProbeSucceeded: boolean | undefined'))
      assert.ok(watcher.includes('initialProbeSucceeded = false'))
      assert.ok(watcher.includes('initialProbeSucceeded = true'))
      assert.ok(watcher.includes('if (initialProbeSucceeded !== false)'))
      assert.ok(watcher.includes('export function _resetInitialProbeForTesting'))
    } else {
      assert.equal(watcher.includes('initialProbeSucceeded'), false)
      assert.ok(watcher.includes('void queryTheme()'))
    }
  },
)

test(
  'executable authored watcher probes, deduplicates, reacts to notifications, and preserves the target116 failure latch',
  sourceOptions,
  async () => {
    const watcherSource = source('utils/systemThemeWatcher.ts')
    const { watcher, state, notify } = await executeThemeWatcher(watcherSource)
    watcher._resetInitialProbeForTesting?.()
    const querier = fakeQuerier([
      { type: 'osc', code: 11, data: 'dark' },
      { type: 'osc', code: 11, data: 'light' },
      { type: 'osc', code: 11, data: 'light' },
    ])
    const seen = []
    const cleanup = watcher.watchSystemTheme(querier, theme => seen.push(theme))
    await settle()
    assert.deepEqual(seen, ['dark'])
    assert.equal(state.cache, 'dark')
    notify()
    await settle()
    assert.deepEqual(seen, ['dark', 'light'])
    notify()
    await settle()
    assert.deepEqual(seen, ['dark', 'light'], 'duplicate theme is suppressed')
    cleanup()
    notify()
    await settle()
    assert.equal(querier.sent.length, 3, 'cleanup unsubscribes the watcher')

    if (watcher._resetInitialProbeForTesting) {
      watcher._resetInitialProbeForTesting()
      const failed = fakeQuerier([undefined])
      const stopFailed = watcher.watchSystemTheme(failed, () => {})
      await settle()
      stopFailed()
      const retry = fakeQuerier([{ type: 'osc', code: 11, data: 'light' }])
      const stopRetry = watcher.watchSystemTheme(retry, () => {})
      await settle()
      assert.equal(retry.sent.length, 0, 'known unsupported probe is not repeated')
      notify()
      await settle()
      assert.equal(retry.sent.length, 1, 'a terminal notification retries detection')
      stopRetry()
    }

    const notifyModule = await executeModule(
      source('ink/theme-notify.ts'),
      id => {
        throw new Error(`unexpected theme-notify import: ${id}`)
      },
    )
    let notified = 0
    const unsubscribe = notifyModule.subscribeToThemeNotifications(
      () => notified++,
    )
    notifyModule.notifyThemeChange()
    unsubscribe()
    notifyModule.notifyThemeChange()
    assert.equal(notified, 1)

    const querierModule = await executeModule(
      source('ink/terminal-querier.ts'),
      id => {
        if (id.endsWith('/parse-keypress.js')) return {}
        if (id.endsWith('/termio/csi.js')) return { csi: value => value }
        if (id.endsWith('/termio/osc.js')) {
          return { osc: (...parts) => parts.join(';') }
        }
        throw new Error(`unexpected terminal-querier import: ${id}`)
      },
    )
    const pendingQuerier = new querierModule.TerminalQuerier({ write() {} })
    const query = { request: 'osc:11', match: response => response.code === 11 }
    const pending = pendingQuerier.send(query)
    pendingQuerier.cancel(query)
    assert.equal(await pending, undefined)
  },
)
