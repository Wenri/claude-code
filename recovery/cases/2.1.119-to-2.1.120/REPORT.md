# Claude Code 2.1.120 recovery report

The Linux x64 2.1.120 published package and embedded JavaScript graph are reconstructed exactly, and the recovered source tree reproduces the authenticated bundle semantics under a fail-closed correspondence proof. This does not claim byte-identical upstream authored TypeScript: the public artifact exposes generated code, so source recovery is an equivalent, reviewable overlay.

## Exact artifact closure

- 2.1.119 wrapper: 13,721,077 bytes, SHA-256 `bc814388b51cbcb5114db927e60f8fbb5e12409532a89137429975556c29464e`.
- 2.1.120 wrapper: 13,784,833 bytes, SHA-256 `280754b3db23901e986711f11dc74536da9669c43f61999b4a84e2cf76cf1e83`.
- 2.1.119 analyzable interior: 13,720,987 bytes, SHA-256 `9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef`.
- 2.1.120 analyzable interior: 13,784,743 bytes, SHA-256 `c059a8b461185de1823ac3f758e0216bd8cb5ea7d6d2d2e868d92e44e2c0db0f`.
- The exact wrapper delta is `diff/cli.js.zstd-delta`; package-member and embedded-module reconstruction are independently asserted in `manifest.json`.
- Generated-offset attribution accounts for all 13,784,743 target UTF-16 units in 58,345 ranges, with zero unaccounted units.
- The structural ledger accounts for all 4,331,872 target tokens across 22,020 regions, with zero unclassified tokens.

## Semantic closure

The row-scoped direct catalog contains 84 obligations (official 22, hidden 15, daemon 3, selection 2, residual 40, fleet 2). It covers all 22 official changelog bullets exactly once, H01-H15, daemon lifecycle, selection/scrollback, finite residual findings, and Fleet/relaunch behavior.

- Bundle witnesses: 173 fragments and 12 explicit target absences.
- Source witnesses: 373 exact assertions and 18 path-scoped removals.
- Classifications: source-localized-adjacent 71, source-localized-inherited 13.
- Test catalog: 9/9 entries consumed.
- Unverified obligations: 0.
- Unclassified target tokens: 0.

Every obligation binds one unique row from `semantic/direct-evidence.json`. The direct test pins the catalog byte length and SHA-256, then checks exact counts in both authenticated adjacent bundles and exact hashes/counts in the recovered source. All 9 frozen source-lineage suites are executed and consumed by the semantic proof.

## Source freeze

The incremental overlay is frozen from `351cd4d13f70a564dc2d90f59ab0093dc6fc7b05` to `9ca39e71e1bb5f506119000c7e5237fe716953a8`.

- Target src Git tree: `a80c537f012b1588e3900c998971fec31eefc3ce`.
- Overlay: 1,817,973 bytes, SHA-256 `a3d9bcf357ceac5567626666fbd4da958e612b26ee01e43b8d485dd5f6beaa9e`.
- Changed source paths: 171; 6,428 insertions and 1,671 deletions.
- Frozen source tree: 2,099 files, 32,513,282 bytes, zero symlinks.
- Authenticated target tests: 52/52 passed across 9 files.
- Syntax builds: 170 passed, 0 failed.
- Forward apply, complete byte comparison, reverse apply, and forward reconstruction all succeeded.

## Claim boundary

The exact claim covers the published Linux x64 package, wrapper, analyzable bundle, embedded plain-JavaScript graph, generated accounting, and recovery payloads. The equivalent-source claim covers the frozen `src` overlay plus authenticated semantic tests. Platform-native behavior not present in the Linux x64 artifact and original upstream TypeScript spelling are outside the claim.

Run `RECOVERY_RUNBOOK.md` for the single complete verifier and focused reproduction commands.
