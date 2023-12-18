const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_EVIDENCE_IDS =
  Object.freeze([
    'target119-iterm-copy-file-authenticated-whole-unit-proof',
    'target119-iterm-copy-file-exact-predecessor-proof',
    'target119-iterm-copy-file-import-lowering-proof',
    'target119-iterm-copy-file-source-graph-semantic-test',
    'target119-iterm-copy-file-caller-boundary-proof',
    'target119-iterm-copy-file-static-no-replay-proof',
  ])

export const TARGET119_ITERM_COPY_FILE_DEPENDENCY_TARGET_INDICES =
  Object.freeze([21677, 21678, 21679, 21681, 21682, 21685])

export const TARGET119_ITERM_COPY_FILE_IMPORT_LOWERING = Object.freeze({
  importedName: 'copyFile',
  module: 'fs/promises',
  namespaceBinding: '$D8',
  bindingTargetIndex: 21681,
  initializerTargetIndex: 21682,
})

export const TARGET119_ITERM_COPY_FILE_MATCHED_STATIC_PROOF_SPEC =
  Object.freeze({
    targetIndex: 21680,
    baselineUnitIndex: 20774,
    structuralClassification: 'matched',
    coverageLane: 'matched-static-proof',
    coverageTargetRowPresent: false,
    allOwnerInputTargetRowPresent: false,
    coverageGeneratorWiringAuthorized: false,
    synthesizedCorrectionAccepted: false,
  })

export const TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21680`,
      targetIndex: 21680,
      paths: Object.freeze(['src/utils/iTermBackup.ts']),
      declarations: Object.freeze(['checkAndRestoreITerm2Backup']),
      dependencyTargetIndices:
        TARGET119_ITERM_COPY_FILE_DEPENDENCY_TARGET_INDICES,
      evidenceIds: TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 u21680 checkAndRestoreITerm2Backup function is an exact property-preserving scope-normalized match to Target118 u20774. Both units perform the same recovery-info gates, stat check, fs/promises copyFile restore, setup-complete transitions, success result, and logged failure result. The exact Targets118-121 src/utils/iTermBackup.ts source imports copyFile and stat from fs/promises and contains the same complete declaration, helper graph, and unchanged setup caller; Target119 u21681/u21682 lower that named import through the $D8 namespace used by u21680. Its sole strict copyFile row is therefore global occurrence-ordinal spill inside retained production runtime. This static inherited exact-source owner correction pins the helper, import, and caller boundary and authorizes no source replay.',
    }),
  ])
