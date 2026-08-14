import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const bundleSpecs = [
  {
    env: 'CLAUDE_CODE_2_1_120_BUNDLE',
    bytes: 13_784_743,
    sha256:
      'c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f',
  },
  {
    env: 'CLAUDE_CODE_2_1_121_BUNDLE',
    bytes: 13_908_188,
    sha256:
      '783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a',
  },
]

function loadBundle({ env, bytes, sha256 }) {
  const filename = process.env[env]
  assert.ok(filename, `${env} must be set`)
  const contents = fs.readFileSync(filename)
  assert.equal(contents.length, bytes, `${env}: byte length`)
  assert.equal(
    crypto.createHash('sha256').update(contents).digest('hex'),
    sha256,
    `${env}: SHA-256`,
  )
  return contents.toString('utf8')
}

function source(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8')
}

function compact(value) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1
}

test('authenticated adjacent bundles contain the inherited SDK control surface', () => {
  const exactOnce = [
    'Fully-qualified MCP tool name, e.g. mcp__server__tool_name.',
    'Invokes an MCP tool via the subprocess MCP client without a model turn.',
    'Custom session title. When provided, the session uses this title',
    '@internal Additional system prompt appended to every Task-tool subagent',
    'Permission-display title from the MCP server',
    'Identifier for the dialog the host should render.',
    'Response from the SDK consumer for a request_user_dialog request.',
    'URL elicitation required (no URL in error data):',
    'Not a fully-qualified MCP tool name:',
    'MCP session expired for ',
  ]

  for (const bundle of bundleSpecs.map(loadBundle)) {
    for (const fragment of exactOnce) {
      assert.equal(occurrences(bundle, fragment), 1, fragment)
    }
    assert.match(
      bundle,
      /systemPrompt:[\w$]+\.array\([\w$]+\.string\(\)\)\.optional\(\)/,
    )
    assert.equal(
      (bundle.match(/subtype:[\w$]+\.literal\("mcp_call"\)/g) ?? [])
        .length,
      1,
    )
    assert.equal(
      (bundle.match(
        /subtype:[\w$]+\.literal\("request_user_dialog"\)/g,
      ) ?? []).length,
      1,
    )
    assert.equal(occurrences(bundle, 'redirectedContextTokens:'), 5)
    assert.equal(occurrences(bundle, 'unattributedTokens:'), 2)
    assert.equal(
      occurrences(bundle, 'CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT'),
      2,
    )
  }
})

test('source schemas expose the exact initialize, MCP, elicitation, and dialog contracts', () => {
  const schemas = compact(source('src/entrypoints/sdk/controlSchemas.ts'))
  assert.match(schemas, /systemPrompt: z\.array\(z\.string\(\)\)\.optional\(\)/)
  for (const field of [
    'appendSubagentSystemPrompt',
    'title',
    'forwardSubagentText',
    'redirectedContextTokens',
    'unattributedTokens',
    'display_name',
  ]) {
    assert.ok(schemas.includes(field), field)
  }
  assert.ok(schemas.includes("subtype: z.literal('mcp_call')"))
  assert.ok(schemas.includes('SDKControlMcpCallRequestSchema()'))
  assert.ok(schemas.includes("subtype: z.literal('request_user_dialog')"))
  assert.ok(schemas.includes('SDKControlRequestUserDialogRequestSchema()'))
  assert.ok(
    schemas.includes(
      "SDK-type MCP servers (config.type === \"sdk\") are rejected",
    ),
  )
  assert.ok(
    schemas.includes(
      "Permission-display title from the MCP server's _meta['anthropic/permissionDisplay']",
    ),
  )
})

test('source propagates SDK initialization and subagent controls without widening gates', () => {
  const engine = compact(source('src/QueryEngine.ts'))
  assert.match(
    engine,
    /typeof customSystemPrompt === 'string' \? \[customSystemPrompt\] : Array\.isArray\(customSystemPrompt\) \? customSystemPrompt : defaultSystemPrompt/,
  )
  assert.equal(
    occurrences(engine, 'appendSubagentSystemPrompt,'),
    5,
    'destructuring, both ToolUseContexts, ask arguments, and engine config',
  )
  assert.equal(occurrences(engine, 'forwardSubagentText,'), 4)
  assert.ok(engine.includes('forwardSubagentText = false,'))

  const runAgent = compact(source('src/tools/AgentTool/runAgent.ts'))
  assert.match(
    runAgent,
    /!useExactTools && isEnvTruthy\(process\.env\.CLAUDE_CODE_ENABLE_APPEND_SUBAGENT_PROMPT\) && toolUseContext\.options\.appendSubagentSystemPrompt/,
  )
  assert.match(
    runAgent,
    /appendSubagentSystemPrompt: toolUseContext\.options\.appendSubagentSystemPrompt/,
  )

  const agentTool = compact(source('src/tools/AgentTool/AgentTool.tsx'))
  assert.match(
    agentTool,
    /if \(!toolUseContext\.options\.forwardSubagentText && content\?\.type !== 'tool_use' && content\?\.type !== 'tool_result'\) \{ continue; \}/,
  )

  const print = compact(source('src/cli/print.ts'))
  assert.match(
    print,
    /typeof message\.request\.title === 'string' \? message\.request\.title\.trim\(\) : undefined/,
  )
  assert.match(print, /autoTitleAttempted = true cacheSessionTitle\(requestedTitle\)/)
  assert.match(
    print,
    /isEmptySystemPrompt\(request\.systemPrompt\) \? '' : request\.systemPrompt/,
  )
  assert.match(
    print,
    /appendSubagentSystemPrompt: options\.appendSubagentSystemPrompt, forwardSubagentText: options\.forwardSubagentText/,
  )
})

test('source implements fail-closed direct MCP, elicitation, dialog, and context attribution runtime', () => {
  const structured = compact(source('src/cli/structuredIO.ts'))
  assert.match(
    structured,
    /title: permissionDisplay\?\.title, display_name: permissionDisplay\?\.displayName, description: permissionDisplay\?\.description/,
  )
  assert.match(
    structured,
    /async requestUserDialog\([\s\S]*?subtype: 'request_user_dialog'[\s\S]*?return \{ behavior: 'cancelled' \}/,
  )

  const print = compact(source('src/cli/print.ts'))
  assert.match(
    print,
    /message\.request\.subtype === 'mcp_call'[\s\S]*?mcpInfoFromString\(tool\)/,
  )
  assert.match(
    print,
    /void \(async \(\) => \{[\s\S]*?callMCPToolWithUrlElicitationRetry\(/,
  )
  assert.match(
    print,
    /mcp_call does not support SDK MCP servers\.[\s\S]*?SDK servers are caller-provided — invoke/,
  )
  assert.match(
    print,
    /MCP session expired for \$\{mcpInfo\.serverName\} — send mcp_reconnect and retry mcp_call/,
  )
  assert.match(
    print,
    /getPermissionDisplay\(request\.params\._meta\)/,
  )

  const mcpClient = compact(source('src/services/mcp/client.ts'))
  assert.equal(
    occurrences(mcpClient, 'urlElicitationDeclined: { url: elicitation.url }'),
    2,
  )
  assert.ok(mcpClient.includes('export class McpSessionExpiredError'))

  const context = compact(source('src/utils/analyzeContext.ts'))
  assert.match(
    context,
    /messageBreakdown\.totalTokens \+ redirectedContextTokens/,
  )
  assert.match(
    context,
    /Math\.min\(totalFromAPI - fixedTokens, maxMessageTokens\)/,
  )
  assert.match(
    context,
    /messageBreakdown\.userMessageTokens - redirectedContextTokens/,
  )
  assert.match(
    context,
    /Object\.values\(systemContext\)[\s\S]*?Object\.values\(userContext\)/,
  )
})
