const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_EXPORT_EVIDENCE_IDS =
  Object.freeze([
    'target121-daemon-cli-parse-kind-args-authenticated-export-binding',
    'target121-daemon-cli-parse-kind-args-authored-source-evolution',
    'target121-daemon-cli-parse-kind-args-runtime-importer-graph',
    'target121-daemon-cli-parse-kind-args-normalized-ambiguity-rejection',
    'target121-daemon-cli-parse-kind-args-nonmatched-override-no-replay',
  ])

export const TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_DEPENDENCY_TARGET_INDICES =
  Object.freeze([22182, 22193, 22194, 22207])

// The deterministic all-owner input contains u22178 because it is unresolved,
// so this case is eligible for the nonmatched owner/coverage override lane.
// Its generated export table is complete and source-authenticated; replaying
// daemon/cli.ts would duplicate an already complete runtime graph.
export const TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_EXPORT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:22178`,
      targetIndex: 22178,
      paths: Object.freeze(['src/daemon/cli.ts']),
      generatedExports: Object.freeze([
        'parseKindArgs',
        'handleListAllKinds',
        'handleCliKind',
      ]),
      authoredDeclarations: Object.freeze([
        'parseKindArgs',
        'handleListAllKinds',
        'handleCliKind',
      ]),
      supportPaths: Object.freeze(['src/daemon/main.ts']),
      moduleAnchorTargetIndices: Object.freeze([22177, 22196]),
      dependencyTargetIndices:
        TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_DEPENDENCY_TARGET_INDICES,
      strictResidues: Object.freeze([
        Object.freeze({
          literalKind: 'property',
          value: 'parseKindArgs',
          start: 13881369,
          end: 13881382,
          baselineCount: 0,
          targetOccurrenceNumber: 1,
        }),
      ]),
      evidenceIds:
        TARGET121_DAEMON_CLI_PARSE_KIND_ARGS_EXPORT_EVIDENCE_IDS,
      behavior:
        'Authenticated Target121 u22178 is the generated src/daemon/cli.ts export table. Its parseKindArgs property binds directly to complete u22182, while handleListAllKinds and handleCliKind bind to u22193 and u22194; u22194 calls the same parseKindArgs binding, and daemonMain u22207 imports the module namespace to call the two CLI handlers. Target120 source already authored parseKindArgs, but its exact daemon CLI export table contains only the two handlers; Target121 evolves the parser signature and uniquely emits the parseKindArgs export property. Twenty-seven unrelated Target120 three-property tables share the identifier-normalized shape, so the generic alpha-equivalent label does not establish source lineage. The exact unresolved all-owner row authorizes one case-owned owner/coverage override. This proof admits only the parseKindArgs strict row and authorizes no source replay.',
    }),
  ])
