import { z } from 'zod/v4'
import { logEvent } from '../services/analytics/index.js'
import { lazySchema } from './lazySchema.js'

export type FrontmatterSurface = 'skill' | 'agent' | 'output-style'

const scalar = () => z.union([z.string(), z.number(), z.boolean(), z.null()])
const booleanScalar = scalar
const scalarOrStringArray = () => z.union([scalar(), z.array(z.string())])

const CommandFrontmatterShadowSchema = lazySchema(() =>
  z.object({
    name: scalar()
      .optional()
      .describe('Display name. Defaults to the filename without extension.'),
    description: scalar()
      .optional()
      .describe('One-line summary shown in listings and the Skill tool.'),
    model: scalar()
      .optional()
      .describe(
        'Model override (`haiku`, `sonnet`, `opus`, or a full ID). Use `inherit` to match the parent conversation.',
      ),
    'allowed-tools': scalarOrStringArray()
      .optional()
      .describe(
        'Tools available to the model while this file is active. Comma-separated string or YAML list.',
      ),
    'argument-hint': scalar()
      .optional()
      .describe('Placeholder text shown after the slash command name.'),
    arguments: scalarOrStringArray()
      .optional()
      .describe(
        '@internal — typed variant of argument-hint; argument-hint is the documented form',
      ),
    'disable-model-invocation': booleanScalar()
      .optional()
      .describe(
        'If true, the model cannot invoke this via the Skill tool; only users can type the slash command.',
      ),
    'user-invocable': booleanScalar()
      .optional()
      .describe(
        'If false, hides the slash command from users; only the model can invoke it via the Skill tool.',
      ),
    effort: scalar()
      .optional()
      .describe(
        'Thinking effort for the model: `low`, `medium`, `high`, `max`, or an integer.',
      ),
    shell: scalar()
      .optional()
      .describe(
        'Shell for `!`-command blocks: `bash` or `powershell`. Defaults to bash regardless of platform.',
      ),
    version: scalar()
      .optional()
      .describe('@internal — bookkeeping, not surfaced to users'),
  }),
)

const SkillFrontmatterShadowSchema = lazySchema(() =>
  CommandFrontmatterShadowSchema().extend({
    when_to_use: scalar()
      .optional()
      .describe(
        'Guidance for when the model should reach for this skill. Becomes part of the tool description.',
      ),
    paths: scalarOrStringArray()
      .optional()
      .describe(
        'Glob patterns this skill applies to. The skill only loads when the model touches matching files.',
      ),
    hooks: z
      .unknown()
      .optional()
      .describe(
        'Hooks registered while this skill is active. Same shape as settings.json `hooks`.',
      ),
    context: z
      .enum(['inline', 'fork'])
      .nullable()
      .optional()
      .describe(
        'Where the skill runs: `inline` expands into the current conversation; `fork` spawns a subagent.',
      ),
    agent: scalar()
      .optional()
      .describe('Agent type to spawn when `context: fork`.'),
    created_by: scalar()
      .optional()
      .describe('@internal — provenance marker (e.g. dream-proposal)'),
    improved_by: scalar()
      .optional()
      .describe('@internal — provenance marker (e.g. dream-proposal)'),
    mcpServers: z.unknown().optional().describe('@internal'),
    lspServers: z.unknown().optional().describe('@internal'),
    agents: z.unknown().optional().describe('@internal'),
    outputStyles: z.unknown().optional().describe('@internal'),
    channels: z.unknown().optional().describe('@internal'),
    monitors: z.unknown().optional().describe('@internal'),
    settings: z.unknown().optional().describe('@internal'),
  }),
)

const AgentFrontmatterShadowSchema = lazySchema(() =>
  z.object({
    name: scalar().describe(
      'Agent identifier. Required — this is how the Agent tool and `--agent` flag address it.',
    ),
    description: scalar().describe(
      'When to use this agent. Required — shown in the Agent tool listing.',
    ),
    model: scalar()
      .optional()
      .describe(
        'Model override for this agent. Use `inherit` to match the spawning conversation.',
      ),
    tools: scalarOrStringArray()
      .optional()
      .describe('Tools available to this agent. Replaces the default set.'),
    disallowedTools: scalarOrStringArray()
      .optional()
      .describe('Tools removed from the default set. Ignored if `tools` is set.'),
    color: scalar()
      .optional()
      .describe('@internal — display color in the agents UI'),
    effort: scalar()
      .optional()
      .describe(
        'Thinking effort: `low`, `medium`, `high`, `max`, or an integer.',
      ),
    permissionMode: scalar()
      .optional()
      .describe('Permission mode the agent runs in.'),
    mcpServers: z
      .unknown()
      .optional()
      .describe('MCP servers to connect when this agent runs.'),
    hooks: z
      .unknown()
      .optional()
      .describe('Hooks registered while this agent runs.'),
    maxTurns: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .describe('Maximum conversation turns before the agent stops.'),
    skills: scalarOrStringArray()
      .optional()
      .describe('Skills preloaded for this agent.'),
    initialPrompt: scalar()
      .optional()
      .describe(
        'Auto-submitted first message when this agent runs as the main session (via `--agent` or settings). Not read when spawned as a subagent.',
      ),
    memory: scalar()
      .optional()
      .describe('Memory scope: `user`, `project`, or `local`.'),
    background: booleanScalar()
      .optional()
      .describe('If true, the agent runs in the background by default.'),
    isolation: scalar()
      .optional()
      .describe(
        'Filesystem isolation: `worktree` runs in a temporary git worktree.',
      ),
  }),
)

const OutputStyleFrontmatterShadowSchema = lazySchema(() =>
  z.object({
    name: scalar()
      .optional()
      .describe(
        'Style name used in `/output-style` and settings. Defaults to the filename.',
      ),
    description: scalar()
      .optional()
      .describe('Shown in the `/output-style` picker.'),
    'keep-coding-instructions': booleanScalar()
      .optional()
      .describe(
        'If true, the default coding instructions stay in the system prompt alongside this style.',
      ),
    'force-for-plugin': booleanScalar()
      .optional()
      .describe(
        '@internal — only meaningful for plugin-bundled styles; ignored for user styles',
      ),
  }),
)

const schemas = {
  skill: SkillFrontmatterShadowSchema,
  agent: AgentFrontmatterShadowSchema,
  'output-style': OutputStyleFrontmatterShadowSchema,
}

const emitted = new Set<string>()

function emitOnce(event: string, surface: FrontmatterSurface, detail: string) {
  const key = `${event}:${surface}:${detail}`
  if (emitted.has(key)) return
  emitted.add(key)
  logEvent(event, { surface, detail })
}

export function shadowValidateFrontmatter(
  surface: FrontmatterSurface,
  frontmatter: unknown,
): void {
  try {
    const result = schemas[surface]().strict().safeParse(frontmatter)
    if (result.success) return
    for (const issue of result.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          emitOnce('tengu_frontmatter_shadow_unknown_key', surface, key)
        }
      } else {
        const field = String(issue.path[0] ?? '')
        emitOnce(
          'tengu_frontmatter_shadow_mismatch',
          surface,
          `${field}:${issue.code}`,
        )
      }
    }
  } catch {}
}
