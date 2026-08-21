const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_EVIDENCE_IDS = Object.freeze([
  'target121-fleet-view-frame-row-authenticated-whole-unit',
  'target121-fleet-view-frame-row-consumer-boundary',
  'target121-fleet-view-frame-schema-source-gap',
])

export const TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20909`,
      targetIndex: 20909,
      paths: Object.freeze(['src/components/FleetView.tsx']),
      declarations: Object.freeze(['FleetView']),
      evidenceIds: TARGET121_FLEET_VIEW_FRAME_CHILD_ROW_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 FleetView child-row decorator is its complete Target120 predecessor plus one atomic frame-child branch, returning the frame id with empty status/diff metadata, Claude color, and sortRank zero. Two exact FleetView call sites consume the helper, and adjacent compiled helpers map to FleetView source declarations. Target121 daemon/jobs.ts authenticates the new pr-or-frame child schema, but the exact FleetView source still uses the Target120 inline PR-only renderer and has no sortRank/frame decorator, so ownership is static and no partial replay is admitted.',
    }),
  ])
