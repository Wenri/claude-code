import figures from 'figures'
import React, { useState } from 'react'
import { Box, Text } from '../ink.js'
import { useKeybinding, useKeybindings } from '../keybindings/useKeybinding.js'
import { stringWidth } from '../ink/stringWidth.js'
import { Dialog } from './design-system/Dialog.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import TextInput from './TextInput.js'

export type TextFormField = {
  type: 'text'
  key: string
  label: string
  required?: boolean
  mask?: string
  placeholder?: string
  hint?: (value: string, values: Record<string, string>) => React.ReactNode
  validate?: (
    value: string,
    values: Record<string, string>,
  ) => string | null
}

export type SelectFormField = {
  type: 'select'
  key: string
  label: string
  options: Array<{ label: string; value: string }>
}

export type FormField = TextFormField | SelectFormField

type Props = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  fields: FormField[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel?: string
}

function validateField(
  field: FormField,
  values: Record<string, string>,
): string | null {
  if (field.type !== 'text') return null
  const value = values[field.key] ?? ''
  if (field.required && value.trim() === '') return `${field.label} is required`
  return field.validate?.(value, values) ?? null
}

function labelWidth(field: FormField): number {
  return stringWidth(field.label)
}

/**
 * A compact keyboard-driven form. Text fields retain their own cursor while
 * select fields and the submit row use the shared Select/Tabs keybindings.
 */
export function Form({
  title,
  subtitle,
  fields,
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
}: Props): React.ReactNode {
  const rowCount = fields.length + 1
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [cursorOffset, setCursorOffset] = useState(() => {
    const first = fields[0]
    return first?.type === 'text' ? (values[first.key] ?? '').length : 0
  })
  const focusedField =
    focusedIndex < fields.length ? fields[focusedIndex] : null
  const focusedIsText = focusedField?.type === 'text'
  const maxLabelWidth = Math.max(...fields.map(labelWidth))
  const firstError = fields.map(field => validateField(field, values)).find(
    (error): error is string => error !== null,
  )

  function focusRow(nextIndex: number): void {
    const clamped = Math.max(0, Math.min(rowCount - 1, nextIndex))
    if (clamped === focusedIndex) return
    setFocusedIndex(clamped)
    const nextField = fields[clamped]
    if (nextField?.type === 'text') {
      setCursorOffset((values[nextField.key] ?? '').length)
    }
  }

  function submit(): void {
    if (!firstError) onSubmit()
  }

  function moveSelection(direction: number): void {
    if (focusedField?.type !== 'select') return
    const options = focusedField.options
    const selected = values[focusedField.key] ?? options[0]?.value ?? ''
    const selectedIndex = options.findIndex(option => option.value === selected)
    const option =
      options[(selectedIndex + direction + options.length) % options.length]
    if (option) onChange(focusedField.key, option.value)
  }

  useKeybindings(
    {
      'select:previous': () => focusRow(focusedIndex - 1),
      'select:next': () => focusRow(focusedIndex + 1),
      'select:accept': () => {
        if (focusedIndex === rowCount - 1) submit()
        else focusRow(focusedIndex + 1)
      },
      'select:cancel': onCancel,
    },
    { context: 'Select', isActive: !focusedIsText },
  )
  useKeybinding('confirm:no', onCancel, { context: 'Settings' })
  useKeybindings(
    {
      'tabs:previous': () => moveSelection(-1),
      'tabs:next': () => moveSelection(1),
    },
    { context: 'Tabs', isActive: focusedField?.type === 'select' },
  )

  const currentValue = focusedField
    ? (values[focusedField.key] ?? '')
    : ''
  const currentError =
    focusedField?.type === 'text' && focusedField.validate
      ? focusedField.validate(currentValue, values)
      : null
  const currentHint =
    !currentError && focusedField?.type === 'text'
      ? focusedField.hint?.(currentValue, values)
      : undefined

  return (
    <Dialog
      title={title}
      subtitle={subtitle}
      onCancel={onCancel}
      hideInputGuide
      isCancelActive={false}
    >
      <Box flexDirection="column">
        {fields.map((field, index) => {
          const focused = index === focusedIndex
          const value = values[field.key] ?? ''
          const requiredMissing =
            field.type === 'text' && field.required && value.trim() === ''
          const pointerColor = focused ? 'suggestion' : undefined
          const padding = ' '.repeat(
            Math.max(0, maxLabelWidth - stringWidth(field.label)),
          )
          let input: React.ReactNode
          if (field.type === 'select') {
            const option =
              field.options.find(candidate => candidate.value === value) ??
              field.options[0]
            input = focused ? (
              <Text>
                <Text dimColor>{figures.triangleLeft} </Text>
                {option?.label ?? value}
                <Text dimColor> {figures.triangleRight}</Text>
              </Text>
            ) : (
              <Text>{option?.label ?? value}</Text>
            )
          } else if (focused) {
            input = (
              <TextInput
                value={value}
                onChange={next => onChange(field.key, next)}
                onSubmit={() => {
                  if (index === fields.length - 1) submit()
                  else focusRow(index + 1)
                }}
                onExit={onCancel}
                onHistoryUp={() => focusRow(index - 1)}
                onHistoryDown={() => focusRow(index + 1)}
                placeholder={field.placeholder}
                mask={field.mask}
                columns={60}
                cursorOffset={cursorOffset}
                onChangeCursorOffset={setCursorOffset}
                disableCursorMovementForUpDownKeys
                disableEscapeDoublePress
                focus
                showCursor
              />
            )
          } else if (value) {
            input = (
              <Text>
                {field.mask
                  ? field.mask.repeat(Math.min(stringWidth(value), 60))
                  : value}
              </Text>
            )
          } else {
            input = <Text dimColor>{field.placeholder ?? ''}</Text>
          }
          return (
            <Box key={field.key}>
              <Text color={pointerColor}>{focused ? figures.pointer : ' '} </Text>
              <Text dimColor={!focused}>
                {field.label}
                {requiredMissing ? <Text color="error">*</Text> : ' '}
                {padding}{' '}
              </Text>
              {input}
            </Box>
          )
        })}
        <Box marginTop={1}>
          <Text color={focusedIndex === rowCount - 1 ? 'suggestion' : undefined}>
            {focusedIndex === rowCount - 1 ? figures.pointer : ' '} {' '}
          </Text>
          <Text bold={focusedIndex === rowCount - 1} dimColor={!!firstError}>
            {submitLabel}
          </Text>
          {firstError && focusedIndex === rowCount - 1 ? (
            <Text color="error"> · {firstError}</Text>
          ) : null}
        </Box>
        <Box marginTop={1} minHeight={1}>
          {currentError ? (
            <Text color="error">{currentError}</Text>
          ) : currentHint ? (
            <Text dimColor>{currentHint}</Text>
          ) : (
            <Text> </Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            <KeyboardShortcutHint chord={['up', 'down']} action="move" />
            {focusedField?.type === 'select' ? (
              <KeyboardShortcutHint chord={['left', 'right']} action="change" />
            ) : null}
            <KeyboardShortcutHint chord="enter" action="continue" />
            <KeyboardShortcutHint chord="escape" action="cancel" />
          </Text>
        </Box>
      </Box>
    </Dialog>
  )
}
