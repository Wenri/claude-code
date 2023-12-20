import { randomUUID } from 'crypto'
import React, { useEffect, useState } from 'react'
import type { Command } from '../../commands.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text, useInput } from '../../ink.js'
import type { AppState } from '../../state/AppStateStore.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getRainbowColor } from '../../utils/thinking.js'
import { getCompanion, rollWithSeed, type Roll } from '../../buddy/companion.js'
import {
  fireCompanionHatchObserver,
  fireCompanionPetObserver,
  getLastBuddyReaction,
} from '../../buddy/observer.js'
import { renderSprite } from '../../buddy/sprites.js'
import { generateCompanionSoul } from '../../buddy/soul.js'
import {
  type Companion,
  RARITY_COLORS,
  RARITY_STARS,
  STAT_NAMES,
} from '../../buddy/types.js'
import { isBuddyLive } from '../../buddy/useBuddyNotification.js'

const EGG_TICK_MS = 160
const SHAKE_FRAME_COUNT = 4
const SHAKE_CYCLES = 3

const EGG = [
  '    _____    ',
  '   /     \\   ',
  '  /       \\  ',
  ' |         | ',
  '  \\       /  ',
  '   \\_____/   ',
]

const EGG_FRAMES = [
  { offset: 0, lines: EGG },
  { offset: 1, lines: EGG },
  { offset: -1, lines: EGG },
  { offset: 1, lines: EGG },
  {
    offset: 0,
    lines: [
      '    _____    ',
      '   /     \\   ',
      '  /       \\  ',
      ' |    .    | ',
      '  \\       /  ',
      '   \\_____/   ',
    ],
  },
  {
    offset: -1,
    lines: [
      '    _____    ',
      '   /     \\   ',
      '  /       \\  ',
      ' |    ∕    | ',
      '  \\       /  ',
      '   \\_____/   ',
    ],
  },
  {
    offset: 1,
    lines: [
      '    _____    ',
      '   /     \\   ',
      '  /   .   \\  ',
      ' |   ∕ \\   | ',
      '  \\       /  ',
      '   \\_____/   ',
    ],
  },
  {
    offset: 0,
    lines: [
      '    _____    ',
      '   /  .  \\   ',
      '  /  ∕ \\  \\  ',
      ' |  ∕   \\  | ',
      '  \\   .   /  ',
      '   \\_____/   ',
    ],
  },
  {
    offset: -1,
    lines: [
      '    _____    ',
      '   / ∕ \\ \\   ',
      '  / ∕   \\ \\  ',
      ' | ∕     \\ | ',
      '  \\   ∨   /  ',
      '   \\__∨__/   ',
    ],
  },
  {
    offset: 1,
    lines: [
      '    __ __    ',
      '   / V V \\   ',
      '  / ∕   \\ \\  ',
      ' | ∕     \\ | ',
      '  \\   ∨   /  ',
      '   \\__∨__/   ',
    ],
  },
  {
    offset: 0,
    lines: [
      '   ·  ✦  ·   ',
      '  ·       ·  ',
      ' ·    ✦    · ',
      '  ✦       ✦  ',
      ' ·    ·    · ',
      '   ·  ✦  ·   ',
    ],
  },
] as const

const CRACK_FRAME_COUNT = EGG_FRAMES.length - SHAKE_FRAME_COUNT

export function CompanionStat({
  name,
  value,
}: {
  name: string
  value: number
}): React.ReactNode {
  const filled = Math.round(value / 10)
  return (
    <Box>
      <Text>{name.padEnd(10)} </Text>
      <Text>{'█'.repeat(filled)}{'░'.repeat(10 - filled)} </Text>
      <Text dimColor>{String(value).padStart(3)}</Text>
    </Box>
  )
}

export function CompanionCard({
  companion,
  lastReaction,
  onDone,
}: {
  companion: Companion
  lastReaction?: string
  onDone?: LocalJSXCommandOnDone
}): React.ReactNode {
  const color = RARITY_COLORS[companion.rarity]
  const sprite = renderSprite(companion)
  useInput(() => onDone?.(undefined, { display: 'skip' }), {
    isActive: onDone !== undefined,
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={2}
      paddingY={1}
      width={40}
      flexShrink={0}
    >
      <Box justifyContent="space-between">
        <Text bold color={color}>
          {RARITY_STARS[companion.rarity]} {companion.rarity.toUpperCase()}
        </Text>
        <Text color={color}>{companion.species.toUpperCase()}</Text>
      </Box>
      {companion.shiny && (
        <Text color="warning" bold>✨ SHINY ✨</Text>
      )}
      <Box flexDirection="column" marginY={1}>
        {sprite.map((line, index) => (
          <Text key={index} color={color}>{line}</Text>
        ))}
      </Box>
      <Text bold>{companion.name}</Text>
      <Box marginY={1}>
        <Text dimColor italic>{`"${companion.personality}"`}</Text>
      </Box>
      <Box flexDirection="column">
        {STAT_NAMES.map(name => (
          <CompanionStat key={name} name={name} value={companion.stats[name]} />
        ))}
      </Box>
      {lastReaction && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>last said</Text>
          <Box borderStyle="round" borderColor="inactive" paddingX={1}>
            <Text dimColor italic>{lastReaction}</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}

export function BuddyHatch({
  hatching,
  onDone,
}: {
  hatching: Promise<Companion>
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const { columns } = useTerminalSize()
  const [tick, setTick] = useState(0)
  const [resolved, setResolved] = useState<Companion | null>(null)
  const [crackStartedAt, setCrackStartedAt] = useState<number | null>(null)
  const [hatched, setHatched] = useState<Companion | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), EGG_TICK_MS)
    void hatching.then(setResolved)
    return () => clearInterval(timer)
  }, [hatching])

  const shakeTicks = SHAKE_CYCLES * SHAKE_FRAME_COUNT
  if (crackStartedAt === null && resolved !== null && tick >= shakeTicks) {
    setCrackStartedAt(tick)
  }

  let frameIndex: number
  if (crackStartedAt === null) {
    frameIndex = tick % SHAKE_FRAME_COUNT
  } else {
    const elapsed = tick - crackStartedAt
    if (elapsed < CRACK_FRAME_COUNT) {
      frameIndex = SHAKE_FRAME_COUNT + elapsed
    } else {
      frameIndex = EGG_FRAMES.length - 1
      if (!hatched && resolved) setHatched(resolved)
    }
  }

  if (hatched) {
    return (
      <Box flexDirection="column">
        <CompanionCard companion={hatched} onDone={onDone} />
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{hatched.name} is here · it'll chime in as you code</Text>
          <Text dimColor>your buddy won't count toward your usage</Text>
          <Text dimColor>say its name to get its take · /buddy pet · /buddy off</Text>
          <Box marginTop={1}><Text dimColor>press any key</Text></Box>
        </Box>
      </Box>
    )
  }

  const frame = EGG_FRAMES[frameIndex]!
  const leftPad = ' '.repeat(1 + frame.offset)
  const rightPad = ' '.repeat(1 - frame.offset)
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      width={columns}
      borderStyle="round"
      borderColor={getRainbowColor(tick)}
      paddingY={1}
    >
      {frame.lines.map((line, index) => (
        <Text key={index}>{leftPad}{line}{rightPad}</Text>
      ))}
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Text dimColor>hatching a coding buddy…</Text>
        <Text dimColor>it'll watch you work and occasionally have opinions</Text>
      </Box>
    </Box>
  )
}

export async function generateAndSaveCompanion(
  roll: Roll,
  signal?: AbortSignal,
): Promise<Companion> {
  const soul = await generateCompanionSoul(
    roll.bones,
    roll.inspirationSeed,
    signal,
  )
  const hatchedAt = Date.now()
  saveGlobalConfig(current => ({
    ...current,
    companion: { ...soul, hatchedAt },
  }))
  return { ...roll.bones, ...soul, hatchedAt }
}

function reactionSetter(
  setAppState: LocalJSXCommandContext['setAppState'],
): (reaction: string) => void {
  return reaction =>
    setAppState((previous: AppState) =>
      previous.companionReaction === reaction
        ? previous
        : { ...previous, companionReaction: reaction },
    )
}

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Hatch a coding companion · pet, off',
  isHidden: !isBuddyLive(),
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        context: LocalJSXCommandContext,
        args: string,
      ): Promise<React.ReactNode> {
        const config = getGlobalConfig()
        const action = args?.trim()
        if (action === 'pet') {
          const companion = getCompanion()
          if (!companion) {
            onDone('no companion yet · run /buddy first', { display: 'system' })
            return null
          }
          if (config.companionMuted === true) {
            saveGlobalConfig(current => ({ ...current, companionMuted: false }))
          }
          context.setAppState(previous => ({
            ...previous,
            companionPetAt: Date.now(),
          }))
          fireCompanionPetObserver(reactionSetter(context.setAppState))
          onDone(`petted ${companion.name}`, { display: 'system' })
          return null
        }
        if (action === 'off') {
          if (config.companionMuted !== true) {
            saveGlobalConfig(current => ({ ...current, companionMuted: true }))
          }
          onDone('companion muted', { display: 'system' })
          return null
        }
        if (action === 'on') {
          if (config.companionMuted === true) {
            saveGlobalConfig(current => ({ ...current, companionMuted: false }))
          }
          onDone('companion unmuted', { display: 'system' })
          return null
        }
        if (config.companionMuted === true) {
          saveGlobalConfig(current => ({ ...current, companionMuted: false }))
        }

        const companion = getCompanion()
        if (companion) {
          return (
            <CompanionCard
              companion={companion}
              lastReaction={getLastBuddyReaction()}
              onDone={onDone}
            />
          )
        }

        const hatching = generateAndSaveCompanion(rollWithSeed(randomUUID()))
        void hatching
          .then(value =>
            fireCompanionHatchObserver(
              value,
              reactionSetter(context.setAppState),
            ),
          )
          .catch(() => {})
        return <BuddyHatch hatching={hatching} onDone={onDone} />
      },
    }),
} satisfies Command

export default buddy
