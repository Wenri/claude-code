import React, { useState } from 'react'
import { MessageResponse } from '../../components/MessageResponse.js'
import { Box, Text } from '../../ink.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { enqueue } from '../../utils/messageQueueManager.js'
import type { Input, Output } from './PushNotificationTool.js'

function SlashCommandLink({ command }: { command: string }): React.ReactNode {
  const [hovered, setHovered] = useState(false)
  const onClick = () => {
    logEvent('tengu_slash_link_clicked', {
      command:
        command as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    enqueue({ mode: 'prompt', value: `/${command}` })
  }

  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Text underline bold={hovered}>
        /{command}
      </Text>
    </Box>
  )
}

export function renderToolUseMessage(input: Partial<Input>): React.ReactNode {
  return input.message ?? ''
}

export function renderToolResultMessage(output: Output): React.ReactNode {
  let message: React.ReactNode

  if (output.disabledReason === 'config_off') {
    message = (
      <Box flexDirection="row">
        <Text>{'Not sent because "Push when Claude decides" is disabled in '}</Text>
        <SlashCommandLink command="config" />
        <Text>.</Text>
      </Box>
    )
  } else if (output.disabledReason === 'user_present') {
    message = <Text>Not sent because you're active in this terminal.</Text>
  } else if (output.disabledReason === 'no_transport') {
    message = output.localSent ? (
      <Text>Terminal notification sent.</Text>
    ) : (
      <Box flexDirection="row">
        <Text>Not sent — Remote Control is off. Enable with </Text>
        <SlashCommandLink command="remote-control" />
        <Text>.</Text>
      </Box>
    )
  } else {
    if (output.localSent === undefined) return null
    message = (
      <Text>
        {output.localSent
          ? 'Terminal and mobile notification sent.'
          : 'Mobile notification sent.'}
      </Text>
    )
  }

  return <MessageResponse height={1}>{message}</MessageResponse>
}
