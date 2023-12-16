import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.100-to-2.1.101'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_100_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_101_BUNDLE
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
  [15422, [11339392, 11339449, '6b4c11a68f9af8848563d7ccb17b241a779d1671a7a9303c90ed93c537845435']],
  [15423, [11339449, 11345836, '5af14453a94598398b8cdb3a3ff06b4653dd6e0f9c9447d74ab6123fa9419874']],
  [15424, [11345836, 11345892, '2dc2b88c41b75759e54ad00384eca353dd304b2d7b8df2f2587938ac4eaa4949']],
  [15426, [11345906, 11345988, '4200234900290835c5bc122d758de19260ca1697b0c00133787caba5a9632449']],
  [15428, [11345999, 11346022, '0d95a6ae0fe1345de3f3445eb4150d86637af524b0fc39de9ed7001dd0153132']],
  [15429, [11346022, 11346428, '7e3741db14addb969c2e0761d91ed86f054395b08e530d8b97ba4d18c7cbc9c4']],
  [15430, [11346428, 11347739, '2584dd14f8d87f4a404ab8ed102eea86f754837a3bf69a1749326c2282f389f7']],
  [15431, [11347739, 11347826, '27e75938fa429a3c8648a5d74ee4b24c929d44694b109c35560461ed9baa7dd3']],
  [15433, [11347838, 11348055, '59cfde9faa19da83992b45078dcf37d7dee23dea1d6114084f7736e5eafa87c8']],
])

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselineBundlePath || !targetBundlePath
      ? 'CLAUDE_CODE_2_1_100_BUNDLE and CLAUDE_CODE_2_1_101_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
}

function assertFragments(relative, fragments) {
  const contents = source(relative)
  for (const fragment of fragments) {
    assert.ok(contents.includes(fragment), `${relative}: ${fragment}`)
  }
  return contents
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

async function loadIntervalConverter() {
  const ts = await loadTypeScript()
  const loops = source('src/commands/loops/loops.tsx')
  const start = loops.indexOf('export function intervalToCron')
  const end = loops.indexOf('export async function call', start)
  assert.ok(start >= 0 && end > start, 'intervalToCron source range')
  const preamble = `
const INTERVAL_PATTERN = /^(\\d+)([smhd])$/i
const parseCronExpression = value => value.trim().split(/\\s+/).length === 5
`
  const javascript = ts.transpileModule(
    `${preamble}\n${loops.slice(start, end)}`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports.intervalToCron
}

test('target101 pins every introduced loops-command structural unit', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(
    sha256(baselineBytes),
    'd490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be',
  )
  assert.equal(
    sha256(targetBytes),
    'bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb',
  )
  const target = targetBytes.toString('utf8')
  for (const [index, identity] of targetUnits) {
    const region = structural.regions[index]
    assert.equal(region.classification, 'unresolved', `${index}: classification`)
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      identity,
      `${index}: structural identity`,
    )
    const unit = target.slice(identity[0], identity[1])
    assert.equal(sha256(unit), identity[2], `${index}: target bytes`)
    assert.equal(
      parse(unit, { ecmaVersion: 'latest', sourceType: 'module' }).body.length,
      1,
      `${index}: one top-level statement`,
    )
  }
})

test('the complete list/create/delete loop UI is introduced at 100 to 101', pairOptions, () => {
  const baseline = fs.readFileSync(baselineBundlePath, 'utf8')
  const target = fs.readFileSync(targetBundlePath, 'utf8')
  for (const fragment of [
    'tengu_loops_command',
    'Recurring crons and stop-hooks active for this session',
    'No active loops',
    'Stop hook not found',
    'Invalid interval: ',
    'stophook-',
    'List, create, and delete recurring loops and stop-hooks',
  ]) {
    assert.equal(baseline.includes(fragment), false, `${fragment}: baseline`)
    assert.equal(target.includes(fragment), true, `${fragment}: target`)
  }
  assert.equal(baseline.split('Stop hook cleared').length - 1, 1)
  assert.equal(target.split('Stop hook cleared').length - 1, 2)
})

test('source owns the exact loop UI, cadence conversion, and session mutations', sourceOptions, async () => {
  const loops = assertFragments('src/commands/loops/loops.tsx', [
    "const INTERVAL_PATTERN = /^(\\d+)([smhd])$/i",
    "useState<'list' | 'create'>('list')",
    "useState<'every' | 'until'>('every')",
    "useState('10m')",
    "'select:previous'",
    "event.key === 'd'",
    "event.key === 'n'",
    "event.key === 'tab'",
    'Recurring crons and stop-hooks active for this session',
    'No active loops',
    'e.g. /babysit-prs',
    'e.g. tests pass and PR is merged',
    "logEvent('tengu_loops_command', {})",
    'await listAllCronTasks()',
    'await removeCronTasks([loop.id])',
    'await addCronTask(cron, loop.prompt, true, false)',
    'Stop hook cleared',
    'Stop hook not found',
    'Invalid interval: ${loop.interval}',
    'tengu_stop_hook_added',
  ])
  assertFragments('src/commands/loops/index.ts', [
    "name: 'loops'",
    "description: 'List, create, and delete recurring loops and stop-hooks'",
    'immediate: true',
    'isEnabled: () => false',
  ])
  assertFragments('src/commands.ts', [
    "import loops from './commands/loops/index.js'",
    '  loops,',
  ])

  if (isCurrentSource) {
    assert.ok(loops.includes('const sessionHooksRegistry = context.sessionHooksRegistry'))
    assert.ok(loops.includes("sessionHooksRegistry.remove(sessionId, 'Stop', hook)"))
    assert.ok(loops.includes("sessionHooksRegistry.add(sessionId, 'Stop', '', {"))
  } else {
    assert.ok(loops.includes('context.setAppStateForTasks ?? context.setAppState'))
    assert.ok(loops.includes("removeSessionHook(setAppState, sessionId, 'Stop', hook)"))
    assert.ok(loops.includes("addSessionHook(setAppState, sessionId, 'Stop', '', {"))
  }

  const intervalToCron = await loadIntervalConverter()
  assert.equal(intervalToCron('1s'), '*/1 * * * *')
  assert.equal(intervalToCron('90s'), '*/2 * * * *')
  assert.equal(intervalToCron('5m'), '*/5 * * * *')
  assert.equal(intervalToCron('90m'), '0 */2 * * *')
  assert.equal(intervalToCron('23h'), '0 */23 * * *')
  assert.equal(intervalToCron('24h'), null)
  assert.equal(intervalToCron('31d'), '0 0 */31 * *')
  assert.equal(intervalToCron('32d'), null)
  assert.equal(intervalToCron('not-an-interval'), null)
})
