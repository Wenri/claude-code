import figures from 'figures'
import React, {
  Children,
  createContext,
  isValidElement,
  useContext,
  type ReactNode,
} from 'react'
import { NoSelect } from '../../ink/components/NoSelect.js'
import type { Color } from '../../ink/styles.js'
import { Box, Text } from '../../ink.js'

export type ConnectorKind = 'branch' | 'last' | 'pipe' | 'space'

const connectorGlyphs: Record<ConnectorKind, string> = {
  branch: figures.branch,
  last: figures.last,
  pipe: figures.pipe,
  space: '',
}

type ConnectorProps = {
  connectors: ConnectorKind[]
  children: ReactNode
}

export function Connector({
  connectors,
  children,
}: ConnectorProps): ReactNode {
  const gutter =
    connectors.length > 0 && (
      <NoSelect
        fromLeftEdge
        flexShrink={0}
        flexDirection="row"
      >
        {connectors.map((connector, index) => (
          <Box key={index} width={2}>
            <Text dimColor>{connectorGlyphs[connector]}</Text>
          </Box>
        ))}
      </NoSelect>
    )

  return (
    <Box flexDirection="row">
      {gutter}
      <Box flexGrow={1} flexShrink={1}>
        {children}
      </Box>
    </Box>
  )
}

type TreeVariant = 'outline' | 'tree'

type TreeContextValue = {
  variant: TreeVariant
  ancestors: ConnectorKind[]
}

const TreeContext = createContext<TreeContextValue>({
  variant: 'outline',
  ancestors: [],
})
const IsLastChildContext = createContext(true)

function wrapChildren(children: ReactNode, respectLast = true): ReactNode[] {
  const items = Children.toArray(children)
  return items.map((child, index) => (
    <IsLastChildContext.Provider
      key={index}
      value={respectLast && index === items.length - 1}
    >
      {child}
    </IsLastChildContext.Provider>
  ))
}

type TreeProps = {
  children: ReactNode
  variant?: TreeVariant
}

function TreeRoot({
  children,
  variant = 'outline',
}: TreeProps): ReactNode {
  return (
    <TreeContext.Provider value={{ variant, ancestors: [] }}>
      <Box flexDirection="column">{wrapChildren(children)}</Box>
    </TreeContext.Provider>
  )
}

type TreeNodeProps = {
  label?: ReactNode
  children: ReactNode
  dimColor?: boolean
  color?: Color
}

function TreeNode({
  label,
  children,
  dimColor,
  color,
}: TreeNodeProps): ReactNode {
  const { variant, ancestors } = useContext(TreeContext)
  const isLast = useContext(IsLastChildContext)
  const connector: ConnectorKind =
    variant === 'outline' ? 'last' : isLast ? 'last' : 'branch'
  const childConnector: ConnectorKind =
    variant === 'outline' ? 'space' : isLast ? 'space' : 'pipe'
  const hasLabel = label != null && label !== false
  const content = hasLabel ? label : children
  const renderedContent = isValidElement(content) ? (
    content
  ) : (
    <Text dimColor={dimColor} color={color}>
      {content}
    </Text>
  )

  return (
    <Box flexDirection="column">
      <Connector connectors={[...ancestors, connector]}>
        {renderedContent}
      </Connector>
      {hasLabel && (
        <TreeContext.Provider
          value={{
            variant,
            ancestors: [...ancestors, childConnector],
          }}
        >
          {wrapChildren(children)}
        </TreeContext.Provider>
      )}
    </Box>
  )
}

type TreeGroupProps = {
  children: ReactNode
}

function TreeGroup({ children }: TreeGroupProps): ReactNode {
  const isLast = useContext(IsLastChildContext)
  return wrapChildren(children, isLast)
}

export const Tree = Object.assign(TreeRoot, {
  Node: TreeNode,
  Group: TreeGroup,
})
