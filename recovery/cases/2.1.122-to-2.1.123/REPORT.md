# Claude Code 2.1.123 recovery report

The Linux x64 2.1.123 published package and embedded JavaScript graph are reconstructed exactly, and the recovered source tree reproduces the authenticated bundle semantics under a fail-closed correspondence proof. This does not claim byte-identical upstream authored TypeScript: the public artifact exposes generated code, so source recovery is an equivalent, reviewable overlay.

## Exact artifact closure

- 2.1.122 wrapper: 13,949,634 bytes, SHA-256 `92303473496442aa210604027d9d509e0bc861c1c9ba472c539dfa56c27cc183`.
- 2.1.123 wrapper: 13,949,666 bytes, SHA-256 `6992e5f0bf7410ce9dc5eee1a26b132f3257bbed0f3a7f9433ff01c656ac91fc`.
- 2.1.122 analyzable interior: 13,949,544 bytes, SHA-256 `b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c`.
- 2.1.123 analyzable interior: 13,949,576 bytes, SHA-256 `59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd`.
- The exact wrapper delta is `diff/cli.js.zstd-delta`; package-member and embedded-module reconstruction are independently asserted in `manifest.json`.
- Generated-offset attribution accounts for all 13,949,576 target UTF-16 units in 3 ranges, with zero unaccounted units.
- The structural ledger accounts for all 4,394,501 target tokens across 22,302 regions, with zero unclassified tokens.
- The deterministic known-delta proof closes all 22,302 target structural units and 4,394,501 target tokens with zero changed, moved, unresolved, unmatched-baseline, or unresolved-target residue. Its exact inputs are `structural/metadata-normalized-delta.json.gz` and `structural/known-delta-ledger.json.gz`; `structural/known-delta-proof.json` pins their byte lengths and SHA-256 identities.

## Semantic closure

The row-scoped direct catalog contains exactly one official obligation (official 1). It covers the single 2.1.123 changelog bullet exactly once; the reviewed adjacent delta has no additional hidden, daemon, or residual semantic rows.

- Bundle witnesses: 5 fragments and 1 explicit target absences.
- Source witnesses: 5 exact assertions, 0 path-scoped fragment removals, and 0 authenticated deleted-file identities.
- Classifications: source-localized-adjacent 1.
- Test catalog: 3/3 entries consumed.
- Unverified obligations: 0.
- Unclassified target tokens: 0.

Every obligation binds one unique row from `semantic/direct-evidence.json`. The direct test pins the catalog byte length and SHA-256, then checks exact counts in both authenticated adjacent bundles and exact hashes/counts in the recovered source. All 3 frozen source-lineage suites are executed and consumed by the semantic proof.

## Source freeze

The incremental overlay is frozen from `c30cece4b85c84cd9e92ca708c96d1cd3f8f6b87` to `a7cd7eb2e6e6fce6c5ea5bb6b2062ded1b3ddc97`.

- Target src Git tree: `c18f92c06db8f9e5cc5f4fbc0b60d1f7437171b5`.
- Overlay: 1,553 bytes, SHA-256 `76f593faa00381698af726b9229545608e1658a3551b01395e186c46dca902db`.
- Changed source paths: 1; 12 insertions and 6 deletions.
- Frozen source tree: 2,161 files, 32,745,613 bytes, zero symlinks.
- Authenticated target tests: 7/7 passed across 3 files.
- Syntax builds: 1 passed, 0 failed.
- Source-only `git diff --check`: 0 diagnostics.
- Full-tree `git diff --check`: exactly 1 reviewed acquisition-metadata diagnostic, SHA-256 `882ecc7f8d701a4c7f8cc3e6cfc1cb196ee8902f25d7b4f7b295279f8912d2af`: `recovery/cases/2.1.122-to-2.1.123/evidence/CHANGELOG-2.1.123.md:4: new blank line at EOF.`.
- Forward apply, complete byte comparison, reverse apply, and forward reconstruction all succeeded.

## Claim boundary

The exact claim covers the published Linux x64 package, wrapper, analyzable bundle, embedded plain-JavaScript graph, generated accounting, and recovery payloads. The equivalent-source claim covers the frozen `src` overlay plus authenticated semantic tests. Platform-native behavior not present in the Linux x64 artifact and original upstream TypeScript spelling are outside the claim.

Run `RECOVERY_RUNBOOK.md` for the single complete verifier and focused reproduction commands.
