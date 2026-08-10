import React, { useCallback, useRef, useState } from 'react'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Link, Text } from '../../ink.js'
import { checkGate_CACHED_OR_BLOCKING } from '../../services/analytics/growthbook.js'
import { checkGithubAppInstalled } from '../../utils/background/remote/preconditions.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getCwd } from '../../utils/cwd.js'
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { findGitRoot } from '../../utils/git.js'
import type { RemoteReviewScope } from './reviewRemote.js'
import {
  getUltrareviewCostNote,
  getUltrareviewDurationNote,
} from './ultrareviewEnabled.js'

const CCR_TERMS_URL =
  'https://code.claude.com/docs/en/claude-code-on-the-web'

type ReviewSourceViability = {
  cloneViable: boolean
  bundleSeedEnabled: boolean
}

async function getReviewSourceViability(): Promise<ReviewSourceViability> {
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

function formatReviewSourceViability(
  source: ReviewSourceViability,
): string | null {
  if (!source.bundleSeedEnabled) return null
  return source.cloneViable
    ? 'This will try to clone your git remote and fall back to uploading this repository.'
    : 'This will upload your repository to Claude Code on the web.'
}

type Props = {
  subtitle?: string | null
  body?: string
  scope: RemoteReviewScope
  onProceed: (signal: AbortSignal) => Promise<void>
  onCancel: () => void
}

type ContentProps = Pick<Props, 'body' | 'scope' | 'onCancel'> & {
  showTerms: boolean
  sourcePromise: Promise<ReviewSourceViability | null> | null
  isLaunching: boolean
  onSelect: (value: string) => void
}

function UltrareviewDialogContent({
  showTerms,
  sourcePromise,
  body,
  scope,
  isLaunching,
  onSelect,
  onCancel,
}: ContentProps): React.ReactNode {
  const source = sourcePromise ? React.use(sourcePromise) : null
  const sourceDescription = source
    ? formatReviewSourceViability(source)
    : null
  const scopeDescription =
    scope.mode === 'pr'
      ? `Reviewing ${scope.repo}#${scope.prNumber} fetched from GitHub.`
      : scope.headBranch === scope.baseBranch
        ? `Reviewing local changes on ${scope.baseBranch}.`
        : `Reviewing ${scope.headBranch} against ${scope.baseBranch}.`
  const scopeStat =
    scope.mode === 'branch' && scope.diffStat ? scope.diffStat : null
  const tip =
    scope.mode === 'pr'
      ? 'Tip: run /ultrareview (no number) to review your current branch instead.'
      : 'Tip: run /ultrareview <PR number> to fetch and review a specific GitHub PR instead.'

  const details = showTerms ? (
    <>
      <Box flexDirection="column">
        <Text dimColor>{scopeDescription}</Text>
        {scopeStat && <Text dimColor>Scope: {scopeStat}</Text>}
        <Text dimColor>
          Finds and verifies bugs using a multi-agent review fleet.
        </Text>
        <Text dimColor>{tip}</Text>
        {sourceDescription && <Text dimColor>{sourceDescription}</Text>}
        {body && <Text dimColor>{body}</Text>}
        <Text dimColor>
          More information: <Link url={CCR_TERMS_URL}>{CCR_TERMS_URL}</Link>
        </Text>
      </Box>
      <Text>Proceed?</Text>
    </>
  ) : (
    <Box flexDirection="column">
      <Text dimColor>{scopeDescription}</Text>
      {scopeStat && <Text dimColor>Scope: {scopeStat}</Text>}
      <Text dimColor>
        Finds and verifies bugs using a multi-agent review fleet.
      </Text>
      <Text dimColor>{tip}</Text>
      {body && <Text dimColor>{body}</Text>}
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      {details}
      {isLaunching ? (
        <Text color="background">Launching…</Text>
      ) : (
        <Select
          options={[
            {
              label: showTerms ? 'Yes' : 'Run ultrareview',
              value: 'proceed',
              description: 'launch in Claude Code on the web',
            },
            { label: showTerms ? 'No' : 'Not now', value: 'cancel' },
          ]}
          onChange={onSelect}
          onCancel={onCancel}
        />
      )}
    </Box>
  )
}

export function UltrareviewOverageDialog({
  subtitle,
  body,
  scope,
  onProceed,
  onCancel,
}: Props): React.ReactNode {
  const [showTerms] = useState(
    () => !getGlobalConfig().hasSeenUltrareviewTerms,
  )
  const [sourcePromise] = useState(() =>
    showTerms ? getReviewSourceViability().catch(() => null) : null,
  )
  const [isLaunching, setIsLaunching] = useState(false)
  const abortControllerRef = useRef(new AbortController())

  const handleSelect = useCallback(
    (value: string) => {
      if (value !== 'proceed') {
        onCancel()
        return
      }
      if (showTerms) {
        saveGlobalConfig(current =>
          current.hasSeenUltrareviewTerms
            ? current
            : { ...current, hasSeenUltrareviewTerms: true },
        )
      }
      setIsLaunching(true)
      void onProceed(abortControllerRef.current.signal).catch(() =>
        setIsLaunching(false),
      )
    },
    [onCancel, onProceed, showTerms],
  )

  const handleCancel = useCallback(() => {
    abortControllerRef.current.abort()
    onCancel()
  }, [onCancel])

  return (
    <Dialog
      title="Run ultrareview in the cloud?"
      subtitle={
        subtitle ??
        `${getUltrareviewDurationNote()} · Est. cost ${getUltrareviewCostNote()} USD`
      }
      onCancel={handleCancel}
    >
      <React.Suspense fallback={<Text dimColor>Loading…</Text>}>
        <UltrareviewDialogContent
          showTerms={showTerms}
          sourcePromise={sourcePromise}
          body={body}
          scope={scope}
          isLaunching={isLaunching}
          onSelect={handleSelect}
          onCancel={handleCancel}
        />
      </React.Suspense>
    </Dialog>
  )
}
