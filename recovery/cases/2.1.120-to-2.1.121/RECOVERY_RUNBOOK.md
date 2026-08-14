# Claude Code 2.1.121 recovery runbook

Run commands from the repository root. Set `ARTIFACTS` to the directory containing the paths recorded in `manifest.json`, and `BASELINE_TARBALL` to the authenticated 2.1.120 npm tarball.

## Install pinned verifier dependencies

```sh
pixi run npm --prefix recovery ci --ignore-scripts
```

This installs only the exact dependency graph pinned by `recovery/package-lock.json`; lifecycle scripts stay disabled.

## Complete verification

```sh
pixi run node recovery/scripts/verify-2.1.121-recovery.mjs \
  --case recovery/cases/2.1.120-to-2.1.121/manifest.json \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$BASELINE_TARBALL" \
  --repo .
```

This one command re-authenticates all artifact identities, exact deltas, Bun extraction, generated attribution, structural accounting, readable diff, source overlay round trip, all 33 semantic test files, semantic correspondence, embedded-code reconstruction, and exact package reconstruction. It must report zero unclassified tokens and zero unverified obligations.

## Focused semantic verification

```sh
CLAUDE_CODE_2_1_120_BUNDLE="$ARTIFACTS/2.1.120-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_121_BUNDLE="$ARTIFACTS/2.1.121-linux-x64/cli.inner.js" \
CLAUDE_2_1_120_CLI_INNER="$ARTIFACTS/2.1.120-linux-x64/cli.inner.js" \
CLAUDE_2_1_121_CLI_INNER="$ARTIFACTS/2.1.121-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_120_WRAPPER="$ARTIFACTS/2.1.120-linux-x64/cli.js" \
CLAUDE_CODE_2_1_121_WRAPPER="$ARTIFACTS/2.1.121-linux-x64/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.121-autocompact-rapid-refill.test.mjs \
  recovery/test/recovery-2.1.121-compaction-spinner.test.mjs \
  recovery/test/recovery-2.1.121-console-platform-wizards.test.mjs \
  recovery/test/recovery-2.1.121-daemon-service.test.mjs \
  recovery/test/recovery-2.1.121-dialog-overflow.test.mjs \
  recovery/test/recovery-2.1.121-direct-evidence.test.mjs \
  recovery/test/recovery-2.1.121-dream-skill.test.mjs \
  recovery/test/recovery-2.1.121-dynamic-loop.test.mjs \
  recovery/test/recovery-2.1.121-feedback-surface.test.mjs \
  recovery/test/recovery-2.1.121-hidden-obligations.test.mjs \
  recovery/test/recovery-2.1.121-inherited-active-core.test.mjs \
  recovery/test/recovery-2.1.121-inherited-runtime-residuals.test.mjs \
  recovery/test/recovery-2.1.121-lower-runtime-boundaries.test.mjs \
  recovery/test/recovery-2.1.121-mcp-refresh-repl-copy.test.mjs \
  recovery/test/recovery-2.1.121-official-owned-cluster.test.mjs \
  recovery/test/recovery-2.1.121-official-residual-cluster.test.mjs \
  recovery/test/recovery-2.1.121-official-runtime-settings-cluster.test.mjs \
  recovery/test/recovery-2.1.121-powershell-pipeline-paths.test.mjs \
  recovery/test/recovery-2.1.121-powerup-team-onboarding.test.mjs \
  recovery/test/recovery-2.1.121-query-terminal-schema.test.mjs \
  recovery/test/recovery-2.1.121-reactive-runtime-gaps.test.mjs \
  recovery/test/recovery-2.1.121-remote-control-boundary.test.mjs \
  recovery/test/recovery-2.1.121-remote-ux-and-branch.test.mjs \
  recovery/test/recovery-2.1.121-removed-gates.test.mjs \
  recovery/test/recovery-2.1.121-residual-dream-hook-defer.test.mjs \
  recovery/test/recovery-2.1.121-retained-runtime-surfaces.test.mjs \
  recovery/test/recovery-2.1.121-runtime-hardening.test.mjs \
  recovery/test/recovery-2.1.121-sdk-control-runtime.test.mjs \
  recovery/test/recovery-2.1.121-settings-auth-runtime.test.mjs \
  recovery/test/recovery-2.1.121-subscription-upsell-gates.test.mjs \
  recovery/test/recovery-2.1.121-usage-attribution.test.mjs \
  recovery/test/recovery-2.1.121-warm-resume.test.mjs \
  recovery/test/recovery-2.1.121-worktree-baseline.test.mjs
```

Expected frozen result: 121 tests, 121 passed, 0 failed.

## Rebuild and verify semantic correspondence

```sh
pixi run node recovery/scripts/build-2.1.121-semantic-obligations.mjs
pixi run node recovery/scripts/build-semantic-correspondence.mjs \
  --attribution recovery/cases/2.1.120-to-2.1.121/attribution \
  --structural recovery/cases/2.1.120-to-2.1.121/structural/generated-delta.json.gz \
  --obligations recovery/cases/2.1.120-to-2.1.121/semantic/obligations.json \
  --source-root src \
  --changelog recovery/cases/2.1.120-to-2.1.121/evidence/CHANGELOG-2.1.121.md \
  --baseline "$ARTIFACTS/2.1.120-linux-x64/cli.inner.js" \
  --target "$ARTIFACTS/2.1.121-linux-x64/cli.inner.js" \
  --output recovery/cases/2.1.120-to-2.1.121/semantic/semantic-correspondence.json.gz \
  --summary recovery/cases/2.1.120-to-2.1.121/semantic/summary.json
```

The rebuilt summary must retain 4,378,709/4,378,709 accounted tokens, 39/39 official bullets, 100 obligations, zero unclassified tokens, and zero unverified obligations.

## Overlay identity

The frozen overlay `recovered/source-facing-overlay.patch` reverses the current `src` tree to `6801ead984ba2c3df02bd092ad8b93df096ed8c1` and reapplies to the exact target src tree `b55f7a7932216b9e4bce7705543ab970d34fbdff`. `recovered/source-freeze/SHA256SUMS`, `identity.json`, and `source-files.sha256` pin every handoff identity. The source-lineage verifier repeats both directions and a complete per-file byte comparison; do not substitute a different base or target commit.

Source-only `git diff --check` must be empty. The full target tree has exactly one reviewed acquisition-metadata diagnostic: `recovery/cases/2.1.120-to-2.1.121/evidence/CHANGELOG-2.1.121.md:42: new blank line at EOF.`. Its exact output SHA-256 is `a45849856c08d527991e52348d5991ffb9ca17f9fc0d55e4acd4ab7246726b22`; `diff-check.raw.txt` and `diff-check-allowlist.txt` pin it. The freeze builder requires `--allow-diff-check-sha256 a45849856c08d527991e52348d5991ffb9ca17f9fc0d55e4acd4ab7246726b22` and rejects any additional or changed diagnostic.

Target source files: 2127; target source manifest SHA-256: `be381e5003a78df1f8b8d6ada0dd062d525a75bce01895637fcea449105570fd`.
