import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
const sourceOptions = {
  skip: selected ? false : `not applicable to ${semanticCase}`,
}
const bundleOptions = {
  skip: !selected
    ? `not applicable to ${semanticCase}`
    : !baselinePath || !targetPath || !latestPath
      ? 'authenticated 2.1.104, 2.1.105, and 2.1.116 bundles are required'
      : false,
}

const targetUnits = [
  {
    index: 17819,
    start: 12507166,
    end: 12507360,
    nodeType: 'FunctionDeclaration',
    sourceHash:
      '549f2db6422d625ff8039bf9fa82921040444c098374cba969c203bd8e166fd8',
  },
  {
    index: 17824,
    start: 12508519,
    end: 12509144,
    nodeType: 'FunctionDeclaration',
    sourceHash:
      '412ee2f908349756d08b6f7a5a45ec5fd2f6558ceb98e0bd11056680d7953c1e',
  },
]
const typedRow = {
  index: 593,
  start: 12507258,
  end: 12507273,
  value: '"hfi-auth.json"',
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

async function compileCleanup(stubs) {
  const ts = await loadTypeScript()
  const owner = source('utils/cleanup.ts')
  const parsed = ts.createSourceFile(
    'cleanup.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = parsed.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'cleanupOldHfiAuthFile',
  )
  assert.ok(declaration, 'cleanupOldHfiAuthFile declaration')
  const javascript = ts.transpileModule(
    `${declaration.getText(parsed)}\nmodule.exports = { cleanupOldHfiAuthFile }`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  const names = Object.keys(stubs)
  new Function('module', 'exports', ...names, javascript)(
    module,
    module.exports,
    ...names.map(name => stubs[name]),
  )
  return module.exports.cleanupOldHfiAuthFile
}

async function runCleanup({ cutoff = new Date(100), unlink, enoent = false }) {
  const calls = []
  const cleanup = await compileCleanup({
    getCutoffDate: () => cutoff,
    join: (...parts) => parts.join('/'),
    getClaudeConfigHomeDir: () => '/config',
    unlinkIfOld: async (...args) => {
      calls.push(['unlinkIfOld', ...args])
      return unlink(...args)
    },
    getFsImplementation: () => ({ name: 'fs' }),
    isENOENT: () => enoent,
    logError: error => calls.push(['logError', error]),
  })
  return { calls, result: await cleanup() }
}

test(
  'authenticated target105 introduces stale hfi-auth cleanup and wires it into background retention',
  bundleOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    const targetBytes = fs.readFileSync(targetPath)
    const latestBytes = fs.readFileSync(latestPath)
    assert.equal(
      sha256(baselineBytes),
      'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39',
    )
    assert.equal(
      sha256(targetBytes),
      '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75',
    )
    assert.equal(
      sha256(latestBytes),
      'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a',
    )
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    const latest = latestBytes.toString('utf8')

    for (const unit of targetUnits) {
      const region = structural.regions[unit.index]
      assert.equal(region.classification, 'unresolved')
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        [unit.start, unit.end, unit.nodeType, unit.sourceHash],
      )
      assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
    }
    assert.equal(
      target.slice(typedRow.start, typedRow.end),
      typedRow.value,
      `typed-audit row ${typedRow.index}`,
    )
    assert.equal((baseline.match(/hfi-auth\.json/g) ?? []).length, 0)
    assert.equal((target.match(/hfi-auth\.json/g) ?? []).length, 1)
    assert.equal((latest.match(/hfi-auth\.json/g) ?? []).length, 1)
    const helper = target.slice(targetUnits[0].start, targetUnits[0].end)
    assert.match(helper, /\.messages\+\+/)
    assert.match(helper, /\.errors\+\+/)
  },
)

test(
  'source deletes old HFI auth state and counts the removed message',
  sourceOptions,
  async () => {
    const { calls, result } = await runCleanup({ unlink: async () => true })
    assert.deepEqual(result, { messages: 1, errors: 0 })
    assert.deepEqual(calls[0].slice(0, 3), [
      'unlinkIfOld',
      '/config/hfi-auth.json',
      new Date(100),
    ])
  },
)

test(
  'source treats missing state as clean and records unexpected filesystem errors',
  sourceOptions,
  async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const missingRun = await runCleanup({
      unlink: async () => {
        throw missing
      },
      enoent: true,
    })
    assert.deepEqual(missingRun.result, { messages: 0, errors: 0 })
    assert.equal(
      missingRun.calls.some(call => call[0] === 'logError'),
      false,
    )

    const ioError = Object.assign(new Error('disk error'), { code: 'EIO' })
    const failedRun = await runCleanup({
      unlink: async () => {
        throw ioError
      },
    })
    assert.deepEqual(failedRun.result, { messages: 0, errors: 1 })
    assert.equal(failedRun.calls.at(-1)[0], 'logError')
    assert.equal(failedRun.calls.at(-1)[1], ioError)
  },
)

test(
  'source no-ops when retention is disabled and runs after debug cleanup',
  sourceOptions,
  async () => {
    const disabled = await runCleanup({
      cutoff: null,
      unlink: async () => {
        throw new Error('must not run')
      },
    })
    assert.deepEqual(disabled.result, { messages: 0, errors: 0 })
    assert.deepEqual(disabled.calls, [])

    const owner = source('utils/cleanup.ts')
    const backgroundStart = owner.indexOf(
      'export async function cleanupOldMessageFilesInBackground',
    )
    const background = owner.slice(backgroundStart)
    const debug = background.indexOf('await cleanupOldDebugLogs()')
    const auth = background.indexOf('await cleanupOldHfiAuthFile()')
    const pastes = background.indexOf('await cleanupOldPastes(')
    assert.ok(debug >= 0 && debug < auth && auth < pastes)
  },
)
