export const TARGET120_FINAL_TAIL_DEPENDENCY_CORRECTIONS = {
  18299: {
    disposition: 'dependency-runtime',
    ownerPaths: [],
    evidenceIds: [
      'dependency-attribution',
      'dependency-build-input-audit',
      'target120-agent-sdk-query-build-input-fragment',
    ],
  },
}

export const TARGET120_FINAL_TAIL_OWNER_OVERRIDES = {
  22004: ['src/main.tsx'],
}

export const TARGET120_FINAL_TAIL_OWNER_BEHAVIORS = {
  18299:
    'The authenticated @anthropic-ai/claude-agent-sdk Query module owns SDK initialization and submit-feedback control methods; the prior bridge source-map candidate is not an authored application owner.',
  22004:
    'The CLI entrypoint owns deep-link startup normalization, agent selection, initial teammate-color state, resume telemetry, version registration, and ultrareview dispatch emitted by the authenticated target unit.',
}

export const TARGET120_FINAL_TAIL_EVIDENCE_IDS = {
  18299: [
    'dependency-attribution',
    'dependency-build-input-audit',
    'target120-agent-sdk-query-build-input-fragment',
  ],
  22004: [
    'target2-1-120-final-tail-authenticated-target-fragment-test',
    'target2-1-120-final-tail-exact-source-owner-test',
    'target2-1-120-final-tail-forward-source-ast-test',
    'target2-1-120-final-tail-compiler-lineage-test',
  ],
}
