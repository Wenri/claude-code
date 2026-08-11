import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import { createCombinedAbortSignal } from '../combinedAbortSignal.js'
import { logForDebugging } from '../debug.js'
import { errorMessage } from '../errors.js'
import type { McpToolHook } from '../settings/types.js'

const DEFAULT_MCP_TOOL_HOOK_TIMEOUT_MS = 10 * 60 * 1000

function interpolate(value: unknown, hookInput: unknown): unknown {
  const lookup = (path: string): unknown => {
    let current: unknown = hookInput
    for (const segment of path.split('.')) {
      if (!current || typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[segment]
    }
    return current
  }
  if (typeof value === 'string') {
    return value.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g, (_, path) => {
      const resolved = lookup(path)
      if (resolved == null) return ''
      return typeof resolved === 'object'
        ? JSON.stringify(resolved)
        : String(resolved)
    })
  }
  if (Array.isArray(value)) return value.map(item => interpolate(item, hookInput))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolate(item, hookInput)]),
    )
  }
  return value
}

export async function execMcpToolHook(
  hook: McpToolHook,
  hookEvent: HookEvent,
  hookInput: unknown,
  clients: MCPServerConnection[] | undefined,
  signal?: AbortSignal,
): Promise<{ ok: boolean; body: string; error?: string; aborted?: boolean }> {
  if (clients === undefined) {
    const error = `mcp_tool hooks are not available for the '${hookEvent}' hook event (no MCP client context)`
    logForDebugging(`Hooks: mcp_tool hook skipped — ${error}`, { level: 'warn' })
    return { ok: false, body: '', error }
  }
  const server = clients.find(client => client.name === hook.server)
  if (!server || server.type !== 'connected') {
    const error = `MCP server '${hook.server}' not connected`
    logForDebugging(`Hooks: mcp_tool hook skipped — ${error}`, { level: 'warn' })
    return { ok: false, body: '', error }
  }
  const input = (hook.input ? interpolate(hook.input, hookInput) : {}) as Record<string, unknown>
  const timeoutMs = hook.timeout
    ? hook.timeout * 1000
    : DEFAULT_MCP_TOOL_HOOK_TIMEOUT_MS
  const { signal: combinedSignal, cleanup } = createCombinedAbortSignal(signal, { timeoutMs })
  try {
    logForDebugging(`Hooks: mcp_tool calling ${hook.server}/${hook.tool} with ${Object.keys(input).length} arg(s)`)
    const result = await server.client.callTool(
      { name: hook.tool, arguments: input },
      CallToolResultSchema,
      { signal: combinedSignal, timeout: timeoutMs },
    )
    cleanup()
    const body = Array.isArray(result.content)
      ? result.content.map(item => item.type === 'text' ? item.text : `[${item.type}]`).join('\n')
      : ''
    if (result.isError) return { ok: false, body, error: body || 'MCP tool returned an error' }
    return { ok: true, body }
  } catch (cause) {
    cleanup()
    if (combinedSignal.aborted) return { ok: false, body: '', aborted: true }
    const error = errorMessage(cause)
    logForDebugging(`Hooks: mcp_tool hook error: ${error}`, { level: 'error' })
    return { ok: false, body: '', error }
  }
}
