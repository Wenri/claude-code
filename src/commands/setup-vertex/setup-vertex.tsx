import React, { useState } from 'react'
import { VertexSetupWizard } from '../../components/ConsoleOAuthWizards.js'
import { Box, Text, useApp } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { logEvent } from '../../services/analytics/index.js'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../types/command.js'

function VertexSetupCommand({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const app = useApp()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useKeybinding(
    'confirm:yes',
    () => {
      app.exit()
      void import('../../utils/relaunch.js').then(({ execRelaunch }) =>
        execRelaunch(),
      )
    },
    {
      context: 'Confirmation',
      isActive: successMessage !== null,
    },
  )

  if (successMessage !== null) {
    return (
      <Box flexDirection="column" gap={1} marginTop={1}>
        <Text color="success">{successMessage}</Text>
        <Text dimColor>
          Press <Text bold>Enter</Text> to restart Claude Code.
        </Text>
      </Box>
    )
  }

  return (
    <VertexSetupWizard
      onComplete={message => setSuccessMessage(message)}
      onCancel={() => {
        logEvent('tengu_vertex_setup_cancelled', {})
        onDone()
      }}
    />
  )
}

export const call: LocalJSXCommandCall = async onDone => {
  logEvent('tengu_vertex_setup_started', {})
  return <VertexSetupCommand onDone={onDone} />
}
