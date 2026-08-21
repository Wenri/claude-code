#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MAIN_RUN_SESSION_STATE_EVIDENCE_IDS = Object.freeze([
  'target121-main-run-session-state-prior-static-order',
  'target121-main-run-session-state-authenticated-compiled-lineage',
  'target121-main-run-session-state-authored-owner-graph',
  'target121-main-run-session-state-row-only-scope',
  'target121-main-run-session-state-post-dangerous-partition',
])

// This is deliberately one-row static evidence. Target120 and Target121 retain
// the same identifier-normalized manager/store/runHeadless binding graph, while
// recovered Target121 source implements the behavior through process-global
// session metadata notifications and has no manager instance to pass. Replaying
// only the compiled property would create a mixed graph, so this helper exposes
// no replay, builder, coverage replacement, or whole-unit override surface.
export const TARGET121_MAIN_RUN_SESSION_STATE_OWNER_EVIDENCE = Object.freeze({
  key: `${CASE_NAME}:22106:headless-session-state`,
  targetIndex: 22106,
  paths: Object.freeze(['src/main.tsx']),
  declarations: Object.freeze(['run']),
  residues: Object.freeze([
    Object.freeze({
      literalKind: 'property',
      value: 'sessionState',
      start: 13812452,
      end: 13812464,
      targetOccurrenceNumber: 30,
    }),
  ]),
  evidenceIds: TARGET121_MAIN_RUN_SESSION_STATE_EVIDENCE_IDS,
  behavior:
    'The Target121 main run sessionState option is an identifier-normalized exact continuation of the complete Target120 manager/store/runHeadless binding graph. Recovered Target121 main.tsx retains the authored headless store and runHeadless boundary, while its recovered session-state implementation uses process-global notification functions and has no SessionStateManager instance. This static evidence admits only the sessionState property row after the two allowed rows and numeric 300; source replay is rejected because a property-only edit would reference a nonexistent instance and a manager-only replay would mix incompatible architectures.',
})
