import React from 'react'
import { MessageResponse } from '../../components/MessageResponse.js'
import { TOOL_SUMMARY_MAX_LENGTH } from '../../constants/toolLimits.js'
import { Text } from '../../ink.js'
import { truncate } from '../../utils/format.js'
import type { Input, Output } from './MonitorTool.js'

export function renderToolUseMessage(
  input: Partial<Input>,
): React.ReactNode {
  if (!input.description) return null
  return input.description
}

export function renderToolResultMessage(output: Output): React.ReactNode {
  return (
    <MessageResponse>
      <Text>
        Monitor started{' '}
        <Text dimColor>
          · task {output.taskId} ·{' '}
          {output.persistent
            ? 'persistent'
            : `timeout ${output.timeoutMs / 1000}s`}
        </Text>
      </Text>
    </MessageResponse>
  )
}

export function getToolUseSummary(
  input: Partial<Input> | undefined,
): string | null {
  if (!input?.description) return null
  return truncate(input.description, TOOL_SUMMARY_MAX_LENGTH)
}
