import React from 'react'
import { Box, Text } from '../ink.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type Props = {
  tierLabel: string
  fromName: string
  toName: string
  toProviderId: string
  onDone(accepted: boolean): void
}

export function ThirdPartyModelUpgradeDialog({
  tierLabel,
  fromName,
  toName,
  toProviderId,
  onDone,
}: Props): React.ReactNode {
  return (
    <Dialog
      title={`Newer ${tierLabel} model available`}
      color="permission"
      onCancel={() => onDone(false)}
    >
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            Currently pinned: <Text bold>{fromName}</Text>
          </Text>
          <Text>
            Latest available: <Text bold>{toName}</Text>{' '}
            <Text dimColor>({toProviderId})</Text>
          </Text>
        </Box>
        <Text>
          Update settings to use {toName}?{' '}
          <Text dimColor>Claude Code will restart to apply.</Text>
        </Text>
        <Select
          options={[
            { label: 'Yes', value: 'confirm' },
            { label: 'No', value: 'cancel' },
          ]}
          defaultFocusValue="confirm"
          visibleOptionCount={2}
          onChange={value => onDone(value === 'confirm')}
          onCancel={() => onDone(false)}
        />
      </Box>
    </Dialog>
  )
}
