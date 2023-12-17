const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_QUERY_ENGINE_ACTIVE_SKILL_EVIDENCE_IDS = Object.freeze([
  'target121-query-engine-active-skill-authenticated-whole-class',
  'target121-query-engine-active-skill-exact-capture-restore',
  'target121-query-engine-active-skill-source-type-graph-blocker',
])

export const TARGET121_QUERY_ENGINE_ACTIVE_SKILL_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21925`,
      targetIndex: 21925,
      paths: Object.freeze(['src/QueryEngine.ts']),
      declarations: Object.freeze(['QueryEngine', 'submitMessage']),
      evidenceIds: TARGET121_QUERY_ENGINE_ACTIVE_SKILL_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 QueryEngine class captures processUserInputContext.options.activeSkill immediately before replacing that context after prompt processing, then restores the captured value on the replacement context options. Removing exactly the capture declarator and restore property makes the complete Target121 class AST and identifier-normalized token stream identical to unmatched Target120 u21824. The distinct REPL u21373 assignment is dependency evidence only. Recovered Target120, Target121, and fresh-package QueryEngine source omit both nodes, while ProcessUserInputContext and ToolUseContext omit the provenance type graph, so this is a static complete-class owner proof and never a partial source replay.',
    }),
  ])
