import React from 'react'
import { Box, Text } from '../ink.js'
import type { Color } from '../ink/styles.js'
import { stringWidth } from '../ink/stringWidth.js'
import { Cursor } from '../utils/Cursor.js'

export type SearchHighlight = readonly [start: number, end: number]

type Props = {
  query: string
  placeholder?: string
  isFocused: boolean
  isTerminalFocused: boolean
  prefix?: string
  width?: number | string
  cursorOffset?: number
  borderless?: boolean
  highlights?: readonly SearchHighlight[]
  dimRange?: SearchHighlight
  cursorChar?: React.ReactNode
  prefixDim?: boolean
  prefixColor?: Color
  onCursorOffsetChange?: (offset: number) => void
}

/**
 * Compact text input renderer shared by fullscreen pickers.
 *
 * Input ownership intentionally stays with the parent: this component only
 * renders the current value and maps mouse clicks back to a cursor offset.
 */
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
    ? (event: { localRow: number; localCol: number }) => {
        if (!isFocused || !query) return
        const borderOffset = borderless ? 0 : 2
        const row = event.localRow - (borderless ? 0 : 1)
        if (row < 0) return
        const prefixWidth = row === 0 ? stringWidth(prefix) + 1 : 0
        const column = Math.max(
          0,
          event.localCol - borderOffset - prefixWidth,
        )
        const cursor = Cursor.fromText(query, Number.MAX_SAFE_INTEGER, 0)
        onCursorOffsetChange(
          cursor.measuredText.getOffsetFromPosition({ line: row, column }),
        )
      }
    : undefined

  const renderedValue = isFocused ? (
    query ? (
      renderTextWithHighlights(
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
        <Text dimColor={prefixDim} color={prefixColor}>
          {prefix}
        </Text>{' '}
        {renderedValue}
      </Text>
    </Box>
  )
}

export function renderTextWithHighlights(
  text: string,
  highlights: readonly SearchHighlight[],
  dimRange: SearchHighlight | undefined,
  cursorOffset: number,
  cursorChar?: React.ReactNode,
): React.ReactNode[] {
  const isHighlighted = (offset: number): boolean =>
    highlights.some(([start, end]) => offset >= start && offset < end)
  const isDimmed = (offset: number): boolean =>
    Boolean(
      dimRange && offset >= dimRange[0] && offset < dimRange[1],
    )

  const boundaries = new Set([0, text.length])
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

  const sorted = [...boundaries].sort((left, right) => left - right)
  const result: React.ReactNode[] = []
  for (let index = 0; index < sorted.length - 1; index++) {
    const start = sorted[index]!
    const end = sorted[index + 1]!
    const segment = start < text.length ? text.slice(start, end) : ' '
    if (!segment) continue
    const atCursor = start === cursorOffset
    const cursorAtNewline = atCursor && segment === '\n'
    result.push(
      atCursor && cursorChar ? (
        <Text key={start}>
          {cursorChar}
          {cursorAtNewline ? '\n' : null}
        </Text>
      ) : (
        <Text
          key={start}
          color={isHighlighted(start) ? 'suggestion' : undefined}
          dimColor={isDimmed(start)}
          inverse={atCursor}
        >
          {cursorAtNewline ? ' \n' : segment}
        </Text>
      ),
    )
  }
  return result
}
