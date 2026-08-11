import React, { useEffect, useRef, useState } from 'react'
import {
  deriveBackgroundSeed,
  formatBgHints,
  spawnBackgroundFork,
  type ReplBackgroundSeed,
} from '../../cli/bg.js'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Text } from '../../ink.js'
import { logEvent } from '../../services/analytics/index.js'
import { useAppState } from '../../state/AppState.js'
import { getBackgroundTaskSummary } from '../../tasks/pillLabel.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import type { Message } from '../../types/message.js'
import { isBgSession } from '../../utils/concurrentSessions.js'
import { gracefulShutdown } from '../../utils/gracefulShutdown.js'
import { isTranscriptPersistenceDisabled } from '../../utils/sessionStorage.js'
import { detachBackgroundSession } from '../exit/exit.js'

type BackgroundCommandDialogProps = {
  onDone: LocalJSXCommandOnDone
  prompt: string
  seed: ReplBackgroundSeed
  messages: readonly Message[]
}

function BackgroundCommandDialog({
  onDone,
  prompt,
  seed,
  messages,
}: BackgroundCommandDialogProps): React.ReactNode {
  const effort = useAppState(state => state.effortValue)
  const tasks = useAppState(state => state.tasks)
  const summary = getBackgroundTaskSummary(tasks)
  const [confirmed, setConfirmed] = useState(summary.count === 0)
  const started = useRef(false)

  useEffect(() => {
    if (!confirmed || started.current) return
    started.current = true
    void (async () => {
      const result = await spawnBackgroundFork(
        seed,
        prompt,
        effort,
        'command',
        messages,
      )
      if (!result.ok) {
        onDone(result.error)
        return
      }
      logEvent('tengu_background_fork', {
        confirmed: summary.count > 0,
        inflight_count: summary.count,
        had_prompt: prompt.length > 0,
        had_worktree: result.hadWorktree,
        worktree_handed_off: result.handedOff,
      })
      onDone()
      await gracefulShutdown(0, 'prompt_input_exit', {
        suppressResumeHint: true,
        finalMessage: formatBgHints(
          result.short,
          result.handedOff ? '(worktree handed off)' : undefined,
        ),
      })
    })()
  }, [confirmed, effort, messages, onDone, prompt, seed, summary.count])

  if (confirmed) return <Text dimColor>Backgrounding…</Text>

  const cancel = (): void => {
    logEvent('tengu_background_declined', {
      inflight_count: summary.count,
    })
    onDone()
  }

  return (
    <Dialog
      title="Background this session?"
      subtitle={`${summary.summary} running — the forked session won't carry live processes.`}
      onCancel={cancel}
    >
      <Select
        options={[
          {
            label: 'Background anyway (tasks will be abandoned)',
            value: 'confirm',
          },
          { label: 'Stay', value: 'cancel' },
        ]}
        defaultFocusValue="confirm"
        onChange={value =>
          value === 'confirm' ? setConfirmed(true) : cancel()
        }
        onCancel={cancel}
      />
    </Dialog>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  if (isBgSession()) {
    logEvent('tengu_background_already_bg', {})
    onDone()
    detachBackgroundSession()
    return null
  }
  if (isTranscriptPersistenceDisabled()) {
    onDone(
      'Cannot background — session persistence is disabled, so the forked job would have nothing to resume.',
    )
    return null
  }
  const prompt = (args ?? '').trim()
  const seed = deriveBackgroundSeed(context.messages, prompt)
  if (seed === null) {
    onDone('Nothing to background yet — send a message first.')
    return null
  }
  return (
    <BackgroundCommandDialog
      onDone={onDone}
      prompt={prompt}
      seed={seed}
      messages={context.messages}
    />
  )
}
