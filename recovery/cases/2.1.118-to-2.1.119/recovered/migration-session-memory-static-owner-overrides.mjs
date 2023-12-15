const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_MIGRATION_SESSION_MEMORY_STATIC_EVIDENCE_IDS =
  Object.freeze([
    'target119-migration-session-memory-authenticated-target-fragment',
    'target119-migration-session-memory-source-ast-test',
    'target119-migration-session-memory-retained-compiler-test',
  ])

export const TARGET119_MIGRATION_SESSION_MEMORY_STATIC_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:21594`,
      targetIndex: 21594,
      paths: Object.freeze([
        'src/migrations/migrateBypassPermissionsAcceptedToSettings.ts',
      ]),
      declarations: Object.freeze([
        'migrateBypassPermissionsAcceptedToSettings',
      ]),
      evidenceIds:
        TARGET119_MIGRATION_SESSION_MEMORY_STATIC_EVIDENCE_IDS,
      behavior:
        'The bypass-permissions migration moves the accepted flag into user settings, records telemetry, and removes the obsolete global-config property. Its sole scanner residue is an authenticated global zero-occurrence shift inside an otherwise exact paired function.',
    }),
    Object.freeze({
      key: `${CASE_NAME}:21605`,
      targetIndex: 21605,
      paths: Object.freeze([
        'src/migrations/migrateSonnet1mToSonnet45.ts',
      ]),
      declarations: Object.freeze(['migrateSonnet1mToSonnet45']),
      evidenceIds:
        TARGET119_MIGRATION_SESSION_MEMORY_STATIC_EVIDENCE_IDS,
      behavior:
        'The Sonnet 1M migration owns the completion flag, persisted and in-memory model rewrites, and final config update. The prior migrateOpusToOpus1m attribution is rejected; the sole unsupported zero is a retained global occurrence shift in the exact paired target unit.',
    }),
    Object.freeze({
      key: `${CASE_NAME}:21676`,
      targetIndex: 21676,
      paths: Object.freeze([
        'src/services/SessionMemory/sessionMemory.ts',
      ]),
      declarations: Object.freeze(['extractSessionMemory']),
      evidenceIds:
        TARGET119_MIGRATION_SESSION_MEMORY_STATIC_EVIDENCE_IDS,
      behavior:
        'Session-memory extraction reads token usage from the last message before logging extraction telemetry. The authenticated baseline and target both compile Array.at(-1); the recovered source spells the same bounded operation as messages[messages.length - 1].',
    }),
  ])
