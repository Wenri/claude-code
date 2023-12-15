import { basename } from 'path'
import * as React from 'react'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Button, Text } from '../../ink.js'
import { stringWidth } from '../../ink/stringWidth.js'
import {
  type MemoryWriteSurveyRecord,
  truncateMemoryWriteContent,
  truncateMemoryWriteHunks,
} from '../../memdir/memoryWriteSurvey.js'
import { plural } from '../../utils/stringUtils.js'
import { Divider } from '../design-system/Divider.js'
import { StructuredDiffList } from '../StructuredDiffList.js'
import { useDebouncedDigitInput } from './useDebouncedDigitInput.js'
import {
  getMemoryWriteContentWidth,
  type MemoryWriteSurveyOutcome,
} from './useMemoryWriteSurvey.js'

type ResponseInput = '1' | '2'
const INPUT_TO_OUTCOME: Record<ResponseInput, MemoryWriteSurveyOutcome> = {
  '1': 'approve',
  '2': 'reject',
}

export function MemoryWriteSurvey({
  record,
  summary,
  summaryLineThreshold,
  countdownSec,
  onOutcome,
  inputValue,
  setInputValue,
}: {
  record: MemoryWriteSurveyRecord
  summary: string | null
  summaryLineThreshold: number
  countdownSec: number | null
  onOutcome: (outcome: MemoryWriteSurveyOutcome) => void
  inputValue: string
  setInputValue: (value: string) => void
}): React.ReactNode {
  const { columns } = useTerminalSize()
  useDebouncedDigitInput<ResponseInput>({
    inputValue,
    setInputValue,
    isValidDigit: (digit): digit is ResponseInput =>
      digit === '1' || digit === '2',
    onDigit: digit => onOutcome(INPUT_TO_OUTCOME[digit]),
  })

  const contentWidth = getMemoryWriteContentWidth(columns)
  const filename = basename(record.filePath)
  const ruleWidth = Math.max(0, columns - 2 - stringWidth(filename) - 1)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Box minWidth={2}>
          <Text color="ansi:cyan">●</Text>
        </Box>
        <Text bold>Memory {record.isEdit ? 'updated' : 'written'}</Text>
        {countdownSec !== null && (
          <Text dimColor> · auto-hides in {countdownSec}s</Text>
        )}
      </Box>
      <Box flexDirection="column">
        <Box>
          <Box minWidth={2}>
            <Text dimColor>╌</Text>
          </Box>
          <Text dimColor>
            {filename} {'╌'.repeat(ruleWidth)}
          </Text>
        </Box>
        <Box paddingX={1} flexDirection="column">
          <MemoryWriteContent
            record={record}
            summary={summary}
            maxLines={summaryLineThreshold}
            width={contentWidth}
          />
        </Box>
        <Divider char="╌" />
      </Box>
      <SurveyOptions
        onSelect={digit => {
          setInputValue('')
          onOutcome(INPUT_TO_OUTCOME[digit])
        }}
      />
    </Box>
  )
}

function MemoryWriteContent({
  record,
  summary,
  maxLines,
  width,
}: {
  record: MemoryWriteSurveyRecord
  summary: string | null
  maxLines: number
  width: number
}): React.ReactNode {
  const content = record.isEdit
    ? null
    : truncateMemoryWriteContent(record.body, width, maxLines)
  const patch = record.isEdit
    ? truncateMemoryWriteHunks(record.structuredPatch, width, maxLines)
    : null

  if (summary) return <Text wrap="wrap">{summary}</Text>

  if (record.isEdit && record.structuredPatch.length > 0 && patch) {
    return (
      <>
        <StructuredDiffList
          hunks={patch.hunks}
          dim={false}
          width={width}
          filePath={record.filePath}
          firstLine={null}
        />
        {patch.hiddenRows > 0 && <TruncatedLines count={patch.hiddenRows} />}
      </>
    )
  }

  if (!content) return null
  return (
    <>
      <Text wrap="wrap">{content.text}</Text>
      {content.hiddenRows > 0 && (
        <TruncatedLines count={content.hiddenRows} />
      )}
    </>
  )
}

function SurveyOptions({
  onSelect,
}: {
  onSelect: (digit: ResponseInput) => void
}): React.ReactNode {
  const options: ReadonlyArray<{ key: ResponseInput; label: string }> = [
    { key: '1', label: 'Keep' },
    { key: '2', label: 'Undo' },
  ]
  return (
    <Box marginLeft={2}>
      {options.map(({ key, label }) => (
        <Box key={key} width={10}>
          <Button tabIndex={-1} onAction={() => onSelect(key)}>
            {({ hovered }) => (
              <Box
                backgroundColor={
                  hovered ? 'userMessageBackgroundHover' : undefined
                }
              >
                <Text color="ansi:cyan">{key}</Text>: {label}
              </Box>
            )}
          </Button>
        </Box>
      ))}
    </Box>
  )
}

function TruncatedLines({ count }: { count: number }): React.ReactNode {
  if (count <= 0) return null
  return (
    <Text dimColor>
      … +{count} {plural(count, 'line')}
    </Text>
  )
}
