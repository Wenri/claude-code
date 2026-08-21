const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/daemon/paths.ts'
const EVIDENCE_IDS = Object.freeze([
  'target118-daemon-paths-target-fragment',
  'target118-daemon-paths-source-ast-test',
])

export const TARGET118_DAEMON_PATHS_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:15796`,
    targetIndex: 15796,
    paths: Object.freeze([OWNER_PATH]),
    declarations: Object.freeze(['getDaemonDir']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      "The authenticated Target118 getDaemonDir function joins getClaudeConfigHomeDir() with the literal 'daemon'. The exact historical daemon/paths.ts declaration owns the complete unit; the provisional McpParsingWarnings attribution is rejected.",
  }),
  Object.freeze({
    key: `${CASE_NAME}:15798`,
    targetIndex: 15798,
    paths: Object.freeze([OWNER_PATH]),
    declarations: Object.freeze(['getPipeKey']),
    evidenceIds: EVIDENCE_IDS,
    behavior:
      "The authenticated Target118 daemon-path initializer defines getPipeKey: it reads daemon/pipe.key, creates an eight-byte random hex key when absent, makes the daemon directory, writes with flag 'wx', and falls back to the winning key only on EEXIST. The exact historical daemon/paths.ts declaration owns the complete unit; the provisional McpParsingWarnings attribution is rejected.",
  }),
])
