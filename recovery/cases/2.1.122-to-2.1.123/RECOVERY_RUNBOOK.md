# Claude Code 2.1.123 recovery runbook

Run commands from the repository root. Set `ARTIFACTS` to the directory containing the paths recorded in `manifest.json`, and `BASELINE_TARBALL` to the authenticated 2.1.122 npm tarball.

## Install pinned verifier dependencies

```sh
pixi run npm --prefix recovery ci --ignore-scripts
```

This installs only the exact dependency graph pinned by `recovery/package-lock.json`; lifecycle scripts stay disabled.

## Complete verification

```sh
pixi run node recovery/scripts/verify-2.1.123-recovery.mjs \
  --case recovery/cases/2.1.122-to-2.1.123/manifest.json \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$BASELINE_TARBALL" \
  --repo .
```

This one command re-authenticates all artifact identities, exact deltas, Bun extraction, generated attribution, all three structural ledgers, the deterministic known-delta proof, readable diff, source overlay round trip, all 3 semantic test files, semantic correspondence, embedded-code reconstruction, and exact package reconstruction. It must report zero changed, moved, or unresolved known-delta residue, zero unclassified tokens, and zero unverified obligations.

## Focused semantic verification

```sh
CLAUDE_CODE_2_1_122_BUNDLE="$ARTIFACTS/2.1.122-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_123_BUNDLE="$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
CLAUDE_21122_INNER="$ARTIFACTS/2.1.122-linux-x64/cli.inner.js" \
CLAUDE_21123_INNER="$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
CLAUDE_2_1_122_CLI_INNER="$ARTIFACTS/2.1.122-linux-x64/cli.inner.js" \
CLAUDE_2_1_123_CLI_INNER="$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_122_WRAPPER="$ARTIFACTS/2.1.122-linux-x64/cli.js" \
CLAUDE_CODE_2_1_123_WRAPPER="$ARTIFACTS/2.1.123-linux-x64/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.123-direct-evidence.test.mjs \
  recovery/test/recovery-2.1.123-oauth-beta-disable-experimental.test.mjs \
  recovery/test/recovery-2.1.123-semantic-delta.test.mjs
```

Expected frozen result: 7 tests, 7 passed, 0 failed.

## Rebuild and verify the zero-residue known delta

```sh
pixi run node recovery/scripts/verify-2.1.123-semantic-delta.mjs \
  --baseline "$ARTIFACTS/2.1.122-linux-x64/cli.inner.js" \
  --target "$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
  --output recovery/cases/2.1.122-to-2.1.123
```

The rebuilt exact ledger must retain 22,302 matched units and 4,394,501 matched tokens, with zero changed, moved, unresolved, unmatched-baseline, or unresolved-target residue.

## Rebuild and verify semantic correspondence

```sh
pixi run node recovery/scripts/build-2.1.123-semantic-obligations.mjs
pixi run node recovery/scripts/build-semantic-correspondence.mjs \
  --attribution recovery/cases/2.1.122-to-2.1.123/attribution \
  --structural recovery/cases/2.1.122-to-2.1.123/structural/generated-delta.json.gz \
  --obligations recovery/cases/2.1.122-to-2.1.123/semantic/obligations.json \
  --source-root src \
  --changelog recovery/cases/2.1.122-to-2.1.123/evidence/CHANGELOG-2.1.123.md \
  --baseline "$ARTIFACTS/2.1.122-linux-x64/cli.inner.js" \
  --target "$ARTIFACTS/2.1.123-linux-x64/cli.inner.js" \
  --output recovery/cases/2.1.122-to-2.1.123/semantic/semantic-correspondence.json.gz \
  --summary recovery/cases/2.1.122-to-2.1.123/semantic/summary.json
```

The rebuilt summary must retain 4,394,501/4,394,501 accounted tokens, 1/1 official bullets, 1 obligation, zero unclassified tokens, and zero unverified obligations.

## Overlay identity

The frozen overlay `recovered/source-facing-overlay.patch` reverses the current `src` tree to `c30cece4b85c84cd9e92ca708c96d1cd3f8f6b87` and reapplies to the exact target src tree `c18f92c06db8f9e5cc5f4fbc0b60d1f7437171b5`. `recovered/source-freeze/SHA256SUMS`, `identity.json`, and `source-files.sha256` pin every handoff identity. The source-lineage verifier repeats both directions and a complete per-file byte comparison; do not substitute a different base or target commit.

Source-only `git diff --check` must be empty. The full target tree has exactly one reviewed acquisition-metadata diagnostic: `recovery/cases/2.1.122-to-2.1.123/evidence/CHANGELOG-2.1.123.md:4: new blank line at EOF.`. Its exact output SHA-256 is `882ecc7f8d701a4c7f8cc3e6cfc1cb196ee8902f25d7b4f7b295279f8912d2af`; `diff-check.raw.txt` and `diff-check-allowlist.txt` pin it. The freeze builder requires `--allow-diff-check-sha256 882ecc7f8d701a4c7f8cc3e6cfc1cb196ee8902f25d7b4f7b295279f8912d2af` and rejects any additional or changed diagnostic.

Target source files: 2161; target source manifest SHA-256: `33463eb1c71e68a97dbcbce67b5c19713471f983108a63f860f22f6ce1615bfc`.
