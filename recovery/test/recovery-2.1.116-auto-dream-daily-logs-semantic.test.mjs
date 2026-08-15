import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.114-to-2.1.116'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineRunner = {
  index: 13520,
  start: 8601655,
  end: 8604882,
  sourceHash:
    '0c1d1ef5488e4d27225f534a4a77e991371f781f60509f11a694b7247ed4f0fb',
}
const targetRunner = {
  index: 13659,
  start: 8651026,
  end: 8654287,
  sourceHash:
    '5e230c214ae1b3e66b0c58522069c21fe53f84212545ce17783d2c8385365b79',
}
const targetHelper = {
  index: 13661,
  start: 8654754,
  end: 8654946,
  sourceHash:
    '5e4c6f5530bbb332180c28bed1e0e336e567729557c05ae717b9d0595dd7c0bb',
}
const dailyLogsProperty = {
  typedAuditRow: 639,
  start: 8654008,
  end: 8654024,
}

const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const pairOptions = {
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
  return fs.readFileSync(
    path.join(sourceRoot, relative.replace(/^src\//, '')),
    'utf8',
  )
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

async function authoredFunction(name) {
  const ts = await loadTypeScript()
  const owner = source('src/services/autoDream/autoDream.ts')
  const sourceFile = ts.createSourceFile(
    'autoDream.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  )
  assert.ok(declaration, `${name} declaration`)
  return {
    owner,
    source: owner.slice(declaration.getStart(sourceFile), declaration.end),
  }
}

async function instantiateCounter({ readdir, debug = () => {} }) {
  const ts = await loadTypeScript()
  const authored = await authoredFunction('countDailyLogs')
  const javascript = ts.transpileModule(
    `${authored.source}\nmodule.exports = { countDailyLogs }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  new Function(
    'exports',
    'module',
    'readdir',
    'join',
    'count',
    'isFsInaccessible',
    'logForDebugging',
    'errorMessage',
    javascript,
  )(
    module.exports,
    module,
    readdir,
    path.join,
    (values, predicate) => values.filter(predicate).length,
    error =>
      ['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'ELOOP'].includes(error?.code),
    debug,
    error => (error instanceof Error ? error.message : String(error)),
  )
  return module.exports.countDailyLogs
}

test(
  'target116 authenticates the added auto-dream daily-log telemetry',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const baselineOwner = baseline.slice(
      baselineRunner.start,
      baselineRunner.end,
    )
    assert.equal(sha256(baselineOwner), baselineRunner.sourceHash)

    for (const unit of [targetRunner, targetHelper]) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [unit.start, unit.end, unit.sourceHash],
      )
      assert.equal(
        sha256(target.slice(unit.start, unit.end)),
        unit.sourceHash,
        `target structural unit ${unit.index}`,
      )
    }

    assert.equal(
      target.slice(dailyLogsProperty.start, dailyLogsProperty.end),
      'daily_logs_found',
      `typed-audit row ${dailyLogsProperty.typedAuditRow}`,
    )
    assert.doesNotMatch(baselineOwner, /daily_logs_found|countDailyLogs/)

    const runner = target.slice(targetRunner.start, targetRunner.end)
    const helper = target.slice(targetHelper.start, targetHelper.end)
    assert.match(runner, /daily_logs_found:/)
    assert.match(helper, /readdir\([^)]*join\([^)]*,"logs"\)/)
    assert.match(helper, /recursive:!0/)
    assert.match(helper, /endsWith\("\.md"\)/)
    assert.match(helper, /\[autoDream\] countDailyLogs:/)
  },
)

test(
  'source counts nested markdown logs and treats a missing log tree as empty',
  sourceOptions,
  async t => {
    const tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'auto-dream-daily-logs-'),
    )
    t.after(() => fs.promises.rm(tempRoot, { recursive: true, force: true }))
    await fs.promises.mkdir(path.join(tempRoot, 'logs', '2026', '08'), {
      recursive: true,
    })
    await Promise.all([
      fs.promises.writeFile(
        path.join(tempRoot, 'logs', 'root.md'),
        'root log',
      ),
      fs.promises.writeFile(
        path.join(tempRoot, 'logs', '2026', '08', 'nested.md'),
        'nested log',
      ),
      fs.promises.writeFile(
        path.join(tempRoot, 'logs', '2026', '08', 'notes.txt'),
        'not a log',
      ),
      fs.promises.writeFile(
        path.join(tempRoot, 'logs', 'uppercase.MD'),
        'not a lowercase markdown suffix',
      ),
    ])

    const debug = []
    const counter = await instantiateCounter({
      readdir: fs.promises.readdir,
      debug: message => debug.push(message),
    })
    assert.equal(await counter(tempRoot), 2)
    assert.equal(await counter(path.join(tempRoot, 'missing')), 0)
    assert.deepEqual(debug, [])
  },
)

test(
  'source suppresses EACCES but reports unexpected EIO failures',
  sourceOptions,
  async () => {
    const expectedDebug = []
    const inaccessibleCounter = await instantiateCounter({
      readdir: async () => {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
      },
      debug: message => expectedDebug.push(message),
    })
    assert.equal(await inaccessibleCounter('/memory'), 0)
    assert.deepEqual(expectedDebug, [])

    const unexpectedDebug = []
    const failedCounter = await instantiateCounter({
      readdir: async () => {
        throw Object.assign(new Error('disk failure'), { code: 'EIO' })
      },
      debug: message => unexpectedDebug.push(message),
    })
    assert.equal(await failedCounter('/memory'), 0)
    assert.deepEqual(unexpectedDebug, [
      '[autoDream] countDailyLogs: disk failure',
    ])
  },
)

test(
  'source snapshots the daily-log count before the fork and reports it on completion',
  sourceOptions,
  () => {
    const owner = source('src/services/autoDream/autoDream.ts')
    const memoryRoot = owner.indexOf('const memoryRoot = getAutoMemPath()')
    const countAt = owner.indexOf(
      'const dailyLogsFound = await countDailyLogs(memoryRoot)',
      memoryRoot,
    )
    const forkAt = owner.indexOf('const result = await runForkedAgent(', countAt)
    const telemetryAt = owner.indexOf('daily_logs_found: dailyLogsFound', forkAt)

    assert.ok(memoryRoot >= 0, 'memory root')
    assert.ok(countAt > memoryRoot, 'daily logs are counted from the memory root')
    assert.ok(forkAt > countAt, 'the count is snapshotted before the dream fork')
    assert.ok(
      telemetryAt > forkAt,
      'the snapshot is carried into completion telemetry',
    )
  },
)
