const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_THIRD_PARTY_MODEL_UPGRADE_EVIDENCE_IDS = Object.freeze([
  'target117-third-party-model-upgrade-authenticated-whole-unit',
  'target117-third-party-model-upgrade-confirmation-substitution',
  'target117-third-party-model-upgrade-absent-source-graph-blocker',
])

export const TARGET117_THIRD_PARTY_MODEL_UPGRADE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20218`,
    targetIndex: 20218,
    paths: Object.freeze([
      'src/components/ThirdPartyModelUpgradeDialog.tsx',
      'src/components/ConfirmationButtons.tsx',
    ]),
    declarations: Object.freeze([
      'ThirdPartyModelUpgradeDialog',
      'ConfirmationButtons',
    ]),
    evidenceIds: TARGET117_THIRD_PARTY_MODEL_UPGRADE_EVIDENCE_IDS,
    behavior:
      'Authenticated Target117 ThirdPartyModelUpgradeDialog replaces the legacy Yes/No Select adapter with ConfirmationButtons, directly mapping confirm to onDone(true) and cancel to onDone(false). The exact Target117 source/caller graph is absent and every later recovered donor still contains the legacy Select, so this is a static whole-unit owner proof and never a source replay.',
  }),
])
