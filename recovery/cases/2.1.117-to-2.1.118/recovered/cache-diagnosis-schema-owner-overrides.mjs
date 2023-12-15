const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_CACHE_DIAGNOSIS_SCHEMA_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:8881`,
    targetIndex: 8881,
    paths: Object.freeze([
      'src/services/api/promptCacheBreakDetection.ts',
    ]),
    evidenceIds: Object.freeze([
      'target118-cache-diagnosis-schema-target-fragment',
      'target118-cache-diagnosis-schema-source-ast-test',
      'target118-cache-diagnosis-schema-transition-test',
    ]),
    behavior:
      'The authenticated Target118 prompt-cache persistence schema adds cacheDiagnosis with a false default to the exact Target117 predecessor. The historical source transition adds the same PreviousState and PromptStateSnapshot field, false default, change detection, state updates, diagnostics, and telemetry in promptCacheBreakDetection.ts; the buddy/companion.ts attribution is rejected.',
  }),
])
