const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_RETAINED_CONFIRMATION_CLUSTER_EVIDENCE_IDS =
  Object.freeze([
    'target119-retained-confirmation-complete-unit-test',
    'target119-retained-confirmation-cross-release-lineage-test',
    'target119-retained-confirmation-strict-ordinal-spill-test',
    'target119-retained-confirmation-matched-no-coverage-test',
  ])

const PROOF_ROWS = [
  {
    targetIndex: 21248,
    baselineUnitIndex: 20348,
    historicalTargetIndex: 20149,
    ownerPath: 'src/components/Onboarding.tsx',
    declaration: 'Onboarding',
    residues: [
      ['confirmLabel', 12792307, 12792319, 20, 22],
      ['cancelLabel', 12792352, 12792363, 21, 23],
    ],
  },
  {
    targetIndex: 21269,
    baselineUnitIndex: 20369,
    historicalTargetIndex: 20170,
    ownerPath: 'src/components/TrustDialog/TrustDialog.tsx',
    declaration: 'TrustDialog',
    residues: [
      ['confirmLabel', 12798388, 12798400, 20, 23],
      ['cancelLabel', 12798428, 12798439, 21, 24],
    ],
  },
  {
    targetIndex: 21291,
    baselineUnitIndex: 20386,
    historicalTargetIndex: 20187,
    ownerPath: 'src/components/BypassPermissionsModeDialog.tsx',
    declaration: 'BypassPermissionsModeDialog',
    residues: [
      ['cancelFirst', 12803634, 12803645, 5, 9],
      ['confirmLabel', 12803664, 12803676, 20, 24],
      ['cancelLabel', 12803693, 12803704, 21, 25],
    ],
  },
  {
    targetIndex: 21298,
    baselineUnitIndex: 20393,
    historicalTargetIndex: 20194,
    ownerPath: 'src/components/DevChannelsDialog.tsx',
    declaration: 'DevChannelsDialog',
    residues: [
      ['confirmLabel', 12804874, 12804886, 20, 25],
      ['cancelLabel', 12804927, 12804938, 21, 26],
    ],
  },
]

export const TARGET119_RETAINED_CONFIRMATION_CLUSTER_PROOF_SPECS =
  Object.freeze(
    PROOF_ROWS.map(row =>
      Object.freeze({
        targetIndex: row.targetIndex,
        baselineUnitIndex: row.baselineUnitIndex,
        historicalTargetIndex: row.historicalTargetIndex,
        ownerPath: row.ownerPath,
        declaration: row.declaration,
        representation: 'retained-confirmation-global-ordinal-spill',
        residues: Object.freeze(
          row.residues.map(
            ([value, start, end, baselineCount, targetOrdinal]) =>
              Object.freeze({
                kind: 'property',
                value,
                start,
                end,
                baselineCount,
                targetOrdinal,
                targetAdded: true,
              }),
          ),
        ),
      }),
    ),
  )

export const TARGET119_RETAINED_CONFIRMATION_CLUSTER_OWNER_OVERRIDES =
  Object.freeze(
    TARGET119_RETAINED_CONFIRMATION_CLUSTER_PROOF_SPECS.map(spec =>
      Object.freeze({
        key: `${CASE_NAME}:${spec.targetIndex}`,
        targetIndex: spec.targetIndex,
        paths: Object.freeze([spec.ownerPath]),
        evidenceIds: TARGET119_RETAINED_CONFIRMATION_CLUSTER_EVIDENCE_IDS,
        behavior:
          `Target119 u${spec.targetIndex} is the retained ${spec.declaration} confirmation declaration. Its complete function is structurally matched by exact scope-normalized token hash through Target118 u${spec.baselineUnitIndex} to the authenticated Target117 u${spec.historicalTargetIndex} legacy-Select proof. Its strict property rows are only global-occurrence ordinal spill inside that unchanged owner lineage, so this matched/no-coverage lane is closed statically and authorizes no Target119 source replay.`,
      }),
    ),
  )

// Compatibility aliases for the original one-row name used while the first
// member of this atomic confirmation lineage was being audited.
export const TARGET119_ONBOARDING_RETAINED_EVIDENCE_IDS =
  TARGET119_RETAINED_CONFIRMATION_CLUSTER_EVIDENCE_IDS
export const TARGET119_ONBOARDING_RETAINED_OWNER_OVERRIDES = Object.freeze([
  TARGET119_RETAINED_CONFIRMATION_CLUSTER_OWNER_OVERRIDES[0],
])
export const TARGET119_ONBOARDING_RETAINED_PROOF_SPEC =
  TARGET119_RETAINED_CONFIRMATION_CLUSTER_PROOF_SPECS[0]
