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
  [17412, [12329436, 12329841, '2618f532c937a2c5983c98a91491118f92d5ac488a0b9cb300aebf85063b0d02']],
  [17413, [12329841, 12329883, 'e404451ddf9eabfd3a0de690d179edeeb059a4e2821467c96b948f4c87defb94']],
  [17414, [12329883, 12329958, '0e845a96e6838bdaafcaa71e7523175039f15ac9e43695ef505d19a90056ede7']],
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
  'target105 pins one-shot upward memory-threshold telemetry',
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
    assert.equal(baseline.includes('tengu_memory_threshold_crossed'), false)
    assert.equal((target.match(/tengu_memory_threshold_crossed/g) ?? []).length, 1)

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
    const hook = target.slice(12329436, 12329958)
    assert.match(hook, /useRef\("normal"\)/)
    assert.match(hook, /tengu_memory_threshold_crossed/)
    assert.match(hook, /rss_mb:Math\.round/)
    assert.match(hook, /heap_used_mb:Math\.round/)
    assert.match(hook, /normal:0,high:1,critical:2/)
  },
)

test(
  'authored hook reports high and critical only once per process',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const hook = source('hooks/useMemoryUsage.ts')
    for (const fragment of [
      "useRef<MemoryUsageStatus>('normal')",
      'STATUS_RANK[status] > STATUS_RANK[highestReportedStatus.current]',
      "logEvent('tengu_memory_threshold_crossed'",
      'rss_mb: Math.round(rss / 1024 / 1024)',
      'heap_used_mb: Math.round(heapUsed / 1024 / 1024)',
      'highestReportedStatus.current = status',
    ]) {
      assert.ok(hook.includes(fragment), fragment)
    }

    const body = hook
      .split('\n')
      .filter(line => !line.startsWith('import '))
      .join('\n')
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `let memory = { heapUsed: 0, rss: 0 }; let interval: (() => void) | undefined;\n` +
        `const events: any[] = []; const updates: any[] = [];\n` +
        `const process = { memoryUsage: () => memory };\n` +
        `const useRef = <T>(value: T) => ({ current: value });\n` +
        `const useState = <T>(value: T) => [value, (updater: any) => updates.push(updater(updates.at(-1) ?? value))] as const;\n` +
        `const useInterval = (callback: () => void, _ms: number) => { interval = callback };\n` +
        `const logEvent = (name: string, fields: any) => events.push({ name, fields });\n` +
        body +
        `\nexport function __sample(heapUsed: number, rss: number) { memory = { heapUsed, rss }; interval?.() }\n` +
        `export { events, updates };`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)
    module.exports.useMemoryUsage()
    const gib = 1024 * 1024 * 1024
    module.exports.__sample(1 * gib, 2 * gib)
    module.exports.__sample(2 * gib, 3 * gib)
    module.exports.__sample(1 * gib, 2 * gib)
    module.exports.__sample(2 * gib, 3 * gib)
    module.exports.__sample(3 * gib, 4 * gib)
    assert.deepEqual(
      module.exports.events.map(event => event.fields),
      [
        { rss_mb: 3072, heap_used_mb: 2048, status: 'high' },
        { rss_mb: 4096, heap_used_mb: 3072, status: 'critical' },
      ],
    )
  },
)

test(
  'target116 retains the same monotonic memory-threshold hook',
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
    assert.equal((latest.match(/tengu_memory_threshold_crossed/g) ?? []).length, 1)
    const at = latest.indexOf('tengu_memory_threshold_crossed')
    const hook = latest.slice(at - 500, at + 700)
    assert.match(hook, /useRef\("normal"\)/)
    assert.match(hook, /rss_mb:Math\.round/)
    assert.match(hook, /heap_used_mb:Math\.round/)
  },
)
