import {
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  DEFAULT_MAX_AGE_DAYS,
  isKairosCronEnabled,
} from '../../tools/ScheduleCronTool/prompt.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../../tools/AskUserQuestionTool/prompt.js'
import { SKILL_TOOL_NAME } from '../../tools/SkillTool/constants.js'
import { MONITOR_TOOL_NAME } from '../../tools/MonitorTool/MonitorTool.js'
import { PUSH_NOTIFICATION_TOOL_NAME } from '../../tools/PushNotificationTool/prompt.js'
import {
  AUTONOMOUS_LOOP_DYNAMIC_SENTINEL,
  AUTONOMOUS_LOOP_SENTINEL,
  SCHEDULE_WAKEUP_TOOL_NAME,
} from '../../tools/ScheduleWakeupTool/prompt.js'
import { TASK_LIST_TOOL_NAME } from '../../tools/TaskListTool/constants.js'
import { TASK_STOP_TOOL_NAME } from '../../tools/TaskStopTool/prompt.js'
import { getAllowedChannels } from '../../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import { getConfigValue } from '../../utils/settings/configSettings.js'
import * as loopDefault from '../../utils/loopDefault.js'
import { isLoopDynamicEnabled } from '../../utils/loopDynamic.js'
import { registerBundledSkill } from '../bundledSkills.js'

const DEFAULT_INTERVAL = '10m'

function getCloudScheduleOfferPrompt(): string {
  if (
    !isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false) &&
    isPolicyAllowed('allow_remote_sessions') &&
    getAllowedChannels().length === 0
  ) {
    return `
## Offer cloud first

Before any scheduling step, check whether EITHER is true:
- the parsed interval (rule 1 or 2) is **≥60 minutes**, or
- regardless of which rule matched, the original input uses daily phrasing ("every morning", "daily", "every day", "each night", "every weekday")

If either is true, call ${ASK_USER_QUESTION_TOOL_NAME} first:
- \`question\`: "This loop stops when you close this session. Set it up as a cloud schedule instead so it keeps running?"
- \`header\`: "Schedule"
- \`options\`: \`[{label: "Cloud schedule (recommended)", description: "Runs in Anthropic's cloud even after you close this session"}, {label: "This session only", description: "Runs in this terminal until you exit"}]\`

If they pick **Cloud schedule**: do NOT call ${CRON_CREATE_TOOL_NAME}. Invoke the \`schedule\` skill directly via the ${SKILL_TOOL_NAME} tool with \`args\` set to their original input verbatim (e.g. \`${SKILL_TOOL_NAME}({skill: "schedule", args: "every morning tell me a joke"})\`), then follow that skill's instructions to completion. Do NOT tell the user to run /schedule themselves. **Then stop — do not continue to any section below** (no ${CRON_CREATE_TOOL_NAME}, no ${SCHEDULE_WAKEUP_TOOL_NAME}, no "execute the prompt now").
If they pick **This session only**:
- If the trigger was a parsed ≥60-minute interval (rule 1 or 2): continue below with that interval.
- If the trigger was daily phrasing only (rule 3, no parsed interval): do NOT call ${CRON_CREATE_TOOL_NAME}. Explain that a daily-cadence loop won't fire before this session closes, so there's nothing useful to schedule locally — suggest they either pick Cloud schedule, or re-run \`/loop\` with an explicit shorter interval (e.g. \`/loop 1h <prompt>\`) if they want a session loop. Then stop.
If neither trigger condition was met: continue below.
`
  }
  return ''
}

function getLocalLoopConfirmationSuffix(): string {
  if (
    !isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false) &&
    isPolicyAllowed('allow_remote_sessions')
  ) {
    const line =
      '`_Runs until you close this session · For durable cloud-based loops, use /schedule_`'
    if (getAllowedChannels().length > 0) {
      return ` End the confirmation with this exact line on its own, italicized: ${line}`
    }
    return ` Only if you did NOT show the cloud-offer ${ASK_USER_QUESTION_TOOL_NAME} above (i.e., neither trigger condition applied), end the confirmation with this exact line on its own, italicized: ${line}. If the user already answered that question, omit this line.`
  }
  return ''
}

const LEGACY_USAGE_MESSAGE = `Usage: /loop [interval] <prompt>

Run a prompt or slash command on a recurring interval.

Intervals: Ns, Nm, Nh, Nd (e.g. 5m, 30m, 2h, 1d). Minimum granularity is 1 minute.
If no interval is specified, defaults to ${DEFAULT_INTERVAL}.

Examples:
  /loop 5m /babysit-prs
  /loop 30m check the deploy
  /loop 1h /standup 1
  /loop check the deploy          (defaults to ${DEFAULT_INTERVAL})
  /loop check the deploy every 20m`

function buildLegacyPrompt(args: string): string {
  return `# /loop — schedule a recurring prompt

Parse the input below into \`[interval] <prompt…>\` and schedule it with ${CRON_CREATE_TOOL_NAME}.

## Parsing (in priority order)

1. **Leading token**: if the first whitespace-delimited token matches \`^\\d+[smhd]$\` (e.g. \`5m\`, \`2h\`), that's the interval; the rest is the prompt.
2. **Trailing "every" clause**: otherwise, if the input ends with \`every <N><unit>\` or \`every <N> <unit-word>\` (e.g. \`every 20m\`, \`every 5 minutes\`, \`every 2 hours\`), extract that as the interval and strip it from the prompt. Only match when what follows "every" is a time expression — \`check every PR\` has no interval.
3. **Default**: otherwise, interval is \`${DEFAULT_INTERVAL}\` and the entire input is the prompt.

If the resulting prompt is empty, show usage \`/loop [interval] <prompt>\` and stop — do not call ${CRON_CREATE_TOOL_NAME}.

Examples:
- \`5m /babysit-prs\` → interval \`5m\`, prompt \`/babysit-prs\` (rule 1)
- \`check the deploy every 20m\` → interval \`20m\`, prompt \`check the deploy\` (rule 2)
- \`run tests every 5 minutes\` → interval \`5m\`, prompt \`run tests\` (rule 2)
- \`check the deploy\` → interval \`${DEFAULT_INTERVAL}\`, prompt \`check the deploy\` (rule 3)
- \`check every PR\` → interval \`${DEFAULT_INTERVAL}\`, prompt \`check every PR\` (rule 3 — "every" not followed by time)
- \`5m\` → empty prompt → show usage

${getCloudScheduleOfferPrompt()}

## Interval → cron

Supported suffixes: \`s\` (seconds, rounded up to nearest minute, min 1), \`m\` (minutes), \`h\` (hours), \`d\` (days). Convert:

| Interval pattern      | Cron expression     | Notes                                    |
|-----------------------|---------------------|------------------------------------------|
| \`Nm\` where N ≤ 59   | \`*/N * * * *\`     | every N minutes                          |
| \`Nm\` where N ≥ 60   | \`0 */H * * *\`     | round to hours (H = N/60, must divide 24)|
| \`Nh\` where N ≤ 23   | \`0 */N * * *\`     | every N hours                            |
| \`Nd\`                | \`0 0 */N * *\`     | every N days at midnight local           |
| \`Ns\`                | treat as \`ceil(N/60)m\` | cron minimum granularity is 1 minute  |

**If the interval doesn't cleanly divide its unit** (e.g. \`7m\` → \`*/7 * * * *\` gives uneven gaps at :56→:00; \`90m\` → 1.5h which cron can't express), pick the nearest clean interval and tell the user what you rounded to before scheduling.

## Action

1. Call ${CRON_CREATE_TOOL_NAME} with:
   - \`cron\`: the expression from the table above
   - \`prompt\`: the parsed prompt from above, verbatim (slash commands are passed through unchanged)
   - \`recurring\`: \`true\`
2. Briefly confirm: what's scheduled, the cron expression, the human-readable cadence, that recurring tasks auto-expire after ${DEFAULT_MAX_AGE_DAYS} days, and that they can cancel sooner with ${CRON_DELETE_TOOL_NAME} (include the job ID).${getLocalLoopConfirmationSuffix()}
3. **Then immediately execute the parsed prompt now** — don't wait for the first cron fire. If it's a slash command, invoke it via the Skill tool; otherwise act on it directly.

## Input

${args}`
}

const INTERVAL_TABLE = `| Interval pattern      | Cron expression     | Notes                                    |
|-----------------------|---------------------|------------------------------------------|
| \`Nm\` where N ≤ 59   | \`*/N * * * *\`     | every N minutes                          |
| \`Nm\` where N ≥ 60   | \`0 */H * * *\`     | round to hours (H = N/60, must divide 24)|
| \`Nh\` where N ≤ 23   | \`0 */N * * *\`     | every N hours                            |
| \`Nd\`                | \`0 0 */N * *\`     | every N days at midnight local           |
| \`Ns\`                | treat as \`ceil(N/60)m\` | cron minimum granularity is 1 minute  |

**If the interval doesn't cleanly divide its unit** (e.g. \`7m\` → \`*/7 * * * *\` gives uneven gaps at :56→:00; \`90m\` → 1.5h which cron can't express), pick the nearest clean interval and tell the user what you rounded to before scheduling.`

const INTERVAL_TOKEN = /^\d+[smhd]$/
const BARE_EVERY_INTERVAL =
  /^every\s+(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\s*$/i

function normalizeBareEveryInterval(match: RegExpMatchArray): string {
  const amount = match[1]
  const unit = match[2].toLowerCase()
  if (unit.startsWith('s')) return `${amount}s`
  if (unit.startsWith('h')) return `${amount}h`
  if (unit.startsWith('d')) return `${amount}d`
  return `${amount}m`
}

function isPushNotificationAvailable(): boolean {
  return (
    getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_kairos_push_notifications',
      false,
    ) && getConfigValue('agentPushNotifEnabled', false).value
  )
}

function getDynamicStopNotificationSuffix(): string {
  return isPushNotificationAvailable()
    ? ` Before you stop, send a one-line outcome via ${PUSH_NOTIFICATION_TOOL_NAME} — the user may be away and waiting to hear it's done. Skip this if you're stopping because the user just told you to; they're already here.`
    : ''
}

function getFixedIntervalAction(): string {
  return `1. Call ${CRON_CREATE_TOOL_NAME} with: \`cron\` (the expression above), \`prompt\` (the parsed prompt verbatim), \`recurring: true\`.
2. Briefly confirm: what's scheduled, the cron expression, the human-readable cadence, that recurring tasks auto-expire after ${DEFAULT_MAX_AGE_DAYS} days, and that the user can cancel sooner with ${CRON_DELETE_TOOL_NAME} (include the job ID).${getLocalLoopConfirmationSuffix()}
3. **Then immediately execute the parsed prompt now** — don't wait for the first cron fire. If it's a slash command, invoke it via the Skill tool; otherwise act on it directly.`
}

function getDynamicUsageMessage(): string {
  return `Usage: /loop [interval] <prompt>

Run a prompt or slash command on a recurring interval — or with no interval, let the model self-pace based on the task.

Intervals: Ns, Nm, Nh, Nd (e.g. 5m, 30m, 2h, 1d). Minimum granularity is 1 minute.
If no interval is specified, the model picks a delay between iterations based on what it's doing.

Examples:
  /loop 5m /babysit-prs
  /loop 30m check the deploy
  /loop 1h /standup 1
  /loop check the deploy          (dynamic — model picks delays)
  /loop check the deploy every 20m`
}

function buildDynamicPrompt(args: string): string {
  const dynamicAction = `The user wants you to self-pace. Decide what makes the next iteration worth running — a passage of time, or an observable event.

1. **Run the parsed prompt now.** If it's a slash command, invoke it via the Skill tool; otherwise act on it directly.
2. **If the next run is gated on an event** (CI finishing, a log line matching, a file changing, a PR comment) and no ${MONITOR_TOOL_NAME} is already running for it: arm one now with \`persistent: true\`. Its events arrive as \`<task-notification>\` messages and wake this loop immediately — you do not wait for the ${SCHEDULE_WAKEUP_TOOL_NAME} deadline. Arm once; on later iterations call ${TASK_LIST_TOOL_NAME} first and skip this step if a monitor is already running.
3. **At the end of this turn, call ${SCHEDULE_WAKEUP_TOOL_NAME}** with:
   - \`delaySeconds\`: with a ${MONITOR_TOOL_NAME} armed this is the **fallback heartbeat** — how long to wait if no event fires (lean 1200–1800s; idle ticks past the 5-minute cache window are pure overhead). Without a ${MONITOR_TOOL_NAME} this is the cadence — pick based on what you observed. Read the tool's own description for cache-aware delay guidance.
   - \`reason\`: one short sentence on why you picked that delay.
   - \`prompt\`: the full original /loop input verbatim, prefixed with \`/loop \` so the next firing re-enters this skill and continues the loop. For example, if the user typed \`/loop check the deploy\`, pass \`/loop check the deploy\` as the prompt.
4. **If you were woken by a \`<task-notification>\`** rather than this prompt: handle the event in the context of the loop task, then call ${SCHEDULE_WAKEUP_TOOL_NAME} again with the same \`prompt\` and the same 1200–1800s \`delaySeconds\` from step 3 — the ${MONITOR_TOOL_NAME} remains the wake signal; this only resets the safety net.
5. **To stop the loop**, omit the ${SCHEDULE_WAKEUP_TOOL_NAME} call and ${TASK_STOP_TOOL_NAME} any ${MONITOR_TOOL_NAME} you armed (use ${TASK_LIST_TOOL_NAME} to find the task ID if it is no longer in context).${getDynamicStopNotificationSuffix()}
6. Briefly confirm: that you're self-pacing, whether a ${MONITOR_TOOL_NAME} is the primary wake signal, that you ran the task now, and what fallback delay you picked.`

  return `# /loop — schedule a recurring or self-paced prompt

Parse the input below into \`[interval] <prompt…>\` and schedule it.

## Parsing (in priority order)

1. **Leading token**: if the first whitespace-delimited token matches \`^\\d+[smhd]$\` (e.g. \`5m\`, \`2h\`), that's the interval; the rest is the prompt.
2. **Trailing "every" clause**: otherwise, if the input ends with \`every <N><unit>\` or \`every <N> <unit-word>\` (e.g. \`every 20m\`, \`every 5 minutes\`, \`every 2 hours\`), extract that as the interval and strip it from the prompt. Only match when what follows "every" is a time expression — \`check every PR\` has no interval.
3. **No interval**: otherwise, the entire input is the prompt and you'll self-pace dynamically (see "Dynamic mode" below).

If the resulting prompt is empty, show usage \`/loop [interval] <prompt>\` and stop.

Examples:
- \`5m /babysit-prs\` → interval \`5m\`, prompt \`/babysit-prs\` (rule 1)
- \`check the deploy every 20m\` → interval \`20m\`, prompt \`check the deploy\` (rule 2)
- \`run tests every 5 minutes\` → interval \`5m\`, prompt \`run tests\` (rule 2)
- \`check the deploy\` → no interval → dynamic mode, prompt \`check the deploy\` (rule 3)
- \`check every PR\` → no interval → dynamic mode, prompt \`check every PR\` (rule 3 — "every" not followed by time)
- \`5m\` → empty prompt → show usage
${getCloudScheduleOfferPrompt()}
## Fixed-interval mode (rules 1 and 2)

Convert the interval to a cron expression:

${INTERVAL_TABLE}

Then:
${getFixedIntervalAction()}

## Dynamic mode (rule 3 — no interval)

${dynamicAction}

## Input

${args}`
}

function buildAutonomousPrompt(
  loopFile: ReturnType<typeof loopDefault.readLoopFile>,
  dynamic: boolean,
  interval: string,
): string {
  const sectionHeading = loopFile
    ? `## Loop tasks (from ${loopFile.path})`
    : '## Autonomous-loop instructions (for the immediate execution and every fire)'
  const instructions = loopFile
    ? loopFile.content
    : loopDefault.AUTONOMOUS_LOOP_PREAMBLE
  const work = loopFile ? 'the loop.md tasks' : 'the autonomous check'

  if (dynamic) {
    const sentinel = loopFile
      ? loopDefault.LOOP_FILE_DYNAMIC_SENTINEL
      : AUTONOMOUS_LOOP_DYNAMIC_SENTINEL
    const heading = loopFile
      ? `# /loop — loop.md tasks with dynamic pacing

The user invoked \`/loop\` with no prompt and no interval and has a loop-tasks file at \`${loopFile.path}\`. Run those tasks now, then self-pace the next iteration via ${SCHEDULE_WAKEUP_TOOL_NAME} — no cron.`
      : `# /loop — autonomous default with dynamic pacing

The user invoked \`/loop\` with no prompt and no interval. Run the autonomous check now, then self-pace the next iteration via ${SCHEDULE_WAKEUP_TOOL_NAME} — no cron.`
    const confirmation = loopFile
      ? `that you're running tasks from \`${loopFile.path}\` in dynamic-pacing mode, that you ran the first tick now`
      : 'that this is the autonomous default in dynamic-pacing mode, that you ran the check now'
    const action = `1. **Run ${work} now**, following the instructions inlined below.
2. **If the next tick is gated on an event** (CI finishing, a PR comment, a log line) and no ${MONITOR_TOOL_NAME} is already running for it: arm one now with \`persistent: true\`. Its events wake this loop immediately — you do not wait for the ${SCHEDULE_WAKEUP_TOOL_NAME} deadline. Arm once; on later ticks call ${TASK_LIST_TOOL_NAME} first and skip if a monitor is already running.
3. **At the end of this turn, call ${SCHEDULE_WAKEUP_TOOL_NAME}** with:
   - \`delaySeconds\`: with a ${MONITOR_TOOL_NAME} armed this is the fallback heartbeat (lean 1200–1800s). Without one, pick based on what you observed this turn — quiet branch? wait longer. Lots in flight? wait shorter. Read the tool's own description for cache-aware delay guidance.
   - \`reason\`: one short sentence on why you picked that delay.
   - \`prompt\`: the literal string \`${sentinel}\` — the dynamic-mode sentinel expands at fire time to the full instructions (first fire / first fire post-compact / loop.md edited) or a dynamic-pacing-specific short reminder (subsequent fires). Do not pass the full instructions; that is handled automatically.
4. **If woken by a \`<task-notification>\`** rather than this prompt: handle the event, then call ${SCHEDULE_WAKEUP_TOOL_NAME} again with \`${sentinel}\` and the same 1200–1800s \`delaySeconds\` — the ${MONITOR_TOOL_NAME} remains the wake signal; this only resets the safety net.
5. **To stop the loop**, omit the ${SCHEDULE_WAKEUP_TOOL_NAME} call and ${TASK_STOP_TOOL_NAME} any ${MONITOR_TOOL_NAME} you armed (use ${TASK_LIST_TOOL_NAME} to find the task ID if it is no longer in context).${getDynamicStopNotificationSuffix()}
6. Briefly confirm: ${confirmation}, whether a ${MONITOR_TOOL_NAME} is the primary wake signal, and what fallback delay you picked.`
    return `${heading}

## Action

${action}

${sectionHeading}

${instructions}`
  }

  const sentinel = loopFile
    ? loopDefault.LOOP_FILE_SENTINEL
    : AUTONOMOUS_LOOP_SENTINEL
  const heading = loopFile
    ? `# /loop — schedule loop.md tasks

The user invoked \`/loop\` with no prompt (input was empty or just the interval \`${interval}\`) and has a loop-tasks file at \`${loopFile.path}\`. Schedule a recurring cron that runs those tasks each tick, then run the first tick immediately.`
    : `# /loop — schedule the autonomous default

The user invoked \`/loop\` with no prompt (input was empty or just the interval \`${interval}\`). Schedule the autonomous-loop default and then run the first autonomous check immediately.`
  const expansion = loopFile
    ? 'it expands at fire time to the full loop.md contents on first delivery (and whenever loop.md has been edited since last fire), and to a short reminder on subsequent unchanged fires. The long instructions stay in the cached message-prefix.'
    : 'it expands at fire time to the full autonomous-loop instructions on first delivery, and to a short reminder on subsequent fires (the long instructions stay in the cached message-prefix).'
  const confirmation = loopFile
    ? `what's scheduled, the cron expression, the human-readable cadence, that it's running tasks from \`${loopFile.path}\`, that recurring tasks auto-expire after ${DEFAULT_MAX_AGE_DAYS} days, and that the user can cancel sooner with ${CRON_DELETE_TOOL_NAME} (include the job ID).`
    : `what's scheduled, the cron expression, the human-readable cadence, that recurring tasks auto-expire after ${DEFAULT_MAX_AGE_DAYS} days, and that they can cancel sooner with ${CRON_DELETE_TOOL_NAME} (include the job ID). Mention this is the autonomous default and that the autonomous-loop instructions are baked in.`

  return `${heading}

## Action

1. Convert \`${interval}\` to a 5-field cron expression. Supported suffixes: \`s\` → ceil to nearest minute, \`m\` (minutes), \`h\` (hours), \`d\` (days). Examples: \`5m\` → \`*/5 * * * *\`, \`1h\` → \`0 * * * *\`, \`1d\` → \`0 0 * * *\`. If the interval doesn't cleanly divide its unit, round to the nearest clean interval and tell the user what you rounded to.
2. Call ${CRON_CREATE_TOOL_NAME} with:
   - \`cron\`: the expression from step 1
   - \`prompt\`: the literal string \`${sentinel}\` — ${expansion}
   - \`recurring\`: \`true\`
3. Briefly confirm: ${confirmation}
4. **Then immediately run ${work} now**, following the instructions inlined below. Don't wait for the first cron fire.

${sectionHeading}

${instructions}`
}

export function registerLoopSkill(): void {
  registerBundledSkill({
    name: 'loop',
    aliases: ['proactive'],
    get description() {
      if (isLoopDynamicEnabled()) {
        return 'Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo). Omit the interval to let the model self-pace.'
      }
      return 'Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo, defaults to 10m)'
    },
    whenToUse:
      'When the user wants to set up a recurring task, poll for status, or run something repeatedly on an interval (e.g. "check the deploy every 5 minutes", "keep running /babysit-prs"). Do NOT invoke for one-off tasks.',
    get argumentHint() {
      if (loopDefault.isLoopDefaultPromptEnabled()) {
        return '[interval | until <condition>] [prompt]'
      }
      return '[interval] <prompt>'
    },
    userInvocable: true,
    isEnabled: isKairosCronEnabled,
    async getPromptForCommand(args) {
      const trimmed = args.trim()
      // Reserved by the loop-default grammar. Kept parsed here so the
      // argument contract remains stable while the prompt owns semantics.
      trimmed.match(/^until\s+(.+)$/is)

      const everyInterval = trimmed.match(BARE_EVERY_INTERVAL)
      const isEmpty = !trimmed
      const isBareInterval =
        INTERVAL_TOKEN.test(trimmed) || everyInterval !== null
      if (isEmpty || isBareInterval) {
        if (loopDefault.isLoopDefaultPromptEnabled()) {
          const interval = everyInterval
            ? normalizeBareEveryInterval(everyInterval)
            : trimmed || DEFAULT_INTERVAL
          const loopFile = loopDefault.readLoopFile()
          return [
            {
              type: 'text',
              text: buildAutonomousPrompt(
                loopFile,
                isEmpty && isLoopDynamicEnabled(),
                interval,
              ),
            },
          ]
        }
      }

      if (isLoopDynamicEnabled()) {
        if (!trimmed) {
          return [{ type: 'text', text: getDynamicUsageMessage() }]
        }
        return [{ type: 'text', text: buildDynamicPrompt(trimmed) }]
      }
      if (!trimmed) {
        return [{ type: 'text', text: LEGACY_USAGE_MESSAGE }]
      }
      return [{ type: 'text', text: buildLegacyPrompt(trimmed) }]
    },
  })
}
