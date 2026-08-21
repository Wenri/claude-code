const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_EVIDENCE_IDS =
  Object.freeze([
    'target121-query-model-skill-attribution-authenticated-whole-unit',
    'target121-query-model-skill-attribution-four-call-graph',
    'target121-query-model-skill-attribution-source-type-graph-blocker',
  ])

export const TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:19537`,
      targetIndex: 19537,
      paths: Object.freeze(['src/services/api/claude.ts']),
      declarations: Object.freeze(['Options', 'queryModel']),
      evidenceIds: TARGET121_QUERY_MODEL_SKILL_ATTRIBUTION_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 queryModel unit spreads skill-attribution metadata into four assistant-message construction paths by passing options.querySource, options.spawnedBySkill, and options.activeSkill to the authenticated attribution helper. That helper attributes built-in and custom agents to their spawning skill and plugin, and attributes main-thread requests to the active skill. Recovered Target121 and fresh-package claude.ts omit all four calls, the helper, and both Options members, while the wider recovered source tree omits both provenance fields, so this is a static complete-unit owner proof and never a partial source replay.',
    }),
  ])
