const CASE_NAME = '2.1.120-to-2.1.121'

export const TARGET121_CLASSIFIER_BUILD_NAME_FILTER_EVIDENCE_IDS =
  Object.freeze([
    'target121-classifier-authenticated-whole-units',
    'target121-classifier-build-macro-expansion',
    'target121-classifier-placeholder-name-runtime-source-gap',
  ])

export const TARGET121_CLASSIFIER_BUILD_NAME_FILTER_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:14165`,
      targetIndex: 14165,
      paths: Object.freeze(['src/jobs/classifier.ts']),
      declarations: Object.freeze(['classifyAndPush']),
      evidenceIds: TARGET121_CLASSIFIER_BUILD_NAME_FILTER_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 classifyAndPush unit belongs to jobs/classifier.ts and persists MACRO.VERSION after compile-time expansion to the authenticated Target121 version, build time, and git SHA. Its naming-context branch calls generateJobName, linking this unit to the adjacent placeholder-name filter lane; recovered source retains symbolic MACRO.VERSION and an older timeline truncation expression, so ownership is proved statically without rewriting source.',
    }),
    Object.freeze({
      key: `${CASE_NAME}:14171`,
      targetIndex: 14171,
      paths: Object.freeze(['src/jobs/classifier.ts']),
      declarations: Object.freeze(['IS_RESUME', 'generateJobName']),
      evidenceIds: TARGET121_CLASSIFIER_BUILD_NAME_FILTER_EVIDENCE_IDS,
      behavior:
        'The authenticated Target121 classifier module initializer adds two dependency initializers and a placeholder-job-name regexp; adjacent generateJobName unit u14162 rejects candidates through that regexp. Recovered jobs/classifier.ts contains the retained IS_RESUME initializer and naming-context evolution but omits both the regexp declaration and its use, so this is a static complete-unit source-gap proof rather than an inferred partial replay.',
    }),
  ])
