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
  [18829, [13366381, 13366427, '8ef0411a3da29e68a4e2cbbae7ab52cd0b8159b8dd11a070c0d324722cd2898b']],
  [18830, [13366427, 13366599, '8f64b1b211229d50dc93eff68e44aa3058add14ae7ea2e0ba062f73c43e3c1cb']],
  [18831, [13366599, 13367298, '0cae3ccbd59e3e149bebced597703075c246ac5b7f053f8b0255d1954f9987ae']],
  [18832, [13367298, 13367360, '1639843d872a5bd890ffd006cf5ac7f1adc68edca5546f4899ff0f807e3e597b']],
  [18833, [13367360, 13367392, '866fa02554bed8a084bc11999e10f0f110488da8bcfee76f9a8211f6276bee68']],
  [19100, [13545103, 13545726, '79ff6b812b7d3bce54e42f004610516f00a21ea53e5a4f99bc45dd3e2f0b7fdc']],
])

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

test(
  'target105 pins the event-loop detector and its feature-gated startup call',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.104 and 2.1.105 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.includes('tengu_event_loop_stall'), false)
    assert.equal(baseline.includes('tengu_drift_lantern'), false)
    assert.equal((target.match(/tengu_event_loop_stall/g) ?? []).length, 1)
    assert.equal((target.match(/tengu_drift_lantern/g) ?? []).length, 1)

    for (const [index, identity] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        identity,
        `${index}: identity`,
      )
      assert.equal(
        sha256(target.slice(identity[0], identity[1])),
        identity[2],
        `${index}: target bytes`,
      )
    }

    const detector = target.slice(13366381, 13367392)
    for (const fragment of [
      '[event-loop-stall] detector started (interval=',
      '[event-loop-stall] blocked for ',
      'tengu_event_loop_stall',
      'expected_interval_ms',
      'cumulative_stall_ms',
      'likely_sleep',
      'reassertTerminalModes(!0)',
    ]) {
      assert.ok(detector.includes(fragment), fragment)
    }
    assert.match(
      target.slice(13545103, 13545726),
      /tengu_drift_lantern.+startEventLoopStallDetector/,
    )
  },
)

test(
  'authored detector reports stalls and reasserts terminal modes after sleep',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const detector = source('utils/eventLoopStallDetector.ts')
    const main = source('main.tsx')
    for (const fragment of [
      'const INTERVAL_MS = 200',
      'const STALL_THRESHOLD_MS = 500',
      'const SLEEP_WAKE_THRESHOLD_MS = 5000',
      "logEvent('tengu_event_loop_stall'",
      'stall_duration_ms: stallDurationMs',
      'expected_interval_ms: INTERVAL_MS',
      'cumulative_stall_ms: cumulativeStallMs',
      'instances.get(process.stdout)?.reassertTerminalModes(true)',
      'interval.unref()',
    ]) {
      assert.ok(detector.includes(fragment), fragment)
    }
    assert.ok(
      main.includes(
        "getFeatureValue_CACHED_MAY_BE_STALE('tengu_drift_lantern', false)",
      ),
    )
    assert.ok(
      main.includes(
        "import('./utils/eventLoopStallDetector.js').then(m => m.startEventLoopStallDetector())",
      ),
    )

    const body = detector
      .split('\n')
      .filter(line => !line.startsWith('import '))
      .join('\n')
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `let now = 1000; let callback: (() => void) | undefined; let timerCount = 0;\n` +
        `const events: any[] = []; const debug: any[] = []; let reassertions = 0;\n` +
        `const Date = { now: () => now };\n` +
        `const process = { stdout: {}, memoryUsage: () => ({ rss: 10 * 1024 * 1024, heapUsed: 4 * 1024 * 1024, external: 2 * 1024 * 1024 }) };\n` +
        `const setInterval = (fn: () => void, _ms: number) => { callback = fn; timerCount++; return { unref() {} } };\n` +
        `const logForDebugging = (...args: any[]) => debug.push(args);\n` +
        `const logEvent = (name: string, fields: any) => events.push({ name, fields });\n` +
        `const instances = { get: (_stdout: any) => ({ reassertTerminalModes: (include: boolean) => { if (include) reassertions++ } }) };\n` +
        body +
        `\nexport function __tick(value: number) { now = value; callback?.() }\n` +
        `export function __state() { return { events, debug, reassertions, timerCount } }`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    module.exports.startEventLoopStallDetector()
    module.exports.startEventLoopStallDetector()
    module.exports.__tick(1800)
    module.exports.__tick(8000)
    const state = module.exports.__state()
    assert.equal(state.timerCount, 1)
    assert.equal(state.events.length, 2)
    assert.deepEqual(state.events[0], {
      name: 'tengu_event_loop_stall',
      fields: {
        stall_duration_ms: 600,
        expected_interval_ms: 200,
        actual_interval_ms: 800,
        total_stalls: 1,
        cumulative_stall_ms: 600,
        likely_sleep: false,
        rss_mb: 10,
        heap_used_mb: 4,
        ext_mb: 2,
      },
    })
    assert.equal(state.events[1].fields.stall_duration_ms, 6000)
    assert.equal(state.events[1].fields.cumulative_stall_ms, 6600)
    assert.equal(state.events[1].fields.likely_sleep, true)
    assert.equal(state.reassertions, 1)
  },
)

test(
  'target116 retains the same event-loop telemetry and startup gate',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !latestPath
        ? 'authenticated 2.1.116 structural bundle is required'
        : false,
  },
  () => {
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const latest = latestBytes.toString('utf8')
    assert.equal((latest.match(/tengu_event_loop_stall/g) ?? []).length, 1)
    assert.equal((latest.match(/tengu_drift_lantern/g) ?? []).length, 1)
    assert.equal((latest.match(/startEventLoopStallDetector/g) ?? []).length, 2)
    const detectorAt = latest.indexOf('[event-loop-stall] detector started')
    const detector = latest.slice(detectorAt - 500, detectorAt + 1500)
    assert.ok(detector.includes('expected_interval_ms'))
    assert.ok(detector.includes('cumulative_stall_ms'))
    assert.ok(detector.includes('reassertTerminalModes(!0)'))
  },
)
