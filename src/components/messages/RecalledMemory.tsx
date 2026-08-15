import React, { useMemo, useState } from 'react'
import { TEARDROP_ASTERISK } from '../../constants/figures.js'
import { useDebouncedDigitInput } from '../FeedbackSurvey/useDebouncedDigitInput.js'
import { Box, NoSelect, Text } from '../../ink.js'
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js'
import {
  type MessageRatingSentiment,
  useMessageRating,
  useRateMessage,
} from '../messageRating.js'

const SYNTHESIS_SOURCES_SEPARATOR = '\n\nSources: '
const SYNTHESIS_PATH = /^<synthesis:(.+)>$/

export type RecalledMemoryValue = {
  path: string
  content: string
}

export type MemoryScopeCounts = {
  cited_team_count: number
  cited_private_count: number
}

export function parseSynthesisContent(content: string): {
  synthesis: string
  sources: string[]
} {
  const separatorIndex = content.lastIndexOf(SYNTHESIS_SOURCES_SEPARATOR)
  if (separatorIndex === -1) return { synthesis: content, sources: [] }
  return {
    synthesis: content.slice(0, separatorIndex),
    sources: content
      .slice(separatorIndex + SYNTHESIS_SOURCES_SEPARATOR.length)
      .split(', ')
      .filter(Boolean),
  }
}

export function isTeamMemorySource(source: string): boolean {
  return source.startsWith('team/') || source.startsWith('team\\')
}

export function allMemoriesAreSyntheses(
  memories: readonly RecalledMemoryValue[],
): boolean {
  return memories.length > 0 && memories.every(memory => SYNTHESIS_PATH.test(memory.path))
}

export function getMemoryScopeCounts(
  memories: readonly RecalledMemoryValue[],
): MemoryScopeCounts {
  let citedTeamCount = 0
  let citedPrivateCount = 0
  for (const memory of memories) {
    for (const source of parseSynthesisContent(memory.content).sources) {
      if (isTeamMemorySource(source)) citedTeamCount++
      else citedPrivateCount++
    }
  }
  return {
    cited_team_count: citedTeamCount,
    cited_private_count: citedPrivateCount,
  }
}

function stripSynthesisBullet(line: string): string {
  return line.replace(/^-\s*/, '')
}

function SynthesisBullet({ line, index }: { line: string; index: number }) {
  return (
    <Box flexDirection="row" marginTop={index > 0 ? 1 : 0}>
      <Box width={4} flexShrink={0}>
        <Text dimColor>{'  · '}</Text>
      </Box>
      <Box flexShrink={1} flexGrow={1}>
        <Text wrap="wrap">{line}</Text>
      </Box>
    </Box>
  )
}

function MemoryRatingButton({
  label,
  color,
  sentiment,
  hover,
  rating,
  setHover,
  onRate,
}: {
  label: string
  color: 'success' | 'error'
  sentiment: MessageRatingSentiment
  hover: MessageRatingSentiment | null
  rating: MessageRatingSentiment | undefined
  setHover: (sentiment: MessageRatingSentiment | null) => void
  onRate: (sentiment: MessageRatingSentiment) => void
}) {
  const displayColor = hover === sentiment ? undefined : color
  const dimColor = rating !== undefined && rating !== sentiment
  return (
    <NoSelect
      onClick={() => onRate(sentiment)}
      onMouseEnter={() => setHover(sentiment)}
      onMouseLeave={() => setHover(null)}
    >
      <Text color={displayColor} dimColor={dimColor}>
        {label}
      </Text>
    </NoSelect>
  )
}

export function RecalledMemory({
  memories,
  messageUuid,
  addMargin,
  bg,
  isTranscriptMode,
}: {
  memories: readonly RecalledMemoryValue[]
  messageUuid?: string
  addMargin: boolean
  bg?: string
  isTranscriptMode?: boolean
}) {
  const rateMessage = useRateMessage()
  const rating = useMessageRating(messageUuid)
  const [hover, setHover] = useState<MessageRatingSentiment | null>(null)
  const canRate =
    isFullscreenEnvEnabled() &&
    !isTranscriptMode &&
    rateMessage !== null &&
    messageUuid !== undefined
  const scopeCounts = useMemo(() => getMemoryScopeCounts(memories), [memories])

  return (
    <Box
      flexDirection="column"
      marginTop={addMargin ? 1 : 0}
      backgroundColor={bg}
    >
      {memories.map((memory, index) => {
        const { synthesis } = parseSynthesisContent(memory.content)
        const lines = synthesis.split('\n').map(stripSynthesisBullet).filter(Boolean)
        return (
          <Box key={memory.path} flexDirection="column">
            <Box flexDirection="row">
              <Box minWidth={2}>
                <Text color="remember">{TEARDROP_ASTERISK}</Text>
              </Box>
              <Text bold color="remember">
                Recalled from memory
              </Text>
              {canRate && index === 0 ? (
                <>
                  <Text dimColor> · </Text>
                  <MemoryRatingButton
                    label="[Good]"
                    color="success"
                    sentiment="positive"
                    hover={hover}
                    rating={rating}
                    setHover={setHover}
                    onRate={sentiment =>
                      rateMessage(messageUuid, sentiment, 'tiny_memory', scopeCounts)
                    }
                  />
                  <Text> </Text>
                  <MemoryRatingButton
                    label="[Bad]"
                    color="error"
                    sentiment="negative"
                    hover={hover}
                    rating={rating}
                    setHover={setHover}
                    onRate={sentiment =>
                      rateMessage(messageUuid, sentiment, 'tiny_memory', scopeCounts)
                    }
                  />
                </>
              ) : null}
            </Box>
            {lines.map((line, lineIndex) => (
              <SynthesisBullet key={lineIndex} line={line} index={lineIndex} />
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

function isMemoryRatingKey(value: string): value is '+' | '-' {
  return value === '+' || value === '-'
}

function isSynthesizedMemoryAttachment(message: any): boolean {
  return (
    message.type === 'attachment' &&
    message.attachment.type === 'relevant_memories' &&
    allMemoriesAreSyntheses(message.attachment.memories)
  )
}

export function RecalledMemoryRatingInput({
  messages,
  inputValue,
  setInputValue,
  enabled,
}: {
  messages: readonly any[]
  inputValue: string
  setInputValue: (value: string) => void
  enabled: boolean
}) {
  const rateMessage = useRateMessage()
  const latestMemory = useMemo(() => {
    if (!enabled) return null
    const message = messages.findLast(isSynthesizedMemoryAttachment)
    if (message?.type !== 'attachment') return null
    if (message.attachment.type !== 'relevant_memories') return null
    return {
      uuid: message.uuid as string,
      scopeCounts: getMemoryScopeCounts(message.attachment.memories),
    }
  }, [enabled, messages])

  const onKey = (key: '+' | '-') => {
    if (rateMessage === null || latestMemory === null) return
    rateMessage(
      latestMemory.uuid,
      key === '+' ? 'positive' : 'negative',
      'tiny_memory',
      latestMemory.scopeCounts,
    )
  }
  const ratingEnabled = enabled && rateMessage !== null && latestMemory !== null
  useDebouncedDigitInput({
    inputValue,
    setInputValue,
    isValidDigit: isMemoryRatingKey,
    onDigit: onKey,
    enabled: ratingEnabled,
  })
  return null
}
