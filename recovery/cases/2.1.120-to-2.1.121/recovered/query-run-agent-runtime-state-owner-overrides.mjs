const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_EVIDENCE_IDS =
  Object.freeze([
    'target121-query-run-agent-authenticated-whole-units',
    'target121-spawned-by-skill-forwarding-contract',
    'target121-query-compact-tracking-source-gap',
  ])

export const TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:14201`,
      targetIndex: 14201,
      paths: Object.freeze(['src/query.ts']),
      declarations: Object.freeze(['QueryParams', 'State', 'queryLoop']),
      evidenceIds: TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 queryLoop unit receives spawnedBySkill, forwards spawnedBySkill and the activeSkill option into model-request options, and carries compactTracking through the loop state. Its direct Target120 predecessor uses autoCompactTracking and lacks the skill-provenance fields. Recovered Target121 query.ts proves the declaration owner and surrounding query evolution but still uses autoCompactTracking and contains none of spawnedBySkill, activeSkill, or compactTracking, so ownership is static and no partial source replay is admitted.',
    }),
    Object.freeze({
      key: `${CASE_NAME}:14209`,
      targetIndex: 14209,
      paths: Object.freeze(['src/tools/AgentTool/runAgent.ts']),
      declarations: Object.freeze(['runAgent']),
      evidenceIds: TARGET121_QUERY_RUN_AGENT_RUNTIME_STATE_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 runAgent unit adds spawnedBySkill at exactly three linked boundaries: its parameter pattern, the child ToolUseContext options, and the query call. Removing only those properties makes the complete alpha-canonical unit identical to its Target120 predecessor. Recovered runAgent.ts and its query call are otherwise authenticated but omit all three additions, so this forwarding contract is proved statically without inventing the absent parameter and dependency types.',
    }),
  ])
