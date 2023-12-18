const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_WIF_STATIC_OWNER_EVIDENCE_IDS = Object.freeze([
  'target118-wif-static-owner-target-fragment',
  'target118-wif-static-owner-source-ast-test',
])

export const TARGET118_WIF_STATIC_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:4689`,
    targetIndex: 4689,
    paths: Object.freeze(['src/services/api/workloadIdentity.ts']),
    evidenceIds: TARGET118_WIF_STATIC_OWNER_EVIDENCE_IDS,
    behavior:
      'The authenticated Target118 workload-identity export registry binds withCredentialsLock and getWIFAuthType to the exact historical source declarations; the two target-added property residues are module-export lowering, and the provisional utils/model/model.ts owner is rejected.',
  }),
])
