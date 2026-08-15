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
const baselineSha256 =
  'cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16'
const targetSha256 =
  'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a'

const units = {
  authState: {
    index: 14508,
    start: 9102049,
    end: 9102315,
    sourceHash:
      'a601ce01a1a8e58f5d5f5bd26f97753d24f3d638cb29b302b5d2d4ae083f1576',
  },
  extractElicitations: {
    index: 14545,
    start: 9113622,
    end: 9113795,
    sourceHash:
      '818d87307e12c1d77c91b1e77e9ec3d50a92c4098e969fba1d7eb4b6da85994a',
  },
  retryElicitation: {
    index: 14546,
    start: 9113795,
    end: 9115792,
    sourceHash:
      '97e67bf833771a89aef966faeac1823cdd7543e515872c27b5d52ab21b86287b',
  },
  toolExecutionCaller: {
    index: 13604,
    start: 8589712,
    end: 8603636,
    sourceHash:
      'd1efb963531943feeab5ff1521cdfa20debc75304a810573537027233ff6fcdb',
  },
  controlSchemas: {
    index: 19762,
    start: 12001052,
    end: 12018785,
    sourceHash:
      '02ec7e35fe2c4764246e9a3115e32c55e7ae7f59d55cccc9dfaed6cd83a476ef',
  },
  printHandler: {
    index: 20581,
    start: 12915603,
    end: 12954120,
    sourceHash:
      '66fa02021a22925ae2e3eb6c757c5a9e91a25ecb102ebe0ed8bdd47efeb44ce2',
  },
}

const typedRows = [
  {
    historicalRow: 557,
    currentRow: 469,
    value: 'urlElicitationDeclined',
    occurrence: 1,
    start: 9114791,
    end: 9114813,
    unit: 14546,
  },
  {
    historicalRow: 558,
    currentRow: 470,
    value: 'urlElicitationDeclined',
    occurrence: 2,
    start: 9115699,
    end: 9115721,
    unit: 14546,
  },
  {
    historicalRow: 937,
    currentRow: 750,
    value: 'mcp_call',
    raw: '"mcp_call"',
    occurrence: 1,
    start: 12008498,
    end: 12008508,
    unit: 19762,
  },
  {
    historicalRow: 1023,
    currentRow: 822,
    value: 'mcp_call',
    raw: '"mcp_call"',
    occurrence: 2,
    start: 12941450,
    end: 12941460,
    unit: 20581,
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
    : !baselinePath || !targetPath
      ? 'CLAUDE_CODE_2_1_114_BUNDLE and CLAUDE_CODE_2_1_116_BUNDLE are required'
      : false,
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
}

function targetRegion(index) {
  const direct = structural.regions[index]
  if (direct?.target?.index === index) return direct
  return structural.unresolvedTarget.find(entry => entry.target.index === index)
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1
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

async function instantiateElicitationHelpers({ hookResponse, resultHook }) {
  const ts = await loadTypeScript()
  const owner = source('services/mcp/client.ts')
  const ast = ts.createSourceFile(
    'client.ts',
    owner,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const wanted = new Set([
    'extractUrlElicitations',
    'callMCPToolWithUrlElicitationRetry',
  ])
  const declarations = ast.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      wanted.has(statement.name.text),
  )
  assert.equal(declarations.length, 2)
  const snippet = declarations
    .map(statement => owner.slice(statement.getFullStart(), statement.end))
    .join('\n')
  const javascript = ts.transpileModule(snippet, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  class StubMcpError extends Error {
    constructor(code, message, data) {
      super(message)
      this.code = code
      this.data = data
    }
  }
  const schema = {
    safeParse(value) {
      try {
        return {
          success:
            value?.mode === 'url' &&
            typeof value.message === 'string' &&
            typeof value.elicitationId === 'string' &&
            typeof value.url === 'string' &&
            new URL(value.url).protocol !== '',
        }
      } catch {
        return { success: false }
      }
    },
  }
  const module = { exports: {} }
  new Function(
    'exports',
    'module',
    'McpError',
    'ErrorCode',
    'ElicitRequestURLParamsSchema',
    'callMCPTool',
    'getCurrentImageLimits',
    'logMCPDebug',
    'runElicitationHooks',
    'runElicitationResultHooks',
    'jsonStringify',
    javascript,
  )(
    module.exports,
    module,
    StubMcpError,
    { UrlElicitationRequired: -32042 },
    schema,
    () => assert.fail('the injected callToolFn must be used'),
    () => assert.fail('the injected image limits must be used'),
    () => {},
    async () => hookResponse,
    async (_server, result) => resultHook?.(result) ?? result,
    JSON.stringify,
  )
  return { ...module.exports, StubMcpError }
}

test('target116 authenticates the reachable SDK mcp_call graph', bundleOptions, () => {
  const baselineBytes = fs.readFileSync(baselinePath)
  const targetBytes = fs.readFileSync(targetPath)
  assert.equal(sha256(baselineBytes), baselineSha256)
  assert.equal(sha256(targetBytes), targetSha256)
  const baseline = baselineBytes.toString('utf8')
  const target = targetBytes.toString('utf8')

  assert.equal(count(baseline, 'urlElicitationDeclined'), 0)
  assert.equal(count(target, 'urlElicitationDeclined'), 4)
  assert.equal(count(baseline, 'mcp_call'), 0)
  assert.equal(count(target, 'mcp_call'), 7)

  for (const unit of Object.values(units)) {
    const region = targetRegion(unit.index)
    assert.ok(region, `missing target structural unit ${unit.index}`)
    assert.equal(region.classification, 'unresolved')
    assert.deepEqual(
      [region.target.start, region.target.end, region.target.sourceHash],
      [unit.start, unit.end, unit.sourceHash],
    )
    assert.equal(
      sha256(target.slice(unit.start, unit.end)),
      unit.sourceHash,
      `target structural hash ${unit.index}`,
    )
  }

  for (const row of typedRows) {
    assert.equal(target.slice(row.start, row.end), row.raw ?? row.value)
    assert.equal(row.occurrence > 0, true)
  }

  const retry = target.slice(
    units.retryElicitation.start,
    units.retryElicitation.end,
  )
  assert.match(retry, /urlElicitationDeclined:\{url:/)
  assert.equal(count(retry, 'urlElicitationDeclined'), 2)
  const schemas = target.slice(
    units.controlSchemas.start,
    units.controlSchemas.end,
  )
  assert.match(schemas, /subtype:.*"mcp_call"/)
  assert.match(schemas, /Fully-qualified MCP tool name/)
  const print = target.slice(units.printHandler.start, units.printHandler.end)
  assert.match(print, /Not a fully-qualified MCP tool name:/)
  assert.match(print, /mcp_call does not support SDK MCP servers/)
  assert.match(print, /send mcp_reconnect and retry mcp_call/)
  assert.match(print, /urlElicitationDeclined/)
})

test('source executes URL-decline metadata and retry behavior', sourceOptions, async () => {
  const elicitation = {
    mode: 'url',
    message: 'Authenticate',
    elicitationId: 'e-1',
    url: 'https://example.com/auth',
  }
  const common = {
    client: {},
    clientConnection: { type: 'connected', name: 'server' },
    tool: 'authenticate',
    args: {},
    signal: new AbortController().signal,
    setAppState() {},
    imageLimits: {},
  }

  {
    const helpers = await instantiateElicitationHelpers({
      hookResponse: { action: 'decline' },
    })
    const result = await helpers.callMCPToolWithUrlElicitationRetry({
      ...common,
      callToolFn: async () => {
        throw new helpers.StubMcpError(-32042, 'open URL', {
          elicitations: [elicitation],
        })
      },
    })
    assert.deepEqual(result.urlElicitationDeclined, {
      url: elicitation.url,
    })
    assert.match(result.content, /declined by a hook/)
  }

  {
    const helpers = await instantiateElicitationHelpers({
      hookResponse: undefined,
    })
    const result = await helpers.callMCPToolWithUrlElicitationRetry({
      ...common,
      handleElicitation: async () => ({ action: 'cancel' }),
      callToolFn: async () => {
        throw new helpers.StubMcpError(-32042, 'open URL', {
          elicitations: [elicitation],
        })
      },
    })
    assert.deepEqual(result.urlElicitationDeclined, {
      url: elicitation.url,
    })
    assert.match(result.content, /canceled by the user/)

    const extracted = helpers.extractUrlElicitations(
      new helpers.StubMcpError(-32042, 'open URL', {
        elicitations: [
          elicitation,
          { ...elicitation, url: 'not a url' },
          { mode: 'url', url: 'https://example.com/missing-fields' },
        ],
      }),
    )
    assert.deepEqual(extracted, [elicitation])
  }

  {
    const helpers = await instantiateElicitationHelpers({
      hookResponse: { action: 'accept' },
    })
    let attempts = 0
    const result = await helpers.callMCPToolWithUrlElicitationRetry({
      ...common,
      callToolFn: async () => {
        attempts++
        if (attempts === 1) {
          throw new helpers.StubMcpError(-32042, 'open URL', {
            elicitations: [elicitation],
          })
        }
        return { content: [{ type: 'text', text: 'done' }] }
      },
    })
    assert.equal(attempts, 2)
    assert.deepEqual(result.content, [{ type: 'text', text: 'done' }])
  }
})

test('source wires schema, print control path, and shared auth transition', sourceOptions, () => {
  const client = source('services/mcp/client.ts')
  const execution = source('services/tools/toolExecution.ts')
  const schemas = source('entrypoints/sdk/controlSchemas.ts')
  const print = source('cli/print.ts')

  assert.equal(count(client, 'urlElicitationDeclined'), 3)
  assert.match(client, /ElicitRequestURLParamsSchema\.safeParse\(value\)\.success/)
  assert.match(client, /export function markMcpServerNeedsAuth/)
  assert.match(
    execution,
    /markMcpServerNeedsAuth\(error\.serverName, toolUseContext\.setAppState\)/,
  )

  assert.match(schemas, /SDKControlMcpCallRequestSchema/)
  assert.match(schemas, /subtype: z\.literal\('mcp_call'\)/)
  assert.match(schemas, /SDKControlMcpCallRequestSchema\(\)/)
  assert.match(print, /message\.request\.subtype === 'mcp_call'/)
  assert.match(print, /callMCPToolWithUrlElicitationRetry\(\{/)
  assert.match(print, /handleElicitation: async \(\) => \(\{ action: 'cancel' \}\)/)
  assert.match(print, /markMcpServerNeedsAuth\(error\.serverName, setAppState\)/)
  assert.match(print, /URL elicitation required \(open URL, then retry mcp_call\):/)
  assert.match(print, /send mcp_reconnect and retry mcp_call/)
  assert.match(print, /const controlAbortController = createAbortController\(500\)/)
})
