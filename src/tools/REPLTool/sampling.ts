import { randomUUID } from 'crypto'
import type { ToolCallProgress, ToolUseContext } from '../../Tool.js'
import { queryWithModel } from '../../services/api/claude.js'
import { getMainLoopModel } from '../../utils/model/model.js'
import { extractTextContent } from '../../utils/messages.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import type { ReplProgressEvent } from './types.js'

function closeObjectSchemas(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(closeObjectSchemas)
  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    result[key] = closeObjectSchemas(source[key])
  }
  if (result.type === 'object' && !('additionalProperties' in result)) {
    result.additionalProperties = false
  }
  return result
}

function cloneJSON(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

export function installSamplingHelpers(
  context: ToolUseContext,
  onProgress?: ToolCallProgress<ReplProgressEvent>,
): Record<string, (prompt: string, schema?: unknown) => Promise<unknown>> {
  const createSampler = (name: string) =>
    async (prompt: string, schema?: unknown): Promise<unknown> => {
      if (typeof prompt !== 'string') {
        throw Error(`${name}: prompt must be a string`)
      }

      let closedSchema: unknown
      if (schema !== undefined) {
        let cloned: unknown
        try {
          cloned = cloneJSON(schema)
        } catch {
          throw Error(`${name}: schema must be JSON-serializable`)
        }
        if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) {
          throw Error(`${name}: schema must be an object`)
        }
        closedSchema = closeObjectSchemas(cloned)
      }

      const toolUseID = `repl_${randomUUID()}`
      const toolInput = { prompt: prompt.slice(0, 200) }
      onProgress?.({
        toolUseID,
        data: {
          type: 'repl_tool_call',
          toolName: name,
          toolInput,
          toolUseId: toolUseID,
          phase: 'start',
        },
      })

      try {
        const response = await queryWithModel({
          systemPrompt: asSystemPrompt([]),
          userPrompt: prompt,
          outputFormat: closedSchema
            ? {
                type: 'json_schema',
                schema: closedSchema as Record<string, unknown>,
              }
            : undefined,
          signal: context.abortController.signal,
          options: {
            model: getMainLoopModel(),
            querySource: 'repl_sampling',
            agents: [],
            isNonInteractiveSession: context.options.isNonInteractiveSession,
            hasAppendSystemPrompt: false,
            mcpTools: [],
          } as never,
        })
        const text = extractTextContent(response.message.content)
        const result = closedSchema ? JSON.parse(text) : text
        onProgress?.({
          toolUseID,
          data: {
            type: 'repl_tool_call',
            toolName: name,
            toolInput,
            toolUseId: toolUseID,
            phase: 'complete',
            result,
          },
        })
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        onProgress?.({
          toolUseID,
          data: {
            type: 'repl_tool_call',
            toolName: name,
            toolInput,
            toolUseId: toolUseID,
            phase: 'error',
            error: message,
          },
        })
        throw error
      }
    }

  const haiku = createSampler('haiku')
  return { haiku, opus: haiku, sonnet: haiku }
}
