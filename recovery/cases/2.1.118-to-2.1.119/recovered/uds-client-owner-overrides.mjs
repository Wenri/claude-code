const CASE_NAME = '2.1.118-to-2.1.119'
const TARGET_FRAGMENT_EVIDENCE =
  'target119-uds-client-owner-target-fragment'
const SOURCE_BINDING_EVIDENCE =
  'target119-uds-client-owner-source-binding-test'

function override(targetIndex, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze(['src/utils/udsClient.ts']),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_BINDING_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET119_UDS_CLIENT_OWNER_OVERRIDES = Object.freeze([
  override(
    12160,
    'The authenticated Target119 UDS module contains the complete probeSocket lowering between the same module-private sendPayload and readRegistry declarations, and its connect/error/timeout control flow is pinned to src/utils/udsClient.ts#probeSocket; the prior fileHistory owner is unrelated.',
  ),
  override(
    12162,
    'The authenticated Target119 UDS module contains the complete exported listAllLiveSessions lowering, including the procStart birth-token check and destructuring omission pinned to src/utils/udsClient.ts#listAllLiveSessions; the prior fileHistory owner is unrelated.',
  ),
  override(
    12165,
    'The authenticated Target119 UDS module initializer hoists the exact closed LiveSessionKind and LiveSessionStatus validator literal sets used only by the adjacent validator bindings; those bindings and their complete source declarations are pinned to src/utils/udsClient.ts.',
  ),
])

export const TARGET119_UDS_CLIENT_PROOF_SPECS = Object.freeze([
  Object.freeze({
    targetIndex: 12160,
    sourceScopes: Object.freeze(['probeSocket']),
    representation: 'complete-declaration-lowering',
    residues: Object.freeze([
      Object.freeze({
        kind: 'string',
        value: 'connect',
        start: 7654145,
        end: 7654154,
        baselineCount: 20,
        targetOrdinal: 21,
      }),
    ]),
  }),
  Object.freeze({
    targetIndex: 12162,
    sourceScopes: Object.freeze(['listAllLiveSessions']),
    representation: 'complete-declaration-lowering',
    residues: Object.freeze([
      Object.freeze({
        kind: 'property',
        value: 'procStart',
        start: 7655638,
        end: 7655647,
        baselineCount: 5,
        targetOrdinal: 6,
      }),
    ]),
  }),
  Object.freeze({
    targetIndex: 12165,
    sourceScopes: Object.freeze(['sessionKind', 'sessionStatus']),
    representation: 'closed-validator-set-hoisting',
    residues: Object.freeze([
      Object.freeze({
        kind: 'string',
        value: 'bg',
        start: 7656169,
        end: 7656173,
        baselineCount: 4,
        targetOrdinal: 6,
      }),
      Object.freeze({
        kind: 'string',
        value: 'daemon-worker',
        start: 7656183,
        end: 7656198,
        baselineCount: 2,
        targetOrdinal: 3,
      }),
    ]),
  }),
])
