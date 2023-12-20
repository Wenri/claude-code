import React, { type ReactNode } from 'react'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { Box, Text } from '../../ink.js'

export type TableBoxStyle = 'grid' | 'simple' | 'minimal' | 'plain'
export type TableColumn = {
  header?: ReactNode
  width?:
    | number
    | { min?: number; max?: number }
    | { ratio: number; min?: number; max?: number }
  align?: 'start' | 'center' | 'end'
  dim?: boolean
  bold?: boolean
}

type TableProps = {
  box?: TableBoxStyle
  columns: TableColumn[]
  children: ReactNode
  forceWidth?: number
}

type RowProps = { children: ReactNode }

const ALIGNMENT = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
} as const
const GAP_WIDTH = 2

function getTableOverhead(box: TableBoxStyle, columnCount: number): number {
  switch (box) {
    case 'grid':
      return 3 * columnCount + 1
    case 'simple':
      return 3 * columnCount - 1
    case 'minimal':
    case 'plain':
      return GAP_WIDTH * (columnCount - 1)
  }
}

function isSimpleCell(node: ReactNode): boolean {
  if (typeof node === 'string' || typeof node === 'number') return true
  return React.isValidElement(node) && node.type === React.Fragment
}

function styleCell(
  node: ReactNode,
  column: TableColumn,
  isHeader: boolean,
): ReactNode {
  if (!isSimpleCell(node)) return node
  return (
    <Text dimColor={column.dim && !isHeader} bold={column.bold || isHeader}>
      {node}
    </Text>
  )
}

function getTextContent(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(getTextContent).join('')
  if (React.isValidElement<{ children?: ReactNode }>(node)) {
    return getTextContent(node.props.children)
  }
  return ''
}

function displayWidth(node: ReactNode): number {
  return stringWidth(getTextContent(node))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function calculateWidths(
  columns: TableColumn[],
  rows: ReactNode[][],
  hasHeader: boolean,
  availableWidth: number,
  box: TableBoxStyle,
): number[] {
  const intrinsicWidths = columns.map((column, index) => {
    let width = hasHeader ? displayWidth(column.header) : 0
    for (const row of rows) width = Math.max(width, displayWidth(row[index]))
    return width
  })
  const widths = Array<number>(columns.length)
  const ratioColumns: number[] = []

  for (let index = 0; index < columns.length; index++) {
    const width = columns[index]!.width
    if (typeof width === 'number') {
      widths[index] = width
    } else if (width && 'ratio' in width && width.ratio !== undefined) {
      ratioColumns.push(index)
      widths[index] = 0
    } else if (width) {
      widths[index] = clamp(
        intrinsicWidths[index]!,
        width.min ?? 0,
        width.max ?? Infinity,
      )
    } else {
      widths[index] = intrinsicWidths[index]!
    }
  }

  if (ratioColumns.length > 0) {
    const fixedWidth = widths.reduce((sum, width) => sum + width, 0)
    const remainingWidth = Math.max(
      0,
      availableWidth - getTableOverhead(box, columns.length) - fixedWidth,
    )
    const totalRatio = ratioColumns.reduce(
      (sum, index) =>
        sum +
        ((columns[index]!.width as { ratio?: number }).ratio ?? 0),
      0,
    )
    for (const index of ratioColumns) {
      const width = columns[index]!.width as {
        ratio?: number
        min?: number
        max?: number
      }
      const allocated =
        totalRatio > 0
          ? Math.floor((remainingWidth * (width.ratio ?? 0)) / totalRatio)
          : 0
      widths[index] = clamp(
        allocated,
        width.min ?? 1,
        width.max ?? Infinity,
      )
    }
  }

  return widths
}

function ColumnSeparator({ box }: { box: TableBoxStyle }): ReactNode {
  if (box === 'grid' || box === 'simple') return <Text dimColor> │ </Text>
  return <Box width={GAP_WIDTH} flexShrink={0} />
}

function Side({ box, side }: { box: TableBoxStyle; side: 'left' | 'right' }) {
  if (box === 'grid') {
    return <Text dimColor>{side === 'left' ? '│ ' : ' │'}</Text>
  }
  if (box === 'simple') return <Text> </Text>
  return null
}

function horizontalSegment(width: number): string {
  return '─'.repeat(width + 2)
}

function minimalSegment(width: number, index: number): ReactNode {
  return (
    <React.Fragment key={index}>
      {index > 0 && <Box width={GAP_WIDTH} flexShrink={0} />}
      <Text dimColor>{'─'.repeat(width)}</Text>
    </React.Fragment>
  )
}

function Border({
  box,
  type,
  widths,
}: {
  box: TableBoxStyle
  type: 'top' | 'header' | 'bottom'
  widths: number[]
}): ReactNode {
  if (box === 'minimal') {
    return <Box flexDirection="row">{widths.map(minimalSegment)}</Box>
  }
  const segments = widths.map(horizontalSegment)
  if (box === 'simple') return <Text dimColor>{segments.join('┼')}</Text>
  const [left, middle, right] =
    type === 'top'
      ? ['┌', '┬', '┐']
      : type === 'bottom'
        ? ['└', '┴', '┘']
        : ['├', '┼', '┤']
  return (
    <Text dimColor>
      {left}
      {segments.join(middle)}
      {right}
    </Text>
  )
}

function RenderRow({
  cells,
  columns,
  widths,
  box,
  isHeader,
}: {
  cells: ReactNode[]
  columns: TableColumn[]
  widths: number[]
  box: TableBoxStyle
  isHeader: boolean
}): ReactNode {
  return (
    <Box flexDirection="row">
      <Side box={box} side="left" />
      {columns.map((column, index) => (
        <React.Fragment key={index}>
          {index > 0 && <ColumnSeparator box={box} />}
          <Box
            width={widths[index] || undefined}
            flexShrink={0}
            justifyContent={ALIGNMENT[column.align ?? 'start']}
          >
            {styleCell(cells[index], column, isHeader)}
          </Box>
        </React.Fragment>
      ))}
      <Side box={box} side="right" />
    </Box>
  )
}

function Row({ children }: RowProps): ReactNode {
  return <>{children}</>
}

function TableComponent({
  box: boxProp = 'plain',
  columns,
  children,
  forceWidth,
}: TableProps): ReactNode {
  const { columns: terminalWidth } = useTerminalSize()
  const availableWidth = forceWidth ?? terminalWidth
  const rowElements = React.Children.toArray(children).filter(
    React.isValidElement<RowProps>,
  )
  const rows = rowElements.map(row => React.Children.toArray(row.props.children))
  const hasHeader = columns.some(column => column.header !== undefined)
  const widths = calculateWidths(
    columns,
    rows,
    hasHeader,
    availableWidth,
    boxProp,
  )

  return (
    <Box flexDirection="column">
      {boxProp === 'grid' && <Border box={boxProp} type="top" widths={widths} />}
      {hasHeader && (
        <RenderRow
          cells={columns.map(column => column.header)}
          columns={columns}
          widths={widths}
          box={boxProp}
          isHeader
        />
      )}
      {hasHeader && boxProp !== 'plain' && (
        <Border box={boxProp} type="header" widths={widths} />
      )}
      {rows.map((cells, index) => (
        <RenderRow
          key={rowElements[index]!.key ?? index}
          cells={cells}
          columns={columns}
          widths={widths}
          box={boxProp}
          isHeader={false}
        />
      ))}
      {boxProp === 'grid' && (
        <Border box={boxProp} type="bottom" widths={widths} />
      )}
    </Box>
  )
}

export const Table = Object.assign(TableComponent, { Row })
