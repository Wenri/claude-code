const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_READ_ONLY_EXACT_IP_EVIDENCE_IDS = Object.freeze([
  'target119-read-only-exact-ip-target-fragment',
  'target119-read-only-exact-ip-source-ast-test',
  'target119-read-only-exact-ip-semantic-test',
])

export const TARGET119_READ_ONLY_EXACT_IP_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:11097`,
    targetIndex: 11097,
    paths: Object.freeze([
      'src/tools/BashTool/readOnlyValidation.ts',
    ]),
    declarations: Object.freeze([
      'READONLY_COMMAND_REGEXES',
      'isCommandReadOnly',
    ]),
    evidenceIds: TARGET119_READ_ONLY_EXACT_IP_EVIDENCE_IDS,
    behavior:
      'The complete Target119 read-only validation initializer is alpha-equivalent to its uniquely paired Target118 predecessor and retains both the exact ["ip", "addr"] argv tuple and /^ip addr$/ source-owned allowlist guard; the apparent seventh "ip" occurrence is bundle occurrence drift, not a new runtime behavior or source gap.',
  }),
])

