const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_AGENT_TOOL_SKILL_PROVENANCE_EVIDENCE_IDS = Object.freeze([
  'target121-agent-tool-authenticated-whole-unit',
  'target121-agent-tool-prompt-telemetry-and-skill-provenance-ast',
  'target121-agent-tool-source-and-dependent-graph-gap',
])

export const TARGET121_AGENT_TOOL_SKILL_PROVENANCE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:13026`,
      targetIndex: 13026,
      paths: Object.freeze(['src/tools/AgentTool/AgentTool.tsx']),
      declarations: Object.freeze(['AgentTool']),
      evidenceIds: TARGET121_AGENT_TOOL_SKILL_PROVENANCE_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 AgentTool unit hoists the selected agent system prompt so telemetry records its character length, adds plugin-agent telemetry fields, and propagates options.spawnedBySkill with options.activeSkill as the fallback into runAgent. The recovered Target121 source and its wider skill-provenance type/producer graph omit these additions, so this is a static whole-unit owner proof and never a partial source replay.',
    }),
  ])
