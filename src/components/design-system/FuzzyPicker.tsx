import * as React from 'react'
import { useEffect, useState } from 'react'
import { useSearchInput } from '../../hooks/useSearchInput.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import type { WheelEvent } from '../../ink/events/wheel-event.js'
import { clamp } from '../../ink/layout/geometry.js'
import { Box, Text, useTerminalFocus } from '../../ink.js'
import { SearchBox } from '../SearchBox.js'
import { Byline } from './Byline.js'
import { KeyboardShortcutHint } from './KeyboardShortcutHint.js'
import { ListItem } from './ListItem.js'
import { Pane } from './Pane.js'

type PickerAction<T> = {
  action: string
  handler: (item: T) => void
}

type Props<T> = {
  title: React.ReactNode
  placeholder?: string
  initialQuery?: string
  items: readonly T[]
  getKey: (item: T) => string
  renderItem: (item: T, isFocused: boolean, isMarked: boolean) => React.ReactNode
  renderPreview?: (item: T) => React.ReactNode
  previewPosition?: 'bottom' | 'right'
  visibleCount?: number
  direction?: 'down' | 'up'
  onQueryChange: (query: string) => void
  onSelect: (item: T) => void
  onSelectMany?: (items: T[]) => void
  onTab?: PickerAction<T>
  onShiftTab?: PickerAction<T>
  onFocus?: (item: T | undefined) => void
  onCancel: () => void
  resetKey?: unknown
  emptyMessage?: string | ((query: string) => string)
  matchLabel?: string
  selectAction?: string
  cancelAction?: string
  extraHints?: React.ReactNode
}

const DEFAULT_VISIBLE = 8
const CHROME_ROWS = 10
const MIN_VISIBLE = 2

export function FuzzyPicker<T>({
  title,
  placeholder = 'Type to search…',
  initialQuery,
  items,
  getKey,
  renderItem,
  renderPreview,
  previewPosition = 'bottom',
  visibleCount: requestedVisible = DEFAULT_VISIBLE,
  direction = 'down',
  onQueryChange,
  onSelect,
  onSelectMany,
  onTab,
  onShiftTab,
  onFocus,
  onCancel,
  resetKey,
  emptyMessage = 'No results',
  matchLabel,
  selectAction = 'select',
  cancelAction = 'cancel',
  extraHints,
}: Props<T>): React.ReactNode {
  const isTerminalFocused = useTerminalFocus()
  const { rows, columns } = useTerminalSize()
  const [{ focus: focusedIndex, window: windowStart }, setPosition] = useState({
    focus: 0,
    window: 0,
  })
  const [hovered, setHovered] = useState<T | undefined>(undefined)
  const [marked, setMarked] = useState<Map<string, T>>(new Map())
  const allowsMany = onSelectMany !== undefined
  const hasStatus = Boolean(matchLabel) || allowsMany
  const visibleCount = Math.max(
    MIN_VISIBLE,
    Math.min(requestedVisible, rows - CHROME_ROWS - (hasStatus ? 1 : 0)),
  )
  const compact = columns < 120
  const maxWindowStart = Math.max(0, items.length - visibleCount)

  const step = (delta: number): void => {
    setHovered(undefined)
    setPosition(({ focus, window }) => {
      const nextFocus = clamp(focus + delta, 0, items.length - 1)
      return {
        focus: nextFocus,
        window:
          nextFocus < window
            ? nextFocus
            : nextFocus >= window + visibleCount
              ? nextFocus - visibleCount + 1
              : window,
      }
    })
  }

  const toggleMarked = (item: T | undefined): void => {
    if (item === undefined) return
    const key = getKey(item)
    setMarked(current => {
      const next = new Map(current)
      if (next.has(key)) next.delete(key)
      else next.set(key, item)
      return next
    })
  }

  const scrollWindow = (delta: number): void => {
    setPosition(position => ({
      ...position,
      window: clamp(position.window + delta, 0, maxWindowStart),
    }))
  }

  const handleWheel = (event: WheelEvent): void => {
    if (event.deltaY === 0) return
    const down = event.deltaY > 0
    if (direction === 'up') scrollWindow(down ? -1 : 1)
    else scrollWindow(down ? 1 : -1)
    event.stopImmediatePropagation()
  }

  const { query, cursorOffset, handleKeyDown: handleSearchKeyDown, handlePaste } =
    useSearchInput({
      isActive: true,
      onExit: () => {},
      onCancel,
      initialQuery,
      backspaceExitsOnEmpty: false,
      useLegacyInput: false,
    })

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'up' || (event.ctrl && event.key === 'p')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      step(direction === 'up' ? 1 : -1)
      return
    }
    if (event.key === 'down' || (event.ctrl && event.key === 'n')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      step(direction === 'up' ? -1 : 1)
      return
    }
    if (event.key === 'pageup' || event.key === 'pagedown') {
      event.preventDefault()
      event.stopImmediatePropagation()
      const pageDirection = event.key === 'pagedown' ? 1 : -1
      step((direction === 'up' ? -pageDirection : pageDirection) * visibleCount)
      return
    }
    if (event.key === 'return') {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (allowsMany && marked.size > 0) {
        onSelectMany([...marked.values()])
        return
      }
      const selected = items[focusedIndex]
      if (selected) onSelect(selected)
      return
    }
    if (event.key === 'tab') {
      event.preventDefault()
      event.stopImmediatePropagation()
      const selected = items[focusedIndex]
      if (allowsMany) {
        toggleMarked(selected)
        step(event.shift ? -1 : 1)
        return
      }
      const tabAction = event.shift ? onShiftTab ?? onTab : onTab
      if (tabAction) tabAction.handler(selected as T)
      else if (selected) onSelect(selected)
      return
    }
    handleSearchKeyDown(event)
  }

  useEffect(() => {
    onQueryChange(query)
    setPosition({ focus: 0, window: 0 })
    setHovered(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    setPosition(position => ({
      focus: clamp(position.focus, 0, items.length - 1),
      window: clamp(position.window, 0, maxWindowStart),
    }))
    setHovered(undefined)
  }, [items.length, maxWindowStart])

  useEffect(() => {
    if (resetKey === undefined) return
    setPosition({ focus: 0, window: 0 })
    setHovered(undefined)
  }, [resetKey])

  const keyboardFocused = items[focusedIndex]
  const previewFocused = hovered ?? keyboardFocused
  useEffect(() => {
    onFocus?.(previewFocused)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFocused])

  const visible = items.slice(windowStart, windowStart + visibleCount)
  const handleItemClick = (item: T): void => {
    if (allowsMany && marked.size > 0) toggleMarked(item)
    else onSelect(item)
  }
  const emptyText = typeof emptyMessage === 'function' ? emptyMessage(query) : emptyMessage
  const status = hasStatus ? (
    <Text dimColor>
      {matchLabel}
      {matchLabel && marked.size > 0 ? ' · ' : null}
      {marked.size > 0 ? (
        <Text>
          <Text color="success">{marked.size}</Text> selected
        </Text>
      ) : null}
      {!matchLabel && marked.size === 0 ? ' ' : null}
    </Text>
  ) : null
  const searchBox = (
    <SearchBox
      query={query}
      cursorOffset={cursorOffset}
      placeholder={placeholder}
      isFocused
      isTerminalFocused={isTerminalFocused}
    />
  )
  const listBlock = (
    <List
      visible={visible}
      windowStart={windowStart}
      visibleCount={visibleCount}
      total={items.length}
      focusedIndex={focusedIndex}
      direction={direction}
      getKey={getKey}
      renderItem={renderItem}
      emptyText={emptyText}
      marked={marked}
      onItemClick={handleItemClick}
      onItemHover={setHovered}
    />
  )
  const preview =
    renderPreview && previewFocused ? (
      <Box flexDirection="column" flexGrow={1}>
        {renderPreview(previewFocused)}
      </Box>
    ) : null
  const listGroup =
    renderPreview && previewPosition === 'right' ? (
      <Box flexDirection="row" gap={2} height={visibleCount + (status ? 1 : 0)}>
        <Box flexDirection="column" flexShrink={0}>
          {listBlock}
          {status}
        </Box>
        {preview ?? <Box flexGrow={1} />}
      </Box>
    ) : (
      <Box flexDirection="column">
        {listBlock}
        {status}
        {preview}
      </Box>
    )
  const inputAbove = direction !== 'up'

  return (
    <Pane color="permission">
      <Box
        flexDirection="column"
        tabIndex={0}
        autoFocus
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onWheel={handleWheel}
      >
        <Text bold color="permission">
          {title}
        </Text>
        {inputAbove && searchBox}
        {listGroup}
        {!inputAbove && searchBox}
        <Text dimColor>
          <Byline>
            <KeyboardShortcutHint shortcut="↑/↓" action={compact ? 'nav' : 'navigate'} />
            <KeyboardShortcutHint
              shortcut="Enter"
              action={
                allowsMany && marked.size > 0
                  ? `accept ${marked.size}`
                  : compact
                    ? firstWord(selectAction)
                    : selectAction
              }
            />
            {allowsMany ? (
              <KeyboardShortcutHint shortcut="Tab" action="mark" />
            ) : (
              <>
                {onTab && <KeyboardShortcutHint shortcut="Tab" action={onTab.action} />}
                {onShiftTab && !compact && (
                  <KeyboardShortcutHint shortcut="shift+tab" action={onShiftTab.action} />
                )}
              </>
            )}
            <KeyboardShortcutHint shortcut="Esc" action={cancelAction} />
            {extraHints}
          </Byline>
        </Text>
      </Box>
    </Pane>
  )
}

type ListProps<T> = Pick<
  Props<T>,
  'visibleCount' | 'direction' | 'getKey' | 'renderItem'
> & {
  visible: readonly T[]
  windowStart: number
  total: number
  focusedIndex: number
  emptyText: string
  marked: ReadonlyMap<string, T>
  onItemClick: (item: T) => void
  onItemHover: (item: T | undefined) => void
}

function List<T>({
  visible,
  windowStart,
  visibleCount,
  total,
  focusedIndex,
  direction,
  getKey,
  renderItem,
  emptyText,
  marked,
  onItemClick,
  onItemHover,
}: ListProps<T>): React.ReactNode {
  if (visible.length === 0) {
    return (
      <Box height={visibleCount} flexShrink={0}>
        <Text dimColor>{emptyText}</Text>
      </Box>
    )
  }

  const rows = visible.map((item, index) => {
    const key = getKey(item)
    const actualIndex = windowStart + index
    const isFocused = actualIndex === focusedIndex
    const isMarked = marked.has(key)
    const atLowEdge = index === 0 && windowStart > 0
    const atHighEdge =
      index === visible.length - 1 && windowStart + visibleCount < total
    return (
      <ListItem
        key={key}
        isFocused={isFocused}
        isSelected={isMarked}
        showScrollUp={direction === 'up' ? atHighEdge : atLowEdge}
        showScrollDown={direction === 'up' ? atLowEdge : atHighEdge}
        styled={false}
        onClick={() => onItemClick(item)}
        onHoverChange={isHovered => isHovered && onItemHover(item)}
      >
        {renderItem(item, isFocused, isMarked)}
      </ListItem>
    )
  })

  return (
    <Box
      height={visibleCount}
      flexShrink={0}
      flexDirection={direction === 'up' ? 'column-reverse' : 'column'}
      onMouseLeave={() => onItemHover(undefined)}
    >
      {rows}
    </Box>
  )
}

function firstWord(value: string): string {
  const index = value.indexOf(' ')
  return index === -1 ? value : value.slice(0, index)
}
