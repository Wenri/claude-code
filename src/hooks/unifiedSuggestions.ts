import Fuse from 'fuse.js'
import { basename } from 'path'
import type { SuggestionItem } from 'src/components/PromptInput/PromptInputFooterSuggestions.js'
import { generateFileSuggestions } from 'src/hooks/fileSuggestions.js'
import type { ServerResource, ServerResourceTemplate } from 'src/services/mcp/types.js'
import type { MCPServerConnection } from 'src/services/mcp/types.js'
import { completeResourceTemplate } from 'src/services/mcp/client.js'
import { normalizeNameForMCP } from 'src/services/mcp/normalization.js'
import { getAgentColor } from 'src/tools/AgentTool/agentColorManager.js'
import type { AgentDefinition } from 'src/tools/AgentTool/loadAgentsDir.js'
import { truncateToWidth } from 'src/utils/format.js'
import { logError } from 'src/utils/log.js'
import type { Theme } from 'src/utils/theme.js'

type FileSuggestionSource = {
  type: 'file'
  displayText: string
  description?: string
  path: string
  filename: string
  score?: number
}

type McpResourceSuggestionSource = {
  type: 'mcp_resource'
  displayText: string
  description: string
  server: string
  uri: string
  name: string
}

type McpResourceTemplateSuggestionSource = {
  type: 'mcp_resource_template'
  displayText: string
  description: string
  server: string
  uriTemplate: string
  name: string
}

type AgentSuggestionSource = {
  type: 'agent'
  displayText: string
  description: string
  agentType: string
  color?: keyof Theme
}

type SuggestionSource =
  | FileSuggestionSource
  | McpResourceSuggestionSource
  | McpResourceTemplateSuggestionSource
  | AgentSuggestionSource

/**
 * Creates a unified suggestion item from a source
 */
function createSuggestionFromSource(source: SuggestionSource): SuggestionItem {
  switch (source.type) {
    case 'file':
      return {
        id: `file-${source.path}`,
        displayText: source.displayText,
        description: source.description,
      }
    case 'mcp_resource':
      return {
        id: `mcp-resource-${source.server}__${source.uri}`,
        displayText: source.displayText,
        description: source.description,
      }
    case 'mcp_resource_template':
      return {
        id: `mcp-template::${source.server}__${source.uriTemplate}`,
        displayText: source.displayText,
        description: source.description,
        metadata: { partial: true },
      }
    case 'agent':
      return {
        id: `agent-${source.agentType}`,
        displayText: source.displayText,
        description: source.description,
        color: source.color,
      }
  }
}

const MAX_UNIFIED_SUGGESTIONS = 15
const DESCRIPTION_MAX_LENGTH = 60

function truncateDescription(description: string): string {
  return truncateToWidth(description, DESCRIPTION_MAX_LENGTH)
}

function templateDisplayPrefix(uriTemplate: string): string {
  const variableStart = uriTemplate.indexOf('{')
  return variableStart === -1
    ? uriTemplate
    : uriTemplate.slice(0, variableStart)
}

type UriTemplatePart =
  | { type: 'literal'; value: string }
  | { type: 'variable'; name: string }

type UriTemplateMatch = {
  template: ServerResourceTemplate
  argName: string
  argValue: string
  resolvedArgs: Record<string, string>
  valueStartIndex: number
}

function parseUriTemplate(uriTemplate: string): UriTemplatePart[] {
  const parts: UriTemplatePart[] = []
  let cursor = 0
  let literalStart = 0

  while (cursor < uriTemplate.length) {
    if (uriTemplate[cursor] !== '{') {
      cursor++
      continue
    }
    if (cursor > literalStart) {
      parts.push({
        type: 'literal',
        value: uriTemplate.slice(literalStart, cursor),
      })
    }
    const close = uriTemplate.indexOf('}', cursor)
    if (close === -1) {
      parts.push({ type: 'literal', value: uriTemplate.slice(cursor) })
      return parts
    }
    const rawExpression = uriTemplate
      .slice(cursor + 1, close)
      .replace(/^[+#./;?&]/, '')
      .replace(/\*$|:\d+$/, '')
    const [name = rawExpression] = rawExpression.split(',')
    parts.push({ type: 'variable', name })
    cursor = close + 1
    literalStart = cursor
  }

  if (literalStart < uriTemplate.length) {
    parts.push({ type: 'literal', value: uriTemplate.slice(literalStart) })
  }
  return parts
}

function matchUriTemplate(
  template: ServerResourceTemplate,
  uri: string,
): UriTemplateMatch | null {
  const parts = parseUriTemplate(template.uriTemplate)
  const resolvedArgs: Record<string, string> = {}
  let uriOffset = 0

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!
    if (part.type === 'literal') {
      const remaining = uri.slice(uriOffset)
      if (
        remaining.length < part.value.length ||
        !remaining.startsWith(part.value)
      ) {
        return null
      }
      uriOffset += part.value.length
      continue
    }

    const next = parts[index + 1]
    const nextLiteral = next?.type === 'literal' ? next.value : null
    const remaining = uri.slice(uriOffset)
    if (nextLiteral) {
      const nextLiteralOffset = remaining.indexOf(nextLiteral)
      if (nextLiteralOffset === -1) {
        return {
          template,
          argName: part.name,
          argValue: remaining,
          resolvedArgs,
          valueStartIndex: uriOffset,
        }
      }
      resolvedArgs[part.name] = remaining.slice(0, nextLiteralOffset)
      uriOffset += nextLiteralOffset
      continue
    }
    return {
      template,
      argName: part.name,
      argValue: remaining,
      resolvedArgs,
      valueStartIndex: uriOffset,
    }
  }
  return null
}

function findBestUriTemplateMatch(
  uri: string,
  templates: ServerResourceTemplate[],
): UriTemplateMatch | null {
  let bestMatch: UriTemplateMatch | null = null
  let bestScore: [number, number, number] = [-1, -1, -1]

  for (const template of templates) {
    const match = matchUriTemplate(template, uri)
    if (!match) continue
    const score: [number, number, number] = [
      Object.keys(match.resolvedArgs).length,
      match.valueStartIndex,
      template.uriTemplate.match(/\{/g)?.length ?? 0,
    ]
    if (
      !bestMatch ||
      score[0] > bestScore[0] ||
      (score[0] === bestScore[0] && score[1] > bestScore[1]) ||
      (score[0] === bestScore[0] &&
        score[1] === bestScore[1] &&
        score[2] > bestScore[2])
    ) {
      bestMatch = match
      bestScore = score
    }
  }
  return bestMatch
}

function replaceCurrentTemplateValue(
  uri: string,
  match: UriTemplateMatch,
  completedValue: string,
): string {
  const prefix = uri.slice(0, match.valueStartIndex)
  const parts = parseUriTemplate(match.template.uriTemplate)
  const resolvedCount = Object.keys(match.resolvedArgs).length
  let currentVariableIndex = -1
  let variableCount = 0
  for (let index = 0; index < parts.length; index++) {
    if (parts[index]?.type !== 'variable') continue
    if (variableCount === resolvedCount) {
      currentVariableIndex = index
      break
    }
    variableCount++
  }
  const nextPart =
    currentVariableIndex >= 0 ? parts[currentVariableIndex + 1] : undefined
  const nextLiteral = nextPart?.type === 'literal' ? nextPart.value : ''
  return prefix + completedValue + nextLiteral
}

function hasMoreTemplateVariables(match: UriTemplateMatch): boolean {
  const parts = parseUriTemplate(match.template.uriTemplate)
  const resolvedCount = Object.keys(match.resolvedArgs).length
  let variableCount = 0
  for (let index = 0; index < parts.length; index++) {
    if (parts[index]?.type !== 'variable') continue
    if (variableCount === resolvedCount) {
      return (
        parts[index + 1]?.type === 'literal' &&
        parts[index + 2]?.type === 'variable'
      )
    }
    variableCount++
  }
  return false
}

function formatResourceTemplateReplacement(
  prefix: string,
  value: string,
  partial: boolean,
): string {
  if (prefix === '@' && value.includes(' ')) {
    return partial ? `@"${value}` : `@"${value}"`
  }
  if (prefix === '/') return `/${value.replace(/ /g, '%20')}`
  return `${prefix}${value}`
}

export async function generateMcpResourceTemplateCompletions(
  query: string,
  templatesByServer: Record<string, ServerResourceTemplate[]>,
  clients: readonly MCPServerConnection[],
  prefix: string,
): Promise<SuggestionItem[] | null> {
  const separator = query.indexOf(':')
  if (separator === -1) return null

  const serverName = query.slice(0, separator)
  const uri = query.slice(separator + 1)
  const templates = templatesByServer[serverName]
  if (!templates || templates.length === 0) return null

  const match = findBestUriTemplateMatch(uri, templates)
  if (!match) {
    if (!uri) return null
    const suggestions = templates
      .filter(
        template =>
          template.uriTemplate.startsWith(uri) &&
          template.uriTemplate.length > uri.length,
      )
      .slice(0, MAX_UNIFIED_SUGGESTIONS)
      .map(template => ({
        id: `mcp-template::${serverName}__${template.uriTemplate}`,
        displayText: `${serverName}:${templateDisplayPrefix(template.uriTemplate)}`,
        description: truncateDescription(
          template.description || template.name || template.uriTemplate,
        ),
        metadata: {
          replacement: formatResourceTemplateReplacement(
            prefix,
            `${serverName}:${templateDisplayPrefix(template.uriTemplate)}`,
            true,
          ),
          partial: true,
        },
      }))
    return suggestions.length > 0 ? suggestions : null
  }

  const normalizedServerName = normalizeNameForMCP(serverName)
  const client = clients.find(
    candidate =>
      candidate.type === 'connected' &&
      normalizeNameForMCP(candidate.name) === normalizedServerName,
  )
  if (!client || client.type !== 'connected') return []

  const resolvedArgs = Object.fromEntries(
    Object.entries(match.resolvedArgs).map(([name, value]) => {
      try {
        return [name, decodeURIComponent(value)]
      } catch {
        return [name, value]
      }
    }),
  )
  let argValue = match.argValue
  try {
    argValue = decodeURIComponent(argValue)
  } catch {
    // Keep the literal value when it is not valid percent-encoding.
  }

  const completions = await completeResourceTemplate(
    client,
    match.template.uriTemplate,
    match.argName,
    argValue,
    resolvedArgs,
  )
  const description = truncateDescription(
    match.template.description || match.template.name || '',
  )
  const partial = hasMoreTemplateVariables(match)
  return completions.slice(0, MAX_UNIFIED_SUGGESTIONS).map(value => {
    const resolvedUri = replaceCurrentTemplateValue(uri, match, value)
    const replacement = `${serverName}:${resolvedUri}`
    return {
      id: `mcp-template-value::${serverName}__${resolvedUri}`,
      displayText: resolvedUri.slice(match.valueStartIndex),
      description,
      metadata: {
        partial,
        replacement: formatResourceTemplateReplacement(
          prefix,
          replacement,
          partial,
        ),
      },
    }
  })
}

function generateAgentSuggestions(
  agents: AgentDefinition[],
  query: string,
  showOnEmpty = false,
): AgentSuggestionSource[] {
  if (!query && !showOnEmpty) {
    return []
  }

  try {
    const agentSources: AgentSuggestionSource[] = agents.map(agent => ({
      type: 'agent' as const,
      displayText: `${agent.agentType} (agent)`,
      description: truncateDescription(agent.whenToUse),
      agentType: agent.agentType,
      color: getAgentColor(agent.agentType),
    }))

    if (!query) {
      return agentSources
    }

    const queryLower = query.toLowerCase()
    return agentSources.filter(
      agent =>
        agent.agentType.toLowerCase().includes(queryLower) ||
        agent.displayText.toLowerCase().includes(queryLower),
    )
  } catch (error) {
    logError(error as Error)
    return []
  }
}

export async function generateUnifiedSuggestions(
  query: string,
  mcpResources: Record<string, ServerResource[]>,
  mcpResourceTemplates: Record<string, ServerResourceTemplate[]>,
  agents: AgentDefinition[],
  showOnEmpty = false,
): Promise<SuggestionItem[]> {
  if (!query && !showOnEmpty) {
    return []
  }

  const [fileSuggestions, agentSources] = await Promise.all([
    generateFileSuggestions(query, showOnEmpty),
    Promise.resolve(generateAgentSuggestions(agents, query, showOnEmpty)),
  ])

  const fileSources: FileSuggestionSource[] = fileSuggestions.map(
    suggestion => ({
      type: 'file' as const,
      displayText: suggestion.displayText,
      description: suggestion.description,
      path: suggestion.displayText, // Use displayText as path for files
      filename: basename(suggestion.displayText),
      score: (suggestion.metadata as { score?: number } | undefined)?.score,
    }),
  )

  const mcpSources: McpResourceSuggestionSource[] = Object.values(mcpResources)
    .flat()
    .map(resource => ({
      type: 'mcp_resource' as const,
      displayText: `${resource.server}:${resource.uri}`,
      description: truncateDescription(
        resource.description || resource.name || resource.uri,
      ),
      server: resource.server,
      uri: resource.uri,
      name: resource.name || resource.uri,
    }))
  const mcpTemplateSources: McpResourceTemplateSuggestionSource[] = Object.values(mcpResourceTemplates)
    .flat()
    .map(template => ({
      type: 'mcp_resource_template' as const,
      displayText: `${template.server}:${templateDisplayPrefix(template.uriTemplate)}`,
      description: truncateDescription(template.description || template.name || template.uriTemplate),
      server: template.server,
      uriTemplate: template.uriTemplate,
      name: template.name || template.uriTemplate,
    }))

  if (!query) {
    const allSources = [...fileSources, ...mcpSources, ...mcpTemplateSources, ...agentSources]
    return allSources
      .slice(0, MAX_UNIFIED_SUGGESTIONS)
      .map(createSuggestionFromSource)
  }

  const nonFileSources: SuggestionSource[] = [...mcpSources, ...mcpTemplateSources, ...agentSources]

  // Score non-file sources with Fuse.js
  // File sources are already scored by Rust/nucleo
  type ScoredSource = { source: SuggestionSource; score: number }
  const scoredResults: ScoredSource[] = []

  // Add file sources with their nucleo scores (already 0-1, lower is better)
  for (const fileSource of fileSources) {
    scoredResults.push({
      source: fileSource,
      score: fileSource.score ?? 0.5, // Default to middle score if missing
    })
  }

  // Score non-file sources with Fuse.js and add them
  if (nonFileSources.length > 0) {
    const fuse = new Fuse(nonFileSources, {
      includeScore: true,
      threshold: 0.6, // Allow more matches through, we'll sort by score
      keys: [
        { name: 'displayText', weight: 2 },
        { name: 'name', weight: 3 },
        { name: 'server', weight: 1 },
        { name: 'description', weight: 1 },
        { name: 'agentType', weight: 3 },
        { name: 'uriTemplate', weight: 2 },
      ],
    })

    const fuseResults = fuse.search(query, { limit: MAX_UNIFIED_SUGGESTIONS })
    for (const result of fuseResults) {
      scoredResults.push({
        source: result.item,
        score:
          (result.score ?? 0.5) +
          (result.item.type === 'mcp_resource' ? 0.15 : 0),
      })
    }
  }

  // Sort all results by score (lower is better) and return top results
  scoredResults.sort((a, b) => a.score - b.score)

  return scoredResults
    .slice(0, MAX_UNIFIED_SUGGESTIONS)
    .map(r => r.source)
    .map(createSuggestionFromSource)
}
