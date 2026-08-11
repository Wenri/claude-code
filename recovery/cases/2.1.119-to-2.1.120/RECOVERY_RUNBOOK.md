# Claude Code 2.1.120 recovery runbook

Run commands from the repository root. Set `ARTIFACTS` to the directory containing the paths recorded in `manifest.json`, and `BASELINE_TARBALL` to the authenticated 2.1.119 npm tarball.

## Complete verification

```sh
pixi run node recovery/scripts/verify-2.1.120-recovery.mjs \
  --case recovery/cases/2.1.119-to-2.1.120/manifest.json \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$BASELINE_TARBALL" \
  --repo .
```

This one command re-authenticates all artifact identities, exact deltas, Bun extraction, generated attribution, structural accounting, readable diff, source overlay round trip, all 9 semantic test files, semantic correspondence, embedded-code reconstruction, and exact package reconstruction. It must report zero unclassified tokens and zero unverified obligations.

## Focused semantic verification

```sh
CLAUDE_CODE_2_1_119_BUNDLE="$ARTIFACTS/2.1.119-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_120_BUNDLE="$ARTIFACTS/2.1.120-linux-x64/cli.inner.js" \
CLAUDE_2_1_119_CLI_INNER="$ARTIFACTS/2.1.119-linux-x64/cli.inner.js" \
CLAUDE_2_1_120_CLI_INNER="$ARTIFACTS/2.1.120-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_119_WRAPPER="$ARTIFACTS/2.1.119-linux-x64/cli.js" \
CLAUDE_CODE_2_1_120_WRAPPER="$ARTIFACTS/2.1.120-linux-x64/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.120-official-bullets.test.mjs \
  recovery/test/recovery-2.1.120-hidden-obligations.test.mjs \
  recovery/test/recovery-2.1.120-daemon-lifecycle.test.mjs \
  recovery/test/recovery-2.1.120-selection-scrollback.test.mjs \
  recovery/test/recovery-2.1.120-direct-evidence.test.mjs \
  recovery/test/recovery-2.1.120-fleet-auto-relaunch.test.mjs \
  recovery/test/recovery-2.1.120-team-memory-sync.test.mjs \
  recovery/test/recovery-2.1.120-notifications-inherited.test.mjs \
  recovery/test/recovery-2.1.120-subagent-status-line.test.mjs
```

Expected frozen result: 52 tests, 52 passed, 0 failed.

## Rebuild and verify semantic correspondence

```sh
pixi run node recovery/scripts/build-2.1.120-semantic-obligations.mjs
pixi run node recovery/scripts/build-semantic-correspondence.mjs \
  --attribution recovery/cases/2.1.119-to-2.1.120/attribution \
  --structural recovery/cases/2.1.119-to-2.1.120/structural/generated-delta.json.gz \
  --obligations recovery/cases/2.1.119-to-2.1.120/semantic/obligations.json \
  --source-root src \
  --changelog recovery/cases/2.1.119-to-2.1.120/evidence/CHANGELOG-2.1.120.md \
  --baseline "$ARTIFACTS/2.1.119-linux-x64/cli.inner.js" \
  --target "$ARTIFACTS/2.1.120-linux-x64/cli.inner.js" \
  --output recovery/cases/2.1.119-to-2.1.120/semantic/semantic-correspondence.json.gz \
  --summary recovery/cases/2.1.119-to-2.1.120/semantic/summary.json
```

The rebuilt summary must retain 4,331,872/4,331,872 accounted tokens, 22/22 official bullets, 84 obligations, zero unclassified tokens, and zero unverified obligations.

## Overlay identity

The frozen overlay `recovered/source-facing-overlay.patch` reverses the current `src` tree to `351cd4d13f70a564dc2d90f59ab0093dc6fc7b05` and reapplies to the exact target src tree `a80c537f012b1588e3900c998971fec31eefc3ce`. `recovered/source-freeze/SHA256SUMS`, `identity.json`, and `source-files.sha256` pin every handoff identity. The source-lineage verifier repeats both directions and a complete per-file byte comparison; do not substitute a different base or target commit.

Target source files: 2099; target source manifest SHA-256: `4c1077d53d1b5cfef2aec10a066ea298de445333e0c2fc50f7ad4109d475c17b`.
