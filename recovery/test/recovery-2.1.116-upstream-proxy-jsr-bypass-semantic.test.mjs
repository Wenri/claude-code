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

const baselineUnit = {
  index: 18216,
  start: 11300474,
  end: 11300856,
  sourceHash:
    'a8e4c0b2cc8bcedbc25e27943986175657da5687c2ead6c08264666bb090448a',
}
const targetUnit = {
  index: 18418,
  start: 11374930,
  end: 11375334,
  sourceHash:
    '5836165708e6517fa8405768bb715b58aeb5c29f8b7bfbae9f9b793e76ef291c',
}
const typedRows = [
  {
    value: 'jsr.io',
    start: 11375210,
    end: 11375218,
    historicalRow: 751,
    currentRow: 685,
  },
  {
    value: 'npm.jsr.io',
    start: 11375219,
    end: 11375231,
    historicalRow: 752,
    currentRow: 686,
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

async function executeOwner(calls) {
  const ts = await loadTypeScript()
  const javascript = ts.transpileModule(
    source('src/upstreamproxy/upstreamproxy.ts'),
    {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  const module = { exports: {} }
  const requireStub = specifier => {
    if (specifier === 'fs/promises') {
      return {
        mkdir: async (...args) => calls.mkdir.push(args),
        readFile: async file => {
          calls.readFile.push(file)
          return file === '/semantic/session-token'
            ? 'semantic-token\n'
            : 'system-ca\n'
        },
        unlink: async file => calls.unlink.push(file),
        writeFile: async (...args) => calls.writeFile.push(args),
      }
    }
    if (specifier === 'os') return { homedir: () => '/semantic/home' }
    if (specifier === 'path') return { join: path.join }
    if (specifier.endsWith('/cleanupRegistry.js')) {
      return { registerCleanup: callback => calls.cleanups.push(callback) }
    }
    if (specifier.endsWith('/debug.js')) {
      return { logForDebugging: (...args) => calls.logs.push(args) }
    }
    if (specifier.endsWith('/envUtils.js')) {
      return {
        isEnvTruthy: value =>
          typeof value === 'string' &&
          ['1', 'true'].includes(value.toLowerCase()),
      }
    }
    if (specifier.endsWith('/errors.js')) {
      return { isENOENT: error => error?.code === 'ENOENT' }
    }
    if (specifier.endsWith('/sessionIngressAuth.js')) {
      return { getSessionIngressAuthToken: () => null }
    }
    if (specifier.endsWith('/relay.js')) {
      return {
        startUpstreamProxyRelay: async options => {
          calls.relay.push(options)
          return { port: 7443, stop: async () => undefined }
        },
      }
    }
    throw new Error(`unexpected upstreamproxy import: ${specifier}`)
  }
  new Function('require', 'exports', 'module', 'process', javascript)(
    requireStub,
    module.exports,
    module,
    process,
  )
  return module.exports
}

test(
  'target116 authenticates the JSR no-proxy registry additions',
  pairOptions,
  () => {
    const baselineBytes = fs.readFileSync(baselineBundlePath)
    const targetBytes = fs.readFileSync(targetBundlePath)
    assert.equal(sha256(baselineBytes), baselineSha256)
    assert.equal(sha256(targetBytes), targetSha256)
    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')

    const baselineRegion = structural.unmatchedBaseline.find(
      candidate => candidate.index === baselineUnit.index,
    )
    assert.ok(baselineRegion, `baseline unit ${baselineUnit.index}`)
    assert.deepEqual(
      [baselineRegion.start, baselineRegion.end, baselineRegion.sourceHash],
      [baselineUnit.start, baselineUnit.end, baselineUnit.sourceHash],
    )
    const baselineDeclaration = baseline.slice(
      baselineUnit.start,
      baselineUnit.end,
    )
    assert.equal(sha256(baselineDeclaration), baselineUnit.sourceHash)

    const targetRegion = structural.regions[targetUnit.index]
    assert.equal(targetRegion.classification, 'unresolved')
    assert.deepEqual(
      [
        targetRegion.target.start,
        targetRegion.target.end,
        targetRegion.target.sourceHash,
      ],
      [targetUnit.start, targetUnit.end, targetUnit.sourceHash],
    )
    const targetDeclaration = target.slice(targetUnit.start, targetUnit.end)
    assert.equal(sha256(targetDeclaration), targetUnit.sourceHash)

    for (const row of typedRows) {
      assert.equal(exactLiteralCount(baselineDeclaration, row.value), 0)
      assert.equal(exactLiteralCount(targetDeclaration, row.value), 1)
      assert.equal(
        target.slice(row.start, row.end),
        JSON.stringify(row.value),
        `added-owner rows historical=${row.historicalRow} current=${row.currentRow}`,
      )
    }
    assert.ok(
      targetDeclaration.includes(
        '"registry.npmjs.org","jsr.io","npm.jsr.io","pypi.org"',
      ),
    )
  },
)

test('enabled upstream proxy bypasses both JSR registry hosts', sourceOptions, async () => {
  const ownerSource = source('src/upstreamproxy/upstreamproxy.ts')
  for (const row of typedRows) {
    assert.equal(ownerSource.split(`'${row.value}'`).length - 1, 1, row.value)
  }
  assert.ok(
    ownerSource.includes(
      "'registry.npmjs.org',\n  'jsr.io',\n  'npm.jsr.io',\n  'pypi.org',",
    ),
  )

  const calls = {
    cleanups: [],
    logs: [],
    mkdir: [],
    readFile: [],
    relay: [],
    unlink: [],
    writeFile: [],
  }
  const previousEnv = Object.fromEntries(
    [
      'CLAUDE_CODE_REMOTE',
      'CCR_UPSTREAM_PROXY_ENABLED',
      'CLAUDE_CODE_REMOTE_SESSION_ID',
    ].map(key => [key, process.env[key]]),
  )
  const previousFetch = globalThis.fetch
  const fetchCalls = []
  process.env.CLAUDE_CODE_REMOTE = '1'
  process.env.CCR_UPSTREAM_PROXY_ENABLED = '1'
  process.env.CLAUDE_CODE_REMOTE_SESSION_ID = 'semantic-session'
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    return { ok: true, text: async () => 'ccr-ca\n' }
  }

  try {
    const owner = await executeOwner(calls)
    assert.deepEqual(
      await owner.initUpstreamProxy({
        tokenPath: '/semantic/session-token',
        systemCaPath: '/semantic/system-ca.pem',
        caBundlePath: '/semantic/combined-ca.pem',
        awsConfigPath: '/semantic/aws/config',
        ccrBaseUrl: 'https://semantic.invalid',
      }),
      {
        enabled: true,
        port: 7443,
        caBundlePath: '/semantic/combined-ca.pem',
      },
    )
    assert.equal(fetchCalls.length, 1)
    assert.equal(
      fetchCalls[0].url,
      'https://semantic.invalid/v1/code/upstreamproxy/ca-cert',
    )
    assert.deepEqual(calls.relay, [
      {
        wsUrl: 'wss://semantic.invalid/v1/code/upstreamproxy/ws',
        sessionId: 'semantic-session',
        token: 'semantic-token',
      },
    ])

    const env = owner.getUpstreamProxyEnv()
    assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:7443')
    assert.equal(env.https_proxy, env.HTTPS_PROXY)
    assert.equal(env.NO_PROXY, env.no_proxy)
    assert.equal(env.SSL_CERT_FILE, '/semantic/combined-ca.pem')
    const bypass = env.NO_PROXY.split(',')
    assert.deepEqual(
      bypass.slice(
        bypass.indexOf('registry.npmjs.org'),
        bypass.indexOf('pypi.org') + 1,
      ),
      ['registry.npmjs.org', 'jsr.io', 'npm.jsr.io', 'pypi.org'],
    )
    for (const row of typedRows) {
      assert.equal(
        bypass.filter(host => host === row.value).length,
        1,
        `${row.value}: exactly one bypass entry`,
      )
    }
    owner.resetUpstreamProxyForTests()
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    globalThis.fetch = previousFetch
  }
})
