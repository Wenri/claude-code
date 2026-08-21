# Claude Code 2.1.126 recovery runbook

Run commands from the repository root. Set `ARTIFACTS` to the directory containing the paths recorded in `manifest.json`, and `BASELINE_TARBALL` to the authenticated 2.1.124 npm tarball.

## Install pinned verifier dependencies

```sh
pixi run npm --prefix recovery ci --ignore-scripts
```

This installs only the exact dependency graph pinned by `recovery/package-lock.json`; lifecycle scripts stay disabled.

## Complete verification

```sh
pixi run node recovery/scripts/verify-2.1.126-recovery.mjs \
  --case recovery/cases/2.1.124-to-2.1.126/manifest.json \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$BASELINE_TARBALL" \
  --repo .
```

This one command re-authenticates all artifact identities, exact deltas, Bun extraction, generated attribution, all three structural ledgers, the deterministic known-delta proof, readable diff, source overlay round trip, all 4 semantic test files, semantic correspondence, embedded-code reconstruction, and exact package reconstruction. It must report zero changed, moved, or unresolved known-delta residue, zero unclassified tokens, and zero unverified obligations.

## Focused semantic verification

```sh
CLAUDE_CODE_2_1_124_BUNDLE="$ARTIFACTS/2.1.124-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_126_BUNDLE="$ARTIFACTS/2.1.126-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_124_WRAPPER="$ARTIFACTS/2.1.124-linux-x64/cli.js" \
CLAUDE_CODE_2_1_126_WRAPPER="$ARTIFACTS/2.1.126-linux-x64/cli.js" \
pixi run node --test \
  recovery/test/recovery-2.1.126-active-semantics.test.mjs \
  recovery/test/recovery-2.1.126-direct-evidence.test.mjs \
  recovery/test/recovery-2.1.126-retained-redraw.test.mjs \
  recovery/test/recovery-2.1.126-semantic-delta.test.mjs
```

Expected frozen result: 10 tests, 10 passed, 0 failed.

## Rebuild and verify the zero-residue known delta

```sh
pixi run node recovery/scripts/verify-2.1.126-semantic-delta.mjs \
  --baseline "$ARTIFACTS/2.1.124-linux-x64/cli.inner.js" \
  --target "$ARTIFACTS/2.1.126-linux-x64/cli.inner.js" \
  --case-root recovery/cases/2.1.124-to-2.1.126 \
  --source-root .
```

The rebuilt exact ledger must retain 22,358 matched units and 4,405,944 matched tokens, with zero changed, moved, unresolved, unmatched-baseline, or unresolved-target residue.

## Rebuild and verify semantic correspondence

```sh
pixi run node recovery/scripts/build-2.1.126-reviewed-official-evidence.mjs
pixi run node recovery/scripts/build-2.1.126-semantic-obligations.mjs
pixi run node recovery/scripts/build-semantic-correspondence.mjs \
  --attribution recovery/cases/2.1.124-to-2.1.126/attribution \
  --structural recovery/cases/2.1.124-to-2.1.126/structural/generated-delta.json.gz \
  --obligations recovery/cases/2.1.124-to-2.1.126/semantic/obligations.json \
  --source-root src \
  --changelog recovery/cases/2.1.124-to-2.1.126/evidence/CHANGELOG-2.1.126.md \
  --baseline "$ARTIFACTS/2.1.124-linux-x64/cli.inner.js" \
  --target "$ARTIFACTS/2.1.126-linux-x64/cli.inner.js" \
  --output recovery/cases/2.1.124-to-2.1.126/semantic/semantic-correspondence.json.gz \
  --summary recovery/cases/2.1.124-to-2.1.126/semantic/summary.json
```

The rebuilt summary must retain 4,405,944/4,405,944 accounted tokens, 33/33 official bullets, 33 obligation, zero unclassified tokens, and zero unverified obligations.

## Overlay identity

The frozen overlay `recovered/source-facing-overlay.patch` reverses the current `src` tree to `ae866640a6d67891fe14aeff5bc41da10784b979` and reapplies to the exact target src tree `9c7c4f699cd0cc740dcb5e5341aeb026d4bc2263`. `recovered/source-freeze/SHA256SUMS`, `identity.json`, and `source-files.sha256` pin every handoff identity. The source-lineage verifier repeats both directions and a complete per-file byte comparison; do not substitute a different base or target commit.

Source-only `git diff --check` must be empty. The full target-tree output is frozen byte-for-byte in `diff-check.raw.txt`, with 1 diagnostics and SHA-256 `46e47269c72f3c24b9f1e6840408b039b219f1b1f38f61616628f9e9e159aae7`; `diff-check-allowlist.txt` records whether an explicit reviewed allowlist was required. The freeze builder rejects any additional, missing, or changed diagnostic.

Target source files: 2166; target source manifest SHA-256: `0f8129ef0f03852c5943f0c627d7dd0f52312c29d9f666b32c2db2e364848986`.
