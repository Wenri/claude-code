const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_FORK_SPAWN_EVIDENCE_IDS = Object.freeze([
  'target117-fork-spawn-authenticated-whole-unit',
  'target117-fork-spawn-target118-temporal-lineage',
  'target117-fork-spawn-stale-lifecycle-graph-blocker',
])

export const TARGET117_FORK_SPAWN_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:17725`,
    targetIndex: 17725,
    paths: Object.freeze(['src/commands/fork/fork.ts']),
    declarations: Object.freeze(['spawnFork']),
    evidenceIds: TARGET117_FORK_SPAWN_EVIDENCE_IDS,
    behavior:
      'Authenticated Target117 spawnFork registers its derived name through ToolUseContext.agentLifecycle, uses the context taskRegistry for async task registration and lifecycle cleanup, and runs the fork as an async built-in subagent. The recovered lifecycle type graph is stale, so this is a static whole-unit owner proof and never a partial source replay.',
  }),
])
