const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_FORK_SPAWNED_BY_SKILL_EVIDENCE_IDS = Object.freeze([
  'target121-fork-spawned-by-skill-authenticated-whole-unit',
  'target121-fork-spawned-by-skill-exact-property-insertion',
  'target121-fork-spawned-by-skill-source-type-graph-blocker',
])

export const TARGET121_FORK_SPAWNED_BY_SKILL_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:18932`,
    targetIndex: 18932,
    paths: Object.freeze(['src/commands/fork/fork.ts']),
    declarations: Object.freeze(['spawnFork']),
    evidenceIds: TARGET121_FORK_SPAWNED_BY_SKILL_EVIDENCE_IDS,
    behavior:
      'The authenticated Target121 spawnFork unit forwards context.options.spawnedBySkill with context.options.activeSkill as the fallback into runAgent. Removing exactly that property makes the complete identifier-normalized and alpha-canonical unit identical to its Target120 predecessor. The generated remote-setup owner is false, while recovered Target120, Target121, and fresh-package fork.ts are byte-identical and both spawnFork plus ToolUseContext.options omit the provenance graph, so this is a static whole-unit owner proof and never an isolated source replay.',
  }),
])
