import React, { useState } from 'react'
import { Box, Text } from '../ink.js'
import { useKeybindings } from '../keybindings/useKeybinding.js'
import { logEvent } from '../services/analytics/index.js'
import {
  getProTrialDurationDays,
  startProTrial,
} from '../services/proTrial.js'
import { logError } from '../utils/log.js'
import { WelcomeV2 } from './LogoV2/WelcomeV2.js'
import { Spinner } from './Spinner.js'

type Props = {
  onDone(): void
}

type StartState = 'idle' | 'starting' | 'error'

export function ProTrialStartScreen({ onDone }: Props): React.ReactNode {
  const [state, setState] = useState<StartState>('idle')

  useKeybindings(
    {
      'confirm:yes': () => {
        if (state === 'starting') {
          return
        }
        if (state === 'error') {
          onDone()
          return
        }

        setState('starting')
        logEvent('tengu_pro_trial_start_pressed', {})
        startProTrial()
          .then(() => {
            logEvent('tengu_pro_trial_start_ok', {})
            onDone()
          })
          .catch(error => {
            logError(error)
            logEvent('tengu_pro_trial_start_error', {})
            setState('error')
          })
      },
    },
    { context: 'Confirmation' },
  )

  const durationDays = getProTrialDurationDays()

  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      <WelcomeV2 />
      <Text>
        {durationDays !== null
          ? `Your Pro plan includes ${durationDays} days of Claude Code.`
          : 'Your Pro plan includes a Claude Code trial.'}
      </Text>
      {state === 'starting' ? (
        <Box>
          <Spinner />
          <Text> Starting your trial…</Text>
        </Box>
      ) : state === 'error' ? (
        <Text color="error">
          Couldn&apos;t start your trial. Press <Text bold>Enter</Text> to continue.
        </Text>
      ) : (
        <Text color="permission">
          Press <Text bold>Enter</Text> to start your trial
        </Text>
      )}
    </Box>
  )
}
