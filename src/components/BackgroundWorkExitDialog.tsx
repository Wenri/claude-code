import React, { useCallback } from 'react'
import { logEvent } from '../services/analytics/index.js'
import { Box, Text } from '../ink.js'
import { useIsInsideModal } from '../context/modalContext.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import { Select } from './CustomSelect/select.js'
import { Dialog } from './design-system/Dialog.js'

export type BackgroundWorkExitItem = {
  label: string
  detail?: string
}

type Props = {
  items: readonly BackgroundWorkExitItem[]
  onExit: () => void
  onCancel: () => void
}

export function BackgroundWorkExitDialog({
  items,
  onExit,
  onCancel,
}: Props): React.ReactNode {
  const recordChoice = useCallback(
    (choseExit: boolean) => {
      logEvent('tengu_exit_background_work_prompt', {
        item_count: items.length,
        chose_exit: choseExit,
      })
    },
    [items.length],
  )

  const handleSelect = useCallback(
    (value: string) => {
      const choseExit = value === 'exit'
      recordChoice(choseExit)
      if (choseExit) onExit()
      else onCancel()
    },
    [onCancel, onExit, recordChoice],
  )

  const handleCancel = useCallback(() => {
    recordChoice(false)
    onCancel()
  }, [onCancel, recordChoice])

  const { rows } = useTerminalSize()
  const insideModal = useIsInsideModal()
  const availableRows =
    !insideModal && isFullscreenEnvEnabled() ? Math.floor(rows / 2) : rows
  const visibleCount = Math.max(1, availableRows - 12)
  const visibleItems = items.slice(0, visibleCount)
  const hiddenCount = items.length - visibleItems.length

  return (
    <Dialog
      title="Background work is running"
      subtitle="The following will stop when you exit:"
      onCancel={handleCancel}
    >
      <Box flexDirection="column" gap={0}>
        {visibleItems.map((item, index) => (
          <Box key={index} flexDirection="row">
            <Text bold>{item.label}</Text>
            {item.detail ? <Text dimColor> · {item.detail}</Text> : null}
          </Box>
        ))}
        {hiddenCount > 0 ? (
          <Text dimColor>…and {hiddenCount} more</Text>
        ) : null}
      </Box>
      <Select
        options={[
          { label: 'Exit anyway', value: 'exit' },
          { label: 'Stay', value: 'stay' },
        ]}
        onChange={handleSelect}
      />
    </Dialog>
  )
}
