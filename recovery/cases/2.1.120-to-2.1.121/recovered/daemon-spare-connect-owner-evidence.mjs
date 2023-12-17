#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DAEMON_SPARE_CONNECT_EVIDENCE_IDS = Object.freeze([
  'target121-daemon-spare-connect-authenticated-target-units',
  'target121-daemon-spare-connect-source-owner-graph',
  'target121-daemon-spare-connect-supervisor-callers',
  'target121-daemon-spare-connect-row-partition',
])

const evidence = [
  {
    targetIndex: 22124,
    declaration: 'sendClaimOnce',
    residue: {
      literalKind: 'string',
      value: 'connect',
      start: 13849686,
      end: 13849695,
      baselineCount: 30,
      targetOccurrenceNumber: 32,
    },
    behavior:
      'The complete Target121 u22124 function is the private sendClaimOnce helper in src/daemon/spare.ts. Its sole connect-event string is authored by the exact raw and packaged sendClaimOnce AST. The coarse src/daemon/client.ts attribution is rejected.',
  },
  {
    targetIndex: 22125,
    declaration: 'reapOrphanSpares',
    residue: {
      literalKind: 'string',
      value: 'connect',
      start: 13850089,
      end: 13850098,
      baselineCount: 30,
      targetOccurrenceNumber: 33,
    },
    behavior:
      'The complete Target121 u22125 function is reapOrphanSpares in src/daemon/spare.ts. Its sole connect-event string belongs to the orphan-spare socket cleanup callback; the coarse ManagePlugins.tsx candidate is rejected.',
  },
].map(item =>
  Object.freeze({
    key: `${CASE_NAME}:${item.targetIndex}:daemon-spare-connect`,
    targetIndex: item.targetIndex,
    paths: Object.freeze(['src/daemon/spare.ts']),
    declarations: Object.freeze([item.declaration]),
    residues: Object.freeze([Object.freeze(item.residue)]),
    evidenceIds: TARGET121_DAEMON_SPARE_CONNECT_EVIDENCE_IDS,
    behavior: item.behavior,
  }),
)

// These are row-scoped evidence records, not whole-unit owner overrides. Both
// socket operations are already present in the authenticated Target121 source
// and package, so this case performs no source replay.
export const TARGET121_DAEMON_SPARE_CONNECT_OWNER_EVIDENCE = Object.freeze(
  evidence,
)
