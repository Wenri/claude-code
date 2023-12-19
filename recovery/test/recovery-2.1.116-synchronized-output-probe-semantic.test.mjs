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
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE

const baselineUnits = {
  capability: [7049, 3300537, 3301168, '2fe4985b0f73103cfbc667bae532e09a82ae2ce8393aef608635b63ecf92d89f'],
  state: [7058, 3302192, 3302227, '3274c736edd9ca6e7a5733da970581be37665d7adfe1d252869653a7fe879cf9'],
  app: [7103, 3317509, 3323352, '26bba92b8232519e62a6d9319287b570429b463821c1350ec7a83b61af844913'],
}
const targetUnits = {
  setter: [7102, 3320915, 3320937, 'e13ff252fd91940faa3f978cbbc394e002ec739f6d39c421b53e9c765ad75cc0'],
  capability: [7103, 3320937, 3321584, 'e364d7bb14dd64a1cbefdf450247aaf8af1e74c971b798915766f5a9dab982d2'],
  state: [7116, 3322755, 3322794, 'b65e71db928bc03d3f89f6272d10825ad27bc9f9a496eeaf6441910c4b8f60d1'],
  app: [7162, 3338005, 3344128, 'ad9e71327765f10b2897a39ec8290032cf73734f1a06860f774eb31316be160c'],
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
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
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function assertFragments(contents, fragments, label) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${label}: ${fragment}`)
  }
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

async function loadCapabilityHarness() {
  const owner = source('ink/terminal.ts')
  const start = owner.indexOf('let synchronizedOutputProbeSucceeded')
  const end = owner.indexOf('// -- XTVERSION-detected terminal name', start)
  assert.ok(start >= 0 && end > start, 'terminal capability source range')
  const ts = await loadTypeScript()
  const result = ts.transpileModule(owner.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [])
  const module = { exports: {} }
  new Function('exports', 'module', result.outputText)(module.exports, module)
  return module.exports
}

test('target116 authenticates the dynamic DEC 2026 probe boundary', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(baselineBytes.length, 12_986_755)
  assert.equal(targetBytes.length, 13_102_272)
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

  for (const [name, [index, start, end, hash]] of Object.entries(
    baselineUnits,
  )) {
    const unit = structural.unmatchedBaseline.find(item => item.index === index)
    assert.ok(unit, `${name}: unmatched baseline unit`)
    assert.deepEqual([unit.start, unit.end, unit.sourceHash], [start, end, hash])
    assert.equal(sha256(baseline.slice(start, end)), hash)
  }
  for (const [name, [index, start, end, hash]] of Object.entries(targetUnits)) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${name}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    assert.equal(sha256(target.slice(start, end)), hash)
  }

  const capability = target.slice(
    targetUnits.capability[1],
    targetUnits.capability[2],
  )
  assert.ok(capability.includes('if(WKK)return!0'))
  const app = target.slice(targetUnits.app[1], targetUnits.app[2])
  for (const fragment of [
    'process.env.TERM_PROGRAM==="Apple_Terminal"',
    'send(VHK(bz.SYNCHRONIZED_UPDATE))',
    '_?.status===1||_?.status===2',
    'DECRQM(2026):',
    'skipped (Apple_Terminal)',
    '\\u2192 sync ',
  ]) {
    assert.ok(app.includes(fragment), `App probe: ${fragment}`)
  }
  assert.ok(app.indexOf('GKK(A)') < app.indexOf('XTVERSION: terminal identified'))
  assert.equal(baseline.includes('DECRQM(2026):'), false)
  assert.equal(target.split('DECRQM(2026):').length - 1, 1)
})

test('source sends one bounded probe and records the response before terminal identity', sourceOptions, () => {
  const terminal = source('ink/terminal.ts')
  assertFragments(
    terminal,
    [
      'let synchronizedOutputProbeSucceeded: boolean | undefined',
      'export function setSynchronizedOutputProbeSucceeded(supported: boolean)',
      'synchronizedOutputProbeSucceeded = supported',
      'if (synchronizedOutputProbeSucceeded) return true',
    ],
    'terminal capability',
  )

  const app = source('ink/components/App.tsx')
  assertFragments(
    app,
    [
      "process.env.TERM_PROGRAM === 'Apple_Terminal'",
      'this.querier.send(decrqm(DEC.SYNCHRONIZED_UPDATE))',
      'synchronizedOutput?.status === 1 || synchronizedOutput?.status === 2',
      'setSynchronizedOutputProbeSucceeded(synchronizedOutputSupported)',
      'skipped (Apple_Terminal)',
      '→ sync ${synchronizedOutputSupported',
    ],
    'App probe',
  )
  assert.equal(app.split('decrqm(DEC.SYNCHRONIZED_UPDATE)').length - 1, 1)
  assert.ok(
    app.indexOf('setSynchronizedOutputProbeSucceeded(') <
      app.indexOf('setXtversionName(name)'),
    'probe result is recorded before XTVERSION handling',
  )
  assert.equal(app.includes('arrowWindow=[]'), false)
  assert.equal(app.includes('arrowWindowDir'), false)
})

test('dynamic success supplements environment detection without overriding tmux', sourceOptions, async () => {
  const {
    isSynchronizedOutputSupported,
    setSynchronizedOutputProbeSucceeded,
  } = await loadCapabilityHarness()
  const keys = [
    'TMUX',
    'TERM_PROGRAM',
    'TERM',
    'KONSOLE_VERSION',
    'KITTY_WINDOW_ID',
    'ZED_TERM',
    'WT_SESSION',
    'VTE_VERSION',
  ]
  const saved = new Map(keys.map(key => [key, process.env[key]]))
  try {
    for (const key of keys) delete process.env[key]
    setSynchronizedOutputProbeSucceeded(false)
    assert.equal(isSynchronizedOutputSupported(), false)
    setSynchronizedOutputProbeSucceeded(true)
    assert.equal(isSynchronizedOutputSupported(), true)

    process.env.TMUX = '1'
    assert.equal(isSynchronizedOutputSupported(), false)
    delete process.env.TMUX

    setSynchronizedOutputProbeSucceeded(false)
    process.env.TERM_PROGRAM = 'ghostty'
    assert.equal(isSynchronizedOutputSupported(), true)
    process.env.TERM_PROGRAM = 'Apple_Terminal'
    assert.equal(isSynchronizedOutputSupported(), false)
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
