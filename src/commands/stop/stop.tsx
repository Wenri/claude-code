import React from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { stopBackgroundSession } from '../exit/exit.js'

export async function call(
  onDone: LocalJSXCommandOnDone,
): Promise<React.ReactNode> {
  return (
    <Dialog
      title="Stop this background session?"
      subtitle="Restart it from agents anytime."
      onCancel={() => onDone()}
    >
      <Select
        options={[
          { label: 'Stop session', value: 'confirm' },
          { label: 'Keep running', value: 'cancel' },
        ]}
        defaultFocusValue="confirm"
        onChange={value => {
          if (value === 'confirm') void stopBackgroundSession('stop_command')
          else onDone()
        }}
        onCancel={() => onDone()}
      />
    </Dialog>
  )
}
