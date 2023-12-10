import { TerminalEvent } from './terminal-event.js'

/** A bracketed-paste payload dispatched to the focused terminal element. */
export class PasteEvent extends TerminalEvent {
  readonly text: string

  constructor(text: string) {
    super('paste', { bubbles: true, cancelable: true })
    this.text = text
  }
}
