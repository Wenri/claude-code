# Claude Code 2.1.124 recovery runbook

Run commands from the repository root. Set `ARTIFACTS` to the directory containing the paths recorded in `manifest.json`, and `BASELINE_TARBALL` to the authenticated 2.1.123 npm tarball.

## Install pinned verifier dependencies

```sh
pixi run npm --prefix recovery ci --ignore-scripts
```

This installs only the exact dependency graph pinned by `recovery/package-lock.json`; lifecycle scripts stay disabled.

## Complete verification

```sh
pixi run node recovery/scripts/verify-2.1.124-recovery.mjs \
  --case recovery/cases/2.1.123-to-2.1.124/manifest.json \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$BASELINE_TARBALL" \
  --repo .
```

This one command re-authenticates all artifact identities, exact deltas, Bun extraction, generated attribution, all three structural ledgers, the deterministic known-delta proof, readable diff, source overlay round trip, all 12 semantic test files, semantic correspondence, embedded-code reconstruction, and exact package reconstruction. It must report zero changed, moved, or unresolved known-delta residue, zero unclassified tokens, and zero unverified obligations.

## Focused semantic verification

```sh
CLAUDE_CODE_2_1_123_BUNDLE="$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_124_BUNDLE="$ARTIFACTS/2.1.124-linux-x64/cli.inner.js" \
CLAUDE_21123_INNER="$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
CLAUDE_21124_INNER="$ARTIFACTS/2.1.124-linux-x64/cli.inner.js" \
CLAUDE_2_1_123_CLI_INNER="$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
CLAUDE_2_1_124_CLI_INNER="$ARTIFACTS/2.1.124-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_123_WRAPPER="$ARTIFACTS/2.1.123-linux-x64/cli.js" \
CLAUDE_CODE_2_1_124_WRAPPER="$ARTIFACTS/2.1.124-linux-x64/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.124-direct-evidence.test.mjs \
  recovery/test/recovery-2.1.124-gateway-doctor-plugins.test.mjs \
  recovery/test/recovery-2.1.124-history-picker-scopes.test.mjs \
  recovery/test/recovery-2.1.124-legacy-list-peers-alias.test.mjs \
  recovery/test/recovery-2.1.124-mcp-oauth-dedup.test.mjs \
  recovery/test/recovery-2.1.124-project-purge.test.mjs \
  recovery/test/recovery-2.1.124-repl-isolation.test.mjs \
  recovery/test/recovery-2.1.124-runtime-tail.test.mjs \
  recovery/test/recovery-2.1.124-semantic-delta.test.mjs \
  recovery/test/recovery-2.1.124-skill-activation-telemetry.test.mjs \
  recovery/test/recovery-2.1.124-ui-command-semantics.test.mjs \
  recovery/test/recovery-2.1.124-ui-sdk-tail.test.mjs
```

Expected frozen result: 37 tests, 37 passed, 0 failed.

## Rebuild and verify the zero-residue known delta

```sh
pixi run node recovery/scripts/verify-2.1.124-semantic-delta.mjs \
  --baseline "$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
  --target "$ARTIFACTS/2.1.124-linux-x64/cli.inner.js" \
  --case-root recovery/cases/2.1.123-to-2.1.124 \
  --source-root .
```

The rebuilt exact ledger must retain 22,358 matched units and 4,405,970 matched tokens, with zero changed, moved, unresolved, unmatched-baseline, or unresolved-target residue.

## Rebuild and verify semantic correspondence

```sh
pixi run node recovery/scripts/build-2.1.124-semantic-obligations.mjs
pixi run node recovery/scripts/build-semantic-correspondence.mjs \
  --attribution recovery/cases/2.1.123-to-2.1.124/attribution \
  --structural recovery/cases/2.1.123-to-2.1.124/structural/generated-delta.json.gz \
  --obligations recovery/cases/2.1.123-to-2.1.124/semantic/obligations.json \
  --source-root src \
  --changelog recovery/cases/2.1.123-to-2.1.124/evidence/RELEASE-2.1.124-ABSENCE.json \
  --baseline "$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
  --target "$ARTIFACTS/2.1.124-linux-x64/cli.inner.js" \
  --output recovery/cases/2.1.123-to-2.1.124/semantic/semantic-correspondence.json.gz \
  --summary recovery/cases/2.1.123-to-2.1.124/semantic/summary.json
```

The rebuilt summary must retain 4,405,970/4,405,970 accounted tokens, 0/0 official bullets, 27 obligation, zero unclassified tokens, and zero unverified obligations.

## Overlay identity

The frozen overlay `recovered/source-facing-overlay.patch` reverses the current `src` tree to `338d170737e8294c489481bc2e8fac52d8ce5f85` and reapplies to the exact target src tree `43090c8672f1ab7ba4b9a9673bff0a762b7aaf92`. `recovered/source-freeze/SHA256SUMS`, `identity.json`, and `source-files.sha256` pin every handoff identity. The source-lineage verifier repeats both directions and a complete per-file byte comparison; do not substitute a different base or target commit.

Source-only `git diff --check` must be empty. The full target-tree output is frozen byte-for-byte in `diff-check.raw.txt`, with 0 diagnostics and SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; `diff-check-allowlist.txt` records whether an explicit reviewed allowlist was required. The freeze builder rejects any additional, missing, or changed diagnostic.

Target source files: 2166; target source manifest SHA-256: `c02a43b6e86419c40daa30c3077957e7b9bab6ac34186a494ac1b697ac5807d2`.
