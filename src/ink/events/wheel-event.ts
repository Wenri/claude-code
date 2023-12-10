import { TerminalEvent } from './terminal-event.js'

type WheelEventInit = {
  deltaX?: number
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
}

/** A terminal wheel gesture dispatched to the focused terminal element. */
export class WheelEvent extends TerminalEvent {
  readonly deltaY: number
  readonly deltaX: number
  readonly ctrl: boolean
  readonly shift: boolean
  readonly meta: boolean

  constructor(deltaY: number, init: WheelEventInit = {}) {
    super('wheel', { bubbles: true, cancelable: true })
    this.deltaY = deltaY
    this.deltaX = init.deltaX ?? 0
    this.ctrl = init.ctrl ?? false
    this.shift = init.shift ?? false
    this.meta = init.meta ?? false
  }
}
