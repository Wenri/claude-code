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
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath
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

const baselineUnit = [
  16493,
  10414472,
  10415481,
  'FunctionDeclaration',
  '374eff9993eb997ebca5ecf6bea6f1061d7c9edcc988d38632938581053b04c3',
]
const targetUnit = [
  16634,
  10469310,
  10471011,
  'FunctionDeclaration',
  'dab40f59e8a5e6666914c0932447ac7c7c2371bc773397a2883a3ae72ec62669',
]
const baselineLaunchUnit = [
  16495,
  10416003,
  10418352,
  'FunctionDeclaration',
  'ef31ee9b964e222d59013396769d4db69709536e412481d052cfcd8b6ff1c9b5',
]
const targetLaunchUnit = [
  16636,
  10471533,
  10473900,
  'FunctionDeclaration',
  '3c3a9e61be65b75abea8459c1baf613f75193c04b701d3fa9cf46f005ed96b14',
]

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function extractFunction(contents, marker) {
  const start = contents.indexOf(marker)
  assert.notEqual(start, -1, marker)
  const bodyStart = contents.indexOf('{', start)
  assert.notEqual(bodyStart, -1, `${marker} body`)
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = bodyStart; index < contents.length; index += 1) {
    const character = contents[index]
    if (quote !== null) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character
      continue
    }
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return contents.slice(start, index + 1)
    }
  }
  assert.fail(`unterminated function: ${marker}`)
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

function executeCommonJs(javascript) {
  const module = { exports: {} }
  new Function('exports', 'module', javascript)(module.exports, module)
  return module.exports
}

test(
  'authenticated target116 adds repository-aware Ultrareview scope validation',
  bundleOptions,
  () => {
    const baseline = fs.readFileSync(baselinePath)
    const target = fs.readFileSync(targetPath)
    assert.equal(
      sha256(baseline),
      'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16',
    )
    assert.equal(
      sha256(target),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )

    for (const unit of [baselineUnit, baselineLaunchUnit]) {
      const [index, start, end, nodeType, sourceHash] = unit
      const region = structural.unmatchedBaseline.find(
        candidate => candidate.index === index,
      )
      assert.ok(region)
      assert.deepEqual(
        [region.start, region.end, region.nodeType, region.sourceHash],
        [start, end, nodeType, sourceHash],
      )
      assert.equal(sha256(baseline.subarray(start, end)), sourceHash)
    }
    for (const unit of [targetUnit, targetLaunchUnit]) {
      const [index, start, end, nodeType, sourceHash] = unit
      const region = structural.regions[index].target
      assert.deepEqual(
        [region.start, region.end, region.nodeType, region.sourceHash],
        [start, end, nodeType, sourceHash],
      )
      assert.equal(sha256(target.subarray(start, end)), sourceHash)
    }

    const [, baselineStart, baselineEnd] = baselineUnit
    const [, targetStart, targetEnd] = targetUnit

    const before = baseline.subarray(baselineStart, baselineEnd).toString('utf8')
    const after = target.subarray(targetStart, targetEnd).toString('utf8')
    for (const fragment of [
      'Could not detect a GitHub repository',
      'M.host!=="github.com"',
      'repo:`${M.owner}/${M.name}`',
      '$||await',
      '||"HEAD"',
      'git fetch origin',
      '/ultrareview develop',
      'headBranch:',
    ]) {
      assert.ok(!before.includes(fragment), `baseline: ${fragment}`)
      assert.ok(after.includes(fragment), `target: ${fragment}`)
    }
    const beforeLaunch = baseline
      .subarray(baselineLaunchUnit[1], baselineLaunchUnit[2])
      .toString('utf8')
    const afterLaunch = target
      .subarray(targetLaunchUnit[1], targetLaunchUnit[2])
      .toString('utf8')
    for (const fragment of [
      'headBranch:',
      'description:`ultrareview: ${P}`',
      'P===G?P:`${P} \\u2192 ${G}`',
    ]) {
      assert.ok(!beforeLaunch.includes(fragment), `baseline launch: ${fragment}`)
      assert.ok(afterLaunch.includes(fragment), `target launch: ${fragment}`)
    }
  },
)

test('source owns target116 scope fields and actionable validation', sourceOptions, () => {
  const review = source('commands/review/reviewRemote.ts')
  const dialog = source('commands/review/UltrareviewOverageDialog.tsx')
  for (const fragment of [
    "{ mode: 'pr'; prNumber: string; repo: string }",
    'headBranch: string',
    'const repo = await detectCurrentRepositoryWithHost()',
    'Could not detect a GitHub repository for the current directory.',
    "repo.host !== 'github.com'",
    "const baseBranch = trimmed || (await getDefaultBranch()) || 'main'",
    "const headBranch = (await getCurrentBranch()) || 'HEAD'",
    'git fetch origin ${baseBranch}',
    '/ultrareview develop',
    'description: `ultrareview: ${headBranch}`',
    '`${headBranch} → ${baseBranch}`',
  ]) {
    assert.ok(review.includes(fragment), fragment)
  }
  for (const fragment of [
    'Reviewing ${scope.repo}#${scope.prNumber}',
    'scope.headBranch === scope.baseBranch',
    'Reviewing local changes on ${scope.baseBranch}',
    'Reviewing ${scope.headBranch} against ${scope.baseBranch}',
  ]) {
    assert.ok(dialog.includes(fragment), fragment)
  }
})

test('actual scope parser distinguishes PR, explicit-base, and default-base failures', sourceOptions, async () => {
  const review = source('commands/review/reviewRemote.ts')
  const prepare = extractFunction(
    review,
    'export async function prepareRemoteReviewScope',
  )
  const javascript = await compileCommonJs(`
    type RemoteReviewScopeResult = any
    let harness: any
    const detectCurrentRepositoryWithHost = async () => harness.repo
    const logEvent = (name: string, data: unknown) => harness.events.push([name, data])
    const isRepoTooLargeForBundle = async () => harness.tooLarge
    const getDefaultBranch = async () => harness.defaultBranch
    const getCurrentBranch = async () => harness.headBranch
    const gitExe = () => 'git'
    const execFileNoThrow = async (_exe: string, args: string[]) => {
      if (args[0] === 'merge-base') return harness.merges.shift()
      return harness.diff
    }
    export function setHarness(value: any) { harness = value }
    ${prepare}
  `)
  const runtime = executeCommonJs(javascript)
  const baseHarness = () => ({
    repo: { host: 'github.com', owner: 'anthropic', name: 'claude-code' },
    events: [],
    tooLarge: false,
    defaultBranch: 'main',
    headBranch: 'feature',
    merges: [{ stdout: 'abc123\n', code: 0 }],
    diff: { stdout: ' 2 files changed\n', code: 0 },
  })

  let harness = baseHarness()
  harness.repo = null
  runtime.setHarness(harness)
  assert.match((await runtime.prepareRemoteReviewScope('42')).error, /inside the repo's checkout/)

  harness = baseHarness()
  harness.repo.host = 'gitlab.com'
  runtime.setHarness(harness)
  assert.match((await runtime.prepareRemoteReviewScope('42')).error, /this remote is on gitlab\.com/)

  harness = baseHarness()
  runtime.setHarness(harness)
  assert.deepEqual(await runtime.prepareRemoteReviewScope('42'), {
    ok: true,
    scope: {
      mode: 'pr',
      prNumber: '42',
      repo: 'anthropic/claude-code',
    },
  })

  harness = baseHarness()
  harness.merges = [
    { stdout: '', code: 1 },
    { stdout: '', code: 1 },
  ]
  runtime.setHarness(harness)
  assert.match(
    (await runtime.prepareRemoteReviewScope('release')).error,
    /git fetch origin release/,
  )

  harness = baseHarness()
  harness.merges = [
    { stdout: '', code: 1 },
    { stdout: '', code: 1 },
  ]
  runtime.setHarness(harness)
  assert.match(
    (await runtime.prepareRemoteReviewScope('')).error,
    /Pass the base branch explicitly/,
  )

  harness = baseHarness()
  runtime.setHarness(harness)
  assert.deepEqual(await runtime.prepareRemoteReviewScope('release'), {
    ok: true,
    scope: {
      mode: 'branch',
      headBranch: 'feature',
      baseBranch: 'release',
      mergeBaseSha: 'abc123',
      diffStat: '2 files changed',
    },
  })
})
