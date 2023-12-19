const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_PROCESS_SLASH_COMMAND_DCE_EVIDENCE_IDS = Object.freeze([
  'target117-process-slash-command-dce-target-fragment',
  'target117-process-slash-command-source-declaration-test',
])

export const TARGET117_PROCESS_SLASH_COMMAND_DCE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:12657`,
      targetIndex: 12657,
      paths: Object.freeze([
        'src/utils/processUserInput/processSlashCommand.tsx',
      ]),
      declarations: Object.freeze(['processSlashCommand']),
      evidenceIds: TARGET117_PROCESS_SLASH_COMMAND_DCE_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target117 processSlashCommand function contains mcp-template-unmatched only as the consequent of a local always-false conditional; the binding has no writes and cannot alter the source-authored invalid-command telemetry path, so the exact source declaration correctly omits the unreachable residue.',
    }),
  ])
