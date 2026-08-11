import React, { useState } from 'react'
import { useRegisterOverlay } from '../context/overlayContext.js'
import { Box, Link, Text } from '../ink.js'
import { checkGate_CACHED_OR_BLOCKING } from '../services/analytics/growthbook.js'
import { logEvent } from '../services/analytics/index.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import { checkGithubAppInstalled } from '../utils/background/remote/preconditions.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { getCwd } from '../utils/cwd.js'
import { detectCurrentRepositoryWithHost } from '../utils/detectRepository.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { findGitRoot } from '../utils/git.js'
import {
  CCR_TERMS_URL,
  getUltraplanCopy,
  getUltraplanPromptIdentifier,
  type UltraplanCopy,
  type UltraplanPromptIdentifier,
} from '../utils/ultraplan/config.js'
import { Select } from './CustomSelect/select.js'
import { Dialog } from './design-system/Dialog.js'

export type UltraplanSourceViability = {
  cloneViable: boolean
  bundleSeedEnabled: boolean
}

export async function getUltraplanSourceViability(): Promise<UltraplanSourceViability> {
  const [repository, bundleSeedGate] = await Promise.all([
    detectCurrentRepositoryWithHost(),
    checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled'),
  ])
  const bundleSeedEnabled =
    findGitRoot(getCwd()) !== null &&
    (isEnvTruthy(process.env.CCR_ENABLE_BUNDLE) || bundleSeedGate)
  if (!bundleSeedEnabled) {
    return { cloneViable: false, bundleSeedEnabled }
  }
  return {
    cloneViable:
      repository !== null &&
      (repository.host !== 'github.com' ||
        (await checkGithubAppInstalled(repository.owner, repository.name))),
    bundleSeedEnabled,
  }
}

function formatSourceViability(
  source: UltraplanSourceViability,
): string | null {
  if (!source.bundleSeedEnabled) return null
  return source.cloneViable
    ? 'This will try to clone your git remote and fall back to uploading this repository.'
    : 'This will upload your repository to Claude Code on the web.'
}

export type UltraplanLaunchChoice = 'run' | 'cancel'

export type UltraplanLaunchChoiceOptions = {
  disconnectedBridge: boolean
  promptIdentifier: UltraplanPromptIdentifier
}

type Props = {
  sourcePromise?: Promise<UltraplanSourceViability | null>
  onChoice: (
    choice: UltraplanLaunchChoice,
    options: UltraplanLaunchChoiceOptions,
  ) => void
}

type ContentProps = {
  showTerms: boolean
  sourcePromise: Promise<UltraplanSourceViability | null> | null
  copy: UltraplanCopy
  replBridgeEnabled: boolean
  onChoice: (choice: UltraplanLaunchChoice) => void
}

function UltraplanLaunchDialogContent({
  showTerms,
  sourcePromise,
  copy,
  replBridgeEnabled,
  onChoice,
}: ContentProps): React.ReactNode {
  const source = sourcePromise ? React.use(sourcePromise) : null
  const sourceDescription = source ? formatSourceViability(source) : null
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
          <Text dimColor>
            This will disable Remote Control for this session.
          </Text>
        )}
      </Box>
      {!replBridgeEnabled && <Text dimColor>{copy.dialogPipeline}</Text>}
    </>
  )

  return (
    <Box flexDirection="column" gap={1}>
      {details}
      <Select
        options={[
          {
            label: showTerms ? 'Yes' : 'Run ultraplan',
            value: 'run' as const,
            description: replBridgeEnabled
              ? 'Disable remote control and launch in Claude Code on the web'
              : 'launch in Claude Code on the web',
          },
          {
            label: showTerms ? 'No' : 'Not now',
            value: 'cancel' as const,
          },
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
  const [showTerms] = useState(
    () => !getGlobalConfig().hasSeenUltraplanTerms,
  )
  const [promptIdentifier] = useState(getUltraplanPromptIdentifier)
  const copy = getUltraplanCopy(promptIdentifier)
  const replBridgeEnabled = useAppState(state => state.replBridgeEnabled)
  const setAppState = useSetAppState()
  const [resolvedSourcePromise] = useState(() =>
    showTerms
      ? (sourcePromise ?? getUltraplanSourceViability().catch(() => null))
      : null,
  )

  const handleChoice = (choice: UltraplanLaunchChoice): void => {
    const disconnectedBridge = choice === 'run' && replBridgeEnabled
    logEvent('tengu_ultraplan_dialog_choice', {
      choice,
      first_run: showTerms,
      bridge_disconnected: disconnectedBridge,
      prompt_identifier: promptIdentifier,
    })
    if (disconnectedBridge) {
      setAppState(current => {
        if (!current.replBridgeEnabled) return current
        return {
          ...current,
          replBridgeEnabled: false,
          replBridgeExplicit: false,
          replBridgeOutboundOnly: false,
        }
      })
    }
    if (choice !== 'cancel' && showTerms) {
      logEvent('tengu_ultraplan_first_launch', {
        prompt_identifier: promptIdentifier,
      })
      saveGlobalConfig(current =>
        current.hasSeenUltraplanTerms
          ? current
          : { ...current, hasSeenUltraplanTerms: true },
      )
    }
    onChoice(choice, { disconnectedBridge, promptIdentifier })
  }

  return (
    <Dialog
      title="Run ultraplan in the cloud?"
      subtitle={copy.timeEstimate}
      onCancel={() => handleChoice('cancel')}
    >
      <React.Suspense fallback={<Text dimColor>Loading…</Text>}>
        <UltraplanLaunchDialogContent
          showTerms={showTerms}
          sourcePromise={resolvedSourcePromise}
          copy={copy}
          replBridgeEnabled={replBridgeEnabled}
          onChoice={handleChoice}
        />
      </React.Suspense>
    </Dialog>
  )
}
