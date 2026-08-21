import React from 'react'
import { BLACK_CIRCLE } from '../../constants/figures.js'
import { Box, Button, Text } from '../../ink.js'
import { useDebouncedDigitInput } from './useDebouncedDigitInput.js'

export type TranscriptShareResponse = 'yes' | 'no' | 'dont_ask_again'

type Props = {
  onSelect: (option: TranscriptShareResponse) => void
  inputValue: string
  setInputValue: (value: string) => void
}

const RESPONSE_INPUTS = ['y', 'n', 'd'] as const
type ResponseInput = (typeof RESPONSE_INPUTS)[number]

const inputToResponse: Record<ResponseInput, TranscriptShareResponse> = {
  y: 'yes',
  n: 'no',
  d: 'dont_ask_again',
}

const responseOptions: ReadonlyArray<{
  key: ResponseInput
  label: string
  width?: number
}> = [
  { key: 'y', label: 'Yes', width: 10 },
  { key: 'n', label: 'No', width: 10 },
  { key: 'd', label: "Don't ask again" },
]

const isValidResponseInput = (input: string): input is ResponseInput =>
  (RESPONSE_INPUTS as readonly string[]).includes(input.toLowerCase())

export function TranscriptSharePrompt({
  onSelect,
  inputValue,
  setInputValue,
}: Props): React.ReactNode {
  const selectTypedInput = (input: string) => {
    const normalized = input.toLowerCase()
    if (isValidResponseInput(normalized)) {
      onSelect(inputToResponse[normalized])
    }
  }

  useDebouncedDigitInput({
    inputValue,
    setInputValue,
    isValidDigit: isValidResponseInput,
    onDigit: selectTypedInput,
  })

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="ansi:cyan">{BLACK_CIRCLE} </Text>
        <Text bold>
          Can Anthropic look at your session transcript to help us improve
          Claude Code?
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text dimColor>
          Learn more:
          https://code.claude.com/docs/en/data-usage#session-quality-surveys
        </Text>
      </Box>
      <Box marginLeft={2}>
        {responseOptions.map(({ key, label, width }) => (
          <Box key={key} width={width}>
            <Button
              tabIndex={-1}
              onAction={() => {
                setInputValue('')
                onSelect(inputToResponse[key])
              }}
            >
              {({ hovered }) => (
                <Text
                  backgroundColor={
                    hovered ? 'userMessageBackgroundHover' : undefined
                  }
                >
                  <Text color="ansi:cyan">{key}</Text>: {label}
                </Text>
              )}
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
