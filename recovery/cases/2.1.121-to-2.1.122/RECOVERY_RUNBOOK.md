# Claude Code 2.1.122 recovery runbook

Run commands from the repository root. Set `ARTIFACTS` to the directory containing the paths recorded in `manifest.json`, and `BASELINE_TARBALL` to the authenticated 2.1.121 npm tarball.

## Install pinned verifier dependencies

```sh
pixi run npm --prefix recovery ci --ignore-scripts
```

This installs only the exact dependency graph pinned by `recovery/package-lock.json`; lifecycle scripts stay disabled.

## Complete verification

```sh
pixi run node recovery/scripts/verify-2.1.122-recovery.mjs \
  --case recovery/cases/2.1.121-to-2.1.122/manifest.json \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$BASELINE_TARBALL" \
  --repo .
```

This one command re-authenticates all artifact identities, exact deltas, Bun extraction, generated attribution, structural accounting, readable diff, source overlay round trip, all 232 semantic test files, semantic correspondence, embedded-code reconstruction, and exact package reconstruction. It must report zero unclassified tokens and zero unverified obligations.

## Focused semantic verification

```sh
CLAUDE_CODE_2_1_121_BUNDLE="$ARTIFACTS/2.1.121-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_122_BUNDLE="$ARTIFACTS/2.1.122-linux-x64/cli.inner.js" \
CLAUDE_21121_INNER="$ARTIFACTS/2.1.121-linux-x64/cli.inner.js" \
CLAUDE_21122_INNER="$ARTIFACTS/2.1.122-linux-x64/cli.inner.js" \
CLAUDE_2_1_121_CLI_INNER="$ARTIFACTS/2.1.121-linux-x64/cli.inner.js" \
CLAUDE_2_1_122_CLI_INNER="$ARTIFACTS/2.1.122-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_121_WRAPPER="$ARTIFACTS/2.1.121-linux-x64/cli.js" \
CLAUDE_CODE_2_1_122_WRAPPER="$ARTIFACTS/2.1.122-linux-x64/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.122-auto-mode-original-decision.test.mjs \
  recovery/test/recovery-2.1.122-backend-registry-state.test.mjs \
  recovery/test/recovery-2.1.122-classifier-app-state.test.mjs \
  recovery/test/recovery-2.1.122-computer-use-tcc-request.test.mjs \
  recovery/test/recovery-2.1.122-copy-table-normalization.test.mjs \
  recovery/test/recovery-2.1.122-direct-evidence.test.mjs \
  recovery/test/recovery-2.1.122-feedback-streaming-payload.test.mjs \
  recovery/test/recovery-2.1.122-fullscreen-clear.test.mjs \
  recovery/test/recovery-2.1.122-git-remote-redaction.test.mjs \
  recovery/test/recovery-2.1.122-headless-exports.test.mjs \
  recovery/test/recovery-2.1.122-heapdump-diagnostics.test.mjs \
  recovery/test/recovery-2.1.122-hidden-ai-title-cache.test.mjs \
  recovery/test/recovery-2.1.122-hidden-anthropic-aws-env.test.mjs \
  recovery/test/recovery-2.1.122-hidden-api-diagnostics.test.mjs \
  recovery/test/recovery-2.1.122-hidden-atomic-write.test.mjs \
  recovery/test/recovery-2.1.122-hidden-aws-auth-refresh-cooldown.test.mjs \
  recovery/test/recovery-2.1.122-hidden-background-cli.test.mjs \
  recovery/test/recovery-2.1.122-hidden-background-runtime.test.mjs \
  recovery/test/recovery-2.1.122-hidden-bash-validation.test.mjs \
  recovery/test/recovery-2.1.122-hidden-brief-stop-hook-guard.test.mjs \
  recovery/test/recovery-2.1.122-hidden-btw-threading.test.mjs \
  recovery/test/recovery-2.1.122-hidden-classifier-name-flight.test.mjs \
  recovery/test/recovery-2.1.122-hidden-claude-api-init.test.mjs \
  recovery/test/recovery-2.1.122-hidden-command-lifecycle-instance.test.mjs \
  recovery/test/recovery-2.1.122-hidden-cowork-memory-index.test.mjs \
  recovery/test/recovery-2.1.122-hidden-daemon-procstart.test.mjs \
  recovery/test/recovery-2.1.122-hidden-daemon-respawn.test.mjs \
  recovery/test/recovery-2.1.122-hidden-datadog-surface.test.mjs \
  recovery/test/recovery-2.1.122-hidden-debug-daemon.test.mjs \
  recovery/test/recovery-2.1.122-hidden-docker-context-flags.test.mjs \
  recovery/test/recovery-2.1.122-hidden-fleet-gate-model-copy.test.mjs \
  recovery/test/recovery-2.1.122-hidden-fleetview-reply.test.mjs \
  recovery/test/recovery-2.1.122-hidden-footer-datadog.test.mjs \
  recovery/test/recovery-2.1.122-hidden-gated-retained-surfaces.test.mjs \
  recovery/test/recovery-2.1.122-hidden-headless-cache-clear.test.mjs \
  recovery/test/recovery-2.1.122-hidden-headless-startup-telemetry.test.mjs \
  recovery/test/recovery-2.1.122-hidden-input-placeholder-navigation.test.mjs \
  recovery/test/recovery-2.1.122-hidden-isolation-exemptions.test.mjs \
  recovery/test/recovery-2.1.122-hidden-job-runtime.test.mjs \
  recovery/test/recovery-2.1.122-hidden-live-resume-guard.test.mjs \
  recovery/test/recovery-2.1.122-hidden-mcp-auth-outcome-copy.test.mjs \
  recovery/test/recovery-2.1.122-hidden-mcp-error-blocks.test.mjs \
  recovery/test/recovery-2.1.122-hidden-mcp-reserved-name.test.mjs \
  recovery/test/recovery-2.1.122-hidden-mcp-result-size-annotation.test.mjs \
  recovery/test/recovery-2.1.122-hidden-memory-evaluation.test.mjs \
  recovery/test/recovery-2.1.122-hidden-memory-selector.test.mjs \
  recovery/test/recovery-2.1.122-hidden-oauth-invalid-grant.test.mjs \
  recovery/test/recovery-2.1.122-hidden-plan-pressure.test.mjs \
  recovery/test/recovery-2.1.122-hidden-powershell-failures.test.mjs \
  recovery/test/recovery-2.1.122-hidden-prompt-policy.test.mjs \
  recovery/test/recovery-2.1.122-hidden-provider-setup-commands.test.mjs \
  recovery/test/recovery-2.1.122-hidden-remote-bash.test.mjs \
  recovery/test/recovery-2.1.122-hidden-remote-branch.test.mjs \
  recovery/test/recovery-2.1.122-hidden-repl-images.test.mjs \
  recovery/test/recovery-2.1.122-hidden-reset-model-strings.test.mjs \
  recovery/test/recovery-2.1.122-hidden-resume-lineage.test.mjs \
  recovery/test/recovery-2.1.122-hidden-resume-reload.test.mjs \
  recovery/test/recovery-2.1.122-hidden-retained-env-active.test.mjs \
  recovery/test/recovery-2.1.122-hidden-retained-provider-env.test.mjs \
  recovery/test/recovery-2.1.122-hidden-retained-runtime-events.test.mjs \
  recovery/test/recovery-2.1.122-hidden-retained-telemetry.test.mjs \
  recovery/test/recovery-2.1.122-hidden-retry-watchdog.test.mjs \
  recovery/test/recovery-2.1.122-hidden-runtime-telemetry.test.mjs \
  recovery/test/recovery-2.1.122-hidden-scrub-sandbox.test.mjs \
  recovery/test/recovery-2.1.122-hidden-sdk-beta-filtering.test.mjs \
  recovery/test/recovery-2.1.122-hidden-sdk-init-handshake.test.mjs \
  recovery/test/recovery-2.1.122-hidden-session-runtime-telemetry.test.mjs \
  recovery/test/recovery-2.1.122-hidden-session-state-instance.test.mjs \
  recovery/test/recovery-2.1.122-hidden-simple-prompt-override.test.mjs \
  recovery/test/recovery-2.1.122-hidden-skill-tools.test.mjs \
  recovery/test/recovery-2.1.122-hidden-subprocess-env.test.mjs \
  recovery/test/recovery-2.1.122-hidden-survey-auto-dismiss.test.mjs \
  recovery/test/recovery-2.1.122-hidden-swarm-fast-mode-tag.test.mjs \
  recovery/test/recovery-2.1.122-hidden-system-prompt-gb.test.mjs \
  recovery/test/recovery-2.1.122-hidden-teleport-create-policy.test.mjs \
  recovery/test/recovery-2.1.122-hidden-toolsearch-telemetry.test.mjs \
  recovery/test/recovery-2.1.122-hidden-url-matcher.test.mjs \
  recovery/test/recovery-2.1.122-hidden-workspace-proxy-aliases.test.mjs \
  recovery/test/recovery-2.1.122-hidden-workspace-proxy-telemetry.test.mjs \
  recovery/test/recovery-2.1.122-hook-telemetry-name.test.mjs \
  recovery/test/recovery-2.1.122-ide-diff-telemetry.test.mjs \
  recovery/test/recovery-2.1.122-idle-return-context.test.mjs \
  recovery/test/recovery-2.1.122-image-app-state.test.mjs \
  recovery/test/recovery-2.1.122-insights-response-prompt.test.mjs \
  recovery/test/recovery-2.1.122-mcp-server-export.test.mjs \
  recovery/test/recovery-2.1.122-monitor-ccr-timeout.test.mjs \
  recovery/test/recovery-2.1.122-official-owned-cluster.test.mjs \
  recovery/test/recovery-2.1.122-permission-mode-guards.test.mjs \
  recovery/test/recovery-2.1.122-policy-limits-growthbook.test.mjs \
  recovery/test/recovery-2.1.122-resume-permission-mode.test.mjs \
  recovery/test/recovery-2.1.122-retained-agent-auto-mode.test.mjs \
  recovery/test/recovery-2.1.122-retained-agent-parent-context.test.mjs \
  recovery/test/recovery-2.1.122-retained-agents-running.test.mjs \
  recovery/test/recovery-2.1.122-retained-analytics-state.test.mjs \
  recovery/test/recovery-2.1.122-retained-api-idle-timeout.test.mjs \
  recovery/test/recovery-2.1.122-retained-api-metrics-lifecycle.test.mjs \
  recovery/test/recovery-2.1.122-retained-api-server-error-copy.test.mjs \
  recovery/test/recovery-2.1.122-retained-app-provider-isolation.test.mjs \
  recovery/test/recovery-2.1.122-retained-app-task-shutdown.test.mjs \
  recovery/test/recovery-2.1.122-retained-atomic-teammate-spawn.test.mjs \
  recovery/test/recovery-2.1.122-retained-auto-copy-hint.test.mjs \
  recovery/test/recovery-2.1.122-retained-auto-mode-policy-consent.test.mjs \
  recovery/test/recovery-2.1.122-retained-auto-mode-state.test.mjs \
  recovery/test/recovery-2.1.122-retained-away-summary-schema.test.mjs \
  recovery/test/recovery-2.1.122-retained-bash-ast-fail-closed.test.mjs \
  recovery/test/recovery-2.1.122-retained-bash-cd-permissions.test.mjs \
  recovery/test/recovery-2.1.122-retained-bash-wrapper-rules.test.mjs \
  recovery/test/recovery-2.1.122-retained-bg-attach-fallback.test.mjs \
  recovery/test/recovery-2.1.122-retained-bootstrap-runtime-state.test.mjs \
  recovery/test/recovery-2.1.122-retained-bridge-entitlement.test.mjs \
  recovery/test/recovery-2.1.122-retained-bridge-status-rendering.test.mjs \
  recovery/test/recovery-2.1.122-retained-brief-attachments.test.mjs \
  recovery/test/recovery-2.1.122-retained-ccd-session-relay.test.mjs \
  recovery/test/recovery-2.1.122-retained-chrome-detection.test.mjs \
  recovery/test/recovery-2.1.122-retained-classifier-prompt.test.mjs \
  recovery/test/recovery-2.1.122-retained-claude-fleet-agent.test.mjs \
  recovery/test/recovery-2.1.122-retained-cli-ink-mcp.test.mjs \
  recovery/test/recovery-2.1.122-retained-cli-ink-plugins.test.mjs \
  recovery/test/recovery-2.1.122-retained-cli-option-metadata.test.mjs \
  recovery/test/recovery-2.1.122-retained-command-routing.test.mjs \
  recovery/test/recovery-2.1.122-retained-compact-descriptor.test.mjs \
  recovery/test/recovery-2.1.122-retained-config-copy-label.test.mjs \
  recovery/test/recovery-2.1.122-retained-console-oauth-url-outdent.test.mjs \
  recovery/test/recovery-2.1.122-retained-content-disposition-filename.test.mjs \
  recovery/test/recovery-2.1.122-retained-context-telemetry.test.mjs \
  recovery/test/recovery-2.1.122-retained-cwd-isolation.test.mjs \
  recovery/test/recovery-2.1.122-retained-daemon-background-sighup.test.mjs \
  recovery/test/recovery-2.1.122-retained-daemon-cleanup.test.mjs \
  recovery/test/recovery-2.1.122-retained-daemon-hub-controls.test.mjs \
  recovery/test/recovery-2.1.122-retained-daemon-spare-claim.test.mjs \
  recovery/test/recovery-2.1.122-retained-desktop-version.test.mjs \
  recovery/test/recovery-2.1.122-retained-diagnostics.test.mjs \
  recovery/test/recovery-2.1.122-retained-direct-permission-facade.test.mjs \
  recovery/test/recovery-2.1.122-retained-doctor.test.mjs \
  recovery/test/recovery-2.1.122-retained-effort-bridge-command.test.mjs \
  recovery/test/recovery-2.1.122-retained-effort-bridge-config-exports.test.mjs \
  recovery/test/recovery-2.1.122-retained-fast-bridge-command.test.mjs \
  recovery/test/recovery-2.1.122-retained-fewer-permission-prompts.test.mjs \
  recovery/test/recovery-2.1.122-retained-fleetview-renderer-input.test.mjs \
  recovery/test/recovery-2.1.122-retained-fork-child-prompt.test.mjs \
  recovery/test/recovery-2.1.122-retained-forked-skill-permission-getter.test.mjs \
  recovery/test/recovery-2.1.122-retained-growthbook-cache-surfaces.test.mjs \
  recovery/test/recovery-2.1.122-retained-help-feedback.test.mjs \
  recovery/test/recovery-2.1.122-retained-hook-session-job-name.test.mjs \
  recovery/test/recovery-2.1.122-retained-hook-validation-error.test.mjs \
  recovery/test/recovery-2.1.122-retained-ink-absolute-hit-test.test.mjs \
  recovery/test/recovery-2.1.122-retained-ink-lifecycle-frame-timing.test.mjs \
  recovery/test/recovery-2.1.122-retained-input-companions.test.mjs \
  recovery/test/recovery-2.1.122-retained-input-keydown-order.test.mjs \
  recovery/test/recovery-2.1.122-retained-input-overlay-state.test.mjs \
  recovery/test/recovery-2.1.122-retained-invalid-settings-dialog.test.mjs \
  recovery/test/recovery-2.1.122-retained-json-transcript-empty.test.mjs \
  recovery/test/recovery-2.1.122-retained-keybinding-schema.test.mjs \
  recovery/test/recovery-2.1.122-retained-keybindings-command.test.mjs \
  recovery/test/recovery-2.1.122-retained-kill-all-agent-hint.test.mjs \
  recovery/test/recovery-2.1.122-retained-linked-worktree-cleanup.test.mjs \
  recovery/test/recovery-2.1.122-retained-live-named-exports.test.mjs \
  recovery/test/recovery-2.1.122-retained-log-selector-hints.test.mjs \
  recovery/test/recovery-2.1.122-retained-mailbox-clear-lock.test.mjs \
  recovery/test/recovery-2.1.122-retained-mcp-auth-tools.test.mjs \
  recovery/test/recovery-2.1.122-retained-mcp-channel-registration.test.mjs \
  recovery/test/recovery-2.1.122-retained-mcp-reconnect-retry.test.mjs \
  recovery/test/recovery-2.1.122-retained-mcp-shutdown-cleanup.test.mjs \
  recovery/test/recovery-2.1.122-retained-memory-write-display-rows.test.mjs \
  recovery/test/recovery-2.1.122-retained-message-rendering.test.mjs \
  recovery/test/recovery-2.1.122-retained-model-1m-copy.test.mjs \
  recovery/test/recovery-2.1.122-retained-model-bridge-command.test.mjs \
  recovery/test/recovery-2.1.122-retained-model-migration-notice.test.mjs \
  recovery/test/recovery-2.1.122-retained-model-namespace.test.mjs \
  recovery/test/recovery-2.1.122-retained-named-helper-exports.test.mjs \
  recovery/test/recovery-2.1.122-retained-native-binary-mode.test.mjs \
  recovery/test/recovery-2.1.122-retained-native-scroll-pump.test.mjs \
  recovery/test/recovery-2.1.122-retained-oauth-auth-namespace.test.mjs \
  recovery/test/recovery-2.1.122-retained-oauth-error-and-trust-reset.test.mjs \
  recovery/test/recovery-2.1.122-retained-onboarding-team-memory.test.mjs \
  recovery/test/recovery-2.1.122-retained-permission-gate-copy.test.mjs \
  recovery/test/recovery-2.1.122-retained-permission-invalid-input.test.mjs \
  recovery/test/recovery-2.1.122-retained-persistence-message-ops.test.mjs \
  recovery/test/recovery-2.1.122-retained-plugin-error-formatters.test.mjs \
  recovery/test/recovery-2.1.122-retained-plugin-pinner-repair.test.mjs \
  recovery/test/recovery-2.1.122-retained-post-tool-file-sync.test.mjs \
  recovery/test/recovery-2.1.122-retained-powershell-action-preference.test.mjs \
  recovery/test/recovery-2.1.122-retained-powershell-path-background.test.mjs \
  recovery/test/recovery-2.1.122-retained-prefix-placeholders.test.mjs \
  recovery/test/recovery-2.1.122-retained-primary-permission-denial.test.mjs \
  recovery/test/recovery-2.1.122-retained-print-startup.test.mjs \
  recovery/test/recovery-2.1.122-retained-prompt-hook-api-error.test.mjs \
  recovery/test/recovery-2.1.122-retained-quick-web-setup-policy.test.mjs \
  recovery/test/recovery-2.1.122-retained-remote-cli-contract.test.mjs \
  recovery/test/recovery-2.1.122-retained-runtime-helper-exports.test.mjs \
  recovery/test/recovery-2.1.122-retained-sandbox-mailbox-auto.test.mjs \
  recovery/test/recovery-2.1.122-retained-sandbox-tmpdir-order.test.mjs \
  recovery/test/recovery-2.1.122-retained-scroll-config.test.mjs \
  recovery/test/recovery-2.1.122-retained-scrollbox-nonsticky-bottom.test.mjs \
  recovery/test/recovery-2.1.122-retained-sdk-memory-recall.test.mjs \
  recovery/test/recovery-2.1.122-retained-sdk-plugin-install.test.mjs \
  recovery/test/recovery-2.1.122-retained-sdk-requesting-status.test.mjs \
  recovery/test/recovery-2.1.122-retained-sdk-schema-enums.test.mjs \
  recovery/test/recovery-2.1.122-retained-seed-read-schema.test.mjs \
  recovery/test/recovery-2.1.122-retained-selection-delete.test.mjs \
  recovery/test/recovery-2.1.122-retained-shell-context.test.mjs \
  recovery/test/recovery-2.1.122-retained-sidechain-internal-persistence.test.mjs \
  recovery/test/recovery-2.1.122-retained-skill-input-metadata.test.mjs \
  recovery/test/recovery-2.1.122-retained-sleep-inhibitor.test.mjs \
  recovery/test/recovery-2.1.122-retained-small-corrections.test.mjs \
  recovery/test/recovery-2.1.122-retained-startup-phase-timing.test.mjs \
  recovery/test/recovery-2.1.122-retained-subagent-stop-interrupt.test.mjs \
  recovery/test/recovery-2.1.122-retained-subprocess-namespace.test.mjs \
  recovery/test/recovery-2.1.122-retained-task-output-guidance.test.mjs \
  recovery/test/recovery-2.1.122-retained-task-stop-ownership.test.mjs \
  recovery/test/recovery-2.1.122-retained-team-create-no-clobber.test.mjs \
  recovery/test/recovery-2.1.122-retained-teleport-command.test.mjs \
  recovery/test/recovery-2.1.122-retained-tiny-memory-prompts.test.mjs \
  recovery/test/recovery-2.1.122-retained-tmux-session-list.test.mjs \
  recovery/test/recovery-2.1.122-retained-tool-context-operations.test.mjs \
  recovery/test/recovery-2.1.122-retained-tool-use-context-facade.test.mjs \
  recovery/test/recovery-2.1.122-retained-ui-runtime.test.mjs \
  recovery/test/recovery-2.1.122-retained-ultrathink-reminder.test.mjs \
  recovery/test/recovery-2.1.122-retained-unknown-tool-guidance.test.mjs \
  recovery/test/recovery-2.1.122-retained-user-fork-boilerplate-message.test.mjs \
  recovery/test/recovery-2.1.122-retained-virtual-message-keys.test.mjs \
  recovery/test/recovery-2.1.122-retained-web-browser-state.test.mjs \
  recovery/test/recovery-2.1.122-retained-workflow-script-permission.test.mjs \
  recovery/test/recovery-2.1.122-retained-yolo-claudemd-authorization.test.mjs \
  recovery/test/recovery-2.1.122-session-agent-name-signal.test.mjs \
  recovery/test/recovery-2.1.122-session-storage-surfaces.test.mjs \
  recovery/test/recovery-2.1.122-source-only-command-registry.test.mjs \
  recovery/test/recovery-2.1.122-teammate-colors-app-state.test.mjs \
  recovery/test/recovery-2.1.122-tool-result-storage-stripping.test.mjs \
  recovery/test/recovery-2.1.122-track-session-write.test.mjs \
  recovery/test/recovery-2.1.122-transcript-cursor.test.mjs \
  recovery/test/recovery-2.1.122-ui-config-input.test.mjs
```

Expected frozen result: 565 tests, 565 passed, 0 failed.

## Rebuild and verify semantic correspondence

```sh
pixi run node recovery/scripts/build-2.1.122-semantic-obligations.mjs
pixi run node recovery/scripts/build-semantic-correspondence.mjs \
  --attribution recovery/cases/2.1.121-to-2.1.122/attribution \
  --structural recovery/cases/2.1.121-to-2.1.122/structural/generated-delta.json.gz \
  --obligations recovery/cases/2.1.121-to-2.1.122/semantic/obligations.json \
  --source-root src \
  --changelog recovery/cases/2.1.121-to-2.1.122/evidence/CHANGELOG-2.1.122.md \
  --baseline "$ARTIFACTS/2.1.121-linux-x64/cli.inner.js" \
  --target "$ARTIFACTS/2.1.122-linux-x64/cli.inner.js" \
  --output recovery/cases/2.1.121-to-2.1.122/semantic/semantic-correspondence.json.gz \
  --summary recovery/cases/2.1.121-to-2.1.122/semantic/summary.json
```

The rebuilt summary must retain 4,394,491/4,394,491 accounted tokens, 18/18 official bullets, 32 obligations, zero unclassified tokens, and zero unverified obligations.

## Overlay identity

The frozen overlay `recovered/source-facing-overlay.patch` reverses the current `src` tree to `11890981447ee2cea3407c608f4411e43e5fe72a` and reapplies to the exact target src tree `75b1edeeb4f6fd33e59f672d9e38c641b4fdd3e6`. `recovered/source-freeze/SHA256SUMS`, `identity.json`, and `source-files.sha256` pin every handoff identity. The source-lineage verifier repeats both directions and a complete per-file byte comparison; do not substitute a different base or target commit.

Source-only `git diff --check` must be empty. The full target tree has exactly one reviewed acquisition-metadata diagnostic: `recovery/cases/2.1.121-to-2.1.122/evidence/CHANGELOG-2.1.122.md:21: new blank line at EOF.`. Its exact output SHA-256 is `1075939c016a1591ae25d94a2c587ba8e2fa151b05326ee93197f55584393902`; `diff-check.raw.txt` and `diff-check-allowlist.txt` pin it. The freeze builder requires `--allow-diff-check-sha256 1075939c016a1591ae25d94a2c587ba8e2fa151b05326ee93197f55584393902` and rejects any additional or changed diagnostic.

Target source files: 2161; target source manifest SHA-256: `fc746ed64867bba321825eadc690f608c56729c73ea7199308ede18a591c05fb`.
