import * as React from 'react'
import { TEAM_ONBOARDING_DISCOVERY_COPY } from '../commands/team-onboarding/index.js'
import { Box, Text } from '../ink.js'
import { useKeybindings } from '../keybindings/useKeybinding.js'
import { WelcomeV2 } from './LogoV2/WelcomeV2.js'
import { PressEnterToContinue } from './PressEnterToContinue.js'

export function TeamOnboardingDiscoveryStep({
  onDone,
}: {
  onDone: () => void
}): React.ReactNode {
  useKeybindings(
    { 'confirm:yes': onDone },
    { context: 'Confirmation' },
  )
  return (
    <Box flexDirection="column">
      <WelcomeV2 />
      <Box flexDirection="column" gap={1} paddingLeft={1} marginTop={1}>
        <Text bold>{TEAM_ONBOARDING_DISCOVERY_COPY.heading}</Text>
        <Box width={70}>
          <Text>{TEAM_ONBOARDING_DISCOVERY_COPY.body}</Text>
        </Box>
        <PressEnterToContinue />
      </Box>
    </Box>
  )
}
