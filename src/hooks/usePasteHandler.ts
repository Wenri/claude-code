import { basename } from 'path'
import React from 'react'
import { logError } from 'src/utils/log.js'
import { useDebounceCallback } from 'usehooks-ts'
import { KeyboardEvent } from '../ink/events/keyboard-event.js'
import type { PasteEvent } from '../ink/events/paste-event.js'
import {
  getImageFromClipboard,
  isImageFilePath,
  PASTE_THRESHOLD,
  tryReadImageFromPath,
} from '../utils/imagePaste.js'
import type { ImageDimensions } from '../utils/imageResizer.js'
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

export function usePasteHandler({
  onPaste,
  handleKeyDown: textInputHandleKeyDown,
  onImagePaste,
}: PasteHandlerProps): {
  handleKeyDown: (event: KeyboardEvent) => void
  handlePaste: (event: PasteEvent) => void
  isPasting: boolean
} {
  const [isPasting, setIsPasting] = React.useState(false)
  const isMountedRef = React.useRef(true)
  const pasteInFlightRef = React.useRef(false)
  const submitAfterPasteRef = React.useRef(false)
  const handleKeyDownRef = React.useRef(textInputHandleKeyDown)
  handleKeyDownRef.current = textInputHandleKeyDown

  const isMacOS = React.useMemo(() => getPlatform() === 'macos', [])

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const checkClipboardForImageImpl = React.useCallback(() => {
    if (!onImagePaste || !isMountedRef.current) return

    void getImageFromClipboard()
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
          pasteInFlightRef.current = false
          submitAfterPasteRef.current = false
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
    textInputHandleKeyDown(
      new KeyboardEvent({
        kind: 'key',
        name: undefined,
        sequence: text,
        raw: text,
        ctrl: false,
        meta: false,
        shift: false,
        option: false,
        super: false,
        fn: false,
        isPasted: true,
      }),
    )
  }

  function finishPaste(): void {
    setIsPasting(false)
    setTimeout(
      (mountedRef, inFlightRef, submitRef, keyDownRef) => {
        if (!mountedRef.current) return
        inFlightRef.current = false
        if (submitRef.current) {
          submitRef.current = false
          keyDownRef.current(
            new KeyboardEvent({
              kind: 'key',
              name: 'return',
              sequence: '\r',
              raw: '\r',
              ctrl: false,
              meta: false,
              shift: false,
              option: false,
              super: false,
              fn: false,
              isPasted: true,
            }),
          )
        }
      },
      0,
      isMountedRef,
      pasteInFlightRef,
      submitAfterPasteRef,
      handleKeyDownRef,
    )
  }

  function resetPaste(): void {
    pasteInFlightRef.current = false
    submitAfterPasteRef.current = false
    setIsPasting(false)
  }

  function processPaste(text: string): void {
    pasteInFlightRef.current = true
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
      const isTempScreenshot =
        /\/TemporaryItems\/.*screencaptureui.*\/Screenshot/i.test(pastedText)
      void Promise.all(imagePaths.map(imagePath => tryReadImageFromPath(imagePath)))
        .then(results => {
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
            resetPaste()
          } else if (isTempScreenshot && isMacOS) {
            checkClipboardForImage()
          } else {
            dispatchPaste(pastedText)
            resetPaste()
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
    if (pasteInFlightRef.current && event.key === 'return') {
      event.preventDefault()
      submitAfterPasteRef.current = true
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
    textInputHandleKeyDown(event)
  }

  return { handleKeyDown, handlePaste, isPasting }
}
