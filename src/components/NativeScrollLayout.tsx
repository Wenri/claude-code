import React, {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import ScrollBox, {
  type ScrollBoxHandle,
} from '../ink/components/ScrollBox.js'
import type { DOMElement } from '../ink/dom.js'
import type { Frame } from '../ink/frame.js'
import instances from '../ink/instances.js'
import {
  MIN_BOTTOM_ROWS,
  NATIVE_HISTORY_LIMIT,
  NativeScrollPump,
} from '../ink/native-scroll-pump.js'
import { nodeCache } from '../ink/node-cache.js'
import Output from '../ink/output.js'
import renderNodeToOutput, {
  dropSubtreeCache,
  resetLayoutShifted,
} from '../ink/render-node-to-output.js'
import {
  createScreen,
  type StylePool,
} from '../ink/screen.js'
import { serializeScreenLine } from '../ink/serialize-screen-line.js'
import { Box } from '../ink.js'

const TranscriptEndRefContext =
  createContext<RefObject<DOMElement | null> | null>(null)

/**
 * Optional zero-height marker used to distinguish committed transcript rows
 * from temporary content rendered later in the scroll tree.
 */
export function useNativeScrollTranscriptEndMarker(): ReactNode {
  const providedRef = useContext(TranscriptEndRefContext)
  const localRef = useRef<DOMElement>(null)
  const ref = providedRef ?? localRef
  return <Box ref={ref} height={0} />
}

type Props = {
  scrollable: ReactNode
  bottom: ReactNode
  pushUp?: ReactNode
  overlay?: ReactNode
  scrollRef?: RefObject<ScrollBoxHandle | null>
}

/** Main-screen layout backed by NativeScrollPump's DECSTBM frame sink. */
export function NativeScrollLayout({
  scrollable,
  bottom,
  pushUp,
  overlay,
  scrollRef,
}: Props): ReactNode {
  const { columns, rows } = useTerminalSize()
  const pumpRef = useRef<NativeScrollPump | null>(null)
  const bottomRef = useRef<DOMElement>(null)
  const overlayRef = useRef<DOMElement>(null)
  const transcriptEndRef = useRef<DOMElement>(null)
  const fallbackScrollRef = useRef<ScrollBoxHandle>(null)
  const activeScrollRef = scrollRef ?? fallbackScrollRef

  useInsertionEffect(() => {
    const ink = instances.get(process.stdout)
    if (!ink) return

    const pump = new NativeScrollPump(process.stdout, columns, rows)
    pump.setup()
    pumpRef.current = pump
    let suspendedForAltScreen = false

    ink.frameSink = (frame, stylePool) => {
      const currentPump = pumpRef.current
      if (!currentPump) return false

      if (ink.isAltScreenActive) {
        if (!suspendedForAltScreen) {
          currentPump.suspend()
          suspendedForAltScreen = true
        }
        return false
      }
      if (suspendedForAltScreen) {
        suspendedForAltScreen = false
        currentPump.resume(currentPump.cols, currentPump.rows)
      }

      const pumpPending = currentPump.tickPump()
      const bottomLines = frameLines(frame, stylePool, bottomRef.current)
      const overlayLines = frameLines(frame, stylePool, overlayRef.current)
      const layout = currentPump.computeLayout(bottomLines, overlayLines)
      const scrollElement = activeScrollRef.current?.getDomElement() ?? null

      if (scrollElement) {
        const bounds = nodeCache.get(scrollElement)
        const lines: string[] = []
        if (bounds && bounds.height > 0) {
          const end = Math.min(
            bounds.y + bounds.height,
            frame.screen.height,
          )
          for (let row = bounds.y; row < end; row++) {
            lines.push(serializeScreenLine(frame.screen, stylePool, row))
          }
        }
        const scrollHeight = scrollElement.scrollHeight ?? 0
        const transcriptEnd =
          relativeTop(transcriptEndRef.current, scrollElement) ?? scrollHeight
        currentPump.syncViewport(
          {
            lines,
            scrollTop: scrollElement.scrollTop ?? 0,
            scrollHeight,
            transcriptEnd,
          },
          layout.contentHeight,
        )
      }

      let primedBackfill = false
      if (scrollElement) {
        const gap = currentPump.consumeGapRange()
        const needsBackfill = currentPump.consumeBackfillNeeded()
        if (gap || needsBackfill) {
          const from = gap ? gap.from : 0
          const to = gap ? gap.to : scrollElement.scrollTop ?? 0
          const lines = renderBackfillLines(
            scrollElement,
            from,
            to,
            currentPump.cols,
            ink.getStylePool(),
          )
          if (lines.length > 0) {
            currentPump.primeBackfill(lines)
            primedBackfill = true
          }
        }
      }

      currentPump.draw(layout)
      return pumpPending || primedBackfill ? 'tick' : true
    }

    return () => {
      ink.frameSink = null
      pump.restore()
      pumpRef.current = null
    }
  }, [])

  const dimensionsRef = useRef({ columns, rows })
  useLayoutEffect(() => {
    if (
      columns === dimensionsRef.current.columns &&
      rows === dimensionsRef.current.rows
    ) {
      return
    }
    dimensionsRef.current = { columns, rows }
    pumpRef.current?.handleResize(columns, rows)
  }, [columns, rows])

  return (
    <Box
      flexDirection="column"
      height={rows}
      width="100%"
      flexShrink={0}
    >
      <ScrollBox
        ref={handle => {
          activeScrollRef.current = handle
        }}
        flexGrow={1}
        flexDirection="column"
        stickyScroll={true}
      >
        <TranscriptEndRefContext.Provider value={transcriptEndRef}>
          {scrollable}
        </TranscriptEndRefContext.Provider>
      </ScrollBox>
      <Box
        ref={bottomRef}
        flexDirection="column"
        flexShrink={0}
        minHeight={MIN_BOTTOM_ROWS}
        maxHeight={rows - 2}
      >
        {pushUp}
        {bottom}
      </Box>
      {overlay != null ? (
        <Box
          ref={overlayRef}
          flexDirection="column"
          flexShrink={0}
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          opaque={true}
        >
          {overlay}
        </Box>
      ) : null}
    </Box>
  )
}

function relativeTop(
  marker: DOMElement | null,
  scrollElement: DOMElement,
): number | undefined {
  if (!marker) return undefined
  let top = 0
  let current: DOMElement | undefined = marker
  while (current && current.parentNode !== scrollElement) {
    top += current.yogaNode?.getComputedTop() ?? 0
    current = current.parentNode
  }
  return current ? top : undefined
}

function renderBackfillLines(
  scrollElement: DOMElement,
  from: number,
  to: number,
  columns: number,
  stylePool: StylePool,
): string[] {
  const child = scrollElement.childNodes[0]
  if (!child || child.nodeName === '#text') return []
  if ((scrollElement.scrollHeight ?? 0) <= 0 || to <= from) return []

  const ink = instances.get(process.stdout)
  if (!ink) return []
  const end = Math.ceil(to)
  const start = Math.max(
    0,
    Math.floor(from),
    end - NATIVE_HISTORY_LIMIT,
  )
  const height = end - start
  if (height <= 0) return []

  const screen = createScreen(
    columns,
    height,
    stylePool,
    ink.getCharPool(),
    ink.getHyperlinkPool(),
  )
  const output = new Output({
    width: columns,
    height,
    stylePool,
    screen,
  })
  output.clip({ x1: undefined, x2: undefined, y1: 0, y2: height })
  resetLayoutShifted()
  const cached = nodeCache.get(child)
  renderNodeToOutput(child, output, {
    offsetX: 0,
    offsetY: -start,
    prevScreen: undefined,
  })
  output.unclip()
  dropSubtreeCache(child)
  if (cached) nodeCache.set(child, cached)
  const rendered = output.get()
  child.dirty = true

  const lines: string[] = []
  for (let row = 0; row < height; row++) {
    lines.push(serializeScreenLine(rendered, stylePool, row))
  }
  return lines
}

function frameLines(
  frame: Frame,
  stylePool: StylePool,
  element: DOMElement | null,
): string[] {
  if (!element) return []
  const bounds = nodeCache.get(element)
  if (!bounds || bounds.height <= 0) return []

  const lines: string[] = []
  const end = Math.min(bounds.y + bounds.height, frame.screen.height)
  for (let row = Math.max(0, bounds.y); row < end; row++) {
    lines.push(serializeScreenLine(frame.screen, stylePool, row))
  }
  return lines
}
