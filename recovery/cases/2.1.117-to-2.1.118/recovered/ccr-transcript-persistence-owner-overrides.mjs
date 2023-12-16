const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/hooks/useLogMessages.ts'

export const TARGET118_CCR_TRANSCRIPT_PERSISTENCE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18721`,
      targetIndex: 18721,
      paths: Object.freeze([OWNER_PATH]),
      declarations: Object.freeze(['useLogMessages']),
      evidenceIds: Object.freeze([
        'target118-ccr-transcript-persistence-target-fragments',
        'target118-ccr-transcript-persistence-source-ast-test',
      ]),
      behavior:
        'The authenticated Target118 useLogMessages hook suppresses local transcript persistence when runtime capabilities identify the active transport as CCR. The target producer encodes that invariant as transcriptSource === "ccr-api"; the recovered source exposes the same state as remote?.kind === "ccr" and installs the exact CCR transport from REPL. The provisional WorkerPendingPermission owner is unrelated.',
    }),
  ])
