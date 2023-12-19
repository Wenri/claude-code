#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MAIN_RUN_IS_ABSOLUTE_EVIDENCE_IDS = Object.freeze([
  'target121-main-run-is-absolute-prior-static-order',
  'target121-main-run-is-absolute-authenticated-compiled-lineage',
  'target121-main-run-is-absolute-path-module-dependency',
  'target121-main-run-is-absolute-source-resume-boundary',
  'target121-main-run-is-absolute-row-only-scope',
  'target121-main-run-is-absolute-post-dangerous-partition',
])

// This is deliberately one-row static evidence. Target120 and Target121 retain
// the same normalized path.isAbsolute resume-telemetry branch. Materializing
// that branch in recovered source would also claim the retained failure_reason
// and not_found_explicit_id owner rows plus a path import edit, so this helper
// exposes no replay, builder, coverage replacement, or whole-unit override.
export const TARGET121_MAIN_RUN_IS_ABSOLUTE_OWNER_EVIDENCE = Object.freeze({
  key: `${CASE_NAME}:22106:resume-path-is-absolute`,
  targetIndex: 22106,
  paths: Object.freeze(['src/main.tsx']),
  declarations: Object.freeze(['run']),
  residues: Object.freeze([
    Object.freeze({
      literalKind: 'property',
      value: 'isAbsolute',
      start: 13822198,
      end: 13822208,
      targetOccurrenceNumber: 75,
    }),
  ]),
  evidenceIds: TARGET121_MAIN_RUN_IS_ABSOLUTE_EVIDENCE_IDS,
  behavior:
    'The Target121 main run path.isAbsolute resume telemetry branch is an identifier-normalized exact continuation of Target120, including the same path-module binding, resume argument, event, and failure payload. Recovered Target121 main.tsx retains the path resolve import and transcript-file boundary but omits the absolute-path alternate. This static evidence admits only isAbsolute after the separately owned index admission; replay is rejected because the smallest closed branch and import edit would also claim two retained owner rows.',
})
