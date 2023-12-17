const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_EVIDENCE_IDS =
  Object.freeze([
    'target119-wake-router-dispatch-timeout-authenticated-whole-unit-proof',
    'target119-wake-router-dispatch-timeout-historical-source-file-proof',
    'target119-wake-router-dispatch-timeout-source-ast-owner-proof',
    'target119-wake-router-dispatch-timeout-semantic-contract-test',
    'target119-wake-router-dispatch-timeout-incidental-literal-rejection',
  ])

export const TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:20694`,
      targetIndex: 20694,
      paths: Object.freeze(['src/hooks/useWakeRouter.ts']),
      declarations: Object.freeze([
        'WAKE_DISPATCH_TIMEOUT_MS',
        'releaseTimedOutDispatch',
        'useWakeRouter',
      ]),
      evidenceIds: TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_EVIDENCE_IDS,
      behavior:
        'The complete authenticated Target119 wake-router constant unit declares the React module binding beside the sole 60-second dispatch timeout. The adjacent useWakeRouter unit schedules releaseTimedOutDispatch with that binding, the release unit logs the same timeout and deletes the same agent reservation, and completion clears the timer before deleting the reservation. The exact historical Target119 source is a wholly added file whose WAKE_DISPATCH_TIMEOUT_MS, releaseTimedOutDispatch, and useWakeRouter AST reproduces that graph and persists structurally through Target121. The provisional handlePromptSubmit owner and every other bare-60000 match are rejected because none owns the complete diagnostic, callback, timer, and cleanup graph. Source is already exact, so no replay is authorized or needed.',
    }),
  ])
