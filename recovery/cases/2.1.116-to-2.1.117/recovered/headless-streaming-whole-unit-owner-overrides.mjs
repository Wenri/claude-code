const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_EVIDENCE_IDS =
  Object.freeze([
    'target117-headless-streaming-authenticated-whole-unit',
    'target117-headless-streaming-ultrareview-replay-source-proof',
    'target117-headless-streaming-retained-control-contract-proof',
    'target117-headless-streaming-source-snapshot-blocker',
  ])

export const TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20646`,
      targetIndex: 20646,
      paths: Object.freeze(['src/cli/print.ts', 'src/constants/xml.ts']),
      declarations: Object.freeze([
        'runHeadlessStreaming',
        'COMMAND_NAME_TAG',
        'LOCAL_COMMAND_STDOUT_TAG',
      ]),
      evidenceIds: TARGET117_HEADLESS_STREAMING_WHOLE_UNIT_EVIDENCE_IDS,
      behavior:
        'Authenticated Target117 headless streaming replays a successful ultrareview launch as two synthetic user messages, persists and emits both messages, and retains the task-registry and side-question synthetic-result contracts from Target116. The exact Target117 source already contains the launch replay, while its surrounding retained control graph is an older source snapshot, so this is a static whole-unit proof and never a source replay.',
    }),
  ])
