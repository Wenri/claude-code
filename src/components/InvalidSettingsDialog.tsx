import React from 'react'
import { Text } from '../ink.js'
import type { ValidationError } from '../utils/settings/validation.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'
import { ValidationErrorsList } from './ValidationErrorsList.js'

type Props = {
  settingsErrors: ValidationError[]
  onContinue: () => void
  onExit: () => void
}

export function InvalidSettingsDialog({
  settingsErrors,
  onContinue,
  onExit,
}: Props): React.ReactNode {
  function handleSelect(value: string): void {
    if (value === 'exit') onExit()
    else onContinue()
  }

  const hasErrors = settingsErrors.some(isError)
  const options = hasErrors
    ? [
        { label: 'Exit and fix manually', value: 'exit' },
        { label: 'Continue without these settings', value: 'continue' },
      ]
    : [
        { label: 'Continue', value: 'continue' },
        { label: 'Exit and fix manually', value: 'exit' },
      ]
  const title = hasErrors ? 'Settings Error' : 'Settings Warning'
  const onCancel = hasErrors ? onExit : onContinue
  const explanation = hasErrors
    ? 'Files with errors are skipped entirely, not just the invalid settings.'
    : 'The values listed above were skipped; the rest of the file is in effect.'

  return (
    <Dialog title={title} onCancel={onCancel} color="warning">
      <ValidationErrorsList errors={settingsErrors} />
      <Text dimColor>{explanation}</Text>
      <Select options={options} onChange={handleSelect} />
    </Dialog>
  )
}

function isError(error: ValidationError): boolean {
  return error.severity !== 'warning'
}
