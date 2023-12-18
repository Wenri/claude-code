const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DAEMON_SERVICE_EXECUTABLE_EVIDENCE_IDS =
  Object.freeze([
    'target121-daemon-service-executable-authenticated-whole-unit',
    'target121-daemon-service-executable-retained-source-declaration',
    'target121-daemon-service-executable-new-main-reachability',
    'target121-daemon-service-executable-stale-owner-correction',
  ])

export const TARGET121_DAEMON_SERVICE_EXECUTABLE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:16315`,
      targetIndex: 16315,
      paths: Object.freeze(['src/daemon/service.ts']),
      declarations: Object.freeze(['serviceExecutableIsMissing']),
      evidenceIds: TARGET121_DAEMON_SERVICE_EXECUTABLE_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 serviceExecutableIsMissing unit reads the systemd user-service file, extracts a quoted or unquoted ExecStart executable, and returns whether fs/promises access fails. The authored declaration is byte-identical in recovered Target120 and Target121 service.ts, but only Target121 daemonMain imports and calls it from the start/restart regeneration branch, making the export newly live in the bundle. Its named access() source call compiles through the fs/promises namespace as ms.access, which creates the strict property residue. The generated McpParsingWarnings owner is an attribution collision; this is a static reachability and owner-correction proof, and no source replay is needed.',
    }),
  ])
