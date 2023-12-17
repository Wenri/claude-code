import { OAUTH_BETA_HEADER } from './oauth.js'

export type BetaDescriptor = Readonly<{
  name: string
  header: string
}>

function createBetaDescriptor(name: string, header: string): BetaDescriptor {
  return Object.freeze({ name, header })
}

export const CLAUDE_CODE_BETA = createBetaDescriptor(
  'claude_code',
  'claude-code-20250219',
)
export const OAUTH_AUTH_BETA = createBetaDescriptor(
  'oauth_auth',
  OAUTH_BETA_HEADER,
)
export const INTERLEAVED_THINKING_BETA = createBetaDescriptor(
  'interleaved_thinking',
  'interleaved-thinking-2025-05-14',
)
export const LONG_CONTEXT_BETA = createBetaDescriptor(
  'long_context',
  'context-1m-2025-08-07',
)
export const CONTEXT_MANAGEMENT_BETA = createBetaDescriptor(
  'context_management',
  'context-management-2025-06-27',
)
export const STRUCTURED_OUTPUTS_BETA = createBetaDescriptor(
  'structured_outputs',
  'structured-outputs-2025-12-15',
)
export const WEB_SEARCH_BETA = createBetaDescriptor(
  'web_search',
  'web-search-2025-03-05',
)
// Tool search beta headers differ by provider:
// - Claude API / Foundry: advanced-tool-use-2025-11-20
// - Vertex AI / Bedrock: tool-search-tool-2025-10-19
export const TOOL_SEARCH_BETA_1P = createBetaDescriptor(
  'tool_search',
  'advanced-tool-use-2025-11-20',
)
export const TOOL_SEARCH_BETA_3P = createBetaDescriptor(
  'tool_search',
  'tool-search-tool-2025-10-19',
)
export const EFFORT_BETA = createBetaDescriptor(
  'effort',
  'effort-2025-11-24',
)
export const TASK_BUDGETS_BETA = createBetaDescriptor(
  'task_budgets',
  'task-budgets-2026-03-13',
)
export const PROMPT_CACHING_SCOPE_BETA = createBetaDescriptor(
  'prompt_caching_scope',
  'prompt-caching-scope-2026-01-05',
)
export const FAST_MODE_BETA = createBetaDescriptor(
  'speed',
  'fast-mode-2026-02-01',
)
export const REDACT_THINKING_BETA = createBetaDescriptor(
  'redact_thinking',
  'redact-thinking-2026-02-12',
)
export const TOKEN_EFFICIENT_TOOLS_BETA = createBetaDescriptor(
  'token_efficient_tools',
  'token-efficient-tools-2026-03-28',
)
export const CACHE_EDITING_BETA: BetaDescriptor | null = null
export const AFK_MODE_BETA = createBetaDescriptor(
  'afk_mode',
  'afk-mode-2026-01-31',
)
export const ADVISOR_BETA = createBetaDescriptor(
  'advisor_tool',
  'advisor-tool-2026-03-01',
)
export const CACHE_DIAGNOSIS_BETA = createBetaDescriptor(
  'cache_diagnosis',
  'cache-diagnosis-2026-04-07',
)

const ALL_BETA_DESCRIPTORS = Object.freeze(
  [
    CLAUDE_CODE_BETA,
    OAUTH_AUTH_BETA,
    INTERLEAVED_THINKING_BETA,
    LONG_CONTEXT_BETA,
    CONTEXT_MANAGEMENT_BETA,
    STRUCTURED_OUTPUTS_BETA,
    WEB_SEARCH_BETA,
    TOOL_SEARCH_BETA_1P,
    TOOL_SEARCH_BETA_3P,
    EFFORT_BETA,
    TASK_BUDGETS_BETA,
    PROMPT_CACHING_SCOPE_BETA,
    FAST_MODE_BETA,
    REDACT_THINKING_BETA,
    TOKEN_EFFICIENT_TOOLS_BETA,
    CACHE_EDITING_BETA,
    AFK_MODE_BETA,
    ADVISOR_BETA,
    CACHE_DIAGNOSIS_BETA,
  ].filter((beta): beta is BetaDescriptor => beta !== null),
)

export const BETA_DESCRIPTOR_BY_HEADER = new Map(
  ALL_BETA_DESCRIPTORS.map(beta => [beta.header, beta]),
)

export const CLAUDE_CODE_20250219_BETA_HEADER = CLAUDE_CODE_BETA.header
export const INTERLEAVED_THINKING_BETA_HEADER =
  INTERLEAVED_THINKING_BETA.header
export const CONTEXT_1M_BETA_HEADER = LONG_CONTEXT_BETA.header
export const CONTEXT_MANAGEMENT_BETA_HEADER = CONTEXT_MANAGEMENT_BETA.header
export const STRUCTURED_OUTPUTS_BETA_HEADER = STRUCTURED_OUTPUTS_BETA.header
export const WEB_SEARCH_BETA_HEADER = WEB_SEARCH_BETA.header
export const TOOL_SEARCH_BETA_HEADER_1P = TOOL_SEARCH_BETA_1P.header
export const TOOL_SEARCH_BETA_HEADER_3P = TOOL_SEARCH_BETA_3P.header
export const EFFORT_BETA_HEADER = EFFORT_BETA.header
export const TASK_BUDGETS_BETA_HEADER = TASK_BUDGETS_BETA.header
export const PROMPT_CACHING_SCOPE_BETA_HEADER =
  PROMPT_CACHING_SCOPE_BETA.header
export const FAST_MODE_BETA_HEADER = FAST_MODE_BETA.header
export const REDACT_THINKING_BETA_HEADER = REDACT_THINKING_BETA.header
export const TOKEN_EFFICIENT_TOOLS_BETA_HEADER =
  TOKEN_EFFICIENT_TOOLS_BETA.header
export const SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER = ''
export const AFK_MODE_BETA_HEADER = AFK_MODE_BETA?.header ?? ''
export const CLI_INTERNAL_BETA_HEADER =
  process.env.USER_TYPE === 'ant' ? 'cli-internal-2026-02-09' : ''
export const ADVISOR_BETA_HEADER = ADVISOR_BETA.header
export const CACHE_DIAGNOSIS_BETA_HEADER = CACHE_DIAGNOSIS_BETA.header

/**
 * Bedrock only supports a limited number of beta headers and only through
 * extraBodyParams. This set maintains the beta strings that should be in
 * Bedrock extraBodyParams *and not* in Bedrock headers.
 */
export const BEDROCK_EXTRA_PARAMS_HEADERS = new Set([
  INTERLEAVED_THINKING_BETA,
  LONG_CONTEXT_BETA,
  TOOL_SEARCH_BETA_3P,
].map(beta => beta.header))

/**
 * Betas allowed on Vertex countTokens API.
 * Other betas will cause 400 errors.
 */
export const VERTEX_COUNT_TOKENS_ALLOWED_BETAS = new Set([
  CLAUDE_CODE_BETA,
  INTERLEAVED_THINKING_BETA,
  CONTEXT_MANAGEMENT_BETA,
].map(beta => beta.header))
