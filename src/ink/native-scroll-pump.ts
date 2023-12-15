import { isSynchronizedOutputSupported } from './terminal.js'
import {
  CURSOR_HOME,
  ERASE_LINE,
  ERASE_SCREEN,
  ERASE_SCROLLBACK,
  RESET_SCROLL_REGION,
  cursorPosition,
  setScrollRegion,
} from './termio/csi.js'
import { BSU, ESU, HIDE_CURSOR, SHOW_CURSOR } from './termio/dec.js'

const RESET_STYLE = '\x1b[0m'
const ERASE_TO_END_OF_LINE = '\x1b[K'
const PUMP_BATCH_SIZE = 100
export const NATIVE_HISTORY_LIMIT = 10_000
export const MIN_BOTTOM_ROWS = 4

type WritableOutput = {
  write(chunk: string): unknown
}

export type NativeViewport = {
  lines: string[]
  scrollTop: number
  scrollHeight: number
  transcriptEnd: number
}

export type NativeFrameLayout = {
  contentHeight: number
  bottomTop: number
  bottomLines: string[]
  overlayLines: string[]
}

/**
 * Main-screen renderer that keeps the transcript in native terminal
 * scrollback while reserving a DECSTBM region for the live viewport/footer.
 */
export class NativeScrollPump {
  private buf = ''
  private lastFrame = ''
  private syncOpen = false
  private suspended = false
  private restored = false
  private tailSlack = 0
  private contentOverlayRows = 0
  private overlayRatchet = 0
  private readonly onScreen: string[] = []
  private replayPending = false
  private committedTop = 0
  private readonly nativeHistory: string[] = []
  private pumpCursor = -1
  private backfillNeeded = false
  private gapRange: { from: number; to: number } | null = null
  private suspendedCols = 0
  private suspendedRows = 0
  contentHeight: number

  constructor(
    private readonly out: WritableOutput,
    public cols: number,
    public rows: number,
  ) {
    this.contentHeight = Math.max(2, rows - MIN_BOTTOM_ROWS)
  }

  setup(): void {
    this.resetTransientState()
    this.buf += HIDE_CURSOR
    this.buf += '\n'.repeat(this.rows - this.contentHeight)
    this.buf += setScrollRegion(1, Math.max(2, this.contentHeight))
    for (let row = this.contentHeight; row < this.rows; row++) {
      this.clearLine(row)
    }
    this.commitImmediate()
  }

  suspend(): void {
    this.suspended = true
    this.suspendedCols = this.cols
    this.suspendedRows = this.rows
    this.buf += RESET_SCROLL_REGION
    this.commitImmediate()
  }

  resume(cols: number, rows: number): void {
    this.suspended = false
    const resized =
      cols !== this.suspendedCols || rows !== this.suspendedRows
    this.cols = cols
    this.rows = rows
    this.contentHeight = Math.max(2, rows - MIN_BOTTOM_ROWS)
    this.buf += HIDE_CURSOR
    this.buf += setScrollRegion(1, this.contentHeight)
    this.buf += CURSOR_HOME
    if (resized) {
      this.buf += ERASE_SCREEN + ERASE_SCROLLBACK + CURSOR_HOME
      this.resetTransientState()
      this.replayPending = true
      this.pumpCursor = this.nativeHistory.length > 0 ? 0 : -1
      this.lastFrame = ''
    }
    this.commitImmediate()
  }

  restore(): void {
    if (this.restored) return
    this.restored = true
    this.buf += RESET_STYLE
    for (let row = this.contentHeight; row < this.rows; row++) {
      this.clearLine(row)
    }
    this.buf += RESET_SCROLL_REGION
    this.buf += cursorPosition(this.contentHeight + 1, 1)
    this.buf += SHOW_CURSOR
    this.commitImmediate()
  }

  syncViewport(viewport: NativeViewport, contentHeight: number): void {
    if (this.suspended) return
    if (this.pumpCursor >= 0) return

    if (!this.syncOpen && isSynchronizedOutputSupported()) {
      this.buf += BSU
      this.syncOpen = true
    }
    this.restoreUnderContentOverlay()

    if (this.replayPending) {
      this.replayPending = false
      this.committedTop = Math.min(
        viewport.scrollTop,
        viewport.transcriptEnd,
      )
    }

    const targetTop = Math.min(viewport.scrollTop, viewport.transcriptEnd)
    const advancedRows = Math.max(0, targetTop - this.committedTop)
    if (advancedRows > 0) {
      const availableRows = Math.min(advancedRows, this.onScreen.length)
      if (availableRows > 0) {
        this.buf += cursorPosition(this.contentHeight, 1)
        this.buf += '\n'.repeat(availableRows)
        for (let row = 0; row < availableRows; row++) {
          this.nativeHistory.push(this.onScreen.shift()!)
        }
        if (this.nativeHistory.length > NATIVE_HISTORY_LIMIT) {
          this.nativeHistory.splice(
            0,
            this.nativeHistory.length - NATIVE_HISTORY_LIMIT,
          )
        }
      }
      const gapStart = this.committedTop + availableRows
      this.committedTop = targetTop
      if (gapStart < targetTop) {
        this.gapRange = { from: gapStart, to: targetTop }
      }
      if (this.nativeHistory.length === 0 && targetTop > 0) {
        this.backfillNeeded = true
      }
    }

    if (contentHeight !== this.contentHeight) {
      this.contentHeight = contentHeight
      this.buf += setScrollRegion(1, Math.max(2, contentHeight))
    }

    const leadingRows = Math.max(0, this.committedTop - viewport.scrollTop)
    const height = this.contentHeight
    const visibleCount = Math.min(viewport.lines.length, height)
    const populatedCount = Math.max(0, visibleCount - leadingRows)
    const appendedCount = Math.max(0, height - this.onScreen.length)

    if (this.onScreen.length > height) this.onScreen.length = height
    while (this.onScreen.length < height) this.onScreen.push('')

    for (let row = 0; row < height; row++) {
      const line =
        row < populatedCount ? viewport.lines[leadingRows + row]! : ''
      if (
        row < height - appendedCount &&
        this.onScreen[row] === line
      ) {
        continue
      }
      this.buf +=
        cursorPosition(row + 1, 1) +
        line +
        RESET_STYLE +
        ERASE_TO_END_OF_LINE
      this.onScreen[row] = line
    }
    this.tailSlack = Math.max(0, height - populatedCount)
  }

  draw(layout: NativeFrameLayout): void {
    if (this.suspended) return
    const hadOpenSync = this.syncOpen
    if (!this.syncOpen && isSynchronizedOutputSupported()) this.buf += BSU
    const frameStart = this.buf.length

    this.buf += HIDE_CURSOR
    this.restoreUnderContentOverlay()
    if (layout.contentHeight !== this.contentHeight) {
      this.contentHeight = layout.contentHeight
      this.buf += setScrollRegion(
        1,
        Math.max(2, layout.contentHeight),
      )
    }

    for (let row = this.contentHeight; row < this.rows; row++) {
      this.clearLine(row)
    }
    if (this.tailSlack > 0) {
      const start = this.contentHeight - this.tailSlack
      for (let row = start; row < this.contentHeight; row++) {
        this.clearLine(row)
      }
    }

    this.writeOverlayLines(layout.bottomTop, layout.bottomLines)
    const overlayRows = layout.overlayLines.length
    if (overlayRows > 0) {
      this.overlayRatchet = Math.max(this.overlayRatchet, overlayRows)
      const top = Math.max(0, this.rows - this.overlayRatchet)
      this.writeOverlayLines(top, layout.overlayLines)
      for (let row = top + overlayRows; row < this.rows; row++) {
        this.clearLine(row)
      }
      this.contentOverlayRows = Math.max(
        0,
        this.contentHeight - Math.max(0, top - 1),
      )
    } else {
      this.overlayRatchet = 0
      this.contentOverlayRows = 0
    }

    const nextFrame = this.buf.slice(frameStart)
    if (!hadOpenSync && nextFrame === this.lastFrame) {
      this.buf = ''
      this.syncOpen = false
      return
    }
    this.lastFrame = nextFrame
    if (isSynchronizedOutputSupported()) this.buf += ESU
    this.syncOpen = false
    this.commitImmediate()
  }

  computeLayout(
    bottomLines: string[],
    overlayLines: string[],
  ): NativeFrameLayout {
    const reservedRows = Math.max(MIN_BOTTOM_ROWS, bottomLines.length)
    return {
      contentHeight: Math.max(2, this.rows - reservedRows),
      bottomTop: this.rows - reservedRows,
      bottomLines,
      overlayLines,
    }
  }

  handleResize(cols: number, rows: number): 'noop' | 'replay' | 'adjust' {
    if (cols === this.cols && rows === this.rows) return 'noop'
    if (this.suspended) {
      this.cols = cols
      this.rows = rows
      return 'noop'
    }

    const widthChanged = cols !== this.cols
    const previousRows = this.rows
    this.cols = cols
    this.rows = rows
    const contentHeight = Math.max(2, rows - MIN_BOTTOM_ROWS)
    this.contentHeight = contentHeight

    if (widthChanged || rows < previousRows) {
      this.buf +=
        RESET_SCROLL_REGION +
        ERASE_SCREEN +
        ERASE_SCROLLBACK +
        CURSOR_HOME
      this.buf += setScrollRegion(1, Math.max(2, contentHeight))
      this.resetTransientState()
      this.replayPending = true
      this.pumpCursor = this.nativeHistory.length > 0 ? 0 : -1
      this.lastFrame = ''
      this.commitImmediate()
      return 'replay'
    }

    this.buf += setScrollRegion(1, Math.max(2, contentHeight))
    this.lastFrame = ''
    this.commitImmediate()
    return 'adjust'
  }

  tickPump(): boolean {
    if (this.pumpCursor < 0) return false
    const history = this.nativeHistory
    this.buf += setScrollRegion(1, 2)
    const end = Math.min(this.pumpCursor + PUMP_BATCH_SIZE, history.length)
    for (; this.pumpCursor < end; this.pumpCursor++) {
      this.buf +=
        cursorPosition(1, 1) +
        history[this.pumpCursor] +
        RESET_STYLE +
        ERASE_TO_END_OF_LINE
      this.buf += cursorPosition(2, 1) + '\n'
    }
    this.buf += setScrollRegion(1, Math.max(2, this.contentHeight))
    this.lastFrame = ''
    this.commitImmediate()
    if (this.pumpCursor >= history.length) this.pumpCursor = -1
    return this.pumpCursor >= 0
  }

  consumeBackfillNeeded(): boolean {
    if (!this.backfillNeeded) return false
    this.backfillNeeded = false
    return true
  }

  consumeGapRange(): { from: number; to: number } | null {
    const range = this.gapRange
    this.gapRange = null
    return range
  }

  primeBackfill(lines: string[]): void {
    if (lines.length === 0) return
    const previousLength = this.nativeHistory.length
    for (const line of lines) this.nativeHistory.push(line)
    if (this.nativeHistory.length > NATIVE_HISTORY_LIMIT) {
      const removed = this.nativeHistory.length - NATIVE_HISTORY_LIMIT
      this.nativeHistory.splice(0, removed)
      this.pumpCursor = Math.max(0, previousLength - removed)
    } else {
      this.pumpCursor = previousLength
    }
    this.replayPending = true
    if (previousLength > 0) this.onScreen.length = 0
  }

  switchTranscript(): void {
    this.buf += RESET_SCROLL_REGION + ERASE_SCREEN + ERASE_SCROLLBACK
    this.buf += CURSOR_HOME
    this.buf += setScrollRegion(1, Math.max(2, this.contentHeight))
    this.resetTransientState()
    this.nativeHistory.length = 0
    this.pumpCursor = -1
    this.replayPending = true
    this.lastFrame = ''
    this.commitImmediate()
  }

  private restoreUnderContentOverlay(): void {
    const rows = this.contentOverlayRows
    if (rows === 0) return
    this.contentOverlayRows = 0
    const contentHeight = this.contentHeight
    const visibleCount = this.onScreen.length
    for (let offset = 0; offset < rows; offset++) {
      const row = contentHeight - 1 - offset
      if (row < 0) break
      this.buf += cursorPosition(row + 1, 1) + ERASE_LINE
      const visibleRow = visibleCount - 1 - offset
      if (visibleRow >= 0) {
        this.buf += this.onScreen[visibleRow] + RESET_STYLE
      }
    }
  }

  private resetTransientState(): void {
    this.tailSlack = 0
    this.contentOverlayRows = 0
    this.overlayRatchet = 0
    this.onScreen.length = 0
    this.committedTop = 0
  }

  private clearLine(row: number): void {
    this.buf += cursorPosition(row + 1, 1) + ERASE_LINE
  }

  private writeOverlayLines(top: number, lines: string[]): void {
    for (let row = 0; row < lines.length; row++) {
      this.buf +=
        cursorPosition(top + row + 1, 1) +
        lines[row] +
        RESET_STYLE +
        ERASE_TO_END_OF_LINE
    }
  }

  private commitImmediate(): void {
    if (this.buf.length === 0) return
    this.out.write(this.buf)
    this.buf = ''
  }

  _onScreen(): string[] {
    return this.onScreen
  }

  _committedTop(): number {
    return this.committedTop
  }

  _pumpCursor(): number {
    return this.pumpCursor
  }

  _nativeHistory(): string[] {
    return this.nativeHistory
  }

  _commitForTest(): void {
    this.commitImmediate()
  }

  _transient(): { tailSlack: number; overlayRows: number } {
    return {
      tailSlack: this.tailSlack,
      overlayRows: this.contentOverlayRows,
    }
  }
}
