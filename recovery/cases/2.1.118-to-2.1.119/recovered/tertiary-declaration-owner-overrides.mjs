const CASE_NAME = '2.1.118-to-2.1.119'

export const TARGET119_TERTIARY_DECLARATION_EVIDENCE_IDS = Object.freeze([
  'target119-tertiary-declaration-owner-target-fragment',
  'target119-tertiary-declaration-owner-source-ast-test',
])

function override(
  targetIndex,
  ownerPath,
  declarationName,
  sourceMarkers,
  targetMarkers,
  behavior,
) {
  return Object.freeze({
    key: `${CASE_NAME}:${targetIndex}`,
    targetIndex,
    paths: Object.freeze([ownerPath]),
    evidenceIds: TARGET119_TERTIARY_DECLARATION_EVIDENCE_IDS,
    declarationName,
    sourceMarkers: Object.freeze(sourceMarkers),
    targetMarkers: Object.freeze(targetMarkers),
    behavior,
  })
}

export const TARGET119_TERTIARY_DECLARATION_OWNER_OVERRIDES = Object.freeze([
  override(
    12736,
    'src/utils/prStatus.ts',
    'persistCache',
    ['JSON.stringify(value)', "json === '{}'", 'lastCacheJson = json'],
    ['let $={}', '==="{}"', '.catch('],
    'The complete authenticated Target119 unit is the authored persistCache declaration: it serializes the pull-request cache, suppresses empty or unchanged writes, and persists through a temporary file in src/utils/prStatus.ts; the provisional utils/ghPrStatus.ts owner is rejected.',
  ),
  override(
    16919,
    'src/services/proTrial.ts',
    'getProTrialDurationDays',
    ['getOauthAccountInfo()?.claudeCodeTrialDurationDays', '?? null'],
    ['claudeCodeTrialDurationDays', '??null'],
    'The complete authenticated Target119 unit is the authored getProTrialDurationDays declaration, which reads the nullable trial-duration field from OAuth account state in src/services/proTrial.ts; the provisional Logo feed-config owner is rejected.',
  ),
  override(
    16925,
    'src/services/proTrial.ts',
    'persistTrialEndsAt',
    ['saveGlobalConfig(current =>', 'claudeCodeTrialEndsAt: endsAt'],
    ['claudeCodeTrialEndsAt===', 'claudeCodeTrialEndsAt:'],
    'The complete authenticated Target119 unit is the authored persistTrialEndsAt declaration, which idempotently updates the OAuth trial end in global configuration in src/services/proTrial.ts; the provisional Logo feed-config owner is rejected.',
  ),
  override(
    17980,
    'src/commands/exit/exit.tsx',
    'call',
    ['<BackgroundSessionExitDialog', "gracefulShutdown(0, 'prompt_input_exit')"],
    ['onDetach:', '"prompt_input_exit"'],
    'The complete authenticated Target119 unit is the authored interactive exit call declaration: it handles background detach, worktree/background exit flow, and prompt-input shutdown in src/commands/exit/exit.tsx; the provisional WorktreeExitDialog owner is rejected.',
  ),
  override(
    17985,
    'src/commands/exit/exit-noninteractive.ts',
    'call',
    ["stopBackgroundSession('bridge')", "gracefulShutdown(0, 'prompt_input_exit')"],
    ['("bridge")', '"prompt_input_exit"'],
    'The complete authenticated Target119 unit is the authored noninteractive exit call declaration, which stops a background bridge session or performs prompt-input shutdown in src/commands/exit/exit-noninteractive.ts; the provisional WorktreeExitDialog owner is rejected.',
  ),
  override(
    21591,
    'src/services/mcp/headlessConnectionManager.ts',
    'RETRY_DELAYS_MS',
    ['const RETRY_DELAYS_MS = [500, 1_500, 4_000]'],
    ['[500,1500,4000]'],
    'The complete authenticated Target119 module-initializer unit contains the authored RETRY_DELAYS_MS declaration [500, 1500, 4000] from src/services/mcp/headlessConnectionManager.ts; the provisional main.tsx owner is rejected.',
  ),
])
