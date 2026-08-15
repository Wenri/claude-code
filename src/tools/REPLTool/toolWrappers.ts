import { randomUUID } from 'crypto'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../../services/analytics/metadata.js'
import {
  resolveHookPermissionDecision,
  runPostToolUseFailureHooks,
  runPostToolUseHooks,
  runPreToolUseHooks,
} from '../../services/tools/toolHooks.js'
import { checkToolIsolation } from '../../services/tools/toolIsolation.js'
import type {
  AssistantMessage,
  Message,
} from '../../types/message.js'
import type {
  Tool,
  ToolCallProgress,
  ToolUseContext,
} from '../../Tool.js'
import { isAbortError } from '../../utils/errors.js'
import { createAssistantMessage } from '../../utils/messages.js'
import { formatError } from '../../utils/toolErrors.js'
import type {
  ReplProgressEvent,
  ReplRegisteredTool,
} from './types.js'

type InnerCall = { id: string; name: string; input: unknown }

function validationMessage(toolName: string, error: {
  issues: readonly {
    code: string
    message: string
    path: readonly PropertyKey[]
    keys?: readonly string[]
    expected?: string
  }[]
  message: string
}): string {
  const path = (parts: readonly PropertyKey[]) =>
    parts.reduce<string>((result, part, index) => {
      const text = String(part)
      if (typeof part === 'number') return `${result}[${text}]`
      return index === 0 ? text : `${result}.${text}`
    }, '')
  const missing = error.issues
    .filter(issue => issue.code === 'invalid_type' && issue.message.includes('received undefined'))
    .map(issue => path(issue.path))
  const unexpected = error.issues
    .filter(issue => issue.code === 'unrecognized_keys')
    .flatMap(issue => issue.keys ?? [])
  const invalidTypes = error.issues
    .filter(issue => issue.code === 'invalid_type' && !issue.message.includes('received undefined'))
    .map(issue => {
      const match = issue.message.match(/received (\w+)/)
      return {
        param: path(issue.path),
        expected: issue.expected,
        received: match?.[1] ?? 'unknown',
      }
    })
  const problems = [
    ...missing.map(param => `The required parameter \`${param}\` is missing`),
    ...unexpected.map(param => `An unexpected parameter \`${param}\` was provided`),
    ...invalidTypes.map(
      ({ param, expected, received }) =>
        `The parameter \`${param}\` type is expected as \`${expected}\` but provided as \`${received}\``,
    ),
  ]
  return problems.length
    ? `${toolName} failed due to the following ${problems.length > 1 ? 'issues' : 'issue'}:\n${problems.join('\n')}`
    : error.message
}

function errorResult(error: string): { error: string } {
  return { error }
}

export function createToolWrappers(
  tools: readonly Tool[],
  context: ToolUseContext,
  canUseTool: CanUseToolFn,
  parentMessage: AssistantMessage,
  innerCalls: InnerCall[],
  allTools: readonly Tool[],
  onProgress?: ToolCallProgress<ReplProgressEvent>,
): Record<string, (input: Record<string, unknown>, options?: { toolUseID?: string }) => Promise<unknown>> {
  const wrappers: Record<
    string,
    (input: Record<string, unknown>, options?: { toolUseID?: string }) => Promise<unknown>
  > = {}

  for (const tool of tools) {
    wrappers[tool.name] = async (input, options) => {
      const toolUseID = options?.toolUseID ?? `repl_${randomUUID()}`
      let processedInput: Record<string, unknown> = input
      const fail = (message: string): { error: string } => {
        innerCalls.push({ id: toolUseID, name: tool.name, input })
        onProgress?.({
          toolUseID,
          data: {
            type: 'repl_tool_call',
            toolName: tool.name,
            toolInput: input,
            toolUseId: toolUseID,
            phase: 'error',
            error: message,
          },
        })
        return errorResult(message)
      }

      onProgress?.({
        toolUseID,
        data: {
          type: 'repl_tool_call',
          toolName: tool.name,
          toolInput: input,
          toolUseId: toolUseID,
          phase: 'start',
        },
      })

      let toolStartTime: number | undefined
      try {
        const parsed = tool.inputSchema.safeParse(input)
        if (!parsed.success) {
          return fail(validationMessage(tool.name, parsed.error))
        }
        processedInput = parsed.data

        const isolation = checkToolIsolation(tool, context)
        if (isolation.denyMessage) {
          logEvent('tengu_tool_use_isolation_latch_denied', {
            toolName: sanitizeToolNameForAnalytics(tool.name),
            toolUseID:
              toolUseID as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            isMcp: tool.isMcp ?? false,
            isolationLatch:
              isolation.activeLatch as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            isolationClassifiedAs:
              isolation.classifiedAs as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            replInnerCall: true,
          })
          return fail(isolation.denyMessage)
        }

        let hookPermissionResult
        let stopReason: string | undefined
        for await (const result of runPreToolUseHooks(
          context,
          tool,
          processedInput,
          toolUseID,
          parentMessage.message.id,
          parentMessage.requestId,
          undefined as never,
          undefined,
        )) {
          if (result.type === 'hookPermissionResult') {
            hookPermissionResult = result.hookPermissionResult
          } else if (result.type === 'hookUpdatedInput') {
            processedInput = result.updatedInput
          } else if (result.type === 'stopReason') {
            stopReason = result.stopReason
          } else if (result.type === 'stop') {
            return fail(stopReason ?? 'Blocked by PreToolUse hook')
          }
        }

        const permissionContext: ToolUseContext = {
          ...context,
          options: { ...context.options, tools: allTools },
          messages: [
            ...context.messages,
            ...innerCalls.map(call =>
              createAssistantMessage({
                content: [
                  {
                    type: 'tool_use',
                    id: call.id,
                    name: call.name,
                    input: call.input,
                  },
                ],
                isVirtual: true,
              }),
            ),
          ] as Message[],
        }
        const resolved = await resolveHookPermissionDecision(
          hookPermissionResult,
          tool,
          processedInput,
          permissionContext,
          canUseTool,
          parentMessage,
          toolUseID,
        )
        if (resolved.decision.behavior !== 'allow') {
          context.onPermissionDenial?.(tool, toolUseID, resolved.input)
          const message =
            resolved.decision.behavior === 'deny'
              ? resolved.decision.message ?? 'Permission denied'
              : 'Permission denied'
          return fail(`Permission denied for ${tool.name}: ${message}`)
        }

        processedInput =
          resolved.decision.updatedInput ?? resolved.input
        if (
          tool.name === 'Bash' &&
          '_simulatedSedEdit' in processedInput
        ) {
          const { _simulatedSedEdit: _, ...rest } = processedInput
          processedInput = rest
        }

        toolStartTime = Date.now()
        const result = await tool.call(
          processedInput,
          {
            ...context,
            toolUseId: toolUseID,
            userModified: resolved.decision.userModified ?? false,
            fileReadingLimits: {
              maxTokens: Infinity,
              maxSizeBytes: 268_435_456,
            },
            globLimits: { maxResults: 25_000 },
          },
          canUseTool,
          parentMessage,
        )
        const durationMs = Date.now() - toolStartTime

        let output: unknown = result.data
        for await (const hookResult of runPostToolUseHooks(
          context,
          tool,
          toolUseID,
          parentMessage.message.id,
          processedInput,
          result.data,
          parentMessage.requestId,
          undefined as never,
          undefined,
          durationMs,
        )) {
          if (
            'updatedToolOutput' in hookResult &&
            tool.outputSchema?.safeParse(hookResult.updatedToolOutput)
              ?.success !== false
          ) {
            output = hookResult.updatedToolOutput
          }
        }

        if (tool.isMcp && Array.isArray(output)) {
          const text = output
            .filter(
              (block): block is { type: 'text'; text: string } =>
                block !== null &&
                typeof block === 'object' &&
                block.type === 'text' &&
                typeof block.text === 'string',
            )
            .map(block => block.text)
          if (text.length === output.length && text.length > 0) {
            const joined = text.join('\n')
            try {
              output = JSON.parse(joined)
            } catch {
              output = joined
            }
          }
        }

        innerCalls.push({ id: toolUseID, name: tool.name, input: processedInput })
        onProgress?.({
          toolUseID,
          data: {
            type: 'repl_tool_call',
            toolName: tool.name,
            toolInput: processedInput,
            toolUseId: toolUseID,
            phase: 'complete',
            result: output,
          },
        })
        const imageResult = output as {
          type?: unknown
          file?: { base64?: unknown; type?: unknown }
        }
        if (
          output !== null &&
          typeof output === 'object' &&
          imageResult.type === 'image' &&
          imageResult.file !== null &&
          typeof imageResult.file === 'object' &&
          typeof imageResult.file.base64 === 'string' &&
          imageResult.file.base64.length > 0 &&
          typeof imageResult.file.type === 'string'
        ) {
          const base64Length = imageResult.file.base64.length
          return {
            ...output,
            file: {
              ...imageResult.file,
              base64: `[${base64Length} base64 chars — rendered as image in REPL result]`,
            },
          }
        }
        return output
      } catch (error) {
        const message = formatError(error)
        for await (const _ of runPostToolUseFailureHooks(
          context,
          tool,
          toolUseID,
          parentMessage.message.id,
          processedInput,
          message,
          isAbortError(error),
          parentMessage.requestId,
          undefined as never,
          undefined,
          typeof toolStartTime !== 'undefined'
            ? Date.now() - toolStartTime
            : undefined,
        )) {
          // Hook messages are represented in the outer transcript, not VM data.
        }
        innerCalls.push({ id: toolUseID, name: tool.name, input: processedInput })
        onProgress?.({
          toolUseID,
          data: {
            type: 'repl_tool_call',
            toolName: tool.name,
            toolInput: processedInput,
            toolUseId: toolUseID,
            phase: 'error',
            error: message,
          },
        })
        return errorResult(message)
      }
    }
  }

  return wrappers
}

export function registeredToolsToTools(
  registered: Map<string, ReplRegisteredTool>,
): Tool[] {
  return Array.from(registered.values()).map(registration => ({
    name: `eval_registered__${registration.name}`,
    maxResultSizeChars: 100_000,
    prompt: async () => registration.description,
    description: async () => registration.description,
    inputSchema: {
      safeParse(input: unknown) {
        return { success: true as const, data: input as Record<string, unknown> }
      },
    } as never,
    inputJSONSchema: registration.schema as never,
    isEnabled: () => true,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    isDestructive: () => false,
    toAutoClassifierInput: input => {
      const keys = Object.keys(input)
      return keys.length > 0
        ? `${registration.name}(${keys.join(', ')})`
        : registration.name
    },
    checkPermissions: async () => ({
      behavior: 'ask' as const,
      message: `Execute registered tool "${registration.name}"`,
    }),
    call: async input => ({ data: await registration.handler(input) }),
    userFacingName: () => registration.displayName ?? registration.name,
    getToolUseSummary: () => null,
    mapToolResultToToolResultBlockParam: (result, toolUseID) => ({
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: (() => {
        try {
          return JSON.stringify(result)
        } catch {
          return String(result)
        }
      })(),
    }),
    renderToolUseMessage: input => {
      try {
        return `${registration.name}(${JSON.stringify(input, null, 2)})`
      } catch {
        return `${registration.name}(...)`
      }
    },
    renderToolResultMessage: result => {
      try {
        return JSON.stringify(result, null, 2)
      } catch {
        return String(result)
      }
    },
    renderToolUseRejectedMessage: () => 'Rejected',
    renderToolUseErrorMessage: error =>
      typeof error === 'string' ? error : 'Error',
  })) as Tool[]
}
