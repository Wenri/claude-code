#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MAIN_RUN_RESUME_ERROR_NAME_EVIDENCE_IDS =
  Object.freeze([
    'target121-main-run-resume-error-name-authenticated-retention',
    'target121-main-run-resume-error-name-source-owner-graph',
    'target121-main-run-resume-error-name-replay-blocker',
    'target121-main-run-resume-error-name-row-partition',
  ])

// This remains row evidence rather than a run-unit override. Target121 adds an
// unrelated earlier render-error telemetry unit containing `error_name`; the
// later CLI-resume catch is identifier-normalized identical to Target120. The
// exact Target120 and Target121 authored catch graphs both omit failure_reason
// and error_name, so there is no authenticated Target121 source transition to
// replay. Only the retained global-ordinal spill is admitted.
export const TARGET121_MAIN_RUN_RESUME_ERROR_NAME_OWNER_EVIDENCE =
  Object.freeze({
    key: `${CASE_NAME}:22106:cli-resume-error-name`,
    targetIndex: 22106,
    paths: Object.freeze(['src/main.tsx']),
    declarations: Object.freeze(['run']),
    residues: Object.freeze([
      Object.freeze({
        literalKind: 'property',
        value: 'error_name',
        start: 13823208,
        end: 13823218,
        targetOccurrenceNumber: 14,
      }),
    ]),
    evidenceIds: TARGET121_MAIN_RUN_RESUME_ERROR_NAME_EVIDENCE_IDS,
    behavior:
      'The Target121 CLI-resume catch and its complete try/telemetry graph are identifier-normalized identical to Target120. A separate new Target121 render-error telemetry function inserts the first new error_name occurrence and shifts this retained catch property from occurrence 13 to 14. Target120, raw Target121, and packaged Target121 main.tsx carry the same authored catch without error_name, so replay is not release-authenticated. This static evidence admits only error_name [13823208,13823218), preserves all raw strict rows, and performs no whole-unit override.',
  })
