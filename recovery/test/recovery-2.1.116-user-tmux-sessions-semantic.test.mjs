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
const sourceRoot = process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT
  ? path.resolve(process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT)
  : path.join(repositoryRoot, 'src')
const baselineBundlePath = process.env.CLAUDE_CODE_2_1_114_BUNDLE
const targetBundlePath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const baselineExportUnit = {
  index: 9875,
  start: 4999279,
  end: 4999474,
  sourceHash:
    '042058beb7b35ab296b28da1e127bffd5c9a146e5db50cf7f4d7bdc571791071',
}
const targetExportUnit = {
  index: 9984,
  start: 5035305,
  end: 5035529,
  sourceHash:
    '5a02bbf3fc6dc2a9f8021a12245ba68800427fef0b65b46553f71312e0f8fc32',
}
const targetHelperUnit = {
  index: 9986,
  start: 5035556,
  end: 5035782,
  sourceHash:
    '32fce682d861e31062ad6bfebc82d9f30989df9a26f0d068b1d986c48dd0e308',
}
const typedRows = [
  {
    historicalRow: 364,
    currentRow: 330,
    literalKind: 'property',
    value: 'listUserTmuxSessions',
    start: 5035341,
    end: 5035361,
    structuralIndex: 9984,
  },
  {
    historicalRow: 365,
    currentRow: 331,
    literalKind: 'string',
    value: 'list-sessions',
    start: 5035664,
    end: 5035679,
    structuralIndex: 9986,
  },
  {
    historicalRow: 366,
    currentRow: 332,
    literalKind: 'string',
    value: '#{session_name}',
    start: 5035685,
    end: 5035702,
    structuralIndex: 9986,
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

async function instantiateDetection(tmux, result) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    source('src/utils/swarm/backends/detection.ts'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const previousTmux = process.env.TMUX
  const calls = []
  if (tmux === undefined) delete process.env.TMUX
  else process.env.TMUX = tmux
  try {
    const module = { exports: {} }
    const requireStub = specifier => {
      if (specifier.endsWith('/env.js')) return { env: { terminal: null } }
      if (specifier.endsWith('/execFileNoThrow.js')) {
        return {
          execFileNoThrow: async (...args) => {
            calls.push(args)
            return result
          },
        }
      }
      if (specifier.endsWith('/constants.js')) return { TMUX_COMMAND: 'tmux' }
      throw new Error(`unexpected detection import: ${specifier}`)
    }
    new Function('exports', 'module', 'require', javascript)(
      module.exports,
      module,
      requireStub,
    )
    return { detection: module.exports, calls }
  } finally {
    if (previousTmux === undefined) delete process.env.TMUX
    else process.env.TMUX = previousTmux
  }
}

test('target116 authenticates the user tmux session-list API boundary', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  const baselineRegion = structural.unmatchedBaseline.find(
    region => region.index === baselineExportUnit.index,
  )
  assert.ok(baselineRegion)
  assert.deepEqual(
    [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
    [
      baselineExportUnit.start,
      baselineExportUnit.end,
      baselineExportUnit.sourceHash,
    ],
  )
  const baselineExport = baseline.slice(
    baselineExportUnit.start,
    baselineExportUnit.end,
  )
  assert.equal(sha256(baselineExport), baselineExportUnit.sourceHash)
  assert.equal(baselineExport.includes('listUserTmuxSessions'), false)

  for (const unit of [targetExportUnit, targetHelperUnit]) {
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(sha256(target.slice(unit.start, unit.end)), unit.sourceHash)
  }

  for (const row of typedRows) {
    assert.equal(row.structuralIndex === 9984 || row.structuralIndex === 9986, true)
    assert.equal(
      target.slice(row.start, row.end),
      row.literalKind === 'string' ? JSON.stringify(row.value) : row.value,
    )
    assert.equal(baseline.split(row.value).length - 1, 0)
    assert.equal(target.split(row.value).length - 1, 1)
  }

  const helper = target.slice(targetHelperUnit.start, targetHelperUnit.end)
  assert.match(helper, /if\(![^)]*\)return/)
  assert.match(helper, /\["-S",[^,]+,"list-sessions","-F","#\{session_name\}"\]/)
  assert.match(helper, /useCwd:!1,timeout:2000/)
  assert.match(helper, /split\(`\n`\)\.filter\(Boolean\)/)
})

test('source lists only sessions from the original user tmux socket', sourceOptions, async () => {
  const owner = source('src/utils/swarm/backends/detection.ts')
  assert.match(owner, /export async function listUserTmuxSessions/)
  assert.match(owner, /\['-S', socketPath, 'list-sessions', '-F', '#\{session_name\}'\]/)
  assert.match(owner, /\{ useCwd: false, timeout: 2000 \}/)

  const absent = await instantiateDetection(undefined, {
    code: 0,
    stdout: 'ignored\n',
    stderr: '',
  })
  assert.equal(await absent.detection.listUserTmuxSessions(), undefined)
  assert.deepEqual(absent.calls, [])

  const success = await instantiateDetection('/tmp/tmux-1000/default,123,0', {
    code: 0,
    stdout: 'main\n\nreview\n',
    stderr: '',
  })
  assert.deepEqual(await success.detection.listUserTmuxSessions(), [
    'main',
    'review',
  ])
  assert.deepEqual(success.calls, [
    [
      'tmux',
      [
        '-S',
        '/tmp/tmux-1000/default',
        'list-sessions',
        '-F',
        '#{session_name}',
      ],
      { useCwd: false, timeout: 2000 },
    ],
  ])

  const failed = await instantiateDetection('/tmp/tmux-1000/default,123,0', {
    code: 1,
    stdout: 'stale\n',
    stderr: 'server exited',
  })
  assert.equal(await failed.detection.listUserTmuxSessions(), undefined)
})
