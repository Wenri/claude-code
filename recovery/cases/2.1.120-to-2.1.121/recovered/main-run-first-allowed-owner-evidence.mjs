#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MAIN_RUN_FIRST_ALLOWED_EVIDENCE_IDS = Object.freeze([
  'target121-main-run-first-allowed-authenticated-compiled-lineage',
  'target121-main-run-first-allowed-source-owner-graph',
  'target121-main-run-first-allowed-post-replay-partition',
])

// This is deliberately row evidence, not a whole-unit override.  The second
// `allowed` row belongs to a later promise-return branch and remains deferred,
// along with every other genuine u22106 residue outside this exact key range.
export const TARGET121_MAIN_RUN_FIRST_ALLOWED_OWNER_EVIDENCE = Object.freeze({
  key: `${CASE_NAME}:22106:first-dynamic-mcp-allowed`,
  targetIndex: 22106,
  paths: Object.freeze(['src/main.tsx']),
  declarations: Object.freeze(['run']),
  residues: Object.freeze([
    Object.freeze({
      literalKind: 'property',
      value: 'allowed',
      start: 13797608,
      end: 13797615,
      targetOccurrenceNumber: 68,
    }),
  ]),
  evidenceIds: TARGET121_MAIN_RUN_FIRST_ALLOWED_EVIDENCE_IDS,
  behavior:
    'The first dynamic MCP policy-filter binding in complete Target121 u22106 has an exact identifier-normalized Target120 predecessor and an authored src/main.tsx::run definition with one local spread consumer. This static evidence admits only the first allowed key; it performs no source replay, coverage replacement, or whole-unit owner override.',
})
