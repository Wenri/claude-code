const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_CONDENSED_LOGO_TRIAL_BADGE_EVIDENCE_IDS = Object.freeze([
  'target119-condensed-logo-authenticated-whole-unit-proof',
  'target119-condensed-logo-trial-badge-contract-proof',
  'target119-condensed-logo-path-layout-delta-proof',
  'target119-condensed-logo-pro-trial-dependency-proof',
  'target119-condensed-logo-runtime-lineage-proof',
  'target119-condensed-logo-source-replay-blocker',
])

export const TARGET119_CONDENSED_LOGO_TRIAL_BADGE_OWNER_OVERRIDES =
  Object.freeze([
    Object.freeze({
      key: `${CASE_NAME}:16959`,
      targetIndex: 16959,
      paths: Object.freeze([
        'src/components/LogoV2/CondensedLogo.tsx',
      ]),
      declarations: Object.freeze(['CondensedLogo']),
      evidenceIds: TARGET119_CONDENSED_LOGO_TRIAL_BADGE_EVIDENCE_IDS,
      behavior:
        'The authenticated Target119 CondensedLogo is a complete 57-slot compiler-cached UI unit. It obtains getProTrialState, formats it with formatTrialBadge, reserves terminal width for a visible badge, renders expired trials as suggestion-colored Extra usage and active trials as warning-colored remaining days, and appends that badge to both split and single-line billing layouts. It also atomically changes the agent/cwd display to a filtered path list. The adjacent module initializer and state selectors, unique logo markers, exact Target120/121 runtime lineage, and authenticated proTrial implementation bind the unit to src/components/LogoV2/CondensedLogo.tsx. GuestPassesUpsell is a positional false owner. The recovered 2.1.118-2.1.120 source is one unchanged 29-slot snapshot with neither trial helper import nor either runtime delta; the first changed 2.1.121 source adds only a later Opus launch gate and still omits the trial contract. Admission is static and never authorizes a partial or later-source replay.',
    }),
  ])
