import React from 'react'
import { stringWidth } from '../ink/stringWidth.js'
import { Box, type ClickEvent, Text, type TextProps } from '../ink.js'
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
  dimRange?: Highlight
  cursorChar?: string
  prefixDim?: boolean
  prefixColor?: TextProps['color']
  onCursorOffsetChange?: (offset: number) => void
}

/** Render search-result ranges, dimmed ranges, and the terminal cursor as disjoint text runs. */
export function renderSearchBoxQuery(
  query: string,
  highlights: readonly Highlight[],
  dimRange: Highlight | undefined,
  cursorOffset: number,
  cursorChar: string | undefined,
): React.ReactNode[] {
  const isHighlighted = (offset: number) =>
    highlights.some(([start, end]) => offset >= start && offset < end)
  const isDimmed = (offset: number) =>
    !!dimRange && offset >= dimRange[0] && offset < dimRange[1]
  const boundaries = new Set([0, query.length])
  for (const [start, end] of highlights) {
    boundaries.add(start)
    boundaries.add(end)
  }
  if (dimRange) {
    boundaries.add(dimRange[0])
    boundaries.add(dimRange[1])
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
      start === cursorOffset && cursorChar ? (
        <Text key={start}>{cursorChar}</Text>
      ) : (
        <Text
          key={start}
          color={isHighlighted(start) ? 'suggestion' : undefined}
          dimColor={isDimmed(start)}
          inverse={start === cursorOffset}
        >
          {text}
        </Text>
      ),
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
  dimRange,
  cursorChar,
  prefixDim = false,
  prefixColor,
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
        dimRange,
        isTerminalFocused ? offset : -1,
        cursorChar,
      )
    ) : isTerminalFocused ? (
      <>
        {cursorChar ?? <Text inverse>{placeholder.charAt(0)}</Text>}
        <Text dimColor>{cursorChar ? placeholder : placeholder.slice(1)}</Text>
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
        <Text dimColor={prefixDim} color={prefixColor}>{prefix}</Text> {content}
      </Text>
    </Box>
  )
}
