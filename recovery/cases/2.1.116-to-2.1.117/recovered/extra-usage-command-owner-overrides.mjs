const CASE_NAME = '2.1.116-to-2.1.117'

export const TARGET117_EXTRA_USAGE_COMMAND_EVIDENCE_IDS = Object.freeze([
  'target117-extra-usage-command-target-fragment',
  'target117-extra-usage-command-source-declaration-test',
])

export const TARGET117_EXTRA_USAGE_COMMAND_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:12311`,
    targetIndex: 12311,
    paths: Object.freeze(['src/commands/extra-usage/index.ts']),
    declarations: Object.freeze([
      'isExtraUsageAllowed',
      'extraUsage',
      'extraUsageNonInteractive',
    ]),
    evidenceIds: TARGET117_EXTRA_USAGE_COMMAND_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target117 extra-usage command initializer is authored by src/commands/extra-usage/index.ts; its local-jsx command declaration owns the first target requires.ink capability pair, while the sibling non-interactive command and shared eligibility declaration close the whole initialization unit.',
  }),
])
