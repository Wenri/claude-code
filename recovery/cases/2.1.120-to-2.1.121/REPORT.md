# Claude Code 2.1.121 recovery report

The Linux x64 2.1.121 published package and embedded JavaScript graph are reconstructed exactly, and the recovered source tree reproduces the authenticated bundle semantics under a fail-closed correspondence proof. This does not claim byte-identical upstream authored TypeScript: the public artifact exposes generated code, so source recovery is an equivalent, reviewable overlay.

## Exact artifact closure

- 2.1.120 wrapper: 13,784,833 bytes, SHA-256 `280754b3db23901e986711f11dc74536da9669c43f61999b4a84e2cf76cf1e83`.
- 2.1.121 wrapper: 13,908,278 bytes, SHA-256 `885f3342ff45bb4258517a4dc0f8405bbe2817f237d6b8b2fe4429694ecbe9c2`.
- 2.1.120 analyzable interior: 13,784,743 bytes, SHA-256 `c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f`.
- 2.1.121 analyzable interior: 13,908,188 bytes, SHA-256 `783221adb53c27180d0439b86c3eb7fef2bd7ab6cd8d9cd5dfafca301d0e766a`.
- The exact wrapper delta is `diff/cli.js.zstd-delta`; package-member and embedded-module reconstruction are independently asserted in `manifest.json`.
- Generated-offset attribution accounts for all 13,908,188 target UTF-16 units in 58,101 ranges, with zero unaccounted units.
- The structural ledger accounts for all 4,378,709 target tokens across 22,219 regions, with zero unclassified tokens.

## Semantic closure

The row-scoped direct catalog contains 100 obligations (official 39, hidden 13, daemon 3, residual 45). It covers all 39 official changelog bullets exactly once, H01-H13, the daemon/background lifecycle, and every finite residual source cluster.

- Bundle witnesses: 354 fragments and 5 explicit target absences.
- Source witnesses: 662 exact assertions and 22 path-scoped removals.
- Classifications: source-localized-adjacent 52, source-localized-inherited 48.
- Test catalog: 33/33 entries consumed.
- Unverified obligations: 0.
- Unclassified target tokens: 0.

Every obligation binds one unique row from `semantic/direct-evidence.json`. The direct test pins the catalog byte length and SHA-256, then checks exact counts in both authenticated adjacent bundles and exact hashes/counts in the recovered source. All 33 frozen source-lineage suites are executed and consumed by the semantic proof.

## Source freeze

The incremental overlay is frozen from `6801ead984ba2c3df02bd092ad8b93df096ed8c1` to `6d1dcf52c331e9c76445e8eb6a3ae98c63826b21`.

- Target src Git tree: `b55f7a7932216b9e4bce7705543ab970d34fbdff`.
- Overlay: 2,747,802 bytes, SHA-256 `5b201d69885f58a92ca64522b547594021494c950ed046bd3876f396cfab8acb`.
- Changed source paths: 274; 21,280 insertions and 3,728 deletions.
- Frozen source tree: 2,127 files, 33,091,775 bytes, zero symlinks.
- Authenticated target tests: 121/121 passed across 33 files.
- Syntax builds: 274 passed, 0 failed.
- Source-only `git diff --check`: 0 diagnostics.
- Full-tree `git diff --check`: exactly 1 reviewed acquisition-metadata diagnostic, SHA-256 `a45849856c08d527991e52348d5991ffb9ca17f9fc0d55e4acd4ab7246726b22`: `recovery/cases/2.1.120-to-2.1.121/evidence/CHANGELOG-2.1.121.md:42: new blank line at EOF.`.
- Forward apply, complete byte comparison, reverse apply, and forward reconstruction all succeeded.

## Claim boundary

The exact claim covers the published Linux x64 package, wrapper, analyzable bundle, embedded plain-JavaScript graph, generated accounting, and recovery payloads. The equivalent-source claim covers the frozen `src` overlay plus authenticated semantic tests. Platform-native behavior not present in the Linux x64 artifact and original upstream TypeScript spelling are outside the claim.

Run `RECOVERY_RUNBOOK.md` for the single complete verifier and focused reproduction commands.
