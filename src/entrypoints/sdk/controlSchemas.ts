/**
 * SDK Control Schemas - Zod schemas for the control protocol.
 *
 * These schemas define the control protocol between SDK implementations and the CLI.
 * Used by SDK builders (e.g., Python SDK) to communicate with the CLI process.
 *
 * SDK consumers should use coreSchemas.ts instead.
 */

import { z } from 'zod/v4'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  AccountInfoSchema,
  AgentDefinitionSchema,
  AgentInfoSchema,
  FastModeStateSchema,
  HookEventSchema,
  HookInputSchema,
  McpServerConfigForProcessTransportSchema,
  McpServerStatusSchema,
  ModelInfoSchema,
  PermissionModeSchema,
  PermissionUpdateSchema,
  SDKMessageSchema,
  SDKPostTurnSummaryMessageSchema,
  SDKTranscriptMirrorMessageSchema,
  SDKStreamlinedTextMessageSchema,
  SDKStreamlinedToolUseSummaryMessageSchema,
  SDKUserMessageSchema,
  SlashCommandSchema,
} from './coreSchemas.js'

const PERMISSION_DECISION_REASON_TYPES = [
  'rule',
  'mode',
  'subcommandResults',
  'permissionPromptTool',
  'hook',
  'asyncAgent',
  'sandboxOverride',
  'workingDir',
  'safetyCheck',
  'classifier',
  'other',
] as const

// ============================================================================
// External Type Placeholders
// ============================================================================

// JSONRPCMessage from @modelcontextprotocol/sdk - treat as unknown
export const JSONRPCMessagePlaceholder = lazySchema(() => z.unknown())

// ============================================================================
// Hook Callback Types
// ============================================================================

export const SDKHookCallbackMatcherSchema = lazySchema(() =>
  z
    .object({
      matcher: z.string().optional(),
      hookCallbackIds: z.array(z.string()),
      timeout: z.number().optional(),
    })
    .describe('Configuration for matching and routing hook callbacks.'),
)

// ============================================================================
// Control Request Types
// ============================================================================

export const SDKControlInitializeRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('initialize'),
      hooks: z
        .record(HookEventSchema(), z.array(SDKHookCallbackMatcherSchema()))
        .optional(),
      sdkMcpServers: z.array(z.string()).optional(),
      jsonSchema: z.record(z.string(), z.unknown()).optional(),
      systemPrompt: z.string().optional(),
      appendSystemPrompt: z.string().optional(),
      planModeInstructions: z
        .string()
        .optional()
        .describe(
          'Custom workflow body for the plan-mode system reminder. Replaces the default code-implementation phases; the CLI still wraps it with the read-only enforcement preamble and the ExitPlanMode protocol footer.',
        ),
      excludeDynamicSections: z
        .boolean()
        .optional()
        .describe(
          'When true, omit per-user dynamic sections (working directory, auto-memory path) from the cached system prompt and re-inject them as the first user message. Lets cross-user prompt caching hit on a static system prompt prefix. Tradeoff: the model sees this context slightly later in the prompt, so steering on the working directory and memory location is marginally less authoritative. Has no effect when a custom (non-preset) system prompt is in use.',
        ),
      agents: z.record(z.string(), AgentDefinitionSchema()).optional(),
      skills: z
        .array(z.string())
        .optional()
        .describe(
          'When provided, only skills whose names match an entry are loaded into the main session system prompt, using the same rules as AgentDefinition.skills: exact name, plugin-qualified name, or ":name" suffix. Omit to load every discovered skill. Applies to the main session only; subagents use AgentDefinition.skills.',
        ),
      promptSuggestions: z.boolean().optional(),
      agentProgressSummaries: z.boolean().optional(),
    })
    .describe(
      'Initializes the SDK session with hooks, MCP servers, and agent configuration.',
    ),
)

export const SDKControlInitializeResponseSchema = lazySchema(() =>
  z
    .object({
      commands: z.array(SlashCommandSchema()),
      agents: z.array(AgentInfoSchema()),
      output_style: z.string(),
      available_output_styles: z.array(z.string()),
      models: z.array(ModelInfoSchema()),
      account: AccountInfoSchema(),
      pid: z
        .number()
        .optional()
        .describe('@internal CLI process PID for tmux socket isolation'),
      fast_mode_state: FastModeStateSchema().optional(),
    })
    .describe(
      'Response from session initialization with available commands, models, and account info.',
    ),
)

export const SDKControlInterruptRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('interrupt'),
    })
    .describe('Interrupts the currently running conversation turn.'),
)


export const SDKControlPermissionRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('can_use_tool'),
      tool_name: z.string(),
      input: z.record(z.string(), z.unknown()),
      permission_suggestions: z.array(PermissionUpdateSchema()).optional(),
      blocked_path: z.string().optional(),
      decision_reason: z.string().optional(),
      decision_reason_type: z
        .enum(PERMISSION_DECISION_REASON_TYPES)
        .optional()
        .describe(
          'Structured discriminator for why auto-mode escalated. Lets SDK hosts make policy (e.g. auto-deny safetyCheck) without parsing decision_reason text. For compound bash commands this is "subcommandResults" even when a safetyCheck is nested inside — check classifier_approvable for that case.',
        ),
      classifier_approvable: z
        .boolean()
        .optional()
        .describe(
          'Set when a safetyCheck is present anywhere in the decision reason (including nested inside subcommandResults for compound bash). false = at least one safety check requires manual approval (e.g. Windows path bypass, dangerous rm); true = all safety checks MAY be classifier-approved (e.g. sensitive-file paths). Absent when no safetyCheck is involved.',
        ),
      title: z.string().optional(),
      display_name: z.string().optional(),
      tool_use_id: z.string(),
      agent_id: z.string().optional(),
      description: z.string().optional(),
    })
    .describe('Requests permission to use a tool with the given input.'),
)

export const SDKControlSetPermissionModeRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('set_permission_mode'),
      mode: PermissionModeSchema(),
      ultraplan: z
        .boolean()
        .optional()
        .describe('@internal CCR ultraplan session marker.'),
    })
    .describe('Sets the permission mode for tool execution handling.'),
)

export const SDKControlSetModelRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('set_model'),
      model: z.string().optional(),
    })
    .describe('Sets the model to use for subsequent conversation turns.'),
)

export const SDKControlSetMaxThinkingTokensRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('set_max_thinking_tokens'),
      max_thinking_tokens: z.number().nullable(),
    })
    .describe(
      'Sets the maximum number of thinking tokens for extended thinking.',
    ),
)

export const SDKControlRenameSessionRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('rename_session'),
      title: z.string(),
    })
    .describe('Sets the user-facing title for the current session.'),
)

export const SDKControlSetColorRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('set_color'),
      color: z.string(),
    })
    .describe(
      'Sets the session accent color. Accepts an agent color name or "default" to reset.',
    ),
)

export const SDKControlMcpStatusRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('mcp_status'),
    })
    .describe('Requests the current status of all MCP server connections.'),
)

export const SDKControlMcpStatusResponseSchema = lazySchema(() =>
  z
    .object({
      mcpServers: z.array(McpServerStatusSchema()),
    })
    .describe(
      'Response containing the current status of all MCP server connections.',
    ),
)

export const SDKControlFileSuggestionsRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('file_suggestions'),
      query: z.string(),
    })
    .describe(
      'Requests at-mention file autocomplete suggestions for a partial path prefix. Returns the same fuzzy-matched results the TUI shows.',
    ),
)

export const SDKControlFileSuggestionsResponseSchema = lazySchema(() =>
  z
    .object({
      suggestions: z.array(
        z.object({
          path: z.string(),
          score: z.number().optional(),
        }),
      ),
    })
    .describe(
      'Response containing fuzzy-ranked file path suggestions (capped at the same limit as the TUI typeahead).',
    ),
)

export const SDKControlGetContextUsageRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('get_context_usage'),
    })
    .describe(
      'Requests a breakdown of current context window usage by category.',
    ),
)

export const SDKControlGetSessionCostRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('get_session_cost'),
    })
    .describe(
      'Requests the formatted session cost summary (the same text /usage prints in non-interactive mode). Used by the thin-client /usage dialog to show the remote container cost instead of the local $0.00.',
    ),
)

export const SDKControlGetSessionCostResponseSchema = lazySchema(() =>
  z
    .object({
      text: z.string(),
    })
    .describe('Formatted session cost text, ANSI-stripped.'),
)

export const SDKControlGetBinaryVersionRequestSchema = lazySchema(() =>
  z
    .object({ subtype: z.literal('get_binary_version') })
    .describe(
      "Requests the responder's CLI binary version. Used by /version in --remote mode so the thin client can show both its own and the remote container's version.",
    ),
)

export const SDKControlGetBinaryVersionResponseSchema = lazySchema(() =>
  z.object({
    version: z.string(),
    buildTime: z.string().optional(),
  }),
)

const ContextCategorySchema = lazySchema(() =>
  z.object({
    name: z.string(),
    tokens: z.number(),
    color: z.string(),
    isDeferred: z.boolean().optional(),
  }),
)

const ContextGridSquareSchema = lazySchema(() =>
  z.object({
    color: z.string(),
    isFilled: z.boolean(),
    categoryName: z.string(),
    tokens: z.number(),
    percentage: z.number(),
    squareFullness: z.number(),
  }),
)

export const SDKControlGetContextUsageResponseSchema = lazySchema(() =>
  z
    .object({
      categories: z.array(ContextCategorySchema()),
      totalTokens: z.number(),
      maxTokens: z.number(),
      rawMaxTokens: z.number(),
      percentage: z.number(),
      gridRows: z.array(z.array(ContextGridSquareSchema())),
      model: z.string(),
      memoryFiles: z.array(
        z.object({
          path: z.string(),
          type: z.string(),
          tokens: z.number(),
        }),
      ),
      mcpTools: z.array(
        z.object({
          name: z.string(),
          serverName: z.string(),
          tokens: z.number(),
          isLoaded: z.boolean().optional(),
        }),
      ),
      deferredBuiltinTools: z
        .array(
          z.object({
            name: z.string(),
            tokens: z.number(),
            isLoaded: z.boolean(),
          }),
        )
        .optional(),
      systemTools: z
        .array(z.object({ name: z.string(), tokens: z.number() }))
        .optional(),
      systemPromptSections: z
        .array(z.object({ name: z.string(), tokens: z.number() }))
        .optional(),
      agents: z.array(
        z.object({
          agentType: z.string(),
          source: z.string(),
          tokens: z.number(),
        }),
      ),
      slashCommands: z
        .object({
          totalCommands: z.number(),
          includedCommands: z.number(),
          tokens: z.number(),
        })
        .optional(),
      skills: z
        .object({
          totalSkills: z.number(),
          includedSkills: z.number(),
          tokens: z.number(),
          skillFrontmatter: z.array(
            z.object({
              name: z.string(),
              source: z.string(),
              tokens: z.number(),
            }),
          ),
        })
        .optional(),
      autoCompactThreshold: z.number().optional(),
      isAutoCompactEnabled: z.boolean(),
      messageBreakdown: z
        .object({
          toolCallTokens: z.number(),
          toolResultTokens: z.number(),
          attachmentTokens: z.number(),
          assistantMessageTokens: z.number(),
          userMessageTokens: z.number(),
          toolCallsByType: z.array(
            z.object({
              name: z.string(),
              callTokens: z.number(),
              resultTokens: z.number(),
            }),
          ),
          attachmentsByType: z.array(
            z.object({ name: z.string(), tokens: z.number() }),
          ),
        })
        .optional(),
      apiUsage: z
        .object({
          input_tokens: z.number(),
          output_tokens: z.number(),
          cache_creation_input_tokens: z.number(),
          cache_read_input_tokens: z.number(),
        })
        .nullable(),
    })
    .describe(
      'Breakdown of current context window usage by category (system prompt, tools, messages, etc.).',
    ),
)

export const SDKControlRewindFilesRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('rewind_files'),
      user_message_id: z.string(),
      dry_run: z.boolean().optional(),
    })
    .describe('Rewinds file changes made since a specific user message.'),
)

export const SDKControlRewindFilesResponseSchema = lazySchema(() =>
  z
    .object({
      canRewind: z.boolean(),
      error: z.string().optional(),
      filesChanged: z.array(z.string()).optional(),
      insertions: z.number().optional(),
      deletions: z.number().optional(),
    })
    .describe('Result of a rewindFiles operation.'),
)

export const SDKControlCancelAsyncMessageRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('cancel_async_message'),
      message_uuid: z.string(),
    })
    .describe(
      'Drops a pending async user message from the command queue by uuid. No-op if already dequeued for execution.',
    ),
)

export const SDKControlCancelAsyncMessageResponseSchema = lazySchema(() =>
  z
    .object({
      cancelled: z.boolean(),
    })
    .describe(
      'Result of a cancel_async_message operation. cancelled=false means the message was not in the queue (already dequeued or never enqueued).',
    ),
)

export const SDKControlSeedReadStateRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('seed_read_state'),
      path: z.string(),
      mtime: z.number(),
    })
    .describe(
      'Seeds the readFileState cache with a path+mtime entry. Use when a prior Read was removed from context (e.g. by snip) so Edit validation would fail despite the client having observed the Read. The mtime lets the CLI detect if the file changed since the seeded Read — same staleness check as the normal path.',
    ),
)

export const SDKHookCallbackRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('hook_callback'),
      callback_id: z.string(),
      input: HookInputSchema(),
      tool_use_id: z.string().optional(),
    })
    .describe('Delivers a hook callback with its input data.'),
)

export const SDKControlMcpMessageRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('mcp_message'),
      server_name: z.string(),
      message: JSONRPCMessagePlaceholder(),
    })
    .describe('Sends a JSON-RPC message to a specific MCP server.'),
)

export const SDKControlMcpSetServersRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('mcp_set_servers'),
      servers: z.record(z.string(), McpServerConfigForProcessTransportSchema()),
    })
    .describe('Replaces the set of dynamically managed MCP servers.'),
)

export const SDKControlMcpSetServersResponseSchema = lazySchema(() =>
  z
    .object({
      added: z.array(z.string()),
      removed: z.array(z.string()),
      errors: z.record(z.string(), z.string()),
    })
    .describe(
      'Result of replacing the set of dynamically managed MCP servers.',
    ),
)

export const SDKControlReloadPluginsRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('reload_plugins'),
    })
    .describe(
      'Reloads plugins from disk and returns the refreshed session components.',
    ),
)

export const SDKControlReloadPluginsResponseSchema = lazySchema(() =>
  z
    .object({
      commands: z.array(SlashCommandSchema()),
      agents: z.array(AgentInfoSchema()),
      plugins: z.array(
        z.object({
          name: z.string(),
          path: z.string(),
          source: z.string().optional(),
        }),
      ),
      mcpServers: z.array(McpServerStatusSchema()),
      error_count: z.number(),
    })
    .describe(
      'Refreshed commands, agents, plugins, and MCP server status after reload.',
    ),
)

export const SDKControlMcpReconnectRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('mcp_reconnect'),
      serverName: z.string(),
    })
    .describe('Reconnects a disconnected or failed MCP server.'),
)

export const SDKControlMcpToggleRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('mcp_toggle'),
      serverName: z.string(),
      enabled: z.boolean(),
    })
    .describe('Enables or disables an MCP server.'),
)


export const SDKControlStopTaskRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('stop_task'),
      task_id: z.string(),
    })
    .describe('Stops a running task.'),
)

export const SDKControlUltrareviewLaunchRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('ultrareview_launch'),
      args: z.string().optional(),
      confirm: z.boolean().optional(),
    })
    .describe('Launches an ultrareview remote session.'),
)

export const SDKControlUltrareviewLaunchResponseSchema = lazySchema(() =>
  z.discriminatedUnion('status', [
    z.object({
      status: z.literal('error'),
      message: z.string(),
    }),
    z.object({
      status: z.literal('blocked'),
      message: z.string(),
      actionUrl: z.string().nullable(),
    }),
    z.object({
      status: z.literal('needs-confirm'),
      body: z.string(),
      billingNote: z.string(),
    }),
    z.object({
      status: z.literal('launched'),
      sessionId: z.string(),
      sessionUrl: z.string(),
      taskId: z.string(),
      title: z.string(),
      message: z.string(),
      billingNote: z.string(),
    }),
  ]),
)

export const SDKControlApplyFlagSettingsRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('apply_flag_settings'),
      settings: z.record(z.string(), z.unknown()),
    })
    .describe(
      'Merges the provided settings into the flag settings layer, updating the active configuration.',
    ),
)

export const SDKControlGetSettingsRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('get_settings'),
    })
    .describe(
      'Returns the effective merged settings and the raw per-source settings.',
    ),
)

export const SettingsValidationErrorSchema = lazySchema(() =>
  z
    .object({
      file: z
        .string()
        .optional()
        .describe('Path to the settings file that failed to parse or validate.'),
      path: z
        .string()
        .describe(
          'Dot-notation path to the field with the error, or empty string for whole-file errors.',
        ),
      message: z.string().describe('Human-readable error message.'),
    })
    .describe(
      'A settings file parse or validation error. When a settings.json file fails to parse (invalid JSON, JSON comments, schema mismatch), the file is skipped and any rules it contained — including permission allow/deny lists — are not applied.',
    ),
)

export const SDKControlGetSettingsResponseSchema = lazySchema(() =>
  z
    .object({
      effective: z.record(z.string(), z.unknown()),
      sources: z
        .array(
          z.object({
            source: z.enum([
              'userSettings',
              'projectSettings',
              'localSettings',
              'flagSettings',
              'policySettings',
            ]),
            settings: z.record(z.string(), z.unknown()),
          }),
        )
        .describe(
          'Ordered low-to-high priority — later entries override earlier ones.',
        ),
      applied: z
        .object({
          model: z.string(),
          // String levels only — numeric effort is ant-only and the
          // Zod→proto generator can't emit enum∪number unions.
          effort: z
            .enum(['low', 'medium', 'high', 'xhigh', 'max'])
            .nullable(),
        })
        .optional()
        .describe(
          'Runtime-resolved values after env overrides, session state, and model-specific defaults are applied. Unlike `effective` (disk merge), these reflect what will actually be sent to the API.',
        ),
      errors: z
        .array(SettingsValidationErrorSchema())
        .optional()
        .describe(
          'Settings parse and validation errors. When non-empty, the listed files were skipped during the merge above — their settings are not reflected in `effective` or `sources`.',
        ),
    })
    .describe(
      'Effective merged settings plus raw per-source settings in merge order.',
    ),
)

export const SDKControlElicitationRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('elicitation'),
      mcp_server_name: z.string(),
      message: z.string(),
      mode: z.enum(['form', 'url']).optional(),
      url: z.string().optional(),
      elicitation_id: z.string().optional(),
      requested_schema: z.record(z.string(), z.unknown()).optional(),
    })
    .describe(
      'Requests the SDK consumer to handle an MCP elicitation (user input request).',
    ),
)

export const SDKControlElicitationResponseSchema = lazySchema(() =>
  z
    .object({
      action: z.enum(['accept', 'decline', 'cancel']),
      content: z.record(z.string(), z.unknown()).optional(),
    })
    .describe('Response from the SDK consumer for an elicitation request.'),
)

export const SDKControlOAuthTokenRefreshRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('oauth_token_refresh'),
    })
    .describe(
      '@internal Request from the CLI subprocess to the SDK host for a fresh OAuth access token after a 401 with no local refresh token.',
    ),
)

export const SDKControlOAuthTokenRefreshResponseSchema = lazySchema(() =>
  z
    .object({
      accessToken: z.string().nullable(),
    })
    .describe(
      '@internal Fresh OAuth access token returned by the SDK host getOAuthToken callback, or null when the host has no token available.',
    ),
)

export const SDKControlSubmitFeedbackRequestSchema = lazySchema(() =>
  z
    .object({
      subtype: z.literal('submit_feedback'),
      description: z.string(),
      surface: z
        .enum(['cli', 'ccd', 'ccw', 'sdk'])
        .optional()
        .describe(
          "Where the feedback flow was initiated. Stamped into the POST body and tengu_bug_report_* analytics so the triage pipeline can distinguish CCD/CCW reports from terminal reports landing in the same claude_cli_feedback table. Defaults to 'sdk'.",
        ),
    })
    .describe(
      "@internal Submits a /feedback report (description + current session transcript + sanitized error log) to api.anthropic.com/api/claude_cli_feedback using the CLI's auth and redaction. Runs the same getFeedbackUnavailableReason() policy checks as the terminal /feedback command — when feedback is disabled (3P provider, org policy, env kill-switch) the response carries unavailable_reason instead of an error.",
    ),
)

export const SDKControlSubmitFeedbackResponseSchema = lazySchema(() =>
  z
    .object({
      feedback_id: z.string().nullable(),
      unavailable_reason: z
        .string()
        .optional()
        .describe(
          'Human-readable reason /feedback is disabled in this session (3P provider, org policy, env var). When set, no submission was attempted.',
        ),
      is_zdr_org: z.boolean().optional(),
      failure_reason: z.string().optional(),
      status_code: z.number().optional(),
    })
    .describe(
      '@internal Result of a submit_feedback request. feedback_id is set on success; otherwise one of unavailable_reason / failure_reason explains why.',
    ),
)


// ============================================================================
// Control Request/Response Wrappers
// ============================================================================

export const SDKControlRequestInnerSchema = lazySchema(() =>
  z.union([
    SDKControlInterruptRequestSchema(),
    SDKControlPermissionRequestSchema(),
    SDKControlInitializeRequestSchema(),
    SDKControlSetPermissionModeRequestSchema(),
    SDKControlSetModelRequestSchema(),
    SDKControlSetMaxThinkingTokensRequestSchema(),
    SDKControlRenameSessionRequestSchema(),
    SDKControlSetColorRequestSchema(),
    SDKControlMcpStatusRequestSchema(),
    SDKControlFileSuggestionsRequestSchema(),
    SDKControlGetContextUsageRequestSchema(),
    SDKControlGetSessionCostRequestSchema(),
    SDKControlGetBinaryVersionRequestSchema(),
    SDKHookCallbackRequestSchema(),
    SDKControlMcpMessageRequestSchema(),
    SDKControlRewindFilesRequestSchema(),
    SDKControlCancelAsyncMessageRequestSchema(),
    SDKControlSeedReadStateRequestSchema(),
    SDKControlMcpSetServersRequestSchema(),
    SDKControlReloadPluginsRequestSchema(),
    SDKControlMcpReconnectRequestSchema(),
    SDKControlMcpToggleRequestSchema(),
    SDKControlStopTaskRequestSchema(),
    SDKControlUltrareviewLaunchRequestSchema(),
    SDKControlApplyFlagSettingsRequestSchema(),
    SDKControlGetSettingsRequestSchema(),
    SDKControlElicitationRequestSchema(),
    SDKControlSubmitFeedbackRequestSchema(),
    SDKControlOAuthTokenRefreshRequestSchema(),
  ]),
)

export const SDKControlRequestSchema = lazySchema(() =>
  z.object({
    type: z.literal('control_request'),
    request_id: z.string(),
    request: SDKControlRequestInnerSchema(),
  }),
)

export const ControlResponseSchema = lazySchema(() =>
  z.object({
    subtype: z.literal('success'),
    request_id: z.string(),
    response: z.record(z.string(), z.unknown()).optional(),
  }),
)

export const ControlErrorResponseSchema = lazySchema(() =>
  z.object({
    subtype: z.literal('error'),
    request_id: z.string(),
    error: z.string(),
    pending_permission_requests: z
      .array(z.lazy(() => SDKControlRequestSchema()))
      .optional(),
  }),
)

export const SDKControlResponseSchema = lazySchema(() =>
  z.object({
    type: z.literal('control_response'),
    response: z.union([ControlResponseSchema(), ControlErrorResponseSchema()]),
  }),
)

export const SDKControlCancelRequestSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('control_cancel_request'),
      request_id: z.string(),
    })
    .describe('Cancels a currently open control request.'),
)

export const SDKKeepAliveMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('keep_alive'),
    })
    .describe('Keep-alive message to maintain WebSocket connection.'),
)

export const SDKUpdateEnvironmentVariablesMessageSchema = lazySchema(() =>
  z
    .object({
      type: z.literal('update_environment_variables'),
      variables: z.record(z.string(), z.string()),
    })
    .describe('Updates environment variables at runtime.'),
)

// ============================================================================
// Aggregate Message Types
// ============================================================================

export const StdoutMessageSchema = lazySchema(() =>
  z.union([
    SDKMessageSchema(),
    SDKStreamlinedTextMessageSchema(),
    SDKStreamlinedToolUseSummaryMessageSchema(),
    SDKPostTurnSummaryMessageSchema(),
    SDKTranscriptMirrorMessageSchema(),
    SDKControlResponseSchema(),
    SDKControlRequestSchema(),
    SDKControlCancelRequestSchema(),
    SDKKeepAliveMessageSchema(),
  ]),
)

export const StdinMessageSchema = lazySchema(() =>
  z.union([
    SDKUserMessageSchema(),
    SDKControlRequestSchema(),
    SDKControlResponseSchema(),
    SDKKeepAliveMessageSchema(),
    SDKUpdateEnvironmentVariablesMessageSchema(),
  ]),
)
