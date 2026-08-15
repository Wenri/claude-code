import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const releases = [
  {
    version: '2.1.121',
    envNames: ['CLAUDE_CODE_2_1_121_BUNDLE', 'CLAUDE_2_1_121_CLI_INNER'],
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
  {
    version: '2.1.122',
    envNames: ['CLAUDE_CODE_2_1_122_BUNDLE', 'CLAUDE_2_1_122_CLI_INNER'],
    bytes: 13_949_544,
    sha256:
      'b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c',
  },
]

function readBundle(release) {
  const filename = release.envNames.map(name => process.env[name]).find(Boolean)
  assert.ok(filename, `${release.envNames.join(' or ')} must be set`)
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, release.bytes, `${release.version}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    release.sha256,
    `${release.version}: SHA-256`,
  )
  return bytes.toString('utf8')
}

function occurrences(contents, fragment) {
  return contents.split(fragment).length - 1
}

function compact(contents) {
  return contents.replaceAll(/\s+/g, ' ').trim()
}

function source(relativePath) {
  return compact(fs.readFileSync(path.join(repo, relativePath), 'utf8'))
}

function includesAll(contents, fragments) {
  for (const fragment of fragments) {
    assert.ok(contents.includes(compact(fragment)), `missing ${fragment}`)
  }
}

test('authenticates retained agent, API-body, and user-context witnesses', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'agent_system_prompt_chars'),
      1,
      `${release.version}: agent prompt telemetry cardinality`,
    )
    assert.equal(
      occurrences(bundle, 'body_ref'),
      1,
      `${release.version}: raw body file reference cardinality`,
    )
    assert.match(
      bundle,
      /startsWith\("file:"\)[\s\S]{0,2000}OTEL_LOG_RAW_API_BODIES[\s\S]{0,2000}body_ref:/,
      `${release.version}: file:<dir> API-body mode`,
    )
    assert.match(
      bundle,
      /process\.env\.ANTHROPIC_UNIX_SOCKET\?void 0:[A-Za-z_$][\w$]*\(\)\?\.emailAddress/,
      `${release.version}: user email guard`,
    )
    assert.ok(
      bundle.includes("The user's email address is "),
      `${release.version}: user email context`,
    )
  }
})

test('source computes one agent prompt and reports its exact length', () => {
  const contents = source('src/tools/AgentTool/AgentTool.tsx')
  includesAll(contents, [
    'const agentSystemPrompt = selectedAgent.getSystemPrompt({ toolUseContext });',
    'agent_system_prompt_chars: agentSystemPrompt.length',
    'const agentPrompt = agentSystemPrompt;',
  ])
  assert.equal(
    occurrences(contents, 'selectedAgent.getSystemPrompt('),
    1,
    'selected agent prompt is evaluated exactly once',
  )
})

test('source preserves file-mode API bodies and guarded user email context', () => {
  const bodyLogging = source('src/utils/telemetry/apiBodyLogging.ts')
  includesAll(bodyLogging, [
    "raw?.startsWith('file:')",
    "{ mode: 'file', dir: resolve(dir) }",
    "const kind = eventName === 'api_request_body' ? 'request' : 'response'",
    'const requestId = /^[A-Za-z0-9_-]+$/.test(candidate)',
    'const filename = join(config.dir, `${requestId}.${kind}.json`)',
    'if (!isENOENT(error)) throw error',
    'await mkdir(dir, { recursive: true })',
    'body_ref: filename',
    'body_length: String(Buffer.byteLength(serialized))',
  ])

  const context = source('src/context.ts')
  includesAll(context, [
    'const userEmail = process.env.ANTHROPIC_UNIX_SOCKET ? undefined : getOauthAccountInfo()?.emailAddress',
    'has_user_email: Boolean(userEmail)',
    "userEmail: `The user's email address is ${userEmail}.`",
  ])
})

test('authenticates retained analytics dimensions and plugin theme count', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'coach_mode'),
      1,
      `${release.version}: coach mode mapping`,
    )
    assert.equal(
      occurrences(bundle, 'session_kind'),
      1,
      `${release.version}: session kind mapping`,
    )
    assert.equal(
      occurrences(bundle, 'theme_count'),
      2,
      `${release.version}: success and failure theme counts`,
    )
    assert.match(
      bundle,
      /skill_mode:[A-Za-z_$][\w$]*},\.\.\.[A-Za-z_$][\w$]*&&\{coach_mode:[A-Za-z_$][\w$]*},\.\.\.[A-Za-z_$][\w$]*&&\{observer_mode:[A-Za-z_$][\w$]*},\.\.\.[A-Za-z_$][\w$]*&&\{session_kind:[A-Za-z_$][\w$]*}/,
      `${release.version}: ordered 1P mappings`,
    )
    assert.match(
      bundle,
      /lsp_count:0,theme_count:0,load_failed:!0/,
      `${release.version}: plugin failure metrics`,
    )
  }
})

test('source maps session dimensions and loads plugin themes before metrics', () => {
  const metadata = source('src/services/analytics/metadata.ts')
  includesAll(metadata, [
    'const sessionKind = getSessionKind()',
    '...(sessionKind && { sessionKind })',
    'coachMode, observerMode, sessionKind, ...coreFields',
    '...(coachMode && { coach_mode: coachMode })',
    '...(sessionKind && { session_kind: sessionKind })',
  ])

  const plugins = source('src/hooks/useManagePlugins.ts')
  includesAll(plugins, [
    'reinitializeLspServerManager() const theme_count = (await loadPluginThemes(enabled)).length',
    'mcp_count, lsp_count, theme_count,',
    'lsp_count: 0, theme_count: 0, load_failed: true',
  ])
  includesAll(source('src/utils/plugins/loadPluginThemes.ts'), [
    'plugins?: LoadedPlugin[]',
    'const enabled = plugins ?? (await loadAllPluginsCacheOnly()).enabled',
  ])
})

test('authenticates retained SDK REPL progress and user-origin normalization', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'repl_call'),
      1,
      `${release.version}: REPL progress envelope cardinality`,
    )
    assert.equal(
      occurrences(bundle, 'inner_tool_name'),
      1,
      `${release.version}: REPL inner-tool name cardinality`,
    )
    assert.match(
      bundle,
      /type:"tool_progress",tool_use_id:[\s\S]{0,250}tool_name:"REPL"[\s\S]{0,250}elapsed_time_seconds:0,repl_call:\{inner_tool_name:[\s\S]{0,500}inner_tool_input:[\s\S]{0,500}inner_tool_use_id:[\s\S]{0,500}phase:/,
      `${release.version}: exact REPL tool-progress shape`,
    )
    assert.match(
      bundle,
      /tool_use_result:[\s\S]{0,300}\.\.\.[A-Za-z_$][\w$]*\.origin&&\{origin:[A-Za-z_$][\w$]*\.origin\}/,
      `${release.version}: SDK user origin forwarding`,
    )
  }
})

test('source emits exact retained SDK REPL progress and user origins', () => {
  const queryHelpers = source('src/utils/queryHelpers.ts')
  includesAll(queryHelpers, [
    "message.data.type === 'repl_tool_call'",
    "type: 'tool_progress'",
    "tool_name: 'REPL'",
    'elapsed_time_seconds: 0',
    'inner_tool_name: message.data.toolName',
    'inner_tool_input: message.data.toolInput',
    'inner_tool_use_id: message.data.toolUseId',
    'phase: message.data.phase',
    '...(_.origin && { origin: _.origin })',
  ])
  assert.equal(
    occurrences(queryHelpers, '...(_.origin && { origin: _.origin })'),
    2,
    'origin is forwarded for nested and top-level user messages',
  )
})

test('authenticates retained SDK compact status metadata', () => {
  for (const release of releases) {
    const bundle = readBundle(release)
    assert.equal(
      occurrences(bundle, 'compact_result'),
      2,
      `${release.version}: compact result schema and output fields`,
    )
    assert.equal(
      occurrences(bundle, 'compact_error'),
      2,
      `${release.version}: compact error schema and output fields`,
    )
    assert.equal(
      occurrences(bundle, 'compactResult'),
      8,
      `${release.version}: compact result propagation cardinality`,
    )
    assert.equal(
      occurrences(bundle, 'compactError'),
      7,
      `${release.version}: compact error propagation cardinality`,
    )
    assert.match(
      bundle,
      /subtype:[\w$]+\.literal\("status"\),status:[\w$]+\(\),permissionMode:[\w$]+\(\)\.optional\(\),compact_result:[\w$]+\.enum\(\["success","failed"\]\)\.optional\(\),compact_error:[\w$]+\.string\(\)\.optional\(\)/,
      `${release.version}: compact status runtime schema`,
    )
    assert.match(
      bundle,
      /setSDKStatus:\([\w$]+,[\w$]+\)=>\{[\s\S]{0,600}compact_result:[\w$]+\.compactResult[\s\S]{0,600}compact_error:[\w$]+\.compactError/,
      `${release.version}: compact metadata SDK output mapping`,
    )
  }
})

test('source propagates compact outcomes through the SDK status callback', () => {
  includesAll(source('src/entrypoints/sdk/coreSchemas.ts'), [
    "compact_result: z.enum(['success', 'failed']).optional()",
    'compact_error: z.string().optional()',
  ])
  includesAll(source('src/Tool.ts'), [
    'export type SetSDKStatus = ( status: SDKStatus, metadata?: {',
    "compactResult?: 'success' | 'failed'",
    'compactError?: string',
    'setSDKStatus?: SetSDKStatus',
  ])
  includesAll(source('src/cli/print.ts'), [
    'setSDKStatus: (status, metadata) =>',
    'metadata?.compactResult !== undefined',
    'compact_result: metadata.compactResult',
    'metadata?.compactError !== undefined',
    'compact_error: metadata.compactError',
  ])
  includesAll(source('src/services/compact/reactiveCompact.ts'), [
    "compactResult: 'failed', compactError: detail",
    "compactResult: 'success'",
  ])
  includesAll(source('src/services/compact/compact.ts'), [
    "error instanceof Error ? error.message : 'compaction failed'",
    "error instanceof Error ? error.message : 'partial compaction failed'",
    "compactResult: compactError ? 'failed' : 'success'",
    '...(compactError && { compactError })',
  ])
  includesAll(source('src/commands/compact/compact.ts'), [
    "compactResult: 'failed'",
    'compactError: error instanceof Error ? error.message : String(error)',
    "compactResult: compactError ? 'failed' : 'success'",
  ])
})
