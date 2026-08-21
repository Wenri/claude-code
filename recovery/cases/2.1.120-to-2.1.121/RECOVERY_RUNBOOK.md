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

This one command re-authenticates all artifact identities, exact deltas, Bun extraction, generated attribution, structural accounting, readable diff, source overlay round trip, all 103 frozen release-scoped test files, the 33-entry semantic-core catalog, semantic correspondence, embedded-code reconstruction, and exact package reconstruction. It must report zero unclassified tokens and zero unverified obligations.

## Frozen release-suite verification

```sh
pixi run node recovery/scripts/verify-source-lineage.mjs \
  --case recovery/cases/2.1.120-to-2.1.121/manifest.json \
  --artifacts "$ARTIFACTS" \
  --repo .
```

This is the authoritative standalone release-suite command. It authenticates isolated baseline and target Git repositories, scrubs inherited behavior and source redirects, builds a real-file sandbox from the frozen runtime closure, materializes the authenticated bundle aliases and source trees, verifies and expands the case-contained audit inputs, and copies the exact Bun runtime closure and TypeScript tool before execution. It neither reads nor links a repository `.recovery-tmp` tree.

Expected frozen result: 480 tests, 466 passed, 14 skipped, 0 failed across 103 files. The 33-entry semantic-core catalog is a strict subset of this execution set.

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
