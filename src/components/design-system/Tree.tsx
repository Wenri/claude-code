import React, { createContext, useContext } from 'react'
import { Box, Text } from '../../ink.js'
import type { Theme } from '../../utils/theme.js'

type Variant = 'outline' | 'tree'
type Connector = 'branch' | 'last' | 'pipe' | 'space'

const CONNECTOR_CHAR: Record<Connector, string> = {
  branch: '├',
  last: '└',
  pipe: '│',
  space: '',
}

const TreeContext = createContext<{
  variant: Variant
  ancestors: Connector[]
}>({ variant: 'outline', ancestors: [] })
const IsLastContext = createContext(true)

function ConnectorRow({
  connectors,
  children,
}: {
  connectors: Connector[]
  children: React.ReactNode
}): React.ReactNode {
  return (
    <Box flexDirection="row">
      {connectors.length > 0 && (
        <Box fromLeftEdge flexShrink={0} flexDirection="row">
          {connectors.map((connector, index) => (
            <Box key={index} width={2}>
              <Text dimColor>{CONNECTOR_CHAR[connector]}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box flexGrow={1} flexShrink={1}>
        {children}
      </Box>
    </Box>
  )
}

function wrapChildren(
  children: React.ReactNode,
  parentIsLast = true,
): React.ReactNode[] {
  const childArray = React.Children.toArray(children)
  return childArray.map((child, index) => (
    <IsLastContext.Provider
      key={index}
      value={parentIsLast && index === childArray.length - 1}
    >
      {child}
    </IsLastContext.Provider>
  ))
}

type TreeProps = {
  children: React.ReactNode
  variant?: Variant
}

function TreeRoot({
  children,
  variant = 'outline',
}: TreeProps): React.ReactNode {
  return (
    <TreeContext.Provider value={{ variant, ancestors: [] }}>
      <Box flexDirection="column">{wrapChildren(children)}</Box>
    </TreeContext.Provider>
  )
}

type TreeNodeProps = {
  children?: React.ReactNode
  label?: React.ReactNode | false
  dimColor?: boolean
  color?: keyof Theme
}

function TreeNode({
  label,
  children,
  dimColor,
  color,
}: TreeNodeProps): React.ReactNode {
  const { variant, ancestors } = useContext(TreeContext)
  const isLast = useContext(IsLastContext)
  const connector = variant === 'outline' ? 'last' : isLast ? 'last' : 'branch'
  const childConnector =
    variant === 'outline' ? 'space' : isLast ? 'space' : 'pipe'
  const hasLabel = label != null && label !== false
  const content = hasLabel ? label : children
  const renderedContent = React.isValidElement(content) ? (
    content
  ) : (
    <Text dimColor={dimColor} color={color}>
      {content}
    </Text>
  )

  return (
    <Box flexDirection="column">
      <ConnectorRow connectors={[...ancestors, connector]}>
        {renderedContent}
      </ConnectorRow>
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

function TreeGroup({ children }: { children: React.ReactNode }): React.ReactNode {
  const isLast = useContext(IsLastContext)
  return wrapChildren(children, isLast)
}

export const Tree = Object.assign(TreeRoot, {
  Node: TreeNode,
  Group: TreeGroup,
})
