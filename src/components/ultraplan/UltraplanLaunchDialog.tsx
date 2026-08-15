import React, { useState } from 'react'
import {
  CCR_TERMS_URL,
  getUltraplanDisplayConfig,
  getUltraplanPromptIdentifier,
  type UltraplanPromptIdentifier,
} from '../../commands/ultraplan.js'
import { useRegisterOverlay } from '../../context/overlayContext.js'
import { Box, Link, Text } from '../../ink.js'
import { logEvent } from '../../services/analytics/index.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import {
  getRemoteSourceViability,
  type RemoteSourceViability,
} from '../../utils/background/remote/remoteSession.js'
import { Select } from '../CustomSelect/select.js'
import { Dialog } from '../design-system/Dialog.js'

export type UltraplanLaunchChoice = 'run' | 'cancel'

type Props = {
  sourcePromise?: Promise<RemoteSourceViability | null> | null
  onChoice: (
    choice: UltraplanLaunchChoice,
    options: {
      disconnectedBridge: boolean
      promptIdentifier: UltraplanPromptIdentifier
    },
  ) => void
}

function formatSource(source: RemoteSourceViability): string | null {
  if (!source.bundleSeedEnabled) return null
  return source.cloneViable
    ? 'This will try to clone your git remote and fall back to uploading this repository.'
    : 'This will upload your repository to Claude Code on the web.'
}

function DialogContent({
  showTerms,
  sourcePromise,
  copy,
  replBridgeEnabled,
  onChoice,
}: {
  showTerms: boolean
  sourcePromise: Promise<RemoteSourceViability | null> | null
  copy: ReturnType<typeof getUltraplanDisplayConfig>
  replBridgeEnabled: boolean
  onChoice: (choice: UltraplanLaunchChoice) => void
}): React.ReactNode {
  const source = sourcePromise ? React.use(sourcePromise) : null
  const sourceDescription = source ? formatSource(source) : null
  const details = showTerms ? (
    <>
      <Text dimColor>{copy.dialogBody}</Text>
      <Box flexDirection="column">
        {sourceDescription && <Text dimColor>{sourceDescription}</Text>}
        <Text dimColor>
          More information: <Link url={CCR_TERMS_URL}>{CCR_TERMS_URL}</Link>
        </Text>
      </Box>
      <Text>Proceed?</Text>
    </>
  ) : (
    <>
      <Box flexDirection="column">
        <Text dimColor>{copy.dialogBody}</Text>
        {replBridgeEnabled && (
          <Text dimColor>This will disable Remote Control for this session.</Text>
        )}
      </Box>
      {!replBridgeEnabled && <Text dimColor>{copy.dialogPipeline}</Text>}
    </>
  )
  return (
    <Box flexDirection="column" gap={1}>
      {details}
      <Select<UltraplanLaunchChoice>
        options={[
          {
            label: showTerms ? 'Yes' : 'Run ultraplan',
            value: 'run',
            description: replBridgeEnabled
              ? 'Disable remote control and launch in Claude Code on the web'
              : 'launch in Claude Code on the web',
          },
          { label: showTerms ? 'No' : 'Not now', value: 'cancel' },
        ]}
        onChange={onChoice}
      />
    </Box>
  )
}

export function UltraplanLaunchDialog({
  sourcePromise,
  onChoice,
}: Props): React.ReactNode {
  useRegisterOverlay('ultraplan-launch')
  const [firstRun] = useState(() => !getGlobalConfig().hasSeenUltraplanTerms)
  const [promptIdentifier] = useState(getUltraplanPromptIdentifier)
  const copy = getUltraplanDisplayConfig(promptIdentifier)
  const replBridgeEnabled = useAppState(state => state.replBridgeEnabled)
  const setAppState = useSetAppState()
  const [resolvedSourcePromise] = useState(() =>
    firstRun
      ? sourcePromise ?? getRemoteSourceViability().catch(() => null)
      : null,
  )

  const choose = (choice: UltraplanLaunchChoice) => {
    const disconnectedBridge = choice === 'run' && replBridgeEnabled
    logEvent('tengu_ultraplan_dialog_choice', {
      choice,
      first_run: firstRun,
      bridge_disconnected: disconnectedBridge,
      prompt_identifier: promptIdentifier,
    })
    if (disconnectedBridge) {
      setAppState(state =>
        state.replBridgeEnabled
          ? {
              ...state,
              replBridgeEnabled: false,
              replBridgeExplicit: false,
              replBridgeOutboundOnly: false,
            }
          : state,
      )
    }
    if (choice !== 'cancel' && firstRun) {
      logEvent('tengu_ultraplan_first_launch', {
        prompt_identifier: promptIdentifier,
      })
      saveGlobalConfig(config =>
        config.hasSeenUltraplanTerms
          ? config
          : { ...config, hasSeenUltraplanTerms: true },
      )
    }
    onChoice(choice, { disconnectedBridge, promptIdentifier })
  }

  return (
    <Dialog
      title="Run ultraplan in the cloud?"
      subtitle={copy.timeEstimate}
      onCancel={() => choose('cancel')}
    >
      <React.Suspense fallback={<Text dimColor>Loading…</Text>}>
        <DialogContent
          showTerms={firstRun}
          sourcePromise={resolvedSourcePromise}
          copy={copy}
          replBridgeEnabled={replBridgeEnabled}
          onChoice={choose}
        />
      </React.Suspense>
    </Dialog>
  )
}
