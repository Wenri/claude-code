const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_SKILL_TOOL_ACTIVE_SKILL_EVIDENCE_IDS = Object.freeze([
  'target121-skill-tool-active-skill-authenticated-whole-unit',
  'target121-skill-tool-active-skill-telemetry-semantic-boundary',
  'target121-skill-tool-active-skill-source-type-graph-gap',
])

export const TARGET121_SKILL_TOOL_ACTIVE_SKILL_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:13120`,
      targetIndex: 13120,
      paths: Object.freeze(['src/tools/SkillTool/SkillTool.ts']),
      declarations: Object.freeze(['SkillTool']),
      evidenceIds: TARGET121_SKILL_TOOL_ACTIVE_SKILL_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 SkillTool call stores its normalized command name in context.options.activeSkill before command discovery; the sibling slash-command producer and downstream AgentTool fallback establish the same runtime provenance contract. The Target120 and Target121 recovered SkillTool declarations are byte-identical, still contain the superseded plugin telemetry form, and both SkillTool plus ToolUseContext omit activeSkill, so this is a static whole-unit owner proof and never a partial source replay.',
    }),
  ])
