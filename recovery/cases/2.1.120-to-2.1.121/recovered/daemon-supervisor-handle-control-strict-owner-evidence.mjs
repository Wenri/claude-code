#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DAEMON_SUPERVISOR_HANDLE_CONTROL_STRICT_EVIDENCE_IDS =
  Object.freeze([
    'target121-daemon-supervisor-handle-control-authenticated-unit-lineage',
    'target121-daemon-supervisor-handle-control-build-macro-lineage',
    'target121-daemon-supervisor-handle-control-repaint-template-lineage',
    'target121-daemon-supervisor-handle-control-strict-row-partition',
  ])

const residues = [
  {
    literalKind: 'string',
    value: '2.1.121',
    start: 13854341,
    end: 13854350,
    baselineCount: 0,
    targetOccurrenceNumber: 153,
  },
  {
    literalKind: 'string',
    value: '2026-04-27T01:32:27Z',
    start: 13854430,
    end: 13854452,
    baselineCount: 0,
    targetOccurrenceNumber: 153,
  },
  {
    literalKind: 'string',
    value: '16ffea721a0a39bc787a236dc19fb62307180b75',
    start: 13854461,
    end: 13854503,
    baselineCount: 0,
    targetOccurrenceNumber: 153,
  },
  {
    literalKind: 'string',
    value: '2.1.121',
    start: 13855496,
    end: 13855505,
    baselineCount: 0,
    targetOccurrenceNumber: 154,
  },
  {
    literalKind: 'string',
    value: '2026-04-27T01:32:27Z',
    start: 13855585,
    end: 13855607,
    baselineCount: 0,
    targetOccurrenceNumber: 154,
  },
  {
    literalKind: 'string',
    value: '16ffea721a0a39bc787a236dc19fb62307180b75',
    start: 13855616,
    end: 13855658,
    baselineCount: 0,
    targetOccurrenceNumber: 154,
  },
  {
    literalKind: 'string',
    value: '\n  \x1B[2m',
    start: 13858716,
    end: 13858726,
    baselineCount: 0,
    targetOccurrenceNumber: 1,
  },
].map(Object.freeze)

// Row-scoped static evidence only. The existing daemon-supervisor proof owns
// the complete handleControl unit. Two authored MACRO.VERSION accesses expand
// to two VERSION/BUILD_TIME/GIT_SHA object triples, while the final row is the
// first quasi of the authored repaint template. Raw and packaged Target121
// source already contain both operations, so no source replay is authorized.
export const TARGET121_DAEMON_SUPERVISOR_HANDLE_CONTROL_STRICT_OWNER_EVIDENCE =
  Object.freeze({
    key: `${CASE_NAME}:22140:daemon-supervisor-handle-control-strict`,
    targetIndex: 22140,
    paths: Object.freeze(['src/daemon/supervisor.ts']),
    declarations: Object.freeze(['handleControl']),
    residues: Object.freeze(residues),
    evidenceIds:
      TARGET121_DAEMON_SUPERVISOR_HANDLE_CONTROL_STRICT_EVIDENCE_IDS,
    behavior:
      'The complete authenticated u22140 handleControl function contains two bundle-expanded MACRO.VERSION accesses and one compiler-isolated repaint-template prefix. The six release literals are the two inlined VERSION, BUILD_TIME, and GIT_SHA triples; the ANSI row is the first quasi of the exact clear-display repaint template. This admits only those seven strict rows, retains the other 30 owner rows and two non-strict added rows, performs no whole-unit override, and replays no source.',
  })
