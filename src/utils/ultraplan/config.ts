import { getIsRemoteMode } from '../../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isClaudeAISubscriber } from '../auth.js'

export const CCR_TERMS_URL =
  'https://code.claude.com/docs/en/claude-code-on-the-web'

export type UltraplanPromptIdentifier =
  | 'simple_plan'
  | 'visual_plan'
  | 'three_subagents_with_critique'

export type UltraplanCopy = {
  timeEstimate: string
  dialogBody: string
  dialogPipeline: string
  usageBlurb: string[]
}

const DEFAULT_PROMPT_IDENTIFIER: UltraplanPromptIdentifier = 'simple_plan'

const SIMPLE_PLAN_COPY: UltraplanCopy = {
  timeEstimate: 'a few minutes',
  dialogBody:
    "Interactive planning on the web where you can edit and leave targeted comments on Claude's plan.",
  dialogPipeline: 'Plan → Edit → Execute',
  usageBlurb: [
    'Remote plan mode with rich web editing experience.',
    'Runs in Claude Code on the web. When the plan is ready,',
    'you can execute it in the web session or send it back here.',
    'You can continue to work while the plan is generated remotely.',
  ],
}

const ULTRAPLAN_COPY: Record<UltraplanPromptIdentifier, UltraplanCopy> = {
  simple_plan: SIMPLE_PLAN_COPY,
  visual_plan: SIMPLE_PLAN_COPY,
  three_subagents_with_critique: {
    timeEstimate: '~10–30 min',
    dialogBody:
      "Interactive planning on the web where you can edit and leave targeted comments on Claude's plan.",
    dialogPipeline: 'Scope → Critique → Edit → Execute',
    usageBlurb: [
      'Advanced multi-agent plan mode.',
      'Runs in Claude Code on the web. When the plan is ready,',
      'you can execute it in the web session or send it back here.',
      'You can continue to work while the plan is generated remotely.',
    ],
  },
}

function isUltraplanPromptIdentifier(
  value: string,
): value is UltraplanPromptIdentifier {
  return value in ULTRAPLAN_COPY
}

export function getUltraplanPromptIdentifier(): UltraplanPromptIdentifier {
  const configured = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_ultraplan_prompt_identifier',
    DEFAULT_PROMPT_IDENTIFIER,
  )
  return isUltraplanPromptIdentifier(configured)
    ? configured
    : DEFAULT_PROMPT_IDENTIFIER
}

export function getUltraplanCopy(
  promptIdentifier = getUltraplanPromptIdentifier(),
): UltraplanCopy {
  return ULTRAPLAN_COPY[promptIdentifier]
}

/** Canonical runtime gate shared by the command, keyword UI, and plan dialog. */
export function isUltraplanEnabled(): boolean {
  const config = getFeatureValue_CACHED_MAY_BE_STALE<{
    enabled?: boolean
  } | null>('tengu_ultraplan_config', null)
  return (
    config?.enabled === true &&
    isClaudeAISubscriber() &&
    !getIsRemoteMode()
  )
}
