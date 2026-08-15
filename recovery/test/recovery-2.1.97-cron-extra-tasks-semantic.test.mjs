import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.96-to-2.1.97'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const targetBundlePath = process.env.CLAUDE_CODE_2_1_97_BUNDLE
const targetSha256 =
  '4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988'
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

const selected = !semanticCase || semanticCase === caseName
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !targetBundlePath
      ? 'CLAUDE_CODE_2_1_97_BUNDLE is not set'
      : false,
}
const isCurrentSource =
  path.resolve(sourceRoot) === path.resolve(repositoryRoot, 'src')

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
  const text = source(relative)
  for (const fragment of fragments) {
    assert.ok(text.includes(fragment), `${relative}: ${fragment}`)
  }
  return text
}

test(
  '2.1.97 scheduler evidence pins the complete extra-task implementation',
  bundleOptions,
  () => {
    const bytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(bytes), targetSha256)
    const bundle = bytes.toString('utf8')
    const region = structural.regions[17892]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [
        12489245,
        12492707,
        '39cb76ffc7cc3f57feb31e2bab957062fd11692b639e41940748a9f9684c4ba3',
      ],
    )
    const targetFunction = bundle.slice(region.target.start, region.target.end)
    assert.equal(sha256(targetFunction), region.target.sourceHash)
    for (const fragment of [
      '[ScheduledTasks] getExtraTasks failed: ',
      'autonomousLoopDefault:!1',
    ]) {
      assert.ok(targetFunction.includes(fragment), fragment)
    }
  },
)

test(
  'source loads optional tasks fail-safe and makes their presence start the scheduler',
  sourceOptions,
  () => {
    const scheduler = assertFragments('src/utils/cronScheduler.ts', [
      'getExtraTasks?: () => Promise<CronTask[]>',
      'const nextExtra = getExtraTasks',
      'await getExtraTasks().catch(error => {',
      '`[ScheduledTasks] getExtraTasks failed: ${error}`',
      'getExtraTasks !== undefined || hasCronTasksSync()',
    ])
    assert.ok(
      scheduler.indexOf('await getExtraTasks().catch(error => {') <
        scheduler.indexOf('if (stopped) return'),
      'the asynchronous source is resolved before the stopped guard and never committed afterward',
    )
  },
)

if (isCurrentSource) {
  test(
    'latest source keeps synthetic tasks separate and identifies all loop-default sentinels',
    sourceOptions,
    () => {
      const scheduler = assertFragments('src/utils/cronScheduler.ts', [
        'let extraTasks: CronTask[] = []',
        'extraTasks = nextExtra',
        'for (const t of extraTasks) process(t, true)',
        'autonomousLoopDefault: isLoopDefaultSentinel(t.prompt)',
      ])
      assert.ok(
        scheduler.indexOf('for (const t of tasks) process(t, false)') <
          scheduler.indexOf('for (const t of extraTasks) process(t, true)'),
      )
      assertFragments('src/utils/loopSentinels.ts', [
        "AUTONOMOUS_LOOP_SENTINEL = '<<autonomous-loop>>'",
        'AUTONOMOUS_LOOP_DYNAMIC_SENTINEL =',
        "'<<autonomous-loop-dynamic>>'",
        "LOOP_FILE_SENTINEL = '<<loop.md>>'",
        'LOOP_FILE_DYNAMIC_SENTINEL =',
        "'<<loop.md-dynamic>>'",
        'export function isLoopDefaultSentinel',
      ])
    },
  )
} else {
  test(
    'historical source merges extra tasks into the owner-gated target97 schedule',
    sourceOptions,
    () => {
      const scheduler = assertFragments('src/utils/cronScheduler.ts', [
        'tasks = nextExtra.length > 0 ? [...next, ...nextExtra] : next',
        'if (isOwner) {\n      for (const t of tasks) process(t, false)',
        'autonomousLoopDefault: false',
      ])
      assert.ok(!scheduler.includes('let extraTasks: CronTask[] = []'))
      assert.ok(!scheduler.includes('for (const t of extraTasks)'))
    },
  )
}
