import type { ReactNode } from 'react'
import React from 'react'
import { Text, type TextProps } from '../../ink.js'

export function Label({
  children,
  color,
  textColor,
  padded,
  bold,
  wrap,
}: {
  children?: ReactNode
  color?: TextProps['backgroundColor']
  textColor?: TextProps['color']
  padded?: boolean
  bold?: boolean
  wrap?: TextProps['wrap']
}): React.ReactNode {
  const padding = padded ? ' ' : ''
  const foreground = textColor ?? (color ? 'inverseText' : undefined)
  return (
    <Text backgroundColor={color} color={foreground} bold={bold} wrap={wrap}>
      {padding}
      {children}
      {padding}
    </Text>
  )
}
