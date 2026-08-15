import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
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
const followupPath = process.env.CLAUDE_CODE_2_1_107_BUNDLE
const latestPath = process.env.CLAUDE_CODE_2_1_116_BUNDLE
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

const units = new Map([
  [16975, ['ClassDeclaration', 12074404, 12083451, 'a1a7fc3d856a43adf565ebfc74352f2dabdd8830b998f33382e35f1ecde6ec6e']],
  [18167, ['FunctionDeclaration', 12656125, 12656679, 'cc9508195bf97239c5f9f3cbc9f33277aa23386b9b85c7d712ecb2226d9eac4b']],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function source(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
}

function section(contents, startMarker, endMarker) {
  const start = contents.indexOf(startMarker)
  assert.notEqual(start, -1, `missing section start: ${startMarker}`)
  const end = contents.indexOf(endMarker, start)
  assert.notEqual(end, -1, `missing section end: ${endMarker}`)
  return contents.slice(start, end)
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

async function executeBuilder(structured, tool, input) {
  const builder = section(
    structured,
    'function buildRequiresActionDetails(',
    '\ntype PendingRequest',
  )
  const helperStart = structured.indexOf('const SENSITIVE_MCP_INPUT_KEY')
  const helperEnd = structured.indexOf('function serializeDecisionReason')
  const helperPrelude =
    helperStart >= 0 && helperEnd > helperStart
      ? structured.slice(helperStart, helperEnd)
      : ''
  const javascript = await compileCommonJs(`
    type Tool = any
    type RequiresActionDetails = any
    const BASH_TOOL_NAME = 'Bash'
    const POWERSHELL_TOOL_NAME = 'PowerShell'
    const logs: unknown[] = []
    const logForDebugging = (...args: unknown[]) => logs.push(args)
    const redactSecrets = (value: string) => value
    const jsonStringify = JSON.stringify
    ${helperPrelude}
    ${builder}
    export { buildRequiresActionDetails, logs }
  `)
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    () => ({}),
    module.exports,
    module,
  )
  return {
    details: module.exports.buildRequiresActionDetails(
      tool,
      input,
      'tool-use-1',
      'request-1',
    ),
    logs: module.exports.logs,
  }
}

async function executeReporter(client, details) {
  const reportState = section(
    client,
    '  reportState(',
    '\n  /** Report external metadata',
  )
  const javascript = await compileCommonJs(`
    type SessionState = 'idle' | 'running' | 'requires_action'
    type RequiresActionDetails = any
    const enqueued: unknown[] = []
    class Reporter {
      currentState: SessionState | null = null
      workerState = { enqueue: (payload: unknown) => enqueued.push(payload) }
      ${reportState}
    }
    export { Reporter, enqueued }
  `)
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    () => ({}),
    module.exports,
    module,
  )
  const reporter = new module.exports.Reporter()
  reporter.reportState('requires_action', details)
  reporter.reportState('requires_action')
  assert.equal(module.exports.enqueued.length, 1, 'same-state report dedupes')
  return module.exports.enqueued[0]
}

async function executeUploader(uploaderSource, payload) {
  const javascript = await compileCommonJs(uploaderSource)
  const sent = []
  const module = { exports: {} }
  new Function('require', 'exports', 'module', javascript)(
    id => {
      if (id.endsWith('/utils/sleep.js')) {
        return { sleep: async () => undefined }
      }
      throw new Error(`unexpected uploader import: ${id}`)
    },
    module.exports,
    module,
  )
  const uploader = new module.exports.WorkerStateUploader({
    send: async body => {
      sent.push(body)
      return true
    },
    baseDelayMs: 1,
    maxDelayMs: 1,
    jitterMs: 0,
  })
  uploader.enqueue(payload)
  await uploader.inflight
  assert.equal(sent.length, 1)
  return sent[0]
}

test(
  'authenticated target105 pins raw command production and worker forwarding',
  {
    skip: !selected
      ? `not applicable to ${semanticCase}`
      : !baselinePath || !targetPath || !followupPath || !latestPath
        ? 'authenticated 2.1.104, 2.1.105, 2.1.107, and 2.1.116 bundles are required'
        : false,
  },
  () => {
    const artifacts = [
      [baselinePath, 'ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39', 0],
      [targetPath, '8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75', 3],
      [followupPath, '6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844', 3],
      [latestPath, 'd0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a', 4],
    ]
    const contents = artifacts.map(([filename, hash, count]) => {
      const bytes = fs.readFileSync(filename)
      assert.equal(sha256(bytes), hash)
      const text = bytes.toString('utf8')
      assert.equal(occurrences(text, 'raw_command'), count)
      return text
    })

    const target = contents[1]
    for (const [index, [nodeType, start, end, hash]] of units) {
      const region = structural.regions[index]
      assert.equal(region.classification, 'unresolved', `${index}: class`)
      assert.equal(region.target.index, index, `${index}: target index`)
      assert.equal(region.target.nodeType, nodeType, `${index}: node type`)
      assert.equal(region.target.parseStatus, 'parsed', `${index}: parse`)
      assert.deepEqual(
        [region.target.start, region.target.end, region.target.sourceHash],
        [start, end, hash],
        `${index}: identity`,
      )
      assert.equal(sha256(target.slice(start, end)), hash, `${index}: bytes`)
    }

    const reporter = target.slice(12074404, 12083451)
    assert.ok(
      reporter.includes(
        'raw_command:K.raw_command,request_id:K.request_id',
      ),
    )
    const builder = target.slice(12656125, 12656679)
    for (const fragment of [
      'getToolUseSummary?.(K)??q.getActivityDescription?.(K)',
      'buildRequiresActionDetails: description failed:',
      'typeof K.command==="string"',
      'else if(q.isMcp){let O=JSON.stringify(K)',
      'O.length>200?O.slice(0,197)+"...":O',
      'buildRequiresActionDetails: rawCommand failed:',
      'raw_command:A',
    ]) assert.ok(builder.includes(fragment), fragment)

    assert.equal(contents[0].includes('raw_command'), false)
    assert.ok(contents[3].includes('tool_use_id:$.tool_use_id'))
  },
)

test(
  'source root preserves the target105 graph or its target116 evolution',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  () => {
    const uploader = source('cli/transports/WorkerStateUploader.ts')
    const client = source('cli/transports/ccrClient.ts')
    const structured = source('cli/structuredIO.ts')
    const schema = source('utils/sessionState.ts')
    const reportState = section(
      client,
      '  reportState(',
      '\n  /** Report external metadata',
    )
    const builder = section(
      structured,
      'function buildRequiresActionDetails(',
      '\ntype PendingRequest',
    )

    assert.ok(schema.includes('raw_command?: string'))
    assert.ok(schema.includes('export class SessionStateManager'))
    assert.ok(reportState.includes('raw_command: details.raw_command'))
    assert.ok(builder.includes('raw_command: rawCommand'))
    assert.ok(builder.includes('tool.getToolUseSummary?.(input)'))
    assert.ok(builder.includes('tool.getActivityDescription?.(input)'))
    assert.ok(builder.includes('BASH_TOOL_NAME'))
    assert.ok(builder.includes('POWERSHELL_TOOL_NAME'))
    assert.equal(uploader.includes('raw_command'), false)
    assert.ok(uploader.includes('Record<string, unknown>'))
    assert.ok(uploader.includes('coalescePatches'))

    const target105Mode = builder.includes('const serialized = JSON.stringify(input)')
    if (target105Mode) {
      assert.ok(builder.includes('serialized.length > 200'))
      assert.ok(builder.includes('serialized.slice(0, 197)'))
      assert.equal(structured.includes('getMcpInputPreview(input)'), false)
      assert.equal(reportState.includes('tool_use_id:'), false)
    } else {
      assert.ok(builder.includes('getMcpInputPreview(input)'))
      assert.ok(structured.includes('redactMcpInputFields'))
      assert.ok(structured.includes('redactSecrets'))
      assert.ok(reportState.includes('tool_use_id: details.tool_use_id'))
    }
  },
)

test(
  'executable producer, reporter, and generic uploader preserve raw command',
  { skip: selected ? false : `not applicable to ${semanticCase}` },
  async () => {
    const uploaderSource = source('cli/transports/WorkerStateUploader.ts')
    const client = source('cli/transports/ccrClient.ts')
    const structured = source('cli/structuredIO.ts')
    const target105Mode = structured.includes(
      'const serialized = JSON.stringify(input)',
    )
    const baseTool = {
      getToolUseSummary: () => 'summary wins',
      getActivityDescription: () => 'activity loses',
      userFacingName: () => 'fallback loses',
      isMcp: false,
    }
    const bash = await executeBuilder(
      structured,
      { ...baseTool, name: 'Bash' },
      { command: 'printf worker-state' },
    )
    assert.equal(bash.details.action_description, 'summary wins')
    assert.equal(bash.details.raw_command, 'printf worker-state')
    assert.equal(bash.details.tool_use_id, 'tool-use-1')
    assert.equal(bash.details.request_id, 'request-1')

    const powershell = await executeBuilder(
      structured,
      { ...baseTool, name: 'PowerShell' },
      { command: 'Write-Output worker-state' },
    )
    assert.equal(powershell.details.raw_command, 'Write-Output worker-state')

    const mcp = await executeBuilder(
      structured,
      { ...baseTool, name: 'mcp__demo', isMcp: true },
      { api_key: 'secret-value', payload: 'x'.repeat(300) },
    )
    assert.equal(mcp.details.raw_command.length, 200)
    assert.ok(mcp.details.raw_command.endsWith('...'))
    if (target105Mode) {
      assert.ok(mcp.details.raw_command.includes('secret-value'))
    } else {
      assert.equal(mcp.details.raw_command.includes('secret-value'), false)
      assert.ok(mcp.details.raw_command.includes('[REDACTED]'))
    }

    const payload = await executeReporter(client, bash.details)
    assert.equal(payload.worker_status, 'requires_action')
    assert.equal(
      payload.requires_action_details.raw_command,
      'printf worker-state',
    )
    assert.equal(payload.requires_action_details.request_id, 'request-1')
    assert.equal(
      Object.hasOwn(payload.requires_action_details, 'tool_use_id'),
      !target105Mode,
    )

    const uploaded = await executeUploader(uploaderSource, payload)
    assert.deepEqual(uploaded, payload)
    assert.equal(
      uploaded.requires_action_details.raw_command,
      'printf worker-state',
    )
  },
)
