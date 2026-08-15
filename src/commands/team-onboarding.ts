import { readdir, readFile, stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import type { Command } from '../commands.js'
import { logEvent } from '../services/analytics/index.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { parseGitRemote } from '../utils/detectRepository.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
import { getProjectDir } from '../utils/sessionStorage.js'
import { jsonStringify } from '../utils/slowOperations.js'

const DEFAULT_WINDOW_DAYS = 30
const MAX_SESSION_BYTES = 50 * 1024 * 1024
const MAX_FIRST_MESSAGE_CHARS = 200
const MAX_SESSION_DESCRIPTORS = 60

type SessionDescriptor = {
  title?: string
  prNumbers: number[]
  firstMessage?: string
}

type ScanResult = {
  slashCommandCounts: Map<string, number>
  mcpServerCounts: Map<string, number>
  sessionDescriptors: SessionDescriptor[]
  sessionFileCount: number
}

const SLASH_COMMAND_RE = /<command-name>\/([\w:-]+)<\/command-name>/g
const MCP_TOOL_RE = /"name":"mcp__([^"]+?)__([^"]+)"/g
const CUSTOM_TITLE_RE = /"customTitle":"([^"]+)"/
const PR_NUMBER_RE = /"prNumber":(\d+)/
const FIRST_USER_MESSAGE_RE = /"role":"user"[^}]*"content":"([^"]+)"/

async function scanSessionUsage(
  projectDir: string,
  windowDays: number,
): Promise<ScanResult> {
  const result: ScanResult = {
    slashCommandCounts: new Map(),
    mcpServerCounts: new Map(),
    sessionDescriptors: [],
    sessionFileCount: 0,
  }
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000
  let entries: string[]
  try {
    entries = await readdir(projectDir)
  } catch (error) {
    if (isENOENT(error)) return result
    throw error
  }

  for (const entry of entries) {
    if (extname(entry) !== '.jsonl') continue
    const filename = join(projectDir, entry)
    let fileStat
    try {
      fileStat = await stat(filename)
    } catch (error) {
      if (isENOENT(error)) continue
      throw error
    }
    if (!fileStat.isFile() || fileStat.mtimeMs < cutoff) continue
    if (fileStat.size > MAX_SESSION_BYTES) continue

    let source: string
    try {
      source = await readFile(filename, 'utf8')
    } catch (error) {
      if (isENOENT(error)) continue
      throw error
    }
    result.sessionFileCount++
    const descriptor: SessionDescriptor = { prNumbers: [] }

    for (const line of source.split('\n')) {
      if (line.length < 10) continue
      if (
        line.includes('"content":"<command-name>/') ||
        line.includes('"content":"<command-message>')
      ) {
        for (const match of line.matchAll(SLASH_COMMAND_RE)) {
          const command = match[1]!
          result.slashCommandCounts.set(
            command,
            (result.slashCommandCounts.get(command) ?? 0) + 1,
          )
        }
      }
      if (line.includes('"type":"tool_use"') && line.includes('"name":"mcp__')) {
        for (const match of line.matchAll(MCP_TOOL_RE)) {
          const server = match[1]!
          result.mcpServerCounts.set(
            server,
            (result.mcpServerCounts.get(server) ?? 0) + 1,
          )
        }
      }
      if (line.includes('"type":"custom-title"')) {
        const match = CUSTOM_TITLE_RE.exec(line)
        if (match) descriptor.title = match[1]
      }
      if (line.includes('"type":"pr-link"')) {
        const match = PR_NUMBER_RE.exec(line)
        if (match) {
          const number = Number(match[1])
          if (!descriptor.prNumbers.includes(number)) {
            descriptor.prNumbers.push(number)
          }
        }
      }
      if (
        !descriptor.firstMessage &&
        line.includes('"role":"user"') &&
        !line.includes('"content":"<command-name>/') &&
        !line.includes('"content":[')
      ) {
        const match = FIRST_USER_MESSAGE_RE.exec(line)
        if (match) {
          const message = match[1]!
            .replace(/\\n/g, ' ')
            .replace(/\\"/g, '"')
          if (message.length > 3 && !message.startsWith('<')) {
            descriptor.firstMessage = message.slice(0, MAX_FIRST_MESSAGE_CHARS)
          }
        }
      }
    }
    if (
      descriptor.title ||
      descriptor.prNumbers.length > 0 ||
      descriptor.firstMessage
    ) {
      result.sessionDescriptors.push(descriptor)
    }
  }

  if (result.sessionDescriptors.length > MAX_SESSION_DESCRIPTORS) {
    result.sessionDescriptors.sort((left, right) => {
      const score = (value: SessionDescriptor): number =>
        (value.title ? 2 : 0) + (value.prNumbers.length > 0 ? 1 : 0)
      return score(right) - score(left)
    })
    result.sessionDescriptors = result.sessionDescriptors.slice(
      0,
      MAX_SESSION_DESCRIPTORS,
    )
  }
  return result
}

function urlOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

async function readMcpServers(
  cwd: string,
): Promise<Record<string, { url?: unknown }>> {
  try {
    const source = await readFile(join(cwd, '.mcp.json'), 'utf8')
    const parsed = JSON.parse(source) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      'mcpServers' in parsed &&
      parsed.mcpServers &&
      typeof parsed.mcpServers === 'object'
    ) {
      return parsed.mcpServers as Record<string, { url?: unknown }>
    }
  } catch (error) {
    if (!isENOENT(error)) {
      logForDebugging(
        `team-onboarding: failed to read .mcp.json: ${error instanceof Error ? error.message : String(error)}`,
        { level: 'error' },
      )
    }
  }
  return {}
}

async function generateUsageData(windowDays: number): Promise<{
  usageData: string
  sessionCount: number
  slashCommandCount: number
  mcpServerCount: number
}> {
  const cwd = getCwd()
  const scan = await scanSessionUsage(getProjectDir(cwd), windowDays)
  const slashCommands = [...scan.slashCommandCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name, count]) => ({ name: `/${name}`, count }))
  const configuredMcp = await readMcpServers(cwd)
  const mcpServers = [...scan.mcpServerCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name, callCount]) => {
      const configured = configuredMcp[name]
      return {
        name,
        callCount,
        urlOrigin:
          typeof configured?.url === 'string'
            ? urlOrigin(configured.url)
            : undefined,
      }
    })
  const generatedBy = (
    await execFileNoThrow('git', ['config', 'user.name'], { useCwd: true })
  ).stdout.trim()
  const remote = (
    await execFileNoThrow('git', ['remote', 'get-url', 'origin'], {
      useCwd: true,
    })
  ).stdout.trim()
  const repository = parseGitRemote(remote)
  return {
    usageData: jsonStringify(
      {
        generatedBy: generatedBy || undefined,
        currentRepo: repository?.name ?? basename(cwd),
        windowDays,
        sessionCount: scan.sessionFileCount,
        slashCommands,
        mcpServers,
        sessionDescriptors: scan.sessionDescriptors,
      },
      null,
      2,
    ),
    sessionCount: scan.sessionFileCount,
    slashCommandCount: scan.slashCommandCounts.size,
    mcpServerCount: scan.mcpServerCounts.size,
  }
}

const DEFAULT_GUIDE_TEMPLATE = `# Welcome to [Team Name]

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

const DEFAULT_PROMPT = `You are helping a power user generate an onboarding guide for teammates who are new to Claude Code. The guide will live in the team's onboarding docs and can be pasted into Claude for an interactive walkthrough.

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

export const TEAM_ONBOARDING_DISCOVERY_COPY = {
  heading: 'On a team?',
  body: `Ask a teammate to run /team-onboarding and share the guide.
Paste it as your first message and I'll get you set up.`,
}

export type TeamOnboardingDiscoveryArm = 'off' | 'banner' | 'step'

export function resolveTeamOnboardingDiscoveryArm(): TeamOnboardingDiscoveryArm {
  if (isEnvTruthy(process.env.CLAUBBIT)) return 'off'
  const env = process.env.CLAUDE_CODE_TEAM_ONBOARDING
  if (env === 'banner' || env === 'step') return env
  const arm = getFeatureValue_CACHED_MAY_BE_STALE<TeamOnboardingDiscoveryArm>(
    'tengu_cedar_inlet',
    'off',
  )
  if (arm !== 'off') {
    logEvent('tengu_team_onboarding_discovery_shown', { arm })
  }
  return arm
}

export default {
  type: 'prompt',
  name: 'team-onboarding',
  description: 'Help teammates ramp on Claude Code with a guide from your usage',
  allowedTools: ['Edit(ONBOARDING.md)', 'Bash(ls *)'],
  contentLength: 0,
  isEnabled: () => true,
  isHidden: false,
  progressMessage: 'scanning usage data',
  userFacingName: () => 'team-onboarding',
  source: 'builtin',
  disableModelInvocation: true,
  async getPromptForCommand() {
    const config = getFeatureValue_CACHED_MAY_BE_STALE<{
      prompt?: unknown
      guideTemplate?: unknown
      windowDays?: unknown
    }>('tengu_flint_harbor_prompt', {})
    const prompt =
      typeof config.prompt === 'string' ? config.prompt : DEFAULT_PROMPT
    const guideTemplate =
      typeof config.guideTemplate === 'string'
        ? config.guideTemplate
        : DEFAULT_GUIDE_TEMPLATE
    const windowDays =
      typeof config.windowDays === 'number'
        ? Math.min(Math.max(Math.floor(config.windowDays), 1), 365)
        : DEFAULT_WINDOW_DAYS
    logEvent('tengu_team_onboarding_invoked', { window_days: windowDays })
    const { usageData, sessionCount, slashCommandCount, mcpServerCount } =
      await generateUsageData(windowDays)
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
    return [{ type: 'text', text }]
  },
} satisfies Command
