import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { parse } from 'acorn'
import { TARGET119_AUTOFIX_PR_UI_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/autofix-pr-ui-owner-overrides.mjs'
import { TARGET119_AUTOCOMPACT_DIALOG_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/autocompact-dialog-owner-overrides.mjs'
import { TARGET119_DOCTOR_WHOLE_UNIT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/doctor-whole-unit-owner-overrides.mjs'
import { TARGET119_CONDENSED_LOGO_TRIAL_BADGE_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/condensed-logo-trial-badge-owner-overrides.mjs'
import { TARGET119_LOGO_V2_TRIAL_BADGE_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/logo-v2-trial-badge-owner-overrides.mjs'
import { TARGET119_AUTO_MODE_DENIALS_CONTEXT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/auto-mode-denials-context-owner-overrides.mjs'
import { TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/rate-limit-options-usage-label-owner-overrides.mjs'
import { TARGET119_SETTINGS_CONFIG_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/replay-settings-config-release-channel-source-gap.mjs'
import { TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/session-storage-assistant-dedup-owner-overrides.mjs'
import { TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/replay-hook-background-skip-spill-source-gap.mjs'
import { TARGET119_INBOUND_ATTACHMENT_SCHEMA_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/inbound-attachment-schema-inherited-owner-overrides.mjs'
import { TARGET119_RESUME_RETURN_DECISION_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/resume-return-decision-owner-overrides.mjs'
import { TARGET119_CLOSED_ISSUE_REFRESH_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/closed-issue-refresh-inherited-owner-overrides.mjs'
import { TARGET119_SSE_TRANSPORT_RETAINED_CLASS_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/sse-transport-retained-class-owner-overrides.mjs'
import { TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/replay-remote-bridge-teardown-disposal-source-gap.mjs'
import { TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/bridge-dialog-whole-unit-owner-overrides.mjs'
import { TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/subagent-status-line-schema-owner-overrides.mjs'
import { TARGET119_STATUS_LINE_CWD_FAST_MODE_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/replay-status-line-cwd-fast-mode-source-gap.mjs'
import { TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/prompt-input-footer-background-exit-owner-overrides.mjs'
import { TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/prompt-input-foreground-agents-owner-overrides.mjs'
import { TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/prompt-input-layout-effect-owner-overrides.mjs'
import { TARGET119_REMOTE_SESSION_ACTION_DISPATCH_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/remote-session-action-dispatch-owner-overrides.mjs'
import { TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/use-can-use-tool-denial-history-owner-overrides.mjs'
import { TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/wake-router-dispatch-timeout-owner-overrides.mjs'
import { TARGET119_CLI_BG_MODULE_IMPORT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/cli-bg-module-import-owner-overrides.mjs'
import { TARGET119_SESSION_BACKGROUND_HINT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/session-background-hint-retained-owner-overrides.mjs'
import { TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/ultraplan-choice-module-import-owner-overrides.mjs'
import { TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/connection-state-offline-threshold-owner-overrides.mjs'
import { TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/transcript-share-build-macro-owner-overrides.mjs'
import { TARGET119_JOB_STATE_NAME_SYNC_MODULE_IMPORT_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/job-state-name-sync-module-import-owner-overrides.mjs'
import { TARGET119_TIP_REGISTRY_DAY_WINDOW_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/tip-registry-day-window-owner-overrides.mjs'
import { TARGET119_SDK_CONTROL_INHERITED_SCHEMA_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/sdk-control-inherited-schema-owner-overrides.mjs'
import { TARGET119_SESSION_TASK_SUMMARY_STATE_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/session-task-summary-state-owner-overrides.mjs'
import { TARGET119_REPL_RUNTIME_EVOLUTION_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/repl-runtime-evolution-owner-overrides.mjs'
import { TARGET119_APPROVE_API_KEY_RETAINED_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/approve-api-key-retained-confirmation-owner-overrides.mjs'
import { TARGET119_RETAINED_CONFIRMATION_CLUSTER_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/onboarding-retained-confirmation-owner-overrides.mjs'
import { TARGET119_PRO_TRIAL_START_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/pro-trial-start-owner-overrides.mjs'
import { TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/parse-pr-identifier-strict-property-owner-overrides.mjs'
import { TARGET119_COMPUTER_USE_SETUP_RETAINED_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/computer-use-setup-retained-owner-overrides.mjs'
import { TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/iterm-copy-file-strict-property-owner-overrides.mjs'
import { TARGET119_SETUP_RENDEZVOUS_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/setup-rendezvous-server-strict-property-source-recovery.mjs'
import { TARGET119_HEADLESS_CLASSIFIER_SUMMARY_STRICT_PROPERTY_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/headless-classifier-summary-strict-property-owner-overrides.mjs'
import { TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/headless-streaming-strict-residue-owner-overrides.mjs'
import { TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_STRICT_PROPERTY_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/mcp-entrypoint-task-registry-strict-property-owner-overrides.mjs'
import { TARGET119_MAIN_RUN_BUILD_PROFILE_OWNER_OVERRIDES } from '../cases/2.1.118-to-2.1.119/recovered/main-run-build-profile-owner-overrides.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const semanticCase = process.env.CLAUDE_CODE_SEMANTIC_CASE
const sourceRoot = path.resolve(
  process.env.CLAUDE_CODE_SEMANTIC_SOURCE_ROOT ??
    path.join(repositoryRoot, 'src'),
)
const fixtureDescriptors = new Map([
  [
    '2.1.117-to-2.1.118',
    {
      filename: 'recovery-2.1.118-owner-residue-analysis.json',
      sha256: 'fd00e94db1387273b1252c2dad06f24aeb30d396a81dba0084aeb0d490521daa',
    },
  ],
  [
    '2.1.118-to-2.1.119',
    {
      filename: 'recovery-2.1.119-owner-residue-analysis.json',
      sha256: '2f724f6eeb76b532bb76c264887e78fce4c4435f073992d2cc539ca12890edc7',
    },
  ],
])

const target119CurrentArtifactPins = {
  typedAudit: {
    path:
      '.recovery-tmp/residue-audits/2.1.118-to-2.1.119.typed-audit.json',
    bytes: 24_991_569,
    sha256:
      'c4ab243f3937141db7984b0d4d9cdde7900805369a74a8b9b7589b13fbd1e78d',
  },
  sourceCoverage: {
    path:
      'recovery/cases/2.1.118-to-2.1.119/semantic/source-coverage.json.gz',
    bytes: 383_456,
    sha256:
      '874421d61f40166898113e0967be904859cda7c00493ee57303b97164bbb0015',
    rawBytes: 3_297_173,
    rawSha256:
      '0facb150b84243148609b0e5562484d5d9e5c29f895d03c3a3566484b347b08e',
  },
  semanticCorrespondence: {
    path:
      'recovery/cases/2.1.118-to-2.1.119/semantic/semantic-correspondence.json.gz',
    bytes: 1_093_872,
    sha256:
      '41cae97af8435dee9a461d707c2e81fe2bbe675080db646d61d85a1a78c87afb',
  },
}

const target118ReplayPackage = {
  fixtures: {
    sessions: {
      path: 'recovery/test/recovery-2.1.118-sessions-owner-source-gap.json',
      sha256:
        'e41666a8bdd8113127d5d55356bf3e35153945968ef1199e41840c8e179b69cb',
    },
    strict: {
      path: 'recovery/test/recovery-2.1.118-strict-transitive-owner-proofs.json',
      sha256:
        '05be53b4766565d337a79f7a7de5bfdecdcc0d69d170c0211ced8c81f9cd23ca',
    },
    oauth: {
      path: 'recovery/test/recovery-2.1.118-oauth-profile-source-gap.json',
      sha256:
        'effce04a60197fa0e8f57f6200a032911c9614dc5c6b6f666d4a81c389264e98',
    },
    errorTelemetry: {
      path: 'recovery/test/recovery-2.1.118-error-telemetry-source-gap.json',
      sha256:
        '6339a82ea147db12693ef6cf5dc6713833985ef7018c0beb8048439bd8c2816b',
    },
    themePicker: {
      path:
        'recovery/test/recovery-2.1.118-theme-picker-state-source-gap.json',
      sha256:
        '6808b63e769b202d68dfc803a340ddbbbcaf432589f48625f72c65c47683e170',
    },
    scheduleOneOff: {
      path:
        'recovery/test/recovery-2.1.118-schedule-one-off-gate-source-gap.json',
      sha256:
        '3f4acb486ebb7e3009aac604286dbdcb898ad691866d965ca7e8f5ee6b7b9fe2',
    },
    commandAliasSelection: {
      path:
        'recovery/test/recovery-2.1.118-command-alias-selection-source-gap.json',
      sha256:
        'ed48bc26b8960324338a7371c543c27e7779b98c963f74203b068def17c8f8f0',
    },
    collapsedShellLabel: {
      path:
        'recovery/test/recovery-2.1.118-collapsed-shell-label-source-gap.json',
      sha256:
        '0b6ded759334c9990d9b6a7f80816bca897f82a5d4a3aea1eb25a72ca0bc33c2',
    },
    sessionMemoryLastMessage: {
      path:
        'recovery/test/recovery-2.1.118-session-memory-last-message-source-gap.json',
      sha256:
        '69ca5a3514f77237c6a9730f98987cc4eeb292aa094ec7812a38be9fb7b33822',
    },
    mcpToolHook: {
      path: 'recovery/test/recovery-2.1.118-mcp-tool-hook-source-gaps.json',
      sha256:
        'dbc35b6fb6e2bf57d2738f339b2417033e3f7be51dbefab34b013f4beef928fa',
    },
    mcpClientAccessor: {
      path:
        'recovery/test/recovery-2.1.118-mcp-client-accessor-source-gap.json',
      sha256:
        'daffc3cef39b713180bd17b036c1ca6f5554b295ed589b443dd04e156bdb9617',
    },
    parserStreamingTail: {
      path:
        'recovery/test/recovery-2.1.118-parser-streaming-tail-source-gap.json',
      sha256:
        '9222c56671c1bd59b545951dd2475c982ce4e5fa19d18d68c54d58fdd33c1562',
    },
    codeSessionCompat: {
      path:
        'recovery/test/recovery-2.1.118-code-session-compat-source-gap.json',
      sha256:
        'b59e7539d86cfbc5f9bb9d7748cfa758dc26904021e35b9b461c8ad50a84549c',
    },
    frameUrls: {
      path: 'recovery/test/recovery-2.1.118-frame-urls-state-source-gap.json',
      sha256:
        '1546aca467195f572b3bf0673eff809a297a5cd8e62a42bf4346c0fa9b92c3c4',
    },
    skillAuthorByline: {
      path:
        'recovery/test/recovery-2.1.118-skill-author-byline-source-gap.json',
      sha256:
        '6510002dc3ed08671305b537e498ce7a7cf7fac65e67e65362eeb9e52be9b0cf',
    },
    taskStopOwnerNotification: {
      path:
        'recovery/test/recovery-2.1.118-task-stop-owner-notification-source-gap.json',
      sha256:
        'f5931f0dd8f9db19814fae1c511df399b875fd6b6c64eb1e48da915cd50de830',
    },
    standaloneInProcessRunner: {
      path:
        'recovery/test/recovery-2.1.118-standalone-in-process-runner-source-gap.json',
      sha256:
        '56d7b637e609019247ff63c100786c37164ba1495329cdd7763196510b84d4e5',
    },
    fileReadPowerShellNotebookHint: {
      path:
        'recovery/test/recovery-2.1.118-file-read-powershell-notebook-hint-source-gap.json',
      sha256:
        'cb83ef2e5e091495744055e1a92892c0c411582161baba89f7fb1bcf87fe7e18',
    },
    searchBoxDimRangeCursor: {
      path:
        'recovery/test/recovery-2.1.118-search-box-dim-range-cursor-source-gap.json',
      sha256:
        '57675e052c3737d5e633a5ffc058fbf4b1570736add7c60c9fab199fd53b6e93',
    },
    warmResumeSessionKind: {
      path:
        'recovery/test/recovery-2.1.118-warm-resume-session-kind-source-gap.json',
      sha256:
        '5e3e3cb57c118f16712d446da62fccc3bc8e85bf8ae72e46b0928e9afba2ffae',
    },
    virtualScrollAppendSnapshot: {
      path:
        'recovery/test/recovery-2.1.118-virtual-scroll-append-snapshot-source-gap.json',
      sha256:
        'a0ba9d785590b5bf4d8552f2413031105d54b771974eb4bd80edce406291bf65',
    },
    tuiTelemetry: {
      path:
        'recovery/test/recovery-2.1.118-tui-telemetry-source-gap.json',
      sha256:
        '3afa6c2523f5a7ee4b9070bf4a5c9ac7c9fa946f5feac78d50b1bd4665403c08',
    },
    fastCommandThinClientDispatch: {
      path:
        'recovery/test/recovery-2.1.118-fast-command-thin-client-dispatch-source-gap.json',
      sha256:
        '80a23c4b5c97e8db201ff359e827202bd867a1a66ad59c96f278eb8397131d9c',
    },
    effortCommandThinClientDispatch: {
      path:
        'recovery/test/recovery-2.1.118-effort-command-thin-client-dispatch-source-gap.json',
      sha256:
        'd9bf8aa4c2c4ce48ed69c36f0a5647400e755909ca16bd471feaf7ea51c7ec39',
    },
    voiceModeArgumentRouting: {
      path:
        'recovery/test/recovery-2.1.118-voice-mode-argument-routing-source-gap.json',
      sha256:
        '4053d8a2b4a679d9d053902c2b834dd69b4e480f3c0e40d6d39d7260a60c5624',
    },
    structuredOutputAlwaysLoad: {
      path:
        'recovery/test/recovery-2.1.118-structured-output-always-load-source-gap.json',
      sha256:
        '3bfb67ecce325df7b715f7c20fba1b46b0218a7a464c51ddd7cbfd9a019ab13e',
    },
    codeSessionGitContext: {
      path:
        'recovery/test/recovery-2.1.118-code-session-git-context-source-gap.json',
      sha256:
        'a570fff48542405f406e150c861a0c5dda027ebeaea156cdb4823cd42067031b',
    },
    proactiveOAuthRefresh: {
      path:
        'recovery/test/recovery-2.1.118-proactive-oauth-refresh-source-gap.json',
      sha256:
        'c46c413c82e4151693007b89541239d156791fce64482211646887ce54c94dd3',
    },
    restoreCodeDiffStats: {
      path:
        'recovery/test/recovery-2.1.118-restore-code-diff-stats-source-gap.json',
      sha256:
        '8d03e2ca5441fef5aecd6ddc22351aa59a4aa0e60969a21134b07e578532245c',
    },
    statusLineFastMode: {
      path:
        'recovery/test/recovery-2.1.118-status-line-fast-mode-source-gap.json',
      sha256:
        '0e5d1a4215edfc38474fd5189cd223e07dddb5e2de7a6e8620689edaaa1a6d08',
    },
    feedbackSurveyMessageWrap: {
      path:
        'recovery/test/recovery-2.1.118-feedback-survey-message-wrap-source-gap.json',
      sha256:
        '3284fb06b76496e84af9b38c15701730e448ca830611db69197409801b6754f3',
    },
    sdkControlInteractions: {
      path:
        'recovery/test/recovery-2.1.118-sdk-control-interactions-source-gap.json',
      sha256:
        '2a55cb995a3141ea2b95d16ef78c0334d9ea6b508dd190bcedc68614cfc99e1a',
    },
    bootstrapAdditionalModelCosts: {
      path:
        'recovery/test/recovery-2.1.118-bootstrap-additional-model-costs-source-gap.json',
      sha256:
        '046c408a7e82dcb4f9fc37f6e6f83a3019d7b00323e4ad853d8ba1f34dee46a1',
    },
  },
  correctedRawResidualBeforeSessionKindDce: {
    units: 133,
    residues: 501,
    residueIdentitiesSha256:
      '62a6fe5314570669f500bcbc850d662a65e6721997cf5db936a662abfaafcf40',
  },
  residualBeforeSessionKindDce: {
    units: 88,
    residues: 377,
    residueIdentitiesSha256:
      'b68fec2e8cc143f4dd62eb9ac98c3c9898817741ca9935b1ece4818d223ca4dd',
  },
  correctedRawResidual: {
    units: 132,
    residues: 500,
    residueIdentitiesSha256:
      'cf50b3720629dd53c45875a632c5554bc99a637d4d44dabeb13d1a4ea1b031ad',
  },
  residual: {
    units: 87,
    residues: 376,
    residueIdentitiesSha256:
      'd2b5cc090c3a47d25d9bd790de52892c4ec3e851993d372f572d954ce458b20e',
  },
}

const coverageEvolutionOverlays = new Map([
  [
    '2.1.117-to-2.1.118',
    {
      proofCorrectionGroups: [
        {
          id: 'target118-direct-owner',
          path: 'recovery/test/recovery-2.1.118-direct-owner-proofs.json',
          sha256:
            'df691699e7b485a97117b552205142a8cae6eeefa908fc5e5673470c93c51038',
          units: 14,
          residues: 292,
          targetIndicesSha256:
            '16f065807124e4506ee123cd1a009b6a9e0673a77e0dfa6137976f36760705c0',
          residueIdentitiesSha256:
            '4629f8d70751a95cccf98750f5a60c02d8a9a04c610232a15f89f6164b9855c2',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 8,
          correctedScannerResidues: 36,
          correctedScannerResidueIdentitiesSha256:
            '9cff0083542be77331998cf9a34cdf920e9d49603e99be0887dcd553f9ee73fc',
        },
        {
          id: 'target118-secondary-direct-owner',
          path:
            'recovery/test/recovery-2.1.118-secondary-direct-owner-proofs.json',
          sha256:
            '196da513960af1395826f32992ddab34bddd660e458274305606bb2faead0847',
          units: 3,
          residues: 9,
          targetIndicesSha256:
            'ddf227525d9a6f6c87ff97a25ff9d281f8e78292c8e3c3e0867078fd148d5a16',
          residueIdentitiesSha256:
            '7e09f43bb41d09f3dabf12972e308fe0fe07f4e55ab4f0e42d4c30bdb8a0b98a',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          scannerResidualMode: 'all-explicit-residues',
        },
        {
          id: 'target118-secondary-static-owner',
          path:
            'recovery/test/recovery-2.1.118-secondary-static-owner-proofs.json',
          sha256:
            '70e14d88d7f17f86e3b377867dfba748810409b1857b89ba54848f3f4b8437f9',
          units: 3,
          residues: 3,
          targetIndicesSha256:
            '401e33ae797bc0a4ea9d6d5da02b88e4d07e21bb78120bc776c6202682f3d64c',
          residueIdentitiesSha256:
            '76bea86df3e5a4359cfd83c4bbdb546df0b579895a1a7e047b5fed6ec414936a',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          scannerResidualMode: 'all-explicit-residues',
        },
        {
          id: 'target118-tertiary-static-owner',
          path:
            'recovery/test/recovery-2.1.118-tertiary-static-owner-proofs.json',
          sha256:
            '4b7af420e132558d607fd78debf477bf0be939dba5fe7ff9d6dcc4f52a222c48',
          units: 4,
          residues: 4,
          targetIndicesSha256:
            '9bd9069b92c74fe00ac31ddc0472e0f4048841d7c30686779d34008e13c134af',
          residueIdentitiesSha256:
            'c2cf99264fe70ecddc3e323c340b1d78b01bdd7dab7e2620898250d018f4ed89',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          scannerResidualMode: 'all-explicit-residues',
        },
        {
          id: 'target118-quaternary-static-owner',
          path:
            'recovery/test/recovery-2.1.118-quaternary-static-owner-proofs.json',
          sha256:
            'c2705ee10561ffedf6393573a0ad0a35f5b33df7965fc7e38efe659dca25311f',
          units: 10,
          residues: 11,
          targetIndicesSha256:
            'b9b6e4b8c9403e7e92510ef458d67fa0243793bb9f77f18c9558ef9b5ab2b0de',
          residueIdentitiesSha256:
            '8c679186c888bfe49b050eb5b41813bc31a44329803b23f07247464f5b18da3a',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          scannerResidualMode: 'all-explicit-residues',
        },
        {
          id: 'target118-quinary-static-owner',
          path:
            'recovery/test/recovery-2.1.118-quinary-static-owner-proofs.json',
          sha256:
            '7b76c118554d42205c24c3d1a7e36dbd234dfcbe93484ddb4bd33eb4b769969e',
          units: 3,
          residues: 5,
          targetIndicesSha256:
            'ee9cf928ea159575bb56ac8d9c7e53272998340d147f9245cd7f5e9c225b5203',
          residueIdentitiesSha256:
            'cfed743f914c0ffded95d8aebf6b705ff8c10ccb35c67ab4fb342a4eeee67590',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          scannerResidualMode: 'all-explicit-residues',
        },
        {
          id: 'target118-wif-static-owner',
          path:
            'recovery/test/recovery-2.1.118-wif-static-owner-proofs.json',
          sha256:
            '5dfdec315421e8faade331d5f175fff95048899a8f113efdf6245bcca771d60f',
          units: 1,
          residues: 2,
          targetIndicesSha256:
            '1b4747b90a55a696654589eb700a113970a700214eeabc2295a2ed730c0b205b',
          residueIdentitiesSha256:
            'f4986979db62bd90e44ab972db49edbd6c975a2411b97c6f7a5c62b85bf7e797',
          fixtureResidueIdentitiesSha256:
            '35881a70b6dd11f35b77480f73c9678c527c4b24e047c4640ef383784c232c60',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-row-static',
          scannerResidualMode: 'all-explicit-residues',
        },
        {
          id: 'target118-wsl-fingerprint-property-owner',
          path:
            'recovery/test/recovery-2.1.118-wsl-fingerprint-property-owner-proof.json',
          sha256:
            'aef64963bcd9b6d5fa8194f68be7e0f564c0141baddeb41ea6f5bc660c031617',
          units: 1,
          residues: 2,
          targetIndicesSha256:
            '251257154b5c1e9162ab2f40ce55bd7a6f80e65afcf37083d4d0b9507705d72a',
          residueIdentitiesSha256:
            '0252dd8b30e45f6e1edaae4ab4ab7837570b859f242c609aec4789bdb650d5e9',
          fixtureResidueIdentitiesSha256:
            'b19cca588e5e0ac34daf7ba8bea5d81da9aea59dbcc63759aa260ccb8d2fe6c5',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The authenticated settings-change detector snapshots the WSL Windows managed-settings fingerprint twice. The generated wslWindowsFile object key and the historical source wslFiles key are local snapshot labels whose values resolve to the same authenticated getWslWindowsManagedSettingsFingerprint implementation.',
        },
        {
          id: 'target118-cache-diagnosis-schema-owner',
          path:
            'recovery/test/recovery-2.1.118-cache-diagnosis-schema-owner-proof.json',
          sha256:
            '0ca340d6f953acf9ff67e169537e0b1df9fab896c5276e209bc499c72c940e7c',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '371c44347c609235ad30389c43cc7fd28ad37f0065d236973df1c674d034647f',
          residueIdentitiesSha256:
            '56f3586fe0161ed5a1697a1b4e2bd23f157478911805c8491338528197c12a96',
          fixtureResidueIdentitiesSha256:
            'bec44c111ca5ed85a4f566db144c293a248eb4a09a967da9a470e23b85869ca1',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-static',
          scannerResidualMode: 'none',
          correctedBehavior:
            'The authenticated Target118 prompt-cache persistence schema adds cacheDiagnosis with a false default to the exact Target117 predecessor. The historical source transition adds the same PreviousState and PromptStateSnapshot field, false default, change detection, state updates, diagnostics, and telemetry in promptCacheBreakDetection.ts; the buddy/companion.ts attribution is rejected.',
        },
        {
          id: 'target118-resume-persisted-count-owner',
          path:
            'recovery/test/recovery-2.1.118-resume-persisted-count-owner-proof.json',
          sha256:
            '6e2f3a27d64029284e3ecec5400d366b021461a874e96a966ccf57f4b1290c3c',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            'ad7afb915893975d9cb09f314c139681b155c222f55f62ba5b5878d82aaff47e',
          residueIdentitiesSha256:
            '65aa11143ff5f40e681f29b698891404614a4735c9bd93254319a6ff5f4a0b00',
          fixtureResidueIdentitiesSha256:
            '3fa8c22489788c4b512fdbaa514d4ac9bba9e32a958c1d797548f3b2db73c89c',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-static',
          scannerResidualMode: 'pinned-explicit-subset',
          provisionalScannerUnits: 1,
          provisionalScannerResidues: 28,
          provisionalScannerResidueIdentitiesSha256:
            'be79ca1fff295dc59c309401c059d90b86fe2439d58e76a62067ff61ec493676',
          correctedScannerUnits: 1,
          correctedScannerResidues: 28,
          correctedScannerResidueIdentitiesSha256:
            'be79ca1fff295dc59c309401c059d90b86fe2439d58e76a62067ff61ec493676',
          correctedBehavior:
            'Target118 resumeAgentBackground passes the authenticated resumed-message count into runAgent as resumePersistedCount. The exact historical runAgent declaration slices the already-persisted prefix and retains the preceding UUID as the resumed sidechain parent before recording new messages.',
        },
        {
          id: 'target118-warm-resume-static-owner',
          path:
            'recovery/test/recovery-2.1.118-warm-resume-static-owner-proofs.json',
          sha256:
            '3bc12c165470e91076b628b9eb31847dc0583528c1ad19f03deafde51bfcd5dd',
          units: 2,
          residues: 2,
          targetIndicesSha256:
            'bef225801134d7abc23bc82bd4f87772d0be0b3fa04010fab62776456f119dc7',
          residueIdentitiesSha256:
            '72f26da89a4e0675a9f44624b6f662c217853a3e21f729639e348bad0f4fe7c9',
          fixtureResidueIdentitiesSha256:
            '72f26da89a4e0675a9f44624b6f662c217853a3e21f729639e348bad0f4fe7c9',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          scannerResidualMode: 'none',
        },
        {
          id: 'target118-tui-relaunch-static-owner',
          path:
            'recovery/test/recovery-2.1.118-tui-relaunch-static-owner-proofs.json',
          sha256:
            '5aac3dd04f0279ed78a08cde58ea2a6cfdc174be18b8780b602570ef3fe24ef5',
          units: 2,
          residues: 3,
          targetIndicesSha256:
            '804a720a2826ab47a88b04b4b5213d2b1428da59d41a28c3077be2fee61d64c5',
          residueIdentitiesSha256:
            '29bb1a40ea208d35c82cde82ccf08e3ec27477fd0e7910d92ffa0b56cf29ba88',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          scannerResidualMode: 'none',
        },
        {
          id: 'target118-daemon-paths-owner',
          path:
            'recovery/test/recovery-2.1.118-daemon-paths-owner-proofs.json',
          sha256:
            'b7824bd5a8b48a11a9b4a41c2d81bd9e98bd011f80f58f1e209db796fcae8b00',
          units: 2,
          residues: 3,
          targetIndicesSha256:
            '6f56951b236c3911e5f1e7885bf40d3734eebc5769d91d105b750be41f2b2fd9',
          residueIdentitiesSha256:
            '2ae68f9c3817249214c22135a9ad3ac060775a63154c1dab97b0f185b29ed9dd',
          fixtureResidueIdentitiesSha256:
            '2ae68f9c3817249214c22135a9ad3ac060775a63154c1dab97b0f185b29ed9dd',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 1,
          correctedScannerResidues: 1,
          correctedScannerResidueIdentitiesSha256:
            '818159c5f76e588da4c8e42f2c70d2cf11031b855b50989d45ba7594a8a3908e',
        },
        {
          id: 'target118-with-retry-overage-header-owner',
          path:
            'recovery/test/recovery-2.1.118-with-retry-overage-header-owner-proof.json',
          sha256:
            '2429ab38e0a2b24b4a93c021f70654d5184cd3fd1a079c0b6c365b9389a5c114',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '670c91bed10575c7bce87f25f5ca583f3d53f585dc63eaf184c177c128c9ea4c',
          residueIdentitiesSha256:
            'eea92e527ef73b65ff84bb4508da2fb12c36793a4d9421c60411cc23c69892b7',
          fixtureResidueIdentitiesSha256:
            'eea92e527ef73b65ff84bb4508da2fb12c36793a4d9421c60411cc23c69892b7',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'none',
        },
        {
          id: 'target118-autofix-pr-command-owner',
          path:
            'recovery/test/recovery-2.1.118-autofix-pr-command-owner-proof.json',
          sha256:
            'ee834ff03a33b35257d9191fd1d4c314b952f9ff324d6d0940385d01592db81f',
          units: 1,
          residues: 2,
          targetIndicesSha256:
            'd1c64f1efd05abb70f03677ce84ad40139b2470e473e2196e1846a0656546c61',
          residueIdentitiesSha256:
            '4cfce17222a48dfd63b1bea8c7267a9f83331e0b065d1e0c712aa35c5a6d8f89',
          fixtureResidueIdentitiesSha256:
            '4cfce17222a48dfd63b1bea8c7267a9f83331e0b065d1e0c712aa35c5a6d8f89',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'none',
        },
        {
          id: 'target118-push-notification-tip-relevance-owner',
          path:
            'recovery/test/recovery-2.1.118-push-notification-tip-relevance-owner-proof.json',
          sha256:
            '44c8383be2583bde99e859d1ab92ef9754e7aadbc42f80d946a03068747fdc9f',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '174555dd268eaf8b376781303a123d6130d334f5c010fac35909c29a68f379f4',
          residueIdentitiesSha256:
            '3c2a57bc3631a3e7f6d33b91ccae67513f41de16a5739e8c7bd039698bb2dc0d',
          fixtureResidueIdentitiesSha256:
            '3c2a57bc3631a3e7f6d33b91ccae67513f41de16a5739e8c7bd039698bb2dc0d',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'none',
        },
        {
          id: 'target118-fork-name-registration-owner',
          path:
            'recovery/test/recovery-2.1.118-fork-name-registration-owner-proof.json',
          sha256:
            '2aa0643338f61fd0467141678137db68a73a0fcbac769fe6ad8e447e510a054a',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '451a71baf3b49a12802a7feb7de5c47f5e6a754cdd4a0c1f94e58570e8886796',
          residueIdentitiesSha256:
            'd9bf5af681ca2afac65617b52e03ad64ddd9db86797794ec93a56edf2e53788f',
          fixtureResidueIdentitiesSha256:
            'd9bf5af681ca2afac65617b52e03ad64ddd9db86797794ec93a56edf2e53788f',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The authenticated Target118 fork spawn registers the derived fork name and agent ID through agentLifecycle.registerName, whose matched lifecycle helper performs the same cloned agentNameRegistry update that historical src/commands/fork/fork.ts performs inline. The registerName property is an extracted state-update representation, not a missing remote-setup behavior.',
        },
        {
          id: 'target118-session-storage-entry-policy-owner',
          path:
            'recovery/test/recovery-2.1.118-session-storage-entry-policy-owner-proof.json',
          sha256:
            'dfa836abcc9e050273ba5735590f5c4b932eae19228021b8ff78f54e6b79fde6',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            'b19b4327fd39bc56dc7016394eac84d2fe42e387d7fe6329ebba639caacb8aec',
          residueIdentitiesSha256:
            '039733619534627ebe195a8609da11423f9f3c9bbf6fa41a4e12e5ce8de6965c',
          fixtureResidueIdentitiesSha256:
            '039733619534627ebe195a8609da11423f9f3c9bbf6fa41a4e12e5ce8de6965c',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'pinned-explicit-subset',
          provisionalScannerUnits: 1,
          provisionalScannerResidues: 4,
          provisionalScannerResidueIdentitiesSha256:
            '40c09a0e62633915dde5f16a7c5c706af7344296652f0725f7c61a3cce01517b',
          correctedScannerUnits: 1,
          correctedScannerResidues: 4,
          correctedScannerResidueIdentitiesSha256:
            '40c09a0e62633915dde5f16a7c5c706af7344296652f0725f7c61a3cce01517b',
          correctedBehavior:
            'The authenticated Target118 ENTRY_APPEND_POLICY route-by-agent value is the table-driven form of historical Project.appendEntry routing: content-replacement entries use an agent transcript only when agentId exists, fork-context-ref entries use their required agent transcript, and both otherwise preserve the session-file route. The exact target policy/switch and historical source branches are state-equivalent; this is not incidental text or missing session-storage behavior.',
        },
        {
          id: 'target118-bundled-skills-root-owner',
          path:
            'recovery/test/recovery-2.1.118-bundled-skills-root-owner-proof.json',
          sha256:
            '32ac765dbf200144a7635f9854b8f285f1e6d6e3b5ba1c2e7705c61482e05b8c',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '869b7202f4d81256a833cb0681a68ab85c4902de95ae13a84780021ef9d8ccfd',
          residueIdentitiesSha256:
            'a49ca4a38a8e09382e3d3ceefd8bf33a5e2dff1f951957d459cee6516a8eec9e',
          fixtureResidueIdentitiesSha256:
            'a49ca4a38a8e09382e3d3ceefd8bf33a5e2dff1f951957d459cee6516a8eec9e',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'pinned-explicit-subset',
          provisionalScannerUnits: 1,
          provisionalScannerResidues: 4,
          provisionalScannerResidueIdentitiesSha256:
            'e990b838256c3fb6bb73e611cd6a33b29ca5c746cef6ae5afd710809ee552640',
          correctedScannerUnits: 1,
          correctedScannerResidues: 4,
          correctedScannerResidueIdentitiesSha256:
            'e990b838256c3fb6bb73e611cd6a33b29ca5c746cef6ae5afd710809ee552640',
        },
        {
          id: 'target118-background-work-state-owner',
          path:
            'recovery/test/recovery-2.1.118-background-work-state-owner-proof.json',
          sha256:
            '40212d0bff1601862447b5044eac552023538e603fa53a0e177015d3f4351760',
          units: 1,
          residues: 2,
          targetIndicesSha256:
            '15ac5eb2c7ce297e012b717a37de9eff0a21acc5e3dfe302c15a6cdbd5f8b7ad',
          residueIdentitiesSha256:
            '89a8105917d3a0da5180a6c86145c4fd958f6ed5819a952625878be2c1f7680a',
          fixtureResidueIdentitiesSha256:
            '89a8105917d3a0da5180a6c86145c4fd958f6ed5819a952625878be2c1f7680a',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'none',
        },
        {
          id: 'target118-ccr-transcript-persistence-owner',
          path:
            'recovery/test/recovery-2.1.118-ccr-transcript-persistence-owner-proof.json',
          sha256:
            'c4c5cd4eb5e36260cd7a351196fd46541eddf12a14276c5ca037aadd2dca1bdd',
          units: 1,
          residues: 2,
          targetIndicesSha256:
            'f0a6d994d96a94c8a206c2d50812e2f20bef6c3bf0469110d8bdbcefa45c2acd',
          residueIdentitiesSha256:
            'fe5fe6e4194b9bc4f77eaa535a006afcc7afb4831effd0f2bcc29e01579249fc',
          fixtureResidueIdentitiesSha256:
            'fe5fe6e4194b9bc4f77eaa535a006afcc7afb4831effd0f2bcc29e01579249fc',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'all-explicit-residues',
        },
        {
          id: 'target118-bridge-client-presence-owner',
          path:
            'recovery/test/recovery-2.1.118-bridge-client-presence-owner-proof.json',
          sha256:
            '3fd25f75bdc5000eda73b9bee5b6825ed2387bc5389c3503433dabf2152577c1',
          units: 1,
          residues: 4,
          targetIndicesSha256:
            '485c72fc69d12731744901a964221df72f2b88ead1aaa13ff8942b37f6ed6ae7',
          residueIdentitiesSha256:
            'f90ea9f0ce3567cb2000d2df85277b18ff0601a312ceaa1796b000ab4f4a6795',
          fixtureResidueIdentitiesSha256:
            'f90ea9f0ce3567cb2000d2df85277b18ff0601a312ceaa1796b000ab4f4a6795',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'none',
        },
        {
          id: 'target118-prompt-input-runtime-owner',
          path:
            'recovery/test/recovery-2.1.118-prompt-input-runtime-owner-proof.json',
          sha256:
            '7451ad77574bb70887f2131ed3e457ac3121fd1a21ee539663dfc949a78600d2',
          units: 1,
          residues: 8,
          targetIndicesSha256:
            '58fd3d4f985b2f9903284e9acf81f9849a0c53a61e1799c2917976b7c57e25e8',
          residueIdentitiesSha256:
            '9b33ea5a5468ba31e1940154b65272bf8d3a4b33dca1b682bccb2169185a1086',
          fixtureResidueIdentitiesSha256:
            '9b33ea5a5468ba31e1940154b65272bf8d3a4b33dca1b682bccb2169185a1086',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'all-explicit-residues',
        },
        {
          id: 'target118-plugin-theme-count-owner',
          path:
            'recovery/test/recovery-2.1.118-plugin-theme-count-owner-proof.json',
          sha256:
            '5992d5d1aa549825967e5466d5b6ead34ad89ae898af1ca5efdf1a82d6c19a6c',
          units: 1,
          residues: 2,
          targetIndicesSha256:
            '1b979407d54b9d2e2dc65e2b44cc588c5ae6dc3e3397c27b44cb9d44ce725b0f',
          residueIdentitiesSha256:
            '453fd733b870fabe0d76a95e8568b988de3ea3cf70e7f42ad79b33b7242d0058',
          fixtureResidueIdentitiesSha256:
            '453fd733b870fabe0d76a95e8568b988de3ea3cf70e7f42ad79b33b7242d0058',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-owner-override-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The authenticated Target118 useManagePlugins hook synchronously publishes themes from the just-loaded enabled plugin set, records the resulting theme_count in successful startup telemetry, and records zero on the failure path. Removing exactly that loader call and the two theme_count fields yields the complete Target117 hook after identifier and expression-sequence normalization, and Target119 retains the complete Target118 unit. Recovered source contains a later asynchronous no-argument theme loader API and no exact theme-count call graph, so this is a static whole-unit admission and never authorizes a partial replay.',
        },
        {
          id: 'target118-transcript-share-static-owner',
          path:
            'recovery/test/recovery-2.1.118-transcript-share-static-owner-proof.json',
          sha256:
            'e771b6fc9b716b4371af6c54678b1871ad68fd5265bde7448233f7b96d6ee5a7',
          units: 1,
          residues: 4,
          targetIndicesSha256:
            '39172db4adf87e40d9008d0443906a800f7b49c31a251d1a9a7f6d04f954e1b1',
          residueIdentitiesSha256:
            'fbb35cd0c79b39600f4d84c2df9e6b8e30e276f5ec1a34a15411475278882e53',
          fixtureResidueIdentitiesSha256:
            'fbb35cd0c79b39600f4d84c2df9e6b8e30e276f5ec1a34a15411475278882e53',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-owner-override-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The authenticated Target118 submitTranscriptShare unit is identical to its complete Target117 predecessor after only bundle-local identifier and exact VERSION, BUILD_TIME, and GIT_SHA normalization. Its remaining target-added size occurrence is the authored stat-result destructure and size guard already present in the exact recovered source declaration. This is a direct static source-owner proof and requires no replay.',
        },
        {
          id: 'target118-away-summary-runtime-owner',
          path:
            'recovery/test/recovery-2.1.118-away-summary-runtime-owner-proof.json',
          sha256:
            '40bdd4a8b7fe235b3a18e13b729a24746b9832bc7f0cc61bc84ba1ebde0e4d4c',
          units: 1,
          residues: 5,
          fixtureSummaryResidueField: 'strictResidues',
          targetIndicesSha256:
            '8ac8ebe3fcfb64dee6abbf02d0fdeceddbce434a86ddb915513843e4911a3aaa',
          residueIdentitiesSha256:
            '671fb790f0c073744e35479af8d35d11baeee6a8658999529fca9c9013761840',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-owner-override-static',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 1,
          correctedScannerResidues: 4,
          correctedScannerResidueIdentitiesSha256:
            'b772387d52b9b5ff9b4f575093c5bc792185b4f0b1b3cd1f3320b25e61c036a9',
          correctedBehavior:
            'The complete authenticated Target118 useAwaySummary unit is its Target117 predecessor with exactly the away-summary result contract changed from a nullable string to the discriminated {kind,text} result. The min and force residues are retained predecessor occurrences; the ok residue is the exact live result guard, and the paired text read feeds the unchanged recap formatting and insertion flow. Exact Target118 and later source snapshots authenticate src/hooks/useAwaySummary.ts as the owner, while their incompatible surrounding cache/fork graphs make this a static whole-unit proof rather than a source replay.',
        },
        {
          id: 'target118-repl-runtime-owner',
          path: 'recovery/test/recovery-2.1.118-repl-runtime-owner-proof.json',
          sha256:
            '1ee4a0c9a5dccc0e7198bb383007d913b9cca822b6f9128bcde7e01952b96fc9',
          units: 1,
          residues: 18,
          fixtureSummaryResidueField: 'strictResidues',
          targetIndicesSha256:
            '5277125b2c4d4e51203d4ea89852d1d8677fc5446551c76a4e7c9588e1fdf63f',
          residueIdentitiesSha256:
            'fd0ea7bc393fb7e03d7df1d902d647c95b5c7d32f82690e1e15ded4ac04c482c',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-owner-override-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The complete authenticated Target118 REPL unit evolves the already-proved Target117 REPL through one exact twenty-hunk normalized transition. Its retained debounce cancel, background-ID reducer, session dirname, transcript focus/capture, preventDefault, handler, and tabIndex rows remain inside the same complete unit, while the new ccr-api/local-jsonl transcript-source effect is the only strict-value family added within the unit. Exact historical REPL declarations authenticate the owner, but no recovered source generation contains this complete runtime tuple, so the lane is admitted statically without a partial replay.',
        },
        {
          id: 'target118-bedrock-model-probe-owner',
          path:
            'recovery/test/recovery-2.1.118-bedrock-model-probe-owner-proof.json',
          sha256:
            'a98bbbe597654b365fb7a14df485e5d6ffa44c8f5bf7c4ee96c2f4699443192d',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            'd38a4f654ad8ec87ee09cef1b428718ec7c4cc6e62e7452925b7375d366f5ce8',
          residueIdentitiesSha256:
            'd9c817952b8e1fc6ed5675cbe6c4ba9324b78d9fc74fffa4cd440da5f39eb040',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'none',
          correctedBehavior:
            'The authenticated Target118 function is the exact compiled probeBedrockModel contract: it constructs an AnthropicBedrock client with the tier-specific region, zero retries, an eight-second timeout, proxy fetch options, bearer-token or refreshed AWS credentials, then treats a successful one-token probe or HTTP 429 as model availability. The Target117 predecessor is alpha-equivalent and the exact Target118 source declaration contains the complete contract. The positional ClaudeInChromeOnboarding attribution contains neither this client construction nor the probe flow.',
        },
        {
          id: 'target118-vertex-model-probe-owner',
          path:
            'recovery/test/recovery-2.1.118-vertex-model-probe-owner-proof.json',
          sha256:
            '4ae5750a69bbe62f01997e152bc7341e6753dc67968974f4c787df87da296301',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '722dbccb5bc15f455c7cc463169df31aa42d9b426345789cac1585ad20910715',
          residueIdentitiesSha256:
            '965c23a3278f3460617c6652f546cc9def06c29f3d36f6a439e5d72d3541423b',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'none',
          correctedBehavior:
            'The authenticated Target118 function is the exact compiled probeVertexModel contract: it resolves Vertex and proxy modules, refreshes or skips GCP authentication, derives project credentials, constructs an AnthropicVertex client with the model region, zero retries and an eight-second timeout, then treats a successful one-token probe or HTTP 429 as model availability. The Target117 predecessor is alpha-equivalent and the exact Target118 source declaration contains the complete contract. The positional ClaudeInChromeOnboarding attribution contains neither this client construction nor the probe flow.',
        },
        {
          id: 'target118-setup-proxy-auth-scope-owner',
          path:
            'recovery/test/recovery-2.1.118-setup-proxy-auth-scope-owner-proof.json',
          sha256:
            'de432e5399829807c3e10e5df40b8692fefe57a55f1291e169ab44afa9cdfdc0',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '67ded1d21c53d6cdd7efd15039b9065477e3b27111ac5937faeb70fa78194992',
          residueIdentitiesSha256:
            'd15e741185932c6ffe8e1883e2900321fb6308d997affb606ff0b647c40e6a07',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The complete Target117 and Target118 setup units are alpha-equivalent and both classify the selected proxyAuthHelper as project-or-local by comparing it against the projectSettings and localSettings scopes before recording trust. The sole strict projectSettings row is therefore a retained whole-unit occurrence shift, not new Target118 behavior. Historical setup.ts authenticates the surrounding startup owner but omits this compiled proxy-helper fragment, so the proof remains static and does not authorize a partial replay.',
        },
        {
          id: 'target118-query-engine-inherited-class-owner',
          path:
            'recovery/test/recovery-2.1.118-query-engine-inherited-class-owner-proof.json',
          sha256:
            '72c556be80d3e08d46a97936a89a9bf8d25b04c1bcd6e9045e46afe9c3aa5e57',
          units: 1,
          residues: 16,
          targetIndicesSha256:
            '318caecde8180fa49cd5eec7248e5382cffdd8fb67ba908420cd4b48154f2e90',
          residueIdentitiesSha256:
            'ac83f803f7c4ece5d539230e02399319a0c83d70688774860fbe78b8e4d5ec6f',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The complete authenticated Target117 QueryEngine class canonical token stream is an exact subsequence of the complete Target118 class. Every one of the sixteen strict Target118 residues maps deterministically to an exact raw-equal Target117 predecessor token inside an identical seventeen-token canonical neighborhood. The exact historical Target118 QueryEngine source and packaged source pin the sole class declaration boundary. These rows are inherited whole-class occurrences, not new Target118 behavior, and the proof authorizes no source replay.',
        },
        {
          id: 'target118-headless-classifier-dce-owner',
          path:
            'recovery/test/recovery-2.1.118-headless-classifier-dce-owner-proof.json',
          sha256:
            'd60f81b79878832ad774b7b83be6f51e85398021eba785b4a87ec2a5019b6a2c',
          units: 1,
          residues: 3,
          targetIndicesSha256:
            '5aa60d3942e2a0c35d2459ba9c82150f156c94a52fea3c59c93b4e9e1eb45347',
          residueIdentitiesSha256:
            '7dd7b44677f24a49aa056832186c371085dad7f10a044392ba5139be289b9226',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'headless-classifier-dce-static',
          fixtureSummaryMode: 'residues-section',
          scannerResidualMode: 'all-explicit-residues',
          correctedEvidenceIds: [
            'target118-headless-classifier-dce-authenticated-units',
            'target118-headless-classifier-dce-transition-proof',
            'target118-headless-classifier-dce-null-binding-proof',
            'target118-headless-classifier-dce-source-boundary',
          ],
          correctedBehavior:
            'The complete Target117 and Target118 runHeadless units differ only at the permission-prompt classifier expression. Target117 calls its live post-turn classifier directly; Target118 replaces that expression with an optional access through a module binding initialized to null and never assigned, so the expression is a no-op. Removing only that expression makes both complete units alpha-identical. The startup tengu_timer event and durationMs properties are exact retained syntax in both units, while the historical and packaged Target118 print.ts declaration already implements the resulting notify-only callback. The runClassifierSummaryForBlocked property is therefore compiler-retained dead structure, not a source gap or authorization to restore the removed classifier implementation.',
        },
        {
          id: 'target118-headless-streaming-inherited-owner',
          path:
            'recovery/test/recovery-2.1.118-headless-streaming-inherited-owner-proof.json',
          sha256:
            '56835ff48de8d98385d3d38e9ccf5f497c6b18c6aa4fd9fc8502fafa21059c2d',
          units: 1,
          residues: 12,
          targetIndicesSha256:
            '732425a9e5e17f86d44645f1eaea005e1b5b42a1545091307e8df014119d70c9',
          residueIdentitiesSha256:
            'c67426e0d9db041e85eae63850c27cd108f9850d4009aa0a18260d3ab55291a4',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The complete authenticated Target117 and Target118 runHeadlessStreaming function units establish the same implementation boundary. Every one of the twelve Target118 added-owner residues maps to one unique raw-equal Target117 predecessor token inside an identical sixty-one-token canonical neighborhood, including both 30000 literals and the later taskRegistry and surface occurrences. The frozen Target117 whole-unit proof independently authenticates the retained taskRegistry and launched-replay graph. Exact historical and packaged Target118 print.ts declarations omit that retained graph, so these rows are inherited compiled-function occurrences, not new Target118 source behavior, and this proof authorizes no source replay.',
        },
        {
          id: 'target118-load-initial-messages-inherited-owner',
          path:
            'recovery/test/recovery-2.1.118-load-initial-messages-inherited-owner-proof.json',
          sha256:
            'd68ccca0aee0e90a9b8d41b89c44ecccdd72c1a840ce875b60662fb995dae7ac',
          units: 1,
          residues: 4,
          targetIndicesSha256:
            '666ba740d3790f1a2b5c569872a2f5d455d7eae8d4e3e188b510f83d8aff7601',
          residueIdentitiesSha256:
            '8bb0e2330f4eddd3fbca060b46881dd0ca9c111bd52ce085188f80132ab980d2',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-direct',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The complete authenticated Target118 loadInitialMessages canonical token stream is an exact subsequence of Target117, deleting only the seven-token post_turn_summary callback call. Each of the four strict dirname, modified, accessToken, and dirname tokens maps to an exact raw-equal Target117 predecessor inside an identical seventeen-token canonical neighborhood. The Target117 and Target118 historical source declarations are byte-identical, and the packaged declaration remains exact after unrelated case supplements. These are inherited whole-function rows, not new Target118 behavior, and the proof authorizes no replay.',
        },
        {
          id: 'target118-mcp-entrypoint-build-context-owner',
          path:
            'recovery/test/recovery-2.1.118-mcp-entrypoint-build-context-owner-proof.json',
          sha256:
            'db0c0eaaed4a510f61e0b14283890f1e5130c22f28db35248eb8081ee9a05150',
          units: 1,
          residues: 7,
          targetIndicesSha256:
            '19dda97bf69f4c67420c0826c51dc6dcd02d65e515d409874f80613f50568ba2',
          residueIdentitiesSha256:
            'ec4f47bdcef6b32ae07200c25e81d414ec300ea09b51db59d9ad5fa81e83583c',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-owner-override-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The complete authenticated Target117 and Target118 MCP entrypoint units have identical 679-token canonical streams after normalizing only the exact VERSION, BUILD_TIME, and GIT_SHA macro values. The remaining four strict arguments, numeric-one, taskRegistry, and agentLifecycle rows are raw-equal same-index predecessor tokens in identical seventeen-token neighborhoods. The exact historical source transition adds only the already-authenticated setReplContext no-op to startMCPServer, and the packaged declaration is the exact Target118 postimage. This is a whole-unit static/source proof and authorizes no replay.',
        },
        {
          id: 'target118-update-entrypoint-owner',
          path:
            'recovery/test/recovery-2.1.118-update-entrypoint-owner-proof.json',
          sha256:
            'a82d899f0dd030b08ba21b23f4e588ccfdba43a05889665f9921a519d33428a8',
          units: 1,
          residues: 72,
          targetIndicesSha256:
            'a0ee8d78644b18b8ce5a36d48d3d88183d926de3011f7f8f492b92bf9e39df25',
          residueIdentitiesSha256:
            'f5a641850cc9f12102c01e3d5e93bee78e659bb152deb6896ac42a142a8c9e79',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-owner-override-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The complete authenticated Target118 update unit is the complete Target117 unit plus exactly two canonical token insertions: the DISABLE_UPDATES administrator guard and the Homebrew claude-code@latest tip. Exact historical source proves those two declaration additions and the sole supporting isEnvTruthy import. All sixty-nine release-metadata rows are the exact twenty-three VERSION, BUILD_TIME, and GIT_SHA transitions, while catch and both dot rows map to raw-equal Target117 predecessor tokens in identical seventeen-token canonical neighborhoods. This is a whole-unit static/source proof and authorizes no replay.',
        },
        {
          id: 'target118-main-entrypoint-inherited-owner',
          path:
            'recovery/test/recovery-2.1.118-main-entrypoint-inherited-owner-proof.json',
          sha256:
            '755ae14e868d04ca4a84c73e5f24c2353c3fcc4a15564f343cf229110e3e71d4',
          units: 1,
          residues: 23,
          targetIndicesSha256:
            '76a22a7cdfe7aeee4676cfb50bef58c7503f10f46253327a92af72f136fbafa8',
          residueIdentitiesSha256:
            '3c6e1c185f252ea9ba3db7fbdb3ab3996e3bb3f40fc5ed64828e2274e8701174',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-target-unit-owner-override-static',
          scannerResidualMode: 'source-replay-state',
          correctedRawScannerUnits: 1,
          correctedRawScannerResidues: 24,
          correctedRawScannerResidueIdentitiesSha256:
            'ce946a193e2bf07426e260f21eb3e77d655cb919fb09c5fdee37c17bfa7758dc',
          correctedPackageScannerUnits: 1,
          correctedPackageScannerResidues: 23,
          correctedPackageScannerResidueIdentitiesSha256:
            'a6a0534b445b15b52ea43b547c43b5229c3a9cb36230f5aeef1156219b8d1c61',
          correctedBehavior:
            'The complete authenticated Target117 and Target118 run entrypoint units establish the same implementation boundary. Sixteen Target118 added-owner rows map to unique raw-equal Target117 predecessor tokens in identical sixty-one-token canonical neighborhoods, and six more map identically after normalizing the two exact VERSION, BUILD_TIME, and GIT_SHA macro objects. The sole remaining pluginTagHandler row belongs to the exact authenticated Target118 plugin-tag command source transition, which dynamically imports pluginTagHandler and createSubcommandRoot and invokes them together. Exact historical and packaged run declarations pin the source boundary. This is a complete-unit static/source proof and authorizes no replay.',
        },
      ],
      semanticCorrectionEvidenceUpdates: [
        {
          targetIndex: 20566,
          evidenceIds: [
            'target118-schedule-one-off-gate-target-fragment',
            'target118-schedule-one-off-gate-source-replay-test',
          ],
        },
      ],
      dceCorrectionGroups: [
        {
          id: 'target118-session-kind-dce',
          path: 'recovery/test/recovery-2.1.118-session-kind-dce.json',
          sha256:
            'c60384e1b00c1323f39e61b852457fec15f70aacd95575f0b6b7e35a98a6a54d',
          targetIndex: 6497,
        },
      ],
      skipSourceSupplementResidual: true,
    },
  ],
  [
    '2.1.118-to-2.1.119',
    {
      // The frozen analysis fixture authenticates the pre-evolution proof fixtures.
      // Their live revisions bind the current analysis descriptor, so select those
      // revisions here without introducing a circular content-address dependency.
      proofCorrectionGroupUpdates: [
        {
          id: 'target119-transitive-owner',
          sha256:
            '3fd537eed06c94efd3db184f7b5c95d93de158239c5f7f40068f955eed9bf4f3',
        },
        {
          id: 'target119-binding-owner',
          sha256:
            'b78e748c8878f45d0babdd602940bada7657a5b9c028df2894591ac46213ef43',
        },
        {
          id: 'target119-daemon-cluster',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 115,
          correctedScannerResidues: 866,
          correctedScannerResidueIdentitiesSha256:
            '1f5773200db7ff3673a190f88e3840083c9ebca533554e49bc22d1a55c6923b3',
        },
      ],
      proofCorrectionGroups: [
        {
          id: 'target119-nondaemon-static-owner',
          path: 'recovery/test/recovery-2.1.119-nondaemon-static-owner-proofs.json',
          sha256:
            '818bc4c000183a866dbab92b7fdd7f8c6bff53603f4d5171b7516c94715bc2bd',
          units: 24,
          residues: 527,
          targetIndicesSha256:
            '6ea9e203e133016bd69f888f6677abda53b94e02268d38cca553997e7937ac81',
          residueIdentitiesSha256:
            '80835220e05e3775cd0e126a384e77383f52f37e06c9a98dec0ae032a766cbaf',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 18,
          correctedScannerResidues: 387,
          correctedScannerResidueIdentitiesSha256:
            '9843ed93e6d661b58b31ca88734a0b6672949770198f38a97d861de1ee285dd0',
        },
        {
          id: 'target119-direct-declaration-owner',
          path:
            'recovery/test/recovery-2.1.119-direct-declaration-owner-proofs.json',
          sha256:
            'a65c6f99fb8dd77d547cc1984062a89c312d92ca0f5e88c2cf05ee1e7093daac',
          units: 3,
          residues: 51,
          targetIndicesSha256:
            '104ac9286f768585d97b4de28ed04f13bc9f959e16944fbd832bc7168292c569',
          residueIdentitiesSha256:
            'e377afdd4d2ed9a8b4aa693f3004d896146f0bd534aa3725277ed88af23f3ebc',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'fixture-retained-residues',
        },
        {
          id: 'target119-bootstrap-additional-model-costs',
          path:
            'recovery/test/recovery-2.1.119-bootstrap-additional-model-costs-source-gap.json',
          sha256:
            '4dcd5bc3119d85076aaa8b58d220b7db73392030c41bf52fd3ef3d1af2f4f064',
          units: 1,
          residues: 11,
          targetIndicesSha256:
            '8c3e78f3e368a7cdaced706b949ec90bac5adbdefd60dc930bcf1d6b56122982',
          residueIdentitiesSha256:
            'c0a69e69d4d315bcd887b6ec0265039cc95be19a7aa79bae1186688af7afec79',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          residueEncoding: 'tuple-without-target-index',
          fixtureShape: 'single-source-replay',
          scannerResidualMode: 'source-replay-state',
        },
        {
          id: 'target119-later-donor-runtime',
          path:
            'recovery/test/recovery-2.1.119-later-donor-runtime-source-gaps.json',
          sha256:
            'c38161dce98a7a5e91a167e6a6300c1f50d6e47816d52b2b13f45a8cdf8a1a0c',
          units: 3,
          residues: 3,
          targetIndicesSha256:
            '6886bc68331582c83321d459f0dd946a96b70259a6f641edf4182e6be448801f',
          residueIdentitiesSha256:
            'f9c05067c9ea3808543954a1e367b10744378480a7bc2d1772bf2a7d55fbea1b',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'source-replay-state',
        },
        {
          id: 'target119-pro-trial-start-owner',
          path:
            'recovery/test/recovery-2.1.119-pro-trial-start-owner-proofs.json',
          sha256:
            '8aa44d898e96ae92bf0924c87d35310ad950186af43b1e17390dc33c04bf8f36',
          modulePath:
            'recovery/cases/2.1.118-to-2.1.119/recovered/pro-trial-start-owner-overrides.mjs',
          moduleSha256:
            '930312d39aea18506bc372a131629c6912ce008bfe15e5896154563c271550a6',
          testPath:
            'recovery/test/recovery-2.1.119-pro-trial-start-owner-proofs.test.mjs',
          testSha256:
            'f16f84cfaccb31a3a4b34b2b42a9c8772bbc8c21b932e866888d8205aebe9759',
          overrideRows: TARGET119_PRO_TRIAL_START_OWNER_OVERRIDES,
          units: 3,
          residues: 50,
          unsupportedResidues: 46,
          targetIndicesSha256:
            'e31c3f0a7f314fc259e920637bd694b2ffb195c409965fe5ed8e9092f9b9783a',
          mappingDigestSha256:
            '7257afc75863523e3e6c46f3ce33465eb113b38a5c36a8fe6cc562bb4168d945',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'imported-owner-override',
          scannerResidualMode: 'pinned-raw-package-subset',
          analysisNeutralRows: [
            {
              targetIndex: 21280,
              provisionalPaths: [],
              allowEmptyProvisionalPaths: true,
            },
          ],
          provisionalCoverageRows: [
            {
              targetIndex: 21280,
              paths: [],
              disposition: 'alpha-equivalent',
              evidenceIds: [
                'readable-normalization',
                'static-semantic-noop',
              ],
              reason:
                'The complete target unit has an exact baseline token-stream match after only bundle-local identifier and generated version/build-metadata normalization; cooked literals, operators, branches, and calls are unchanged.',
            },
            {
              targetIndex: 21281,
              paths: ['src/components/ProTrialStartScreen.tsx'],
              disposition: 'source-runtime-covered',
              evidenceIds: [
                'target119-pro-trial-start-owner-target-fragment',
                'target119-pro-trial-start-owner-source-compiler-test',
              ],
              behavior:
                'The complete authenticated Target119 unit is the compiled ProTrialStartScreen declaration: its trial-start state machine, telemetry, duration copy, spinner, and success/error controls uniquely bind src/components/ProTrialStartScreen.tsx; React compiler memo-cache, JSX createElement, and JSX text normalization residues are pinned mechanical lowerings of that exact declaration.',
            },
            {
              targetIndex: 21342,
              paths: ['src/interactiveHelpers.tsx'],
              disposition: 'source-runtime-covered',
              evidenceIds: ['source-map-attribution', 'semantic-test'],
              behavior:
                'Compiled target unit is attributed to src/interactiveHelpers.tsx; its authored runtime owner and call path are present in the target semantic tree and current cumulative src/.',
            },
          ],
          rawScanner: {
            units: 3,
            residues: 59,
            residueIdentitiesSha256:
              '96984db9641d20711853454bfced6d3c633f30d57e30f99abce48a0eb83a550e',
          },
          packageScanner: {
            units: 3,
            residues: 59,
            residueIdentitiesSha256:
              '96984db9641d20711853454bfced6d3c633f30d57e30f99abce48a0eb83a550e',
          },
        },
        {
          id: 'target119-sdk-rate-limit-fetch-error',
          path:
            'recovery/test/recovery-2.1.119-sdk-rate-limit-fetch-error-source-gap.json',
          sha256:
            'd8cef29f92fef05f01c580d3db721f6caeac7cff5bde9e47712a6e3f3564e51d',
          units: 2,
          residues: 22,
          targetIndicesSha256:
            'a9e5b0e79679b8b0141e526169349c7248cc4832ca03def146c47f66f230a288',
          residueIdentitiesSha256:
            '76c912dfc14cdb4864a13bdd74226dd861e2ccd2f5be52e7e3d478d1b5f26fbf',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'source-replay-state',
          correctedRawScannerUnits: 2,
          correctedRawScannerResidues: 2,
          correctedRawScannerResidueIdentitiesSha256:
            '356dc9ce5365a656bc2d9d3fc8d8b176e89746f0e49dfd633b583fb8141a47ec',
        },
        {
          id: 'target119-secondary-static-owner',
          path:
            'recovery/test/recovery-2.1.119-secondary-static-owner-proofs.json',
          sha256:
            '0097c23f8eac1d0597c5e8f8c69736adf61cfd64ea94871c26c5a30a1397b58e',
          units: 7,
          residues: 10,
          targetIndicesSha256:
            '86028c35859ad0645fe09f8a3f21d42c39b7dc5abecdf8d5ee5935f90927b4fb',
          residueIdentitiesSha256:
            '13bde77d75a68971e11998a1dc6a7800839d42b08fa5cf0f25681c110faa39d3',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'all-explicit-residues',
        },
        {
          id: 'target119-uds-client-owner',
          path:
            'recovery/test/recovery-2.1.119-uds-client-owner-proofs.json',
          sha256:
            '10a79af5c7a50f230e5905c7d644e5514754ed9e30f315d0388b4a37378972da',
          units: 3,
          residues: 4,
          targetIndicesSha256:
            '7e021b4a203aa49d61b40cc235d3ddacf0cdc5eef4af2a2e68e8a0d69e457a09',
          residueIdentitiesSha256:
            '64f9678a2333ec049f8ffb9436cb8ef1453b85d1d8ada3778af876eff7c861d6',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'none',
        },
        {
          id: 'target119-uds-registry',
          path:
            'recovery/test/recovery-2.1.119-uds-registry-source-gap.json',
          sha256:
            '70b9bc56d9c2a4efef2bb5e04c2de1b5e34a95b5cbd82f36e5f0c5c113247fc9',
          units: 1,
          residues: 18,
          targetIndicesSha256:
            'b7e37458c2ae5f09c5e13619f7fb76b3621beef147181199947981453dbe09fe',
          residueIdentitiesSha256:
            '2cf15bc8f2bcfe781acf43d43b91380e80586777200ee430ead752505f54617a',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'source-replay-state',
          correctedRawScannerUnits: 1,
          correctedRawScannerResidues: 1,
          correctedRawScannerResidueIdentitiesSha256:
            'b947110b55794769eddf9c28b6e2dbe28cb25b4cadc6a175ee52760e234d7e1a',
        },
        {
          id: 'target119-tertiary-declaration-owner',
          path:
            'recovery/test/recovery-2.1.119-tertiary-declaration-owner-proofs.json',
          sha256:
            '1846c61ce847f5a29a03d6c7e5a2141e264535bfaa36b3935b0de1cdfc567967',
          units: 6,
          residues: 9,
          targetIndicesSha256:
            'bb484709ce512d20e80316346fefe42017b36b5be6802a8311deae8788a6e338',
          residueIdentitiesSha256:
            '0475138acce33e2532be134ffa8bb6053c00e2aa656f7abddaf80a06148e0d0e',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'none',
        },
        {
          id: 'target119-push-notification-config',
          path:
            'recovery/test/recovery-2.1.119-push-notification-config-source-gap.json',
          sha256:
            '3f06329aab18fabb2483a28eeb9a95fb478ce638c0c0c65daf00bb336c665413',
          units: 2,
          residues: 2,
          targetIndicesSha256:
            '955ac8fdabe3a7c6abb2b598c5fe0f205c509b4e851b10bc8acd9035bcc8d541',
          residueIdentitiesSha256:
            'c9dc78843bd16509746d369d204c0b4193c8b8248442d88a97d807b5ed14497e',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'source-replay-state',
          correctedRawScannerUnits: 2,
          correctedRawScannerResidues: 2,
          correctedRawScannerResidueIdentitiesSha256:
            'c9dc78843bd16509746d369d204c0b4193c8b8248442d88a97d807b5ed14497e',
        },
        {
          id: 'target119-entrypoint-routing',
          path:
            'recovery/test/recovery-2.1.119-entrypoint-routing-source-gap.json',
          sha256:
            '1a2934071c662ca56f20a21955b5f0318a8c6aab7088beb606f0c912ed895d5a',
          units: 2,
          residues: 3,
          targetIndicesSha256:
            'd6febe218e11b6cffa64bb8ba3ac830d77480649ec0b9fd8d81846df602acf00',
          residueIdentitiesSha256:
            '0617898ffb1923cb965b27fc7dff33507cff4ef63c5f56786d1c2fa24d55de4a',
          fixtureResidueIdentitiesSha256:
            '0617898ffb1923cb965b27fc7dff33507cff4ef63c5f56786d1c2fa24d55de4a',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'entrypoint-source-replay',
          scannerResidualMode: 'source-replay-state',
        },
        {
          id: 'target119-first-prompt-entry-owner',
          path:
            'recovery/test/recovery-2.1.119-first-prompt-entry-owner-proof.json',
          sha256:
            'b6dc954a0b299e60b73142c6a54222f66b14e44b33c28b68b92ce55f4fcad489',
          units: 1,
          residues: 3,
          targetIndicesSha256:
            '3809cd4ff30eb897cba300a7a67eec4ffe45adff7be6f6fc7bf04df9ae0c2ca3',
          residueIdentitiesSha256:
            'a21369ca2c308a0c9ac3584d4f564b2b84801ee8ff82af9ca0163e97c998f1df',
          fixtureResidueIdentitiesSha256:
            'a21369ca2c308a0c9ac3584d4f564b2b84801ee8ff82af9ca0163e97c998f1df',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'single-row-static',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 1,
          correctedScannerResidues: 2,
          correctedScannerResidueIdentitiesSha256:
            '829b4f7f000a702b3741ffc9a2a067dde23cd7fd01a0e3bd0fa3e815d974ec7f',
          correctedBehavior:
            'The authenticated Target119 entry parser records the first slash-command name as commandFallback, returns normalized bash input before the generic XML skip, rejects meta/compact/tool-result content, and truncates the first ordinary prompt; the sole historical source declaration with the complete state-and-regexp surface is extractFirstPromptFromHead in src/utils/sessionStoragePortable.ts, while the prior windowsPaths attribution is unrelated.',
        },
        {
          id: 'target119-default-branch-owner',
          path:
            'recovery/test/recovery-2.1.119-default-branch-owner-proof.json',
          sha256:
            'd79ea95aa3bfc0c37d2fc47386955e954f142e43489fe09d14a91cdeedef7690',
          units: 1,
          residues: 3,
          targetIndicesSha256:
            '60c5070b615f63da09d4a994bfa2b2b3059909cfef98b691e5a185e731d5939d',
          residueIdentitiesSha256:
            '5fc67bfab58bb5738cc90ccb5c7ccf0b393db289a281f87ded131b23fe953851',
          fixtureResidueIdentitiesSha256:
            '5fc67bfab58bb5738cc90ccb5c7ccf0b393db289a281f87ded131b23fe953851',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'single-row-static',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 1,
          correctedScannerResidues: 2,
          correctedScannerResidueIdentitiesSha256:
            '82f5489d2be9b5a2c565943ffb567d38f73cfd57fa76a5f995ecdfd06d425185',
          correctedBehavior:
            'The authenticated Target119 default-branch resolver validates origin/HEAD, then probes main and master, and falls back to main; the recovered git.ts entry point delegates to the filesystem-backed computeDefaultBranch implementation, which preserves the same ordered symref/ref-existence semantics without spawning show-ref.',
        },
        {
          id: 'target119-datadog-event-catalog',
          path:
            'recovery/test/recovery-2.1.119-datadog-event-catalog-source-gap.json',
          sha256:
            '4bfd91af1902095e0d4a5acec54a4b31d15e6a6c3635509ffe9c7937fa618821',
          units: 1,
          residues: 30,
          targetIndicesSha256:
            '70e255675773af485a20f73b4317d8fe167bcb7633f98c231e6aa0b19552859b',
          residueIdentitiesSha256:
            '70f9720e33f5f7cb0d66094f26b95509c2bdb04b0d3e5ad3e544cfa3113788da',
          fixtureResidueIdentitiesSha256:
            '70f9720e33f5f7cb0d66094f26b95509c2bdb04b0d3e5ad3e544cfa3113788da',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'target-only',
          fixtureShape: 'strict-row-target-only-source-replay',
          scannerResidualMode: 'source-replay-state',
          correctedBehavior:
            'The authenticated Target119 Datadog initializer owns the complete 85-event allowlist and 19-field searchable-tag catalog. The bounded replay restores the exact background-agent and daemon lifecycle event surface while preserving the live trackDatadogEvent allowlist and tag-selection consumers.',
        },
        {
          id: 'target119-slate-meadow-background-agent',
          path:
            'recovery/test/recovery-2.1.119-slate-meadow-background-agent-source-gap.json',
          sha256:
            '7dd83ff34c2a42affc66c2fee0a294638282762167d2829970d0f2a9841be59e',
          units: 1,
          residues: 2,
          targetIndicesSha256:
            '61644b3a3e3fe9c42adf602a3e574b2f527d52e50a05ae30288d98b3846d1a83',
          residueIdentitiesSha256:
            'b27f7bcfdf3a105ae2aa2ac43060b656d49b57b9c83afaf329a2add0be77e838',
          fixtureResidueIdentitiesSha256:
            'b27f7bcfdf3a105ae2aa2ac43060b656d49b57b9c83afaf329a2add0be77e838',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'target-only',
          fixtureShape: 'owner-override-target-only-source-replay',
          scannerResidualMode: 'source-replay-state',
          correctedPackageScannerUnits: 1,
          correctedPackageScannerResidues: 1,
          correctedPackageScannerResidueIdentitiesSha256:
            '0948b151f180801cdef7b7bf0e04ff85bd4d32ce0cf0906f74c9843c82ea21de',
          correctedBehavior:
            'Target119 getBuiltInAgents conditionally inserts the retained authenticated background-job agent when tengu_slate_meadow is enabled. The replay reuses the exact Target117 generated-source postimage and adds only the Target119 import and feature-gated list insertion.',
        },
        {
          id: 'target119-graceful-shutdown-output-errors',
          path:
            'recovery/test/recovery-2.1.119-graceful-shutdown-output-errors-source-gap.json',
          sha256:
            '833cada36204e6a6c4155e2da249d5391af0ef9d3e8af19e6e9c9b0e22c6fdf5',
          units: 1,
          residues: 2,
          targetIndicesSha256:
            '40e44bf9e98127cc410dfdc58d12729013bf65bacc4ff02d75a1d2ad29c40a96',
          residueIdentitiesSha256:
            '9f3e6f512ca353d1541454f146347888de1ad5b9bf8527cda0811157ba44f0d9',
          fixtureResidueIdentitiesSha256:
            '9f3e6f512ca353d1541454f146347888de1ad5b9bf8527cda0811157ba44f0d9',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'target-only',
          fixtureShape: 'owner-override-target-only-source-replay',
          scannerResidualMode: 'source-replay-state',
          correctedBehavior:
            'The authenticated Target119 shutdown initializer ignores SIGHUP for daemon-backed sessions and centralizes EPIPE/EIO output handling. An interactive stdout loss is logged as stdout_<code> and initiates graceful shutdown; stderr loss and non-interactive stdout loss only destroy the failed stream.',
        },
        {
          id: 'target119-read-only-exact-ip-owner',
          path:
            'recovery/test/recovery-2.1.119-read-only-exact-ip-owner-proof.json',
          sha256:
            '204c83db5e4f0f5f1dee70492de53ae93ecadfd28e0d31f334356d2ae3e10d6f',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '96b35bc06cf7faf7debc6bfd202d3062581fbf407a791281b12c34e879b4841d',
          residueIdentitiesSha256:
            '8aad740417e1a7bac6e6ef3c92d918f966fb08ed1b38290ac9e9f374c7e3f91d',
          fixtureResidueIdentitiesSha256:
            '8aad740417e1a7bac6e6ef3c92d918f966fb08ed1b38290ac9e9f374c7e3f91d',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'single-row-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The complete Target119 read-only validation initializer is alpha-equivalent to its uniquely paired Target118 predecessor and retains both the exact ["ip", "addr"] argv tuple and /^ip addr$/ source-owned allowlist guard; the apparent seventh "ip" occurrence is bundle occurrence drift, not a new runtime behavior or source gap.',
        },
        {
          id: 'target119-pr-url-helper-dedup-owner',
          path:
            'recovery/test/recovery-2.1.119-pr-url-helper-dedup-owner-proof.json',
          sha256:
            '08341b95f74207c144803fa905b80285f5b33acab4c8cd4fa2c970c3d27d71e4',
          units: 2,
          residues: 7,
          targetIndicesSha256:
            'a7f6fcf6c1b5dfc080b7a2ce247d12c030b5636b134fb15a621c8f83585b7f0c',
          residueIdentitiesSha256:
            'b808c659e2fb7ecd87ec6c381653425a858648067f6932667b0a3fa19f253a09',
          fixtureResidueIdentitiesSha256:
            'b808c659e2fb7ecd87ec6c381653425a858648067f6932667b0a3fa19f253a09',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'multi-index-single-row-static',
          scannerResidualMode: 'none',
          correctedBehavior:
            'The Target119 bundle coalesces the duplicate PR URL parser/template helpers shared by utils/prStatus and PrBadge into one exact runtime binding: its prStatus initializer owns the canonical regex and its PrBadge consumer calls the same formatter. Both recovered TypeScript declaration pairs are admitted together, never as competing sole-owner claims.',
        },
        {
          id: 'target119-consolidation-prompt-template-owner',
          path:
            'recovery/test/recovery-2.1.119-consolidation-prompt-template-owner-proof.json',
          sha256:
            '6f42e4d8e4100fde9378530a1495a50ecfe5c0b8a02dd1de5d27f10ad77307ca',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '5a7c7448d110c9509571b80f139f6fc86b2778572a06fff3721836053b5cf939',
          residueIdentitiesSha256:
            'cdfd10610515da78200acdd928d0f6eb8d212edc700171d4f5544bb9ddbba5f0',
          fixtureResidueIdentitiesSha256:
            'cdfd10610515da78200acdd928d0f6eb8d212edc700171d4f5544bb9ddbba5f0',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'single-row-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The apparent Target119-only consolidation summary is byte-identical to a suffix already present in the authenticated Target118 template. Target119 inserts the RECONCILE_MEMORIES_AGAINST_CLAUDE_MD expression immediately before it, splitting the compiled template quasi without adding the summary text; the exact Target119 TypeScript template and authenticated disabled build helpers produce the same runtime prompt.',
        },
        {
          id: 'target119-team-file-lock-options-owner',
          path:
            'recovery/test/recovery-2.1.119-team-file-lock-options-owner-proof.json',
          sha256:
            '9118f6577b32e1d9b801c2c68d2e2ebec0645ea09ef51fb3d30f943a9365d936',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            'b7cfb8cd70f7025f64dc4b79c486c30c9589300bb34732e26a724523f4aabf2b',
          residueIdentitiesSha256:
            'de053aa573c0903500eb47f152e0c3dacdbef4c32f736cb8816087e9915742ab',
          fixtureResidueIdentitiesSha256:
            'de053aa573c0903500eb47f152e0c3dacdbef4c32f736cb8816087e9915742ab',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'single-row-static',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The complete Target119 teamHelpers initializer retains the Target118 team-file retry policy and adds exactly a no-op onCompromised callback. Matched updateTeamFile and removeTeamMember units consume the same options binding, while the current authored tree is pinned as stale; this is a whole-unit temporal proof and never a partial source replay.',
        },
        {
          id: 'target119-mcp-terminal-error-boundary',
          path:
            'recovery/test/recovery-2.1.119-mcp-terminal-error-boundary-source-gap.json',
          sha256:
            'e14a914b38424036d3b50bc15a1187a4bd923f6e00ea6511ec4a5eb183e6e9d2',
          units: 1,
          residues: 1,
          targetIndicesSha256:
            '2d89e6adac5fbfb5821189af191ab8812bc26fb7da6047c1e2ed50992667eaaa',
          residueIdentitiesSha256:
            '2e0545a7f45d0b0e755ccab368bfb9beb0facc5bd947ed0c1b274029ec61a754',
          fixtureResidueIdentitiesSha256:
            '2e0545a7f45d0b0e755ccab368bfb9beb0facc5bd947ed0c1b274029ec61a754',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'target-only',
          fixtureShape: 'single-target-unit-target-only-source-replay',
          scannerResidualMode: 'source-replay-state',
          correctedPaths: ['src/services/mcp/client.ts'],
          correctedEvidenceIds: [
            'target119-mcp-terminal-error-boundary-target-fragment',
            'target119-mcp-terminal-error-boundary-source-replay-test',
            'target119-mcp-terminal-error-boundary-source-ast-test',
          ],
          correctedBehavior:
            'The authenticated Target119 MCP terminal-error predicate treats AbortError as terminal and recognizes terminated only as a complete word, alongside the retained socket, timeout, and SSE reconnect errors. The bounded replay updates the local predicate and its sole Error-valued caller atomically.',
        },
        {
          id: 'target119-parked-agent-lifecycle-owner',
          path:
            'recovery/test/recovery-2.1.119-parked-agent-lifecycle-owner-proof.json',
          sha256:
            '79896bbab13bfe766a06734ade40a9d1cb224a6029f566711c6afad86e1cdd10',
          units: 2,
          residues: 3,
          targetIndicesSha256:
            '66ec95c25d30fd25e1b76d7f1ab84bb2fb0c0d7d50929776891dd0bcece7682a',
          residueIdentitiesSha256:
            '93429159788c9be4f54660614b4ce9bb925af9123b127be85885d7487744ff8c',
          fixtureResidueIdentitiesSha256:
            '93429159788c9be4f54660614b4ce9bb925af9123b127be85885d7487744ff8c',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'all-explicit-residues',
          correctedBehavior:
            'The authenticated lifecycle classifier and parked predicate are adjacent to LocalAgentTask keepalive/eviction helpers and feed the wake-router task-notification selector. The recovered source expresses the same parked condition inline, while the two target units persist exactly through Target121; this is a static semantic owner proof and does not invent private authored helper names.',
        },
        {
          id: 'target119-agent-detail-relay-owner',
          path:
            'recovery/test/recovery-2.1.119-agent-detail-relay-owner-proofs.json',
          sha256:
            '927eefdb527015bd5a8ccab68ca408c2d16912997af6d7b96d47d59e207a0b4d',
          units: 2,
          residues: 4,
          targetIndicesSha256:
            '5333702ea43495a2cb4bb4b96efa499d09bb28fb79890a3689ab01fa49bc23b7',
          residueIdentitiesSha256:
            '060f606ccedee3812d159f5724fd29d527d2f5ed1d7750d05359a65ddb8a960d',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 2,
          correctedScannerResidues: 2,
          correctedScannerResidueIdentitiesSha256:
            '43b7908ba64f6105622fea4f961141138b98d94bffed7a302477411350e9ac8b',
          correctedBehaviors: {
            17642:
              'The AgentDetail tool renderer distinguishes wildcard, empty, valid, unavailable, and unrecognized tool sets; unavailable tools retain their warning glyph and subagent-specific label.',
            19600:
              'The upstream proxy relay owns the Node TCP createServer import; Bun lowers the authored node:net specifier to the authenticated runtime require("net") module initializer.',
          },
        },
        {
          id: 'target119-messages-readonly-skills-context',
          path:
            'recovery/test/recovery-2.1.119-messages-readonly-skills-context-source-gap.json',
          sha256:
            'aecc56fd92eb7a62db1bc47fe82aa349e649615c0e458adeb390c7d519eae6d1',
          units: 2,
          residues: 15,
          targetIndicesSha256:
            '28f0cf50689337230c610c7cc72c62f872f2c0f5397210c484d877752542834a',
          residueIdentitiesSha256:
            '36f38d373885e967cdc2ea014127f5224e62358c99b83ac183a5c1674c44a385',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'source-replay-state',
          correctedRawScannerUnits: 2,
          correctedRawScannerResidues: 3,
          correctedRawScannerResidueIdentitiesSha256:
            '66c72808e27f3a9bf03ee0e447e1b8c51764813cf1146ec8aa9e4f20067c0e98',
          correctedBehaviors: {
            15344:
              'The authenticated read-only-tool formatter labels embedded find/grep shell aliases with their Glob/Grep tool identities, preserves the ordinary tool allowlist branch, and is replayed exactly in src/utils/messages.ts.',
            15351:
              'The authenticated attachment normalizer preserves invoked-skill content after compaction while warning that the invocation and one-time setup are historical; the exact source branch and target runtime output are replayed and tested together.',
          },
        },
        {
          id: 'target119-migration-session-memory-static-owner',
          path:
            'recovery/test/recovery-2.1.119-migration-session-memory-static-owner-proofs.json',
          sha256:
            'eedc5fda052368d9410c565f35a770a0ba4f7f35bd8ab322524eb0c800bc302d',
          units: 3,
          residues: 10,
          targetIndicesSha256:
            '0e3ef3b2d5709325c5865515767cd916eb2a90ca9f73b9010d52b5757dfa7ae3',
          residueIdentitiesSha256:
            'c129d6fa32d571ee5e9b16bac6dd8e17cd798e91246c3cbaa6685d91660216a6',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 3,
          correctedScannerResidues: 3,
          correctedScannerResidueIdentitiesSha256:
            '7d15f63c01ddb3eb5fbcd930c27853df5552503b02fb9f3e4a7bd822c4797d99',
          correctedBehaviors: {
            21594:
              'The bypass-permissions migration moves the accepted flag into user settings, records telemetry, and removes the obsolete global-config property. Its sole scanner residue is an authenticated global zero-occurrence shift inside an otherwise exact paired function.',
            21605:
              'The Sonnet 1M migration owns the completion flag, persisted and in-memory model rewrites, and final config update. The prior migrateOpusToOpus1m attribution is rejected; the sole unsupported zero is a retained global occurrence shift in the exact paired target unit.',
            21676:
              'Session-memory extraction reads token usage from the last message before logging extraction telemetry. The authenticated baseline and target both compile Array.at(-1); the recovered source spells the same bounded operation as messages[messages.length - 1].',
          },
        },
        {
          id: 'target119-binary-command-validation',
          path:
            'recovery/test/recovery-2.1.119-binary-command-validation-source-gap.json',
          sha256:
            '39c276733f1a1e547125cc6fa51f3436ac758ec58c0cc2dc9c79ef61d673fabf',
          units: 1,
          residues: 3,
          targetIndicesSha256:
            'ec97bb05063dbb22aef01198a550c9ee98075e2da3018cc75ab9a7942126a06d',
          residueIdentitiesSha256:
            '4da9fb90a508453a6d78e39b5f6569005e829faa9468391c3281e326a08f5257',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'canonical',
          fixtureShape: 'single-row-static',
          scannerResidualMode: 'source-replay-state',
          correctedRawScannerUnits: 1,
          correctedRawScannerResidues: 1,
          correctedRawScannerResidueIdentitiesSha256:
            '75f19d3fe35ecf0ed5bf2e1fed7358583fafa7332bf1357118055da08fc9454c',
          correctedBehavior:
            'Binary lookup rejects unsafe command names before consulting the cache or PATH. Windows accepts drive and backslash syntax through the platform-specific pattern; Unix retains the narrower slash-safe pattern.',
        },
        {
          id: 'target119-autofix-pr-runtime-owner',
          path:
            'recovery/test/recovery-2.1.119-autofix-pr-runtime-owner-proof.json',
          sha256:
            '31be1e1d2aae70601cf733e6ca6ab5f671b9c82d31270bf32ec63113528b4b47',
          units: 2,
          residues: 18,
          targetIndicesSha256:
            '58966bcbbbced625123ea225282f636c5f3a2bd9c19789c90d042c3800109853',
          residueIdentitiesSha256:
            'c0ffc1ac77a6c243f02bd16137e557c9e400f874a0348d4020110478b0f3ccab',
          analysisPartition: 'owner-supplement-required',
          identityMode: 'target-only',
          fixtureShape: 'autofix-pr-runtime-static',
          fixtureSummaryResidueField: 'addedOwnerRows',
          scannerResidualMode: 'pinned-explicit-subset',
          correctedScannerUnits: 2,
          correctedScannerResidues: 16,
          correctedScannerResidueIdentitiesSha256:
            '6baf09378f0ad86cd0a7f523b59685e7bba57a1f71ad62d17aace178d2c05196',
        },
      ],
      postProofResidual: {
        units: 74,
        residues: 367,
        residueIdentitiesSha256:
          '48037f5fa06eccce48b6f05cc384ba2f9b614dbc97a26b099cc4c548caa5e451',
      },
      postProofSourceSupplementResidual: {
        units: 17,
        residues: 91,
        unsupportedResidues: 91,
        targetIndicesSha256:
          '11dccf82f2a5d3392b1be46e5a5fe42a8b5ec4092ef3806d2a99568a74ce3cb2',
        residueIdentitiesSha256:
          'de1eb6d354e65fbb277d5b905dbc487dce460f08171fce8b8788c0800c01aa70',
      },
      testCatalogFileUpdates: [
        {
          path:
            'recovery/test/recovery-2.1.119-adjacent-direct-evidence.test.mjs',
          bytes: 9365,
          sha256:
            '3bdcd30bcc12fbb34c080a59b713703fd96bf0fc57452cb3e3a414f8c33f78d7',
        },
        {
          path: 'recovery/test/recovery-2.1.119-background-stop.test.mjs',
          bytes: 10238,
          sha256:
            'cc3bd5076077fa26414656108c16d605f9ddc55840c79188cf066b828814823a',
        },
        {
          path:
            'recovery/test/recovery-2.1.119-hidden-tracing-remote-updater.test.mjs',
          bytes: 16646,
          sha256:
            '1197a31f69e0ffc113c5d3518be7bbfd378ca3f7970b19d2a20825625cedb237',
        },
        {
          path: 'recovery/test/recovery-2.1.119-daemon-fleet-query.test.mjs',
          bytes: 37338,
          sha256:
            '3b7b3abed447197cb79e1a9a873b4a4f8d5e476a440ef7228b2f4e075ec1e2f8',
        },
      ],
    },
  ],
])

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function readPinnedJson(descriptor, label) {
  const bytes = fs.readFileSync(path.join(repositoryRoot, descriptor.path))
  assert.equal(sha256(bytes), descriptor.sha256, `${label}: fixture SHA-256`)
  return JSON.parse(bytes)
}

function importedTarget119OwnerCorrection({
  id,
  module,
  moduleBytes,
  moduleSha256,
  proof,
  proofBytes,
  proofSha256,
  test,
  testBytes,
  testSha256,
  overrideRows,
  mapping,
  analysisNeutralRows = [],
  provisionalCoverageRows = [],
  rawScanner,
  packageScanner,
}) {
  const scannerPin = ([units, residues, residueIdentitiesSha256]) => ({
    units,
    residues,
    residueIdentitiesSha256,
  })
  return {
    id,
    path: proof,
    sha256: proofSha256,
    ...(proofBytes === undefined ? {} : { bytes: proofBytes }),
    modulePath: module,
    moduleSha256,
    ...(moduleBytes === undefined ? {} : { moduleBytes }),
    testPath: test,
    testSha256,
    ...(testBytes === undefined ? {} : { testBytes }),
    overrideRows,
    analysisNeutralRows,
    ...(provisionalCoverageRows.length > 0
      ? { provisionalCoverageRows }
      : {}),
    units: mapping[0],
    residues: mapping[1],
    unsupportedResidues: mapping[2],
    targetIndicesSha256: mapping[3],
    mappingDigestSha256: mapping[4],
    analysisPartition: 'owner-supplement-required',
    identityMode: 'canonical',
    fixtureShape: 'imported-owner-override',
    scannerResidualMode: 'pinned-raw-package-subset',
    rawScanner: scannerPin(rawScanner),
    packageScanner: scannerPin(packageScanner),
  }
}

const emptyScannerPin = [
  0,
  0,
  '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
]

const target119ImportedOwnerCorrectionDescriptors = [
  importedTarget119OwnerCorrection({
    id: 'target119-autofix-pr-ui',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/autofix-pr-ui-owner-overrides.mjs',
    moduleSha256:
      '34fbf669902f68d08aceb6ce411d4c8e32682e568b802f41b49f9cf96ba98576',
    proof: 'recovery/test/recovery-2.1.119-autofix-pr-ui-owner-proof.json',
    proofSha256:
      '9723acaa3c27b5ac77184cbd77f58137ec2b973cf812b7f5bd541f14eac20f04',
    test: 'recovery/test/recovery-2.1.119-autofix-pr-ui-owner-proof.test.mjs',
    testSha256:
      '0df7653ca42caca4566db374ea1b659bbe8cc2577cd4435ca34468d46ea4b60a',
    overrideRows: TARGET119_AUTOFIX_PR_UI_OWNER_OVERRIDES,
    mapping: [
      1,
      4,
      4,
      'c4ff38609d4eca942f5f65684699c4248fe6d2d2b3b3d05727a338478b3b0d74',
      '5501f64f31df0cdfbdd3e82be1b9267c1c9df1b8d352f93b62beac7b79a1e24a',
    ],
    rawScanner: [
      1,
      4,
      '4a86aa4dd27424ff921bdceef407a2eb2bb1c95ce9024adef852473a9d337bd2',
    ],
    packageScanner: [
      1,
      4,
      '4a86aa4dd27424ff921bdceef407a2eb2bb1c95ce9024adef852473a9d337bd2',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-autocompact-dialog',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/autocompact-dialog-owner-overrides.mjs',
    moduleSha256:
      'e285c181b057a6404b6a095cbf4755dcbbab161b06475189951416fe5df8717d',
    proof: 'recovery/test/recovery-2.1.119-autocompact-dialog-owner-proof.json',
    proofSha256:
      'd2bf6ad91aa52de6771f0ddcf329dcea99779c090473c61c7efc35cb8f3a0344',
    test:
      'recovery/test/recovery-2.1.119-autocompact-dialog-owner-proof.test.mjs',
    testSha256:
      '34d1b105231107bb41fc812e78d7feb0de1ab56bef0a872226ce3ab0865e43fd',
    overrideRows: TARGET119_AUTOCOMPACT_DIALOG_OWNER_OVERRIDES,
    mapping: [
      1,
      17,
      17,
      'ca7e1427a0f3dce4da57aaf370bf52711a10923da0fd81138baf48ce7d3e2e11',
      'e41b956b590f91b66b930e6804c3379e117f1b6a99ddfb38dc195171a6e2fb0b',
    ],
    rawScanner: [
      1,
      1,
      'a80ab5defe1136bf72c957b0b32b7a1cb62c8e68f01b35d999d76b16e8918698',
    ],
    packageScanner: [
      1,
      1,
      'a80ab5defe1136bf72c957b0b32b7a1cb62c8e68f01b35d999d76b16e8918698',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-doctor-whole-unit',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/doctor-whole-unit-owner-overrides.mjs',
    moduleSha256:
      '9b3c6f32eb2549bf385253a32aeaff4fa85a919eb42218efadc2779342df9ff0',
    proof: 'recovery/test/recovery-2.1.119-doctor-whole-unit-owner-proof.json',
    proofSha256:
      '457ff1eab1b03bbdc198e037fe3922190c2990f48b4a4580a89ff94cb4429007',
    test:
      'recovery/test/recovery-2.1.119-doctor-whole-unit-owner-proof.test.mjs',
    testSha256:
      '9c89aff0d13d23471e8f9b5961b43f23321a87f0308848d3327ae92bbce4f0b5',
    overrideRows: TARGET119_DOCTOR_WHOLE_UNIT_OWNER_OVERRIDES,
    mapping: [
      1,
      15,
      9,
      '548c966f901f551e6a906d99e236e1cbc306f1c16b43a564b88b79a41a974fe9',
      'dfb5253e71c63cc01de56a8166f152de74d7879d8ee1272c112ca7fbba35d839',
    ],
    rawScanner: [
      1,
      15,
      '94b77ad56bc316c98c68b1da671698f21f8835070c6b617ad06beb9b60f93203',
    ],
    packageScanner: [
      1,
      15,
      '94b77ad56bc316c98c68b1da671698f21f8835070c6b617ad06beb9b60f93203',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-condensed-logo-trial-badge',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/condensed-logo-trial-badge-owner-overrides.mjs',
    moduleSha256:
      '4382c7afb84ccc7af6647638221fc0ac7bb8c7c7b8928d9d2ada259e9481758f',
    proof:
      'recovery/test/recovery-2.1.119-condensed-logo-trial-badge-owner-proof.json',
    proofSha256:
      '9563d8bb89a339c36aad3c73fcc4c761b87f513b58e16e508191605065a43862',
    test:
      'recovery/test/recovery-2.1.119-condensed-logo-trial-badge-owner-proof.test.mjs',
    testSha256:
      'da4e794c063e7017383100b6808d5bf773a13340ae1d0293b6db4c6a8b09af64',
    overrideRows: TARGET119_CONDENSED_LOGO_TRIAL_BADGE_OWNER_OVERRIDES,
    mapping: [
      1,
      1,
      1,
      '399b53aafeb283a26fdfb642fe9f474c3782c76acc66dc40301abdee20274da9',
      'd558e7de4fcd8ce6123d491f3426d632cf5f9a678967b779421b299db32a525c',
    ],
    rawScanner: [
      1,
      1,
      '940ec45490c882f902a78021907190bab0d9866525b68736df513d5ff89da28c',
    ],
    packageScanner: [
      1,
      1,
      '940ec45490c882f902a78021907190bab0d9866525b68736df513d5ff89da28c',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-logo-v2-trial-badge',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/logo-v2-trial-badge-owner-overrides.mjs',
    moduleSha256:
      '576e1016e58a6f02cc7131604cae6e99da2d2ab5acc2634619116cb50ac42c79',
    proof:
      'recovery/test/recovery-2.1.119-logo-v2-trial-badge-owner-proof.json',
    proofSha256:
      '73c0b757526958a7f7a10166a3829728c0beb11a6f090eeb7a064262ec752f13',
    test:
      'recovery/test/recovery-2.1.119-logo-v2-trial-badge-owner-proof.test.mjs',
    testSha256:
      'e6bbd28eac1d8501c8bff200c9db50dc5ee527f0b03026c79e986bd3f1ee5871',
    overrideRows: TARGET119_LOGO_V2_TRIAL_BADGE_OWNER_OVERRIDES,
    mapping: [
      1,
      5,
      2,
      '49fed5cb8dec8e4955ec7a179de1516a0dd10cd47abaf2c3dd1c330d7b556754',
      'd2615cdf81bfdc45e1c09317ef415f078af788a2f6a62284e707a85a48ed8771',
    ],
    rawScanner: [
      1,
      5,
      '594aa18396762f52c2e3a85995e8b02a6a7f8647a276d772bc16709b5a9b4adf',
    ],
    packageScanner: [
      1,
      5,
      '594aa18396762f52c2e3a85995e8b02a6a7f8647a276d772bc16709b5a9b4adf',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-auto-mode-denials-context',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/auto-mode-denials-context-owner-overrides.mjs',
    moduleSha256:
      '7537917a07dad9b8789a0d649c7daa8beec99ad1d7d6d1626296ba936f1c3ed3',
    proof:
      'recovery/test/recovery-2.1.119-auto-mode-denials-context-owner-proof.json',
    proofSha256:
      '23caca0bb84aa844d783e533d2623c8e158e1c838f7a48f5130cec83bde0ffd1',
    test:
      'recovery/test/recovery-2.1.119-auto-mode-denials-context-owner-proof.test.mjs',
    testSha256:
      'c2a087958152da9cb72ffa11d25bd9a1e223bd67a47f82c1f264fee2ce92d26d',
    overrideRows: TARGET119_AUTO_MODE_DENIALS_CONTEXT_OWNER_OVERRIDES,
    mapping: [
      2,
      2,
      2,
      '44d78f0a263d0f290b93de42d7be356599d2275a3968a3a9f3567401ecc0b0e8',
      '30a4994d76ad20601d98e0611709926201cf3fa5deb8b24657fd401e4da83e22',
    ],
    rawScanner: [
      2,
      2,
      '97b41d666e6c23c2c8f188fac74fc3eb07d8396a998ddf9cd3ae9fd4209d776b',
    ],
    packageScanner: [
      2,
      2,
      '97b41d666e6c23c2c8f188fac74fc3eb07d8396a998ddf9cd3ae9fd4209d776b',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-rate-limit-options-usage-label',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/rate-limit-options-usage-label-owner-overrides.mjs',
    moduleSha256:
      'a1e9ca45fa90bcd78f85cd846988d42d10e11fc3efd5457bc01de5604fb449c9',
    proof:
      'recovery/test/recovery-2.1.119-rate-limit-options-usage-label-owner-proof.json',
    proofSha256:
      '0fe7250b7a479e5e32fd41ffa928487395699a212bccb0e5d6decc3d6144f140',
    test:
      'recovery/test/recovery-2.1.119-rate-limit-options-usage-label-owner-proof.test.mjs',
    testSha256:
      'd8b97704aefb9e155aa6b303bf18064519826a488cbc815646a9e6e18360f47b',
    overrideRows: TARGET119_RATE_LIMIT_OPTIONS_USAGE_LABEL_OWNER_OVERRIDES,
    mapping: [
      1,
      9,
      9,
      '2074692ff44ece95ba80fff44d12e327ecd5a81a749b0cf843c673307ab2a309',
      'aed38cbe611b930a7d2c30de70d6712adb6e49f61b6035c805f8891f94e8a573',
    ],
    rawScanner: [
      1,
      9,
      'ddcf32f8d1c9622ae6ebab31462e6e0085597fbd2ab4e538ab3bf70aedfb72e3',
    ],
    packageScanner: [
      1,
      9,
      'ddcf32f8d1c9622ae6ebab31462e6e0085597fbd2ab4e538ab3bf70aedfb72e3',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-settings-config-release-channel',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/replay-settings-config-release-channel-source-gap.mjs',
    moduleSha256:
      '9778e1b91a2873dc020b7b0a6c79242e2f91a9b2e3020903d3b2d5d9c29b9256',
    proof: 'recovery/test/recovery-2.1.119-settings-config-source-gap.json',
    proofSha256:
      '40edd90925ef32678559e32e4fcda763c524afffa4918af0d304a1c12f4e97cc',
    test: 'recovery/test/recovery-2.1.119-settings-config-source-gap.test.mjs',
    testSha256:
      'ab37c7b3ebabac27b1608032a1bd577d7c025ca43e692b69baa88cdc8f7c0091',
    overrideRows: TARGET119_SETTINGS_CONFIG_OWNER_OVERRIDES,
    mapping: [
      1,
      10,
      4,
      'b8f9828ce464fae707f9f534cdbf597adb63a2c3e4393fb50c09fe96c5a98b16',
      'ebcafb1317d74edaa6b4ee6f68fa0847beb480673a2c841bc8fa4a5eb26a6719',
    ],
    rawScanner: [
      1,
      10,
      '60f2d84efd613c21ce045b08a22527d00cbb844b7add2b1df230d75d561b7d77',
    ],
    packageScanner: [
      1,
      8,
      '3cc8692562ea581bf7fcbf4e093791295712063672eb1651583d486fe6da077b',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-session-storage-assistant-dedup',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/session-storage-assistant-dedup-owner-overrides.mjs',
    moduleSha256:
      '1b161891dcfb6a1c6d5504e8cffebab84c387ed8203079e49d39cf856bfec780',
    proof:
      'recovery/test/recovery-2.1.119-session-storage-assistant-dedup-owner-proof.json',
    proofSha256:
      '484fc1db416b8dd797163c940f7a4366ea307305940362b7256d4c7649bbd604',
    test:
      'recovery/test/recovery-2.1.119-session-storage-assistant-dedup-owner-proof.test.mjs',
    testSha256:
      '79722c17ec4b4abaa87c05c576c019241c5b1ca0fc7daa37cdac65ddfb7bc8bf',
    overrideRows: TARGET119_SESSION_STORAGE_ASSISTANT_DEDUP_OWNER_OVERRIDES,
    mapping: [
      1,
      4,
      1,
      '84677adc66c992efbd13b794d240e9c9f82c18094f77f3e60a8186fbae92520c',
      '001c053c92e9fff4929e1718ac6005f8d270124a2b24a5d7c581f98258c52c70',
    ],
    rawScanner: [
      1,
      4,
      'f83dd95d5b7730fd5970647540833b01cfcebb16c6914dabab1f842510a1e779',
    ],
    packageScanner: [
      1,
      4,
      'f83dd95d5b7730fd5970647540833b01cfcebb16c6914dabab1f842510a1e779',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-hook-background-skip-spill',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/replay-hook-background-skip-spill-source-gap.mjs',
    moduleSha256:
      '5c63ff4efb86c87b10c8bf5ca1967708c5d64ffa15539895c0b52fb7335c916b',
    proof:
      'recovery/test/recovery-2.1.119-hook-background-skip-spill-source-gap.json',
    proofSha256:
      'a242549e736f59964d5021a2262308bdccf381dea56a08f6b4f5b831f4877b07',
    test:
      'recovery/test/recovery-2.1.119-hook-background-skip-spill-source-gap.test.mjs',
    testSha256:
      '6702b1f631cd0c73222b34b1485bb0d05bcfc441b79d20024f2967e09e23480b',
    overrideRows: TARGET119_HOOK_BACKGROUND_SKIP_SPILL_OWNER_OVERRIDES,
    mapping: [
      1,
      2,
      2,
      '704d1c6128ceb468dda5cb916e17b758908dd9d3b5979b7196c7ae59370cadb6',
      'c06e8fd0dfc6fed71cef295e2ee1351d63b6cbee60cfe23d0f5e7495fea355ae',
    ],
    rawScanner: [
      1,
      2,
      'e700a0a0aad1ffb514339cbc572920ac7d55947ad9a8e51b230432c6a91ace85',
    ],
    packageScanner: [
      1,
      1,
      'ed037c0bc613d549f06a675c8c0d4a08b31b3afb9b05fc62f45b6cb897fdd0da',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-inbound-attachment-schema',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/inbound-attachment-schema-inherited-owner-overrides.mjs',
    moduleSha256:
      'f176f72aea060b5db832786c8add4e108bc8518517e12dcdcb82c0379d35ba31',
    proof:
      'recovery/test/recovery-2.1.119-inbound-attachment-schema-inherited-owner-proof.json',
    proofSha256:
      'f6df184a15346819cf6c19b62359328cb5db8ed722e07386ef21403cbc58df4b',
    test:
      'recovery/test/recovery-2.1.119-inbound-attachment-schema-inherited-owner-proof.test.mjs',
    testSha256:
      '16fc7c139b3739f58b2a0071c26d0db3abfbfd8bb7e634e8bd56f75574d69b55',
    overrideRows: TARGET119_INBOUND_ATTACHMENT_SCHEMA_OWNER_OVERRIDES,
    mapping: [
      1,
      1,
      1,
      '58cdf964e8f08a696757d641e7fb192e70c73c2d609c4e53e2d4139d3ff77944',
      '01c7f893882cb3ecd1fcb775c516cf6a18e2c69f8d529c66e90f3613458d4923',
    ],
    rawScanner: [
      1,
      1,
      'd3101c827b771937e44436f41d2518194dc746a75a02e96f65a4fb9bb01f8820',
    ],
    packageScanner: [
      1,
      1,
      'd3101c827b771937e44436f41d2518194dc746a75a02e96f65a4fb9bb01f8820',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-resume-return-decision',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/resume-return-decision-owner-overrides.mjs',
    moduleSha256:
      'a87e1615b727a991380e9a564c5a82d36f88f2aa2d7fefe314c9becf5d5067d0',
    proof:
      'recovery/test/recovery-2.1.119-resume-return-decision-owner-proof.json',
    proofSha256:
      '1c23958d361e7d437ea01f47bf78f147de1192fa2e93d3258cca40be24f8b960',
    test:
      'recovery/test/recovery-2.1.119-resume-return-decision-owner-proof.test.mjs',
    testSha256:
      '10079b867510af4cf179f2f44124f929636ab2e4ccb6c4a7a35d125f3ad3cf86',
    overrideRows: TARGET119_RESUME_RETURN_DECISION_OWNER_OVERRIDES,
    mapping: [
      1,
      4,
      4,
      '1b0c6776729107904af6ebf46eab459eaddac5b9db100cce1e30f6fd54a0dc9f',
      '2af2dd2cc499843656d0469f48594100ade035fe3c7207331991bb5f635d34a4',
    ],
    rawScanner: [
      1,
      4,
      'd31386cbe12032fa4f47ee03a289f55c0c01e8b324fa1033699aafc4e8c11ed2',
    ],
    packageScanner: [
      1,
      4,
      'd31386cbe12032fa4f47ee03a289f55c0c01e8b324fa1033699aafc4e8c11ed2',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-closed-issue-refresh',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/closed-issue-refresh-inherited-owner-overrides.mjs',
    moduleSha256:
      '844c25534507b66780852af53cbd8ddf8cdccfe5a2dce0dbc2a2832aaf65b6ab',
    proof:
      'recovery/test/recovery-2.1.119-closed-issue-refresh-inherited-owner-proof.json',
    proofSha256:
      '5ed3b581c58ed290136e88f43227000155059c11740c70f7592b7b3cd18a9a6f',
    test:
      'recovery/test/recovery-2.1.119-closed-issue-refresh-inherited-owner-proof.test.mjs',
    testSha256:
      '5e16334d379ad739983fff6879a037b7424b2391e7d12ff2dd1212c80e0ce4a2',
    overrideRows: TARGET119_CLOSED_ISSUE_REFRESH_OWNER_OVERRIDES,
    mapping: [
      1,
      12,
      12,
      '7769849773941c093e11ddc69c4acf6b1dd2b4e2428fd7c0b29f25e2682ed41a',
      'addf1505ca0754557910253ad0dfa97bc8edf1b9593a9889c3473bc293944677',
    ],
    rawScanner: [
      1,
      12,
      '103ff59581fa8638976882b8f608d8cb179376d377816678d4825489ecdde700',
    ],
    packageScanner: [
      1,
      12,
      '103ff59581fa8638976882b8f608d8cb179376d377816678d4825489ecdde700',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-sse-transport-retained-class',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/sse-transport-retained-class-owner-overrides.mjs',
    moduleSha256:
      'a45a94a206746c0a7dc034ae2bc1bdb4cd87a0d5fd6f00886c7ee109f1937832',
    proof:
      'recovery/test/recovery-2.1.119-sse-transport-retained-class-owner-proof.json',
    proofSha256:
      'fad869e76e9bf5bca3edb4a0e5d48766e3fc7afefe6d982378d3f907ec901f69',
    test:
      'recovery/test/recovery-2.1.119-sse-transport-retained-class-owner-proof.test.mjs',
    testSha256:
      'ea0ca8addf03f1ddc173f259de39dc4a0dd82e4cc72a982f496f37b2341b4809',
    overrideRows: TARGET119_SSE_TRANSPORT_RETAINED_CLASS_OWNER_OVERRIDES,
    mapping: [
      1,
      3,
      3,
      'a7f5f6a3aed801477d44a2610841c96f420d5ec3784e576b5506e3f3ceef7909',
      '89c864fdaa306f43fdfb1bc51bfce1f734b0eafc73ab6765556d3c26603e80f3',
    ],
    rawScanner: [
      1,
      3,
      '9588a880f34df86d0fdad0159a138a934e269fee9d8387e8e327109b5dfb5543',
    ],
    packageScanner: [
      1,
      3,
      '9588a880f34df86d0fdad0159a138a934e269fee9d8387e8e327109b5dfb5543',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-remote-bridge-teardown-disposal',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/replay-remote-bridge-teardown-disposal-source-gap.mjs',
    moduleSha256:
      'b92b7bfc391f691e6ef8f1f3adc072fe2417ecd1525a70af2184f684b00166c8',
    proof:
      'recovery/test/recovery-2.1.119-remote-bridge-teardown-disposal-source-gap.json',
    proofSha256:
      'b2ee5abd5acfcb9e526ad66054623769bd73346b7425c6aeaa1d9ce520f29127',
    test:
      'recovery/test/recovery-2.1.119-remote-bridge-teardown-disposal-source-gap.test.mjs',
    testSha256:
      '4c452f718eec9e0ccc4bac1d3d05d19a663e595170b04fc40d27f298351ef323',
    overrideRows: TARGET119_REMOTE_BRIDGE_TEARDOWN_DISPOSAL_OWNER_OVERRIDES,
    mapping: [
      1,
      2,
      2,
      '073230f6f262dbb12fcaa2a9ea06f89e385c762697b91401f180ba3820bf5933',
      '09a4812e0604386945b138f01948d4b5a85d6eeb974818647937a39c39af0ae4',
    ],
    rawScanner: [
      1,
      2,
      '237f987054d85d788488a12429baa1888431223fe05fbc995a66c466e83cbb22',
    ],
    packageScanner: emptyScannerPin,
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-bridge-dialog-whole-unit',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/bridge-dialog-whole-unit-owner-overrides.mjs',
    moduleSha256:
      '911c505f9acd4988a41a3cd4d37a74452f85dcf2adf63cace98272e5631531ea',
    proof:
      'recovery/test/recovery-2.1.119-bridge-dialog-whole-unit-owner-proof.json',
    proofSha256:
      '92181f992540816a6ec8128dc56b636e27a1e8cc54fc88270260e3bece836bf9',
    test:
      'recovery/test/recovery-2.1.119-bridge-dialog-whole-unit-owner-proof.test.mjs',
    testSha256:
      '1b663ad772097d53d86e21533d6be61c950b7b98c5614ead3fb984432658ecd8',
    overrideRows: TARGET119_BRIDGE_DIALOG_WHOLE_UNIT_OWNER_OVERRIDES,
    mapping: [
      1,
      20,
      20,
      '81b3868e7e20d2698bd2d34d900d741694b6aec5e2ca1670b32e95924c326133',
      '5dbe69152fc998c7f122828b479fbc8ab04471109b6f91ee3c44955187434d68',
    ],
    rawScanner: [
      1,
      20,
      '2fcf76fe9d212b11e2fd27d8726070e455c23b4a7b367b449d40f51b22b99974',
    ],
    packageScanner: [
      1,
      20,
      '2fcf76fe9d212b11e2fd27d8726070e455c23b4a7b367b449d40f51b22b99974',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-subagent-status-line-schema',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/subagent-status-line-schema-owner-overrides.mjs',
    moduleSha256:
      '8f8e1148362dd7b5ff848b60e1c43d31ea75aca875dd3985544426ef2270a7b2',
    proof:
      'recovery/test/recovery-2.1.119-subagent-status-line-schema-owner-proof.json',
    proofSha256:
      '66f0eeacf46de48aeca3e4b8fb606ac745507713f488a36ae74e29985dad2c4d',
    test:
      'recovery/test/recovery-2.1.119-subagent-status-line-schema-owner-proof.test.mjs',
    testSha256:
      'e4738c46cbeb68179b83a4920c7f36d58e6133d063978d37dfd9df9297e61772',
    overrideRows: TARGET119_SUBAGENT_STATUS_LINE_SCHEMA_OWNER_OVERRIDES,
    mapping: [
      1,
      1,
      1,
      '15a6691d8db619aad854a6e448927fb1acd4a7169c8e40cf5bd09c294e7c860f',
      'b28816362b77507d82597d5b4015a97d82affc51f2fb694fdb747e9081bdb009',
    ],
    rawScanner: [
      1,
      1,
      'e5711533d42248da22b3c3bef859d4d312fc8640d6528abe3fb6d2d9b8780758',
    ],
    packageScanner: [
      1,
      1,
      'e5711533d42248da22b3c3bef859d4d312fc8640d6528abe3fb6d2d9b8780758',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-status-line-cwd-fast-mode',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/replay-status-line-cwd-fast-mode-source-gap.mjs',
    moduleSha256:
      '925fe4a1756de43c4a99a46a69f18bcd862ee7ef7979ea02a3cb27c35682e5c7',
    proof:
      'recovery/test/recovery-2.1.119-status-line-cwd-fast-mode-source-gap.json',
    proofSha256:
      'a4faa37882de9aa76e83cb4b55dbb2ed95e1f057e4624198af163ac85a747b32',
    test:
      'recovery/test/recovery-2.1.119-status-line-cwd-fast-mode-source-gap.test.mjs',
    testSha256:
      'bdb4c569c8e9ee98036c3f88e86ae75b3e9c8857b530166a77c758faa34efa07',
    overrideRows: TARGET119_STATUS_LINE_CWD_FAST_MODE_OWNER_OVERRIDES,
    mapping: [
      1,
      4,
      1,
      'f8ca44f6cfb0de5d8a0574aae1ea9dd6d53a2c9932ef655fc6760744b0eedc72',
      '2c1e5fde9b20f2da517789f60eead976b5bc76b14024a66dbe2240aed24c82bd',
    ],
    rawScanner: [
      1,
      4,
      'd331fbc990aa35178a938c2cc05e1763ed738255a44cfb1ad5914cee717e64d6',
    ],
    packageScanner: [
      1,
      3,
      '2950fbf8951f193139018ec3cbd812bdc8518efdd019d00d56a00d61cc64da1c',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-prompt-input-footer-background-exit',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/prompt-input-footer-background-exit-owner-overrides.mjs',
    moduleSha256:
      '9c67180ac134ee7f4131e5a01387bc7fcfb9a5268ed816c849546d8cc6e4bd5e',
    proof:
      'recovery/test/recovery-2.1.119-prompt-input-footer-background-exit-owner-proof.json',
    proofSha256:
      '9900566d0f77983c8e60c864d68822a5adb14624bb218ba8bb7250b77e7d3fbf',
    test:
      'recovery/test/recovery-2.1.119-prompt-input-footer-background-exit-owner-proof.test.mjs',
    testSha256:
      'fdd274f7c0a1e446c5f7a2edbe120725f542049e7870e3d27618d451165096e9',
    overrideRows: TARGET119_PROMPT_INPUT_FOOTER_BACKGROUND_EXIT_OWNER_OVERRIDES,
    mapping: [
      1,
      5,
      5,
      '6a2dc01c994f111dbf7282fe982dcbf295b81c93dc3add6a983c65f7e86b3125',
      'a05f10b1c55feb94864272b73a1de7ff8d04a6d5844c73573e5e0f51d100e6a3',
    ],
    rawScanner: [
      1,
      5,
      '1abee8db032fe5776a1ad0eee991ce6519d01b6be652585d3b80462a11d90ab2',
    ],
    packageScanner: [
      1,
      5,
      '1abee8db032fe5776a1ad0eee991ce6519d01b6be652585d3b80462a11d90ab2',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-prompt-input-foreground-agents',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/prompt-input-foreground-agents-owner-overrides.mjs',
    moduleSha256:
      'c5e3374f0d7d764727b8c328db7184cbeab7cfbc8a6d89d843623f58ae7094fb',
    proof:
      'recovery/test/recovery-2.1.119-prompt-input-foreground-agents-owner-proof.json',
    proofSha256:
      '4a222ea2462219b06ea265bfe1eb6d6386a9ef4525df667b543a6f374a102b8c',
    test:
      'recovery/test/recovery-2.1.119-prompt-input-foreground-agents-owner-proof.test.mjs',
    testSha256:
      '5c4920f49950ee32caf388af7e5ef6abe3ce1a2f770e10db5d98df6dcd41e783',
    overrideRows: TARGET119_PROMPT_INPUT_FOREGROUND_AGENTS_OWNER_OVERRIDES,
    mapping: [
      1,
      15,
      15,
      'f093f181dfb4746714fda2ce9fa1cac18c60cbbcc831577f200c50269406a26b',
      '7fada2857ff3c0a3550cd2c17d7c81a083f5bf40583ac8e796d8268d4c8317b6',
    ],
    rawScanner: [
      1,
      15,
      '7dd63a022a3e38f1febbb8d7c99083530cccb2c74211726fa6ee264d1394b838',
    ],
    packageScanner: [
      1,
      15,
      '7dd63a022a3e38f1febbb8d7c99083530cccb2c74211726fa6ee264d1394b838',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-prompt-input-layout-effect',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/prompt-input-layout-effect-owner-overrides.mjs',
    moduleSha256:
      'e3132d9527b0a3107bf53801035967415f92bf04fac466a386cbeb96f6fbc7cc',
    proof:
      'recovery/test/recovery-2.1.119-prompt-input-layout-effect-owner-proof.json',
    proofSha256:
      '208cad598ec1cc98330f2da962f6081bb3e22c9e93a42c8b098dde903a248101',
    test:
      'recovery/test/recovery-2.1.119-prompt-input-layout-effect-owner-proof.test.mjs',
    testSha256:
      'be6e6b21e03cecebe981481b7b95508a87a6e3bc0a72f0c18fdaffdacfe85b50',
    overrideRows: TARGET119_PROMPT_INPUT_LAYOUT_EFFECT_OWNER_OVERRIDES,
    mapping: [
      1,
      14,
      14,
      '67af6de4f3238baa0cfb58f3843b01a6e66e5b03702112aee147ae48cd65f72c',
      'f641fdcc88e902ea10d6b12b757246c76ca6ce1bd743bf346f98c0a368fa74d8',
    ],
    rawScanner: [
      1,
      14,
      '32cd2b3ce191d8c264b58b6e07b8249600b2eb8e637b7a77b79f945d70fd6d28',
    ],
    packageScanner: [
      1,
      14,
      '32cd2b3ce191d8c264b58b6e07b8249600b2eb8e637b7a77b79f945d70fd6d28',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-remote-session-action-dispatch',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/remote-session-action-dispatch-owner-overrides.mjs',
    moduleSha256:
      '923dae8c2e1e8d2a04bd144e04ca0448c921c5bb4890b3731415ae30b6c6bc9a',
    proof:
      'recovery/test/recovery-2.1.119-remote-session-action-dispatch-owner-proof.json',
    proofSha256:
      '357b6b67c4d820611c578dc58e891dc00f6cd7f7466c036503cfeb22814c7675',
    test:
      'recovery/test/recovery-2.1.119-remote-session-action-dispatch-owner-proof.test.mjs',
    testSha256:
      '22489ebc26bad1273045ced473585231103ac2b1bc226e4c4f2f0012255c4ce0',
    overrideRows: TARGET119_REMOTE_SESSION_ACTION_DISPATCH_OWNER_OVERRIDES,
    mapping: [
      1,
      2,
      2,
      '0162dfc572def178c04e4684605a2a626509b19b4af829e76752b9e7dd364097',
      'adf8566a583025f342e0543b548840c9178368ff526f70c45ea236802f7ce003',
    ],
    rawScanner: [
      1,
      2,
      'f86e11ddf38792d9d3df91acc6015ee06aa2096198cb87424901feedd32b72ed',
    ],
    packageScanner: [
      1,
      2,
      'f86e11ddf38792d9d3df91acc6015ee06aa2096198cb87424901feedd32b72ed',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-use-can-use-tool-denial-history',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/use-can-use-tool-denial-history-owner-overrides.mjs',
    moduleSha256:
      '0c958395553d7a552239af230df7529aae31c4a6970ef57f1efee6ca71b4de42',
    proof:
      'recovery/test/recovery-2.1.119-use-can-use-tool-denial-history-owner-proof.json',
    proofSha256:
      '1d56d2cc70f349ce036b82946c63e6d613e310b493dae37c1bc5a33a9f3e76dc',
    test:
      'recovery/test/recovery-2.1.119-use-can-use-tool-denial-history-owner-proof.test.mjs',
    testSha256:
      '90fadba3de1c397a971ce9ba581f6d03312ca32102e6add78a0c37ca9daa4691',
    overrideRows: TARGET119_USE_CAN_USE_TOOL_DENIAL_HISTORY_OWNER_OVERRIDES,
    mapping: [
      1,
      2,
      2,
      '1c99cb1f78c6befe4ae1b080295d4a12a4b3292ea14d97686820b1a483c19c63',
      '625f9d5c096d13e8eae42ffc0e2de951ead063efaef9c95603ab8317884851ae',
    ],
    rawScanner: [
      1,
      2,
      '9b468eeec18b04068ab3d4dc184fae159a7396a28023d9c638d5d3d30c4a9b9a',
    ],
    packageScanner: [
      1,
      2,
      '9b468eeec18b04068ab3d4dc184fae159a7396a28023d9c638d5d3d30c4a9b9a',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-wake-router-dispatch-timeout',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/wake-router-dispatch-timeout-owner-overrides.mjs',
    moduleSha256:
      '90dd589088294d1621869464ebf5ce6f78a434cfb4f4c9dccd5ce4d0a89f2c85',
    proof:
      'recovery/test/recovery-2.1.119-wake-router-dispatch-timeout-owner-proof.json',
    proofSha256:
      '3ae74729eca9066075588354a8d1b1357a710dd467b9c9a173b90bf97baca699',
    test:
      'recovery/test/recovery-2.1.119-wake-router-dispatch-timeout-owner-proof.test.mjs',
    testSha256:
      '2c063ce196b3140d1de514a158f8b827cf53e867706860332fb2689384dedc6a',
    overrideRows: TARGET119_WAKE_ROUTER_DISPATCH_TIMEOUT_OWNER_OVERRIDES,
    mapping: [
      1,
      1,
      1,
      '1e5d4d47701004cac259994482c6d7f4df84ff8ea19343cfdd40589ac871fd74',
      'f4e2ad3ff35303eb59be5fd02f2a76f15790056d4b198153e03c544945d2ea44',
    ],
    rawScanner: emptyScannerPin,
    packageScanner: emptyScannerPin,
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-cli-bg-module-import',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/cli-bg-module-import-owner-overrides.mjs',
    moduleSha256:
      '19683fe7c2a9e940a245225a5cd26b256a8a3c2dc733a1943aaa1d218109aced',
    proof:
      'recovery/test/recovery-2.1.119-cli-bg-module-import-owner-proof.json',
    proofSha256:
      '63bd1d1047c2b3f1c53405b38cdfd11ae5014dd5c9f6d1107e58a8a53337bb12',
    test:
      'recovery/test/recovery-2.1.119-cli-bg-module-import-owner-proof.test.mjs',
    testSha256:
      '9d8205dbb17f19e99d0cc933d8f13874b5215df22147615a6f3f7423a76e95dc',
    overrideRows: TARGET119_CLI_BG_MODULE_IMPORT_OWNER_OVERRIDES,
    mapping: [
      1,
      2,
      1,
      'cba5e36bdf7fb506fc9f3f9f142a04aaba64ba5914cd61701adaf20e51838583',
      '9b3f3eac792a150beec44d19b48c0e06490b62d40278d90eea470d1556eaaa30',
    ],
    rawScanner: emptyScannerPin,
    packageScanner: emptyScannerPin,
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-session-background-hint',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/session-background-hint-retained-owner-overrides.mjs',
    moduleSha256:
      '1b433bdb71dd36a5032e82b7c4b633b496590bec2fc7df92dec7086674fb58ce',
    proof:
      'recovery/test/recovery-2.1.119-session-background-hint-retained-owner-proof.json',
    proofSha256:
      '1336190f0f4884042998677a39427c3d707fd4b0fff0dd44e1fc5cc6abd871e1',
    test:
      'recovery/test/recovery-2.1.119-session-background-hint-retained-owner-proof.test.mjs',
    testSha256:
      'b9d195093031090ce45c23a69a95b4fa352ede4ac36dd71bd8d306cd8f341b96',
    overrideRows: TARGET119_SESSION_BACKGROUND_HINT_OWNER_OVERRIDES,
    mapping: [
      1,
      4,
      4,
      'c762731f76a752579f53d08934a3dc3a4e2b1dc21154a49d69747c9055ba2072',
      '802eda6265521f01c2da4ea0bac72fa0e56e5fadc2a77349b79216e257304a16',
    ],
    rawScanner: [
      1,
      4,
      '799e162f0ce8ecb4adf2b1502355b6019c192be746a01aacf420d60e11d61130',
    ],
    packageScanner: [
      1,
      4,
      '799e162f0ce8ecb4adf2b1502355b6019c192be746a01aacf420d60e11d61130',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-ultraplan-choice-module-import',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/ultraplan-choice-module-import-owner-overrides.mjs',
    moduleSha256:
      '0bf3be11079631a4baf8e3f3c6236e4be2845c58694feda86b23d5dc1c712ef4',
    proof:
      'recovery/test/recovery-2.1.119-ultraplan-choice-module-import-owner-proof.json',
    proofSha256:
      'c428ca5e6f278df3b546a066035aa123686de8c1aac5247d44e7448cd6a7ffd0',
    test:
      'recovery/test/recovery-2.1.119-ultraplan-choice-module-import-owner-proof.test.mjs',
    testSha256:
      'aeda5c841fc2ec2db59f7e8941c51f1ffbc255f76fdbbe2090e33027ecc76332',
    overrideRows: TARGET119_ULTRAPLAN_CHOICE_MODULE_IMPORT_OWNER_OVERRIDES,
    mapping: [
      1,
      2,
      1,
      '16c38e61ef4aabc47a5b9bcbfaead92fa83ac350e6b50f1b1b4a299fc219ac84',
      '0e800ef9f2488247dafff4a21b4ff1f0a794e57ff3c7c452c882eaf5d3d03c45',
    ],
    rawScanner: emptyScannerPin,
    packageScanner: emptyScannerPin,
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-connection-state-offline-threshold',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/connection-state-offline-threshold-owner-overrides.mjs',
    moduleSha256:
      '850f54c4077d075631176b7b0d77ec2ae66130c291de49d3831f9c537bdb8cc9',
    proof:
      'recovery/test/recovery-2.1.119-connection-state-offline-threshold-owner-proof.json',
    proofSha256:
      '66eff0b359febc1c3a3090e9caf46bff6662ac655106184170300c181c7af052',
    test:
      'recovery/test/recovery-2.1.119-connection-state-offline-threshold-owner-proof.test.mjs',
    testSha256:
      'bb0b13a920aade94b790505259aab35bc5b9f03869e4f10d2254beadc5cfd50d',
    overrideRows: TARGET119_CONNECTION_STATE_OFFLINE_THRESHOLD_OWNER_OVERRIDES,
    mapping: [
      1,
      1,
      1,
      '0fb5392194e4caa031cc180f929b87eb9835ba0ca5bb0be9a367a9c4f7080390',
      '3c520a4348be0303fdb05cc16b32ab93d3754250c390ab99e9c424daa801d2ad',
    ],
    rawScanner: emptyScannerPin,
    packageScanner: emptyScannerPin,
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-transcript-share-build-macro',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/transcript-share-build-macro-owner-overrides.mjs',
    moduleSha256:
      '0ca86c1126c8cf5de4fcbf1c50c3dc70e25388b1a22e8d98302f26a5489ab464',
    proof:
      'recovery/test/recovery-2.1.119-transcript-share-build-macro-owner-proof.json',
    proofSha256:
      'f65b5fe3fdd61c688388375e079ead2080b63126524d5afadf38c68322a029c9',
    test:
      'recovery/test/recovery-2.1.119-transcript-share-build-macro-owner-proof.test.mjs',
    testSha256:
      '820f5451cb6fb1e933b42cff3c4f7760c15021f2267a04ba79a948a631e71398',
    overrideRows: TARGET119_TRANSCRIPT_SHARE_BUILD_MACRO_OWNER_OVERRIDES,
    mapping: [
      1,
      9,
      6,
      'a334a01006d28527b613fff64add0a67f16fd24803714cba494502813f79e901',
      '4b1f2fb1e68823df09b9214373c30c6efe074c2f9b6e40b16906a1e4ee80b312',
    ],
    rawScanner: [
      1,
      9,
      '9140063b8acf42b6cbd4dd482a9ff5e55d29b996109739545f5c93d8b8ab6d3b',
    ],
    packageScanner: [
      1,
      9,
      '9140063b8acf42b6cbd4dd482a9ff5e55d29b996109739545f5c93d8b8ab6d3b',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-job-state-name-sync-module-import',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/job-state-name-sync-module-import-owner-overrides.mjs',
    moduleSha256:
      '3d06868bab483d9037af133ecdd9548bc856d59de381e18b8c62227cafb62ca5',
    proof:
      'recovery/test/recovery-2.1.119-job-state-name-sync-module-import-owner-proof.json',
    proofSha256:
      '6eb1e06cd4212aaf783a15ec3ea302543a7817fe2a2b86992f8ed681462bb5c0',
    test:
      'recovery/test/recovery-2.1.119-job-state-name-sync-module-import-owner-proof.test.mjs',
    testSha256:
      'a7d17c80aa85dd321d4e18ab5c84ebf78f9a7b99db1a0808244058427a336983',
    overrideRows: TARGET119_JOB_STATE_NAME_SYNC_MODULE_IMPORT_OWNER_OVERRIDES,
    mapping: [
      1,
      1,
      1,
      'cd74bc407d93082e14c157afe5d80282f57769c985d8e188281b837fd8e46b93',
      'f1677be0cda91470f1f19a0466c4a7364189c17de2ce170ab044dbc7f2311ebf',
    ],
    rawScanner: emptyScannerPin,
    packageScanner: emptyScannerPin,
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-tip-registry-day-window',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/tip-registry-day-window-owner-overrides.mjs',
    moduleSha256:
      'f96a2aa5802e8919fea735509f114d8f5a480f425f456aee7e6b38a593afa8cb',
    proof:
      'recovery/test/recovery-2.1.119-tip-registry-day-window-owner-proof.json',
    proofSha256:
      '69ab8dca7f7a2d05a39e7734b48134210f356f64dfe418bc288c9f7b82d1a10e',
    test:
      'recovery/test/recovery-2.1.119-tip-registry-day-window-owner-proof.test.mjs',
    testSha256:
      'bf854b97a0b680b22d5afc96d67b809249224ce3138060fdc0dfe50f8be20cb9',
    overrideRows: TARGET119_TIP_REGISTRY_DAY_WINDOW_OWNER_OVERRIDES,
    mapping: [
      1,
      2,
      2,
      '1949c0464f5430d0ec7de81f352bb878869b4c15b3090034e43a095da9c0d4e4',
      '52d4dbd4750748abbcacbf703c5ca9cd8467115675901989f089125782016fe3',
    ],
    rawScanner: [
      1,
      2,
      'cbdd511dac7e407cf4464d3a051027aa93af673a32679a52c22f1e02ebfc6e63',
    ],
    packageScanner: [
      1,
      2,
      'cbdd511dac7e407cf4464d3a051027aa93af673a32679a52c22f1e02ebfc6e63',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-sdk-control-inherited-schema',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/sdk-control-inherited-schema-owner-overrides.mjs',
    moduleSha256:
      '6712b8a4ff3185ff82a3d43247cf0de63be3e50e8a8f198fcff93bc951a29d96',
    proof:
      'recovery/test/recovery-2.1.119-sdk-control-inherited-schema-owner-proof.json',
    proofSha256:
      '9ab15cac8f93fd21a0b40b59f1b78302029d2535c620592b302952b803ea738d',
    test:
      'recovery/test/recovery-2.1.119-sdk-control-inherited-schema-owner-proof.test.mjs',
    testSha256:
      'c568d9ee4a7e066e1731bde15ddfec6231cb7b451c17308daff846b482f19488',
    overrideRows: TARGET119_SDK_CONTROL_INHERITED_SCHEMA_OWNER_OVERRIDES,
    mapping: [
      1,
      7,
      7,
      'e78cb1626912b4fbb32c45b96c28caf0dfe0d10225dac3b742c04b45eaf6f1f4',
      '829ea04b84278d2a428dbec71f8d4bbab67b20d21237c22c30ca715988ee5690',
    ],
    rawScanner: [
      1,
      7,
      '3e29a9360b9f2c2314afcbc28e04a973d873b5cc8dd9379d797bd11f4210a9fd',
    ],
    packageScanner: [
      1,
      7,
      '3e29a9360b9f2c2314afcbc28e04a973d873b5cc8dd9379d797bd11f4210a9fd',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-session-task-summary-state',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/session-task-summary-state-owner-overrides.mjs',
    moduleSha256:
      '8381bd991352c996bedac3b7f1cb7f738de6f530a81c5abfbea7cb2579f2810f',
    proof:
      'recovery/test/recovery-2.1.119-session-task-summary-state-owner-proof.json',
    proofSha256:
      '84e1a63798479059d2b6732522a3a2bc85eae04ed582cf8d875f8362e8def1f2',
    test:
      'recovery/test/recovery-2.1.119-session-task-summary-state-owner-proof.test.mjs',
    testSha256:
      'd58dedf6bb4ec5e71db6fb9c0f16a378939db893982cc869a40bc54ab80b1acf',
    overrideRows: TARGET119_SESSION_TASK_SUMMARY_STATE_OWNER_OVERRIDES,
    mapping: [
      1,
      14,
      12,
      'a8940919fb3d43ca0ef7769b418a4bf5558ea0241ae78ec6534667472b965cac',
      '48893ba66418c0e374cd15dc31075b46f8af5a102bc9dbe0bdc4f82fc530e09c',
    ],
    rawScanner: [
      1,
      4,
      '73122829dd8408479144557394b7d083f6d4bad77d67717777684066783217ec',
    ],
    packageScanner: [
      1,
      4,
      '73122829dd8408479144557394b7d083f6d4bad77d67717777684066783217ec',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-repl-runtime-evolution',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/repl-runtime-evolution-owner-overrides.mjs',
    moduleSha256:
      '8f27e3acc778963d93a7a72d9731c50063ae4238e5463e1deeb8748848d700c3',
    proof:
      'recovery/test/recovery-2.1.119-repl-runtime-evolution-owner-proof.json',
    proofSha256:
      '950950c2ba084d5e56409a2c7602f9993e992e03c25207c735340d6b9c8244ae',
    test:
      'recovery/test/recovery-2.1.119-repl-runtime-evolution-owner-proof.test.mjs',
    testSha256:
      '0a4f261538bf655c466299ac4d7bdcb905770c2c4bd8401078f874113a9d969d',
    overrideRows: TARGET119_REPL_RUNTIME_EVOLUTION_OWNER_OVERRIDES,
    mapping: [
      2,
      52,
      49,
      '9f8f247840b6b2ce50df2977cf44571eead8a62c7820394666cc578824ab8913',
      '8eabf8690784207aa6cd46d25e16feb670fff30f3a9ffc75861c9e44750cf301',
    ],
    analysisNeutralRows: [
      {
        targetIndex: 18089,
        provisionalPaths: ['src/commands/upgrade/index.ts'],
      },
    ],
    rawScanner: [
      1,
      52,
      '2f470345bfb4e2aac578591aa6c3582f8d58fa78c1eb7a711440074454042eac',
    ],
    packageScanner: [
      1,
      39,
      'd9818244031b022ffb588fa88a352ff993d96b4567f8d17c7047605039ea3b31',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-parse-pr-identifier-strict-property',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/parse-pr-identifier-strict-property-owner-overrides.mjs',
    moduleSha256:
      '2d4a8da5c200d64f87738e623c2973f43eca98dc995cd35dec5bf2ceb27589eb',
    proof:
      'recovery/test/recovery-2.1.119-parse-pr-identifier-strict-property-owner-proof.json',
    proofSha256:
      'dded9121caeddc312cebb256a1abb3cfe50a9f48bd0ffc5994460200937bcd3a',
    test:
      'recovery/test/recovery-2.1.119-parse-pr-identifier-strict-property-owner-proof.test.mjs',
    testSha256:
      '629239f40daeaafcf8d464d07df7135d5c7daee635f3254f72b2ceb7cab239fe',
    overrideRows:
      TARGET119_PARSE_PR_IDENTIFIER_STRICT_PROPERTY_OWNER_OVERRIDES,
    mapping: [
      1,
      0,
      0,
      'aae59d7be37618fe1f257f1417e9cf264d0128630736702e4b41c0fd33324b43',
      '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    ],
    analysisNeutralRows: [
      {
        targetIndex: 21367,
        provisionalPaths: [],
        allowEmptyProvisionalPaths: true,
      },
    ],
    provisionalCoverageRows: [
      {
        targetIndex: 21367,
        paths: [],
        disposition: 'alpha-equivalent',
        evidenceIds: ['readable-normalization', 'static-semantic-noop'],
        reason:
          'The complete target unit has an exact baseline token-stream match after only bundle-local identifier and generated version/build-metadata normalization; cooked literals, operators, branches, and calls are unchanged.',
      },
    ],
    rawScanner: [
      1,
      1,
      '42eab563e6a0b63020c87aaf6780f22b20223337f8f22ba5b350c29e966b38a3',
    ],
    packageScanner: [
      1,
      1,
      '42eab563e6a0b63020c87aaf6780f22b20223337f8f22ba5b350c29e966b38a3',
    ],
  }),
  {
    ...importedTarget119OwnerCorrection({
      id: 'target119-setup-rendezvous-server-strict-property',
      module:
        'recovery/cases/2.1.118-to-2.1.119/recovered/setup-rendezvous-server-strict-property-source-recovery.mjs',
      moduleSha256:
        'a10024d010240fd3487ce3394a42a286a788004dd0236623db2c0f88b38f68f4',
      proof:
        'recovery/test/recovery-2.1.119-setup-rendezvous-server-strict-property-source-gap.json',
      proofSha256:
        '004c2df8da729923878cc9dbee3faa2e2d6e059ba1106cf6ee6414591558b210',
      test:
        'recovery/test/recovery-2.1.119-setup-rendezvous-server-strict-property-source-gap.test.mjs',
      testSha256:
        '36dec4822d802f6df60c2fe216a3a7114c87ecd949ffb441b4159e3128fe8c80',
      overrideRows: TARGET119_SETUP_RENDEZVOUS_OWNER_OVERRIDES,
      mapping: [
        1,
        3,
        3,
        '783a54f1855876ab6fddcd4674e36801a3d000411e675b4b35a8cf19d6dfbf82',
        '9d03b70438b166dc9977ac41576783344951255225745289c64db5016d4e83ca',
      ],
      rawScanner: [
        1,
        3,
        '083b22e8e745cca877122de4f1a76f7896c24e7f4100d5e72fb68641cd8adaba',
      ],
      packageScanner: [
        1,
        1,
        '30dfdbadb60779cc03ab226ae6bcce5e5116c4d3872a5538adc8f94637b236b3',
      ],
    }),
    scannerResidualMode: 'source-replay-state',
    correctedRawScannerUnits: 1,
    correctedRawScannerResidues: 3,
    correctedRawScannerResidueIdentitiesSha256:
      '083b22e8e745cca877122de4f1a76f7896c24e7f4100d5e72fb68641cd8adaba',
    correctedPackageScannerUnits: 1,
    correctedPackageScannerResidues: 1,
    correctedPackageScannerResidueIdentitiesSha256:
      '30dfdbadb60779cc03ab226ae6bcce5e5116c4d3872a5538adc8f94637b236b3',
  },
  importedTarget119OwnerCorrection({
    id: 'target119-headless-classifier-summary-strict-property',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/headless-classifier-summary-strict-property-owner-overrides.mjs',
    moduleSha256:
      '66a16d26f1afe5ede891300ff955a391390064a008601a3f62f77c1bef0ced8e',
    proof:
      'recovery/test/recovery-2.1.119-headless-classifier-summary-strict-property-owner-proof.json',
    proofSha256:
      'bf06768c07f633989cc544fba72457710e7322800c59ac9f874d6b99e3e66500',
    test:
      'recovery/test/recovery-2.1.119-headless-classifier-summary-strict-property-owner-proof.test.mjs',
    testSha256:
      '3d7b95bfe79527d0c10ad2e36e315d35d2cdbf5e47c6dff2f222ff546ee960ab',
    overrideRows:
      TARGET119_HEADLESS_CLASSIFIER_SUMMARY_STRICT_PROPERTY_OWNER_OVERRIDES,
    mapping: [
      1,
      7,
      7,
      '0afe94fe48ad4479ef47858210440944e0672995ba58dac86c28911c12159af0',
      '432d76f028d6a48266105be8b325454af765fe4bb37f69680fd70faa746f88e7',
    ],
    rawScanner: [
      1,
      7,
      '5e2e13560a8bc078b4bb63b2403209943925643690870638f4dbe84869dce9dc',
    ],
    packageScanner: [
      1,
      7,
      '5e2e13560a8bc078b4bb63b2403209943925643690870638f4dbe84869dce9dc',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-headless-streaming-strict-residue',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/headless-streaming-strict-residue-owner-overrides.mjs',
    moduleSha256:
      '22ff5f0ea8e5917c768cf56aadd76a021b14b1682503e28c7cc7b54ba27cd253',
    proof:
      'recovery/test/recovery-2.1.119-headless-streaming-strict-residue-owner-proof.json',
    proofSha256:
      '138ada13ecf04d5033617a74e4d7a6a505d5a2643f8c722cb256af6419abcbe5',
    test:
      'recovery/test/recovery-2.1.119-headless-streaming-strict-residue-owner-proof.test.mjs',
    testSha256:
      'ee2f417e30998993e2a127ca569fd179d1d474034e551679db86974898b3a282',
    overrideRows: TARGET119_HEADLESS_STREAMING_STRICT_RESIDUE_OWNER_OVERRIDES,
    mapping: [
      1,
      64,
      58,
      'c3173f95417e444ecb925a0994e48518c1ad44249e44539bae86829d80c22030',
      '8fa6c8fd361b449ba16a0f51e993dc3cde90e4bde3a875c20ce4e4be350ab3d1',
    ],
    rawScanner: [
      1,
      64,
      '1fe938d2b3fe059edf851f550f34a4824dc40da11833a72ee6914c22527f4f5e',
    ],
    packageScanner: [
      1,
      64,
      '1fe938d2b3fe059edf851f550f34a4824dc40da11833a72ee6914c22527f4f5e',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-mcp-entrypoint-task-registry-strict-property',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/mcp-entrypoint-task-registry-strict-property-owner-overrides.mjs',
    moduleBytes: 2_373,
    moduleSha256:
      '78ef9b62c1389482a35474d624f25ac529f991fb4b661d99bf55bd735e7e775f',
    proof:
      'recovery/test/recovery-2.1.119-mcp-entrypoint-task-registry-strict-property-owner-proof.json',
    proofBytes: 23_531,
    proofSha256:
      'a222e5ba8884f5429405249d7bdbcc2a34dad1507b095329c6ce15237511e0b2',
    test:
      'recovery/test/recovery-2.1.119-mcp-entrypoint-task-registry-strict-property-owner-proof.test.mjs',
    testBytes: 32_694,
    testSha256:
      '0f689dc9fffb3168e33d5057242f21926849af096f5712308b76d0388518c9bd',
    overrideRows:
      TARGET119_MCP_ENTRYPOINT_TASK_REGISTRY_STRICT_PROPERTY_OWNER_OVERRIDES,
    mapping: [
      1,
      7,
      4,
      'e2e1990b85f697f949ecdf23adeb10d19bd84a88b2839d6b1264e355fccca372',
      '02e28175a17139b280e33be67302c440b935c6eb8342512af5f3ab6eb4fec485',
    ],
    rawScanner: [
      1,
      7,
      '4d1d5bccf6a63c9be6f0e679bb52413a22ea00e19417fa70850a5aa7f2031e19',
    ],
    packageScanner: [
      1,
      7,
      '4d1d5bccf6a63c9be6f0e679bb52413a22ea00e19417fa70850a5aa7f2031e19',
    ],
  }),
  importedTarget119OwnerCorrection({
    id: 'target119-main-run-build-profile',
    module:
      'recovery/cases/2.1.118-to-2.1.119/recovered/main-run-build-profile-owner-overrides.mjs',
    moduleBytes: 1_742,
    moduleSha256:
      '49b3ef98ee4f0a60485033672764ddc7ed0a0627296a02c78a256ac5641f8ae4',
    proof:
      'recovery/test/recovery-2.1.119-main-run-build-profile-owner-proof.json',
    proofBytes: 19_507,
    proofSha256:
      'ad3b6d0e77bdaf4c816d562b504eade06ee574e92b6f624cc61250ea518fe2ed',
    test:
      'recovery/test/recovery-2.1.119-main-run-build-profile-owner-proof.test.mjs',
    testBytes: 31_171,
    testSha256:
      '759fde04027f8a406fd8b1ec277f819538d615091fb8e07d641eacec23931c1a',
    overrideRows: TARGET119_MAIN_RUN_BUILD_PROFILE_OWNER_OVERRIDES,
    mapping: [
      1,
      59,
      51,
      'c3fe509e7191583d91c6ffe20541836646bbf83c20feafd2e94e3a509f9bb62b',
      'f1ae19573612d34d6a7d606014c759990cf9488881f0aa978956a6ca23efed4f',
    ],
    rawScanner: [
      1,
      59,
      'a4b933a31497e7385f74c459f7c7495c7df51f85da78c73ba3b2966143c846ea',
    ],
    packageScanner: [
      1,
      59,
      'a4b933a31497e7385f74c459f7c7495c7df51f85da78c73ba3b2966143c846ea',
    ],
  }),
]

const target119MatchedStaticProofDescriptors = [
  {
    id: 'target119-approve-api-key-retained-confirmation',
    path:
      'recovery/test/recovery-2.1.119-approve-api-key-retained-confirmation-owner-proof.json',
    sha256:
      '852fcb399e99a80dbb191ab497ed8a645fb3a40206fe16077464ef4546327a1d',
    modulePath:
      'recovery/cases/2.1.118-to-2.1.119/recovered/approve-api-key-retained-confirmation-owner-overrides.mjs',
    moduleSha256:
      '59a345333077561d4a5f8a807010bce2a3036073e72e0853f2a9e96dab0ca16a',
    testPath:
      'recovery/test/recovery-2.1.119-approve-api-key-retained-confirmation-owner-proof.test.mjs',
    testSha256:
      '54a345d31e2d444b8252f859c73547e4fe0a46621eeb5875e224c824f2b9af3c',
    overrideRows: TARGET119_APPROVE_API_KEY_RETAINED_OWNER_OVERRIDES,
    units: 1,
    residues: 1,
    targetIndicesSha256:
      'f1b4ccc0151898947d51ffe92a2858eb073470cebab3df838e303428bfc1b7bc',
    fixtureResidueIdentitiesSha256:
      '896c0f89cd98a0be93d1cc17074a79383dc2f1012eb340c8765a62c75dbeb7aa',
    residueIdentitiesSha256:
      '423d724b00d2c437dc39e38e0aa349fd11601a747426adbd7314d971fd90ea98',
    analysisPartition: 'matched-static-proof',
    identityMode: 'canonical',
    fixtureShape: 'matched-static-proof',
    scannerResidualMode: 'matched-static-report-row',
    rawScanner: {
      units: 1,
      residues: 1,
      residueIdentitiesSha256:
        '423d724b00d2c437dc39e38e0aa349fd11601a747426adbd7314d971fd90ea98',
    },
    packageScanner: {
      units: 1,
      residues: 1,
      residueIdentitiesSha256:
        '423d724b00d2c437dc39e38e0aa349fd11601a747426adbd7314d971fd90ea98',
    },
  },
  {
    id: 'target119-retained-confirmation-cluster',
    path:
      'recovery/test/recovery-2.1.119-onboarding-retained-confirmation-owner-proof.json',
    sha256:
      'afff6726d1284b8329cb1bd5ebee030eaf48d27102ba741e57fc3d7c3436396a',
    modulePath:
      'recovery/cases/2.1.118-to-2.1.119/recovered/onboarding-retained-confirmation-owner-overrides.mjs',
    moduleSha256:
      'c8fea395d3a3255653f2107531e26b21f4444921b45ead76fcb03d99a4df495e',
    testPath:
      'recovery/test/recovery-2.1.119-onboarding-retained-confirmation-owner-proof.test.mjs',
    testSha256:
      '9e902b9eaab17b3fd4bc55d2676bb009198f60aaba0ba55480fa2f1be5751ddd',
    overrideRows: TARGET119_RETAINED_CONFIRMATION_CLUSTER_OWNER_OVERRIDES,
    units: 4,
    residues: 9,
    targetIndicesSha256:
      'dbf2df267edc6cb47882ed814becd1feddaaa9fc418650a8aa74483a4f44e827',
    fixtureResidueIdentityField: 'strictResidueIdentitiesSha256',
    fixtureResidueIdentitiesSha256:
      'fc516aefbe96cb17442d69936bde46ba0ee0664bbbce130d366c4db48d9a1015',
    residueIdentitiesSha256:
      'fc516aefbe96cb17442d69936bde46ba0ee0664bbbce130d366c4db48d9a1015',
    crossReleaseUnits: 12,
    crossReleaseUnitsSha256:
      '41d1c3668b2a4561add76c0e140ce906af700e647880ff93ab1d3293d0683666',
    analysisPartition: 'matched-static-proof',
    identityMode: 'canonical',
    fixtureShape: 'matched-static-proof',
    scannerResidualMode: 'matched-static-report-row',
    rawScanner: {
      units: 4,
      residues: 9,
      residueIdentitiesSha256:
        'fc516aefbe96cb17442d69936bde46ba0ee0664bbbce130d366c4db48d9a1015',
    },
    packageScanner: {
      units: 4,
      residues: 9,
      residueIdentitiesSha256:
        'fc516aefbe96cb17442d69936bde46ba0ee0664bbbce130d366c4db48d9a1015',
    },
  },
  {
    id: 'target119-computer-use-setup-retained',
    path:
      'recovery/test/recovery-2.1.119-computer-use-setup-retained-owner-proof.json',
    sha256:
      '38640f13ac0c39fb8105c538196bf2aa664553af0fcb4cc21be7099c586e6fbb',
    modulePath:
      'recovery/cases/2.1.118-to-2.1.119/recovered/computer-use-setup-retained-owner-overrides.mjs',
    moduleSha256:
      '81805249509dafbd8c90bee1e89329982d4657ae161cff0bb2451452bed57d3b',
    testPath:
      'recovery/test/recovery-2.1.119-computer-use-setup-retained-owner-proof.test.mjs',
    testSha256:
      '8164cc82fb0776a37a183b6987ba5e0cded2d36c1265bfd9140f4251e923b9f1',
    overrideRows: TARGET119_COMPUTER_USE_SETUP_RETAINED_OWNER_OVERRIDES,
    units: 1,
    residues: 1,
    targetIndicesSha256:
      '340bfdf93cf815fc5de9216a9769561c171895f93b7a71a3a57f562c2fda8eb2',
    fixtureResidueIdentityField: 'strictResidueIdentitiesSha256',
    fixtureResidueIdentitiesSha256:
      'df675edad3b28e9ceb3a8dae8f761c9df2796d8d89c1cd0c7b320ce3899f774a',
    residueIdentitiesSha256:
      '8211248847a8a2cd8e6194ec14c0481e69641d026bb208ecad8ec93b0b63d774',
    analysisPartition: 'matched-static-proof',
    identityMode: 'canonical',
    fixtureShape: 'matched-static-proof',
    scannerResidualMode: 'matched-static-report-row',
    rawScanner: {
      units: 1,
      residues: 1,
      residueIdentitiesSha256:
        '8211248847a8a2cd8e6194ec14c0481e69641d026bb208ecad8ec93b0b63d774',
    },
    packageScanner: {
      units: 1,
      residues: 1,
      residueIdentitiesSha256:
        '8211248847a8a2cd8e6194ec14c0481e69641d026bb208ecad8ec93b0b63d774',
    },
  },
  {
    id: 'target119-iterm-copy-file-strict-property',
    path:
      'recovery/test/recovery-2.1.119-iterm-copy-file-strict-property-owner-proof.json',
    sha256:
      '4ad482358b6158689114b607de70229cb75118e48b975687c288b6ba34cbcbc2',
    modulePath:
      'recovery/cases/2.1.118-to-2.1.119/recovered/iterm-copy-file-strict-property-owner-overrides.mjs',
    moduleSha256:
      'a657a4c3751440ac770e13c8c90fd0155d074269859f9737a8c2acb4b127731a',
    testPath:
      'recovery/test/recovery-2.1.119-iterm-copy-file-strict-property-owner-proof.test.mjs',
    testSha256:
      '15de68ebf632a60df71b6ffa77ea4e30ada89038200464e188db96f1fc4d08a7',
    overrideRows: TARGET119_ITERM_COPY_FILE_STRICT_PROPERTY_OWNER_OVERRIDES,
    units: 1,
    residues: 1,
    targetIndicesSha256:
      '1adcde5e13228130cfa84acb01f21c95ec32b68467538ddc9fd80885cc66b7c9',
    residueIdentitiesSha256:
      'edc203c0102e78781af69d9127ec88c4a49f094d4ccda035636d7765074cc0d0',
    fixtureSummaryMode: 'impact',
    fixtureMatchedRowsMode: 'snapshot-typed-residues',
    analysisPartition: 'matched-static-proof',
    identityMode: 'canonical',
    fixtureShape: 'matched-static-proof',
    scannerResidualMode: 'matched-static-report-row',
    rawScanner: {
      units: 1,
      residues: 1,
      residueIdentitiesSha256:
        'edc203c0102e78781af69d9127ec88c4a49f094d4ccda035636d7765074cc0d0',
    },
    packageScanner: {
      units: 1,
      residues: 1,
      residueIdentitiesSha256:
        'edc203c0102e78781af69d9127ec88c4a49f094d4ccda035636d7765074cc0d0',
    },
  },
]

const target119BootstrapReplayDescriptor = {
  path:
    'recovery/test/recovery-2.1.119-bootstrap-additional-model-costs-source-gap.json',
  sha256:
    '4dcd5bc3119d85076aaa8b58d220b7db73392030c41bf52fd3ef3d1af2f4f064',
}

const target119LaterDonorRuntimeReplayDescriptor = {
  path:
    'recovery/test/recovery-2.1.119-later-donor-runtime-source-gaps.json',
  sha256:
    'c38161dce98a7a5e91a167e6a6300c1f50d6e47816d52b2b13f45a8cdf8a1a0c',
}

const target119SdkRateLimitReplayDescriptor = {
  path:
    'recovery/test/recovery-2.1.119-sdk-rate-limit-fetch-error-source-gap.json',
  sha256:
    'd8cef29f92fef05f01c580d3db721f6caeac7cff5bde9e47712a6e3f3564e51d',
}

const target119UdsRegistryReplayDescriptor = {
  path: 'recovery/test/recovery-2.1.119-uds-registry-source-gap.json',
  sha256:
    '70b9bc56d9c2a4efef2bb5e04c2de1b5e34a95b5cbd82f36e5f0c5c113247fc9',
}

const target119PushNotificationConfigReplayDescriptor = {
  path:
    'recovery/test/recovery-2.1.119-push-notification-config-source-gap.json',
  sha256:
    '3f06329aab18fabb2483a28eeb9a95fb478ce638c0c0c65daf00bb336c665413',
}

const target119SetupRendezvousReplayDescriptor = {
  path:
    'recovery/test/recovery-2.1.119-setup-rendezvous-server-strict-property-source-gap.json',
  sha256:
    '004c2df8da729923878cc9dbee3faa2e2d6e059ba1106cf6ee6414591558b210',
}

const target119LateReplayDescriptors = new Map([
  [
    'target119-entrypoint-routing',
    {
      path:
        'recovery/test/recovery-2.1.119-entrypoint-routing-source-gap.json',
      sha256:
        '1a2934071c662ca56f20a21955b5f0318a8c6aab7088beb606f0c912ed895d5a',
      label: 'Target119 entrypoint-routing replay',
      sourcePairs: replay =>
        replay.inputs.sourceFiles.map(source => ({
          path: source.path,
          before: source.input,
          after: source.output,
        })),
    },
  ],
  [
    'target119-datadog-event-catalog',
    {
      path:
        'recovery/test/recovery-2.1.119-datadog-event-catalog-source-gap.json',
      sha256:
        '4bfd91af1902095e0d4a5acec54a4b31d15e6a6c3635509ffe9c7937fa618821',
      label: 'Target119 Datadog event-catalog replay',
      sourcePairs: replay => [
        {
          path: replay.inputs.sourceFile.path,
          before: replay.inputs.sourceFile.input,
          after: replay.inputs.sourceFile.output,
        },
      ],
    },
  ],
  [
    'target119-slate-meadow-background-agent',
    {
      path:
        'recovery/test/recovery-2.1.119-slate-meadow-background-agent-source-gap.json',
      sha256:
        '7dd83ff34c2a42affc66c2fee0a294638282762167d2829970d0f2a9841be59e',
      label: 'Target119 slate-meadow background-agent replay',
      sourcePairs: replay => [
        {
          path: replay.inputs.builtInAgents.path,
          before: replay.inputs.builtInAgents.input,
          after: replay.inputs.builtInAgents.output,
        },
        {
          path: replay.inputs.backgroundAgent.path,
          before: replay.inputs.backgroundAgent.input,
          after: replay.inputs.backgroundAgent.output,
        },
      ],
    },
  ],
  [
    'target119-graceful-shutdown-output-errors',
    {
      path:
        'recovery/test/recovery-2.1.119-graceful-shutdown-output-errors-source-gap.json',
      sha256:
        '833cada36204e6a6c4155e2da249d5391af0ef9d3e8af19e6e9c9b0e22c6fdf5',
      label: 'Target119 graceful-shutdown output-errors replay',
      sourcePairs: replay =>
        replay.sourceFiles.map(source => ({
          path: source.path,
          before: source.input,
          after: source.output,
        })),
    },
  ],
  [
    'target119-mcp-terminal-error-boundary',
    {
      path:
        'recovery/test/recovery-2.1.119-mcp-terminal-error-boundary-source-gap.json',
      sha256:
        'e14a914b38424036d3b50bc15a1187a4bd923f6e00ea6511ec4a5eb183e6e9d2',
      label: 'Target119 MCP terminal-error boundary replay',
      sourcePairs: replay => [
        {
          path: replay.sourceFile.path,
          before: replay.sourceFile.input,
          after: replay.sourceFile.output,
        },
      ],
    },
  ],
  [
    'target119-binary-command-validation',
    {
      path:
        'recovery/test/recovery-2.1.119-binary-command-validation-source-gap.json',
      sha256:
        '39c276733f1a1e547125cc6fa51f3436ac758ec58c0cc2dc9c79ef61d673fabf',
      label: 'Target119 binary command-validation replay',
      sourcePairs: replay => [
        {
          path: replay.source.path,
          before: replay.source.input,
          after: replay.source.output,
        },
      ],
    },
  ],
  [
    'target119-messages-readonly-skills-context',
    {
      path:
        'recovery/test/recovery-2.1.119-messages-readonly-skills-context-source-gap.json',
      sha256:
        'aecc56fd92eb7a62db1bc47fe82aa349e649615c0e458adeb390c7d519eae6d1',
      label: 'Target119 messages read-only/skills-context replay',
      sourcePairs: replay => [
        {
          path: replay.inputs.sourcePreimage.path,
          before: replay.inputs.sourcePreimage,
          after: replay.inputs.sourcePostimage,
        },
      ],
    },
  ],
])

function target119LateReplaySourceState(descriptorId) {
  const descriptor = target119LateReplayDescriptors.get(descriptorId)
  assert.ok(descriptor, `Target119 late replay descriptor ${descriptorId}`)
  const replay = readPinnedJson(descriptor, descriptor.label)
  const states = descriptor.sourcePairs(replay).map(source => {
    const filename = path.join(
      sourceRoot,
      source.path.replace(/^src\//, ''),
    )
    const stat = fs.statSync(filename, { throwIfNoEntry: false })
    if (!stat && source.before === null) return 'raw'
    assert.ok(stat, `${descriptor.label}: source ${source.path} exists`)
    const bytes = fs.readFileSync(filename)
    const actual = { bytes: bytes.length, sha256: sha256(bytes) }
    if (
      source.before !== null &&
      actual.bytes === source.before.bytes &&
      actual.sha256 === source.before.sha256
    ) {
      return 'raw'
    }
    if (
      actual.bytes === source.after.bytes &&
      actual.sha256 === source.after.sha256
    ) {
      return 'package'
    }
    assert.fail(
      `${descriptor.label}: source ${source.path} is neither exact raw nor recovered postimage: ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  })
  assert.equal(
    new Set(states).size,
    1,
    `${descriptor.label} is atomic across all source paths`,
  )
  return states[0]
}

function target119BootstrapReplaySourceState() {
  const replay = readPinnedJson(
    target119BootstrapReplayDescriptor,
    'Target119 bootstrap additional-model-cost replay',
  )
  const bytes = fs.readFileSync(
    path.join(
      sourceRoot,
      replay.inputs.sourcePreimage.path.replace(/^src\//, ''),
    ),
  )
  const actual = { bytes: bytes.length, sha256: sha256(bytes) }
  for (const [state, expected] of [
    ['raw', replay.inputs.sourcePreimage],
    ['package', replay.inputs.sourcePostimage],
  ]) {
    if (
      actual.bytes === expected.bytes &&
      actual.sha256 === expected.sha256
    ) {
      return state
    }
  }
  assert.fail(
    'Target119 bootstrap source is neither exact raw nor recovered postimage: ' +
      `${actual.bytes}/${actual.sha256}`,
  )
}

function target119LaterDonorRuntimeReplaySourceState() {
  const replay = readPinnedJson(
    target119LaterDonorRuntimeReplayDescriptor,
    'Target119 later-donor runtime replay',
  )
  const states = replay.inputs.sourceFiles.map(source => {
    const bytes = fs.readFileSync(
      path.join(sourceRoot, source.path.replace(/^src\//, '')),
    )
    const actual = { bytes: bytes.length, sha256: sha256(bytes) }
    if (
      actual.bytes === source.before.bytes &&
      actual.sha256 === source.before.sha256
    ) {
      return 'raw'
    }
    if (
      actual.bytes === source.after.bytes &&
      actual.sha256 === source.after.sha256
    ) {
      return 'package'
    }
    assert.fail(
      `Target119 later-donor source ${source.path} is neither exact raw nor recovered postimage: ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  })
  const unique = new Set(states)
  assert.equal(
    unique.size,
    1,
    'Target119 later-donor runtime replay is atomic across all three source files',
  )
  return states[0]
}

function target119SdkRateLimitReplaySourceState() {
  const replay = readPinnedJson(
    target119SdkRateLimitReplayDescriptor,
    'Target119 SDK rate-limit fetch-error replay',
  )
  const states = replay.inputs.sourceFiles.map(source => {
    const bytes = fs.readFileSync(
      path.join(sourceRoot, source.path.replace(/^src\//, '')),
    )
    const actual = { bytes: bytes.length, sha256: sha256(bytes) }
    if (
      actual.bytes === source.before.bytes &&
      actual.sha256 === source.before.sha256
    ) {
      return 'raw'
    }
    if (
      actual.bytes === source.after.bytes &&
      actual.sha256 === source.after.sha256
    ) {
      return 'package'
    }
    assert.fail(
      `Target119 SDK replay source ${source.path} is neither exact raw nor recovered postimage: ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  })
  assert.equal(
    new Set(states).size,
    1,
    'Target119 SDK rate-limit replay is atomic across both source files',
  )
  return states[0]
}

function target119UdsRegistryReplaySourceState() {
  const replay = readPinnedJson(
    target119UdsRegistryReplayDescriptor,
    'Target119 UDS registry replay',
  )
  const bytes = fs.readFileSync(
    path.join(
      sourceRoot,
      replay.inputs.sourcePreimage.path.replace(/^src\//, ''),
    ),
  )
  const actual = { bytes: bytes.length, sha256: sha256(bytes) }
  for (const [state, expected] of [
    ['raw', replay.inputs.sourcePreimage],
    ['package', replay.inputs.sourcePostimage],
  ]) {
    if (
      actual.bytes === expected.bytes &&
      actual.sha256 === expected.sha256
    ) {
      return state
    }
  }
  assert.fail(
    'Target119 UDS registry source is neither exact raw nor recovered postimage: ' +
      `${actual.bytes}/${actual.sha256}`,
  )
}

function target119PushNotificationConfigReplaySourceState() {
  const replay = readPinnedJson(
    target119PushNotificationConfigReplayDescriptor,
    'Target119 push-notification config replay',
  )
  const states = replay.inputs.sourceFiles.map(source => {
    const bytes = fs.readFileSync(
      path.join(sourceRoot, source.path.replace(/^src\//, '')),
    )
    const actual = { bytes: bytes.length, sha256: sha256(bytes) }
    for (const [state, expected] of [
      ['raw', source.input],
      ['package', source.output],
    ]) {
      if (
        actual.bytes === expected.bytes &&
        actual.sha256 === expected.sha256
      ) {
        return state
      }
    }
    assert.fail(
      `Target119 push-notification source ${source.path} is neither raw nor recovered postimage: ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  })
  assert.equal(
    new Set(states).size,
    1,
    'Target119 push-notification config replay is atomic across both source files',
  )
  return states[0]
}

function target119SetupRendezvousReplaySourceState() {
  const replay = readPinnedJson(
    target119SetupRendezvousReplayDescriptor,
    'Target119 setup-rendezvous replay',
  )
  const sourcePath = replay.sourceReplay.path
  const bytes = fs.readFileSync(
    path.join(sourceRoot, sourcePath.replace(/^src\//, '')),
  )
  const actual = { bytes: bytes.length, sha256: sha256(bytes) }
  const states = new Set()
  for (const variant of replay.sourceReplay.variants) {
    if (
      actual.bytes === variant.input.bytes &&
      actual.sha256 === variant.input.sha256
    ) {
      states.add('raw')
    }
    if (
      actual.bytes === variant.output.bytes &&
      actual.sha256 === variant.output.sha256
    ) {
      states.add('package')
    }
  }
  assert.equal(
    states.size,
    1,
    'Target119 setup-rendezvous source is one exact raw or recovered variant',
  )
  return [...states][0]
}

function target119SourceReplayState(descriptorId) {
  if (descriptorId === 'target119-bootstrap-additional-model-costs') {
    return target119BootstrapReplaySourceState()
  }
  if (descriptorId === 'target119-later-donor-runtime') {
    return target119LaterDonorRuntimeReplaySourceState()
  }
  if (descriptorId === 'target119-sdk-rate-limit-fetch-error') {
    return target119SdkRateLimitReplaySourceState()
  }
  if (descriptorId === 'target119-uds-registry') {
    return target119UdsRegistryReplaySourceState()
  }
  if (descriptorId === 'target119-push-notification-config') {
    return target119PushNotificationConfigReplaySourceState()
  }
  if (descriptorId === 'target119-setup-rendezvous-server-strict-property') {
    return target119SetupRendezvousReplaySourceState()
  }
  if (target119LateReplayDescriptors.has(descriptorId)) {
    return target119LateReplaySourceState(descriptorId)
  }
  assert.fail(`Unknown Target119 source-replay group ${descriptorId}`)
}

function target118ReplaySourceState() {
  const sessions = readPinnedJson(
    target118ReplayPackage.fixtures.sessions,
    'Target118 Sessions replay',
  )
  const strict = readPinnedJson(
    target118ReplayPackage.fixtures.strict,
    'Target118 strict replay',
  )
  const oauth = readPinnedJson(
    target118ReplayPackage.fixtures.oauth,
    'Target118 OAuth replay',
  )
  const errorTelemetry = readPinnedJson(
    target118ReplayPackage.fixtures.errorTelemetry,
    'Target118 error telemetry replay',
  )
  const themePicker = readPinnedJson(
    target118ReplayPackage.fixtures.themePicker,
    'Target118 theme-picker replay',
  )
  const scheduleOneOff = readPinnedJson(
    target118ReplayPackage.fixtures.scheduleOneOff,
    'Target118 schedule one-off replay',
  )
  const commandAliasSelection = readPinnedJson(
    target118ReplayPackage.fixtures.commandAliasSelection,
    'Target118 command-alias selection replay',
  )
  const collapsedShellLabel = readPinnedJson(
    target118ReplayPackage.fixtures.collapsedShellLabel,
    'Target118 collapsed-shell label replay',
  )
  const sessionMemoryLastMessage = readPinnedJson(
    target118ReplayPackage.fixtures.sessionMemoryLastMessage,
    'Target118 session-memory last-message replay',
  )
  const mcpToolHook = readPinnedJson(
    target118ReplayPackage.fixtures.mcpToolHook,
    'Target118 MCP-tool hook replay',
  )
  const mcpClientAccessor = readPinnedJson(
    target118ReplayPackage.fixtures.mcpClientAccessor,
    'Target118 MCP-client accessor replay',
  )
  const parserStreamingTail = readPinnedJson(
    target118ReplayPackage.fixtures.parserStreamingTail,
    'Target118 parser streaming-tail replay',
  )
  const codeSessionCompat = readPinnedJson(
    target118ReplayPackage.fixtures.codeSessionCompat,
    'Target118 code-session compatibility replay',
  )
  const frameUrls = readPinnedJson(
    target118ReplayPackage.fixtures.frameUrls,
    'Target118 frameUrls replay',
  )
  const skillAuthorByline = readPinnedJson(
    target118ReplayPackage.fixtures.skillAuthorByline,
    'Target118 Skill author-byline replay',
  )
  const taskStopOwnerNotification = readPinnedJson(
    target118ReplayPackage.fixtures.taskStopOwnerNotification,
    'Target118 task-stop owner-notification replay',
  )
  const standaloneInProcessRunner = readPinnedJson(
    target118ReplayPackage.fixtures.standaloneInProcessRunner,
    'Target118 standalone in-process runner replay',
  )
  const fileReadPowerShellNotebookHint = readPinnedJson(
    target118ReplayPackage.fixtures.fileReadPowerShellNotebookHint,
    'Target118 FileReadTool PowerShell notebook-hint replay',
  )
  const searchBoxDimRangeCursor = readPinnedJson(
    target118ReplayPackage.fixtures.searchBoxDimRangeCursor,
    'Target118 SearchBox dim-range/cursor replay',
  )
  const warmResumeSessionKind = readPinnedJson(
    target118ReplayPackage.fixtures.warmResumeSessionKind,
    'Target118 WarmResume session-kind replay',
  )
  const virtualScrollAppendSnapshot = readPinnedJson(
    target118ReplayPackage.fixtures.virtualScrollAppendSnapshot,
    'Target118 virtual-scroll append-snapshot replay',
  )
  const tuiTelemetry = readPinnedJson(
    target118ReplayPackage.fixtures.tuiTelemetry,
    'Target118 TUI telemetry replay',
  )
  const fastCommandThinClientDispatch = readPinnedJson(
    target118ReplayPackage.fixtures.fastCommandThinClientDispatch,
    'Target118 fast-command thin-client replay',
  )
  const effortCommandThinClientDispatch = readPinnedJson(
    target118ReplayPackage.fixtures.effortCommandThinClientDispatch,
    'Target118 effort-command thin-client replay',
  )
  const voiceModeArgumentRouting = readPinnedJson(
    target118ReplayPackage.fixtures.voiceModeArgumentRouting,
    'Target118 voice-mode argument-routing replay',
  )
  const structuredOutputAlwaysLoad = readPinnedJson(
    target118ReplayPackage.fixtures.structuredOutputAlwaysLoad,
    'Target118 structured-output always-load replay',
  )
  const codeSessionGitContext = readPinnedJson(
    target118ReplayPackage.fixtures.codeSessionGitContext,
    'Target118 code-session git-context replay',
  )
  const proactiveOAuthRefresh = readPinnedJson(
    target118ReplayPackage.fixtures.proactiveOAuthRefresh,
    'Target118 proactive OAuth-refresh replay',
  )
  const restoreCodeDiffStats = readPinnedJson(
    target118ReplayPackage.fixtures.restoreCodeDiffStats,
    'Target118 restore-code diff-stats replay',
  )
  const statusLineFastMode = readPinnedJson(
    target118ReplayPackage.fixtures.statusLineFastMode,
    'Target118 status-line fast-mode replay',
  )
  const feedbackSurveyMessageWrap = readPinnedJson(
    target118ReplayPackage.fixtures.feedbackSurveyMessageWrap,
    'Target118 feedback-survey message-wrap replay',
  )
  const sdkControlInteractions = readPinnedJson(
    target118ReplayPackage.fixtures.sdkControlInteractions,
    'Target118 SDK-control interactions replay',
  )
  const bootstrapAdditionalModelCosts = readPinnedJson(
    target118ReplayPackage.fixtures.bootstrapAdditionalModelCosts,
    'Target118 bootstrap additional-model-costs replay',
  )
  const sessionFile = sessions.replay.sourceFile
  const sessionBytes = fs.readFileSync(
    path.join(sourceRoot, sessionFile.path.replace(/^src\//, '')),
  )
  assert.deepEqual(
    { bytes: sessionBytes.length, sha256: sha256(sessionBytes) },
    { bytes: sessionFile.bytes, sha256: sessionFile.sha256 },
    'Target118 Sessions source remains authenticated',
  )
  const pairs = [
    ...strict.boundedReplay.inputFiles.map((before, index) => ({
      path: before.path,
      before,
      after: strict.boundedReplay.recoveredFiles[index],
      afterAlternates:
        before.path === feedbackSurveyMessageWrap.sourceState.path
          ? feedbackSurveyMessageWrap.sourceState.outputFiles
          : [],
    })),
    ...oauth.inputs.files,
    {
      path: errorTelemetry.inputs.file.path,
      before: errorTelemetry.inputs.file.before,
      after: errorTelemetry.inputs.file.after,
    },
    {
      path: themePicker.inputs.sourcePreimage.path,
      before: themePicker.inputs.sourcePreimage,
      after: themePicker.inputs.sourcePostimage,
    },
    {
      path: scheduleOneOff.inputs.sourcePreimage.path,
      before: scheduleOneOff.inputs.sourcePreimage,
      after: scheduleOneOff.inputs.sourcePostimage,
    },
    ...commandAliasSelection.inputs.sourceFiles.map((before, index) => ({
      path: before.path,
      before,
      after: commandAliasSelection.outputs.sourceFiles[index],
    })),
    {
      path: collapsedShellLabel.inputs.sourceInput.path,
      before: collapsedShellLabel.inputs.sourceInput,
      after: collapsedShellLabel.inputs.sourceOutput,
    },
    {
      path: sessionMemoryLastMessage.inputs.sourceInput.path,
      before: sessionMemoryLastMessage.inputs.sourceInput,
      after: sessionMemoryLastMessage.inputs.sourceOutput,
    },
    ...mcpToolHook.inputs.sourceFiles.map(file => ({
      path: file.path,
      before: file.input,
      after: file.output,
    })),
    ...mcpClientAccessor.inputs.sourceFiles.map(file => ({
      path: file.path,
      before: file.input,
      after: file.output,
    })),
    {
      path: parserStreamingTail.inputs.sourceFile.path,
      before: parserStreamingTail.inputs.sourceFile.input,
      after: parserStreamingTail.inputs.sourceFile.output,
    },
    {
      path: codeSessionCompat.inputs.rawSource.path,
      before: codeSessionCompat.inputs.rawSource,
      after: codeSessionCompat.inputs.recoveredSource,
    },
    ...frameUrls.inputs.sourceFiles.map(file => ({
      path: file.path,
      before: file.input,
      after: file.output,
    })),
    {
      path: skillAuthorByline.inputs.rawSource.path,
      before: skillAuthorByline.inputs.rawSource,
      after: skillAuthorByline.inputs.recoveredSource,
    },
    {
      path: taskStopOwnerNotification.inputs.rawSource.path,
      before: taskStopOwnerNotification.inputs.rawSource,
      after: taskStopOwnerNotification.inputs.postimage,
    },
    ...standaloneInProcessRunner.inputs.rawSource.files.map((before, index) => ({
      path: before.path,
      before,
      after: standaloneInProcessRunner.inputs.recoveredSource.files[index],
    })),
    {
      path: fileReadPowerShellNotebookHint.inputs.rawSource.file.path,
      before: fileReadPowerShellNotebookHint.inputs.rawSource.file,
      after: fileReadPowerShellNotebookHint.inputs.recoveredSource.file,
    },
    {
      path: searchBoxDimRangeCursor.inputs.rawSource.file.path,
      before: searchBoxDimRangeCursor.inputs.rawSource.file,
      beforeAlternates: [searchBoxDimRangeCursor.inputs.inheritedSource.file],
      after: searchBoxDimRangeCursor.inputs.recoveredSource.file,
    },
    ...warmResumeSessionKind.inputs.rawSource.files.map((before, index) => ({
      path: before.path,
      before,
      after: warmResumeSessionKind.inputs.recoveredSource.files[index],
    })),
    {
      path: virtualScrollAppendSnapshot.inputs.rawSource.file.path,
      before: virtualScrollAppendSnapshot.inputs.rawSource.file,
      after: virtualScrollAppendSnapshot.inputs.recoveredSource.file,
    },
    {
      path: tuiTelemetry.inputs.rawSource.file.path,
      before: tuiTelemetry.inputs.rawSource.file,
      after: tuiTelemetry.inputs.recoveredSource.files[0],
    },
    {
      path: fastCommandThinClientDispatch.inputs.rawSource.file.path,
      before: fastCommandThinClientDispatch.inputs.rawSource.file,
      after: fastCommandThinClientDispatch.inputs.recoveredSource.file,
    },
    {
      path: effortCommandThinClientDispatch.inputs.rawSource.file.path,
      before: effortCommandThinClientDispatch.inputs.rawSource.file,
      after: effortCommandThinClientDispatch.inputs.recoveredSource.file,
    },
    {
      path: voiceModeArgumentRouting.inputs.rawSource.file.path,
      before: voiceModeArgumentRouting.inputs.rawSource.file,
      after: voiceModeArgumentRouting.inputs.recoveredSource.file,
    },
    {
      path: structuredOutputAlwaysLoad.sourceReplay.path,
      before: {
        path: structuredOutputAlwaysLoad.sourceReplay.path,
        ...structuredOutputAlwaysLoad.sourceReplay.before,
      },
      after: {
        path: structuredOutputAlwaysLoad.sourceReplay.path,
        ...structuredOutputAlwaysLoad.sourceReplay.after,
      },
    },
    {
      path: codeSessionGitContext.inputs.rawSource.files[0].path,
      before: codeSessionGitContext.inputs.rawSource.files[0],
      after: codeSessionGitContext.inputs.targetSource.files[0],
    },
    {
      path: codeSessionGitContext.inputs.rawSource.files[1].path,
      beforeAbsent: true,
      after: codeSessionGitContext.inputs.targetSource.files[1],
    },
    ...proactiveOAuthRefresh.inputs.rawSource.files.map((before, index) => ({
      path: before.path,
      before,
      after: proactiveOAuthRefresh.inputs.recoveredSource.files[index],
    })),
    {
      path: restoreCodeDiffStats.inputs.rawSource.file.path,
      before: restoreCodeDiffStats.inputs.rawSource.file,
      after: restoreCodeDiffStats.inputs.recoveredSource.file,
    },
    {
      path: statusLineFastMode.inputs.rawSource.file.path,
      before: statusLineFastMode.inputs.rawSource.file,
      after: statusLineFastMode.inputs.recoveredSource.file,
    },
    {
      path: feedbackSurveyMessageWrap.sourceState.path,
      before: feedbackSurveyMessageWrap.sourceState.inputFiles[0],
      beforeAlternates:
        feedbackSurveyMessageWrap.sourceState.inputFiles.slice(1),
      after: feedbackSurveyMessageWrap.sourceState.outputFiles[0],
      afterAlternates:
        feedbackSurveyMessageWrap.sourceState.outputFiles.slice(1),
    },
    {
      path: sdkControlInteractions.sourceReplay.input.path,
      before: sdkControlInteractions.sourceReplay.input,
      after: sdkControlInteractions.sourceReplay.output,
    },
    {
      path: bootstrapAdditionalModelCosts.sourceReplay.input.path,
      before: bootstrapAdditionalModelCosts.sourceReplay.input,
      after: bootstrapAdditionalModelCosts.sourceReplay.output,
    },
  ]
  for (const pair of pairs) {
    assert.equal(pair.after.path ?? pair.path, pair.path)
  }
  const states = pairs.map(pair => {
    const filename = path.join(
      sourceRoot,
      pair.path.replace(/^src\//, ''),
    )
    const stat = fs.statSync(filename, { throwIfNoEntry: false })
    if (pair.beforeAbsent && !stat) return 'raw'
    assert.ok(stat?.isFile(), `Target118 replay source ${pair.path} is a file`)
    const bytes = fs.readFileSync(filename)
    const actual = { bytes: bytes.length, sha256: sha256(bytes) }
    const rawStates = pair.before
      ? [pair.before, ...(pair.beforeAlternates ?? [])]
      : []
    if (
      rawStates.some(
        before =>
          actual.bytes === before.bytes && actual.sha256 === before.sha256,
      )
    ) {
      return 'raw'
    }
    const recoveredStates = [pair.after, ...(pair.afterAlternates ?? [])]
    if (
      recoveredStates.some(
        after =>
          actual.bytes === after.bytes && actual.sha256 === after.sha256,
      )
    ) {
      return 'package'
    }
    assert.fail(
      `Target118 replay source ${pair.path} is neither raw nor recovered: ` +
        `${actual.bytes}/${actual.sha256}`,
    )
  })
  const unique = new Set(states)
  assert.equal(
    unique.size,
    1,
    'Target118 Sessions+strict+OAuth+error-telemetry+theme-picker+schedule+command-alias+collapsed-shell+session-memory+MCP-tool+MCP-client-accessor+parser+code-session+frameUrls+Skill-byline+task-stop+standalone-in-process+FileReadTool+SearchBox+WarmResume+virtual-scroll+TUI+fast-command+effort-command+voice-mode+structured-output+code-session-git-context+proactive-OAuth+restore-code-diff-stats+status-line-fast-mode+feedback-survey-message-wrap+SDK-control-interactions replay state is atomic',
  )
  const state = states[0]
  const scrollConfig = tuiTelemetry.inputs.recoveredSource.files[1]
  const scrollFilename = path.join(
    sourceRoot,
    scrollConfig.path.replace(/^src\//, ''),
  )
  const scrollStat = fs.statSync(scrollFilename, { throwIfNoEntry: false })
  if (state === 'package') {
    assert.ok(scrollStat, 'Target118 packaged TUI scroll config exists')
  }
  if (scrollStat) {
    const scrollBytes = fs.readFileSync(scrollFilename)
    assert.deepEqual(
      { bytes: scrollBytes.length, sha256: sha256(scrollBytes) },
      { bytes: scrollConfig.bytes, sha256: scrollConfig.sha256 },
      'Target118 TUI scroll config is exact when present',
    )
  }
  return state
}

function target118ReplayCoverageState(caseRoot, fixture) {
  const sessions = readPinnedJson(
    target118ReplayPackage.fixtures.sessions,
    'Target118 Sessions replay',
  )
  const strict = readPinnedJson(
    target118ReplayPackage.fixtures.strict,
    'Target118 strict replay',
  )
  const oauth = readPinnedJson(
    target118ReplayPackage.fixtures.oauth,
    'Target118 OAuth replay',
  )
  const errorTelemetry = readPinnedJson(
    target118ReplayPackage.fixtures.errorTelemetry,
    'Target118 error telemetry replay',
  )
  const themePicker = readPinnedJson(
    target118ReplayPackage.fixtures.themePicker,
    'Target118 theme-picker replay',
  )
  const scheduleOneOff = readPinnedJson(
    target118ReplayPackage.fixtures.scheduleOneOff,
    'Target118 schedule one-off replay',
  )
  const commandAliasSelection = readPinnedJson(
    target118ReplayPackage.fixtures.commandAliasSelection,
    'Target118 command-alias selection replay',
  )
  const collapsedShellLabel = readPinnedJson(
    target118ReplayPackage.fixtures.collapsedShellLabel,
    'Target118 collapsed-shell label replay',
  )
  const sessionMemoryLastMessage = readPinnedJson(
    target118ReplayPackage.fixtures.sessionMemoryLastMessage,
    'Target118 session-memory last-message replay',
  )
  const mcpToolHook = readPinnedJson(
    target118ReplayPackage.fixtures.mcpToolHook,
    'Target118 MCP-tool hook replay',
  )
  const mcpClientAccessor = readPinnedJson(
    target118ReplayPackage.fixtures.mcpClientAccessor,
    'Target118 MCP-client accessor replay',
  )
  const parserStreamingTail = readPinnedJson(
    target118ReplayPackage.fixtures.parserStreamingTail,
    'Target118 parser streaming-tail replay',
  )
  const codeSessionCompat = readPinnedJson(
    target118ReplayPackage.fixtures.codeSessionCompat,
    'Target118 code-session compatibility replay',
  )
  const frameUrls = readPinnedJson(
    target118ReplayPackage.fixtures.frameUrls,
    'Target118 frameUrls replay',
  )
  const skillAuthorByline = readPinnedJson(
    target118ReplayPackage.fixtures.skillAuthorByline,
    'Target118 Skill author-byline replay',
  )
  const taskStopOwnerNotification = readPinnedJson(
    target118ReplayPackage.fixtures.taskStopOwnerNotification,
    'Target118 task-stop owner-notification replay',
  )
  const standaloneInProcessRunner = readPinnedJson(
    target118ReplayPackage.fixtures.standaloneInProcessRunner,
    'Target118 standalone in-process runner replay',
  )
  const fileReadPowerShellNotebookHint = readPinnedJson(
    target118ReplayPackage.fixtures.fileReadPowerShellNotebookHint,
    'Target118 FileReadTool PowerShell notebook-hint replay',
  )
  const searchBoxDimRangeCursor = readPinnedJson(
    target118ReplayPackage.fixtures.searchBoxDimRangeCursor,
    'Target118 SearchBox dim-range/cursor replay',
  )
  const warmResumeSessionKind = readPinnedJson(
    target118ReplayPackage.fixtures.warmResumeSessionKind,
    'Target118 WarmResume session-kind replay',
  )
  const virtualScrollAppendSnapshot = readPinnedJson(
    target118ReplayPackage.fixtures.virtualScrollAppendSnapshot,
    'Target118 virtual-scroll append-snapshot replay',
  )
  const tuiTelemetry = readPinnedJson(
    target118ReplayPackage.fixtures.tuiTelemetry,
    'Target118 TUI telemetry replay',
  )
  const fastCommandThinClientDispatch = readPinnedJson(
    target118ReplayPackage.fixtures.fastCommandThinClientDispatch,
    'Target118 fast-command thin-client replay',
  )
  const effortCommandThinClientDispatch = readPinnedJson(
    target118ReplayPackage.fixtures.effortCommandThinClientDispatch,
    'Target118 effort-command thin-client replay',
  )
  const voiceModeArgumentRouting = readPinnedJson(
    target118ReplayPackage.fixtures.voiceModeArgumentRouting,
    'Target118 voice-mode argument-routing replay',
  )
  const structuredOutputAlwaysLoad = readPinnedJson(
    target118ReplayPackage.fixtures.structuredOutputAlwaysLoad,
    'Target118 structured-output always-load replay',
  )
  const codeSessionGitContext = readPinnedJson(
    target118ReplayPackage.fixtures.codeSessionGitContext,
    'Target118 code-session git-context replay',
  )
  const proactiveOAuthRefresh = readPinnedJson(
    target118ReplayPackage.fixtures.proactiveOAuthRefresh,
    'Target118 proactive OAuth-refresh replay',
  )
  const restoreCodeDiffStats = readPinnedJson(
    target118ReplayPackage.fixtures.restoreCodeDiffStats,
    'Target118 restore-code diff-stats replay',
  )
  const statusLineFastMode = readPinnedJson(
    target118ReplayPackage.fixtures.statusLineFastMode,
    'Target118 status-line fast-mode replay',
  )
  const feedbackSurveyMessageWrap = readPinnedJson(
    target118ReplayPackage.fixtures.feedbackSurveyMessageWrap,
    'Target118 feedback-survey message-wrap replay',
  )
  const sdkControlInteractions = readPinnedJson(
    target118ReplayPackage.fixtures.sdkControlInteractions,
    'Target118 SDK-control interactions replay',
  )
  const bootstrapAdditionalModelCosts = readPinnedJson(
    target118ReplayPackage.fixtures.bootstrapAdditionalModelCosts,
    'Target118 bootstrap additional-model-costs replay',
  )
  const analysisMappings = new Map(
    [
      ...fixture.analysis.sourceSupplementGaps,
      ...fixture.analysis.sourceGapReplay.transitiveExactConsensus.mappings,
    ].map(mapping => [mapping.targetIndex, mapping]),
  )
  const compilerMappings = new Map(
    fixture.policy.compilerRepresentationProofs.map(proof => [
      proof.targetIndex,
      {
        ownerPaths: proof.sourceFiles.map(source => source.path),
        provisionalEvidenceIds: [
          'target118-owner-residue-static-ast',
          'target118-owner-residue-semantic-test',
        ],
      },
    ]),
  )
  const oauthBehavior = targetIndex =>
    targetIndex === 11686
      ? 'The authenticated Target118 auth-handler unit persists onboarding flags and trial metadata from the OAuth profile when installing tokens.'
      : 'The authenticated Target118 OAuth unit belongs to the recovered profile/onboarding account graph, including onboarding flags, trial metadata, profile-source selection, error telemetry, persistence, and equality checks.'
  const specs = [
    {
      targetIndex: sessions.replay.ownerOverride.targetIndex,
      provisionalPaths: sessions.proof.provisionalOwnerPaths.map(owner =>
        owner.startsWith('src/') ? owner : `src/${owner}`,
      ),
      correctedPaths: sessions.replay.ownerOverride.paths,
      correctedEvidenceIds: sessions.replay.ownerOverride.evidenceIds,
      correctedBehavior: sessions.replay.ownerOverride.behavior,
    },
    ...strict.rows.map((row, index) => {
      const override = strict.ownerOverrides[index]
      assert.equal(override.targetIndex, row.targetIndex)
      return {
        targetIndex: row.targetIndex,
        provisionalPaths: row.coverageBeforeStrictProof.ownerPaths,
        correctedPaths: override.paths,
        correctedEvidenceIds: override.evidenceIds,
        correctedBehavior: override.behavior,
      }
    }),
    ...oauth.rows.map(row => {
      const mapping = analysisMappings.get(row.targetIndex)
      assert.ok(mapping, `Target118 OAuth u${row.targetIndex}: analysis mapping`)
      return {
        targetIndex: row.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [row.ownerPath],
        correctedEvidenceIds: oauth.evidenceIds,
        correctedBehavior: oauthBehavior(row.targetIndex),
      }
    }),
    ...errorTelemetry.rows.map(row => {
      const mapping = analysisMappings.get(row.targetIndex)
      assert.ok(
        mapping,
        `Target118 error telemetry u${row.targetIndex}: analysis mapping`,
      )
      const correctedBehavior = new Map([
        [
          9866,
          'The authenticated Target118 sanitizer redacts URLs, email addresses, credential-like keys, paths, identifiers, base64 payloads, IP addresses, and long numbers before hashing error metadata.',
        ],
        [
          9867,
          'The authenticated Target118 stack parser extracts bounded function names and the first source-location basename without retaining full paths.',
        ],
        [
          9869,
          'The authenticated Target118 safe-error metadata collector records bounded hashes, error codes, constructors, stack names, and a redacted top frame for uncaught exceptions and rejected promises.',
        ],
      ]).get(row.targetIndex)
      assert.ok(
        correctedBehavior,
        `Target118 error telemetry u${row.targetIndex}: behavior`,
      )
      return {
        targetIndex: row.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [row.ownerPath],
        correctedEvidenceIds: errorTelemetry.evidenceIds,
        correctedBehavior,
      }
    }),
    (() => {
      const mapping = analysisMappings.get(themePicker.targetIndex)
      assert.ok(
        mapping,
        `Target118 theme picker u${themePicker.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: themePicker.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [themePicker.inputs.sourcePostimage.path],
        correctedEvidenceIds: themePicker.evidenceIds,
        correctedBehavior:
          'The authenticated Target118 theme picker uses a picker/editor discriminated state, converts saved slugs through toCustomThemeSetting, recognizes custom settings through fromCustomThemeSetting, and preserves the initial custom theme while editing.',
      }
    })(),
    ...scheduleOneOff.rows.map(replay => {
      const mapping =
        analysisMappings.get(replay.targetIndex) ??
        compilerMappings.get(replay.targetIndex)
      assert.ok(
        mapping,
        `Target118 schedule u${replay.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: replay.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        provisionalEvidenceIds: mapping.provisionalEvidenceIds,
        correctedPaths: [replay.ownerPath],
        correctedEvidenceIds: scheduleOneOff.evidenceIds,
        correctedBehavior: replay.behavior,
      }
    }),
    ...commandAliasSelection.rows.map(replay => {
      const mapping = analysisMappings.get(replay.targetIndex)
      assert.ok(
        mapping,
        `Target118 command alias u${replay.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: replay.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [replay.ownerPath],
        correctedEvidenceIds: commandAliasSelection.evidenceIds,
        correctedBehavior: replay.behavior,
      }
    }),
    ...[collapsedShellLabel, sessionMemoryLastMessage].map(replay => {
      const mapping = analysisMappings.get(replay.row.targetIndex)
      assert.ok(
        mapping,
        `Target118 replay u${replay.row.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: replay.row.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [replay.row.ownerPath],
        correctedEvidenceIds: replay.evidenceIds,
        correctedBehavior: replay.row.behavior,
      }
    }),
    ...mcpToolHook.rows.map(row => {
      const mapping = analysisMappings.get(row.targetIndex)
      assert.ok(
        mapping,
        `Target118 MCP-tool hook u${row.targetIndex}: analysis mapping`,
      )
      const correctedBehavior = new Map([
        [
          12732,
          'Target118 adds exact MCP-tool hook identity comparison by server, tool, normalized input, and conditional expression to isHookEqual; the provisional sessionHooks.ts owner is rejected.',
        ],
        [
          17170,
          'Target118 renders MCP-tool hook display text as server/tool in getHookDisplayText, alongside the pre-existing command, prompt, agent, HTTP, callback, and function cases.',
        ],
        [
          17197,
          'Target118 labels the MCP-tool detail field as MCP tool in the exact getContentFieldLabel declaration.',
        ],
        [
          17198,
          'Target118 renders the MCP-tool detail value as server/tool in the exact getContentFieldValue declaration.',
        ],
      ]).get(row.targetIndex)
      assert.ok(
        correctedBehavior,
        `Target118 MCP-tool hook u${row.targetIndex}: behavior`,
      )
      return {
        targetIndex: row.targetIndex,
        provisionalPaths: [row.provisionalOwnerPath],
        correctedPaths: [row.ownerPath],
        correctedEvidenceIds: mcpToolHook.evidenceIds,
        correctedBehavior,
      }
    }),
    (() => {
      const mapping = analysisMappings.get(mcpClientAccessor.row.targetIndex)
      assert.ok(
        mapping,
        `Target118 MCP-client accessor u${mcpClientAccessor.row.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: mcpClientAccessor.row.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [mcpClientAccessor.row.ownerPath],
        correctedEvidenceIds: mcpClientAccessor.row.evidenceIds,
        correctedBehavior:
          'The authenticated Target118 bootstrap export registry binds the exact parent-settings and cache-diagnosis accessors, the prompt-index incrementer, and the recovered MCP-client accessor. The accessor is installed by interactive AppState lifecycle or headless CLI setup, cleared on provider cleanup, and used only as execMcpToolHook fallback when no explicit client list is supplied.',
      }
    })(),
    (() => {
      const mapping = analysisMappings.get(parserStreamingTail.row.targetIndex)
      assert.ok(
        mapping,
        `Target118 parser u${parserStreamingTail.row.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: parserStreamingTail.row.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [parserStreamingTail.row.ownerPath],
        correctedEvidenceIds: parserStreamingTail.row.evidenceIds,
        correctedBehavior:
          'The authenticated Target118 Parser introduces an optional forOutput mode, a bounded streaming grapheme tail, explicit flush/reset semantics, BEL-aware tail handling, split-surrogate recovery, and ZWJ/regional-indicator continuation protection. The exact authored owner is src/ink/termio/parser.ts, not the coarse sgr.ts attribution.',
      }
    })(),
    ...codeSessionCompat.targetUnits.map(unit => {
      const mapping = analysisMappings.get(unit.index)
      assert.ok(
        mapping,
        `Target118 code-session u${unit.index}: analysis mapping`,
      )
      return {
        targetIndex: unit.index,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [unit.ownerPath],
        correctedEvidenceIds: unit.evidenceIds,
        correctedBehavior: unit.behavior,
      }
    }),
    ...frameUrls.targetUnits.map(unit => {
      const mapping = analysisMappings.get(unit.targetIndex)
      assert.ok(
        mapping,
        `Target118 frameUrls u${unit.targetIndex}: analysis mapping`,
      )
      const correctedBehavior = new Map([
        [
          11049,
          'Target118 default application state owns an empty frameUrls map alongside notification and elicitation state; the recovered AppState declaration and default initializer preserve that exact state shape.',
        ],
        [
          15311,
          'Target118 conversation clearing resets frameUrls to a fresh empty map while preserving eligible background tasks and the MCP reconnect generation.',
        ],
      ]).get(unit.targetIndex)
      assert.ok(
        correctedBehavior,
        `Target118 frameUrls u${unit.targetIndex}: behavior`,
      )
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [unit.ownerPath],
        correctedEvidenceIds: frameUrls.evidenceIds,
        correctedBehavior,
      }
    }),
    ...[skillAuthorByline.row].map(row => {
      const mapping = analysisMappings.get(row.targetIndex)
      assert.ok(
        mapping,
        `Target118 Skill author-byline u${row.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: row.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [row.ownerPath],
        correctedEvidenceIds: row.evidenceIds,
        correctedBehavior: row.behavior,
      }
    }),
    (() => {
      const targetIndex = taskStopOwnerNotification.strictOwnerUnit.targetIndex
      const mapping = analysisMappings.get(targetIndex)
      assert.ok(
        mapping,
        `Target118 task-stop owner-notification u${targetIndex}: analysis mapping`,
      )
      return {
        targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [taskStopOwnerNotification.inputs.postimage.path],
        correctedEvidenceIds: taskStopOwnerNotification.evidenceIds,
        correctedBehavior:
          'Target118 routes a stopped local-shell task notification back to its owning agent, formats the main session or explicit stopper identity in the summary, preserves the optional tool-use ID, and queues the XML notification at next priority.',
      }
    })(),
    ...standaloneInProcessRunner.targetUnits.map(unit => {
      const mapping = analysisMappings.get(unit.index)
      assert.ok(
        mapping,
        `Target118 standalone in-process u${unit.index}: analysis mapping`,
      )
      return {
        targetIndex: unit.index,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [unit.ownerPath],
        correctedEvidenceIds: standaloneInProcessRunner.evidenceIds,
        correctedBehavior: unit.behavior,
      }
    }),
    (() => {
      const unit = fileReadPowerShellNotebookHint.targetUnit
      const mapping = analysisMappings.get(unit.targetIndex)
      assert.ok(
        mapping,
        `Target118 FileReadTool u${unit.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [unit.ownerPath],
        correctedEvidenceIds: fileReadPowerShellNotebookHint.evidenceIds,
        correctedBehavior: unit.behavior,
      }
    })(),
    (() => {
      const unit = searchBoxDimRangeCursor.targetUnit
      const mapping = analysisMappings.get(unit.targetIndex)
      assert.ok(
        mapping,
        `Target118 SearchBox u${unit.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [unit.ownerPath],
        correctedEvidenceIds: searchBoxDimRangeCursor.evidenceIds,
        correctedBehavior: unit.behavior,
      }
    })(),
    ...[warmResumeSessionKind, virtualScrollAppendSnapshot].map(replay => {
      const unit = replay.targetUnit
      const correctedPaths = unit.ownerPaths ?? [unit.ownerPath]
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: [unit.provisionalOwnerPath],
        correctedPaths,
        correctedEvidenceIds: replay.ownerOverride.evidenceIds,
        correctedBehavior: replay.ownerOverride.behavior,
      }
    }),
    {
      targetIndex: tuiTelemetry.targetUnit.targetIndex,
      provisionalPaths: [tuiTelemetry.targetUnit.provisionalOwnerPath],
      correctedPaths: tuiTelemetry.ownerOverride.paths,
      correctedEvidenceIds: tuiTelemetry.ownerOverride.evidenceIds,
      correctedBehavior: tuiTelemetry.ownerOverride.behavior,
    },
    {
      targetIndex: fastCommandThinClientDispatch.targetUnit.targetIndex,
      provisionalPaths: [
        fastCommandThinClientDispatch.targetUnit.provisionalOwnerPath,
      ],
      correctedPaths: fastCommandThinClientDispatch.ownerOverride.paths,
      correctedEvidenceIds:
        fastCommandThinClientDispatch.ownerOverride.evidenceIds,
      correctedBehavior: fastCommandThinClientDispatch.ownerOverride.behavior,
    },
    {
      targetIndex: effortCommandThinClientDispatch.targetUnit.targetIndex,
      provisionalPaths: [
        effortCommandThinClientDispatch.targetUnit.provisionalOwnerPath,
      ],
      correctedPaths: effortCommandThinClientDispatch.ownerOverride.paths,
      correctedEvidenceIds:
        effortCommandThinClientDispatch.ownerOverride.evidenceIds,
      correctedBehavior:
        effortCommandThinClientDispatch.ownerOverride.behavior,
    },
    {
      targetIndex: voiceModeArgumentRouting.targetUnit.targetIndex,
      provisionalPaths: [
        voiceModeArgumentRouting.targetUnit.provisionalOwnerPath,
      ],
      correctedPaths: voiceModeArgumentRouting.ownerOverride.paths,
      correctedEvidenceIds: voiceModeArgumentRouting.ownerOverride.evidenceIds,
      correctedBehavior: voiceModeArgumentRouting.ownerOverride.behavior,
    },
    {
      targetIndex: structuredOutputAlwaysLoad.targetUnit.targetIndex,
      provisionalPaths: [
        structuredOutputAlwaysLoad.targetUnit.provisionalOwnerPath,
      ],
      correctedPaths: structuredOutputAlwaysLoad.ownerOverride.paths,
      correctedEvidenceIds: structuredOutputAlwaysLoad.ownerOverride.evidenceIds,
      correctedBehavior: structuredOutputAlwaysLoad.ownerOverride.behavior,
    },
    (() => {
      const unit = codeSessionGitContext.targetUnit
      const mapping = analysisMappings.get(unit.targetIndex)
      assert.ok(
        mapping,
        `Target118 code-session git-context u${unit.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: codeSessionGitContext.ownerOverride.paths,
        correctedEvidenceIds: codeSessionGitContext.ownerOverride.evidenceIds,
        correctedBehavior: codeSessionGitContext.ownerOverride.behavior,
      }
    })(),
    ...proactiveOAuthRefresh.targetUnits.map(unit => {
      const mapping = analysisMappings.get(unit.targetIndex)
      assert.ok(
        mapping,
        `Target118 proactive OAuth u${unit.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [unit.ownerPath],
        correctedEvidenceIds: proactiveOAuthRefresh.evidenceIds,
        correctedBehavior: unit.behavior,
      }
    }),
    ...[restoreCodeDiffStats, statusLineFastMode].map(replay => {
      const unit = replay.targetUnit
      const mapping = analysisMappings.get(unit.targetIndex)
      assert.ok(
        mapping,
        `Target118 late replay u${unit.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [unit.ownerPath],
        correctedEvidenceIds: replay.evidenceIds,
        correctedBehavior: unit.behavior,
      }
    }),
    (() => {
      const unit = feedbackSurveyMessageWrap.targetUnit
      const mapping = analysisMappings.get(unit.targetIndex)
      assert.ok(
        mapping,
        `Target118 feedback-survey message-wrap u${unit.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: feedbackSurveyMessageWrap.ownerOverride.paths,
        correctedEvidenceIds: feedbackSurveyMessageWrap.evidenceIds,
        correctedBehavior:
          'The authenticated Target117 and Target118 FeedbackSurveyView units both render the survey message with Text wrap="wrap". The recovered raw and strict-transitive source states omit only that retained prop from the matching bold message child, so the replay restores the exact inherited wrapping contract in either pinned state and rejects every mixed or drifting input.',
      }
    })(),
    (() => {
      const unit = sdkControlInteractions.targetUnit
      const mapping = analysisMappings.get(unit.targetIndex)
      assert.ok(
        mapping,
        `Target118 SDK-control interactions u${unit.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [unit.ownerPath],
        correctedEvidenceIds: sdkControlInteractions.evidenceIds,
        correctedBehavior: unit.behavior,
      }
    })(),
    (() => {
      const unit = bootstrapAdditionalModelCosts.targetUnit
      const mapping = analysisMappings.get(unit.targetIndex)
      assert.ok(
        mapping,
        `Target118 bootstrap additional-model-costs u${unit.targetIndex}: analysis mapping`,
      )
      return {
        targetIndex: unit.targetIndex,
        provisionalPaths: mapping.ownerPaths.map(owner =>
          owner.startsWith('src/') ? owner : `src/${owner}`,
        ),
        correctedPaths: [unit.ownerPath],
        correctedEvidenceIds: bootstrapAdditionalModelCosts.evidenceIds,
        correctedBehavior: unit.behavior,
      }
    })(),
  ]
  assert.equal(specs.length, 117, 'Target118 replay coverage units')
  assert.equal(
    new Set(specs.map(spec => spec.targetIndex)).size,
    specs.length,
    'Target118 replay coverage units are disjoint',
  )
  const coverage = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join(caseRoot, 'semantic/source-coverage.json.gz')),
    ),
  )
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const states = new Set()
  for (const spec of specs) {
    const row = rows.get(spec.targetIndex)
    assert.ok(row, `Target118 replay u${spec.targetIndex}: coverage row`)
    const paths = row.ownerIds.map(ownerId => {
      const owner = owners.get(ownerId)
      assert.ok(owner, `Target118 replay u${spec.targetIndex}: owner`)
      return owner
    })
    const provisional =
      JSON.stringify(paths) === JSON.stringify(spec.provisionalPaths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(
          spec.provisionalEvidenceIds ?? [
            'source-map-attribution',
            'semantic-test',
          ],
        )
    const corrected =
      JSON.stringify(paths) === JSON.stringify(spec.correctedPaths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(spec.correctedEvidenceIds) &&
      row.behavior === spec.correctedBehavior
    assert.ok(
      provisional || corrected,
      `Target118 replay u${spec.targetIndex}: exact provisional or corrected coverage`,
    )
    states.add(corrected ? 'corrected' : 'provisional')
  }
  assert.equal(
    states.size,
    1,
    'Target118 Sessions+strict+OAuth+error-telemetry+theme-picker+schedule+command-alias+collapsed-shell+session-memory+MCP-tool+MCP-client-accessor+parser+code-session+frameUrls+Skill-byline+task-stop+standalone-in-process+FileReadTool+SearchBox+WarmResume+virtual-scroll+TUI+fast-command+effort-command+voice-mode+structured-output+code-session-git-context+proactive-OAuth+restore-code-diff-stats+status-line-fast-mode+feedback-survey-message-wrap+SDK-control-interactions coverage corrections are atomic',
  )
  return [...states][0]
}

function readFixture(caseName) {
  const descriptor = fixtureDescriptors.get(caseName)
  assert.ok(descriptor, `${caseName}: fixture descriptor`)
  const filename = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    descriptor.filename,
  )
  const bytes = fs.readFileSync(filename)
  assert.equal(sha256(bytes), descriptor.sha256, `${caseName}: fixture SHA-256`)
  return JSON.parse(bytes)
}

function bundleEnvironmentVariable(version) {
  return `CLAUDE_CODE_${version.replaceAll('.', '_')}_BUNDLE`
}

function canonicalResidue(residue) {
  return [
    residue.structural.index,
    residue.literalKind,
    residue.value,
    residue.target.start,
    residue.target.end,
    residue.baselineOccurrenceCount,
    residue.targetOccurrenceNumber,
  ]
}

function residueDigest(residues) {
  return sha256(Buffer.from(JSON.stringify(residues.map(canonicalResidue))))
}

function unitDigest(indices) {
  return sha256(Buffer.from(JSON.stringify(indices)))
}

function canonicalRowsDigest(rows) {
  return sha256(Buffer.from(JSON.stringify(rows)))
}

function sortCanonicalRows(rows) {
  return [...rows].sort(
    (left, right) =>
      left[0] - right[0] ||
      left[3] - right[3] ||
      left[4] - right[4] ||
      String(left[1]).localeCompare(String(right[1])) ||
      JSON.stringify(left[2]).localeCompare(JSON.stringify(right[2])),
  )
}

function proofResidueIdentity(targetIndex, residue) {
  return [
    targetIndex,
    residue.kind,
    residue.value,
    residue.targetStart ?? residue.start,
    residue.targetEnd ?? residue.end,
    residue.baselineOccurrenceCount ?? residue.baselineCount,
    residue.targetOccurrenceNumber ?? residue.targetOrdinal,
  ]
}

function proofCorrectionDescriptors(caseName, fixture) {
  const overlay = coverageEvolutionOverlays.get(caseName)
  return [
    ...(fixture.policy.coverageEvolution.proofCorrectionGroups ?? []).map(
      descriptor => ({
        ...descriptor,
        ...(overlay?.proofCorrectionGroupUpdates?.find(
          update => update.id === descriptor.id,
        ) ?? {}),
      }),
    ),
    ...(overlay?.proofCorrectionGroups ?? []),
    ...(caseName === '2.1.118-to-2.1.119'
      ? [
          ...target119ImportedOwnerCorrectionDescriptors,
          ...target119MatchedStaticProofDescriptors,
        ]
      : []),
  ]
}

function postProofResidual(caseName, fixture) {
  return (
    coverageEvolutionOverlays.get(caseName)?.postProofResidual ??
    fixture.policy.coverageEvolution.postProofResidual
  )
}

function postProofSourceSupplementResidual(caseName, fixture) {
  return (
    coverageEvolutionOverlays.get(caseName)
      ?.postProofSourceSupplementResidual ??
    fixture.policy.coverageEvolution.postProofSourceSupplementResidual
  )
}

function targetOnlyResidueIdentity(residue) {
  return [
    residue.structural.index,
    residue.literalKind,
    residue.value,
    residue.target.start,
    residue.target.end,
    residue.targetOccurrenceNumber,
  ]
}

function loadProofCorrectionGroups(caseName, fixture) {
  const descriptors = proofCorrectionDescriptors(caseName, fixture)
  const mappings = new Map(
    fixture.analysis.sourceGapReplay.transitiveExactConsensus.mappings.map(
      mapping => [mapping.targetIndex, mapping],
    ),
  )
  const supplementMappings = new Map(
    fixture.analysis.sourceSupplementGaps.map(mapping => [
      mapping.targetIndex,
      mapping,
    ]),
  )
  const groups = descriptors.map(descriptor => {
    const importedOwnerOverride =
      descriptor.fixtureShape === 'imported-owner-override'
    const matchedStaticProof =
      descriptor.fixtureShape === 'matched-static-proof'
    const filename = path.join(repositoryRoot, descriptor.path)
    const bytes = fs.readFileSync(filename)
    if (descriptor.bytes !== undefined) {
      assert.equal(
        bytes.length,
        descriptor.bytes,
        `${caseName}: ${descriptor.id} fixture bytes`,
      )
    }
    assert.equal(
      sha256(bytes),
      descriptor.sha256,
      `${caseName}: ${descriptor.id} fixture SHA-256`,
    )
    const proof = JSON.parse(bytes)
    assert.equal(proof.case, caseName, `${descriptor.id}: proof case`)
    if (descriptor.modulePath || descriptor.testPath) {
      assert.ok(
        descriptor.modulePath &&
          descriptor.moduleSha256 &&
          descriptor.testPath &&
          descriptor.testSha256,
        `${descriptor.id}: complete helper/test artifact pins`,
      )
      for (const [artifactPath, expectedBytes, expectedSha256, label] of [
        [
          descriptor.modulePath,
          descriptor.moduleBytes,
          descriptor.moduleSha256,
          'owner override',
        ],
        [
          descriptor.testPath,
          descriptor.testBytes,
          descriptor.testSha256,
          'proof test',
        ],
      ]) {
        const artifactBytes = fs.readFileSync(
          path.join(repositoryRoot, artifactPath),
        )
        if (expectedBytes !== undefined) {
          assert.equal(
            artifactBytes.length,
            expectedBytes,
            `${descriptor.id}: ${label} bytes`,
          )
        }
        assert.equal(
          sha256(artifactBytes),
          expectedSha256,
          `${descriptor.id}: ${label} SHA-256`,
        )
      }
    }
    if (!importedOwnerOverride) {
      const proofSummary =
        descriptor.fixtureSummaryMode === 'residues-section'
          ? {
              units: proof.residues.unitCount,
              residues: proof.residues.rowCount,
            }
          : descriptor.fixtureSummaryMode === 'impact'
            ? {
                units: proof.impact.provenUnits,
                residues: proof.impact.provenStrictResidues,
              }
          : proof.summary
      assert.equal(proofSummary.units, descriptor.units)
      assert.equal(
        proofSummary[descriptor.fixtureSummaryResidueField ?? 'residues'],
        descriptor.residues,
      )
      if (descriptor.fixtureResidueIdentitiesSha256) {
        assert.equal(
          proofSummary[
            descriptor.fixtureResidueIdentityField ??
              'residueIdentitiesSha256'
          ],
          descriptor.fixtureResidueIdentitiesSha256,
          `${descriptor.id}: fixture residue identities`,
        )
      }
      if (descriptor.crossReleaseUnits !== undefined) {
        assert.equal(
          proofSummary.crossReleaseUnits,
          descriptor.crossReleaseUnits,
          `${descriptor.id}: cross-release unit coordinates`,
        )
        assert.equal(
          proofSummary.crossReleaseUnitsSha256,
          descriptor.crossReleaseUnitsSha256,
          `${descriptor.id}: cross-release coordinate digest`,
        )
      }
    }
    const matchedStaticRows = matchedStaticProof
      ? descriptor.fixtureMatchedRowsMode === 'snapshot-typed-residues'
        ? [
            {
              targetIndex: proof.override.targetIndex,
              structuralLineage: {
                classification:
                  proof.snapshotPartitions.typedResidues[0].structural
                    .classification,
              },
              strictResidues: proof.snapshotPartitions.typedResidues.map(
                residue => ({
                  kind: residue.literalKind,
                  value: residue.value,
                  start: residue.target.start,
                  end: residue.target.end,
                  baselineOccurrenceCount:
                    residue.baselineOccurrenceCount,
                  targetOccurrenceNumber: residue.targetOccurrenceNumber,
                }),
              ),
            },
          ]
        : (proof.rows ?? [proof.row])
      : []
    const proofRows =
      importedOwnerOverride
        ? descriptor.overrideRows.map(row => ({
            targetIndex: row.targetIndex,
            ownerPaths: row.paths,
            evidenceIds: row.evidenceIds,
            behavior: row.behavior,
            residues: [],
          }))
      : matchedStaticProof
        ? descriptor.overrideRows.map(row => {
            const fixtureRow = matchedStaticRows.find(
              candidate => candidate.targetIndex === row.targetIndex,
            )
            assert.ok(
              fixtureRow,
              `${descriptor.id} u${row.targetIndex}: matched-static fixture row`,
            )
            return {
              targetIndex: row.targetIndex,
              ownerPaths: row.paths,
              evidenceIds: row.evidenceIds,
              behavior: row.behavior,
              residues: fixtureRow.strictResidues ?? [fixtureRow.residue],
            }
          })
      : descriptor.fixtureShape === 'single-source-replay'
        ? [
            {
              targetIndex: proof.targetIndex,
              sourceOwner: proof.ownerOverride.paths[0],
              evidenceIds: proof.ownerOverride.evidenceIds,
              behavior: proof.ownerOverride.behavior,
              residues: proof.residues,
            },
          ]
        : descriptor.fixtureShape === 'single-row-static'
          ? [
              {
                targetIndex: proof.row.targetIndex,
                ownerPath: proof.row.ownerPath,
                ownerPaths: proof.row.ownerPaths,
                evidenceIds: proof.evidenceIds,
                behavior: proof.row.behavior,
                residues: proof.row.residues,
              },
            ]
        : descriptor.fixtureShape === 'multi-index-single-row-static'
          ? [...new Set(proof.row.residues.map(residue => residue.targetIndex))]
              .sort((left, right) => left - right)
              .map(targetIndex => ({
                targetIndex,
                ownerPaths: proof.row.ownerPaths,
                evidenceIds: proof.evidenceIds,
                behavior: proof.row.behavior,
                residues: proof.row.residues.filter(
                  residue => residue.targetIndex === targetIndex,
                ),
              }))
        : descriptor.fixtureShape === 'entrypoint-source-replay'
          ? proof.ownerOverrides.map(override => ({
              targetIndex: override.targetIndex,
              ownerPaths: override.paths,
              evidenceIds: override.evidenceIds,
              behavior: override.behavior,
              residues: proof.residueRows.filter(
                residue => residue.targetIndex === override.targetIndex,
              ),
            }))
        : descriptor.fixtureShape ===
            'strict-row-target-only-source-replay'
          ? proof.strictRows.map(row => ({
              targetIndex: row.targetIndex,
              ownerPath: row.ownerPath,
              evidenceIds: row.evidenceIds,
              behavior: row.behavior,
              residues: proof.residueIdentities.filter(
                residue => residue[0] === row.targetIndex,
              ),
            }))
        : descriptor.fixtureShape ===
            'owner-override-target-only-source-replay'
          ? [
              {
                targetIndex: proof.ownerOverride.targetIndex,
                ownerPaths:
                  proof.ownerOverride.ownerPaths ?? proof.ownerOverride.paths,
                evidenceIds: proof.ownerOverride.evidenceIds,
                behavior: proof.ownerOverride.behavior,
                residues: proof.residueIdentities.filter(
                  residue => residue[0] === proof.ownerOverride.targetIndex,
                ),
              },
            ]
        : descriptor.fixtureShape ===
            'single-target-unit-target-only-source-replay'
          ? [
              {
                targetIndex: proof.targetUnit.targetIndex,
                ownerPaths: descriptor.correctedPaths,
                evidenceIds: descriptor.correctedEvidenceIds,
                behavior: descriptor.correctedBehavior,
                residues: [proof.residue.identity],
              },
            ]
        : descriptor.fixtureShape === 'autofix-pr-runtime-static'
          ? [proof.targetCluster.wrapper, proof.targetCluster.core].map(unit => ({
              targetIndex: unit.targetIndex,
              ownerPaths: ['src/commands/autofix-pr/autofix-pr.tsx'],
              evidenceIds: proof.evidenceIds,
              behavior: proof.ownerBehavior,
              residues: proof.ownerResidues.rows
                .filter(residue => residue[0] === unit.targetIndex)
                .map(residue => residue.slice(0, 7)),
            }))
        : descriptor.fixtureShape ===
            'single-target-unit-owner-override-static'
          ? [
              {
                targetIndex: proof.targetUnit.targetIndex,
                ownerPaths: proof.ownerOverride.paths,
                evidenceIds: proof.evidenceIds,
                behavior: descriptor.correctedBehavior,
                residues: proof.targetUnit.residues,
              },
            ]
        : descriptor.fixtureShape === 'single-target-unit-static'
          ? [
              {
                targetIndex: proof.targetUnit.targetIndex,
                ownerPath:
                  proof.sourceProof?.ownerPath ?? proof.transition.ownerPath,
                evidenceIds: proof.evidenceIds,
                behavior: descriptor.correctedBehavior,
                residues: proof.targetUnit.residues,
              },
            ]
        : descriptor.fixtureShape === 'single-target-unit-direct'
          ? [
              {
                targetIndex: proof.targetUnit.targetIndex,
                ownerPath: proof.targetUnit.ownerPath,
                evidenceIds:
                  proof.evidenceIds ?? proof.ownerOverride?.evidenceIds,
                behavior: proof.targetUnit.behavior,
                residues: proof.targetUnit.residues,
              },
            ]
        : descriptor.fixtureShape === 'headless-classifier-dce-static'
          ? [
              {
                targetIndex: proof.targetIndex,
                ownerPath: proof.owner.path,
                evidenceIds: descriptor.correctedEvidenceIds,
                behavior: descriptor.correctedBehavior,
                residues: proof.residues.rows.map(row => ({
                  kind: row.literalKind,
                  value: row.value,
                  start: row.start,
                  end: row.end,
                  baselineOccurrenceCount: row.baselineOccurrenceCount,
                  targetOccurrenceNumber: row.targetOccurrenceNumber,
                })),
              },
            ]
        : proof.rows
    const indices = proofRows
      .map(row => row.targetIndex)
      .sort((left, right) => left - right)
    assert.equal(new Set(indices).size, indices.length)
    assert.equal(indices.length, descriptor.units)
    assert.equal(unitDigest(indices), descriptor.targetIndicesSha256)
    const rows = importedOwnerOverride
      ? []
      : descriptor.identityMode === 'target-only'
        ? proofRows.flatMap(row => row.residues)
        : proofRows.flatMap(row =>
            row.residues.map(residue =>
              descriptor.residueEncoding === 'tuple-without-target-index'
                ? [row.targetIndex, ...residue]
                : proofResidueIdentity(row.targetIndex, residue),
            ),
          )
    if (!importedOwnerOverride) {
      assert.equal(rows.length, descriptor.residues)
    }
    if (!importedOwnerOverride && descriptor.residueIdentitiesSha256) {
      assert.equal(
        canonicalRowsDigest(rows),
        descriptor.residueIdentitiesSha256,
        `${descriptor.id}: proof residue identities`,
      )
    }
    if (importedOwnerOverride) {
      const analysisNeutralRows = new Map(
        descriptor.analysisNeutralRows.map(row => [row.targetIndex, row]),
      )
      assert.equal(
        analysisNeutralRows.size,
        descriptor.analysisNeutralRows.length,
        `${descriptor.id}: unique analysis-neutral target indices`,
      )
      for (const [targetIndex, row] of analysisNeutralRows) {
        assert.ok(
          indices.includes(targetIndex),
          `${descriptor.id} u${targetIndex}: analysis-neutral override row`,
        )
        assert.deepEqual(
          row.provisionalPaths,
          [...new Set(row.provisionalPaths)],
          `${descriptor.id} u${targetIndex}: exact analysis-neutral provisional paths`,
        )
        if (row.allowEmptyProvisionalPaths) {
          assert.ok(
            descriptor.provisionalCoverageRows?.some(
              coverageRow =>
                coverageRow.targetIndex === targetIndex &&
                coverageRow.paths.length === 0,
            ),
            `${descriptor.id} u${targetIndex}: exact ownerless provisional coverage row`,
          )
        } else {
          assert.ok(
            row.provisionalPaths.length > 0,
            `${descriptor.id} u${targetIndex}: analysis-neutral provisional owner`,
          )
        }
        assert.equal(
          supplementMappings.has(targetIndex),
          false,
          `${descriptor.id} u${targetIndex}: analysis-neutral row stays outside the frozen owner-supplement partition`,
        )
      }
      const mappingRows = indices
        .filter(targetIndex => !analysisNeutralRows.has(targetIndex))
        .map(targetIndex => {
          const mapping = supplementMappings.get(targetIndex)
          assert.ok(
            mapping,
            `${descriptor.id} u${targetIndex}: analysis mapping`,
          )
          return [
            mapping.targetIndex,
            mapping.residues,
            mapping.unsupportedResidues,
            mapping.residueIdentitiesSha256,
            mapping.unsupportedResidueIdentitiesSha256,
          ]
        })
      assert.equal(
        mappingRows.reduce((sum, row) => sum + row[1], 0),
        descriptor.residues,
        `${descriptor.id}: exact mapped residue count`,
      )
      assert.equal(
        mappingRows.reduce((sum, row) => sum + row[2], 0),
        descriptor.unsupportedResidues,
        `${descriptor.id}: exact mapped unsupported count`,
      )
      assert.equal(
        sha256(Buffer.from(JSON.stringify(mappingRows))),
        descriptor.mappingDigestSha256,
        `${descriptor.id}: exact analysis mapping digest`,
      )
      const proofEvidenceIds = new Set(proof.evidenceIds ?? [])
      for (const row of descriptor.overrideRows) {
        assert.equal(
          row.key,
          `${caseName}:${row.targetIndex}`,
          `${descriptor.id} u${row.targetIndex}: override key`,
        )
        assert.ok(row.paths.length, `${descriptor.id}: owner path`)
        assert.ok(row.evidenceIds.length, `${descriptor.id}: evidence IDs`)
        assert.ok(row.behavior, `${descriptor.id}: owner behavior`)
        if (proof.evidenceIds) {
          assert.ok(
            row.evidenceIds.every(evidenceId =>
              proofEvidenceIds.has(evidenceId),
            ),
            `${descriptor.id}: override evidence stays inside proof catalog`,
          )
        }
      }
    }
    if (matchedStaticProof) {
      assert.equal(
        matchedStaticRows.length,
        descriptor.units,
        `${descriptor.id}: exact matched-static fixture row count`,
      )
      assert.deepEqual(
        matchedStaticRows
          .map(row => row.targetIndex)
          .sort((left, right) => left - right),
        indices,
        `${descriptor.id}: matched-static fixture rows exactly cover overrides`,
      )
      const proofEvidenceIds = new Set(proof.evidenceIds)
      for (const row of descriptor.overrideRows) {
        assert.equal(
          row.key,
          `${caseName}:${row.targetIndex}`,
          `${descriptor.id} u${row.targetIndex}: matched-static override key`,
        )
        assert.ok(row.paths.length, `${descriptor.id}: matched-static owner path`)
        assert.ok(
          row.evidenceIds.length,
          `${descriptor.id}: matched-static evidence IDs`,
        )
        assert.ok(
          row.evidenceIds.every(evidenceId => proofEvidenceIds.has(evidenceId)),
          `${descriptor.id}: matched-static override evidence stays inside proof catalog`,
        )
        assert.ok(
          row.behavior,
          `${descriptor.id}: matched-static owner behavior`,
        )
      }
    }
    const specs = matchedStaticProof ? [] : proofRows.map(row => {
      const analysisNeutralRow = (descriptor.analysisNeutralRows ?? []).find(
        candidate => candidate.targetIndex === row.targetIndex,
      )
      const provisionalCoverageRow = (
        descriptor.provisionalCoverageRows ?? []
      ).find(candidate => candidate.targetIndex === row.targetIndex)
      const mapping =
        analysisNeutralRow
          ? null
          : descriptor.analysisPartition === 'owner-supplement-required'
          ? supplementMappings.get(row.targetIndex)
          : mappings.get(row.targetIndex)
      assert.ok(
        mapping || analysisNeutralRow,
        `${descriptor.id} u${row.targetIndex}: analysis mapping or neutral dependency row`,
      )
      return {
        targetIndex: row.targetIndex,
        provisionalPaths:
          provisionalCoverageRow?.paths ??
          (analysisNeutralRow
            ? analysisNeutralRow.provisionalPaths
            : (mapping.currentOwnerPaths ?? mapping.ownerPaths).map(
                sourcePath =>
                  sourcePath.startsWith('src/')
                    ? sourcePath
                    : `src/${sourcePath}`,
              )),
        provisionalDisposition: provisionalCoverageRow?.disposition,
        provisionalEvidenceIds: provisionalCoverageRow?.evidenceIds,
        provisionalBehavior: provisionalCoverageRow?.behavior,
        provisionalReason: provisionalCoverageRow?.reason,
        correctedPaths: row.ownerPaths ?? [row.ownerPath ?? row.sourceOwner],
        correctedEvidenceIds: row.evidenceIds ?? proof.evidenceIds,
        correctedDisposition: descriptor.provisionalCoverageRows
          ? 'source-runtime-covered'
          : undefined,
        correctedBehavior:
          row.behavior ??
          descriptor.correctedBehaviors?.[row.targetIndex] ??
          descriptor.correctedBehavior,
      }
    })
    const correctedRows = proofRows.flatMap(row =>
      row.residues
        .filter(residue => {
          if (descriptor.scannerResidualMode === 'all-explicit-residues') {
            return true
          }
          if (descriptor.scannerResidualMode === 'macro-residues-only') {
            return Boolean(residue.macro)
          }
          if (descriptor.scannerResidualMode === 'none') {
            return false
          }
          if (descriptor.scannerResidualMode === 'source-replay-state') {
            return false
          }
          if (
            descriptor.scannerResidualMode === 'fixture-retained-residues'
          ) {
            return residue.scannerRetainedAfterCorrection === true
          }
          if (descriptor.scannerResidualMode === 'pinned-explicit-subset') {
            return false
          }
          if (
            descriptor.scannerResidualMode === 'pinned-raw-package-subset'
          ) {
            return false
          }
          if (
            descriptor.scannerResidualMode === 'matched-static-report-row'
          ) {
            return false
          }
          assert.fail(
            `${descriptor.id}: unknown scanner residual mode ${descriptor.scannerResidualMode}`,
          )
        })
        .map(residue =>
          descriptor.identityMode === 'target-only'
            ? residue
            : descriptor.residueEncoding === 'tuple-without-target-index'
              ? [row.targetIndex, ...residue]
              : proofResidueIdentity(row.targetIndex, residue),
        ),
    )
    return {
      descriptor,
      proof,
      matchedStaticRows,
      indices,
      rows,
      correctedRows,
      specs,
      identityMode: descriptor.identityMode ?? 'canonical',
    }
  })
  const allIndices = groups
    .flatMap(group => group.indices)
    .sort((a, b) => a - b)
  assert.equal(new Set(allIndices).size, allIndices.length)
  const transitiveIndices = groups
    .filter(
      group =>
        group.descriptor.analysisPartition === 'transitive-exact-consensus',
    )
    .flatMap(group => group.indices)
    .sort((a, b) => a - b)
  if (transitiveIndices.length > 0) {
    assert.deepEqual(
      transitiveIndices,
      fixture.analysis.sourceGapReplay.transitiveExactConsensus.targetIndices,
      `${caseName}: proof groups exactly partition transitive consensus`,
    )
  }
  const supplementUniverse = new Set(
    fixture.analysis.sourceGapReplay.ownerSupplementRequired.targetIndices,
  )
  for (const group of groups.filter(
    item => item.descriptor.analysisPartition === 'owner-supplement-required',
  )) {
    const analysisNeutralIndices = new Set(
      (group.descriptor.analysisNeutralRows ?? []).map(
        row => row.targetIndex,
      ),
    )
    assert.ok(
      group.indices.every(
        targetIndex =>
          supplementUniverse.has(targetIndex) ||
          analysisNeutralIndices.has(targetIndex),
      ),
      `${caseName}: ${group.descriptor.id} stays within owner-supplement partition`,
    )
  }
  return groups
}

function loadDceCorrectionGroups(caseName, fixture) {
  const descriptors =
    coverageEvolutionOverlays.get(caseName)?.dceCorrectionGroups ?? []
  const supplementMappings = new Map(
    fixture.analysis.sourceSupplementGaps.map(mapping => [
      mapping.targetIndex,
      mapping,
    ]),
  )
  return descriptors.map(descriptor => {
    const proof = readPinnedJson(
      descriptor,
      `${caseName}: ${descriptor.id} DCE proof`,
    )
    assert.equal(proof.case, caseName, `${descriptor.id}: proof case`)
    assert.equal(
      proof.targetIndex,
      descriptor.targetIndex,
      `${descriptor.id}: target index`,
    )
    const mapping = supplementMappings.get(descriptor.targetIndex)
    assert.ok(mapping, `${descriptor.id}: source-supplement analysis mapping`)
    assert.deepEqual(
      {
        start: proof.targetUnit.start,
        end: proof.targetUnit.end,
        nodeType: proof.targetUnit.nodeType,
        sourceHash: proof.targetUnit.sourceHash,
      },
      {
        start: mapping.target.start,
        end: mapping.target.end,
        nodeType: mapping.target.nodeType,
        sourceHash: mapping.target.sourceHash,
      },
      `${descriptor.id}: authenticated target unit`,
    )
    const residueIdentity = [
      proof.targetIndex,
      proof.residue.literalKind,
      proof.residue.value,
      proof.residue.start,
      proof.residue.end,
      proof.residue.baselineOccurrenceCount,
      proof.residue.targetOccurrenceNumber,
    ]
    assert.equal(mapping.residues, 1, `${descriptor.id}: one DCE residue`)
    assert.equal(
      canonicalRowsDigest([residueIdentity]),
      mapping.residueIdentitiesSha256,
      `${descriptor.id}: exact pre-correction residue identity`,
    )
    return {
      descriptor,
      proof,
      provisionalPaths: mapping.ownerPaths.map(sourcePath =>
        sourcePath.startsWith('src/') ? sourcePath : `src/${sourcePath}`,
      ),
      residueIdentity,
    }
  })
}

function canonicalFlags(flags) {
  return [...flags].sort().join('')
}

function literalIdentity(kind, value) {
  if (kind === 'regexp') {
    return `regexp:${JSON.stringify(value.pattern)}/${canonicalFlags(value.flags)}`
  }
  if (kind === 'string' || kind === 'property') {
    return `${kind}:${JSON.stringify(value)}`
  }
  return `${kind}:${String(value)}`
}

function walkAcorn(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walkAcorn(child, visit)
    return
  }
  if (typeof node.type === 'string') visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (!['end', 'loc', 'range', 'raw', 'start', 'type'].includes(key)) {
      walkAcorn(child, visit)
    }
  }
}

function bundleOccurrences(source) {
  const ast = parse(source, {
    allowHashBang: true,
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const occurrences = new Map()
  function add(kind, value, start, end) {
    const key = literalIdentity(kind, value)
    const rows = occurrences.get(key) ?? []
    rows.push({ start, end })
    occurrences.set(key, rows)
  }
  walkAcorn(ast, node => {
    if (node.type === 'Literal') {
      if (node.regex) {
        add(
          'regexp',
          {
            flags: canonicalFlags(node.regex.flags),
            pattern: node.regex.pattern,
          },
          node.start,
          node.end,
        )
      } else if (typeof node.value === 'string') {
        add('string', node.value, node.start, node.end)
      } else if (typeof node.value === 'number') {
        add('number', String(node.value), node.start, node.end)
      } else if (typeof node.value === 'bigint') {
        add('bigint', node.value.toString(), node.start, node.end)
      }
    } else if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw
      if (typeof value === 'string') {
        add('string', value, node.start, node.end)
      }
    }
    const property =
      ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(
        node.type,
      ) &&
      node.computed === false &&
      node.key?.type === 'Identifier'
        ? node.key
        : node.type === 'MemberExpression' &&
            node.computed === false &&
            node.property?.type === 'Identifier'
          ? node.property
          : null
    if (property) {
      add('property', property.name, property.start, property.end)
    }
  })
  for (const rows of occurrences.values()) {
    rows.sort((left, right) => left.start - right.start)
  }
  return occurrences
}

function decodeCompilerResidues(proof) {
  const descriptor = proof.preCorrectionResidues
  assert.equal(descriptor.encoding, 'gzip+base64')
  const json = gunzipSync(Buffer.from(descriptor.data, 'base64'))
  assert.equal(sha256(json), descriptor.sha256)
  const rows = JSON.parse(json)
  assert.equal(rows.length, descriptor.rows)
  assert.ok(
    rows.every(row => row[0] === proof.targetIndex),
    `u${proof.targetIndex}: compiler residues remain unit-local`,
  )
  return rows
}

function correctionSpecs(fixture) {
  const targetTag = `target${fixture.versions.target.slice(4)}`
  const specs = []
  for (const row of fixture.analysis.sourceValueRepresentations) {
    const paths = [
      ...new Set(
        row.residueProofs.flatMap(item =>
          (item.proof.sourcePaths ?? []).map(sourcePath =>
            sourcePath.startsWith('src/') ? sourcePath : `src/${sourcePath}`,
          ),
        ),
      ),
    ].sort()
    assert.ok(paths.length > 0, `u${row.targetIndex}: corrected source paths`)
    specs.push({
      targetIndex: row.targetIndex,
      paths,
      evidenceIds: [
        `${targetTag}-owner-residue-target-fragment`,
        `${targetTag}-owner-residue-semantic-test`,
      ],
    })
  }
  for (const proof of fixture.policy.compilerRepresentationProofs) {
    specs.push({
      targetIndex: proof.targetIndex,
      paths: proof.sourceFiles
        .map(source =>
          source.path.startsWith('src/') ? source.path : `src/${source.path}`,
        )
        .sort(),
      evidenceIds: [
        `${targetTag}-owner-residue-static-ast`,
        `${targetTag}-owner-residue-semantic-test`,
      ],
    })
  }
  specs.sort((left, right) => left.targetIndex - right.targetIndex)
  assert.equal(new Set(specs.map(spec => spec.targetIndex)).size, specs.length)
  return specs
}

function coverageEvolutionState(caseName, caseRoot, fixture) {
  const bytes = fs.readFileSync(
    path.join(caseRoot, 'semantic/source-coverage.json.gz'),
  )
  if (caseName === '2.1.118-to-2.1.119') {
    const coveragePin = target119CurrentArtifactPins.sourceCoverage
    assert.deepEqual(
      { bytes: bytes.length, sha256: sha256(bytes) },
      { bytes: coveragePin.bytes, sha256: coveragePin.sha256 },
      `${caseName}: exact current compressed source-coverage artifact`,
    )
    const rawCoverage = gunzipSync(bytes)
    assert.deepEqual(
      { bytes: rawCoverage.length, sha256: sha256(rawCoverage) },
      {
        bytes: coveragePin.rawBytes,
        sha256: coveragePin.rawSha256,
      },
      `${caseName}: exact current raw source-coverage artifact`,
    )
    const reportPin = target119CurrentArtifactPins.typedAudit
    const reportBytes = fs.readFileSync(
      path.join(repositoryRoot, reportPin.path),
    )
    assert.deepEqual(
      { bytes: reportBytes.length, sha256: sha256(reportBytes) },
      { bytes: reportPin.bytes, sha256: reportPin.sha256 },
      `${caseName}: exact current typed-audit artifact`,
    )
  }
  const coverage = JSON.parse(gunzipSync(bytes))
  const rows = new Map(coverage.rows.map(row => [row.targetIndex, row]))
  const owners = new Map(coverage.owners.map(owner => [owner.id, owner.path]))
  const evidence = new Map(coverage.evidence.map(item => [item.id, item]))
  const specs = correctionSpecs(fixture)
  assert.deepEqual(
    specs.map(spec => spec.targetIndex),
    fixture.policy.coverageEvolution.semanticCorrectionTargetIndices,
    `${caseName}: exact semantic-correction unit partition`,
  )
  const dependencyIndices = fixture.analysis.dependencyBuildInputGaps
    .map(row => row.targetIndex)
    .sort((left, right) => left - right)
  assert.deepEqual(
    dependencyIndices,
    fixture.policy.coverageEvolution.dependencyCorrectionTargetIndices,
    `${caseName}: exact dependency-correction unit partition`,
  )
  assert.deepEqual(
    fixture.policy.coverageEvolution.preCorrectionUniverse,
    {
      units: fixture.summary.reportUnits,
      residues: fixture.summary.reportResidues,
      residueIdentitiesSha256:
        fixture.summary.reportResidueIdentitiesSha256,
    },
    `${caseName}: pre-correction universe remains pinned`,
  )

  const semanticStates = new Set()
  for (const spec of specs) {
    const row = rows.get(spec.targetIndex)
    assert.ok(row, `${caseName} u${spec.targetIndex}: coverage row`)
    const actualPaths = row.ownerIds.map(ownerId => {
      const owner = owners.get(ownerId)
      assert.ok(owner, `${caseName} u${spec.targetIndex}: coverage owner`)
      return owner
    })
    const evidenceUpdate = coverageEvolutionOverlays
      .get(caseName)
      ?.semanticCorrectionEvidenceUpdates?.find(
        update => update.targetIndex === spec.targetIndex,
      )
    const correctedEvidence = evidenceUpdate?.evidenceIds ?? spec.evidenceIds
    const corrected =
      JSON.stringify(actualPaths) === JSON.stringify(spec.paths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(correctedEvidence)
    semanticStates.add(corrected ? 'corrected' : 'provisional')
  }
  assert.equal(
    semanticStates.size,
    1,
    `${caseName}: represented/compiler coverage evolves atomically`,
  )
  const dependencyStates = new Set()
  for (const targetIndex of dependencyIndices) {
    const row = rows.get(targetIndex)
    assert.ok(row, `${caseName} u${targetIndex}: dependency coverage row`)
    const corrected =
      row.disposition === 'dependency-runtime' &&
      row.ownerIds.length === 0 &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify([
          'dependency-attribution',
          'dependency-build-input-audit',
          'target119-agent-sdk-build-input-target-fragment',
        ])
    dependencyStates.add(corrected ? 'corrected' : 'provisional')
  }
  assert.ok(
    dependencyStates.size <= 1,
    `${caseName}: dependency coverage evolves atomically`,
  )
  const proofGroups = loadProofCorrectionGroups(caseName, fixture)
  for (const group of proofGroups) {
    if (group.descriptor.fixtureShape === 'matched-static-proof') {
      assert.equal(
        coverage.summary.nonmatchedUnits,
        coverage.rows.length,
        `${caseName}: source-coverage remains an exact nonmatched-only ledger`,
      )
      assert.deepEqual(
        Object.keys(coverage.summary.byStructuralClass).sort(),
        ['changed', 'moved', 'unresolved'],
        `${caseName}: matched units stay outside source coverage`,
      )
      const matchedClassifications = group.matchedStaticRows.map(
        row =>
          row.structuralLineage?.classification ??
          group.proof.structuralPair?.classification,
      )
      assert.deepEqual(
        matchedClassifications,
        group.indices.map(() => 'matched'),
        `${caseName}: ${group.descriptor.id} pins matched structural lineage`,
      )
      if (group.proof.partitionSnapshot?.byTarget) {
        assert.deepEqual(
          group.proof.partitionSnapshot.byTarget.map(row => ({
            targetIndex: row.targetIndex,
            coverageTargetRowPresent: row.coverageTargetRowPresent,
          })),
          group.indices.map(targetIndex => ({
            targetIndex,
            coverageTargetRowPresent: false,
          })),
          `${caseName}: ${group.descriptor.id} freezes matched/no-coverage coordinates`,
        )
      }
      for (const targetIndex of group.indices) {
        assert.equal(
          rows.has(targetIndex),
          false,
          `${caseName} u${targetIndex}: matched-static proof stays absent from nonmatched coverage`,
        )
      }
      group.state = 'corrected'
      continue
    }
    if (group.descriptor.fixtureShape === 'imported-owner-override') {
      for (const row of group.descriptor.overrideRows) {
        for (const evidenceId of row.evidenceIds) {
          const item = evidence.get(evidenceId)
          assert.ok(item, `${caseName}: ${evidenceId} coverage evidence`)
          assert.equal(
            item.path,
            group.descriptor.testPath,
            `${caseName}: ${evidenceId} proof-test path`,
          )
        }
      }
    }
    const states = new Set()
    const phaseMatches = []
    for (const spec of group.specs) {
      const row = rows.get(spec.targetIndex)
      assert.ok(row, `${caseName} u${spec.targetIndex}: proof coverage row`)
      const actualPaths = row.ownerIds.map(ownerId => {
        const owner = owners.get(ownerId)
        assert.ok(owner, `${caseName} u${spec.targetIndex}: proof owner`)
        return owner
      })
      const provisional =
        JSON.stringify(actualPaths) ===
          JSON.stringify(spec.provisionalPaths) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(
            spec.provisionalEvidenceIds ?? [
              'source-map-attribution',
              'semantic-test',
            ],
          ) &&
        (spec.provisionalDisposition === undefined ||
          row.disposition === spec.provisionalDisposition) &&
        (spec.provisionalBehavior === undefined ||
          row.behavior === spec.provisionalBehavior) &&
        (spec.provisionalReason === undefined ||
          row.reason === spec.provisionalReason)
      const corrected =
        JSON.stringify(actualPaths) ===
          JSON.stringify(spec.correctedPaths) &&
        JSON.stringify(row.evidenceIds) ===
          JSON.stringify(spec.correctedEvidenceIds) &&
        row.behavior === spec.correctedBehavior &&
        (spec.correctedDisposition === undefined ||
          row.disposition === spec.correctedDisposition)
      assert.ok(
        provisional || corrected,
        `${caseName} u${spec.targetIndex}: exact proof provisional or corrected row`,
      )
      if (group.descriptor.provisionalCoverageRows) {
        phaseMatches.push({ provisional, corrected })
      } else {
        states.add(corrected ? 'corrected' : 'provisional')
      }
    }
    if (group.descriptor.provisionalCoverageRows) {
      const allowedPhases = [
        ['provisional', phaseMatches.every(match => match.provisional)],
        ['corrected', phaseMatches.every(match => match.corrected)],
      ].filter(([, matches]) => matches)
      assert.equal(
        allowedPhases.length,
        1,
        `${caseName}: ${group.descriptor.id} exact provisional or corrected coverage phase`,
      )
      group.state = allowedPhases[0][0]
    } else {
      assert.equal(
        states.size,
        1,
        `${caseName}: ${group.descriptor.id} coverage evolves atomically`,
      )
      group.state = [...states][0]
    }
  }
  const dceGroups = loadDceCorrectionGroups(caseName, fixture)
  for (const group of dceGroups) {
    const { descriptor, proof } = group
    const row = rows.get(descriptor.targetIndex)
    assert.ok(row, `${caseName} u${descriptor.targetIndex}: DCE coverage row`)
    assert.deepEqual(
      {
        start: row.start,
        end: row.end,
        nodeType: row.nodeType,
        sourceHash: row.sourceHash,
        structuralClass: row.structuralClass,
      },
      {
        start: proof.targetUnit.start,
        end: proof.targetUnit.end,
        nodeType: proof.targetUnit.nodeType,
        sourceHash: proof.targetUnit.sourceHash,
        structuralClass: 'unresolved',
      },
      `${caseName} u${descriptor.targetIndex}: exact DCE target unit`,
    )
    const actualPaths = row.ownerIds.map(ownerId => {
      const owner = owners.get(ownerId)
      assert.ok(owner, `${caseName} u${descriptor.targetIndex}: DCE owner`)
      return owner
    })
    const provisional =
      row.disposition === 'source-runtime-covered' &&
      JSON.stringify(actualPaths) ===
        JSON.stringify(group.provisionalPaths) &&
      JSON.stringify(row.evidenceIds) ===
        JSON.stringify(['source-map-attribution', 'semantic-test']) &&
      row.behavior ===
        `Compiled target unit is attributed to ${group.provisionalPaths.join(', ')}; its authored runtime owner and call path are present in the target semantic tree and current cumulative src/.` &&
      row.category === undefined &&
      row.reason === undefined
    const corrected =
      row.disposition === 'dce-nonruntime' &&
      actualPaths.length === 0 &&
      JSON.stringify(row.evidenceIds) === JSON.stringify(proof.evidenceIds) &&
      row.category === proof.category &&
      row.reason === proof.reason &&
      row.behavior === undefined
    assert.ok(
      provisional || corrected,
      `${caseName} u${descriptor.targetIndex}: exact provisional or authenticated DCE row`,
    )
    group.state = corrected ? 'corrected' : 'provisional'
  }
  return {
    dependencyIndices,
    dependencyState:
      dependencyStates.size === 0 ? 'none' : [...dependencyStates][0],
    semanticSpecs: specs,
    semanticState: [...semanticStates][0],
    proofGroups,
    dceGroups,
  }
}

function authenticatePreCorrectionRows(fixture, baselineSource, targetSource) {
  const represented = fixture.analysis.sourceValueRepresentations.flatMap(row =>
    row.residueProofs.map(item => item.identity),
  )
  const compiler = fixture.policy.compilerRepresentationProofs.flatMap(
    decodeCompilerResidues,
  )
  assert.equal(
    canonicalRowsDigest(represented),
    fixture.analysis.categories['source-value-represented']
      .residueIdentitiesSha256,
    'represented pre-correction residue identities',
  )
  assert.equal(
    canonicalRowsDigest(compiler),
    fixture.analysis.categories['compiler-source-representation']
      .residueIdentitiesSha256,
    'compiler pre-correction residue identities',
  )

  const baseline = bundleOccurrences(baselineSource)
  const target = bundleOccurrences(targetSource)
  for (const row of [...represented, ...compiler]) {
    const [, kind, value, start, end, baselineCount, targetOrdinal] = row
    const key = literalIdentity(kind, value)
    assert.equal(
      (baseline.get(key) ?? []).length,
      baselineCount,
      `${key}: pre-correction baseline count`,
    )
    const occurrence = (target.get(key) ?? [])[targetOrdinal - 1]
    assert.ok(occurrence, `${key}: pre-correction target ordinal`)
    assert.deepEqual(
      [occurrence.start, occurrence.end],
      [start, end],
      `${key}: pre-correction target range`,
    )
  }
}

function valueText(residue) {
  return typeof residue.value === 'object'
    ? residue.value.pattern
    : String(residue.value)
}

function inRanges(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index <= end)
}

function obligationEvidence(region, correspondence) {
  const obligations = []
  for (const obligation of correspondence.obligationWitnesses) {
    const overlaps = (obligation.bundleWitnesses ?? []).some(witness =>
      (witness.targetRanges ?? []).some(
        range => range.start < region.target.end && range.end > region.target.start,
      ),
    )
    if (overlaps) obligations.push(obligation)
  }
  return {
    obligationIds: obligations.map(item => item.id).sort(),
    sourcePaths: [
      ...new Set(obligations.flatMap(item => item.sourcePaths ?? [])),
    ].sort(),
    testIds: [
      ...new Set(obligations.flatMap(item => item.testIds ?? [])),
    ].sort(),
  }
}

function normalizedSourcePath(value) {
  return value.replace(/^\.\.\/src\//, '').replace(/^src\//, '')
}

function exactSourceProof(residue) {
  const sourceMatches = [
    ...new Set((residue.sourceMatches ?? []).map(normalizedSourcePath)),
  ].sort()
  const owners = new Set(
    (residue.ownerPaths ?? []).map(normalizedSourcePath),
  )
  const ownerMatches = sourceMatches.filter(sourcePath => owners.has(sourcePath))
  if (ownerMatches.length > 0) {
    return {
      method: 'coverage-owner-exact',
      sourcePaths: ownerMatches,
    }
  }

  const candidates = new Set(
    (residue.candidates ?? []).map(normalizedSourcePath),
  )
  const alternateMatches = sourceMatches.filter(
    sourcePath => candidates.has(sourcePath) && !owners.has(sourcePath),
  )
  if (alternateMatches.length === 1) {
    return {
      method: 'sole-exact-alternate-candidate',
      sourcePaths: alternateMatches,
    }
  }
  return null
}

function validSemanticObligations(correspondence) {
  const catalogTestIds = new Set(
    correspondence.testCatalog.map(item => item.id),
  )
  return correspondence.obligationWitnesses.filter(obligation => {
    if (
      !(obligation.sourcePaths ?? []).length ||
      !(obligation.testIds ?? []).length
    ) {
      return false
    }
    if (!obligation.testIds.every(testId => catalogTestIds.has(testId))) {
      return false
    }
    if (
      !obligation.sourcePaths.every(sourcePath =>
        fs.statSync(
          path.join(sourceRoot, normalizedSourcePath(sourcePath)),
          { throwIfNoEntry: false },
        )?.isFile(),
      )
    ) {
      return false
    }
    return true
  })
}

function semanticObligationProof(residue, obligations) {
  const matchingObligations = obligations.filter(obligation =>
    (obligation.bundleWitnesses ?? []).some(witness =>
      (witness.targetRanges ?? []).some(
        range =>
          range.start <= residue.target.start && range.end >= residue.target.end,
      ),
    ),
  )
  if (matchingObligations.length === 0) return null
  return {
    method: 'semantic-obligation',
    obligationIds: matchingObligations.map(item => item.id).sort(),
    sourcePaths: [
      ...new Set(matchingObligations.flatMap(item => item.sourcePaths ?? [])),
    ].sort(),
    testIds: [
      ...new Set(matchingObligations.flatMap(item => item.testIds ?? [])),
    ].sort(),
  }
}

function residueRepresentationProof(residue, obligations, macroValues) {
  if (residue.literalKind === 'string' && macroValues.has(residue.value)) {
    return { method: 'build-macro' }
  }
  return (
    exactSourceProof(residue) ??
    semanticObligationProof(residue, obligations)
  )
}

function categorySummary(rows) {
  const indices = rows.map(row => row.targetIndex).sort((left, right) => left - right)
  const residues = rows.flatMap(row => row.residues)
  const unsupported = rows.flatMap(row => row.unsupportedResidues)
  return {
    units: rows.length,
    residues: residues.length,
    unsupportedResidues: unsupported.length,
    targetIndices: indices,
    targetIndicesSha256: unitDigest(indices),
    residueIdentitiesSha256: residueDigest(residues),
    unsupportedResidueIdentitiesSha256: residueDigest(unsupported),
  }
}

function sourceGapReplay(rows, macroValues) {
  const transitive = []
  const ownerSupplementRequired = []
  for (const row of rows) {
    const exactMatchSets = row.residues
      .filter(
        residue =>
          !(
            residue.literalKind === 'string' && macroValues.has(residue.value)
          ),
      )
      .map(
        residue =>
          new Set(
            (residue.sourceMatches ?? []).map(normalizedSourcePath),
          ),
      )
    const exactConsensus = exactMatchSets.length
      ? [...exactMatchSets[0]].filter(sourcePath =>
          exactMatchSets
            .slice(1)
            .every(sourceMatches => sourceMatches.has(sourcePath)),
        )
      : []
    const owners = new Set(row.ownerPaths.map(normalizedSourcePath))
    const alternateConsensus = exactConsensus
      .filter(sourcePath => !owners.has(sourcePath))
      .sort()
    if (alternateConsensus.length === 1) {
      transitive.push({ ...row, replaySourcePath: alternateConsensus[0] })
    } else {
      ownerSupplementRequired.push(row)
    }
  }
  return {
    criterion:
      'A transitive replay hint requires one and only one alternate source path shared by every non-macro owner-residue in the complete target unit. It remains a gap, not representation proof, until declaration or target-source-map evidence authenticates the relation. Every other unit remains fail-closed as owner-supplement-required.',
    transitiveExactConsensus: {
      ...categorySummary(transitive),
      mappings: transitive.map(row => ({
        targetIndex: row.targetIndex,
        currentOwnerPaths: row.ownerPaths,
        replaySourcePath: row.replaySourcePath,
        target: row.target,
        residues: row.residues.length,
        unsupportedResidues: row.unsupportedResidues.length,
        unsupportedResidueIdentitiesSha256: residueDigest(
          row.unsupportedResidues,
        ),
      })),
    },
    ownerSupplementRequired: categorySummary(ownerSupplementRequired),
  }
}

function scannerReport(caseName, fixture, baselinePath, targetPath) {
  const caseRoot = path.join(repositoryRoot, 'recovery', 'cases', caseName)
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        repositoryRoot,
        'recovery/scripts/inspect-semantic-literal-gaps.mjs',
      ),
      '--baseline',
      baselinePath,
      '--target',
      targetPath,
      '--source-root',
      sourceRoot,
      '--structural',
      path.join(caseRoot, 'structural/generated-delta.json.gz'),
      '--partitions',
      path.join(caseRoot, 'attribution/target-partitions.jsonl.gz'),
      '--sources',
      path.join(caseRoot, 'attribution/sources.jsonl.gz'),
      '--coverage',
      path.join(caseRoot, 'semantic/source-coverage.json.gz'),
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 1024 * 1024 * 1024,
    },
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

function deriveAnalysis({ correspondence, fixture, report, structural }) {
  const structuralByIndex = new Map(
    structural.regions.map(region => [region.target.index, region]),
  )
  const grouped = new Map()
  for (const residue of report.sourceRuntimeAddedOwnerResidueRows) {
    const index = residue.structural.index
    const rows = grouped.get(index) ?? []
    rows.push(residue)
    grouped.set(index, rows)
  }
  for (const rows of grouped.values()) {
    rows.sort((left, right) => left.target.start - right.target.start)
  }

  const macroValues = new Set(Object.values(fixture.macro))
  const macroOnly = [...grouped]
    .filter(([, residues]) =>
      residues.every(
        residue =>
          residue.literalKind === 'string' && macroValues.has(residue.value),
      ),
    )
    .map(([index]) => index)
    .sort((left, right) => left - right)
  const macroOnlySet = new Set(macroOnly)
  const proofByIndex = new Map(
    fixture.policy.compilerRepresentationProofs.map(proof => [
      proof.targetIndex,
      proof,
    ]),
  )
  const obligations = validSemanticObligations(correspondence)
  const categories = new Map(
    [
      'source-value-represented',
      'compiler-source-representation',
      'dependency-build-input-gap',
      'source-supplement-gap',
    ].map(category => [category, []]),
  )

  for (const [targetIndex, residues] of [...grouped].sort(
    (left, right) => left[0] - right[0],
  )) {
    if (macroOnlySet.has(targetIndex)) continue
    const residueProofs = residues.map(residue => ({
      identity: canonicalResidue(residue),
      proof: residueRepresentationProof(
        residue,
        obligations,
        macroValues,
      ),
    }))
    const unsupportedResidues = residues.filter(
      (_residue, index) => residueProofs[index].proof === null,
    )
    let category
    if (proofByIndex.has(targetIndex)) {
      category = 'compiler-source-representation'
    } else if (
      inRanges(targetIndex, fixture.policy.dependencyBuildInputUnitRanges)
    ) {
      category = 'dependency-build-input-gap'
    } else if (unsupportedResidues.length > 0) {
      category = 'source-supplement-gap'
    } else {
      category = 'source-value-represented'
    }
    const region = structuralByIndex.get(targetIndex)
    assert.ok(region, `${fixture.case} u${targetIndex}: structural region`)
    categories.get(category).push({
      targetIndex,
      ownerPaths: [...new Set(residues.flatMap(row => row.ownerPaths))].sort(),
      target: {
        classification: region.classification,
        start: region.target.start,
        end: region.target.end,
        nodeType: region.target.nodeType,
        sourceHash: region.target.sourceHash,
      },
      rowScopedEvidence: obligationEvidence(region, correspondence),
      residues,
      residueProofs,
      unsupportedResidues,
    })
  }

  const compactGapRow = row => ({
    targetIndex: row.targetIndex,
    ownerPaths: row.ownerPaths,
    target: row.target,
    residues: row.residues.length,
    unsupportedResidues: row.unsupportedResidues.length,
    residueIdentitiesSha256: residueDigest(row.residues),
    unsupportedResidueIdentitiesSha256: residueDigest(row.unsupportedResidues),
    rowScopedEvidence: row.rowScopedEvidence,
  })
  const categoryObject = Object.fromEntries(
    [...categories].map(([category, rows]) => [category, categorySummary(rows)]),
  )
  const sourceSupplementRows = categories.get('source-supplement-gap')
  return {
    macroOnly: {
      units: macroOnly.length,
      residues: macroOnly.reduce(
        (total, index) => total + grouped.get(index).length,
        0,
      ),
      targetIndices: macroOnly,
      targetIndicesSha256: unitDigest(macroOnly),
    },
    analyzed: {
      units: [...categories.values()].reduce(
        (total, rows) => total + rows.length,
        0,
      ),
      residues: [...categories.values()].reduce(
        (total, rows) =>
          total + rows.reduce((sum, row) => sum + row.residues.length, 0),
        0,
      ),
    },
    categories: categoryObject,
    sourceValueRepresentations: categories
      .get('source-value-represented')
      .map(row => ({
        targetIndex: row.targetIndex,
        ownerPaths: row.ownerPaths,
        target: row.target,
        residueProofs: row.residueProofs,
      })),
    dependencyBuildInputGaps: categories
      .get('dependency-build-input-gap')
      .map(compactGapRow),
    sourceSupplementGaps: sourceSupplementRows.map(compactGapRow),
    sourceGapReplay: sourceGapReplay(sourceSupplementRows, macroValues),
  }
}

for (const caseName of semanticCase
  ? [semanticCase]
  : [...fixtureDescriptors.keys()]) {
  if (!fixtureDescriptors.has(caseName)) continue
  const fixture = readFixture(caseName)
  const caseRoot = path.join(repositoryRoot, 'recovery', 'cases', caseName)

  test(`${caseName} owner-residue analysis fixture is internally complete`, () => {
    assert.equal(fixture.schemaVersion, 1)
    assert.equal(fixture.case, caseName)
    assert.equal(
      fixture.summary.reportUnits,
      fixture.analysis.macroOnly.units + fixture.analysis.analyzed.units,
    )
    assert.equal(
      fixture.summary.reportResidues,
      fixture.analysis.macroOnly.residues + fixture.analysis.analyzed.residues,
    )
    assert.equal(
      fixture.analysis.dependencyBuildInputGaps.length,
      fixture.analysis.categories['dependency-build-input-gap'].units,
    )
    assert.equal(
      fixture.analysis.sourceSupplementGaps.length,
      fixture.analysis.categories['source-supplement-gap'].units,
    )
    assert.equal(
      fixture.analysis.sourceValueRepresentations.length,
      fixture.analysis.categories['source-value-represented'].units,
    )
    assert.equal(
      fixture.analysis.sourceGapReplay.transitiveExactConsensus.units +
        fixture.analysis.sourceGapReplay.ownerSupplementRequired.units,
      fixture.analysis.categories['source-supplement-gap'].units,
    )
    assert.equal(
      fixture.analysis.sourceGapReplay.transitiveExactConsensus.residues +
        fixture.analysis.sourceGapReplay.ownerSupplementRequired.residues,
      fixture.analysis.categories['source-supplement-gap'].residues,
    )
    assert.deepEqual(
      fixture.analysis.sourceGapReplay.transitiveExactConsensus.mappings.map(
        row => row.targetIndex,
      ),
      fixture.analysis.sourceGapReplay.transitiveExactConsensus.targetIndices,
    )
    assert.deepEqual(
      fixture.analysis.sourceValueRepresentations.map(row => row.targetIndex),
      fixture.analysis.categories['source-value-represented'].targetIndices,
    )
    for (const row of fixture.analysis.sourceValueRepresentations) {
      assert.ok(row.residueProofs.length > 0)
      for (const residueProof of row.residueProofs) {
        assert.ok(residueProof.proof, `${caseName} u${row.targetIndex}: row proof`)
        assert.ok(
          [
            'build-macro',
            'coverage-owner-exact',
            'sole-exact-alternate-candidate',
            'semantic-obligation',
          ].includes(residueProof.proof.method),
          `${caseName} u${row.targetIndex}: row proof method`,
        )
      }
    }
    const proofIndices = fixture.policy.compilerRepresentationProofs.map(
      proof => proof.targetIndex,
    )
    assert.equal(new Set(proofIndices).size, proofIndices.length)
    assert.deepEqual(
      proofIndices.sort((left, right) => left - right),
      fixture.analysis.categories['compiler-source-representation'].targetIndices,
    )
    const representedRows = fixture.analysis.sourceValueRepresentations.flatMap(
      row => row.residueProofs.map(item => item.identity),
    )
    const compilerRows = fixture.policy.compilerRepresentationProofs.flatMap(
      decodeCompilerResidues,
    )
    assert.equal(
      canonicalRowsDigest(representedRows),
      fixture.analysis.categories['source-value-represented']
        .residueIdentitiesSha256,
    )
    assert.equal(
      canonicalRowsDigest(compilerRows),
      fixture.analysis.categories['compiler-source-representation']
        .residueIdentitiesSha256,
    )
    assert.equal(
      fixture.policy.coverageEvolution.criterion,
      fixture.policy.coverageEvolution.proofCorrectionGroups?.some(
        group => group.id === 'target119-daemon-cluster',
      )
        ? 'represented/compiler, dependency, transitive-owner, binding-owner, and daemon-cluster coverage groups each evolve atomically from their exact provisional scanner partition to their exact corrected state; mixed rows fail closed'
        : fixture.policy.coverageEvolution.proofCorrectionGroups?.length
          ? 'represented/compiler, dependency, transitive-owner, and binding-owner coverage groups each evolve atomically from their exact provisional scanner partition to their exact corrected state; mixed rows fail closed'
        : 'represented/compiler and dependency coverage groups each evolve atomically from their exact provisional scanner partition to their exact corrected state; mixed rows fail closed',
    )
    if (proofCorrectionDescriptors(caseName, fixture).length) {
      const proofGroups = loadProofCorrectionGroups(caseName, fixture)
      assert.equal(
        proofGroups.length,
        proofCorrectionDescriptors(caseName, fixture).length,
      )
      const supplementProofIndices = new Set(
        proofGroups
          .filter(
            group =>
              group.descriptor.analysisPartition ===
              'owner-supplement-required',
          )
          .flatMap(group => group.indices),
      )
      if (!coverageEvolutionOverlays.get(caseName)?.skipSourceSupplementResidual) {
        const remainingSupplementIndices =
          fixture.analysis.sourceGapReplay.ownerSupplementRequired.targetIndices.filter(
            targetIndex => !supplementProofIndices.has(targetIndex),
          )
        const expectedResidual = postProofSourceSupplementResidual(
          caseName,
          fixture,
        )
        assert.deepEqual(
          {
            units: remainingSupplementIndices.length,
            targetIndicesSha256: unitDigest(remainingSupplementIndices),
          },
          {
            units: expectedResidual.units,
            targetIndicesSha256: expectedResidual.targetIndicesSha256,
          },
        )
        assert.equal(
          expectedResidual.residues,
          expectedResidual.unsupportedResidues,
          `${caseName}: the residual remains wholly unsupported`,
        )
        assert.match(
          expectedResidual.residueIdentitiesSha256,
          /^[0-9a-f]{64}$/,
          `${caseName}: the exact evolved residual remains pinned`,
        )
      }
    }
    assert.equal(
      loadDceCorrectionGroups(caseName, fixture).length,
      coverageEvolutionOverlays.get(caseName)?.dceCorrectionGroups?.length ??
        0,
      `${caseName}: DCE correction fixtures remain pinned`,
    )
  })

  const baselinePath =
    process.env[bundleEnvironmentVariable(fixture.versions.baseline)]
  const targetPath =
    process.env[bundleEnvironmentVariable(fixture.versions.target)]

  test(
    `${caseName} target-added owner residues retain source/gap classification`,
    { skip: !baselinePath || !targetPath || semanticCase !== caseName },
    () => {
      const baselineBytes = fs.readFileSync(baselinePath)
      const targetBytes = fs.readFileSync(targetPath)
      assert.deepEqual(
        { bytes: baselineBytes.length, sha256: sha256(baselineBytes) },
        fixture.inputs.baselineBundle,
      )
      assert.deepEqual(
        { bytes: targetBytes.length, sha256: sha256(targetBytes) },
        fixture.inputs.targetBundle,
      )

      const structuralBytes = fs.readFileSync(
        path.join(caseRoot, 'structural/generated-delta.json.gz'),
      )
      assert.deepEqual(
        { bytes: structuralBytes.length, sha256: sha256(structuralBytes) },
        fixture.inputs.structural,
      )
      const structural = JSON.parse(gunzipSync(structuralBytes))
      const correspondenceBytes = fs.readFileSync(
        path.join(caseRoot, 'semantic/semantic-correspondence.json.gz'),
      )
      const correspondencePin =
        caseName === '2.1.118-to-2.1.119'
          ? target119CurrentArtifactPins.semanticCorrespondence
          : fixture.inputs.semanticCorrespondence
      assert.deepEqual(
        {
          bytes: correspondenceBytes.length,
          sha256: sha256(correspondenceBytes),
        },
        {
          bytes: correspondencePin.bytes,
          sha256: correspondencePin.sha256,
        },
      )
      const correspondence = JSON.parse(gunzipSync(correspondenceBytes))
      assert.deepEqual(
        correspondence.testCatalog.map(item => item.id).sort(),
        fixture.testCatalog.ids,
      )
      for (const item of fixture.testCatalog.files) {
        const bytes = fs.readFileSync(path.join(repositoryRoot, item.path))
        const actual = { bytes: bytes.length, sha256: sha256(bytes) }
        const update = coverageEvolutionOverlays
          .get(caseName)
          ?.testCatalogFileUpdates?.find(candidate => candidate.path === item.path)
        assert.ok(
          [item, update]
            .filter(Boolean)
            .some(
              expected =>
                actual.bytes === expected.bytes &&
                actual.sha256 === expected.sha256,
            ),
          `${caseName}: test-catalog file ${item.path}`,
        )
      }

      const evolution = coverageEvolutionState(caseName, caseRoot, fixture)
      const report = scannerReport(
        caseName,
        fixture,
        baselinePath,
        targetPath,
      )
      if (
        evolution.semanticState === 'provisional' &&
        evolution.dependencyState !== 'corrected' &&
        evolution.proofGroups.every(group => group.state === 'provisional') &&
        evolution.dceGroups.every(group => group.state === 'provisional')
      ) {
        assert.equal(
          new Set(
            report.sourceRuntimeAddedOwnerResidueRows.map(
              row => row.structural.index,
            ),
          ).size,
          fixture.summary.reportUnits,
        )
        assert.equal(
          report.sourceRuntimeAddedOwnerResidueRows.length,
          fixture.summary.reportResidues,
        )
        assert.equal(
          residueDigest(report.sourceRuntimeAddedOwnerResidueRows),
          fixture.summary.reportResidueIdentitiesSha256,
        )
        const actual = deriveAnalysis({
          correspondence,
          fixture,
          report,
          structural,
        })
        assert.deepEqual(actual, fixture.analysis)
      } else {
        const semanticIndices = new Set(
          evolution.semanticSpecs.map(spec => spec.targetIndex),
        )
        const dependencyIndices = new Set(evolution.dependencyIndices)
        const evolutionIndices = new Set([
          ...semanticIndices,
          ...dependencyIndices,
          ...evolution.proofGroups.flatMap(group => group.indices),
        ])
        const residual = report.sourceRuntimeAddedOwnerResidueRows.filter(
          row => !evolutionIndices.has(row.structural.index),
        )
        if (
          evolution.proofGroups.length > 0 &&
          caseName !== '2.1.117-to-2.1.118'
        ) {
          const canonicalResidual = sortCanonicalRows(
            residual.map(canonicalResidue),
          )
          assert.deepEqual(
            {
              units: new Set(canonicalResidual.map(row => row[0])).size,
              residues: canonicalResidual.length,
              residueIdentitiesSha256:
                canonicalRowsDigest(canonicalResidual),
            },
            postProofResidual(caseName, fixture),
            `${caseName}: post-proof scanner residual remains exact`,
          )
        } else {
          const replayState =
            caseName === '2.1.117-to-2.1.118'
              ? target118ReplaySourceState()
              : 'raw'
          const replayCoverageState =
            caseName === '2.1.117-to-2.1.118'
              ? target118ReplayCoverageState(caseRoot, fixture)
              : 'provisional'
          assert.ok(
            replayCoverageState === 'corrected' || replayState === 'raw',
            `${caseName}: recovered replay source requires corrected replay coverage`,
          )
          const expectedResidual =
            replayCoverageState === 'provisional'
              ? fixture.policy.coverageEvolution
                  .residualExcludingEvolutionUnits
              : replayState === 'package'
                ? evolution.dceGroups.every(
                    group => group.state === 'corrected',
                  )
                  ? target118ReplayPackage.residual
                  : target118ReplayPackage.residualBeforeSessionKindDce
                : evolution.dceGroups.every(
                      group => group.state === 'corrected',
                    )
                  ? target118ReplayPackage.correctedRawResidual
                  : target118ReplayPackage
                      .correctedRawResidualBeforeSessionKindDce
          assert.deepEqual(
            {
              units: new Set(residual.map(row => row.structural.index)).size,
              residues: residual.length,
              residueIdentitiesSha256: residueDigest(residual),
            },
            expectedResidual,
            `${caseName}: non-corrected source-gap partitions remain exact`,
          )
          if (
            caseName === '2.1.117-to-2.1.118' &&
            evolution.dceGroups.every(group => group.state === 'corrected')
          ) {
            const preDceRows = sortCanonicalRows([
              ...residual.map(canonicalResidue),
              ...evolution.dceGroups.map(group => group.residueIdentity),
            ])
            const expectedPreDceResidual =
              replayState === 'package'
                ? target118ReplayPackage.residualBeforeSessionKindDce
                : target118ReplayPackage
                    .correctedRawResidualBeforeSessionKindDce
            assert.deepEqual(
              {
                units: new Set(preDceRows.map(row => row[0])).size,
                residues: preDceRows.length,
                residueIdentitiesSha256: canonicalRowsDigest(preDceRows),
              },
              expectedPreDceResidual,
              `${caseName}: pre-DCE replay residual remains derivable and exact`,
            )
          }
        }
        if (evolution.semanticState === 'corrected') {
          authenticatePreCorrectionRows(
            fixture,
            baselineBytes.toString('utf8'),
            targetBytes.toString('utf8'),
          )
        } else {
          for (const [category, indices] of [
            [
              'source-value-represented',
              new Set(
                fixture.analysis.sourceValueRepresentations.map(
                  row => row.targetIndex,
                ),
              ),
            ],
            [
              'compiler-source-representation',
              new Set(
                fixture.policy.compilerRepresentationProofs.map(
                  proof => proof.targetIndex,
                ),
              ),
            ],
          ]) {
            const rows = report.sourceRuntimeAddedOwnerResidueRows.filter(row =>
              indices.has(row.structural.index),
            )
            const expected = fixture.analysis.categories[category]
            assert.deepEqual(
              {
                units: new Set(rows.map(row => row.structural.index)).size,
                residues: rows.length,
                residueIdentitiesSha256: residueDigest(rows),
              },
              {
                units: expected.units,
                residues: expected.residues,
                residueIdentitiesSha256: expected.residueIdentitiesSha256,
              },
              `${caseName}: ${category} provisional partition`,
            )
          }
        }
        if (evolution.dependencyState === 'provisional') {
          const rows = report.sourceRuntimeAddedOwnerResidueRows.filter(row =>
            dependencyIndices.has(row.structural.index),
          )
          const expected =
            fixture.analysis.categories['dependency-build-input-gap']
          assert.deepEqual(
            {
              units: new Set(rows.map(row => row.structural.index)).size,
              residues: rows.length,
              residueIdentitiesSha256: residueDigest(rows),
            },
            {
              units: expected.units,
              residues: expected.residues,
              residueIdentitiesSha256: expected.residueIdentitiesSha256,
            },
            `${caseName}: dependency provisional partition`,
          )
        }
        const importedScannerStates = []
        for (const group of evolution.proofGroups) {
          const scannerRows =
            group.descriptor.scannerResidualMode ===
            'matched-static-report-row'
              ? report.rows
              : report.sourceRuntimeAddedOwnerResidueRows
          const liveRows = sortCanonicalRows(
            scannerRows
              .filter(row => group.indices.includes(row.structural.index))
              .map(row =>
                group.identityMode === 'target-only'
                  ? targetOnlyResidueIdentity(row)
                  : canonicalResidue(row),
              ),
          )
          const replayState =
            group.descriptor.scannerResidualMode === 'source-replay-state'
              ? caseName === '2.1.117-to-2.1.118'
                ? target118ReplaySourceState()
                : target119SourceReplayState(group.descriptor.id)
              : null
          const expectedRows = sortCanonicalRows(
            group.descriptor.scannerResidualMode === 'source-replay-state'
              ? replayState === 'raw'
                ? group.rows
                : []
              : group.state === 'corrected'
                ? group.correctedRows
              : group.rows,
          )
          const correctedRawSourceReplay =
            group.descriptor.scannerResidualMode === 'source-replay-state' &&
            replayState === 'raw' &&
            group.state === 'corrected' &&
            group.descriptor.correctedRawScannerResidues !== undefined
          const correctedPackageSourceReplay =
            group.descriptor.scannerResidualMode === 'source-replay-state' &&
            replayState === 'package' &&
            group.state === 'corrected' &&
            group.descriptor.correctedPackageScannerResidues !== undefined
          if (
            group.descriptor.scannerResidualMode ===
            'matched-static-report-row'
          ) {
            const actual = {
              units: new Set(liveRows.map(row => row[0])).size,
              residues: liveRows.length,
              residueIdentitiesSha256: canonicalRowsDigest(liveRows),
            }
            assert.deepEqual(
              group.descriptor.rawScanner,
              group.descriptor.packageScanner,
              `${caseName}: ${group.descriptor.id} raw/package matched row is source-state invariant`,
            )
            assert.deepEqual(
              actual,
              group.descriptor.rawScanner,
              `${caseName}: ${group.descriptor.id} exact matched production row`,
            )
            const provenRows = new Set(
              group.rows.map(row => JSON.stringify(row)),
            )
            const postProofRows = liveRows.filter(
              row => !provenRows.has(JSON.stringify(row)),
            )
            assert.deepEqual(
              postProofRows,
              group.correctedRows,
              `${caseName}: ${group.descriptor.id} matched-static proof evolves one scanner row to zero unproved rows`,
            )
          } else if (
            group.descriptor.scannerResidualMode === 'source-replay-state' &&
            replayState === 'package'
          ) {
            assert.equal(
              group.state,
              'corrected',
              `${caseName}: recovered replay source requires corrected ${group.descriptor.id} coverage`,
            )
          }
          if (
            group.descriptor.scannerResidualMode ===
            'matched-static-report-row'
          ) {
            // The exact physical row and its zero-row post-proof remainder are
            // asserted above; it deliberately stays outside owner-source scans.
          } else if (
            group.descriptor.scannerResidualMode ===
            'pinned-raw-package-subset'
          ) {
            const actual = {
              units: new Set(liveRows.map(row => row[0])).size,
              residues: liveRows.length,
              residueIdentitiesSha256: canonicalRowsDigest(liveRows),
            }
            const allowedStates = new Set(
              ['raw', 'package'].filter(
                state =>
                  JSON.stringify(actual) ===
                  JSON.stringify(group.descriptor[`${state}Scanner`]),
              ),
            )
            assert.ok(
              allowedStates.size > 0,
              `${caseName}: ${group.descriptor.id} exact raw or package scanner subset`,
            )
            importedScannerStates.push(allowedStates)
          } else if (correctedRawSourceReplay) {
            assert.deepEqual(
              {
                units: new Set(liveRows.map(row => row[0])).size,
                residues: liveRows.length,
                residueIdentitiesSha256: canonicalRowsDigest(liveRows),
              },
              {
                units: group.descriptor.correctedRawScannerUnits,
                residues: group.descriptor.correctedRawScannerResidues,
                residueIdentitiesSha256:
                  group.descriptor
                    .correctedRawScannerResidueIdentitiesSha256,
              },
              `${caseName}: ${group.descriptor.id} exact corrected raw-source scanner subset`,
            )
          } else if (correctedPackageSourceReplay) {
            assert.deepEqual(
              {
                units: new Set(liveRows.map(row => row[0])).size,
                residues: liveRows.length,
                residueIdentitiesSha256: canonicalRowsDigest(liveRows),
              },
              {
                units: group.descriptor.correctedPackageScannerUnits,
                residues: group.descriptor.correctedPackageScannerResidues,
                residueIdentitiesSha256:
                  group.descriptor
                    .correctedPackageScannerResidueIdentitiesSha256,
              },
              `${caseName}: ${group.descriptor.id} exact corrected package-source scanner subset`,
            )
          } else if (
            group.descriptor.scannerResidualMode ===
              'pinned-explicit-subset' &&
            (group.state === 'corrected' ||
              group.descriptor.provisionalScannerResidues !== undefined)
          ) {
            const prefix =
              group.state === 'corrected' ? 'corrected' : 'provisional'
            assert.deepEqual(
              {
                units: new Set(liveRows.map(row => row[0])).size,
                residues: liveRows.length,
                residueIdentitiesSha256: canonicalRowsDigest(liveRows),
              },
              {
                units: group.descriptor[`${prefix}ScannerUnits`],
                residues: group.descriptor[`${prefix}ScannerResidues`],
                residueIdentitiesSha256:
                  group.descriptor[
                    `${prefix}ScannerResidueIdentitiesSha256`
                  ],
              },
              `${caseName}: ${group.descriptor.id} exact ${group.state} scanner subset`,
            )
          } else {
            assert.deepEqual(
              liveRows,
              expectedRows,
              `${caseName}: ${group.descriptor.id} exact ${group.state} scanner partition`,
            )
          }
        }
        if (importedScannerStates.length > 0) {
          const globalStates = ['raw', 'package'].filter(state =>
            importedScannerStates.every(states => states.has(state)),
          )
          assert.equal(
            globalStates.length,
            1,
            `${caseName}: imported owner-proof scanner source state is exact and atomic`,
          )
        }
        if (
          evolution.proofGroups.length > 0 &&
          !coverageEvolutionOverlays.get(caseName)?.skipSourceSupplementResidual
        ) {
          const supplement =
            fixture.analysis.sourceGapReplay.ownerSupplementRequired
          const correctedSupplementIndices = new Set(
            evolution.proofGroups
              .filter(
                group =>
                  group.descriptor.analysisPartition ===
                  'owner-supplement-required',
              )
              .flatMap(group => group.indices),
          )
          const supplementIndices = new Set(
            supplement.targetIndices.filter(
              targetIndex => !correctedSupplementIndices.has(targetIndex),
            ),
          )
          const liveSupplement = sortCanonicalRows(
            report.sourceRuntimeAddedOwnerResidueRows
              .filter(row => supplementIndices.has(row.structural.index))
              .map(canonicalResidue),
          )
          assert.deepEqual(
            {
              units: new Set(liveSupplement.map(row => row[0])).size,
              residues: liveSupplement.length,
              unsupportedResidues: liveSupplement.length,
              targetIndicesSha256: unitDigest(
                [...new Set(liveSupplement.map(row => row[0]))].sort(
                  (left, right) => left - right,
                ),
              ),
              residueIdentitiesSha256:
                canonicalRowsDigest(liveSupplement),
            },
            postProofSourceSupplementResidual(caseName, fixture),
            `${caseName}: exact owner-supplement residual remains fail closed`,
          )
        }
      }

      const structuralByIndex = new Map(
        structural.regions.map(region => [region.target.index, region]),
      )
      const targetSource = targetBytes.toString('utf8')
      for (const proof of fixture.policy.compilerRepresentationProofs) {
        const region = structuralByIndex.get(proof.targetIndex)
        assert.ok(region, `${caseName} u${proof.targetIndex}: proof region`)
        assert.equal(
          sha256(targetSource.slice(region.target.start, region.target.end)),
          region.target.sourceHash,
          `${caseName} u${proof.targetIndex}: authenticated target slice`,
        )
        for (const source of proof.sourceFiles) {
          const bytes = fs.readFileSync(path.join(sourceRoot, source.path))
          const actual = { bytes: bytes.length, sha256: sha256(bytes) }
          const scheduleReplay =
            caseName === '2.1.117-to-2.1.118' &&
            proof.targetIndex === 20566
              ? readPinnedJson(
                  target118ReplayPackage.fixtures.scheduleOneOff,
                  'Target118 schedule compiler-source replay',
                )
              : null
          const accepted = [
            { bytes: source.bytes, sha256: source.sha256 },
            ...(scheduleReplay &&
            source.path ===
              scheduleReplay.inputs.sourcePostimage.path.replace(/^src\//, '')
              ? [
                  {
                    bytes: scheduleReplay.inputs.sourcePostimage.bytes,
                    sha256: scheduleReplay.inputs.sourcePostimage.sha256,
                  },
                ]
              : []),
          ]
          assert.ok(
            accepted.some(
              expected =>
                actual.bytes === expected.bytes &&
                actual.sha256 === expected.sha256,
            ),
            `${caseName} u${proof.targetIndex}: ${source.path}`,
          )
        }
      }
      for (const marker of fixture.policy.dependencyBuildInputMarkers) {
        const region = structuralByIndex.get(marker.targetIndex)
        assert.ok(region, `${caseName} u${marker.targetIndex}: marker region`)
        assert.ok(
          targetSource
            .slice(region.target.start, region.target.end)
            .includes(marker.text),
          `${caseName} u${marker.targetIndex}: dependency marker ${marker.text}`,
        )
      }
    },
  )
}
