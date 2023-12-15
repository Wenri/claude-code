import React from 'react'
import { Box, Text } from '../ink.js'
import {
  getCachedKeybindingWarnings,
  getKeybindingsPath,
  isKeybindingCustomizationEnabled,
} from '../keybindings/loadUserBindings.js'
import type { KeybindingWarning } from '../keybindings/validate.js'
import { StatusIcon } from './design-system/StatusIcon.js'
import { Tree } from './design-system/Tree.js'

function compareWarnings(
  left: KeybindingWarning,
  right: KeybindingWarning,
): number {
  if (left.severity === right.severity) return 0
  return left.severity === 'error' ? -1 : 1
}

function WarningNode({
  warning,
}: {
  warning: KeybindingWarning
}): React.ReactNode {
  return (
    <Tree.Node
      label={
        <Text color={warning.severity === 'error' ? 'error' : 'warning'}>
          {warning.message}
        </Text>
      }
    >
      {warning.suggestion && (
        <Tree.Node dimColor>{warning.suggestion}</Tree.Node>
      )}
    </Tree.Node>
  )
}

export function KeybindingWarnings(): React.ReactNode {
  if (!isKeybindingCustomizationEnabled()) return null

  const warnings = getCachedKeybindingWarnings()
  if (warnings.length === 0) return null

  const sorted = [...warnings].sort(compareWarnings)
  const hasError = sorted[0]?.severity === 'error'

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <StatusIcon status={hasError ? 'error' : 'warning'} withSpace />
        <Text bold>Keybinding configuration issues</Text>
        <Text dimColor> · {getKeybindingsPath()}</Text>
      </Text>
      <Tree variant="tree">
        {sorted.map((warning, index) => (
          <WarningNode key={index} warning={warning} />
        ))}
      </Tree>
    </Box>
  )
}
