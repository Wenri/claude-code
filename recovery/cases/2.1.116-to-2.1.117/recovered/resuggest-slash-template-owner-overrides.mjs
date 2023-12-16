const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_RESUGGEST_SLASH_TEMPLATE_EVIDENCE_IDS = Object.freeze([
  'target117-command-suggestion-resuggest-authenticated-whole-unit',
  'target117-typeahead-slash-template-authenticated-whole-unit',
  'target117-resuggest-stale-four-file-source-graph-blocker',
])

export const TARGET117_RESUGGEST_SLASH_TEMPLATE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:19089`,
    targetIndex: 19089,
    paths: Object.freeze(['src/utils/suggestions/commandSuggestions.ts']),
    declarations: Object.freeze(['applyCommandSuggestion']),
    evidenceIds: TARGET117_RESUGGEST_SLASH_TEMPLATE_EVIDENCE_IDS,
    behavior:
      'Authenticated Target117 applyCommandSuggestion returns the applied input plus a reSuggest flag and accepts partial slash-template replacement metadata. The recovered four-file suggestion graph is stale, so this is a static whole-unit owner proof and never a partial source replay.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:19131`,
    targetIndex: 19131,
    paths: Object.freeze(['src/hooks/useTypeahead.tsx']),
    declarations: Object.freeze(['useTypeahead']),
    evidenceIds: TARGET117_RESUGGEST_SLASH_TEMPLATE_EVIDENCE_IDS,
    behavior:
      'Authenticated Target117 useTypeahead preserves an in-flight slash-template search across index completion and re-suggests after partial command acceptance on both Tab and Enter. The recovered four-file suggestion graph is stale, so this is a static whole-unit owner proof and never a partial source replay.',
  }),
])
