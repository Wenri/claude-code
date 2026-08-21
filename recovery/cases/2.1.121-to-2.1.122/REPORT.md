# Claude Code 2.1.122 recovery report

The Linux x64 2.1.122 published package and embedded JavaScript graph are reconstructed exactly, and the recovered source tree reproduces the authenticated bundle semantics under a fail-closed correspondence proof. This does not claim byte-identical upstream authored TypeScript: the public artifact exposes generated code, so source recovery is an equivalent, reviewable overlay.

## Exact artifact closure

- 2.1.121 wrapper: 13,908,278 bytes, SHA-256 `885f3342ff45bb4258517a4dc0f8405bbe2817f237d6b8b2fe4429694ecbe9c2`.
- 2.1.122 wrapper: 13,949,634 bytes, SHA-256 `92303473496442aa210604027d9d509e0bc861c1c9ba472c539dfa56c27cc183`.
- 2.1.121 analyzable interior: 13,908,188 bytes, SHA-256 `783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a`.
- 2.1.122 analyzable interior: 13,949,544 bytes, SHA-256 `b4266d7ac18a537d67e3a503c572386f3f8bd11ae75f9485d4505cea10f6833c`.
- The exact wrapper delta is `diff/cli.js.zstd-delta`; package-member and embedded-module reconstruction are independently asserted in `manifest.json`.
- Generated-offset attribution accounts for all 13,949,544 target UTF-16 units in 58,065 ranges, with zero unaccounted units.
- The structural ledger accounts for all 4,394,491 target tokens across 22,301 regions, with zero unclassified tokens.

## Semantic closure

The row-scoped direct catalog contains 32 obligations (daemon 1, hidden 10, official 18, residual 3). It covers all 18 official changelog bullets exactly once, H01-H10, the daemon/background lifecycle, and every finite residual source cluster.

- Bundle witnesses: 47 fragments and 4 explicit target absences.
- Source witnesses: 520 exact assertions, 3 path-scoped fragment removals, and 1 authenticated deleted-file identities.
- Classifications: source-localized-adjacent 21, source-localized-inherited 11.
- Test catalog: 232/232 entries consumed.
- Unverified obligations: 0.
- Unclassified target tokens: 0.

Every obligation binds one unique row from `semantic/direct-evidence.json`. The direct test pins the catalog byte length and SHA-256, then checks exact counts in both authenticated adjacent bundles and exact hashes/counts in the recovered source. All 232 frozen source-lineage suites are executed and consumed by the semantic proof.

## Source freeze

The incremental overlay is frozen from `11890981447ee2cea3407c608f4411e43e5fe72a` to `d8be38561b1a45a3c382f811d0bb3c62c4cc2b14`.

- Target src Git tree: `75b1edeeb4f6fd33e59f672d9e38c641b4fdd3e6`.
- Overlay: 4,247,759 bytes, SHA-256 `5abe55eebb2eb1d2660784276becc3621e54a6a129c5b665cf1d25cdc4e12b85`.
- Changed source paths: 430; 23,047 insertions and 8,998 deletions.
- Frozen source tree: 2,161 files, 32,745,530 bytes, zero symlinks.
- Authenticated target tests: 565/565 passed across 232 files.
- Syntax builds: 429 passed, 0 failed.
- Source-only `git diff --check`: 0 diagnostics.
- Full-tree `git diff --check`: exactly 1 reviewed acquisition-metadata diagnostic, SHA-256 `1075939c016a1591ae25d94a2c587ba8e2fa151b05326ee93197f55584393902`: `recovery/cases/2.1.121-to-2.1.122/evidence/CHANGELOG-2.1.122.md:21: new blank line at EOF.`.
- Forward apply, complete byte comparison, reverse apply, and forward reconstruction all succeeded.

## Claim boundary

The exact claim covers the published Linux x64 package, wrapper, analyzable bundle, embedded plain-JavaScript graph, generated accounting, and recovery payloads. The equivalent-source claim covers the frozen `src` overlay plus authenticated semantic tests. Platform-native behavior not present in the Linux x64 artifact and original upstream TypeScript spelling are outside the claim.

Run `RECOVERY_RUNBOOK.md` for the single complete verifier and focused reproduction commands.
