import {
  CellWidth,
  cellAtIndex,
  type Screen,
  type StylePool,
} from './screen.js'
import { LINK_END, link } from './termio/osc.js'

const RESET_STYLE = '\x1b[0m'

/** Serialize one packed Screen row, preserving style and OSC-8 transitions. */
export function serializeScreenLine(
  screen: Screen,
  stylePool: StylePool,
  row: number,
): string {
  const width = screen.width
  const offset = row * width
  let lastContentColumn = -1

  for (let column = width - 1; column >= 0; column--) {
    const cell = cellAtIndex(screen, offset + column)
    if (cell.width === CellWidth.SpacerTail) continue
    if (
      cell.char === ' ' &&
      (cell.styleId & 1) === 0 &&
      cell.hyperlink === undefined
    ) {
      continue
    }
    lastContentColumn = column
    break
  }

  if (lastContentColumn < 0) return ''

  let output = ''
  let currentStyle = stylePool.none
  let currentHyperlink: string | undefined
  for (let column = 0; column <= lastContentColumn; column++) {
    const cell = cellAtIndex(screen, offset + column)
    if (
      cell.width === CellWidth.SpacerTail ||
      cell.width === CellWidth.SpacerHead
    ) {
      continue
    }
    if (cell.hyperlink !== currentHyperlink) {
      if (currentHyperlink !== undefined) output += LINK_END
      if (cell.hyperlink !== undefined) output += link(cell.hyperlink)
      currentHyperlink = cell.hyperlink
    }
    output += stylePool.transition(currentStyle, cell.styleId)
    currentStyle = cell.styleId
    output += cell.char
  }

  if (currentHyperlink !== undefined) output += LINK_END
  if (currentStyle !== stylePool.none) output += RESET_STYLE
  return output
}
