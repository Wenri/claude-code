const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_EVIDENCE_IDS =
  Object.freeze([
    'target119-prompt-input-footer-authenticated-whole-unit-proof',
    'target119-prompt-input-footer-background-exit-action-proof',
    'target119-prompt-input-footer-retained-cache-proof',
    'target119-prompt-input-footer-caller-dependency-boundary-proof',
    'target119-prompt-input-footer-source-lineage-proof',
    'target119-prompt-input-footer-static-replay-blocker',
  ])

export const TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20455`,
      targetIndex: 20455,
      paths: Object.freeze([
        'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
      ]),
      declarations: Object.freeze(['PromptInputFooterLeftSide']),
      evidenceIds:
        TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 PromptInputFooterLeftSide unit is the exact Target118 unit after one bounded exit-message argument-tail change: background sessions render detach and all other sessions render exit. Its 31-slot compiler cache, including both apparent added slot-30 residues, and its caller contract are retained byte-for-structure from Target118. The Target119 source owner imports the exact isBgSession dependency but remains an older 29-slot snapshot that omits isInputEmpty from both the owner and caller and hard-codes the exit label; the next authored source expands the exit policy with later stop-session/worktree behavior. This is therefore a static whole-unit owner proof and never authorizes replay of either stale or later source.',
    }),
  ])
