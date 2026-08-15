import reject from 'lodash-es/reject.js'
import { z } from 'zod/v4'
import {
  performMCPOAuthFlow,
  trackMCPOAuthFlow,
} from '../../services/mcp/auth.js'
import {
  clearMcpAuthCache,
  reconnectMcpServerImpl,
} from '../../services/mcp/client.js'
import {
  buildMcpToolName,
  getMcpPrefix,
} from '../../services/mcp/mcpStringUtils.js'
import type {
  McpHTTPServerConfig,
  McpSSEServerConfig,
  ScopedMcpServerConfig,
} from '../../services/mcp/types.js'
import type { Tool } from '../../Tool.js'
import { errorMessage } from '../../utils/errors.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logMCPDebug, logMCPError } from '../../utils/log.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import { env } from '../../utils/env.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const inputSchema = lazySchema(() => z.object({}))
type InputSchema = ReturnType<typeof inputSchema>
const completeAuthenticationInputSchema = lazySchema(() =>
  z.object({
    callback_url: z.string().describe(
      'The full callback URL from the browser address bar after authorizing, e.g. http://localhost:<port>/callback?code=...&state=...',
    ),
  }),
)
type CompleteAuthenticationInputSchema = ReturnType<
  typeof completeAuthenticationInputSchema
>

export type McpAuthOutput = {
  status: 'auth_url' | 'success' | 'unsupported' | 'error'
  message: string
  authUrl?: string
}

const pendingCallbackSubmitters = new Map<
  string,
  (callbackUrl: string) => void
>()
const pendingOAuthFlows = new Map<string, Promise<void>>()

function trackOAuthFlow(serverName: string, flow: Promise<void>): void {
  pendingOAuthFlows.set(serverName, flow)
  const clear = () => {
    if (pendingOAuthFlows.get(serverName) === flow) {
      pendingOAuthFlows.delete(serverName)
    }
  }
  void flow.then(clear, clear)
}

function isRemoteOAuthSession(): boolean {
  return (
    env.isSSH() ||
    isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ||
    getIsRemoteMode()
  )
}

function callbackRedirectUrl(authorizationUrl: string): string {
  try {
    return (
      new URL(authorizationUrl).searchParams.get('redirect_uri') ??
      'http://localhost:<port>/callback'
    )
  } catch {
    return 'http://localhost:<port>/callback'
  }
}

function getConfigUrl(config: ScopedMcpServerConfig): string | undefined {
  if ('url' in config) return config.url
  return undefined
}

/**
 * Creates a pseudo-tool for an MCP server that is installed but not
 * authenticated. Surfaced in place of the server's real tools so the model
 * knows the server exists and can start the OAuth flow on the user's behalf.
 *
 * When called, starts performMCPOAuthFlow with skipBrowserOpen and returns
 * the authorization URL. The OAuth callback completes in the background;
 * once it fires, reconnectMcpServerImpl runs and the server's real tools
 * are swapped into appState.mcp.tools via the existing prefix-based
 * replacement (useManageMCPConnections.updateServer wipes anything matching
 * mcp__<server>__*, so this pseudo-tool is removed automatically).
 */
export function createMcpAuthTool(
  serverName: string,
  config: ScopedMcpServerConfig,
): Tool<InputSchema, McpAuthOutput> {
  const url = getConfigUrl(config)
  const transport = config.type ?? 'stdio'
  const location = url ? `${transport} at ${url}` : transport

  const description =
    `The \`${serverName}\` MCP server (${location}) is installed but requires authentication. ` +
    `Call this tool to start the OAuth flow — you'll receive an authorization URL to share with the user. ` +
    `Once the user completes authorization in their browser, the server's real tools will become available automatically.`

  return {
    name: buildMcpToolName(serverName, 'authenticate'),
    isMcp: true,
    mcpInfo: { serverName, toolName: 'authenticate' },
    isEnabled: () => true,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    toAutoClassifierInput: () => serverName,
    userFacingName: () => `${serverName} - authenticate (MCP)`,
    maxResultSizeChars: 10_000,
    renderToolUseMessage: () => `Authenticate ${serverName} MCP server`,
    async description() {
      return description
    },
    async prompt() {
      return description
    },
    get inputSchema(): InputSchema {
      return inputSchema()
    },
    async checkPermissions(input): Promise<PermissionDecision> {
      return { behavior: 'allow', updatedInput: input }
    },
    async call(_input, context) {
      // claude.ai connectors use a separate auth flow (handleClaudeAIAuth in
      // MCPRemoteServerMenu) that we don't invoke programmatically here —
      // just point the user at /mcp.
      if (config.type === 'claudeai-proxy') {
        return {
          data: {
            status: 'unsupported' as const,
            message: `This is a claude.ai MCP connector. Ask the user to run /mcp and select "${serverName}" to authenticate.`,
          },
        }
      }

      // performMCPOAuthFlow only accepts sse/http. needs-auth state is only
      // set on HTTP 401 (UnauthorizedError) so other transports shouldn't
      // reach here, but be defensive.
      if (config.type !== 'sse' && config.type !== 'http') {
        return {
          data: {
            status: 'unsupported' as const,
            message: `Server "${serverName}" uses ${transport} transport which does not support OAuth from this tool. Ask the user to run /mcp and authenticate manually.`,
          },
        }
      }

      const sseOrHttpConfig = config as (
        | McpSSEServerConfig
        | McpHTTPServerConfig
      ) & { scope: ScopedMcpServerConfig['scope'] }

      // Mirror cli/print.ts mcp_authenticate: start the flow, capture the
      // URL via onAuthorizationUrl, return it immediately. The flow's
      // Promise resolves later when the browser callback fires.
      let resolveAuthUrl: ((url: string) => void) | undefined
      const authUrlPromise = new Promise<string>(resolve => {
        resolveAuthUrl = resolve
      })

      const controller = new AbortController()
      const { setAppState } = context

      const oauthPromise = performMCPOAuthFlow(
        serverName,
        sseOrHttpConfig,
        u => resolveAuthUrl?.(u),
        controller.signal,
        {
          skipBrowserOpen: true,
          onWaitingForCallback: submit => {
            pendingCallbackSubmitters.set(serverName, submit)
          },
        },
      )
      trackMCPOAuthFlow(serverName, oauthPromise)

      // Background continuation: once OAuth completes, reconnect and swap
      // the real tools into appState. Prefix-based replacement removes this
      // pseudo-tool since it shares the mcp__<server>__ prefix.
      void oauthPromise
        .then(async () => {
          clearMcpAuthCache()
          const result = await reconnectMcpServerImpl(serverName, config)
          const prefix = getMcpPrefix(serverName)
          setAppState(prev => ({
            ...prev,
            mcp: {
              ...prev.mcp,
              clients: prev.mcp.clients.map(c =>
                c.name === serverName ? result.client : c,
              ),
              tools: [
                ...reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                ...result.tools,
              ],
              commands: [
                ...reject(prev.mcp.commands, c => c.name?.startsWith(prefix)),
                ...result.commands,
              ],
              resources: result.resources
                ? { ...prev.mcp.resources, [serverName]: result.resources }
                : prev.mcp.resources,
            },
          }))
          logMCPDebug(
            serverName,
            `OAuth complete, reconnected with ${result.tools.length} tool(s)`,
          )
        })
        .catch(err => {
          logMCPError(
            serverName,
            `OAuth flow failed after tool-triggered start: ${errorMessage(err)}`,
          )
        })

      try {
        // Race: get the URL, or the flow completes without needing one
        // (e.g. XAA with cached IdP token — silent auth).
        const authUrl = await Promise.race([
          authUrlPromise,
          oauthPromise.then(() => null as string | null),
        ])

        if (authUrl) {
          const completeToolName = buildMcpToolName(
            serverName,
            'complete_authentication',
          )
          const redirectUrl = callbackRedirectUrl(authUrl)
          const callbackInstructions = isRemoteOAuthSession()
            ? `\n\nThis session is remote, so after authorizing the browser will try to load \`${redirectUrl}?code=...\` and show a connection error — that's expected. Ask the user to copy the full URL from the browser's address bar and paste it into chat, then call \`${completeToolName}\` with that URL as \`callback_url\`.`
            : `\n\nIf the browser shows a connection error on the redirect page, ask the user to paste the full URL from the address bar and call \`${completeToolName}\` with it.`
          return {
            data: {
              status: 'auth_url' as const,
              authUrl,
              message: `Ask the user to open this URL in their browser to authorize the ${serverName} MCP server:\n\n${authUrl}\n\nOnce they complete the flow, the server's tools will become available automatically.${callbackInstructions}`,
            },
          }
        }

        return {
          data: {
            status: 'auth_url' as const,
            message: `Authentication completed silently for ${serverName}. The server's tools should now be available.`,
          },
        }
      } catch (err) {
        return {
          data: {
            status: 'error' as const,
            message: `Failed to start OAuth flow for ${serverName}: ${errorMessage(err)}. Ask the user to run /mcp and authenticate manually.`,
          },
        }
      }
    },
    mapToolResultToToolResultBlockParam(data, toolUseID) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: data.message,
      }
    },
  } satisfies Tool<InputSchema, McpAuthOutput>
}

/**
 * Completes the manual-callback half of an MCP OAuth flow. Remote sessions
 * cannot receive the localhost redirect in the user's browser, so the model
 * submits the copied address-bar URL through this companion pseudo-tool.
 */
export function createMcpCompleteAuthenticationTool(
  serverName: string,
): Tool<CompleteAuthenticationInputSchema, McpAuthOutput> {
  const authenticateToolName = buildMcpToolName(serverName, 'authenticate')
  const description =
    `Complete an in-progress OAuth flow for the \`${serverName}\` MCP server by submitting the callback URL. ` +
    `Call \`${authenticateToolName}\` first to start the flow and get the authorization URL. ` +
    'After the user authorizes in their browser, the browser is redirected to a `http://localhost:<port>/callback?code=...&state=...` URL — ' +
    'on remote sessions that page fails to load, but the URL in the address bar is still valid. Pass that full URL here as `callback_url`.'

  return {
    name: buildMcpToolName(serverName, 'complete_authentication'),
    isMcp: true,
    mcpInfo: { serverName, toolName: 'complete_authentication' },
    isEnabled: () => true,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    toAutoClassifierInput: () => serverName,
    userFacingName: () => `${serverName} - complete authentication (MCP)`,
    maxResultSizeChars: 10_000,
    renderToolUseMessage: () =>
      `Complete authentication for ${serverName} MCP server`,
    async description() {
      return description
    },
    async prompt() {
      return description
    },
    get inputSchema(): CompleteAuthenticationInputSchema {
      return completeAuthenticationInputSchema()
    },
    async checkPermissions(input): Promise<PermissionDecision> {
      return { behavior: 'allow', updatedInput: input }
    },
    async call({ callback_url }) {
      const submit = pendingCallbackSubmitters.get(serverName)
      if (!submit) {
        return {
          data: {
            status: 'error' as const,
            message: `No OAuth flow is in progress for ${serverName}. Call \`${authenticateToolName}\` first, then retry with the callback URL.`,
          },
        }
      }

      let hasOAuthResult = false
      try {
        const callback = new URL(callback_url)
        hasOAuthResult =
          callback.searchParams.has('code') ||
          callback.searchParams.has('error')
      } catch {
        // The target reports one actionable validation error below.
      }
      if (!hasOAuthResult) {
        return {
          data: {
            status: 'error' as const,
            message:
              "Invalid callback URL: missing authorization code. Ask the user to paste the full redirect URL from their browser's address bar, including the `?code=...&state=...` query string.",
          },
        }
      }

      const flow = pendingOAuthFlows.get(serverName)
      submit(callback_url)
      try {
        await flow
        return {
          data: {
            status: 'success' as const,
            message: `Authentication complete for ${serverName}. The server's tools should now be available.`,
          },
        }
      } catch (error) {
        if (error instanceof AuthenticationCancelledError) {
          return {
            data: {
              status: 'error' as const,
              message: `The OAuth flow for ${serverName} was cancelled (a newer attempt may have superseded it). Call \`${authenticateToolName}\` again to restart.`,
            },
          }
        }
        return {
          data: {
            status: 'error' as const,
            message: `Authentication failed for ${serverName}: ${errorMessage(error)}`,
          },
        }
      }
    },
    mapToolResultToToolResultBlockParam(data, toolUseID) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: data.message,
      }
    },
  } satisfies Tool<CompleteAuthenticationInputSchema, McpAuthOutput>
}
