const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_DOCTOR_WHOLE_UNIT_EVIDENCE_IDS = Object.freeze([
  'target119-doctor-authenticated-whole-unit-proof',
  'target119-doctor-release-channel-delta-proof',
  'target119-doctor-background-server-boundary-proof',
  'target119-doctor-export-initializer-lineage-proof',
  'target119-doctor-retained-occurrence-proof',
  'target119-doctor-source-replay-blocker',
])

export const TARGET119_DOCTOR_WHOLE_UNIT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:16213`,
    targetIndex: 16213,
    paths: Object.freeze(['src/screens/Doctor.tsx']),
    declarations: Object.freeze(['Doctor']),
    evidenceIds: TARGET119_DOCTOR_WHOLE_UNIT_EVIDENCE_IDS,
    behavior:
      'The authenticated Target119 Doctor unit owns the release metadata, the rc-to-slow auto-update channel display, and the daemon-gated BackgroundServer child while retaining the surrounding Tree diagnostics. Its export registration, module initializer, false external-release daemon gate, status dependency, and exact Target120 runtime lineage bind the unit to src/screens/Doctor.tsx. The packaged Target119 source is an unchanged Target118 snapshot that omits both runtime additions; the later recovered source adds a non-exact Text-based BackgroundServer with Target120-only wording and still omits the slow channel alias. Admission is therefore static and never authorizes a partial or later-source replay.',
  }),
])
