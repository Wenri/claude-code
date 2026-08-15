import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const caseName = '2.1.112-to-2.1.113'
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const selected = !semanticCase || semanticCase === caseName
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const baselinePath = process.env.CLAUDE_CODE_2_1_112_BUNDLE
const targetPath = process.env.CLAUDE_CODE_2_1_113_BUNDLE

const BASELINE_SHA256 =
  'bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f'
const TARGET_INNER_SHA256 =
  '4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba'
const TARGET_WRAPPER_SHA256 =
  'dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681'
const TARGET_WRAPPER_PREFIX_LENGTH = 87
const TARGET_WRAPPER_SUFFIX_LENGTH = 3
const targetUnits = [
  {
    index: 7055,
    start: 3301462,
    end: 3302043,
    nodeType: 'FunctionDeclaration',
    sourceHash:
      '69fb193cfe0aefff7edd7e3d55408b92beea15a312d8bdd2ae33ddd058f57058',
  },
  {
    index: 7056,
    start: 3302043,
    end: 3302112,
    nodeType: 'FunctionDeclaration',
    sourceHash:
      '87c95c687e4028a1644de6620788dd9e59703d87510ef40fd1883a0a66fdab2f',
  },
]

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

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function authenticatedTargetInner(filename) {
  const bytes = fs.readFileSync(filename)
  const digest = sha256(bytes)
  if (digest === TARGET_INNER_SHA256) return bytes.toString('utf8')
  assert.equal(digest, TARGET_WRAPPER_SHA256, 'authenticated target wrapper')
  const inner = bytes.subarray(
    TARGET_WRAPPER_PREFIX_LENGTH,
    bytes.length - TARGET_WRAPPER_SUFFIX_LENGTH,
  )
  assert.equal(sha256(inner), TARGET_INNER_SHA256, 'authenticated target inner')
  return inner.toString('utf8')
}

function targetStructuralRow(index) {
  return [...structural.regions, ...structural.unresolvedTarget].find(
    row => row.target?.index === index,
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

async function sourceHarness(env) {
  const owner = source('ink/terminal.ts')
  const start = owner.indexOf('let terminalOutputFailed = false')
  const end = owner.indexOf('\n}', owner.indexOf('export function writeDiffToTerminal', start))
  assert.ok(start >= 0 && end > start, 'isolated source daemon writer')
  const isolated = owner.slice(start, end + 2)
  const ts = await loadTypeScript()
  const result = ts.transpileModule(isolated, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  })
  const errors = (result.diagnostics ?? []).filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  assert.deepEqual(errors, [], 'source daemon writer transpiles')

  const module = { exports: {} }
  const dependencies = {
    process: { env },
    getErrnoCode: error => error?.code,
    BSU: '<BSU>',
    ESU: '<ESU>',
    eraseLines: count => `<clear:${count}>`,
    getClearTerminalSequence: mainScreen => `<terminal:${mainScreen}>`,
    HIDE_CURSOR: '<hide>',
    SHOW_CURSOR: '<show>',
    cursorMove: (x, y) => `<move:${x},${y}>`,
    cursorTo: col => `<to:${col}>`,
    link: uri => `<link:${uri}>`,
  }
  new Function(
    'exports',
    'module',
    ...Object.keys(dependencies),
    result.outputText,
  )(module.exports, module, ...Object.values(dependencies))
  return module.exports.writeDiffToTerminal
}

function targetHarness(target, env) {
  const writer = target.slice(targetUnits[0].start, targetUnits[0].end)
  const daemon = target.slice(targetUnits[1].start, targetUnits[1].end)
  const runtime = Function(
    'uaH',
    'Maq',
    'Ou8',
    'jc',
    'AE',
    'GOH',
    'Oaq',
    'HVH',
    'Ih$',
    'process',
    'w$K',
    `let M$K=false,PQ4; ${writer}; ${daemon}; return {write: ju8}`,
  )(
    '<BSU>',
    count => `<clear:${count}>`,
    mainScreen => `<terminal:${mainScreen}>`,
    '<hide>',
    '<show>',
    (x, y) => `<move:${x},${y}>`,
    col => `<to:${col}>`,
    uri => `<link:${uri}>`,
    '<ESU>',
    { env },
    error => error?.code,
  )
  return runtime.write
}

test(
  'target113 authenticates the daemon terminal broken-pipe guard',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath
        ? 'authenticated 2.1.112 and 2.1.113 bundles are required'
        : false,
  },
  () => {
    const baselineBytes = fs.readFileSync(baselinePath)
    assert.equal(sha256(baselineBytes), BASELINE_SHA256)
    const baseline = baselineBytes.toString('utf8')
    const target = authenticatedTargetInner(targetPath)

    for (const expected of targetUnits) {
      const row = targetStructuralRow(expected.index)
      assert.ok(row, `target unit ${expected.index}`)
      assert.equal(row.classification, 'unresolved')
      assert.deepEqual(
        [
          row.target.index,
          row.target.start,
          row.target.end,
          row.target.nodeType,
          row.target.sourceHash,
        ],
        [
          expected.index,
          expected.start,
          expected.end,
          expected.nodeType,
          expected.sourceHash,
        ],
      )
      assert.equal(
        sha256(target.slice(expected.start, expected.end)),
        expected.sourceHash,
      )
    }

    assert.equal(occurrences(baseline, 'CLAUDE_BG_BACKEND'), 0)
    assert.equal(occurrences(target, 'CLAUDE_BG_BACKEND'), 2)
    assert.match(
      target.slice(targetUnits[0].start, targetUnits[0].end),
      /if\([^)]*\)return;try\{[^}]*\.stdout\.write\([^)]*\)\}catch\(/,
    )
    assert.match(
      target.slice(targetUnits[0].start, targetUnits[0].end),
      /===\"EIO\"\|\|[^=]*===\"EPIPE\"/,
    )
    assert.match(
      target.slice(targetUnits[1].start, targetUnits[1].end),
      /process\.env\.CLAUDE_BG_BACKEND===\"daemon\"/,
    )

    const writes = []
    const daemonWriter = targetHarness(target, {
      CLAUDE_BG_BACKEND: 'daemon',
    })
    daemonWriter(
      {
        stdout: {
          write(value) {
            writes.push(value)
            throw Object.assign(new Error('revoked output'), { code: 'EIO' })
          },
        },
      },
      [{ type: 'stdout', content: 'first' }],
    )
    daemonWriter(
      { stdout: { write: () => assert.fail('disabled writer called') } },
      [{ type: 'stdout', content: 'second' }],
    )
    assert.deepEqual(writes, ['<BSU>first<ESU>'])
  },
)

test(
  'source suppresses only daemon EIO/EPIPE and retires later writes',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const owner = source('ink/terminal.ts')
    assert.match(owner, /let terminalOutputFailed = false/)
    assert.match(
      owner,
      /process\.env\.CLAUDE_BG_BACKEND === 'daemon'/,
    )
    assert.match(owner, /code === 'EIO' \|\| code === 'EPIPE'/)
    assert.match(owner, /if \(terminalOutputFailed\) return/)

    const daemonWriter = await sourceHarness({ CLAUDE_BG_BACKEND: 'daemon' })
    const writes = []
    daemonWriter(
      {
        stdout: {
          write(value) {
            writes.push(value)
            throw Object.assign(new Error('closed pipe'), { code: 'EPIPE' })
          },
        },
      },
      [{ type: 'stdout', content: 'first' }],
    )
    daemonWriter(
      { stdout: { write: () => assert.fail('retired writer called') } },
      [{ type: 'stdout', content: 'second' }],
    )
    assert.deepEqual(writes, ['<BSU>first<ESU>'])

    const interactiveWriter = await sourceHarness({})
    assert.throws(
      () =>
        interactiveWriter(
          {
            stdout: {
              write() {
                throw Object.assign(new Error('interactive EIO'), {
                  code: 'EIO',
                })
              },
            },
          },
          [{ type: 'stdout', content: 'value' }],
        ),
      error => error.code === 'EIO',
    )

    const daemonUnexpectedWriter = await sourceHarness({
      CLAUDE_BG_BACKEND: 'daemon',
    })
    assert.throws(
      () =>
        daemonUnexpectedWriter(
          {
            stdout: {
              write() {
                throw Object.assign(new Error('unexpected failure'), {
                  code: 'EBADF',
                })
              },
            },
          },
          [{ type: 'stdout', content: 'value' }],
        ),
      error => error.code === 'EBADF',
    )
  },
)
