const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_SLASH_COMMAND_ACTIVE_SKILL_EVIDENCE_IDS =
  Object.freeze([
    'target121-slash-command-active-skill-authenticated-whole-unit',
    'target121-slash-command-active-skill-producer-consumer-contract',
    'target121-slash-command-active-skill-source-type-graph-gap',
  ])

export const TARGET121_SLASH_COMMAND_ACTIVE_SKILL_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:13110`,
      targetIndex: 13110,
      paths: Object.freeze([
        'src/utils/processUserInput/processSlashCommand.tsx',
      ]),
      declarations: Object.freeze(['getMessagesForPromptSlashCommand']),
      evidenceIds: TARGET121_SLASH_COMMAND_ACTIVE_SKILL_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 getMessagesForPromptSlashCommand unit records the invoked skill and then assigns command.name to context.options.activeSkill before building command messages; the Target121 AgentTool later consumes options.spawnedBySkill with options.activeSkill as its fallback. The recovered Target121 owner and ToolUseContext type omit activeSkill throughout the source graph, so this is a static whole-unit owner proof and never a partial source replay.',
    }),
  ])
