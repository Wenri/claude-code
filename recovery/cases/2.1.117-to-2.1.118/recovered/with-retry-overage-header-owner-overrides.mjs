const CASE_NAME = '2.1.117-to-2.1.118'

export const TARGET118_WITH_RETRY_OVERAGE_HEADER_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:15126`,
      targetIndex: 15126,
      paths: Object.freeze(['src/services/api/withRetry.ts']),
      evidenceIds: Object.freeze([
        'target118-with-retry-overage-header-target-fragment',
        'target118-with-retry-overage-header-source-ast-test',
      ]),
      behavior:
        'The authenticated Target118 async retry loop reads the unified overage-disabled reason from an API error, passes it to the fast-mode overage rejection handler, disables fast mode in the retry context, and immediately retries. The exact historical withRetry declaration owns this branch; the provisional utils/messages.ts attribution is rejected.',
    }),
  ])
