import { useModalOrTerminalSize } from '../../context/modalContext.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'

const RESERVED_TERMINAL_ROWS = 8

export type SelectLayout = 'expanded' | 'compact' | 'compact-vertical'

/**
 * Cap a selection menu to the rows available in the current terminal/modal.
 * Different layouts consume a different number of rows per option.
 */
export function useVisibleOptionCount(
  requestedCount: number,
  layout: SelectLayout = 'compact',
): number {
  const { rows } = useModalOrTerminalSize(useTerminalSize())
  const rowsPerOption =
    layout === 'expanded' ? 3 : layout === 'compact' ? 1 : 2
  const availableCount = Math.max(
    1,
    Math.floor((rows - RESERVED_TERMINAL_ROWS) / rowsPerOption),
  )
  return Math.min(requestedCount, availableCount)
}
