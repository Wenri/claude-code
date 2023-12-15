const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_PR_URL_HELPER_DEDUP_EVIDENCE_IDS = Object.freeze([
  'target119-pr-url-helper-dedup-target-fragment',
  'target119-pr-url-helper-dedup-source-ast-test',
  'target119-pr-url-helper-dedup-semantic-test',
])

const OWNER_PATHS = Object.freeze([
  'src/utils/prStatus.ts',
  'src/components/PrBadge.tsx',
])

const BEHAVIOR =
  'The Target119 bundle coalesces the duplicate PR URL parser/template helpers shared by utils/prStatus and PrBadge into one exact runtime binding: its prStatus initializer owns the canonical regex and its PrBadge consumer calls the same formatter. Both recovered TypeScript declaration pairs are admitted together, never as competing sole-owner claims.'

export const TARGET119_PR_URL_HELPER_DEDUP_OWNER_OVERRIDES = Object.freeze(
  [
    Object.freeze({
      key: `${CASE_NAME}:12727`,
      targetIndex: 12727,
      paths: OWNER_PATHS,
      declarations: Object.freeze([
        'parsePrUrl',
      ]),
      evidenceIds: TARGET119_PR_URL_HELPER_DEDUP_EVIDENCE_IDS,
      behavior: BEHAVIOR,
    }),
    Object.freeze({
      key: `${CASE_NAME}:12728`,
      targetIndex: 12728,
      paths: OWNER_PATHS,
      declarations: Object.freeze([
        'formatPrUrl',
        'applyPrUrlTemplate',
      ]),
      evidenceIds: TARGET119_PR_URL_HELPER_DEDUP_EVIDENCE_IDS,
      behavior: BEHAVIOR,
    }),
  ],
)

