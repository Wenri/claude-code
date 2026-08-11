import '../global.d.ts'
import React, { type PropsWithChildren, type Ref } from 'react'
import type { Except } from 'type-fest'
import type { DOMElement } from '../dom.js'
import type { ClickEvent } from '../events/click-event.js'
import type { FocusEvent } from '../events/focus-event.js'
import type { KeyboardEvent } from '../events/keyboard-event.js'
import type { PasteEvent } from '../events/paste-event.js'
import type { WheelEvent } from '../events/wheel-event.js'
import type { Styles } from '../styles.js'
import * as warn from '../warn.js'

export type Props = Except<Styles, 'textWrap'> & {
  ref?: Ref<DOMElement>
  tabIndex?: number
  autoFocus?: boolean
  onClick?: (event: ClickEvent) => void
  onFocus?: (event: FocusEvent) => void
  onFocusCapture?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onBlurCapture?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyDownCapture?: (event: KeyboardEvent) => void
  onPaste?: (event: PasteEvent) => void
  onPasteCapture?: (event: PasteEvent) => void
  onWheel?: (event: WheelEvent) => void
  onWheelCapture?: (event: WheelEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

/** Ink's flexbox layout primitive, with DOM-style input event handlers. */
function Box({
  children,
  flexWrap = 'nowrap',
  flexDirection = 'row',
  flexGrow = 0,
  flexShrink = 1,
  ref,
  tabIndex,
  autoFocus,
  onClick,
  onFocus,
  onFocusCapture,
  onBlur,
  onBlurCapture,
  onMouseEnter,
  onMouseLeave,
  onKeyDown,
  onKeyDownCapture,
  onPaste,
  onPasteCapture,
  onWheel,
  onWheelCapture,
  ...style
}: PropsWithChildren<Props>): React.ReactNode {
  warn.ifNotInteger(style.margin, 'margin')
  warn.ifNotInteger(style.marginX, 'marginX')
  warn.ifNotInteger(style.marginY, 'marginY')
  warn.ifNotInteger(style.marginTop, 'marginTop')
  warn.ifNotInteger(style.marginBottom, 'marginBottom')
  warn.ifNotInteger(style.marginLeft, 'marginLeft')
  warn.ifNotInteger(style.marginRight, 'marginRight')
  warn.ifNotInteger(style.padding, 'padding')
  warn.ifNotInteger(style.paddingX, 'paddingX')
  warn.ifNotInteger(style.paddingY, 'paddingY')
  warn.ifNotInteger(style.paddingTop, 'paddingTop')
  warn.ifNotInteger(style.paddingBottom, 'paddingBottom')
  warn.ifNotInteger(style.paddingLeft, 'paddingLeft')
  warn.ifNotInteger(style.paddingRight, 'paddingRight')
  warn.ifNotInteger(style.gap, 'gap')
  warn.ifNotInteger(style.columnGap, 'columnGap')
  warn.ifNotInteger(style.rowGap, 'rowGap')

  return (
    <ink-box
      ref={ref}
      tabIndex={tabIndex}
      autoFocus={autoFocus}
      onClick={onClick}
      onFocus={onFocus}
      onFocusCapture={onFocusCapture}
      onBlur={onBlur}
      onBlurCapture={onBlurCapture}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={onKeyDown}
      onKeyDownCapture={onKeyDownCapture}
      onPaste={onPaste}
      onPasteCapture={onPasteCapture}
      onWheel={onWheel}
      onWheelCapture={onWheelCapture}
      style={{
        flexWrap,
        flexDirection,
        flexGrow,
        flexShrink,
        ...style,
        overflowX: style.overflowX ?? style.overflow ?? 'visible',
        overflowY: style.overflowY ?? style.overflow ?? 'visible',
      }}
    >
      {children}
    </ink-box>
  )
}

export default Box
