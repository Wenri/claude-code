const CASE_NAME = '2.1.118-to-2.1.119'
const TARGET_FRAGMENT_EVIDENCE =
  'target119-pro-trial-start-owner-target-fragment'
const SOURCE_COMPILER_EVIDENCE =
  'target119-pro-trial-start-owner-source-compiler-test'

export const TARGET119_PRO_TRIAL_START_OWNER_OVERRIDES = Object.freeze([
  Object.freeze({
    key: `${CASE_NAME}:21280`,
    targetIndex: 21280,
    paths: Object.freeze(['src/components/ProTrialStartScreen.tsx']),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_COMPILER_EVIDENCE,
    ]),
    declarationName: 'ProTrialStartScreen',
    behavior:
      'The complete authenticated Target119 unit is the live named-export registration for ProTrialStartScreen: it installs the ProTrialStartScreen getter on the module namespace, points that getter at the adjacent compiled declaration, and is reached by the interactiveHelpers dynamic import after the exact module initializer runs. The exact source export and live render consumer reject the provisional dialog candidates and prove this target-added property is a genuine module binding rather than alpha-equivalent retained noise or dead code.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:21281`,
    targetIndex: 21281,
    paths: Object.freeze(['src/components/ProTrialStartScreen.tsx']),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_COMPILER_EVIDENCE,
    ]),
    declarationName: 'ProTrialStartScreen',
    behavior:
      'The complete authenticated Target119 unit is the compiled ProTrialStartScreen declaration: its trial-start state machine, telemetry, duration copy, spinner, and success/error controls uniquely bind src/components/ProTrialStartScreen.tsx; React compiler memo-cache, JSX createElement, and JSX text normalization residues are pinned mechanical lowerings of that exact declaration.',
  }),
  Object.freeze({
    key: `${CASE_NAME}:21342`,
    targetIndex: 21342,
    paths: Object.freeze(['src/interactiveHelpers.tsx']),
    evidenceIds: Object.freeze([
      TARGET_FRAGMENT_EVIDENCE,
      SOURCE_COMPILER_EVIDENCE,
    ]),
    declarationName: 'showSetupScreens',
    behavior:
      'The complete authenticated Target119 showSetupScreens unit is the live downstream boundary of the Pro trial module: its conditional dynamic import executes the exact ProTrialStartScreen initializer, returns the namespace carrying the u21280 getter, destructures that named export, and renders the adjacent u21281 function. The exact interactiveHelpers.tsx source block closes the runtime edge while keeping unrelated startup-dialog and build-macro changes outside this proof.',
  }),
])

export const TARGET119_PRO_TRIAL_START_SOURCE_MARKERS = Object.freeze([
  'tengu_pro_trial_start_pressed',
  'tengu_pro_trial_start_ok',
  'tengu_pro_trial_start_error',
  'Your Pro plan includes a Claude Code trial.',
])

export const TARGET119_PRO_TRIAL_START_JSX_TEXT_LOWERINGS = Object.freeze([
  Object.freeze({
    source: ' Starting your trial…',
    target: ' Starting your trial…',
  }),
  Object.freeze({
    source: "Couldn&apos;t start your trial. Press ",
    target: "Couldn't start your trial. Press ",
  }),
  Object.freeze({ source: ' to continue.', target: ' to continue.' }),
  Object.freeze({
    source: ' to start your trial',
    target: ' to start your trial',
  }),
])
