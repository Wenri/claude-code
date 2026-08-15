import { basename } from 'path'
import React from 'react'
import { useDebounceCallback } from 'usehooks-ts'
import { KeyboardEvent } from '../ink/events/keyboard-event.js'
import type { PasteEvent } from '../ink/events/paste-event.js'
import {
  getImageFromClipboard,
  isImageFilePath,
  PASTE_THRESHOLD,
  tryReadImageFromPath,
} from '../utils/imagePaste.js'
import { getCurrentImageLimits } from '../utils/imageLimits.js'
import type { ImageDimensions } from '../utils/imageResizer.js'
import { logError } from '../utils/log.js'
import { getPlatform } from '../utils/platform.js'

const CLIPBOARD_CHECK_DEBOUNCE_MS = 50

type PasteHandlerProps = {
  onPaste?: (text: string) => void
  handleKeyDown: (event: KeyboardEvent) => void
  onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
}

function createSyntheticKeyboardEvent(
  sequence: string,
  name: string | undefined,
  isPasted: boolean,
): KeyboardEvent {
  return new KeyboardEvent({
    kind: 'key',
    name,
    sequence,
    raw: sequence,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
    fn: false,
    isPasted,
  })
}

export function usePasteHandler({
  onPaste,
  handleKeyDown: nextHandleKeyDown,
  onImagePaste,
}: PasteHandlerProps): {
  handleKeyDown: (event: KeyboardEvent) => void
  handlePaste: (event: PasteEvent) => void
  isPasting: boolean
} {
  const [isPasting, setIsPasting] = React.useState(false)
  const isMountedRef = React.useRef(true)
  const pasteInProgressRef = React.useRef(false)
  const pendingReturnRef = React.useRef(false)
  const handleKeyDownRef = React.useRef(nextHandleKeyDown)
  handleKeyDownRef.current = nextHandleKeyDown
  const isMacOS = React.useMemo(() => getPlatform() === 'macos', [])

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const checkClipboardForImageImpl = React.useCallback(() => {
    if (!onImagePaste || !isMountedRef.current) return
    void getImageFromClipboard(getCurrentImageLimits())
      .then(imageData => {
        if (imageData && isMountedRef.current) {
          onImagePaste(
            imageData.base64,
            imageData.mediaType,
            undefined,
            imageData.dimensions,
          )
        }
      })
      .catch(error => {
        if (isMountedRef.current) logError(error as Error)
      })
      .finally(() => {
        if (isMountedRef.current) {
          pasteInProgressRef.current = false
          pendingReturnRef.current = false
          setIsPasting(false)
        }
      })
  }, [onImagePaste])

  const checkClipboardForImage = useDebounceCallback(
    checkClipboardForImageImpl,
    CLIPBOARD_CHECK_DEBOUNCE_MS,
  )

  function dispatchPaste(text: string): void {
    if (onPaste) {
      onPaste(text)
      return
    }
    nextHandleKeyDown(createSyntheticKeyboardEvent(text, undefined, false))
  }

  function finishPaste(): void {
    setIsPasting(false)
    setTimeout(
      (
        mounted: typeof isMountedRef,
        inProgress: typeof pasteInProgressRef,
        pendingReturn: typeof pendingReturnRef,
        handler: typeof handleKeyDownRef,
      ) => {
        if (!mounted.current) return
        inProgress.current = false
        if (pendingReturn.current) {
          pendingReturn.current = false
          handler.current(createSyntheticKeyboardEvent('\r', 'return', true))
        }
      },
      0,
      isMountedRef,
      pasteInProgressRef,
      pendingReturnRef,
      handleKeyDownRef,
    )
  }

  function processPaste(text: string): void {
    pasteInProgressRef.current = true
    const pastedText = text.replace(/\[I$/, '').replace(/\[O$/, '')

    if (pastedText.length === 0 && isMacOS && onImagePaste) {
      checkClipboardForImage()
      return
    }

    const lines = pastedText
      .split(/ (?=\/|[A-Za-z]:\\)/)
      .flatMap(part => part.split('\n'))
      .filter(line => line.trim())
    const imagePaths = lines.filter(line => isImageFilePath(line))

    if (onImagePaste && imagePaths.length > 0) {
      const imageLimits = getCurrentImageLimits()
      const isTempScreenshot =
        /\/TemporaryItems\/.*screencaptureui.*\/Screenshot/i.test(pastedText)
      void Promise.all(
        imagePaths.map(path => tryReadImageFromPath(path, imageLimits)),
      ).then(results => {
        if (!isMountedRef.current) return
        const validImages = results.filter(
          (result): result is NonNullable<typeof result> => result !== null,
        )
        if (validImages.length > 0) {
          for (const imageData of validImages) {
            onImagePaste(
              imageData.base64,
              imageData.mediaType,
              basename(imageData.path),
              imageData.dimensions,
              imageData.path,
            )
          }
          const nonImageLines = lines.filter(line => !isImageFilePath(line))
          if (nonImageLines.length > 0) {
            dispatchPaste(nonImageLines.join('\n'))
          }
          pasteInProgressRef.current = false
          pendingReturnRef.current = false
          setIsPasting(false)
        } else if (isTempScreenshot && isMacOS) {
          checkClipboardForImage()
        } else {
          dispatchPaste(pastedText)
          pasteInProgressRef.current = false
          pendingReturnRef.current = false
          setIsPasting(false)
        }
      })
      return
    }

    dispatchPaste(pastedText)
    finishPaste()
  }

  function handlePaste(event: PasteEvent): void {
    event.preventDefault()
    setIsPasting(true)
    processPaste(event.text)
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (pasteInProgressRef.current && event.key === 'return') {
      event.preventDefault()
      pendingReturnRef.current = true
      return
    }
    if (
      (onPaste || onImagePaste) &&
      !event.ctrl &&
      !event.meta &&
      event.key.length > PASTE_THRESHOLD &&
      !event.defaultPrevented
    ) {
      event.preventDefault()
      setIsPasting(true)
      processPaste(event.key)
      return
    }
    nextHandleKeyDown(event)
  }

  return { handleKeyDown, handlePaste, isPasting }
}
