#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MAIN_RUN_SECOND_ALLOWED_EVIDENCE_IDS = Object.freeze([
  'target121-main-run-second-allowed-prior-static-order',
  'target121-main-run-second-allowed-authenticated-compiled-lineage',
  'target121-main-run-second-allowed-source-owner-graph',
  'target121-main-run-second-allowed-post-replay-partition',
])

// This is deliberately row evidence, not a whole-unit override. The earlier
// spread-consumer `allowed` row is an immutable dependency, while every later
// genuine u22106 residue remains deferred by this module.
export const TARGET121_MAIN_RUN_SECOND_ALLOWED_OWNER_EVIDENCE = Object.freeze({
  key: `${CASE_NAME}:22106:second-return-allowed`,
  targetIndex: 22106,
  paths: Object.freeze(['src/main.tsx']),
  declarations: Object.freeze(['run']),
  residues: Object.freeze([
    Object.freeze({
      literalKind: 'property',
      value: 'allowed',
      start: 13800348,
      end: 13800355,
      targetOccurrenceNumber: 69,
    }),
  ]),
  evidenceIds: TARGET121_MAIN_RUN_SECOND_ALLOWED_EVIDENCE_IDS,
  behavior:
    'The second dynamic MCP policy-filter binding in complete Target121 u22106 has an exact identifier-normalized Target120 predecessor and an authored src/main.tsx::run definition with one local return consumer. This evidence depends on, but cannot re-admit, the earlier spread-consumer allowed row; it performs no source replay, coverage replacement, or whole-unit owner override.',
})
