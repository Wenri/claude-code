const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE =
  'target118-push-notification-tip-relevance-target-fragment'
const SOURCE_AST_EVIDENCE =
  'target118-push-notification-tip-relevance-source-ast-test'

export const TARGET118_PUSH_NOTIFICATION_TIP_RELEVANCE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:17757`,
      targetIndex: 17757,
      paths: Object.freeze(['src/services/tips/tipRegistry.ts']),
      declarations: Object.freeze(['isPushNotificationTipRelevant']),
      evidenceIds: Object.freeze([
        TARGET_FRAGMENT_EVIDENCE,
        SOURCE_AST_EVIDENCE,
      ]),
      behavior:
        'The complete authenticated Target118 push-notification tip-relevance predicate requires bridge support and its feature gate, requires prior or startup Remote Control use, and rejects an already-enabled agent push notification setting; the provisional RemoteCallout.tsx attribution is rejected.',
    }),
  ])
