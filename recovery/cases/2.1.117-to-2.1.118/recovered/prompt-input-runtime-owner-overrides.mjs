const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_PROMPT_INPUT_RUNTIME_EVIDENCE_IDS = Object.freeze([
  'target118-prompt-input-runtime-authenticated-target-fragment',
  'target118-prompt-input-runtime-source-lineage-test',
  'target118-prompt-input-runtime-compiler-normalization-test',
])

export const TARGET118_PROMPT_INPUT_RUNTIME_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:19583`,
    targetIndex: 19583,
    paths: Object.freeze([
      'src/components/PromptInput/PromptInput.tsx',
    ]),
    declarations: Object.freeze(['PromptInput']),
    evidenceIds: TARGET118_PROMPT_INPUT_RUNTIME_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target118 PromptInput unit is the uniquely retained Target117 PromptInput runtime plus the exact Target118 paste-expansion transition and compiler-normalized Vim/Label render forms. Its delete, backspace, NORMAL, j, and l literals remain in the paired input handler; the NORMAL polarity is equivalent over the compiled INSERT/NORMAL domain; and Label padded rendering is equivalent to the predecessor inverseText wrapper with one space on each side.',
  }),
])
