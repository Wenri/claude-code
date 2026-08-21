import figures from 'figures'
import React, {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { DOMElement } from '../../ink/dom.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { useAutoFocus } from '../../ink/hooks/use-auto-focus.js'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { ListItem } from './ListItem.js'

type OverflowHint = 'glyph' | 'count'

type SelectProps = {
  children: ReactNode
  visibleCount: number
  onSelect?: (index: number) => void
  onFocus?: (index: number) => void
  isDisabled?: boolean
  wrap?: boolean
  overflowHint?: OverflowHint
  emptyMessage?: string
}

type SelectItemProps = { children: ReactNode }

const SelectItemFocusContext = createContext(false)

export function useSelectItemFocus(): boolean {
  return useContext(SelectItemFocusContext)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function SelectRoot({
  children,
  visibleCount,
  onSelect,
  onFocus,
  isDisabled = false,
  wrap = false,
  overflowHint = 'glyph',
  emptyMessage,
}: SelectProps): React.ReactNode {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const ref = useRef<DOMElement>(null)
  const items = Children.toArray(children)
  const itemCount = items.length
  const lastIndex = itemCount - 1

  const move = (delta: number): void => {
    setFocusedIndex(current => {
      const next = current + delta
      if (wrap) return ((next % itemCount) + itemCount) % itemCount
      return clamp(next, 0, lastIndex)
    })
  }

  useKeybindings(
    {
      'select:next': () => move(1),
      'select:previous': () => move(-1),
      'select:pageDown': () => move(visibleCount),
      'select:pageUp': () => move(-visibleCount),
      'select:first': () => setFocusedIndex(0),
      'select:last': () => setFocusedIndex(lastIndex),
    },
    { context: 'Select', isActive: !isDisabled && itemCount > 0 },
  )

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (isDisabled || itemCount === 0) return
    if (event.key === 'return' && onSelect) onSelect(focusedIndex)
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  useAutoFocus(ref, !isDisabled)

  useEffect(() => {
    setFocusedIndex(current =>
      clamp(current, 0, Math.max(0, itemCount - 1)),
    )
  }, [itemCount])

  const onFocusRef = useRef(onFocus)
  onFocusRef.current = onFocus
  useEffect(() => {
    if (itemCount > 0) onFocusRef.current?.(focusedIndex)
  }, [focusedIndex, itemCount])

  if (itemCount === 0) {
    return (
      <Box ref={ref} flexDirection="column" tabIndex={0}>
        {emptyMessage && <Text dimColor>{emptyMessage}</Text>}
      </Box>
    )
  }

  const effectiveOverflowHint =
    overflowHint === 'glyph' && visibleCount === 1 ? 'count' : overflowHint
  const windowStart = clamp(
    focusedIndex - visibleCount + 1,
    0,
    Math.max(0, itemCount - visibleCount),
  )
  const visibleItems = items.slice(windowStart, windowStart + visibleCount)
  const hiddenAbove = windowStart
  const hiddenBelow = itemCount - (windowStart + visibleItems.length)

  return (
    <Box
      ref={ref}
      flexDirection="column"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {effectiveOverflowHint === 'count' && hiddenAbove > 0 && (
        <Box paddingLeft={2}>
          <Text dimColor>
            {figures.arrowUp} {hiddenAbove} more above
          </Text>
        </Box>
      )}
      {visibleItems.map((item, visibleIndex) => {
        const index = windowStart + visibleIndex
        const isFocused = index === focusedIndex
        const atUpperEdge = visibleIndex === 0 && hiddenAbove > 0
        const atLowerEdge =
          visibleIndex === visibleItems.length - 1 && hiddenBelow > 0
        return (
          <SelectItemFocusContext.Provider
            key={isValidElement(item) ? (item.key ?? index) : index}
            value={isFocused}
          >
            <ListItem
              isFocused={isFocused}
              showScrollUp={
                effectiveOverflowHint === 'glyph' && atUpperEdge
              }
              showScrollDown={
                effectiveOverflowHint === 'glyph' && atLowerEdge
              }
              styled={false}
            >
              {item}
            </ListItem>
          </SelectItemFocusContext.Provider>
        )
      })}
      {effectiveOverflowHint === 'count' && hiddenBelow > 0 && (
        <Box paddingLeft={2}>
          <Text dimColor>
            {figures.arrowDown} {hiddenBelow} more below
          </Text>
        </Box>
      )}
    </Box>
  )
}

function SelectItem({ children }: SelectItemProps): React.ReactNode {
  return <>{children}</>
}

export const Select = Object.assign(SelectRoot, { Item: SelectItem })
