import * as React from 'react'
import { useState } from 'react'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { logEvent } from '../../services/analytics/index.js'
import {
  isAutoCompactEnabled,
  resolveAutoCompactWindow,
} from '../../services/compact/autoCompact.js'
import { useAppState } from '../../state/AppState.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { formatTokens } from '../../utils/format.js'
import { applyAutoCompactWindow } from './autocompact-noninteractive.js'

const STEP = 100_000
const MINIMUM = 100_000
const MAXIMUM = 1_000_000
const MODEL_DEFAULT = 0
const LEARN_MORE = 'https://claude.com/blog/1m-context-ga'

function AutoCompactDialog({
  onDone,
  context,
}: {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
}): React.ReactNode {
  const configuredWindow = useAppState(state => state.autoCompactWindow)
  const model = useMainLoopModel()
  const resolution = resolveAutoCompactWindow(model, configuredWindow)
  const {
    window: effectiveWindow,
    configured,
    source,
  } = resolution
  const enabled = isAutoCompactEnabled()
  const capped = configured > effectiveWindow
  const environmentOverride = source === 'env'
  const sourceLabel =
    source === 'env'
      ? 'from CLAUDE_CODE_AUTO_COMPACT_WINDOW'
      : source === 'settings'
        ? 'from settings'
        : 'from default'
  const initialSelection =
    source === 'auto'
      ? MODEL_DEFAULT
      : Math.min(
          MAXIMUM,
          Math.max(MINIMUM, Math.round(configured / STEP) * STEP),
        )
  const [selection, setSelection] = useState(initialSelection)
  const [changed, setChanged] = useState(false)

  const move = (direction: number) => {
    if (environmentOverride) return
    setChanged(true)
    setSelection(previous => {
      if (previous === MODEL_DEFAULT) {
        return direction > 0 ? MINIMUM : MAXIMUM
      }
      const next = previous + direction * STEP
      if (next < MINIMUM || next > MAXIMUM) return MODEL_DEFAULT
      return next
    })
  }

  const cappedLabel = capped
    ? ` · capped to ${formatTokens(effectiveWindow)} by model`
    : ''
  const current = `${formatTokens(configured)} tokens (${sourceLabel})${cappedLabel}`
  const finish = () => {
    if (!changed) {
      onDone(`Auto-compact window unchanged: ${current}`)
      return
    }
    const value = selection === MODEL_DEFAULT ? 'reset' : String(selection)
    onDone(applyAutoCompactWindow(value, context))
  }

  useKeybindings(
    {
      'select:previous': () => move(1),
      'select:next': () => move(-1),
      'select:accept': finish,
      'tabs:next': () => move(1),
      'tabs:previous': () => move(-1),
    },
    { context: 'Select' },
  )

  const selectedLabel =
    selection === MODEL_DEFAULT
      ? 'Model default'
      : `${formatTokens(selection)} tokens`

  return (
    <Dialog
      title="Auto-compact"
      subtitle={`Current setting: ${current}`}
      onCancel={() => onDone(`Auto-compact window unchanged: ${current}`)}
      inputGuide={() => (
        <Box>
          <ConfigurableShortcutHint
            action="select:previous"
            context="Select"
            fallback="↑/↓"
            description="change"
          />
          <Text> · </Text>
          <ConfigurableShortcutHint
            action="select:accept"
            context="Select"
            fallback="Enter"
            description="apply"
          />
        </Box>
      )}
    >
      <Box flexDirection="column" gap={1}>
        <Text>
          This command configures when auto-compaction happens. The actual
          threshold is the minimum of this setting and your model&apos;s context
          window.
        </Text>
        {!enabled && (
          <Text color="warning">
            Auto-compact is currently disabled (see /config)
          </Text>
        )}
        {environmentOverride ? (
          <Text color="warning">
            CLAUDE_CODE_AUTO_COMPACT_WINDOW is set and takes precedence. Unset
            it to change this setting here.
          </Text>
        ) : (
          <Box>
            <Text>Select auto-compact window: </Text>
            <Text bold color="suggestion">
              {selectedLabel}
            </Text>
          </Box>
        )}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Long context that holds up</Text>
          <Text>
            Both Opus 4.6 and Sonnet 4.6 achieve state-of-the-art scores on
            long-context retrieval benchmarks at 1M tokens — Opus 4.6 scores
            78.3% on MRCR v2, the highest among frontier models at that length.
            Opus 4.6 includes 1M context at standard pricing; Sonnet 4.6 1M is
            available with overages.
          </Text>
          <Text dimColor>Learn more: {LEARN_MORE}</Text>
        </Box>
      </Box>
    </Dialog>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode> {
  const value = args?.trim() ?? ''
  if (value) {
    onDone(applyAutoCompactWindow(value, context))
    return null
  }
  logEvent('tengu_autocompact_dialog_opened', { source: 'dialog' })
  return <AutoCompactDialog onDone={onDone} context={context} />
}
