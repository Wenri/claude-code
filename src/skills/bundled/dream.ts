import { feature } from 'bun:bundle'
import { getKairosActive, getOriginalCwd } from '../../bootstrap/state.js'
import { getAutoMemPath, isAutoMemoryEnabled } from '../../memdir/paths.js'
import { logEvent } from '../../services/analytics/index.js'
import { getFeatureValue_CACHED_WITH_REFRESH } from '../../services/analytics/growthbook.js'
import { buildConsolidationPrompt } from '../../services/autoDream/consolidationPrompt.js'
import { recordConsolidation } from '../../services/autoDream/consolidationLock.js'
import {
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
  DEFAULT_MAX_AGE_DAYS,
  isKairosCronEnabled,
} from '../../tools/ScheduleCronTool/prompt.js'
import { getProjectDir } from '../../utils/sessionStorage.js'
import { registerBundledSkill } from '../bundledSkills.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const teamMemPaths = feature('TEAMMEM')
  ? (require('../../memdir/teamMemPaths.js') as typeof import('../../memdir/teamMemPaths.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

const CONSOLIDATE_ARGUMENT = 'consolidate'
const SCHEDULING_KEYWORDS = /^(nightly|schedule|overnight)\b/i
const DREAM_GATE_REFRESH_MS = 5 * 60 * 1000

function isDreamEnabled(): boolean {
  return (
    !getKairosActive() &&
    isAutoMemoryEnabled() &&
    getFeatureValue_CACHED_WITH_REFRESH(
      'tengu_kairos_dream',
      false,
      DREAM_GATE_REFRESH_MS,
    )
  )
}

function createNightlyCron(): string {
  const offsetMinutes = Math.floor(Math.random() * 6 * 60)
  return `${offsetMinutes % 60} ${Math.floor(offsetMinutes / 60)} * * *`
}

function buildSchedulingPrompt(
  memoryRoot: string,
  transcriptDir: string,
  cron: string,
  extra: string,
  teamMemoryEnabled: boolean,
): string {
  const [minute = '0', hour = '3'] = cron.split(' ')
  const hourNumber = parseInt(hour, 10)
  const minuteNumber = parseInt(minute, 10)
  const meridiem = hourNumber < 12 ? 'am' : 'pm'
  const displayTime = `${hourNumber === 0 ? 12 : hourNumber > 12 ? hourNumber - 12 : hourNumber}:${minuteNumber.toString().padStart(2, '0')}${meridiem}`

  return `# Dream: Schedule Nightly Consolidation

The user wants to set up a recurring nightly memory consolidation job.

**Step 1 — Dedup any existing nightly job**

Call ${CRON_LIST_TOOL_NAME} and check for an existing task with prompt \`"/dream consolidate"\`. If one exists, delete it with ${CRON_DELETE_TOOL_NAME} first so renewal doesn't leave overlapping jobs.

**Step 2 — Schedule**

Call ${CRON_CREATE_TOOL_NAME} with:
- \`cron\`: \`"${cron}"\`
- \`prompt\`: \`"/dream consolidate"\`
- \`recurring\`: true
- \`durable\`: true

(The \`consolidate\` suffix means this prompt won't match SCHEDULING_KEYWORDS when it fires (so it runs the consolidation path), won't exact-match migrateAssistantTasksPermanent()'s \`'/dream'\` check (so it stays non-permanent), and resolves via the primary name on both bundled and disk skills (so it keeps working if the bundled skill is disabled via kill-switch or KAIROS activation).)

**Step 3 — Confirm**

Tell the user:
- /dream will run nightly at ~${displayTime} local to consolidate and organize memories
- The schedule persists across sessions (written to .claude/scheduled_tasks.json)
- Recurring tasks auto-expire after ${DEFAULT_MAX_AGE_DAYS} days — re-run \`/dream nightly\` to renew
- Cancel anytime with ${CRON_DELETE_TOOL_NAME} (include the job ID)

**Step 4 — Run an immediate consolidation**

${buildConsolidationPrompt(memoryRoot, transcriptDir, extra, teamMemoryEnabled)}`
}

export function registerDreamSkill(): void {
  registerBundledSkill({
    name: 'dream',
    aliases: ['learn'],
    description:
      'Reflective memory consolidation — review recent activity, synthesize learnings into typed memory files, and prune stale entries.',
    whenToUse:
      'When the user wants Claude to reflect on and consolidate its memories, organize topic files, prune stale entries, or schedule nightly consolidation. Trigger phrases: "dream", "learn", "dream nightly", "consolidate memories", "learn from your experiences", "organize your memories".',
    argumentHint: '[nightly]',
    userInvocable: true,
    context: 'fork',
    isEnabled: isDreamEnabled,
    async getPromptForCommand(argument) {
      const memoryRoot = getAutoMemPath()
      const transcriptDir = getProjectDir(getOriginalCwd())
      const teamMemoryEnabled = teamMemPaths?.isTeamMemoryEnabled() ?? false
      let normalizedArgument = argument.trim()
      if (normalizedArgument === CONSOLIDATE_ARGUMENT) normalizedArgument = ''

      const schedulingKeyword = SCHEDULING_KEYWORDS.exec(normalizedArgument)
      if (schedulingKeyword) {
        const extra = normalizedArgument.slice(schedulingKeyword[0].length).trim()
        if (!isKairosCronEnabled()) {
          logEvent('tengu_dream_invoked', { mode: 'schedule_unavailable' })
          return [
            {
              type: 'text',
              text: 'Scheduling is not available in this environment. Tell the user they can run `/dream` without arguments to consolidate memories now. Do not call any tools.',
            },
          ]
        }

        const cron = createNightlyCron()
        const [minute = '0', hour = '0'] = cron.split(' ')
        logEvent('tengu_dream_invoked', {
          mode: 'schedule',
          cron_hour: parseInt(hour, 10),
          cron_minute: parseInt(minute, 10),
          team_memory_enabled: teamMemoryEnabled,
        })
        return [
          {
            type: 'text',
            text: buildSchedulingPrompt(
              memoryRoot,
              transcriptDir,
              cron,
              extra,
              teamMemoryEnabled,
            ),
          },
        ]
      }

      logEvent('tengu_dream_invoked', {
        mode: 'consolidate',
        has_args: normalizedArgument.length > 0,
        team_memory_enabled: teamMemoryEnabled,
      })
      void recordConsolidation()
      return [
        {
          type: 'text',
          text: buildConsolidationPrompt(
            memoryRoot,
            transcriptDir,
            normalizedArgument,
            teamMemoryEnabled,
          ),
        },
      ]
    },
  })
}
