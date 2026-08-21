const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_FIRST_PROMPT_ENTRY_EVIDENCE_IDS = Object.freeze([
  'target119-first-prompt-entry-authenticated-target-fragment',
  'target119-first-prompt-entry-exact-source-owner-test',
  'target119-first-prompt-entry-source-ast-test',
])

export const TARGET119_FIRST_PROMPT_ENTRY_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:2244`,
    targetIndex: 2244,
    paths: Object.freeze(['src/utils/sessionStoragePortable.ts']),
    evidenceIds: TARGET119_FIRST_PROMPT_ENTRY_EVIDENCE_IDS,
    behavior:
      'The authenticated Target119 entry parser records the first slash-command name as commandFallback, returns normalized bash input before the generic XML skip, rejects meta/compact/tool-result content, and truncates the first ordinary prompt; the sole historical source declaration with the complete state-and-regexp surface is extractFirstPromptFromHead in src/utils/sessionStoragePortable.ts, while the prior windowsPaths attribution is unrelated.',
  }),
])

export const TARGET119_FIRST_PROMPT_ENTRY_PROOF_SPEC = Object.freeze({
  targetIndex: 2244,
  ownerPath: 'src/utils/sessionStoragePortable.ts',
  declaration: 'extractFirstPromptFromHead',
  priorOwnerPaths: Object.freeze(['src/utils/windowsPaths.ts']),
  residues: Object.freeze([
    Object.freeze({
      kind: 'property',
      value: 'commandFallback',
      start: 932096,
      end: 932111,
      baselineCount: 0,
      targetOrdinal: 1,
    }),
    Object.freeze({
      kind: 'property',
      value: 'commandFallback',
      start: 932114,
      end: 932129,
      baselineCount: 0,
      targetOrdinal: 2,
    }),
    Object.freeze({
      kind: 'regexp',
      value: Object.freeze({
        pattern: '<bash-input>([\\s\\S]*?)<\\/bash-input>',
        flags: '',
      }),
      start: 932150,
      end: 932188,
      baselineCount: 0,
      targetOrdinal: 1,
    }),
  ]),
})
