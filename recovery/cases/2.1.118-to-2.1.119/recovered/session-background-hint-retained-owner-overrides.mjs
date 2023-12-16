const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_SESSION_BACKGROUND_HINT_EVIDENCE_IDS = Object.freeze([
  'target119-session-background-hint-whole-unit-proof',
  'target119-session-background-hint-retained-residue-proof',
  'target119-session-background-hint-keyboard-runtime-boundary-proof',
  'target119-session-background-hint-cross-release-lineage-proof',
  'target119-session-background-hint-stale-source-graph-proof',
  'target119-session-background-hint-static-owner-only-proof',
])

export const TARGET119_SESSION_BACKGROUND_HINT_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:20791`,
    targetIndex: 20791,
    paths: Object.freeze(['src/components/SessionBackgroundHint.tsx']),
    declarations: Object.freeze(['SessionBackgroundHint']),
    evidenceIds: TARGET119_SESSION_BACKGROUND_HINT_EVIDENCE_IDS,
    behavior:
      'The complete authenticated Target119 SessionBackgroundHint unit is byte-length, token-count, cache-layout, and alpha-normalized-AST identical to its Target118 predecessor. Its apparent keyCase, lower, chord, and format additions are retained runtime properties at the same local subtrees; only global occurrence ordinals drift. The separately authenticated KeyboardShortcutHint runtime already accepts chord and format in both releases. Authored Target118 through Target120 source instead retains a shortcut-only caller and shortcut-only dependency, while the later Target121 source changes the entire hint lifecycle and uses a compatibility-superset dependency. This evidence admits the existing runtime owner statically and never authorizes source replay.',
  }),
])
