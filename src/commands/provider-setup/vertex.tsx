import * as React from 'react'
import { useState } from 'react'
import { VertexSetupWizard } from '../../components/VertexSetupWizard.js'
import { Box, Text, useApp } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { relaunchAfterProviderSetup } from './relaunch.js'

function VertexSetupCommand({
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
    <VertexSetupWizard
      onComplete={setCompleteMessage}
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
