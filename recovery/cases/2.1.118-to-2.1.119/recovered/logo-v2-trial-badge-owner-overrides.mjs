const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_LOGO_V2_TRIAL_BADGE_EVIDENCE_IDS = Object.freeze([
  'target119-logo-v2-authenticated-whole-unit-proof',
  'target119-logo-v2-trial-badge-contract-proof',
  'target119-logo-v2-path-and-theme-delta-proof',
  'target119-logo-v2-pro-trial-dependency-proof',
  'target119-logo-v2-runtime-lineage-proof',
  'target119-logo-v2-source-replay-blocker',
])

export const TARGET119_LOGO_V2_TRIAL_BADGE_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:16982`,
    targetIndex: 16982,
    paths: Object.freeze(['src/components/LogoV2/LogoV2.tsx']),
    declarations: Object.freeze(['LogoV2']),
    evidenceIds: TARGET119_LOGO_V2_TRIAL_BADGE_EVIDENCE_IDS,
    behavior:
      'The authenticated Target119 LogoV2 is a complete 131-slot compiler-cached UI unit. It obtains and formats pro-trial state, colors an expired trial badge as suggestion and an active badge as warning, and places the badge in both compact and full layouts. The same unit adopts the config-backed theme resolver and filters absent agent/cwd path segments. Its baseline/target ASTs are identical after removing exactly those bounded regions, release metadata, and their five cache slots. The recovered LogoV2 owner is a stale 94-slot partial snapshot: it authenticates the module path, declaration, billingType, and theme change, but omits the trial and filtered-path contracts; no source through Target121 supplies them. Admission is therefore static and never authorizes source replay.',
  }),
])
