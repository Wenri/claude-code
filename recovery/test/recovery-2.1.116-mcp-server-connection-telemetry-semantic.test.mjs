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

const targetUnits = new Map([
  [14517, [9103143, 9103400, 'FunctionDeclaration', 'de5cabf1e16cdf536a9342e1bc86fb33bde9ab5c94bf02742b743dee126fa1b6']],
  [14552, [9120603, 9139657, 'VariableDeclaration', 'd15fa7f087705d62459807aa6f772efae464ce535c570168ab40b89953218ed0']],
])

const addedOccurrences = [
  ['"mcp_server_connection"', 9103166, 9103189],
  ['transport_type', 9103207, 9103221],
  ['server_scope', 9103238, 9103250],
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
  const parametersStart = contents.indexOf('(', start)
  let parameterDepth = 0
  let parametersEnd = -1
  for (let index = parametersStart; index < contents.length; index += 1) {
    if (contents[index] === '(') parameterDepth += 1
    if (contents[index] === ')') {
      parameterDepth -= 1
      if (parameterDepth === 0) {
        parametersEnd = index
        break
      }
    }
  }
  assert.notEqual(parametersEnd, -1, `${marker} parameters`)
  const bodyStart = contents.indexOf('{', parametersEnd)
  let bodyDepth = 0
  for (let index = bodyStart; index < contents.length; index += 1) {
    if (contents[index] === '{') bodyDepth += 1
    if (contents[index] === '}') {
      bodyDepth -= 1
      if (bodyDepth === 0) return contents.slice(start, index + 1)
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
  'authenticated target116 adds privacy-safe MCP connection lifecycle telemetry',
  bundleOptions,
  () => {
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
    for (const [index, identity] of targetUnits) {
      const region = structural.regions[index]
      assert.notEqual(region.classification, 'matched')
      assert.deepEqual(
        [
          region.target.start,
          region.target.end,
          region.target.nodeType,
          region.target.sourceHash,
        ],
        identity,
      )
      assert.equal(
        sha256(targetBytes.subarray(identity[0], identity[1])),
        identity[3],
      )
    }

    const baseline = baselineBytes.toString('utf8')
    const target = targetBytes.toString('utf8')
    assert.equal(baseline.split('"mcp_server_connection"').length - 1, 0)
    for (const [value, start, end] of addedOccurrences) {
      assert.equal(target.slice(start, end), value)
    }

    const helper = target.slice(9103143, 9103400)
    const caller = target.slice(9120603, 9139657)
    const helperName = /^function ([A-Za-z_$][\w$]*)\(/.exec(helper)?.[1]
    assert.ok(helperName)
    for (const fragment of [
      '"mcp_server_connection"',
      'transport_type:$.type??"stdio"',
      'server_scope:$.scope',
      'duration_ms:String(Math.round(q.durationMs))',
      'error_code:q.errorCode',
      'server_name:H',
      'error:q.error',
    ]) {
      assert.ok(helper.includes(fragment), fragment)
    }
    assert.equal(target.split(`${helperName}(`).length - 1, 4)
    assert.equal(caller.split(`${helperName}(`).length - 1, 3)
    for (const status of ['disconnected', 'connected', 'failed']) {
      assert.ok(caller.includes(`status:"${status}"`), status)
    }
    assert.match(caller, /"code"in [A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*\.code!==void 0\?String\([A-Za-z_$][\w$]*\.code\):void 0/)
  },
)

test('source owns the helper, privacy gate, and all three lifecycle edges', sourceOptions, () => {
  const client = source('services/mcp/client.ts')
  for (const fragment of [
    "import { isToolDetailsLoggingEnabled } from '../analytics/metadata.js'",
    "import { logOTelEvent } from '../../utils/telemetry/events.js'",
    'function logMcpServerConnection(',
    "void logOTelEvent('mcp_server_connection'",
    "transport_type: serverRef.type ?? 'stdio'",
    'server_scope: serverRef.scope',
    'duration_ms: String(Math.round(values.durationMs))',
    '...(values.errorCode && { error_code: values.errorCode })',
    '...(isToolDetailsLoggingEnabled() && {',
    'server_name: name',
  ]) {
    assert.ok(client.includes(fragment), fragment)
  }
  assert.equal(client.split('logMcpServerConnection(').length - 1, 4)
  for (const status of ['disconnected', 'connected', 'failed']) {
    assert.ok(client.includes(`status: '${status}'`), status)
  }
  assert.match(
    client,
    /const errorCode =\s*error &&\s*typeof error === 'object' &&\s*'code' in error &&\s*error\.code !== undefined\s*\? String\(error\.code\)\s*: undefined/,
  )
  assert.match(
    client,
    /logEvent\('tengu_mcp_server_connection_failed', \{\s*connectionDurationMs,\s*errorCode,/,
  )
})

test('actual recovered helper gates names and errors but always logs safe fields', sourceOptions, async () => {
  const helper = extractFunction(
    source('services/mcp/client.ts'),
    'function logMcpServerConnection',
  )
  const javascript = await compileCommonJs(`
    type ScopedMcpServerConfig = { type?: string; scope: string }
    const emitted: unknown[] = []
    let detailsEnabled = false
    function isToolDetailsLoggingEnabled() { return detailsEnabled }
    function logOTelEvent(name: string, metadata: unknown) {
      emitted.push([name, metadata])
    }
    ${helper}
    export { emitted, logMcpServerConnection }
    export function setDetailsEnabled(value: boolean) { detailsEnabled = value }
  `)
  const recovered = executeCommonJs(javascript)

  recovered.logMcpServerConnection(
    'private-server',
    { scope: 'local' },
    { status: 'connected', durationMs: 1.6 },
  )
  recovered.logMcpServerConnection(
    'private-server',
    { type: 'http', scope: 'project' },
    {
      status: 'failed',
      durationMs: 10.4,
      errorCode: 'ECONNREFUSED',
      error: 'private failure text',
    },
  )
  recovered.setDetailsEnabled(true)
  recovered.logMcpServerConnection(
    'visible-server',
    { type: 'sse', scope: 'user' },
    {
      status: 'failed',
      durationMs: 9.5,
      errorCode: 'EPIPE',
      error: 'visible failure text',
    },
  )

  assert.deepEqual(recovered.emitted, [
    [
      'mcp_server_connection',
      {
        status: 'connected',
        transport_type: 'stdio',
        server_scope: 'local',
        duration_ms: '2',
      },
    ],
    [
      'mcp_server_connection',
      {
        status: 'failed',
        transport_type: 'http',
        server_scope: 'project',
        duration_ms: '10',
        error_code: 'ECONNREFUSED',
      },
    ],
    [
      'mcp_server_connection',
      {
        status: 'failed',
        transport_type: 'sse',
        server_scope: 'user',
        duration_ms: '10',
        error_code: 'EPIPE',
        server_name: 'visible-server',
        error: 'visible failure text',
      },
    ],
  ])
})
