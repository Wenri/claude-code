import * as React from 'react'
import { Fragment, memo, type ReactNode } from 'react'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { Box, Text } from '../../ink.js'
import {
  truncatePathMiddle,
  truncateToWidth,
  truncateToWidthNoEllipsis,
} from '../../utils/format.js'
import type { Theme } from '../../utils/theme.js'

export type SuggestionItem = {
  id: string
  displayText: string
  tag?: string
  description?: string
  metadata?: unknown
  color?: keyof Theme
  query?: string
}

export type SuggestionType =
  | 'command'
  | 'file'
  | 'directory'
  | 'agent'
  | 'shell'
  | 'custom-title'
  | 'slack-channel'
  | 'none'

export const OVERLAY_MAX_ITEMS = 5

function getIcon(itemId: string): string {
  if (itemId.startsWith('file-')) return '+'
  if (itemId.startsWith('mcp-resource-')) return '◇'
  if (itemId.startsWith('mcp-template')) return '◇'
  if (itemId.startsWith('agent-')) return '*'
  return '+'
}

function findQueryRanges(
  text: string,
  query: string,
  contiguousOnly = false,
): Array<[number, number]> {
  const normalizedText = text.toLowerCase()
  // Lower-casing some Unicode characters changes their length. Avoid applying
  // offsets from that transformed string to the original display text.
  if (normalizedText.length !== text.length) return []

  const contiguousStart = normalizedText.indexOf(query)
  if (contiguousStart !== -1) {
    return [[contiguousStart, contiguousStart + query.length]]
  }
  if (contiguousOnly) return []

  const ranges: Array<[number, number]> = []
  let cursor = 0
  for (const char of query) {
    const index = normalizedText.indexOf(char, cursor)
    if (index === -1) return []
    const previous = ranges.at(-1)
    if (previous && previous[1] === index) previous[1] = index + 1
    else ranges.push([index, index + 1])
    cursor = index + 1
  }
  return ranges
}

function HighlightedSuggestionText({
  text,
  query,
  color,
  dimColor,
  contiguousOnly = false,
}: {
  text: string
  query?: string
  color?: keyof Theme
  dimColor: boolean
  contiguousOnly?: boolean
}): ReactNode {
  const ranges = query ? findQueryRanges(text, query, contiguousOnly) : []
  if (ranges.length === 0) {
    return (
      <Text color={color} dimColor={dimColor}>
        {text}
      </Text>
    )
  }

  const parts: ReactNode[] = []
  const addPart = (start: number, end: number, highlighted: boolean) => {
    if (start >= end) return
    parts.push(
      <Text
        key={start}
        color={highlighted ? 'suggestion' : color}
        dimColor={!highlighted && dimColor}
      >
        {text.slice(start, end)}
      </Text>,
    )
  }

  let cursor = 0
  for (const [start, end] of ranges) {
    addPart(cursor, start, false)
    addPart(start, end, true)
    cursor = end
  }
  addPart(cursor, text.length, false)
  return <Fragment>{parts}</Fragment>
}

function isUnifiedSuggestion(itemId: string): boolean {
  return (
    itemId.startsWith('file-') ||
    itemId.startsWith('mcp-resource-') ||
    itemId.startsWith('mcp-template') ||
    itemId.startsWith('agent-')
  )
}

function splitDescription(text: string, width: number): [string, string] {
  if (width <= 0 || stringWidth(text) <= width) return [text, '']
  const firstPass = truncateToWidthNoEllipsis(text, width)
  const remainder = text.slice(firstPass.length)
  if (remainder.startsWith(' ')) return [firstPass, remainder.trimStart()]
  const lastSpace = firstPass.lastIndexOf(' ')
  if (lastSpace > 0) {
    return [firstPass.slice(0, lastSpace), text.slice(lastSpace + 1)]
  }
  return [firstPass, remainder]
}

function suggestionRowHeight(
  item: SuggestionItem,
  columns: number,
  maxColumnWidth: number,
): number {
  if (isUnifiedSuggestion(item.id) || !item.description) return 1
  const nameWidth = Math.min(maxColumnWidth, Math.floor(columns * 0.4))
  const tagWidth = item.tag ? stringWidth(`[${item.tag}] `) : 0
  const descriptionWidth = Math.max(0, columns - nameWidth - tagWidth - 4)
  if (descriptionWidth <= 0) return 1
  return stringWidth(item.description.replace(/\s+/g, ' ').trim()) >
    descriptionWidth
    ? 2
    : 1
}

const SuggestionItemRow = memo(function SuggestionItemRow({
  item,
  maxColumnWidth,
  isSelected,
  allowWrap = true,
}: {
  item: SuggestionItem
  maxColumnWidth?: number
  isSelected: boolean
  allowWrap?: boolean
}): ReactNode {
  const { columns } = useTerminalSize()

  if (isUnifiedSuggestion(item.id)) {
    const icon = getIcon(item.id)
    const textColor: keyof Theme | undefined = isSelected
      ? 'suggestion'
      : undefined
    const dimColor = !isSelected
    const isFile = item.id.startsWith('file-')
    const isMcpResource = item.id.startsWith('mcp-resource-')
    const isMcpTemplateValue = item.id.startsWith('mcp-template-value::')
    const isMcpTemplate = item.id.startsWith('mcp-template::')
    const separatorWidth = item.description ? 3 : 0

    let displayText: string
    if (isFile || isMcpTemplate || isMcpTemplateValue) {
      const descReserve = item.description
        ? Math.min(20, stringWidth(item.description))
        : 0
      const maxPathLength =
        columns - 2 - 4 - separatorWidth - descReserve
      displayText = isMcpTemplateValue
        ? truncateToWidth(item.displayText, maxPathLength)
        : truncatePathMiddle(item.displayText, maxPathLength)
    } else if (isMcpResource) {
      displayText = truncateToWidth(item.displayText, 30)
    } else {
      displayText = item.displayText
    }

    const availableWidth =
      columns - 2 - stringWidth(displayText) - separatorWidth - 4
    const lineContent = item.description
      ? `${icon} ${displayText} – ${truncateToWidth(
          item.description.replace(/\s+/g, ' '),
          Math.max(0, availableWidth),
        )}`
      : `${icon} ${displayText}`

    return (
      <Text color={textColor} dimColor={dimColor} wrap="truncate">
        {lineContent}
      </Text>
    )
  }

  const maxNameWidth = Math.floor(columns * 0.4)
  const displayTextWidth = Math.min(
    maxColumnWidth ?? stringWidth(item.displayText) + 5,
    maxNameWidth,
  )
  const textColor = item.color || (isSelected ? 'suggestion' : undefined)
  const shouldDim = !isSelected
  let displayText = item.displayText
  if (stringWidth(displayText) > displayTextWidth - 2) {
    displayText = truncateToWidth(displayText, displayTextWidth - 2)
  }

  const padding = ' '.repeat(
    Math.max(0, displayTextWidth - stringWidth(displayText)),
  )
  const tagText = item.tag ? `[${item.tag}] ` : ''
  const tagWidth = stringWidth(tagText)
  const descriptionWidth = Math.max(
    0,
    columns - displayTextWidth - tagWidth - 4,
  )
  const normalizedDescription = item.description
    ? item.description.replace(/\s+/g, ' ').trim()
    : ''
  const [firstLine, secondLine] = allowWrap
    ? splitDescription(normalizedDescription, descriptionWidth)
    : [truncateToWidth(normalizedDescription, descriptionWidth), '']
  const selectedColor: keyof Theme | undefined = isSelected
    ? 'suggestion'
    : undefined

  const firstRow = (
    <Text wrap="truncate">
      <HighlightedSuggestionText
        text={displayText}
        query={item.query}
        color={textColor}
        dimColor={shouldDim}
      />
      <Text color={textColor} dimColor={shouldDim}>
        {padding}
      </Text>
      {tagText ? <Text dimColor>{tagText}</Text> : null}
      <HighlightedSuggestionText
        text={firstLine}
        query={item.query}
        color={selectedColor}
        dimColor={!isSelected}
        contiguousOnly
      />
    </Text>
  )
  if (!secondLine) return firstRow

  const secondLineIndent = displayTextWidth + tagWidth
  return (
    <Box flexDirection="column">
      {firstRow}
      <Text wrap="truncate">
        {' '.repeat(secondLineIndent)}
        <HighlightedSuggestionText
          text={truncateToWidth(
            secondLine,
            Math.max(0, columns - secondLineIndent - 4),
          )}
          query={item.query}
          color={selectedColor}
          dimColor={!isSelected}
          contiguousOnly
        />
      </Text>
    </Box>
  )
})

type Props = {
  suggestions: SuggestionItem[]
  selectedSuggestion: number
  maxColumnWidth?: number
  overlay?: boolean
  emptyMessage?: string
  noPad?: boolean
}

export function PromptInputFooterSuggestions({
  suggestions,
  selectedSuggestion,
  maxColumnWidth: maxColumnWidthProp,
  overlay,
  emptyMessage,
  noPad,
}: Props): ReactNode {
  const { rows, columns } = useTerminalSize()
  const maxVisibleItems = overlay
    ? OVERLAY_MAX_ITEMS
    : Math.min(6, Math.max(1, rows - 3))

  if (suggestions.length === 0) {
    if (!emptyMessage) return null
    const paddingRows = noPad ? 0 : Math.max(0, maxVisibleItems - 1)
    return (
      <Box
        flexDirection="column"
        justifyContent={overlay ? undefined : 'flex-end'}
      >
        <Text dimColor>{emptyMessage}</Text>
        {Array.from({ length: paddingRows }, (_, index) => (
          <Text key={`pad-${index}`}> </Text>
        ))}
      </Box>
    )
  }

  const maxColumnWidth =
    maxColumnWidthProp ??
    Math.max(...suggestions.map(item => stringWidth(item.displayText))) + 5
  const allowWrap = maxVisibleItems >= 2
  const heights = suggestions.map(item =>
    allowWrap
      ? suggestionRowHeight(item, columns, maxColumnWidth)
      : 1,
  )
  const selectedIndex = Math.max(
    0,
    Math.min(selectedSuggestion, suggestions.length - 1),
  )
  let startIndex = selectedIndex
  let endIndex = selectedIndex + 1
  let usedRows = heights[selectedIndex] ?? 1
  let rowsAbove = 0
  const preferredRowsAbove = Math.floor(maxVisibleItems / 2)

  while (
    startIndex > 0 &&
    usedRows < maxVisibleItems &&
    rowsAbove + (heights[startIndex - 1] ?? 1) <= preferredRowsAbove
  ) {
    startIndex--
    rowsAbove += heights[startIndex] ?? 1
  }
  usedRows += rowsAbove
  while (
    endIndex < suggestions.length &&
    usedRows + (heights[endIndex] ?? 1) <= maxVisibleItems
  ) {
    usedRows += heights[endIndex] ?? 1
    endIndex++
  }
  while (
    startIndex > 0 &&
    usedRows + (heights[startIndex - 1] ?? 1) <= maxVisibleItems
  ) {
    startIndex--
    usedRows += heights[startIndex] ?? 1
  }

  const visibleItems = suggestions.slice(startIndex, endIndex)
  const paddingRows = noPad ? 0 : Math.max(0, maxVisibleItems - usedRows)

  return (
    <Box
      flexDirection="column"
      justifyContent={overlay ? undefined : 'flex-end'}
    >
      {visibleItems.map(item => (
        <SuggestionItemRow
          key={item.id}
          item={item}
          maxColumnWidth={maxColumnWidth}
          isSelected={item.id === suggestions[selectedSuggestion]?.id}
          allowWrap={allowWrap}
        />
      ))}
      {Array.from({ length: paddingRows }, (_, index) => (
        <Text key={`pad-${index}`}> </Text>
      ))}
    </Box>
  )
}

export default memo(PromptInputFooterSuggestions)
