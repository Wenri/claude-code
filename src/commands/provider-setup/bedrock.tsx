import * as React from 'react'
import { useState } from 'react'
import { BedrockSetupWizard } from '../../components/BedrockSetupWizard.js'
import { Box, Text, useApp } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { relaunchAfterProviderSetup } from './relaunch.js'

function BedrockSetupCommand({
  onDone,
}: {
  onDone: Parameters<LocalJSXCommandCall>[0]
}): React.ReactNode {
  const app = useApp()
  const [completeMessage, setCompleteMessage] = useState<string | null>(null)

  useKeybinding(
    'confirm:yes',
    () => {
      app.exit()
      void relaunchAfterProviderSetup()
    },
    { context: 'Confirmation', isActive: completeMessage !== null },
  )

  if (completeMessage !== null) {
    return (
      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text color="success">{completeMessage}</Text>
        <Text dimColor>
          Press <Text bold>Enter</Text> to restart Claude Code.
        </Text>
      </Box>
    )
  }

  return (
    <BedrockSetupWizard
      onComplete={setCompleteMessage}
      onCancel={() => {
        logEvent('tengu_bedrock_setup_cancelled', {})
        onDone()
      }}
    />
  )
}

export const call: LocalJSXCommandCall = async onDone => {
  logEvent('tengu_bedrock_setup_started', {})
  return <BedrockSetupCommand onDone={onDone} />
}
