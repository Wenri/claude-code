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
const oldBase =
  'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases'
const publicBase = 'https://downloads.claude.ai/claude-code-releases'

const baselineUnits = [
  {
    index: 11287,
    start: 7152202,
    end: 7152347,
    sourceHash:
      '72c59cb65115221892d219235faeb2aa42fd313b0f549327558cd2db4418fb72',
  },
  {
    index: 11321,
    start: 7168751,
    end: 7168899,
    sourceHash:
      'f6ed19069ffd05a9296e5eb8961d4f331f074b93b3d1ce6105df8cfb745c19a1',
  },
]
const targetUnits = [
  {
    index: 11395,
    start: 7186848,
    end: 7186936,
    sourceHash:
      'b88fc5b89f58c173dcc0aba091d7e91de59905c3e02e9c6644ee6ccd053fa4f2',
  },
  {
    index: 11429,
    start: 7203760,
    end: 7203851,
    sourceHash:
      'cf565e881f334baad35cb5b728dfd28efa5003333660d66ecf5f90ed46b60366',
  },
]
const typedRows = [
  {
    historicalRow: 462,
    currentRow: 406,
    targetOccurrenceNumber: 1,
    start: 7186870,
    end: 7186920,
    structuralIndex: 11395,
  },
  {
    historicalRow: 495,
    currentRow: 431,
    targetOccurrenceNumber: 2,
    start: 7203780,
    end: 7203830,
    structuralIndex: 11429,
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
const pairOptions = {
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

function exactLiteralCount(contents, value) {
  return contents.split(JSON.stringify(value)).length - 1
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

function inertModule() {
  const noop = () => undefined
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === '__esModule') return true
        return noop
      },
    },
  )
}

async function instantiateOwner(relative, requests) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(source(relative), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const axios = {
    async get(url, options) {
      requests.push({ url, options })
      return { data: `  ${url.endsWith('/stable') ? '2.1.115' : '2.1.116'}  ` }
    },
    isAxiosError: () => false,
  }
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'axios') return axios
    if (specifier === 'bun:bundle') return { feature: () => false }
    if (specifier.endsWith('/errors.js')) {
      return {
        ClaudeError: class ClaudeError extends Error {},
        getErrnoCode: error => error?.code,
        isENOENT: error => error?.code === 'ENOENT',
        toError: value => (value instanceof Error ? value : new Error(String(value))),
      }
    }
    return inertModule()
  }
  new Function('exports', 'module', 'require', javascript)(
    module.exports,
    module,
    requireStub,
  )
  return module.exports
}

test('target116 authenticates both public CDN base declarations', pairOptions, () => {
  const baselineBytes = fs.readFileSync(baselineBundlePath)
  const targetBytes = fs.readFileSync(targetBundlePath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  for (const unit of baselineUnits) {
    const region = structural.unmatchedBaseline.find(
      candidate => candidate.index === unit.index,
    )
    assert.ok(region, `baseline unit ${unit.index}`)
    assert.deepEqual(
      [region.start, region.end, region.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    const declaration = baseline.slice(unit.start, unit.end)
    assert.equal(sha256(declaration), unit.sourceHash)
    assert.equal(exactLiteralCount(declaration, oldBase), 1)
    assert.equal(exactLiteralCount(declaration, publicBase), 0)
  }

  for (const unit of targetUnits) {
    const region = structural.regions[unit.index]
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    const declaration = target.slice(unit.start, unit.end)
    assert.equal(sha256(declaration), unit.sourceHash)
    assert.equal(exactLiteralCount(declaration, oldBase), 0)
    assert.equal(exactLiteralCount(declaration, publicBase), 1)
  }

  for (const row of typedRows) {
    assert.equal(
      target.slice(row.start, row.end),
      JSON.stringify(publicBase),
      `typed rows historical=${row.historicalRow} current=${row.currentRow}`,
    )
    assert.equal(targetUnits[row.targetOccurrenceNumber - 1].index, row.structuralIndex)
  }

  assert.deepEqual(
    {
      baselineOld: exactLiteralCount(baseline, oldBase),
      baselinePublic: exactLiteralCount(baseline, publicBase),
      targetOld: exactLiteralCount(target, oldBase),
      targetPublic: exactLiteralCount(target, publicBase),
    },
    { baselineOld: 2, baselinePublic: 0, targetOld: 0, targetPublic: 2 },
  )
})

test('source updater and native installer request the public CDN', sourceOptions, async () => {
  const updaterSource = source('src/utils/autoUpdater.ts')
  const nativeSource = source('src/utils/nativeInstaller/download.ts')
  for (const [owner, contents] of [
    ['autoUpdater', updaterSource],
    ['nativeInstaller/download', nativeSource],
  ]) {
    assert.equal(contents.split(publicBase).length - 1, 1, owner)
    assert.equal(contents.split(oldBase).length - 1, 0, owner)
  }

  const updaterRequests = []
  const updater = await instantiateOwner(
    'src/utils/autoUpdater.ts',
    updaterRequests,
  )
  assert.deepEqual(await updater.getGcsDistTags(), {
    latest: '2.1.116',
    stable: '2.1.115',
  })
  assert.deepEqual(
    updaterRequests.map(request => request.url).sort(),
    [`${publicBase}/latest`, `${publicBase}/stable`],
  )
  assert.ok(
    updaterRequests.every(
      request =>
        request.options.timeout === 5000 && request.options.responseType === 'text',
    ),
  )

  const nativeRequests = []
  const native = await instantiateOwner(
    'src/utils/nativeInstaller/download.ts',
    nativeRequests,
  )
  const previousUserType = process.env.USER_TYPE
  delete process.env.USER_TYPE
  try {
    assert.equal(await native.getLatestVersion('latest'), '2.1.116')
    assert.equal(await native.getLatestVersion('stable'), '2.1.115')
  } finally {
    if (previousUserType === undefined) delete process.env.USER_TYPE
    else process.env.USER_TYPE = previousUserType
  }
  assert.deepEqual(
    nativeRequests.map(request => request.url),
    [`${publicBase}/latest`, `${publicBase}/stable`],
  )
  assert.ok(
    nativeRequests.every(
      request =>
        request.options.timeout === 30000 &&
        request.options.responseType === 'text',
    ),
  )
  assert.ok(
    [...updaterRequests, ...nativeRequests].every(
      request => !request.url.includes('storage.googleapis.com'),
    ),
  )
})
