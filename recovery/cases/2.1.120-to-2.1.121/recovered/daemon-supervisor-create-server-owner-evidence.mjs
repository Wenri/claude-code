#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_EVIDENCE_IDS =
  Object.freeze([
    'target121-daemon-supervisor-create-server-authenticated-unit-lineage',
    'target121-daemon-supervisor-create-server-local-token-lineage',
    'target121-daemon-supervisor-create-server-source-declaration-lineage',
    'target121-daemon-supervisor-create-server-row-partition',
  ])

// Row-scoped static evidence only. The baseline predecessor and Target121 unit
// each contain one local createServer call in the same authored
// startControlServer declaration. Bundle growth moves that retained call from
// global ordinal 16 to ordinal 18, one past the baseline total of 17, so the
// occurrence differencer reports it as added even though the source operation
// is retained. Raw and packaged Target121 already contain the exact source.
export const TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_OWNER_EVIDENCE =
  Object.freeze({
    key: `${CASE_NAME}:22136:daemon-supervisor-create-server`,
    targetIndex: 22136,
    paths: Object.freeze(['src/daemon/supervisor.ts']),
    declarations: Object.freeze(['startControlServer']),
    residues: Object.freeze([
      Object.freeze({
        literalKind: 'property',
        value: 'createServer',
        start: 13852432,
        end: 13852444,
        baselineCount: 17,
        targetOccurrenceNumber: 18,
      }),
    ]),
    evidenceIds:
      TARGET121_DAEMON_SUPERVISOR_CREATE_SERVER_EVIDENCE_IDS,
    behavior:
      'Complete u19463 and u22136 each contain one local createServer token, and exact Target120/121 startControlServer declarations retain const server = createServer while Target121 adds peer authorization, lease metadata, shutdown, and yield handling. This admits only createServer [13852432,13852444), performs no whole-unit override, and replays no source.',
  })
