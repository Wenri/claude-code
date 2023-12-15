import React from 'react'
import { Box, Text } from '../../ink.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { StatusIcon } from '../design-system/StatusIcon.js'
import { Tree } from '../design-system/Tree.js'

export function SandboxDoctorSection(): React.ReactNode {
  if (!SandboxManager.isSupportedPlatform()) return null
  if (!SandboxManager.isSandboxEnabledInSettings()) return null
  if (!SandboxManager.isPlatformInEnabledList()) return null

  const dependencyCheck = SandboxManager.checkDependencies()
  const hasErrors = dependencyCheck.errors.length > 0
  const hasWarnings = dependencyCheck.warnings.length > 0
  if (!hasErrors && !hasWarnings) return null

  const statusColor = hasErrors ? ('error' as const) : ('warning' as const)
  const statusText = hasErrors
    ? 'Missing dependencies'
    : 'Available (with warnings)'

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <StatusIcon status={hasErrors ? 'error' : 'warning'} withSpace />
        <Text bold>Sandbox</Text>
      </Text>
      <Tree variant="tree">
        <Tree.Node>
          <Text>
            Status: <Text color={statusColor}>{statusText}</Text>
          </Text>
        </Tree.Node>
        {dependencyCheck.errors.map((error, index) => (
          <Tree.Node key={index} color="error">
            {error}
          </Tree.Node>
        ))}
        {dependencyCheck.warnings.map((warning, index) => (
          <Tree.Node key={index} color="warning">
            {warning}
          </Tree.Node>
        ))}
        {hasErrors && (
          <Tree.Node dimColor>
            Run /sandbox for install instructions
          </Tree.Node>
        )}
      </Tree>
    </Box>
  )
}
