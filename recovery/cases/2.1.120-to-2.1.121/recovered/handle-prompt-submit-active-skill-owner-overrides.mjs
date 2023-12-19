const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_EVIDENCE_IDS =
  Object.freeze([
    'target121-handle-prompt-submit-active-skill-authenticated-whole-unit',
    'target121-handle-prompt-submit-active-skill-mutable-context-graph',
    'target121-handle-prompt-submit-active-skill-source-type-graph-blocker',
  ])

export const TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20775`,
      targetIndex: 20775,
      paths: Object.freeze(['src/utils/handlePromptSubmit.ts']),
      declarations: Object.freeze(['BaseExecutionParams', 'executeUserInput']),
      evidenceIds:
        TARGET121_HANDLE_PROMPT_SUBMIT_ACTIVE_SKILL_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 executeUserInput unit caches one ToolUseContext, passes that same mutable object through processUserInput, and forwards context.options?.activeSkill as the new final onQuery argument. Reversing only the cached-context declaration, the inline-context replacement, and that argument makes the complete Target121 AST and identifier-normalized token stream exactly equal to the unmatched Target120 predecessor. Authenticated adjacent units set activeSkill during slash/SkillTool processing and carry it through REPL, query, agent/fork, attribution, and QueryEngine paths. Recovered Target120, Target121, and fresh-package source omit both provenance fields, the cached-context flow, the onQuery parameter, and the ToolUseContext type members, so this is a static complete-unit owner proof and never a partial source replay.',
    }),
  ])
