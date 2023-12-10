import React from 'react'
import { Box, Text } from '../../../ink.js'
import { shouldShowAlwaysAllowOptions } from '../../../utils/permissions/permissionsLoader.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import { MonitorTool } from '../../../tools/MonitorTool/MonitorTool.js'
import { usePermissionRequestLogging } from '../hooks.js'
import { PermissionDialog } from '../PermissionDialog.js'
import {
  PermissionPrompt,
  type PermissionPromptOption,
} from '../PermissionPrompt.js'
import type { PermissionRequestProps } from '../PermissionRequest.js'
import { PermissionRuleExplanation } from '../PermissionRuleExplanation.js'
import { logUnaryPermissionEvent } from '../utils.js'

type OptionValue = 'yes' | 'yes-apply-suggestions' | 'no'

function suggestedRuleLabel(
  suggestions: PermissionUpdate[],
): React.ReactNode {
  const rules = suggestions
    .filter(update => update.type === 'addRules')
    .flatMap(update => update.rules ?? [])
  if (rules.length === 1 && rules[0]?.ruleContent) {
    const rule = rules[0]
    return (
      <Text>
        Yes, and don't ask again for{' '}
        <Text bold>
          {rule.toolName}({rule.ruleContent})
        </Text>
      </Text>
    )
  }
  return `Yes, and add ${rules.length} suggested permission rules`
}

export function MonitorPermissionRequest({
  toolUseConfirm,
  onDone,
  onReject,
  workerBadge,
}: PermissionRequestProps): React.ReactNode {
  const parsed = MonitorTool.inputSchema.safeParse(toolUseConfirm.input)
  const input = parsed.success ? parsed.data : undefined
  const unaryEvent = {
    completion_type: 'tool_use_single' as const,
    language_name: 'none',
  }
  usePermissionRequestLogging(toolUseConfirm, unaryEvent)

  const suggestions =
    'suggestions' in toolUseConfirm.permissionResult
      ? (toolUseConfirm.permissionResult.suggestions ?? [])
      : []
  const options: PermissionPromptOption<OptionValue>[] = [
    {
      label: 'Yes',
      value: 'yes',
      feedbackConfig: { type: 'accept' },
    },
  ]
  if (shouldShowAlwaysAllowOptions() && suggestions.length > 0) {
    options.push({
      label: suggestedRuleLabel(suggestions),
      value: 'yes-apply-suggestions',
    })
  }
  options.push({
    label: 'No',
    value: 'no',
    feedbackConfig: { type: 'reject' },
  })

  function handleSelect(value: OptionValue, feedback?: string): void {
    switch (value) {
      case 'yes':
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
        toolUseConfirm.onAllow(toolUseConfirm.input, [], feedback)
        onDone()
        break
      case 'yes-apply-suggestions':
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
        toolUseConfirm.onAllow(toolUseConfirm.input, suggestions)
        onDone()
        break
      case 'no':
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'reject')
        toolUseConfirm.onReject(feedback)
        onReject()
        onDone()
        break
    }
  }

  function handleCancel(): void {
    logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'reject')
    toolUseConfirm.onReject()
    onReject()
    onDone()
  }

  return (
    <PermissionDialog title="Monitor" workerBadge={workerBadge}>
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>{input?.command}</Text>
        <Text dimColor>{input?.description}</Text>
      </Box>
      <Box flexDirection="column">
        <PermissionRuleExplanation
          permissionResult={toolUseConfirm.permissionResult}
          toolType="command"
        />
        <PermissionPrompt
          options={options}
          onSelect={handleSelect}
          onCancel={handleCancel}
        />
      </Box>
    </PermissionDialog>
  )
}
