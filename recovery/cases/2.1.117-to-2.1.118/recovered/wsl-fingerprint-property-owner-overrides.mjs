const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_WSL_FINGERPRINT_PROPERTY_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:8094`,
    targetIndex: 8094,
    paths: Object.freeze(['src/utils/settings/changeDetector.ts']),
    evidenceIds: Object.freeze([
      'target118-wsl-fingerprint-property-target-fragment',
      'target118-wsl-fingerprint-property-source-ast-test',
      'target118-wsl-fingerprint-property-compiler-equivalence-test',
    ]),
    behavior:
      'The authenticated settings-change detector snapshots the WSL Windows managed-settings fingerprint twice. The generated wslWindowsFile object key and the historical source wslFiles key are local snapshot labels whose values resolve to the same authenticated getWslWindowsManagedSettingsFingerprint implementation.',
  }),
])
