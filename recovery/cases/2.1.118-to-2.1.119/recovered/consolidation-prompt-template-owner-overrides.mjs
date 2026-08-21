const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_CONSOLIDATION_PROMPT_TEMPLATE_EVIDENCE_IDS =
  Object.freeze([
    'target119-consolidation-prompt-template-target-fragment',
    'target119-consolidation-prompt-template-source-ast-test',
    'target119-consolidation-prompt-template-semantic-test',
  ])

export const TARGET119_CONSOLIDATION_PROMPT_TEMPLATE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:13902`,
      targetIndex: 13902,
      paths: Object.freeze([
        'src/services/autoDream/consolidationPrompt.ts',
      ]),
      declarations: Object.freeze([
        'buildConsolidationPrompt',
        'RECONCILE_MEMORIES_AGAINST_CLAUDE_MD',
      ]),
      evidenceIds: TARGET119_CONSOLIDATION_PROMPT_TEMPLATE_EVIDENCE_IDS,
      behavior:
        'The apparent Target119-only consolidation summary is byte-identical to a suffix already present in the authenticated Target118 template. Target119 inserts the RECONCILE_MEMORIES_AGAINST_CLAUDE_MD expression immediately before it, splitting the compiled template quasi without adding the summary text; the exact Target119 TypeScript template and authenticated disabled build helpers produce the same runtime prompt.',
    }),
  ])
