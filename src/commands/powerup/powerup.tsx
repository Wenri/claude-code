import figures from 'figures'
import * as React from 'react'
import { computeShimmerSegments } from '../../bridge/bridgeStatusUtil.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Byline } from '../../components/design-system/Byline.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { Pane } from '../../components/design-system/Pane.js'
import { ProgressBar } from '../../components/design-system/ProgressBar.js'
import { StatusIcon } from '../../components/design-system/StatusIcon.js'
import {
  BLACK_CIRCLE,
  DIAMOND_FILLED,
  DIAMOND_OPEN,
  EFFORT_MEDIUM,
  PAUSE_ICON,
} from '../../constants/figures.js'
import { Box, Text, useAnimationFrame } from '../../ink.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getInitialSettings } from '../../utils/settings/settings.js'

const DEMO_INTERVAL_MS = 3000
const DEMO_WIDTH = 48
const DEMO_HEIGHT = 3
const FRAME_MARKUP = /\[(\w+):([^\]]*)\]/g
const SHIMMER_INTERVAL_MS = 80
const CONFETTI_INTERVAL_MS = 60
const CONFETTI_DURATION_MS = 1400
const CONFETTI_ROWS = 16
const CONFETTI_MARGIN_LEFT = 60
const CONFETTI_WIDTH = 100

type DemoSegment = { text: string; color?: string }
type DemoLine = { dim: boolean; segments: DemoSegment[] }

function DemoBox({
  live,
  boxRef,
  children,
}: {
  live?: boolean
  boxRef?: ReturnType<typeof useAnimationFrame>[0]
  children: React.ReactNode
}): React.ReactNode {
  return (
    <Box
      ref={boxRef}
      borderStyle="round"
      borderColor="inactive"
      paddingX={1}
      width={DEMO_WIDTH}
      height={DEMO_HEIGHT + 2}
    >
      <Box flexDirection="column" width={DEMO_WIDTH - 4} height={DEMO_HEIGHT}>
        {children}
      </Box>
      <Box position="absolute" marginLeft={DEMO_WIDTH - 12}>
        <Text dimColor={!live} color={live ? 'claude' : undefined}>
          {live ? `${DIAMOND_FILLED} try it` : `  ${EFFORT_MEDIUM} demo`}
        </Text>
      </Box>
    </Box>
  )
}

export function parsePowerupDemoLine(line: string): DemoLine {
  const dim = line.startsWith('#')
  const text = dim ? line.slice(1) : line
  const segments: DemoSegment[] = []
  let offset = 0
  for (const match of text.matchAll(FRAME_MARKUP)) {
    if (match.index > offset) {
      segments.push({ text: text.slice(offset, match.index) })
    }
    segments.push({ text: match[2]!, color: match[1] })
    offset = match.index + match[0].length
  }
  if (offset < text.length) segments.push({ text: text.slice(offset) })
  if (segments.length === 0) segments.push({ text: '' })
  return { dim, segments }
}

function AnimatedDemo({ frames }: { frames: string[] }): React.ReactNode {
  const parsedFrames = React.useMemo(
    () => frames.map(frame => frame.split('\n').map(parsePowerupDemoLine)),
    [frames],
  )
  const prefersReducedMotion =
    getInitialSettings().prefersReducedMotion ?? false
  const [boxRef, time] = useAnimationFrame(
    prefersReducedMotion ? null : DEMO_INTERVAL_MS,
  )
  const frame =
    parsedFrames[Math.floor(time / DEMO_INTERVAL_MS) % parsedFrames.length]!
  return (
    <DemoBox boxRef={boxRef}>
      {frame.map((line, lineIndex) => (
        <Text key={lineIndex} dimColor={line.dim}>
          {line.segments.map((segment, segmentIndex) => (
            <Text key={segmentIndex} color={segment.color}>
              {segment.text}
            </Text>
          ))}
        </Text>
      ))}
    </DemoBox>
  )
}

const MODES = [
  { label: 'default', symbol: '', color: 'text' },
  { label: 'accept edits on', symbol: '⏵⏵', color: 'autoAccept' },
  { label: 'plan mode on', symbol: PAUSE_ICON, color: 'planMode' },
  { label: 'auto mode on', symbol: '⏵⏵', color: 'warning' },
] as const

function LiveModeDemo(): React.ReactNode {
  const [mode, setMode] = React.useState(0)
  const current = MODES[mode]!
  const shortcut = useShortcutDisplay('chat:cycleMode', 'Chat', 'shift+tab')
  useKeybindings(
    {
      'confirm:cycleMode': () =>
        setMode(previous => (previous + 1) % MODES.length),
    },
    { context: 'Confirmation' },
  )
  const symbol = current.symbol ? `${current.symbol} ` : '  '
  return (
    <DemoBox live>
      <Text>
        <Text dimColor>
          Press {shortcut} now
          {'\n\n'}
        </Text>
        <Text color={current.color}>
          {symbol}
          {current.label}
        </Text>
      </Text>
    </DemoBox>
  )
}

type ConfettiParticle = {
  x: number
  delay: number
  speed: number
  char: string
  color: string
}

const CONFETTI_CHARS = [
  DIAMOND_FILLED,
  DIAMOND_OPEN,
  BLACK_CIRCLE,
  '·',
]
const CONFETTI_COLORS = [
  'claude',
  'success',
  'warning',
  'suggestion',
  'autoAccept',
]

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

export function createPowerupConfetti(count: number): ConfettiParticle[] {
  return Array.from({ length: count }, () => ({
    x: Math.floor(Math.random() * CONFETTI_WIDTH),
    delay: Math.random() * 400,
    speed: 0.7 + Math.random() * 0.6,
    char: randomItem(CONFETTI_CHARS),
    color: randomItem(CONFETTI_COLORS),
  }))
}

function Celebration({ onDone }: { onDone: () => void }): React.ReactNode {
  const particles = React.useMemo(() => createPowerupConfetti(40), [])
  const prefersReducedMotion =
    getInitialSettings().prefersReducedMotion ?? false
  const [boxRef, time] = useAnimationFrame(
    prefersReducedMotion ? null : CONFETTI_INTERVAL_MS,
  )
  const initialTime = React.useRef(time)
  const elapsed = time - initialTime.current

  React.useEffect(() => {
    const timeout = setTimeout(onDone, CONFETTI_DURATION_MS + 600)
    return () => clearTimeout(timeout)
  }, [onDone])

  const rows: ConfettiParticle[][] = Array.from(
    { length: CONFETTI_ROWS },
    () => [],
  )
  for (const particle of particles) {
    const adjustedElapsed = Math.max(0, elapsed - particle.delay)
    const row = Math.floor(
      (adjustedElapsed / CONFETTI_DURATION_MS) *
        CONFETTI_ROWS *
        particle.speed,
    )
    if (row >= 0 && row < CONFETTI_ROWS) rows[row]!.push(particle)
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x)

  return (
    <Box
      ref={boxRef}
      position="absolute"
      marginLeft={CONFETTI_MARGIN_LEFT}
      flexDirection="column"
      width={CONFETTI_WIDTH}
      height={CONFETTI_ROWS}
    >
      {rows.map((row, rowIndex) => {
        let previousX = 0
        return (
          <Box key={rowIndex} height={1}>
            {row.map((particle, particleIndex) => {
              const padding = Math.max(0, particle.x - previousX)
              previousX = Math.max(previousX, particle.x) + 1
              return (
                <Text key={particleIndex}>
                  {' '.repeat(padding)}
                  <Text color={particle.color}>{particle.char}</Text>
                </Text>
              )
            })}
          </Box>
        )
      })}
    </Box>
  )
}

function ShimmerTitle({ text }: { text: string }): React.ReactNode {
  const width = stringWidth(text)
  const prefersReducedMotion =
    getInitialSettings().prefersReducedMotion ?? false
  const [boxRef, time] = useAnimationFrame(
    prefersReducedMotion ? null : SHIMMER_INTERVAL_MS,
  )
  const cycleWidth = width + 20
  const glimmerIndex =
    Math.floor(time / SHIMMER_INTERVAL_MS) % cycleWidth - 10
  const { before, shimmer, after } = computeShimmerSegments(text, glimmerIndex)
  return (
    <Box ref={boxRef}>
      <Text bold color="claude">
        {before}
      </Text>
      <Text bold color="claudeShimmer">
        {shimmer}
      </Text>
      <Text bold color="claude">
        {after}
      </Text>
    </Box>
  )
}

function Strong({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <Text bold color="claude">
      {children}
    </Text>
  )
}

function Suggestion({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  return <Text color="suggestion">{children}</Text>
}

function ListHint(): React.ReactNode {
  return (
    <Text dimColor italic>
      <Byline>
        <KeyboardShortcutHint shortcut="↑↓" action="select" />
        <KeyboardShortcutHint shortcut="Enter" action="open" />
        <KeyboardShortcutHint shortcut="Esc" action="close" />
      </Byline>
    </Text>
  )
}

function DetailHint(): React.ReactNode {
  return (
    <Text dimColor italic>
      <Byline>
        <KeyboardShortcutHint shortcut="Enter" action="mark done" />
        <KeyboardShortcutHint shortcut="Esc" action="back" />
      </Byline>
    </Text>
  )
}

const LESSONS = [
  {
    id: 'at-mentions',
    title: 'Talk to your codebase',
    tagline: '@ files, line refs',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          Type <Strong>@</Strong> anywhere in your prompt to fuzzy-find and
          attach a file. Claude reads it before answering — no more pasting
          code.
        </Text>
        <AnimatedDemo
          frames={[
            `> what does [suggestion:@]\n#type a file name…`,
            `> what does [suggestion:@src/auth.ts]\n  [suggestion:❯ src/auth.ts]\n#   src/auth.test.ts`,
            `> what does [suggestion:@src/auth.ts] do?\n#◐ Reading src/auth.ts…`,
            `> what does [suggestion:@src/auth.ts] do?\nExports validateToken() which\nchecks JWT expiry and signature.`,
          ]}
        />
        <Text>
          Reference specific lines with <Suggestion>src/app.ts:42</Suggestion>{' '}
          and Claude jumps straight there. Works in both directions: Claude
          cites files the same way, so you can click to open them in your
          editor.
        </Text>
        <Text dimColor>
          Also try: <Suggestion>@folder/</Suggestion> to attach a whole
          directory tree.
        </Text>
      </Box>
    ),
  },
  {
    id: 'modes',
    title: 'Steer with modes',
    tagline: 'shift+tab, plan, auto',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          Press <Strong>shift+tab</Strong> to cycle permission modes. Each mode
          changes how much Claude asks before acting:
        </Text>
        <LiveModeDemo />
        <Box flexDirection="column" paddingLeft={2}>
          <Text>
            <Text color="success">default</Text> — ask before every edit
          </Text>
          <Text>
            <Text color="autoAccept">accept edits</Text> — edit freely, ask for
            commands
          </Text>
          <Text>
            <Text color="planMode">plan</Text> — research and propose, never
            touch files
          </Text>
          <Text>
            <Text color="warning">auto</Text> — Claude decides what is safe
          </Text>
        </Box>
        <Text dimColor>
          Use <Text color="planMode">plan</Text> for big refactors you want to
          review first. Use <Text color="warning">auto</Text> for long
          unattended tasks. Run <Suggestion>/permissions</Suggestion> to
          pre-allow specific commands so Claude stops asking about them.
        </Text>
      </Box>
    ),
  },
  {
    id: 'undo',
    title: 'Undo anything',
    tagline: '/rewind, Esc-Esc',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          Claude checkpoints your files before every edit. Press{' '}
          <Strong>Esc Esc</Strong> (double-tap) to open{' '}
          <Suggestion>/rewind</Suggestion> and roll back to any prior state —
          code, conversation, or both.
        </Text>
        <AnimatedDemo
          frames={[
            `[success:✓] Updated regex in parser.ts\n#[error:8 tests failing]`,
            `#press Esc Esc\nRewind to:\n  [suggestion:❯ before parser.ts edit]`,
            `#[success:✓] parser.ts restored\n> try a simpler approach\n#◐ thinking…`,
          ]}
        />
        <Text>
          Went down the wrong path? Rewind to before the detour and try a
          different prompt. Your git history stays clean.
        </Text>
        <Text dimColor>
          Also: <Suggestion>/clear</Suggestion> wipes conversation but keeps
          files. <Suggestion>/branch</Suggestion> forks the conversation to try
          two approaches.
        </Text>
      </Box>
    ),
  },
  {
    id: 'background',
    title: 'Run in the background',
    tagline: 'tasks, /tasks',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          Long builds and test suites do not have to block you. Add{' '}
          <Strong>&amp;</Strong> to any bash command and it runs in the background
          — you keep chatting, Claude notifies you when it finishes.
        </Text>
        <AnimatedDemo
          frames={[
            `> run the test suite [claude:&]\n#task started in background`,
            `> now fix the lint in app.ts\n#◐ Editing app.ts…\n#[warning:◐] bun test · 12s`,
            `> now fix the lint in app.ts\n[success:✓] Removed unused import\n#[warning:◐] bun test · 28s`,
            `> now fix the lint in app.ts\n[success:✓] Removed unused import\n#[success:✓] bun test · 284 pass`,
          ]}
        />
        <Text>
          Run <Suggestion>/tasks</Suggestion> to see everything in flight.
          Claude can read task output mid-run and react to failures
          automatically.
        </Text>
        <Text dimColor>
          Subagents and workflows also run as tasks — it is all one queue.
        </Text>
      </Box>
    ),
  },
  {
    id: 'memory',
    title: 'Teach Claude your rules',
    tagline: 'CLAUDE.md, /memory',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          Drop a <Suggestion>CLAUDE.md</Suggestion> file in your repo and Claude
          reads it at the start of every session. Put your conventions there:
          test commands, style rules, do-not-touch directories.
        </Text>
        <AnimatedDemo
          frames={[
            `#─ CLAUDE.md ─\n#Run tests with: [suggestion:bun test]\n#Never edit src/legacy/`,
            `> add tests for the cache\n#◐ reading CLAUDE.md…`,
            `> add tests for the cache\nWriting cache.test.ts,\nrunning [suggestion:bun test] to verify.`,
          ]}
        />
        <Text>
          Run <Suggestion>/init</Suggestion> to generate a starter CLAUDE.md
          from your codebase. Run <Suggestion>/memory</Suggestion> to edit it
          inline.
        </Text>
        <Text dimColor>
          Works at three levels: repo, your home directory (all projects), and
          per-directory overrides.
        </Text>
      </Box>
    ),
  },
  {
    id: 'mcp',
    title: 'Extend with tools',
    tagline: 'MCP, /mcp',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          MCP servers give Claude new tools: read your Slack, query your
          database, control your browser. Run <Suggestion>/mcp</Suggestion> to
          browse and connect servers.
        </Text>
        <AnimatedDemo
          frames={[
            `> [suggestion:/mcp]\nConnected servers:\n  [success:✓] slack    [success:✓] github`,
            `> anything urgent in #eng?\n#◐ [suggestion:slack] · reading channel…`,
            `Boris posted about the merge\nfreeze. Also 3 PRs await\nyour review on github.`,
          ]}
        />
        <Text>
          Once connected, tools appear automatically — ask Claude to
          {' "'}check my calendar{`"`} or {`"`}search our Notion{`"`} and it just
          works.
        </Text>
        <Text dimColor>
          From your shell:{' '}
          <Suggestion>claude mcp add my-server -- npx some-mcp-pkg</Suggestion>{' '}
          to wire one up without leaving the terminal.
        </Text>
      </Box>
    ),
  },
  {
    id: 'automate',
    title: 'Automate your workflow',
    tagline: 'skills, hooks',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          Save a prompt to{' '}
          <Suggestion>.claude/skills/deploy/SKILL.md</Suggestion> and it becomes{' '}
          <Suggestion>/deploy</Suggestion> — type it, Claude runs it. Run{' '}
          <Suggestion>/skills</Suggestion> to see what you have.
        </Text>
        <AnimatedDemo
          frames={[
            `> [suggestion:/deploy] staging\n#◐ skill: deploy`,
            `[success:✓] built\n[success:✓] tests pass\n#◐ pushing to staging…`,
            `[success:✓] deployed\n#[suggestion:staging.app.com]\n#PostToolUse hook ran prettier`,
          ]}
        />
        <Text>
          Hooks run your own scripts on events: before a tool call, after a
          response, on session start. Use them to enforce rules, log activity,
          or inject context. Run <Suggestion>/hooks</Suggestion> to see what
          fires when.
        </Text>
        <Text dimColor>
          Run <Suggestion>/install-github-app</Suggestion> to let Claude review
          PRs when tagged.
        </Text>
      </Box>
    ),
  },
  {
    id: 'subagents',
    title: 'Multiply yourself',
    tagline: 'subagents, /agents',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          Claude can spawn copies of itself to work in parallel. Ask it to
          {' "'}use subagents to search these 5 directories{`"`} and watch the
          fan-out.
        </Text>
        <AnimatedDemo
          frames={[
            `> find any error handling bugs\n#◐ Spawning 3 agents…`,
            `#[warning:◐] agent-1 · scanning api\n#[warning:◐] agent-2 · scanning utils\n#[warning:◐] agent-3 · scanning cli`,
            `#[success:✓] agent-1 · found reject\n#[warning:◐] agent-2 · scanning utils\n#[success:✓] agent-3 · no issues`,
            `Found 2 issues:\n  [suggestion:api/fetch.ts:42] unhandled\n  [suggestion:utils/retry.ts:18] swallowed`,
          ]}
        />
        <Text>
          Define specialized agents in <Suggestion>.claude/agents/</Suggestion>{' '}
          — a test runner, a code reviewer, a docs writer — each with its own
          tools and instructions. Run <Suggestion>/agents</Suggestion> to manage
          them.
        </Text>
        <Text dimColor>
          Subagents run in isolated context. For true parallel sessions on
          separate branches, launch with{' '}
          <Suggestion>claude --worktree</Suggestion>.
        </Text>
      </Box>
    ),
  },
  {
    id: 'cross-device',
    title: 'Code from anywhere',
    tagline: '/remote-control, /teleport',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          Run <Suggestion>/remote-control</Suggestion> and this terminal becomes
          visible on your phone and at claude.ai/code. Watch output, send
          prompts, approve tool calls — all from another device while this
          session keeps running.
        </Text>
        <AnimatedDemo
          frames={[
            `> [suggestion:/remote-control]\n#◐ connecting…`,
            `[success:✓] connected\nsee this session at\n[suggestion:claude.ai/code/abc123]`,
            `#─ on your phone ─\n#abc123 · running tests\n[warning:◐] 142 of 284`,
            `#─ on your phone ─\n#abc123 · [success:✓] all pass\n> ship it`,
          ]}
        />
        <Text>
          Started a session on the web and want to move it here? Run{' '}
          <Suggestion>/teleport</Suggestion> to pull it into this terminal with
          full history.
        </Text>
        <Text dimColor>
          Kick off a long task, close your laptop, check progress from your
          phone.
        </Text>
      </Box>
    ),
  },
  {
    id: 'model-dial',
    title: 'Dial the model',
    tagline: '/model, /effort',
    body: (
      <Box flexDirection="column" gap={1}>
        <Text>
          Run <Suggestion>/model</Suggestion> to switch models. Opus for hard
          problems, Sonnet for most work, Haiku for quick questions. Each
          trades speed for depth.
        </Text>
        <AnimatedDemo
          frames={[
            `> [suggestion:/effort] high\n#effort set to [claude:high]`,
            `> why is the list page slow?\n#[claude:◐ thinking deeply…]`,
            `Three hypotheses, ranked:\n 1. N+1 query in loader\n 2. missing index on users`,
          ]}
        />
        <Text>
          <Suggestion>/effort</Suggestion> controls how long Claude thinks
          before answering. <Strong>high</Strong> for tricky bugs,{' '}
          <Strong>low</Strong> when you just need a quick edit.
        </Text>
        <Text dimColor>
          Also: <Suggestion>/fast</Suggestion> toggles fast mode — same model,
          faster output.
        </Text>
      </Box>
    ),
  },
] as const

type Lesson = (typeof LESSONS)[number]

export function getUnlockedPowerups(): Set<string> {
  const configured = getGlobalConfig().powerupsUnlocked ?? []
  return new Set(
    configured.filter(id => LESSONS.some(lesson => lesson.id === id)),
  )
}

function LessonDetail({
  lesson,
  isUnlocked,
  onDone,
  onBack,
}: {
  lesson: Lesson
  isUnlocked: boolean
  onDone: () => void
  onBack: () => void
}): React.ReactNode {
  useKeybindings(
    { 'confirm:yes': onDone, 'confirm:no': onBack },
    { context: 'Confirmation' },
  )
  return (
    <Pane color="claude">
      <Box flexDirection="column" gap={1}>
        <Box>
          <StatusIcon
            status={isUnlocked ? 'success' : 'pending'}
            withSpace
          />
          <Text bold color="claude">
            {lesson.title}
          </Text>
        </Box>
        {lesson.body}
        <DetailHint />
      </Box>
    </Pane>
  )
}

function Powerup({ onExit }: { onExit: (result: string) => void }): React.ReactNode {
  const [unlocked, setUnlocked] = React.useState(getUnlockedPowerups)
  const [selectedLesson, setSelectedLesson] = React.useState<Lesson | null>(
    null,
  )
  const [focusedLesson, setFocusedLesson] = React.useState(LESSONS[0].id)
  const [celebrating, setCelebrating] = React.useState(false)
  const finishCelebration = React.useCallback(() => setCelebrating(false), [])

  function openLesson(lesson: Lesson): void {
    setFocusedLesson(lesson.id)
    setSelectedLesson(lesson)
    logEvent('tengu_powerup_lesson_opened', {
      lesson_id: lesson.id,
      was_already_unlocked: unlocked.has(lesson.id),
      unlocked_count: unlocked.size,
    })
  }

  function completeLesson(id: string): void {
    if (unlocked.has(id)) return
    const next = new Set(unlocked).add(id)
    setUnlocked(next)
    saveGlobalConfig(config => ({
      ...config,
      powerupsUnlocked: [...next],
    }))
    logEvent('tengu_powerup_lesson_completed', {
      lesson_id: id,
      unlocked_count: next.size,
      all_unlocked: next.size === LESSONS.length,
    })
    if (next.size === LESSONS.length) setCelebrating(true)
  }

  const options = LESSONS.map(lesson => {
    const isUnlocked = unlocked.has(lesson.id)
    const label = `${isUnlocked ? figures.tick : figures.circle} ${lesson.title}`
    return {
      label: isUnlocked ? <Text color="success">{label}</Text> : label,
      value: lesson.id,
      description: lesson.tagline,
    }
  })

  if (selectedLesson) {
    return (
      <LessonDetail
        lesson={selectedLesson}
        isUnlocked={unlocked.has(selectedLesson.id)}
        onDone={() => {
          completeLesson(selectedLesson.id)
          setSelectedLesson(null)
        }}
        onBack={() => setSelectedLesson(null)}
      />
    )
  }

  const allUnlocked = unlocked.size === LESSONS.length
  return (
    <Pane color="claude">
      <Box flexDirection="column">
        <Box marginBottom={1}>
          {allUnlocked ? (
            <ShimmerTitle text="All powered up" />
          ) : (
            <Text bold color="claude">
              Power-ups
            </Text>
          )}
          <Text dimColor>
            {' '}
            {unlocked.size}/{LESSONS.length} unlocked{' '}
          </Text>
          <ProgressBar
            ratio={unlocked.size / LESSONS.length}
            width={16}
            fillColor="claude"
            emptyColor="inactive"
          />
        </Box>
        <Box marginBottom={1}>
          <Text dimColor wrap="wrap">
            {allUnlocked
              ? 'Now go build something.'
              : 'Each power-up teaches one thing Claude Code can do that most people miss. Open one, read it, try it, mark it done.'}
          </Text>
        </Box>
        <Select
          options={options}
          hideIndexes
          visibleOptionCount={LESSONS.length}
          defaultFocusValue={focusedLesson}
          onChange={id => {
            const lesson = LESSONS.find(candidate => candidate.id === id)
            if (lesson) openLesson(lesson)
          }}
          onCancel={() => onExit('Power-ups closed')}
        />
        <Box marginTop={1}>
          <ListHint />
        </Box>
        {celebrating && <Celebration onDone={finishCelebration} />}
      </Box>
    </Pane>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
): Promise<React.ReactNode> {
  return (
    <Powerup
      onExit={result => {
        onDone(result, { display: 'system' })
      }}
    />
  )
}
