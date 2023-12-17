import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.109-to-2.1.110'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const selected = !semanticCase || semanticCase === caseName
const baselinePath = process.env.CLAUDE_CODE_2_1_109_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_110_BUNDLE
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
  [16038, [11398601, 11400904, '096a67d9f34623ab15dcea2110e74b29ea53467366355168d24514527a211347']],
  [16039, [11400904, 11401844, '44291f9b427801b9e0eb8b18e933dc040ad9c89fade759ff84dd92b3e21c2a3b']],
  [16044, [11402109, 11402464, 'b07764c523c4978046d3b6ebd6f8717c3cc5db5a9ec5635da5b99f84f2c3eb1b']],
  [16045, [11402464, 11403189, '287684a35fd3041331e726d41b11a9c70c25513c866899f4c0425c4e0d291c38']],
  [16046, [11403189, 11403245, 'c8d3f51d4d5dec545e63bd589f8e35ab492a4d97bbef5112020c90c041ac0bba']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function functionSource(contents, name) {
  const start = contents.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} declaration`)
  const body = contents.indexOf('{', start)
  let depth = 0
  for (let index = body; index < contents.length; index++) {
    if (contents[index] === '{') depth++
    else if (contents[index] === '}' && --depth === 0) {
      return contents.slice(start, index + 1)
    }
  }
  throw new Error(`unterminated ${name}`)
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
  'target110 pins the complete heap-diagnostic and command-summary boundary',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.109 and 2.1.110 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baselineBytes),
      '3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7',
    )
    assert.equal(
      sha256(targetBytes),
      'cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    for (const [index, [start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }
    for (const fragment of [
      'objectTypeCounts',
      'most memory is JS heap',
      'Open the .heapsnapshot in Chrome DevTools',
    ]) {
      assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
      assert.equal(target.includes(fragment), true, `${fragment}: target`)
    }
  },
)

test(
  'source returns diagnostics and preserves the target-specific Bun heap-stat evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const service = source('utils/heapDumpService.ts')
    const command = source('commands/heapdump/heapdump.ts')
    for (const fragment of [
      "getPlatform() === 'macos' ? 1 : 1024",
      'objectTypeCounts',
      'return { success: true, heapPath, diagPath, diagnostics }',
    ]) {
      assert.ok(service.includes(fragment), fragment)
    }
    for (const fragment of [
      'memoryUsage.external - memoryUsage.arrayBuffers',
      'memoryUsage.rss - memoryUsage.heapTotal - memoryUsage.external',
      'most memory is native (NOT in the .heapsnapshot)',
      'Open the .heapsnapshot in Chrome DevTools → Memory → Load to inspect retainers.',
      '(bytes / 1073741824).toFixed(2)',
    ]) {
      assert.ok(command.includes(fragment), fragment)
    }

    if (semanticCase === caseName) {
      assert.ok(service.includes('heapStats().objectTypeCounts'))
      assert.equal(service.includes('protectedObjectTypeCounts'), false)
      assert.ok(command.includes('if (result.diagnostics)'))
    } else {
      assert.ok(service.includes('const stats = heapStats(true)'))
      assert.ok(service.includes('protectedObjectTypeCounts'))
      assert.ok(service.includes('mimalloc = stats.mimalloc || undefined'))
      assert.equal(command.includes('if (result.diagnostics)'), false)
    }
  },
)

test(
  'the recovered formatter executes the target memory-accounting result',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const command = source('commands/heapdump/heapdump.ts')
    const ts = await loadTypeScript()
    const javascript = ts.transpileModule(
      `export ${functionSource(command, 'formatMemoryDiagnostics')}\n` +
        `export ${functionSource(command, 'formatGB')}`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText
    const module = { exports: {} }
    new Function('exports', 'module', javascript)(module.exports, module)

    assert.equal(
      module.exports.formatMemoryDiagnostics({
        memoryUsage: {
          heapUsed: 0,
          heapTotal: 5 * 1073741824,
          external: 1 * 1073741824,
          arrayBuffers: 0.25 * 1073741824,
          rss: 7 * 1073741824,
        },
        resourceUsage: { maxRSS: 8 * 1073741824 },
        analysis: { potentialLeaks: ['socket leak'] },
      }),
      [
        'RSS 7.00 GB (peak 8.00 GB) — most memory is JS heap (inspect the .heapsnapshot)',
        '  JS heap         5.00 GB  in snapshot',
        '  array buffers   0.25 GB  not in snapshot',
        '  other external  0.75 GB  not in snapshot',
        '  unaccounted     1.00 GB  not in snapshot (code/JIT/stacks/allocator)',
        '  ⚠ socket leak',
      ].join('\n'),
    )
  },
)
