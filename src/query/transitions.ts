export const QUERY_TERMINAL_REASONS = [
  'blocking_limit',
  'rapid_refill_breaker',
  'prompt_too_long',
  'image_error',
  'model_error',
  'aborted_streaming',
  'aborted_tools',
  'stop_hook_prevented',
  'hook_stopped',
  'tool_deferred',
  'max_turns',
  'completed',
] as const

export type QueryTerminalReason = (typeof QUERY_TERMINAL_REASONS)[number]

type SimpleTerminalReason = Exclude<
  QueryTerminalReason,
  'model_error' | 'max_turns'
>

export type Terminal =
  | { reason: SimpleTerminalReason }
  | { reason: 'model_error'; error: unknown }
  | { reason: 'max_turns'; turnCount: number }

export type Continue =
  | { reason: 'collapse_drain_retry'; committed: number }
  | { reason: 'reactive_compact_retry' }
  | { reason: 'max_output_tokens_escalate' }
  | { reason: 'max_output_tokens_recovery'; attempt: number }
  | { reason: 'malformed_tool_use_retry' }
  | { reason: 'stop_hook_blocking' }
  | { reason: 'token_budget_continuation' }
  | { reason: 'next_turn' }
