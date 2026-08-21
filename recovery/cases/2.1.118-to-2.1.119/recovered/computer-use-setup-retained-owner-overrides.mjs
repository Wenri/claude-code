const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_COMPUTER_USE_SETUP_RETAINED_EVIDENCE_IDS =
  Object.freeze([
    'target119-computer-use-setup-complete-unit-retention-test',
    'target119-computer-use-setup-source-owner-lineage-test',
    'target119-computer-use-setup-caller-graph-test',
    'target119-computer-use-setup-strict-ordinal-spill-test',
  ])

export const TARGET119_COMPUTER_USE_SETUP_RETAINED_PROOF_SPEC = Object.freeze({
  targetIndex: 21655,
  baselineUnitIndex: 20749,
  ownerPath: 'src/utils/computerUse/setup.ts',
  declaration: 'setupComputerUseMCP',
  representation: 'retained-file-url-to-path-global-ordinal-spill',
  residue: Object.freeze({
    kind: 'property',
    value: 'fileURLToPath',
    start: 13453960,
    end: 13453973,
    baselineCount: 9,
    targetOrdinal: 12,
    targetAdded: true,
  }),
})

export const TARGET119_COMPUTER_USE_SETUP_RETAINED_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21655`,
      targetIndex: 21655,
      paths: Object.freeze(['src/utils/computerUse/setup.ts']),
      evidenceIds: TARGET119_COMPUTER_USE_SETUP_RETAINED_EVIDENCE_IDS,
      behavior:
        'Target119 u21655 is the retained setupComputerUseMCP declaration. Its complete function is identifier-canonical identical to Target118 u20749, while the authored setup.ts declaration and main.tsx dynamic-import/call graph are exact across the release boundary and both supplied Target119 source roots. The sole fileURLToPath strict row is a global-occurrence ordinal spill at the same unit-local offset, so this matched/no-coverage lane is closed statically and authorizes no Target119 source replay.',
    }),
  ])
