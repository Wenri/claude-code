import React, { useState } from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import { logEvent } from '../../services/analytics/index.js'
import type { ToolUseContext } from '../../Tool.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { call as extraUsageCall } from '../extra-usage/extra-usage.js'
import { call as upgradeCall } from '../upgrade/upgrade.js'
import { isUpgradeSuppressed } from '../../utils/subscriptionUpsell.js'

type TrialExpiredChoice = 'upgrade' | 'extra-usage'

function ProTrialExpired({
  onDone,
  context,
}: {
  onDone: LocalJSXCommandOnDone
  context: ToolUseContext & LocalJSXCommandContext
}): React.ReactNode {
  const [subCommandJSX, setSubCommandJSX] = useState<React.ReactNode>(null)

  if (subCommandJSX) return subCommandJSX

  const handleSelect = (value: TrialExpiredChoice): void => {
    logEvent('tengu_pro_trial_expired_choice', {
      chose_upgrade: value === 'upgrade',
    })
    if (value === 'upgrade') {
      void upgradeCall(onDone, context).then(setSubCommandJSX)
    } else {
      void extraUsageCall(onDone, context).then(setSubCommandJSX)
    }
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Box paddingX={1}>
        <Text color="error">Your Claude Code trial has ended.</Text>
      </Box>
      <Dialog title="What do you want to do?" onCancel={() => onDone()}>
        <Select<TrialExpiredChoice>
          options={[
            ...(!isUpgradeSuppressed()
              ? [{ label: 'Upgrade to Max', value: 'upgrade' as const }]
              : []),
            {
              label: 'Add funds to continue with extra usage',
              value: 'extra-usage',
            },
          ]}
          onCancel={() => onDone()}
          onChange={handleSelect}
        />
      </Dialog>
    </Box>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
): Promise<React.ReactNode> {
  return <ProTrialExpired onDone={onDone} context={context} />
}
