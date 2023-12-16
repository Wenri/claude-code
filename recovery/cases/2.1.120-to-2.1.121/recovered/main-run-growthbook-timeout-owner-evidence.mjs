#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_EVIDENCE_IDS = Object.freeze([
  'target121-main-run-growthbook-timeout-prior-static-order',
  'target121-main-run-growthbook-timeout-authenticated-compiled-lineage',
  'target121-main-run-growthbook-timeout-source-owner-boundary',
  'target121-main-run-growthbook-timeout-replay-scope-rejection',
  'target121-main-run-growthbook-timeout-post-replay-partition',
])

// This is deliberately one-row static evidence. The complete timeout graph is
// retained from Target120, but replaying that graph into recovered source would
// also claim the distinct retained `gb-before-tools` string row and two import
// edits. The narrower numeric admission therefore exposes no replay, builder,
// coverage replacement, or whole-unit override surface.
export const TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_OWNER_EVIDENCE = Object.freeze({
  key: `${CASE_NAME}:22106:growthbook-timeout-300`,
  targetIndex: 22106,
  paths: Object.freeze(['src/main.tsx']),
  declarations: Object.freeze(['run']),
  residues: Object.freeze([
    Object.freeze({
      literalKind: 'number',
      value: '300',
      start: 13802998,
      end: 13803001,
      targetOccurrenceNumber: 67,
    }),
  ]),
  evidenceIds: TARGET121_MAIN_RUN_GROWTHBOOK_TIMEOUT_EVIDENCE_IDS,
  behavior:
    'The Target121 main run GrowthBook hydration timeout is an identifier-normalized exact continuation of the complete Target120 callback graph at the same currentCwd-to-command-loading boundary. Both accepted main.tsx states retain that authored run boundary but omit the graph. This static evidence admits only the numeric 300 row after the two ordered allowed admissions; a source replay is rejected because the smallest closed graph would also claim the separate retained gb-before-tools row.',
})
