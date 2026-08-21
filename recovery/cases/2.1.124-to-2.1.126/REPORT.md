# Claude Code 2.1.126 recovery report

The Linux x64 2.1.126 published package and embedded JavaScript graph are reconstructed exactly, and the recovered source tree reproduces the authenticated bundle semantics under a fail-closed correspondence proof. This does not claim byte-identical upstream authored TypeScript: the public artifact exposes generated code, so source recovery is an equivalent, reviewable overlay.

## Exact artifact closure

- 2.1.124 wrapper: 13,981,018 bytes, SHA-256 `3214b62d9f7e3763a59211ad95a570d03f37e37c6aa87686cd9b6ccf4827eacb`.
- 2.1.126 wrapper: 13,980,501 bytes, SHA-256 `99ea0a1eaab285e1c4fa3602458cdc4ee3f81fc622c3dc90906a7e306dd75a0f`.
- 2.1.124 analyzable interior: 13,980,928 bytes, SHA-256 `dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590`.
- 2.1.126 analyzable interior: 13,980,411 bytes, SHA-256 `e9d40219be0cad9009c115ec637df4976e987c33d4b7a88cc5f047ead9ad828d`.
- The exact wrapper delta is `diff/cli.js.zstd-delta`; package-member and embedded-module reconstruction are independently asserted in `manifest.json`.
- Generated-offset attribution accounts for all 13,980,411 target UTF-16 units in 58,003 ranges, with zero unaccounted units.
- The structural ledger accounts for all 4,405,944 target tokens across 22,358 regions, with zero unclassified tokens.
- The deterministic known-delta proof closes all 22,358 target structural units and 4,405,944 target tokens with zero changed, moved, unresolved, unmatched-baseline, or unresolved-target residue. Its exact inputs are `structural/metadata-normalized-delta.json.gz` and `structural/known-delta-ledger.json.gz`; `structural/known-delta-proof.json` pins their byte lengths and SHA-256 identities.
- Its 6 readable semantic clusters are partitioned exactly once: 5 clusters in 3 direct source/test groups and 1 clusters in 1 evidence-backed accounting-only groups.
- Every one of the 5 direct clusters has its own count-changing authenticated statement slice, exact recovered-source owner/callsite witness, and focused-test binding; the complete binding map is pinned by SHA-256.
- 0 reviewed adjacent source-support rows cover prerequisites or residual synchronization outside precise adjacent-cluster owners.
- 1 target-retained source-repair row covers Ctrl+L redraw semantics outside the adjacent cluster ledger. Its bundle handler is byte-identical across 2.1.124 and 2.1.126, while the repaired source path is separately frozen. The 4 adjacent owner paths, 0 support paths, and 1 retained repair path are disjoint and close all 5 changed source paths.

## Semantic closure

The authenticated public 2.1.126 tag and changelog contain 33 official bullets. npm independently shows that 2.1.125 was never published, so the adjacent package comparison is 2.1.124→2.1.126. The proof distinguishes the small adjacent semantic delta from target behavior already present in the 2.1.124 baseline; it never treats every public bullet as a new adjacent change. The row-scoped catalog covers all official bullets exactly once plus the hidden adjacent effort behavior (hidden 1, official 32).

- Bundle witnesses: 38 fragments and 1 explicit target absences.
- Source witnesses: 64 exact assertions, 5 path-scoped fragment removals, and 0 authenticated deleted-file identities.
- Classifications: source-localized-inherited 30, source-localized-adjacent 3.
- Test catalog: 12/12 entries consumed.
- Unverified obligations: 0.
- Unclassified target tokens: 0.

Every obligation binds one unique row from `semantic/direct-evidence.json`. The direct test pins the catalog byte length and SHA-256, then checks exact counts in both authenticated adjacent bundles and exact hashes/counts in the recovered source. The 29 inherited official rows additionally pin their sealed 2.1.124 catalog rows and focused tests. B23 instead pins byte-identical bundle semantics, the repaired redraw-only handler, and the `retained-redraw` suite without inventing an adjacent cluster. All 4 frozen current-release suites are executed and consumed by the semantic proof.

## Source freeze

The incremental overlay is frozen from `ae866640a6d67891fe14aeff5bc41da10784b979` to `11865927d6656cbc299b8cc6f4696a71c29f55bc`.

- Target src Git tree: `9c7c4f699cd0cc740dcb5e5341aeb026d4bc2263`.
- Overlay: 8,076 bytes, SHA-256 `457010b448b9075aacc42f2b1f76407cb08ac8dfedd914ae05084dbfda43f8b6`.
- Changed source paths: 5; 32 insertions and 38 deletions.
- Frozen source tree: 2,166 files, 32,823,496 bytes, zero symlinks.
- Authenticated target tests: 10/10 passed across 4 files.
- Syntax builds: 5 passed, 0 failed.
- Source-only `git diff --check`: 0 diagnostics.
- Full-tree `git diff --check`: 1 reviewed diagnostics, SHA-256 `46e47269c72f3c24b9f1e6840408b039b219f1b1f38f61616628f9e9e159aae7`.
- Forward apply, complete byte comparison, reverse apply, and forward reconstruction all succeeded.

## Claim boundary

The exact claim covers the published Linux x64 package, wrapper, analyzable bundle, embedded plain-JavaScript graph, generated accounting, and recovery payloads. The equivalent-source claim covers the frozen `src` overlay plus authenticated semantic tests. Platform-native behavior not present in the Linux x64 artifact and original upstream TypeScript spelling are outside the claim.

Run `RECOVERY_RUNBOOK.md` for the single complete verifier and focused reproduction commands.
