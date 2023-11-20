import React from 'react'
import { Box, Text } from '../../ink.js'
import { supportsHyperlinks } from '../../ink/supports-hyperlinks.js'
import { createHyperlink } from '../../utils/hyperlink.js'
import { jsonStringify } from '../../utils/slowOperations.js'

const SLACK_CHANNEL_ID_REGEX = /^[CDG][A-Z0-9]{6,}$/
const SLACK_SEND_TOOL_NAMES = new Set([
  'slack_send_message',
  'slack_post_message',
])

export function isSlackSendTool(toolName: string): boolean {
  return SLACK_SEND_TOOL_NAMES.has(toolName)
}

function getSlackChannel(
  input: Partial<Record<string, unknown>>,
): { label: string; url: string | null } | null {
  const channel = input.channel_id ?? input.channel
  if (typeof channel !== 'string' || !channel) return null

  const channelWithoutHash = channel.replace(/^#/, '')
  const label = `#${channelWithoutHash}`
  const url = SLACK_CHANNEL_ID_REGEX.test(channelWithoutHash)
    ? `https://slack.com/app_redirect?channel=${channelWithoutHash}`
    : null

  return { label, url }
}

export function getSlackSendToolOverrides(): {
  userFacingName: () => string
  renderToolUseMessage: (
    input: Partial<Record<string, unknown>>,
    options: { verbose: boolean },
  ) => string
  renderToolUseTag: (
    input: Partial<Record<string, unknown>>,
  ) => React.ReactNode
} {
  return {
    userFacingName() {
      return 'Slacked'
    },
    renderToolUseMessage(input, { verbose }) {
      if (!verbose) return ''
      return Object.entries(input)
        .map(([key, value]) => `${key}: ${jsonStringify(value)}`)
        .join(', ')
    },
    renderToolUseTag(input) {
      const channel = getSlackChannel(input)
      if (channel === null) return null

      return (
        <Box flexWrap="nowrap" marginLeft={1}>
          <Text>
            {channel.url && supportsHyperlinks()
              ? createHyperlink(channel.url, channel.label)
              : channel.label}
          </Text>
        </Box>
      )
    },
  }
}
