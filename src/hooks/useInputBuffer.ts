import { useCallback, useRef, useState } from 'react'
import type { PastedContent } from '../utils/config.js'

export type BufferEntry = {
  text: string
  cursorOffset: number
  pastedContents: Record<number, PastedContent>
  timestamp: number
}

export type UseInputBufferProps = {
  maxBufferSize: number
  debounceMs: number
}

export type UseInputBufferResult = {
  pushToBuffer: (
    text: string,
    cursorOffset: number,
    pastedContents?: Record<number, PastedContent>,
  ) => void
  undo: () => BufferEntry | undefined
  canUndo: boolean
  clearBuffer: () => void
}

export function useInputBuffer({
  maxBufferSize,
  debounceMs,
}: UseInputBufferProps): UseInputBufferResult {
  const [buffer, setBuffer] = useState<BufferEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const lastPushTime = useRef<number>(0)
  const pendingPush = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushToBuffer = useCallback(
    (
      text: string,
      cursorOffset: number,
      pastedContents: Record<number, PastedContent> = {},
    ) => {
      const now = Date.now()

      // Clear any pending push
      if (pendingPush.current) {
        clearTimeout(pendingPush.current)
        pendingPush.current = null
      }

      // Debounce rapid changes
      if (now - lastPushTime.current < debounceMs) {
        pendingPush.current = setTimeout(
          pushToBuffer,
          debounceMs,
          text,
          cursorOffset,
          pastedContents,
        )
        return
      }

      lastPushTime.current = now

      // The current entry is the last state returned by undo. Avoid appending
      // the same text again before the state update below has rendered.
      if (buffer[currentIndex]?.text === text) return

      setBuffer(prevBuffer => {
        const next = [
          ...prevBuffer.slice(0, currentIndex + 1),
          { text, cursorOffset, pastedContents, timestamp: now },
        ]
        return next.length > maxBufferSize
          ? next.slice(-maxBufferSize)
          : next
      })

      // Update current index to point to the new entry
      setCurrentIndex(prev => Math.min(prev + 1, maxBufferSize - 1))
    },
    [debounceMs, maxBufferSize, currentIndex, buffer.length],
  )

  const undo = useCallback((): BufferEntry | undefined => {
    // A debounced push represents text that has not entered history yet. Undo
    // cancels it before observing the current history slot.
    if (pendingPush.current) {
      clearTimeout(pendingPush.current)
      pendingPush.current = null
    }

    const entry = buffer[currentIndex]
    if (!entry) return undefined
    setCurrentIndex(currentIndex - 1)
    return entry
  }, [buffer, currentIndex])

  const clearBuffer = useCallback(() => {
    setBuffer([])
    setCurrentIndex(-1)
    lastPushTime.current = 0
    if (pendingPush.current) {
      clearTimeout(pendingPush.current)
      pendingPush.current = null
    }
  }, [lastPushTime, pendingPush])

  const canUndo = currentIndex >= 0 && buffer[currentIndex] !== undefined

  return {
    pushToBuffer,
    undo,
    canUndo,
    clearBuffer,
  }
}
