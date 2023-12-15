const CASE_NAME = '2.1.117-to-2.1.118'
const OWNER_PATH = 'src/utils/backgroundWorkState.ts'

export const TARGET118_BACKGROUND_WORK_STATE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:18713`,
    targetIndex: 18713,
    paths: Object.freeze([OWNER_PATH]),
    declarations: Object.freeze([
      'BackgroundWorkState',
      'backgroundWorkState',
      'setBackgroundWorkState',
      'getBackgroundWorkState',
    ]),
    evidenceIds: Object.freeze([
      'target118-background-work-state-target-fragment',
      'target118-background-work-state-source-ast-test',
    ]),
    behavior:
      'The authenticated Target118 background-work state initializer is the exact compiled form of src/utils/backgroundWorkState.ts#backgroundWorkState: it initializes the shared tasks, queued, and kinds snapshot consumed through the module setter/getter. The provisional WorkerPendingPermission owner contains neither this state binding nor its accessors.',
  }),
])
