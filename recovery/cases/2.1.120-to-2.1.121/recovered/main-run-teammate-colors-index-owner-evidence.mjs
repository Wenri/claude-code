#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_EVIDENCE_IDS =
  Object.freeze([
    'target121-main-run-teammate-colors-index-authenticated-retention',
    'target121-main-run-teammate-colors-index-source-owner-graph',
    'target121-main-run-teammate-colors-index-replay-blocker',
    'target121-main-run-teammate-colors-index-row-partition',
  ])

// Deliberately row-scoped: the compiled teammate-color allocator is retained
// byte-for-byte from Target120 while the historical Target120 and Target121
// main.tsx initial-state declarations omit it identically. With no authored
// release donor, replay would invent source. This evidence admits only the
// retained `index: 0` ordinal spill and never replaces complete u22106.
export const TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_OWNER_EVIDENCE =
  Object.freeze({
    key: `${CASE_NAME}:22106:teammate-colors-index`,
    targetIndex: 22106,
    paths: Object.freeze(['src/main.tsx']),
    declarations: Object.freeze(['run', 'initialState']),
    residues: Object.freeze([
      Object.freeze({
        literalKind: 'property',
        value: 'index',
        start: 13815572,
        end: 13815577,
        targetOccurrenceNumber: 297,
      }),
    ]),
    evidenceIds: TARGET121_MAIN_RUN_TEAMMATE_COLORS_INDEX_EVIDENCE_IDS,
    behavior:
      'Complete Target120 and Target121 run units contain the exact retained fragment teammateColors:{assignments:new Map,index:0}; their complete initial-state object token graphs are identifier-normalized equal. The supplied Target120, raw Target121, and packaged Target121 main.tsx initialState graphs contain no teammateColors or assignments property, so no authenticated release-owned source replay exists. This static evidence admits only index [13815572,13815577), preserves all raw strict rows, and performs no whole-unit override.',
  })
