import { readdir, readFile, stat } from 'fs/promises'
import memoize from 'lodash-es/memoize.js'
import { basename, extname, join } from 'path'
import { getOriginalCwd } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { logEvent } from '../../services/analytics/index.js'
import { isConsumerSubscriber } from '../../utils/auth.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage, isENOENT } from '../../utils/errors.js'
import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js'
import { normalizeGitRemoteUrl } from '../../utils/git.js'
import { safeParseJSON } from '../../utils/json.js'
import { getProjectDir } from '../../utils/sessionStorage.js'
import { jsonStringify } from '../../utils/slowOperations.js'

const MAX_SESSION_BYTES = 52_428_800
const MAX_FIRST_MESSAGE_LENGTH = 200
const MAX_SESSION_DESCRIPTORS = 60
const DEFAULT_WINDOW_DAYS = 30

const COMMAND_NAME_MARKER = '"content":"<command-name>/'
const COMMAND_MESSAGE_MARKER = '"content":"<command-message>'
const TOOL_USE_MARKER = '"type":"tool_use"'
const CUSTOM_TITLE_MARKER = '"type":"custom-title"'
const PR_LINK_MARKER = '"type":"pr-link"'
const USER_ROLE_MARKER = '"role":"user"'
const COMMAND_NAME_PATTERN = /<command-name>\/([\w:-]+)<\/command-name>/g
const MCP_TOOL_PATTERN = /"name":"mcp__([^"]+?)__([^"]+)"/g
const CUSTOM_TITLE_PATTERN = /"customTitle":"([^"]+)"/
const PR_NUMBER_PATTERN = /"prNumber":(\d+)/
const FIRST_MESSAGE_PATTERN = /"role":"user"[^}]*"content":"([^"]+)"/

export type TeamOnboardingSessionDescriptor = {
  title?: string
  firstMessage?: string
  prNumbers: number[]
}

export type TeamOnboardingTranscriptUsage = {
  slashCommandCounts: Map<string, number>
  mcpServerCounts: Map<string, number>
  sessionDescriptors: TeamOnboardingSessionDescriptor[]
  sessionFileCount: number
}

function emptyTranscriptUsage(): TeamOnboardingTranscriptUsage {
  return {
    slashCommandCounts: new Map(),
    mcpServerCounts: new Map(),
    sessionDescriptors: [],
    sessionFileCount: 0,
  }
}

/** Collect the narrow, non-message-content usage summary used by the guide. */
export async function collectTeamOnboardingTranscriptUsage(
  transcriptDir: string,
  windowDays: number,
): Promise<TeamOnboardingTranscriptUsage> {
  const usage = emptyTranscriptUsage()
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000
  let entries: string[]
  try {
    entries = await readdir(transcriptDir)
  } catch (error) {
    if (isENOENT(error)) return usage
    throw error
  }

  for (const entry of entries) {
    if (extname(entry) !== '.jsonl') continue
    const filename = join(transcriptDir, entry)
    let fileInfo
    try {
      fileInfo = await stat(filename)
    } catch (error) {
      if (isENOENT(error)) continue
      throw error
    }
    if (!fileInfo.isFile()) continue
    if (fileInfo.mtimeMs < cutoff || fileInfo.size > MAX_SESSION_BYTES) continue

    let transcript: string
    try {
      transcript = await readFile(filename, 'utf8')
    } catch (error) {
      if (isENOENT(error)) continue
      throw error
    }

    usage.sessionFileCount++
    const descriptor: TeamOnboardingSessionDescriptor = { prNumbers: [] }
    for (const line of transcript.split('\n')) {
      if (line.length < 10) continue

      if (
        line.includes(COMMAND_NAME_MARKER) ||
        line.includes(COMMAND_MESSAGE_MARKER)
      ) {
        for (const match of line.matchAll(COMMAND_NAME_PATTERN)) {
          const command = match[1]!
          usage.slashCommandCounts.set(
            command,
            (usage.slashCommandCounts.get(command) ?? 0) + 1,
          )
        }
      }

      if (line.includes(TOOL_USE_MARKER) && line.includes('"name":"mcp__')) {
        for (const match of line.matchAll(MCP_TOOL_PATTERN)) {
          const server = match[1]!
          usage.mcpServerCounts.set(
            server,
            (usage.mcpServerCounts.get(server) ?? 0) + 1,
          )
        }
      }

      if (line.includes(CUSTOM_TITLE_MARKER)) {
        const match = CUSTOM_TITLE_PATTERN.exec(line)
        if (match) descriptor.title = match[1]
      }

      if (line.includes(PR_LINK_MARKER)) {
        const match = PR_NUMBER_PATTERN.exec(line)
        if (match) {
          const prNumber = Number(match[1])
          if (!descriptor.prNumbers.includes(prNumber)) {
            descriptor.prNumbers.push(prNumber)
          }
        }
      }

      if (
        !descriptor.firstMessage &&
        line.includes(USER_ROLE_MARKER) &&
        !line.includes(COMMAND_NAME_MARKER) &&
        !line.includes('"content":[')
      ) {
        const match = FIRST_MESSAGE_PATTERN.exec(line)
        if (match) {
          const message = match[1]!
            .replace(/\\n/g, ' ')
            .replace(/\\"/g, '"')
          if (message.length > 3 && !message.startsWith('<')) {
            descriptor.firstMessage = message.slice(
              0,
              MAX_FIRST_MESSAGE_LENGTH,
            )
          }
        }
      }
    }

    if (
      descriptor.title ||
      descriptor.prNumbers.length > 0 ||
      descriptor.firstMessage
    ) {
      usage.sessionDescriptors.push(descriptor)
    }
  }

  if (usage.sessionDescriptors.length > MAX_SESSION_DESCRIPTORS) {
    usage.sessionDescriptors.sort((a, b) => {
      const aScore = (a.title ? 2 : 0) + (a.prNumbers.length > 0 ? 1 : 0)
      const bScore = (b.title ? 2 : 0) + (b.prNumbers.length > 0 ? 1 : 0)
      return bScore - aScore
    })
    usage.sessionDescriptors = usage.sessionDescriptors.slice(
      0,
      MAX_SESSION_DESCRIPTORS,
    )
  }

  return usage
}

function getUrlOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

type McpJsonServer = { url?: unknown }

async function readProjectMcpServers(
  cwd: string,
): Promise<Record<string, McpJsonServer>> {
  try {
    const contents = await readFile(join(cwd, '.mcp.json'), 'utf8')
    const parsed = safeParseJSON(contents)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'mcpServers' in parsed &&
      parsed.mcpServers &&
      typeof parsed.mcpServers === 'object'
    ) {
      return parsed.mcpServers as Record<string, McpJsonServer>
    }
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(
        `team-onboarding: failed to read .mcp.json: ${errorMessage(error)}`,
        { level: 'error' },
      )
    }
  }
  return {}
}

export async function gatherTeamOnboardingUsage(windowDays: number): Promise<{
  usageData: string
  sessionCount: number
  slashCommandCount: number
  mcpServerCount: number
}> {
  const cwd = getOriginalCwd()
  const transcriptDir = getProjectDir(cwd)
  const usage = await collectTeamOnboardingTranscriptUsage(
    transcriptDir,
    windowDays,
  )
  const slashCommands = [...usage.slashCommandCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name: `/${name}`, count }))
  const configuredMcpServers = await readProjectMcpServers(cwd)
  const mcpServers = [...usage.mcpServerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, callCount]) => {
      const config = configuredMcpServers[name]
      return {
        name,
        callCount,
        urlOrigin:
          typeof config?.url === 'string'
            ? getUrlOrigin(config.url)
            : undefined,
      }
    })
  const generatedBy = (
    await execFileNoThrowWithCwd('git', ['config', 'user.name'], { cwd })
  ).stdout.trim()
  const remote = (
    await execFileNoThrowWithCwd('git', ['remote', 'get-url', 'origin'], {
      cwd,
    })
  ).stdout.trim()

  return {
    usageData: jsonStringify(
      {
        generatedBy: generatedBy || undefined,
        currentRepo: normalizeGitRemoteUrl(remote) ?? basename(cwd),
        windowDays,
        sessionCount: usage.sessionFileCount,
        slashCommands,
        mcpServers,
        sessionDescriptors: usage.sessionDescriptors,
      },
      null,
      2,
    ),
    sessionCount: usage.sessionFileCount,
    slashCommandCount: usage.slashCommandCounts.size,
    mcpServerCount: usage.mcpServerCounts.size,
  }
}

export const GUIDE_TEMPLATE = `# Welcome to [Team Name]

## How We Use Claude

Based on [name]'s usage over the last [N] days:

Work Type Breakdown:
  [Category 1]  [ascii bar]  [N]%
  [Category 2]  [ascii bar]  [N]%
  [Category 3]  [ascii bar]  [N]%
  ...

Top Skills & Commands:
  [/command]  [ascii bar]  [N]x/month
  ...

Top MCP Servers:
  [Server]  [ascii bar]  [N] calls
  ...

## Your Setup Checklist

### Codebases
- [ ] [repo-name] — [repo url]
...

### MCP Servers to Activate
- [ ] [Server] — [what it's for]. [How to get access]
...

### Skills to Know About
- [/command] — [what it does, when the team uses it]
...

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->`

export const DEFAULT_PROMPT = `You are helping a power user generate an onboarding guide for teammates who are new to Claude Code. The guide will live in the team's onboarding docs and can be pasted into Claude for an interactive walkthrough.

You're co-authoring this with them — collaborative and helpful, like a teammate who's done this before and is happy to share.

## Usage data (last {{WINDOW_DAYS}} days)

This was scanned from the guide creator's local Claude Code transcripts:

\`\`\`json
{{USAGE_DATA}}
\`\`\`

## Your task

Before anything else — including before thinking through the classification — output exactly this line as your first visible text:

> Looking at how you've used Claude over the last {{WINDOW_DAYS}} days to put together an onboarding guide for teammates new to Claude Code.

This must come before any extended thinking about session descriptors. The guide creator is staring at a blank screen until you do. Classification is step 2, not step 1.

Generate the guide immediately, then ask for revisions. Don't wait for answers first — it's easier for the guide creator to edit a concrete draft than answer abstract questions.

1. **Output the acknowledgment line above.** No thinking, no classification, no tool calls before this. One line, then move on.

2. **Derive the work-type breakdown.** Read the \`sessionDescriptors\` array — each entry describes one session via its title, any linked code reviews (\`prNumbers\`), and first user message. Classify each session into one of these task types:

   - **build_feature** — new functionality, scripts, tools, config/CI/env setup
   - **debug_fix** — investigating and fixing bugs
   - **improve_quality** — refactoring, tests, cleanup, code review
   - **analyze_data** — queries, metrics, number crunching
   - **plan_design** — architecture, approach, strategy, understanding unfamiliar code, design review
   - **prototype** — spikes, POCs, throwaway exploration
   - **write_docs** — PRDs, RFCs, READMEs, design docs, copy/doc review

   Categories describe the *type of task*, not the project or domain — a teammate on any project should recognize them. Review sessions belong with whatever's being reviewed: code review is improve_quality, doc review is write_docs, design review is plan_design. Most sessions fit the list; only invent a new category if it's genuinely a different type of task. Pick the top 3-5 with rough percentages. First messages alone are usually enough; titles and code-review links are enrichment. If first messages are uninformative, use tool and MCP counts as a weak hint. If there are ~0 sessions, leave the breakdown as a TODO.

   In the rendered guide, display categories with spaces and title case (e.g. "Build Feature" not "build_feature").

3. **Gather the remaining pieces.** For repos, start with \`currentRepo\` and check the workspace for sibling repo directories. For MCP server setup, use each entry's \`name\` (and \`urlOrigin\` where present) to infer what the server does and how a teammate would get access. Leave the Team Tips and Get Started sections as TODO placeholders — you'll ask for these in Review and fill them in after.

4. **Write the guide to \`ONBOARDING.md\`** following this template:

\`\`\`
{{GUIDE_TEMPLATE}}
\`\`\`

   Fill in real numbers from the usage data (not placeholders). Use \`generatedBy\` for the name; if it's missing, omit the name. Ascii bar charts: \`█\` for filled, \`░\` for empty, 20 chars wide. Keep the HTML comment instruction at the bottom exactly as shown.

5. **Render the guide in a code block, then close out the first turn.** You're co-authoring this guide with the guide creator — frame the follow-up as collaboration, not corrections.

   After the code block, add a \`---\` horizontal rule and a \`**Review**\` heading so the guide is visually separated from your questions. Under the heading, number these three questions:

   1. "I went with '[X]' for the team name — let me know if that sounds right." (or if you couldn't tell: "What's the team name? I'll add it in.")
   2. Is there a starter task for someone new to Claude Code? (ticket or doc link — optional)
   3. Any team tips you'd tell a new teammate that aren't already in CLAUDE.md?

   After they answer, update \`ONBOARDING.md\` with their team name, tips, and starter task. Then close with this exact line (not numbered, not paraphrased):

   Saved to \`ONBOARDING.md\`. Drop it in your team docs and channels — when a new teammate pastes it into Claude Code, they get a guided onboarding tour from there.

   Apply any edits they come back with to the file.`

const ALLOWED_TOOLS = ['Edit(ONBOARDING.md)', 'Bash(ls *)']

const teamOnboarding = {
  type: 'prompt',
  name: 'team-onboarding',
  description: 'Help teammates ramp on Claude Code with a guide from your usage',
  allowedTools: ALLOWED_TOOLS,
  contentLength: 0,
  isEnabled: () => true,
  isHidden: false,
  progressMessage: 'scanning usage data',
  requires: { workspace: true },
  userFacingName() {
    return 'team-onboarding'
  },
  source: 'builtin',
  disableModelInvocation: true,
  async getPromptForCommand() {
    const featureConfig = getFeatureValue_CACHED_MAY_BE_STALE<{
      prompt?: unknown
      guideTemplate?: unknown
      windowDays?: unknown
    }>('tengu_flint_harbor_prompt', {})
    const prompt =
      typeof featureConfig?.prompt === 'string'
        ? featureConfig.prompt
        : DEFAULT_PROMPT
    const guideTemplate =
      typeof featureConfig?.guideTemplate === 'string'
        ? featureConfig.guideTemplate
        : GUIDE_TEMPLATE
    const windowDays =
      typeof featureConfig?.windowDays === 'number'
        ? Math.min(Math.max(Math.floor(featureConfig.windowDays), 1), 365)
        : DEFAULT_WINDOW_DAYS

    logEvent('tengu_team_onboarding_invoked', { window_days: windowDays })
    const {
      usageData,
      sessionCount,
      slashCommandCount,
      mcpServerCount,
    } = await gatherTeamOnboardingUsage(windowDays)
    const text = prompt
      .replaceAll('{{WINDOW_DAYS}}', String(windowDays))
      .replaceAll('{{GUIDE_TEMPLATE}}', guideTemplate)
      .replaceAll('{{USAGE_DATA}}', usageData)
    logEvent('tengu_team_onboarding_generated', {
      session_count: sessionCount,
      slash_command_count: slashCommandCount,
      mcp_server_count: mcpServerCount,
      window_days: windowDays,
    })
    return [{ type: 'text' as const, text }]
  },
} satisfies Command

export default teamOnboarding

export const TEAM_ONBOARDING_DISCOVERY_COPY = {
  heading: 'On a team?',
  body: `Ask a teammate to run /team-onboarding and share the guide.
Paste it as your first message and I'll get you set up.`,
}

export const resolveTeamOnboardingDiscoveryArm = memoize((): string => {
  if (isConsumerSubscriber()) return 'off'
  const override = process.env.CLAUDE_CODE_TEAM_ONBOARDING
  if (override === 'banner' || override === 'step') return override
  const arm = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_cedar_inlet',
    'off',
  )
  if (arm !== 'off') {
    logEvent('tengu_team_onboarding_discovery_shown', { arm })
  }
  return arm
})
