const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_EVIDENCE_IDS =
  Object.freeze([
    'target119-prompt-input-layout-effect-authenticated-unit-proof',
    'target119-prompt-input-layout-effect-inherited-hook-proof',
    'target119-prompt-input-layout-effect-source-replay-blocker',
  ])

export const TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20509`,
      targetIndex: 20509,
      paths: Object.freeze(['src/components/PromptInput/PromptInput.tsx']),
      declarations: Object.freeze(['PromptInput']),
      evidenceIds: TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 PromptInput retains the exact Target117 and Target118 useLayoutEffect block that forces the active Ink instance to redraw after the clear-input generation changes. The apparent Target119-added useLayoutEffect property is global occurrence-order drift: its complete 35-token neighborhood and alpha-canonical effect statement are identical in the immediate Target118 predecessor. Every authenticated Target117-Target119 authored PromptInput snapshot omits the clear-input generation state, layout effect, Ink instances dependency, callback increment, and chat:clearInput registration even though the compiled runtime retains the whole graph. This is therefore a static inherited-runtime proof and never authorizes an isolated or whole-function source replay.',
    }),
  ])
