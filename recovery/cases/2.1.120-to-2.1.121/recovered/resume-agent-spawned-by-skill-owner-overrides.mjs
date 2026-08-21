const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_RESUME_AGENT_SKILL_PROVENANCE_EVIDENCE_IDS =
  Object.freeze([
    'target121-resume-agent-spawned-by-skill-authenticated-whole-unit',
    'target121-resume-agent-spawned-by-skill-runtime-contract',
    'target121-resume-agent-spawned-by-skill-source-signature-gap',
  ])

export const TARGET121_RESUME_AGENT_SKILL_PROVENANCE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:13973`,
      targetIndex: 13973,
      paths: Object.freeze(['src/tools/AgentTool/resumeAgent.ts']),
      declarations: Object.freeze(['resumeAgentBackground']),
      evidenceIds: TARGET121_RESUME_AGENT_SKILL_PROVENANCE_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 resumeAgentBackground unit adds exactly spawnedBySkill:undefined to the runAgent parameter object, explicitly clearing skill provenance on resume; Target121 runAgent and query units carry the same field while the initial AgentTool producer derives it from options.spawnedBySkill or options.activeSkill. The recovered Target120 and Target121 resumeAgentBackground declarations are byte-identical and both resumeAgent plus the runAgent parameter signature omit spawnedBySkill, so this is a bounded static whole-unit owner proof and never an isolated source replay.',
    }),
  ])
