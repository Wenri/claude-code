import React from 'react'
import { renderPlaceholder } from '../hooks/renderPlaceholder.js'
import { usePasteHandler } from '../hooks/usePasteHandler.js'
import type { DOMElement } from '../ink/dom.js'
import { useAutoFocus } from '../ink/hooks/use-auto-focus.js'
import { useDeclaredCursor } from '../ink/hooks/use-declared-cursor.js'
import { Ansi, Box, Text } from '../ink.js'
import type {
  BaseInputState,
  BaseTextInputProps,
} from '../types/textInputTypes.js'
import type { TextHighlight } from '../utils/textHighlighting.js'
import { HighlightedInput } from './PromptInput/ShimmeredInput.js'

type BaseTextInputComponentProps = BaseTextInputProps & {
  inputState: BaseInputState
  children?: React.ReactNode
  terminalFocus: boolean
  highlights?: TextHighlight[]
  invert?: (text: string) => string
  hidePlaceholderText?: boolean
}

/** A focused DOM input surface plus the shared text renderer. */
export function BaseTextInput({
  inputState,
  children,
  terminalFocus,
  invert,
  hidePlaceholderText,
  ...props
}: BaseTextInputComponentProps): React.ReactNode {
  const { handleKeyDown, renderedValue, cursorLine, cursorColumn } = inputState
  const cursorRef = useDeclaredCursor({
    line: cursorLine,
    column: cursorColumn,
    active: Boolean(props.focus && props.showCursor && terminalFocus),
  })
  const inputRef = React.useRef<DOMElement | null>(null)
  const combinedRef = React.useCallback(
    (element: DOMElement | null) => {
      inputRef.current = element
      cursorRef(element)
    },
    [cursorRef],
  )

  const {
    handleKeyDown: wrappedHandleKeyDown,
    handlePaste,
    isPasting,
  } = usePasteHandler({
    onPaste: props.onPaste,
    handleKeyDown: event => {
      props.onKeyDownBefore?.(event)
      if (event.defaultPrevented || event.didStopImmediatePropagation()) return
      handleKeyDown(event)
    },
    onImagePaste: props.onImagePaste,
  })

  React.useEffect(() => {
    props.onIsPastingChange?.(isPasting)
  }, [isPasting, props.onIsPastingChange])

  const acceptsInput = props.focus !== false
  useAutoFocus(inputRef, acceptsInput)

  const { showPlaceholder, renderedPlaceholder } = renderPlaceholder({
    placeholder: props.placeholder,
    value: props.value,
    showCursor: props.showCursor,
    focus: props.focus,
    terminalFocus,
    invert,
    hidePlaceholderText,
  })

  const inputProps = acceptsInput
    ? {
        tabIndex: 0,
        autoFocus: true,
        onKeyDown: wrappedHandleKeyDown,
        onPaste: handlePaste,
      }
    : {}

  const commandWithoutArgs =
    (props.value && props.value.trim().indexOf(' ') === -1) ||
    (props.value && props.value.endsWith(' '))
  const showArgumentHint = Boolean(
    props.argumentHint &&
      props.value &&
      commandWithoutArgs &&
      props.value.startsWith('/'),
  )
  const cursorFiltered =
    props.showCursor && props.highlights
      ? props.highlights.filter(
          highlight =>
            highlight.dimColor ||
            props.cursorOffset < highlight.start ||
            props.cursorOffset >= highlight.end,
        )
      : props.highlights
  const { viewportCharOffset, viewportCharEnd } = inputState
  const filteredHighlights =
    cursorFiltered && viewportCharOffset > 0
      ? cursorFiltered
          .filter(
            highlight =>
              highlight.end > viewportCharOffset &&
              highlight.start < viewportCharEnd,
          )
          .map(highlight => ({
            ...highlight,
            start: Math.max(0, highlight.start - viewportCharOffset),
            end: highlight.end - viewportCharOffset,
          }))
      : cursorFiltered

  if (filteredHighlights && filteredHighlights.length > 0) {
    return (
      <Box ref={combinedRef} {...inputProps}>
        <HighlightedInput
          text={renderedValue}
          highlights={filteredHighlights}
        />
        {showArgumentHint && (
          <Text dimColor>
            {props.value?.endsWith(' ') ? '' : ' '}
            {props.argumentHint}
          </Text>
        )}
        {children}
      </Box>
    )
  }

  return (
    <Box ref={combinedRef} {...inputProps}>
      <Text wrap="truncate-end" dimColor={props.dimColor}>
        {showPlaceholder && props.placeholderElement ? (
          props.placeholderElement
        ) : showPlaceholder && renderedPlaceholder ? (
          <Ansi>{renderedPlaceholder}</Ansi>
        ) : (
          <Ansi>{renderedValue}</Ansi>
        )}
        {showArgumentHint && (
          <Text dimColor>
            {props.value?.endsWith(' ') ? '' : ' '}
            {props.argumentHint}
          </Text>
        )}
        {children}
      </Text>
    </Box>
  )
}
