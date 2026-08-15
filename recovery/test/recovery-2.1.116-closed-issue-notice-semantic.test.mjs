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
const sourceOptions = { skip: selected ? false : `not applicable to ${semanticCase}` }
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

const targetUnits = new Map([
  [18967, [11671423, 11671492, '9c4e3691a64cf331b21f39490c53ce8108a423c9002e7f85517d59af4af66ea3']],
  [18968, [11671492, 11671571, '7e08879991f15a848d98972362551346f6af3d54ff21add116ca2501063465ff']],
  [18969, [11671571, 11672518, 'db8e250cc41b4508407c5c3b880e967931d6f921759c0e4f01ab4c8a2929a6e4']],
  [18970, [11672518, 11672666, '41d9c5f266f70bf6c85c6690d3b50212a5659e0f37d7184c9cde70b28883faf1']],
  [18971, [11672666, 11672770, '6b16144a3e9208a4e00f9c26f34cd171e96b57a2aeea5a6bccdf0b3b7a3073c8']],
  [18972, [11672770, 11672942, '9009bf2e25e827208ae648b87c0d2fb27f94ebed56236753f36d300b9f0c1cd9']],
  [18973, [11672942, 11672983, '31963f8b5fe4adbc25b832c6cdc9465f76bc1f0382ddd7409c1adf55bf7eabf7']],
  [18974, [11672983, 11673087, 'f1516db0bc1b0cedf29e8cab01975b1899496e109a29f6b78c18c56d13d3e134']],
  [18976, [11673098, 11673134, '234e7a9041dd50bc8373730bd8654893d4d0a5ab1fa4d4f4b728ab4f635c6bb9']],
  [18977, [11673134, 11673210, '813790d5cb05271433d2b8d6a136d5a11d3ab623ff5e634586c6e9724160d786']],
  [18978, [11673210, 11673551, 'bc651e1c0e8a167dee9791e2cdbb5fbf049b90adf5a67a294019445236a72af8']],
  [18979, [11673551, 11674200, 'b3eaa5b0197bc504df5c341e9c876f022a091dc60b9bf154bd469d6fadfb1fc1']],
  [18980, [11674200, 11674232, '6867a44437af1aad5b7fea6220dfa4ec163c1a6dd21516cef33f87f8562ee8f8']],
  [18981, [11674232, 11674259, '7f72eec22df658694e5cbf8dbbf3e8495348577635a258e080d5fa92f2614669']],
  [18982, [11674259, 11674291, 'efdc2da1f5a9a4ab92465c759593ed718a67c0049aa5aa23c8392053edba410c']],
  [18983, [11674291, 11674380, '7e413260cc354194224826595e0cf9a3c6f5b3bb465dc65bfc1fe338aeb1c8b6']],
  [18984, [11674380, 11674465, '4825f24cdb328ea235fdccacd444ee4957a23c005355acc0f0ec22f2709b669c']],
  [18986, [11676171, 11678309, 'e1bce5c3367929d47b0fa7d4a3634f91d61d5bd2d46545d7c8cf3f55fd038c08']],
  [18989, [11678514, 11678788, 'cac3094f920af3221c65a50f8f1d19e7ecae07317a5048caa7e1f88493a74ab8']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

async function compileCommonJs(contents) {
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
  const ts = module.default ?? module
  return ts.transpileModule(contents, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
}

function executeCommonJs(javascript, mocks) {
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      assert.ok(id in mocks, `unexpected import ${id}`)
      return mocks[id]
    },
    module.exports,
    module,
  )
  return module.exports
}

test('authenticated target116 introduces the complete closed-issue notice graph', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
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
  for (const [index, [start, end, hash]] of targetUnits) {
    const region = structural.regions.find(entry => entry.target.index === index)
    assert.ok(region, `target unit ${index}`)
    assert.notEqual(region.classification, 'matched')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [start, end, hash],
    )
    assert.equal(sha256(targetBytes.subarray(start, end)), hash)
  }
  for (const anchor of [
    'my-closed-issues.json',
    'tengu_gouda_loop',
    'closedIssuesLastChecked',
    'ClosedIssueNotice',
  ]) {
    assert.equal(baseline.split(anchor).length - 1, 0, `${anchor} baseline`)
    assert.ok(target.includes(anchor), `${anchor} target`)
  }
  assert.equal(target.split('closedIssuesLastChecked').length - 1, 2)
  assert.equal(target.split('ClosedIssueNotice').length - 1, 2)
})

test('source owns polling, cache, acknowledgement, message, and live notification wiring', sourceOptions, () => {
  const utility = source('utils/closedIssues.ts')
  const notice = source('components/ClosedIssueNotice.tsx')
  const notifications = source('components/PromptInput/Notifications.tsx')
  const config = source('utils/config.ts')
  for (const anchor of [
    "join(getClaudeConfigHomeDir(), 'cache', 'my-closed-issues.json')",
    "'anthropics/claude-code'",
    '`closed:>${getLookbackDate(now)}`',
    "'number,title,closedAt,stateReason'",
    "issue.stateReason === 'COMPLETED'",
    'closedIssuesLastChecked: now',
    'closedIssuesAcknowledged: retainedAcknowledgements',
  ]) assert.ok(utility.includes(anchor), anchor)
  for (const anchor of [
    "getFeatureValue_CACHED_MAY_BE_STALE('tengu_gouda_loop', false)",
    "key: 'closed-issue-notice'",
    "priority: 'low'",
    'timeoutMs: NOTICE_TIMEOUT_MS',
    'durationMs > REFRESH_DISPLAY_BUDGET_MS',
    "'https://github.com/anthropics/claude-code/issues/'",
  ]) assert.ok(notice.includes(anchor), anchor)
  assert.ok(notifications.includes("import { ClosedIssueNotice } from '../ClosedIssueNotice.js';"))
  assert.ok(notifications.includes('<ClosedIssueNotice />'))
  assert.ok(config.includes('closedIssuesLastChecked?: number'))
  assert.ok(config.includes('closedIssuesAcknowledged?: number[]'))
})

test('executable utility enforces privacy/throttle and persists exact completed issue state', sourceOptions, async () => {
  const writes = []
  const mkdirs = []
  const execCalls = []
  const logged = []
  let nonInteractive = false
  let essentialOnly = false
  let config = {
    closedIssuesLastChecked: 0,
    closedIssuesAcknowledged: [7, 99],
  }
  let cached = '[]'
  const javascript = await compileCommonJs(source('utils/closedIssues.ts'))
  const api = executeCommonJs(javascript, {
    'fs/promises': {
      mkdir: async (...args) => void mkdirs.push(args),
      readFile: async () => cached,
      writeFile: async (...args) => {
        writes.push(args)
        cached = args[1]
      },
    },
    path: await import('node:path'),
    '../bootstrap/state.js': {
      getIsNonInteractiveSession: () => nonInteractive,
    },
    './config.js': {
      getGlobalConfig: () => config,
      saveGlobalConfig: updater => {
        config = updater(config)
      },
    },
    './envUtils.js': { getClaudeConfigHomeDir: () => '/cfg' },
    './errors.js': { isENOENT: error => error?.code === 'ENOENT' },
    './execFileNoThrow.js': {
      execFileNoThrow: async (...args) => {
        execCalls.push(args)
        return {
          code: 0,
          stdout: JSON.stringify([
            { number: 7, title: 'fixed', closedAt: 'today', stateReason: 'COMPLETED' },
            { number: 8, title: 'done', closedAt: 'today', stateReason: 'COMPLETED' },
            { number: 9, title: 'declined', closedAt: 'today', stateReason: 'NOT_PLANNED' },
          ]),
        }
      },
    },
    './log.js': { logError: error => void logged.push(error) },
    './privacyLevel.js': { isEssentialTrafficOnly: () => essentialOnly },
    './slowOperations.js': {
      jsonParse: JSON.parse,
      jsonStringify: JSON.stringify,
    },
  })

  nonInteractive = true
  assert.equal(await api.refreshClosedIssues(), null)
  nonInteractive = false
  essentialOnly = true
  assert.equal(await api.refreshClosedIssues(), null)
  essentialOnly = false
  assert.equal(execCalls.length, 0)

  const originalNow = Date.now
  const baseNow = Date.parse('2026-05-20T00:00:00.000Z')
  const times = [baseNow, baseNow + 125]
  Date.now = () => times.shift() ?? baseNow + 125
  try {
    assert.equal(await api.refreshClosedIssues(), 125)
  } finally {
    Date.now = originalNow
  }
  assert.equal(execCalls.length, 1)
  assert.deepEqual(execCalls[0], [
    'gh',
    [
      'issue', 'list', '-R', 'anthropics/claude-code', '--author', '@me',
      '--state', 'closed', '--search', 'closed:>2026-04-20', '--json',
      'number,title,closedAt,stateReason', '--limit', '30',
    ],
    { timeout: 5000, preserveOutputOnError: false },
  ])
  assert.equal(mkdirs[0][0], '/cfg/cache')
  assert.equal(writes[0][0], '/cfg/cache/my-closed-issues.json')
  assert.deepEqual(JSON.parse(writes[0][1]), [
    { number: 7, title: 'fixed', closedAt: 'today' },
    { number: 8, title: 'done', closedAt: 'today' },
  ])
  assert.deepEqual(config.closedIssuesAcknowledged, [7])
  assert.deepEqual(
    api.getUnacknowledgedClosedIssues(await api.readCachedClosedIssues()),
    [{ number: 8, title: 'done', closedAt: 'today' }],
  )
  api.acknowledgeClosedIssues([{ number: 8, title: 'done', closedAt: 'today' }])
  assert.deepEqual(config.closedIssuesAcknowledged, [7, 8])
  assert.equal(logged.length, 0)
})
