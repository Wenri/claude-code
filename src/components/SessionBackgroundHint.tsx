import * as React from 'react'
import { useCallback } from 'react'
import { Box, Text } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js'
import { useAppStateStore, useSetAppState } from '../state/AppState.js'
import { backgroundAll } from '../tasks/LocalShellTask/LocalShellTask.js'
import { env } from '../utils/env.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'

type Props = {
  onBackground?: () => void
}

/**
 * Persistent Ctrl+B affordance shown while a foreground tool can be moved to
 * the background. tmux consumes the first Ctrl+B as its prefix, so its label
 * makes the required double chord explicit.
 */
export function SessionBackgroundHint(props: Props = {}): React.ReactNode {
  const { onBackground } = props
  const setAppState = useSetAppState()
  const appStateStore = useAppStateStore()
  const handleBackground = useCallback(() => {
    backgroundAll(() => appStateStore.getState(), setAppState)
    onBackground?.()
  }, [appStateStore, onBackground, setAppState])

  useKeybinding('task:background', handleBackground, { context: 'Task' })
  const baseShortcut = useShortcutDisplay('task:background', 'Task', 'ctrl+b')
  const shortcut =
    env.terminal === 'tmux' && baseShortcut === 'ctrl+b'
      ? 'ctrl+b ctrl+b (twice)'
      : baseShortcut

  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) return null

  return (
    <Box paddingLeft={5}>
      <Text dimColor>
        <KeyboardShortcutHint
          chord={shortcut}
          action="run in background"
          parens
          format={{ keyCase: 'lower' }}
        />
      </Text>
    </Box>
  )
}
