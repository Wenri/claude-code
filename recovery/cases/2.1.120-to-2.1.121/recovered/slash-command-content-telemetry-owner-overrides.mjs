const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_EVIDENCE_IDS =
  Object.freeze([
    'target121-slash-command-authenticated-whole-unit',
    'target121-slash-command-content-telemetry-ast-substitution',
    'target121-slash-command-source-lineage-replay-blocker',
  ])

export const TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:13102`,
      targetIndex: 13102,
      paths: Object.freeze([
        'src/utils/processUserInput/processSlashCommand.tsx',
      ]),
      declarations: Object.freeze(['processSlashCommand']),
      evidenceIds:
        TARGET121_SLASH_COMMAND_CONTENT_TELEMETRY_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 processSlashCommand unit replaces two plugin-name/marketplace-name telemetry assignment blocks with prompt-only command_content_chars telemetry spreads backed by returnedCommand.contentLength, once for the zero-message path and once for the normal valid-command path. The recovered Target121 source retains both removed blocks and omits both target spreads, so this is a static whole-unit owner proof and never a partial source replay.',
    }),
  ])
