#!/usr/bin/env node

const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_PEER_CREDENTIALS_MACOS_EVIDENCE_IDS = Object.freeze([
  'target121-peer-credentials-macos-authenticated-target-unit',
  'target121-peer-credentials-macos-platform-domain-lineage',
  'target121-peer-credentials-macos-source-caller-graph',
  'target121-peer-credentials-macos-row-partition',
])

// Row-scoped static evidence only. The authenticated source spells the native
// Node platform as `darwin`; the compiled unit uses the repository's exact
// `getPlatform` domain, where darwin maps to `macos`. Both raw and packaged
// Target121 source graphs already contain the complete branch and callers.
export const TARGET121_PEER_CREDENTIALS_MACOS_OWNER_EVIDENCE = Object.freeze({
  key: `${CASE_NAME}:22129:peer-credentials-macos`,
  targetIndex: 22129,
  paths: Object.freeze(['src/daemon/peerCredentials.ts']),
  declarations: Object.freeze(['getControlPeerUid']),
  residues: Object.freeze([
    Object.freeze({
      literalKind: 'string',
      value: 'macos',
      start: 13850942,
      end: 13850949,
      baselineCount: 42,
      targetOccurrenceNumber: 43,
    }),
  ]),
  evidenceIds: TARGET121_PEER_CREDENTIALS_MACOS_EVIDENCE_IDS,
  behavior:
    'Complete u22129 is getControlPeerUid in src/daemon/peerCredentials.ts. Its compiled getPlatform() === macos branch is the exact platform-domain image of the authored process.platform === darwin branch, whose macPeerUid/linuxPeerUid callees and supervisor authorization caller are complete in raw and packaged Target121 source. This admits only macos [13850942,13850949), performs no whole-unit override, and replays no source.',
})
