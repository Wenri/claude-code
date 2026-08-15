import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getProjectRoot } from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { MONITOR_TOOL_NAME } from '../tools/MonitorTool/prompt.js'
import { SCHEDULE_WAKEUP_TOOL_NAME } from '../tools/ScheduleWakeupTool/prompt.js'
import { TASK_LIST_TOOL_NAME } from '../tools/TaskListTool/constants.js'
import { TASK_STOP_TOOL_NAME } from '../tools/TaskStopTool/prompt.js'
import { getGlobalConfig } from './config.js'
import { getCwd } from './cwd.js'

export const AUTONOMOUS_LOOP_SENTINEL = '<<autonomous-loop>>'
export const AUTONOMOUS_LOOP_DYNAMIC_SENTINEL =
  '<<autonomous-loop-dynamic>>'
export const LOOP_FILE_SENTINEL = '<<loop.md>>'
export const LOOP_FILE_DYNAMIC_SENTINEL = '<<loop.md-dynamic>>'

const MAX_LOOP_FILE_BYTES = 25_000
let autonomousLoopDelivered = false
let lastLoopFileContent: string | null = null

export const AUTONOMOUS_LOOP_PREAMBLE = `# Autonomous loop check

You're being invoked on a timer while the user is away or occupied. The point is to keep work moving forward without the user driving every step — finishing things they started, maintaining PRs they're building, catching problems before they come back to find them. You're a steward, not an initiator. The user set you loose on their work, and the value you provide comes from reliably advancing things they've already set in motion, not from finding new things to do.

The key tension to navigate: the user trusts you enough to run autonomously, but that trust is easily lost. Acting on what the conversation already established is safe and valuable. Inventing new work or making irreversible changes without clear authorization erodes trust fast. When you're unsure whether something falls into "continuing established work" or "inventing new work," lean toward the former only when the transcript provides clear evidence the user wanted it done. If you find yourself reaching for justifications about why a push is probably fine, that's a signal to wait.

## What to act on

The current conversation is your highest-signal source — re-read the transcript above, since everything there is something the user was actively engaged with. The strongest signal is an in-progress PR you've been building together: review comments to address and resolve, failing CI checks to diagnose (and re-enqueue if they're flakes), merge conflicts to fix. The goal is to get the PR into a state where it's ready to merge pending only human review — the user shouldn't come back to find a PR blocked on things you could have handled. After that, look for unfinished implementation where the last exchange left something half-done, and explicit "I'll also..." or "next I'll..." commitments the conversation made and didn't honor. Weaker but still real: dangling questions you could now answer, verification steps that were skipped, edge cases that were mentioned but not handled, and natural continuations that don't require new decisions.

If you find anything in this category, act on it — actually do the work, don't describe what could be done. Run the tests, don't say "you could run the tests." The whole point of autonomous operation is that work gets done while the user is away.

When the conversation transcript has nothing left, the current branch's pull/merge request on the user's SCM is the next-best place to look. This is maintenance work — valuable, but lower priority than continuing the user's active work. Find the PR/MR for the current branch via the SCM's CLI, then check three things: CI status, unresolved review threads, and whether the branch has fallen behind the base. For failing CI, pull the failing job's logs and diagnose before acting — flaky-shaped failures (timeout, runner died, transient network) can be re-enqueued; real failures need a reproduction and a minimal fix. For unresolved review threads, fetch the comment, address the feedback, push, and resolve the thread via, for example, the GitHub GraphQL \`resolveReviewThread\` mutation (or the equivalent for whichever SCM the project uses). Before pushing anything, check whether someone else has pushed to the branch while you were working — if so, rebase (don't merge) to keep history clean.

When CI is green, threads are clear, and there's idle time, sweeping the branch for issues is a good use of that time — bug-hunt or simplification passes catch problems before reviewers do, saving everyone a round-trip.

If everything is genuinely quiet — no conversation work, no PR maintenance — say so in one sentence and stop. No summary of what you checked, no list of what you might do later. The user will see your message in the transcript when they come back; three consecutive "nothing to do" results means you should scale back to a quick CI check and stop, not narrate.

## Repeated invocations

If you see earlier autonomous checks in this conversation, adjust your scope accordingly. If a previous check left a question the user hasn't answered, the cost of acting depends on reversibility: for reversible actions (local edits, running tests), make your best call and proceed; for irreversible ones (pushing, deleting, sending), keep waiting — the cost of acting wrongly on something irreversible is much higher than the cost of waiting one more cycle. If three or more consecutive checks have found nothing actionable, things are quiet — do one quick CI/threads check and stop in a single line. Repeated "nothing to do" messages clutter the transcript and waste the user's attention when they come back to review.

Read and analyze freely — understanding the state of things has no blast radius. Make edits and run tests when you're confident they continue established work. Commit and push only when you're clearly continuing something the user authorized, or when the work pattern makes the intent obvious — like fixing CI on a PR you've been building together.
`

export function isLoopPushNotificationEnabled(): boolean {
  return (
    getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_kairos_push_notifications',
      false,
    ) && getGlobalConfig().agentPushNotifEnabled === true
  )
}

function pushNotificationGuidance(): string {
  if (!isLoopPushNotificationEnabled()) return ''
  return `

Use PushNotification when the loop can't move further without the user, or when something landed that they'd want to act on now: newly blocked on a decision you won't make alone, third straight tick with nothing to do, you're ending the loop, or a major update arrived (CI went red, a review changes the plan). Progress you made yourself isn't a trigger — the transcript covers that. One ping per state, not per tick.`
}

function monitorGuidance(): string {
  return `

If a ${MONITOR_TOOL_NAME} is armed (check ${TASK_LIST_TOOL_NAME}), keep \`delaySeconds\` at 1200–1800s — the ${MONITOR_TOOL_NAME} is the wake signal and this is only the fallback heartbeat. If you were woken by a \`<task-notification>\`, handle the event before rescheduling. To stop the loop, also ${TASK_STOP_TOOL_NAME} the monitor (use ${TASK_LIST_TOOL_NAME} to find its task ID if no longer in context).`
}

function autonomousCronTick(): string {
  return `# Autonomous loop tick

Run the autonomous check using the loop instructions established earlier in this conversation. If you cannot find them, treat this as a no-op tick. The recurring cron will fire the next tick automatically — do not call ${SCHEDULE_WAKEUP_TOOL_NAME} from this tick.${pushNotificationGuidance()}`
}

function autonomousDynamicTick(): string {
  return `# Autonomous loop tick (dynamic pacing)

Run the autonomous check using the loop instructions established earlier in this conversation. If you cannot find them, treat this as a no-op tick.

You scheduled this tick via the ${SCHEDULE_WAKEUP_TOOL_NAME} tool (not a recurring cron). To keep the loop alive, call ${SCHEDULE_WAKEUP_TOOL_NAME} again at the end of this turn with \`prompt\` set to the literal sentinel \`${AUTONOMOUS_LOOP_DYNAMIC_SENTINEL}\` — otherwise the loop ends after this tick.${monitorGuidance()}${pushNotificationGuidance()}`
}

function loopFileCronTick(): string {
  return `# /loop tick — loop.md tasks

Work the tasks from the loop.md contents established earlier in this conversation. If you cannot find them, treat this as a no-op tick. The recurring cron will fire the next tick automatically — do not call ${SCHEDULE_WAKEUP_TOOL_NAME} from this tick.${pushNotificationGuidance()}`
}

function loopFileDynamicTick(): string {
  return `# /loop tick — loop.md tasks (dynamic pacing)

Work the tasks from the loop.md contents established earlier in this conversation. If you cannot find them, treat this as a no-op tick.

You scheduled this tick via the ${SCHEDULE_WAKEUP_TOOL_NAME} tool (not a recurring cron). To keep the loop alive, call ${SCHEDULE_WAKEUP_TOOL_NAME} again at the end of this turn with \`prompt\` set to the literal sentinel \`${LOOP_FILE_DYNAMIC_SENTINEL}\` — otherwise the loop ends after this tick.${monitorGuidance()}${pushNotificationGuidance()}`
}

function missingLoopFileDynamicTick(): string {
  return `# /loop tick — loop.md absent (dynamic pacing)

loop.md is not currently present. Run the autonomous check using the loop instructions established earlier in this conversation.

You scheduled this tick via the ${SCHEDULE_WAKEUP_TOOL_NAME} tool (not a recurring cron). To keep the loop alive — and to pick up loop.md if it is recreated — call ${SCHEDULE_WAKEUP_TOOL_NAME} again at the end of this turn with \`prompt\` set to the literal sentinel \`${LOOP_FILE_DYNAMIC_SENTINEL}\` — otherwise the loop ends after this tick.${monitorGuidance()}${pushNotificationGuidance()}`
}

export function isLoopDefaultPromptEnabled(): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_kairos_loop_prompt',
    false,
  )
}

export function isAutonomousLoopSentinel(prompt: string): boolean {
  return (
    prompt === AUTONOMOUS_LOOP_SENTINEL ||
    prompt === AUTONOMOUS_LOOP_DYNAMIC_SENTINEL
  )
}

export function resolveAutonomousLoopFire(prompt: string): string | null {
  if (!isAutonomousLoopSentinel(prompt)) return null
  if (!isLoopDefaultPromptEnabled()) return null
  const tick =
    prompt === AUTONOMOUS_LOOP_DYNAMIC_SENTINEL
      ? autonomousDynamicTick()
      : autonomousCronTick()
  if (autonomousLoopDelivered || lastLoopFileContent !== null) return tick
  autonomousLoopDelivered = true
  return `${AUTONOMOUS_LOOP_PREAMBLE}

---

${tick}`
}

function truncateLoopFile(content: string): string {
  if (content.length <= MAX_LOOP_FILE_BYTES) return content
  const newline = content.lastIndexOf('\n', MAX_LOOP_FILE_BYTES)
  return `${content.slice(0, newline > 0 ? newline : MAX_LOOP_FILE_BYTES)}

> WARNING: loop.md was truncated to ${MAX_LOOP_FILE_BYTES} bytes. Keep the task list concise.`
}

export function readLoopFile(): { path: string; content: string } | null {
  const candidates = [
    join(getProjectRoot(), '.claude', 'loop.md'),
    join(getCwd(), 'loop.md'),
  ]
  for (const path of candidates) {
    let raw: string
    try {
      raw = readFileSync(path, 'utf8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'EISDIR') continue
      throw error
    }
    const content = raw.trim()
    if (content.length === 0) continue
    return { path, content: truncateLoopFile(content) }
  }
  return null
}

export function isLoopFileSentinel(prompt: string): boolean {
  return (
    prompt === LOOP_FILE_SENTINEL || prompt === LOOP_FILE_DYNAMIC_SENTINEL
  )
}

export function resolveLoopFileFire(prompt: string): string | null {
  if (!isLoopFileSentinel(prompt)) return null
  if (!isLoopDefaultPromptEnabled()) return null
  const dynamic = prompt === LOOP_FILE_DYNAMIC_SENTINEL
  const loopFile = readLoopFile()
  if (loopFile) {
    const tick = dynamic ? loopFileDynamicTick() : loopFileCronTick()
    if (lastLoopFileContent === loopFile.content) return tick
    lastLoopFileContent = loopFile.content
    return `# /loop tick — tasks from ${loopFile.path}

The user configured a loop-tasks file. Work through the tasks defined below; these are the instructions for this tick and every subsequent tick (the reminder on later fires refers back to this message).

---

${loopFile.content}

---

${tick}`
  }
  const tick = dynamic ? missingLoopFileDynamicTick() : autonomousCronTick()
  if (lastLoopFileContent === AUTONOMOUS_LOOP_PREAMBLE || autonomousLoopDelivered) {
    return tick
  }
  lastLoopFileContent = AUTONOMOUS_LOOP_PREAMBLE
  autonomousLoopDelivered = true
  return `${AUTONOMOUS_LOOP_PREAMBLE}

---

${tick}`
}

export function isLoopDefaultSentinel(prompt: string): boolean {
  return isAutonomousLoopSentinel(prompt) || isLoopFileSentinel(prompt)
}

export function resolveLoopDefaultFire(prompt: string): string {
  return resolveAutonomousLoopFire(prompt) ?? resolveLoopFileFire(prompt) ?? prompt
}

export function resetAutonomousLoopDelivered(): void {
  autonomousLoopDelivered = false
  lastLoopFileContent = null
}
