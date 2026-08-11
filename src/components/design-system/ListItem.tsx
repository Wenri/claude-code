import figures from 'figures'
import React, { type ReactNode, useState } from 'react'
import type { ClickEvent } from '../../ink/events/click-event.js'
import { useDeclaredCursor } from '../../ink/hooks/use-declared-cursor.js'
import { Box, Text } from '../../ink.js'

type ListItemProps = {
  isFocused: boolean
  isSelected?: boolean
  children: ReactNode
  description?: string
  showScrollDown?: boolean
  showScrollUp?: boolean
  styled?: boolean
  disabled?: boolean
  declareCursor?: boolean
  onClick?: (event: ClickEvent) => void
  onHoverChange?: (hovered: boolean) => void
}

export function ListItem({
  isFocused,
  isSelected = false,
  children,
  description,
  showScrollDown,
  showScrollUp,
  styled = true,
  disabled = false,
  declareCursor,
  onClick,
  onHoverChange,
}: ListItemProps): React.ReactNode {
  const [hovered, setHovered] = useState(false)
  const clickable = !disabled && onClick !== undefined
  const hoverable = !disabled && (onClick !== undefined || onHoverChange !== undefined)
  const handleHover = (value: boolean): void => {
    setHovered(value)
    onHoverChange?.(value)
  }

  const textColor = (() => {
    if (disabled) return 'inactive' as const
    if (!styled) return undefined
    if (isSelected) return 'success' as const
    if (isFocused) return 'suggestion' as const
    return undefined
  })()

  const cursorRef = useDeclaredCursor({
    line: 0,
    column: 0,
    active: isFocused && !disabled && declareCursor !== false,
  })

  const indicator = (() => {
    if (disabled) return <Text> </Text>
    if (isFocused) return <Text color="suggestion">{figures.pointer}</Text>
    if (showScrollDown) return <Text dimColor>{figures.arrowDown}</Text>
    if (showScrollUp) return <Text dimColor>{figures.arrowUp}</Text>
    if (hovered && clickable) return <Text dimColor>{figures.pointer}</Text>
    return <Text> </Text>
  })()

  return (
    <Box
      ref={cursorRef}
      flexDirection="column"
      onClick={clickable ? onClick : undefined}
      onMouseEnter={hoverable ? () => handleHover(true) : undefined}
      onMouseLeave={hoverable ? () => handleHover(false) : undefined}
    >
      <Box flexDirection="row" gap={1}>
        {indicator}
        {styled ? (
          <Text color={textColor} dimColor={disabled}>
            {children}
          </Text>
        ) : (
          children
        )}
        {isSelected && !disabled && <Text color="success">{figures.tick}</Text>}
      </Box>
      {description && (
        <Box paddingLeft={2}>
          <Text color="inactive">{description}</Text>
        </Box>
      )}
    </Box>
  )
}
