import React from 'react'
import { useModalOrTerminalSize, useIsInsideModal } from '../context/modalContext.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Box, Text } from '../ink.js'
import { logEvent } from '../services/analytics/index.js'
import type { SessionBackgroundExitItem } from '../utils/sessionCronTasks.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import { plural } from '../utils/stringUtils.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type Props = {
  items: SessionBackgroundExitItem[]
  onExit(): void
  onCancel(): void
}

export function BackgroundExitDialog({
  items,
  onExit,
  onCancel,
}: Props): React.ReactNode {
  const recordChoice = (choseExit: boolean): void => {
    logEvent('tengu_exit_background_work_prompt', {
      item_count: items.length,
      chose_exit: choseExit,
    })
  }
  const confirm = (): void => {
    recordChoice(true)
    onExit()
  }
  const cancel = (): void => {
    recordChoice(false)
    onCancel()
  }

  const terminal = useTerminalSize()
  const { rows } = useModalOrTerminalSize(terminal)
  const insideModal = useIsInsideModal()
  const effectiveRows =
    !insideModal && isFullscreenEnvEnabled() ? Math.floor(rows / 2) : rows
  const limit = Math.max(1, effectiveRows - 12)
  const visible = items.slice(0, limit)
  const hidden = items.length - visible.length

  return (
    <Dialog
      title="Background work is running"
      subtitle="The following will stop when you exit:"
      onCancel={cancel}
    >
      <Box flexDirection="column" gap={0}>
        {visible.map((item, index) => (
          <Box key={index} flexDirection="row">
            <Text bold>{item.label}</Text>
            {item.detail ? <Text dimColor> · {item.detail}</Text> : null}
          </Box>
        ))}
        {hidden > 0 ? (
          <Text dimColor>
            … +{hidden} {plural(hidden, 'item')}
          </Text>
        ) : null}
      </Box>
      <Select
        options={[
          { label: 'Exit anyway', value: 'confirm' },
          { label: 'Stay', value: 'cancel' },
        ]}
        defaultFocusValue="confirm"
        visibleOptionCount={2}
        onChange={value => (value === 'confirm' ? confirm() : cancel())}
        onCancel={cancel}
      />
    </Dialog>
  )
}
