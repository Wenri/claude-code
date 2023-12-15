const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_EVIDENCE_IDS =
  Object.freeze([
    'target119-prompt-input-foreground-agents-authenticated-whole-unit-proof',
    'target119-prompt-input-foreground-agents-source-delta-proof',
    'target119-prompt-input-foreground-agents-semantic-test',
    'target119-prompt-input-foreground-agents-source-replay-blocker',
  ])

export const TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20456`,
      targetIndex: 20456,
      paths: Object.freeze([
        'src/components/PromptInput/PromptInputFooterLeftSide.tsx',
      ]),
      declarations: Object.freeze(['ModeIndicator']),
      evidenceIds:
        TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 ModeIndicator is the complete Target118 unit plus exactly one 60-token foreground-agents hint branch. The branch is gated by non-background, non-loading, empty-input, fleet availability, and leftArrowOpensAgents not being false, and renders the pending-aware left-arrow hint. All fifteen scanner-added owner residues are retained occurrence drift already present in the complete Target118 unit. The exact Target118-to-Target119 historical source delta adds the two imports, prop plumbing, compiler-cache slots, and this branch, authenticating ModeIndicator as the owner. The inherited authenticated unit nevertheless uses the chord-aware 12-slot KeyboardShortcutHint graph while recovered source still uses shortcut with 9 slots and carries an unchanged stale inline source map, so admission is static and never authorizes whole-unit source replay.',
    }),
  ])
