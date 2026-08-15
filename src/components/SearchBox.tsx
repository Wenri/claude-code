import React from 'react'
import { stringWidth } from '../ink/stringWidth.js'
import { Box, type ClickEvent, Text } from '../ink.js'
import { Cursor } from '../utils/Cursor.js'

type Highlight = readonly [start: number, end: number]

type Props = {
  query: string
  placeholder?: string
  isFocused: boolean
  isTerminalFocused: boolean
  prefix?: string
  width?: number | string
  cursorOffset?: number
  borderless?: boolean
  highlights?: readonly Highlight[]
  prefixDim?: boolean
  onCursorOffsetChange?: (offset: number) => void
}

/** Render search-result ranges and the terminal cursor as disjoint text runs. */
export function renderSearchBoxQuery(
  query: string,
  highlights: readonly Highlight[],
  cursorOffset: number,
): React.ReactNode[] {
  const isHighlighted = (offset: number) =>
    highlights.some(([start, end]) => offset >= start && offset < end)
  const boundaries = new Set([0, query.length])
  for (const [start, end] of highlights) {
    boundaries.add(start)
    boundaries.add(end)
  }
  if (cursorOffset >= 0) {
    boundaries.add(cursorOffset)
    boundaries.add(cursorOffset + 1)
  }

  const offsets = [...boundaries].sort((left, right) => left - right)
  const rendered: React.ReactNode[] = []
  for (let index = 0; index < offsets.length - 1; index += 1) {
    const start = offsets[index]!
    const end = offsets[index + 1]!
    const text = start < query.length ? query.slice(start, end) : ' '
    if (!text) continue
    rendered.push(
      <Text
        key={start}
        color={isHighlighted(start) ? 'suggestion' : undefined}
        inverse={start === cursorOffset}
      >
        {text}
      </Text>,
    )
  }
  return rendered
}

export function SearchBox({
  query,
  placeholder = 'Search…',
  isFocused,
  isTerminalFocused,
  prefix = '⌕',
  width,
  cursorOffset,
  borderless = false,
  highlights = [],
  prefixDim = false,
  onCursorOffsetChange,
}: Props): React.ReactNode {
  const offset = cursorOffset ?? query.length
  const handleClick = onCursorOffsetChange
    ? (event: ClickEvent) => {
        if (!isFocused || !query) return
        const borderColumnOffset = borderless ? 0 : 2
        const row = event.localRow - (borderless ? 0 : 1)
        if (row < 0) return
        const prefixWidth = row === 0 ? stringWidth(prefix) + 1 : 0
        const column = Math.max(
          0,
          event.localCol - borderColumnOffset - prefixWidth,
        )
        const cursor = Cursor.fromText(
          query,
          Number.MAX_SAFE_INTEGER,
          0,
        )
        onCursorOffsetChange(
          cursor.measuredText.getOffsetFromPosition({ line: row, column }),
        )
      }
    : undefined

  const content = isFocused ? (
    query ? (
      renderSearchBoxQuery(
        query,
        highlights,
        isTerminalFocused ? offset : -1,
      )
    ) : isTerminalFocused ? (
      <>
        <Text inverse>{placeholder.charAt(0)}</Text>
        <Text dimColor>{placeholder.slice(1)}</Text>
      </>
    ) : (
      <Text dimColor>{placeholder}</Text>
    )
  ) : query ? (
    <Text>{query}</Text>
  ) : (
    <Text>{placeholder}</Text>
  )

  return (
    <Box
      flexShrink={0}
      borderStyle={borderless ? undefined : 'round'}
      borderColor={isFocused ? 'suggestion' : undefined}
      borderDimColor={!isFocused}
      paddingX={borderless ? 0 : 1}
      width={width}
      onClick={handleClick}
    >
      <Text dimColor={!isFocused}>
        <Text dimColor={prefixDim}>{prefix}</Text> {content}
      </Text>
    </Box>
  )
}
