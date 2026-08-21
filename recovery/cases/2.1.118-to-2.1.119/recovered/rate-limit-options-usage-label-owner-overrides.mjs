const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_EVIDENCE_IDS =
  Object.freeze([
    'target119-rate-limit-options-authenticated-whole-unit-proof',
    'target119-rate-limit-options-usage-label-contract-proof',
    'target119-rate-limit-options-retained-overage-row-proof',
    'target119-rate-limit-options-module-boundary-proof',
    'target119-rate-limit-options-runtime-lineage-proof',
    'target119-rate-limit-options-source-replay-blocker',
  ])

export const TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:18092`,
      targetIndex: 18092,
      paths: Object.freeze([
        'src/commands/rate-limit-options/rate-limit-options.tsx',
      ]),
      declarations: Object.freeze(['RateLimitOptionsMenu']),
      evidenceIds: TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_EVIDENCE_IDS,
      behavior:
        'The authenticated Target119 RateLimitOptionsMenu is a complete 28-slot compiler-cached UI unit. Relative to Target118 it adds usage-based billing detection, uses usage versus extra usage in request/add-funds/switch labels, replaces the obsolete org service zero-credit reason with org_service_level_disabled, and shortens the cancel label to Stop for usage-based billing. Reversing exactly those seven bounded transformations yields the complete Target118 AST while preserving every cache slot; the added overage residue is independently proven retained in the paired baseline unit. The module export, caller, bindings, and alpha-normalized initializer boundary are unchanged, and Target120/121 retain the exact unit. The recovered Target119 owner and its embedded authored source are stale 25-slot snapshots, while the later semantic reconstruction remains 25-slot, disables the dependency guard with if (true), and preserves that stale source map. Admission is static and never authorizes source replay.',
    }),
  ])
