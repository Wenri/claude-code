const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_REPL_RUNTIME_SOURCE_GAP_EVIDENCE_IDS = Object.freeze([
  'target121-repl-authenticated-whole-unit',
  'target121-repl-retained-layout-effect-owner',
  'target121-repl-active-skill-survey-prompt-source-gap',
])

export const TARGET121_REPL_RUNTIME_SOURCE_GAP_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21373`,
      targetIndex: 21373,
      paths: Object.freeze(['src/screens/REPL.tsx']),
      declarations: Object.freeze(['REPL']),
      evidenceIds: TARGET121_REPL_RUNTIME_SOURCE_GAP_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 REPL unit retains two source-present useLayoutEffect calls and adds activeSkill forwarding, consolidated survey-state selection, and PromptInput message-summary properties. The exact Target121 REPL source proves the owner and layout-effect calls but still has no activeSkill, hasMessages, or hasAssistantMessage contract and retains the older inline survey and PromptInput interfaces, so this is a static complete-unit owner proof with no partial source replay.',
    }),
  ])
