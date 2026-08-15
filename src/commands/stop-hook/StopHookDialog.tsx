import * as React from 'react'
import { useState } from 'react'
import TextInput from '../../components/TextInput.js'
import { Byline } from '../../components/design-system/Byline.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'

type FocusedField = 'input' | 'delete'

export type StopHookDialogProps = {
  initialPrompt?: string
  existingHookPresent?: boolean
  onSubmit(prompt: string): void
  onCancel(): void
}

function toggleFocusedField(field: FocusedField): FocusedField {
  return field === 'input' ? 'delete' : 'input'
}

export function StopHookDialog({
  initialPrompt = '',
  existingHookPresent = false,
  onSubmit,
  onCancel,
}: StopHookDialogProps): React.ReactNode {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [cursorOffset, setCursorOffset] = useState(initialPrompt.length)
  const [focusedField, setFocusedField] = useState<FocusedField>('input')
  const { columns } = useTerminalSize()
  const trimmedPrompt = prompt.trim()
  const promptIsEmpty = trimmedPrompt.length === 0
  const deletingFromInput = existingHookPresent && promptIsEmpty

  function submitPrompt(): void {
    if (promptIsEmpty && !deletingFromInput) return
    onSubmit(trimmedPrompt)
  }

  function deleteHook(): void {
    onSubmit('')
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!existingHookPresent) return
    if (event.key === 'tab') {
      event.preventDefault()
      setFocusedField(toggleFocusedField)
      return
    }
    if (focusedField === 'delete' && event.key === 'return') {
      event.preventDefault()
      deleteHook()
    }
  }

  useKeybinding('confirm:no', onCancel, {
    context: 'Settings',
    isActive: true,
  })

  const inputFocused = focusedField === 'input'

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title="Set Stop hook (this session only)"
        subtitle="Enter a stopping condition. A good condition asks whether something has been done."
        color="permission"
        onCancel={onCancel}
        isCancelActive={false}
        inputGuide={exitState => {
          if (exitState.pending) {
            return <Text>Press {exitState.keyName} again to exit</Text>
          }
          return (
            <Byline>
              <KeyboardShortcutHint
                chord="enter"
                action={focusedField === 'delete'
                  ? 'delete hook'
                  : deletingFromInput
                    ? 'delete hook'
                    : existingHookPresent
                      ? 'update hook'
                      : 'add hook'}
              />
              {existingHookPresent ? (
                <KeyboardShortcutHint chord="tab" action="switch focus" />
              ) : null}
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Settings"
                fallback="Esc"
                description="cancel"
              />
            </Byline>
          )
        }}
      >
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1} marginTop={1}>
            <Text>&gt;</Text>
            <TextInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={submitPrompt}
              focus={inputFocused}
              showCursor={inputFocused}
              multiline={false}
              columns={columns - 4}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              placeholder="e.g. Has Claude completed all requested tasks?"
              disableEscapeDoublePress
            />
          </Box>
          {existingHookPresent ? (
            <Box marginTop={1}>
              <Text
                color={focusedField === 'delete' ? 'error' : undefined}
                dimColor={focusedField !== 'delete'}
              >
                {focusedField === 'delete' ? '› ' : '  '}Delete this hook
              </Text>
            </Box>
          ) : null}
        </Box>
      </Dialog>
    </Box>
  )
}
