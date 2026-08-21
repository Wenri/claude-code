const CASE_NAME = '2.1.117-to-2.1.118'
const TARGET_FRAGMENT_EVIDENCE = 'target118-direct-owner-target-fragment'
const SOURCE_AST_EVIDENCE = 'target118-direct-owner-source-ast-test'

function override(targetIndex, ownerPath, behavior) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([ownerPath]),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_AST_EVIDENCE,
    ]),
    behavior,
  })
}

export const TARGET118_DIRECT_OWNER_OVERRIDES = Object.freeze([
  override(
    6723,
    'src/utils/customThemes.ts',
    'The authenticated Target118 theme-directory accessor is the authored getUserThemesDir declaration, which joins the Claude config directory with the themes child rather than belonging to the adjacent palette module.',
  ),
  override(
    7466,
    'src/ink.ts',
    'The authenticated Target118 Ink export-table unit exposes useResolvedTheme and useCustomThemes through the authored ink.ts barrel; the adjacent use-tab-status attribution owns only one later export.',
  ),
  override(
    7509,
    'src/keybindings/defaultBindings.ts',
    'The authenticated Target118 default-keybinding initializer owns the ThemePicker ctrl+e theme:editCustom binding in DEFAULT_BINDINGS.',
  ),
  override(
    7522,
    'src/keybindings/schema.ts',
    'The authenticated Target118 keybinding schema initializer owns the context/action catalogs and the theme:editCustom action; reservedShortcuts.ts does not define that action.',
  ),
  override(
    8977,
    'src/context.ts',
    'The authenticated Target118 git-status truncation and Perforce workspace guidance are authored by getSystemContext and its git-status helper chain in context.ts.',
  ),
  override(
    9805,
    'src/components/IdeOnboardingDialog.tsx',
    'The authenticated Target118 IDE onboarding renderer is the exact authored IdeOnboardingDialog declaration, including context, review, and Cmd+Esc guidance.',
  ),
  override(
    10917,
    'src/services/awaySummary.ts',
    'The authenticated Target118 no-turn and api-error result branches are authored by generateAwaySummary, not the adjacent permission-logging module.',
  ),
  override(
    16266,
    'src/commands/plugin/TagPlugin.tsx',
    'The authenticated Target118 plugin tag command is the authored TagPlugin declaration, including dry-run, force, push, and unknown-flag handling; the adjacent validation utility is only a dependency.',
  ),
  override(
    16623,
    'src/components/WarmResumeHint.tsx',
    'The authenticated Target118 warm-resume experiment and rendered resume/fork guidance are authored by WarmResumeHint, not the adjacent LogoV2 component selected by the coalesced UI source map.',
  ),
  override(
    17033,
    'src/components/design-system/FuzzyPicker.tsx',
    'The authenticated Target118 searchable picker implementation is the authored generic FuzzyPicker declaration, not the adjacent cost command selected by the coalesced command source map.',
  ),
  override(
    17039,
    'src/components/CustomThemeEditor.tsx',
    'The authenticated Target118 custom-theme editor state machine is the authored CustomThemeEditor declaration, not the adjacent terminal-setup command selected by the coalesced command source map.',
  ),
  override(
    19473,
    'src/vim/transitions.ts',
    'The authenticated Target118 visual text-object transition is the authored fromVisualTextObject declaration; the coalesced Vim source map otherwise assigns the helper to the adjacent types module.',
  ),
  override(
    19475,
    'src/hooks/useVimInput.ts',
    'The authenticated Target118 visual-mode state machine is the authored useVimInput declaration, including selection anchoring, recorded visual operations, repeat handling, and mode transitions.',
  ),
  override(
    19477,
    'src/hooks/useSearchInput.ts',
    'The authenticated Target118 special-key initializer is the authored UNHANDLED_SPECIAL_KEYS declaration in useSearchInput, not the adjacent coalesced Vim types module.',
  ),
])
