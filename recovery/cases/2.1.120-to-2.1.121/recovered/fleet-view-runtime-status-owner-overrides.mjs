const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_FLEET_VIEW_RUNTIME_STATUS_EVIDENCE_IDS = Object.freeze([
  'target121-fleet-view-authenticated-runtime-whole-units',
  'target121-fleet-view-job-status-call-boundary',
  'target121-fleet-view-build-metadata-lineage',
  'target121-fleet-view-source-architecture-gap',
])

const sharedBehavior =
  'The authenticated Target121 FleetView runtime and its directly rendered job-status component form one compiled module boundary. FleetView calls the status unit with the focused job, and the status unit is exactly its Target120 predecessor after normalizing only VERSION, BUILD_TIME, and GIT_SHA. The exact Target121 FleetView source proves the module owner and several runtime changes but retains the legacy inline detail renderer, has no standalone job-status declaration, and lacks part of the compiled architecture. This is therefore a static complete-unit owner proof; no partial source replay is admitted.'

export const TARGET121_FLEET_VIEW_RUNTIME_STATUS_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20945`,
      targetIndex: 20945,
      paths: Object.freeze(['src/components/FleetView.tsx']),
      declarations: Object.freeze(['FleetView']),
      evidenceIds: TARGET121_FLEET_VIEW_RUNTIME_STATUS_EVIDENCE_IDS,
      behavior: sharedBehavior,
    }),
    Object.freeze({
      key: `${CASE_NAME}:20949`,
      targetIndex: 20949,
      paths: Object.freeze(['src/components/FleetView.tsx']),
      declarations: Object.freeze(['FleetView']),
      evidenceIds: TARGET121_FLEET_VIEW_RUNTIME_STATUS_EVIDENCE_IDS,
      behavior:
        `${sharedBehavior} The authored spelling of the internal job-status component is not present in recovered source, so the declaration boundary is recorded through its authenticated FleetView caller rather than guessed.`,
    }),
  ])
