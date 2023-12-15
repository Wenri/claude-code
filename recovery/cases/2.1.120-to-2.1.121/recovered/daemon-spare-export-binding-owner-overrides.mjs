const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DAEMON_SPARE_EXPORT_BINDING_EVIDENCE_IDS =
  Object.freeze([
    'target121-daemon-spare-export-binding-proof',
    'target121-daemon-spare-adjacent-implementation-proof',
    'target121-daemon-spare-split-source-graph-proof',
    'target121-daemon-spare-metadata-ambiguity-rejection',
    'target121-daemon-spare-static-no-replay-proof',
  ])

export const TARGET121_DAEMON_SPARE_EXPORT_BINDING_DEPENDENCY_TARGET_INDICES =
  Object.freeze([22117, 22119, 22121, 22125])

// This override is deliberately scoped to the one generated export-table unit.
// The first three exports retain exact authored declarations in daemon/spare.ts.
// claimSpare is a bundler-extracted helper whose recovered authored behavior is
// already inline in daemon/supervisor.ts, so replaying it would duplicate a
// complete behavior graph and mix two recovered architectures.
export const TARGET121_DAEMON_SPARE_EXPORT_BINDING_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:22116`,
      targetIndex: 22116,
      paths: Object.freeze(['src/daemon/spare.ts']),
      generatedExports: Object.freeze([
        'spawnSpare',
        'runBgSpare',
        'reapOrphanSpares',
        'claimSpare',
      ]),
      authoredDeclarations: Object.freeze([
        'spawnSpare',
        'runBgSpare',
        'reapOrphanSpares',
      ]),
      sourceGapExports: Object.freeze(['claimSpare']),
      supportPaths: Object.freeze([
        'src/daemon/supervisor.ts',
        'src/entrypoints/cli.tsx',
      ]),
      dependencyTargetIndices:
        TARGET121_DAEMON_SPARE_EXPORT_BINDING_DEPENDENCY_TARGET_INDICES,
      evidenceIds: TARGET121_DAEMON_SPARE_EXPORT_BINDING_EVIDENCE_IDS,
      behavior:
        'Authenticated Target121 u22116 is one generated daemon/spare module export table. Its four zero-argument arrows bind spawnSpare, runBgSpare, reapOrphanSpares, and claimSpare directly to adjacent u22119, u22117, u22125, and u22121 implementations. Recovered daemon/spare.ts retains the first three exact authored exports; the compiled claimSpare helper is the extracted form of the already-recovered inline claim branch in daemon/supervisor.ts. The exact nonmatched generator row permits a one-unit owner/coverage override, while nineteen unrelated baseline tables sharing the identifier-normalized token shape disprove the current alpha-equivalent correspondence. This is static row-scoped evidence only and authorizes no source replay.',
    }),
  ])
