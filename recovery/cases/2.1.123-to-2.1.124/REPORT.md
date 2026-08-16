# Claude Code 2.1.124 recovery report

The Linux x64 2.1.124 published package and embedded JavaScript graph are reconstructed exactly, and the recovered source tree reproduces the authenticated bundle semantics under a fail-closed correspondence proof. This does not claim byte-identical upstream authored TypeScript: the public artifact exposes generated code, so source recovery is an equivalent, reviewable overlay.

## Exact artifact closure

- 2.1.123 wrapper: 13,949,666 bytes, SHA-256 `6992e5f0bf7410ce9dc5eee1a26b132f3257bbed0f3a7f9433ff01c656ac91fc`.
- 2.1.124 wrapper: 13,981,018 bytes, SHA-256 `3214b62d9f7e3763a59211ad95a570d03f37e37c6aa87686cd9b6ccf4827eacb`.
- 2.1.123 analyzable interior: 13,949,576 bytes, SHA-256 `59c8eebc0660d4bbc5c1f82af0ca5e94df5db46084687b979ad21a07fba3d7dd`.
- 2.1.124 analyzable interior: 13,980,928 bytes, SHA-256 `dc2b68c385a3064737343e51e6d7c690f9e03cc40fa89c4393708ae03094d590`.
- The exact wrapper delta is `diff/cli.js.zstd-delta`; package-member and embedded-module reconstruction are independently asserted in `manifest.json`.
- Generated-offset attribution accounts for all 13,980,928 target UTF-16 units in 58,003 ranges, with zero unaccounted units.
- The structural ledger accounts for all 4,405,970 target tokens across 22,358 regions, with zero unclassified tokens.
- The deterministic known-delta proof closes all 22,358 target structural units and 4,405,970 target tokens with zero changed, moved, unresolved, unmatched-baseline, or unresolved-target residue. Its exact inputs are `structural/metadata-normalized-delta.json.gz` and `structural/known-delta-ledger.json.gz`; `structural/known-delta-proof.json` pins their byte lengths and SHA-256 identities.
- Its 205 readable semantic clusters are partitioned exactly once: 168 clusters in 17 direct source/test groups and 37 clusters in 4 evidence-backed accounting-only groups.
- Every one of the 168 direct clusters has its own count-changing authenticated statement slice, exact recovered-source owner/callsite witness, and focused-test binding; the complete binding map is pinned by SHA-256.
- 10 reviewed source-change support rows cover prerequisites and inherited residual synchronization outside precise cluster owners. Each has an exact source witness, focused tests, and a nonempty relation to direct cluster bundle evidence; precise owner and support paths are disjoint and jointly close the changed-source boundary.

## Semantic closure

The registry-adjacent 2.1.124 release has no public Git tag and no public changelog section. The authenticated absence witness pins the complete public tag-ref inventory and changelog snapshot. The row-scoped catalog therefore contains only hidden obligations (hidden 27); all are source-localized and independently exercised.

- Bundle witnesses: 28 fragments and 0 explicit target absences.
- Source witnesses: 257 exact assertions, 17 path-scoped fragment removals, and 0 authenticated deleted-file identities.
- Classifications: source-localized-adjacent 27.
- Test catalog: 12/12 entries consumed.
- Unverified obligations: 0.
- Unclassified target tokens: 0.

Every obligation binds one unique row from `semantic/direct-evidence.json`. The direct test pins the catalog byte length and SHA-256, then checks exact counts in both authenticated adjacent bundles and exact hashes/counts in the recovered source. All 12 frozen source-lineage suites are executed and consumed by the semantic proof.

## Source freeze

The incremental overlay is frozen from `338d170737e8294c489481bc2e8fac52d8ce5f85` to `d2ba6e16e04d5c388a06e1b3c208772e18783633`.

- Target src Git tree: `43090c8672f1ab7ba4b9a9673bff0a762b7aaf92`.
- Overlay: 455,544 bytes, SHA-256 `ee63fa417d92c607454e2e4d0f3f28abe4f5269745d1e29ae6649641c1d07d19`.
- Changed source paths: 131; 3,528 insertions and 945 deletions.
- Frozen source tree: 2,166 files, 32,824,273 bytes, zero symlinks.
- Authenticated target tests: 37/37 passed across 12 files.
- Syntax builds: 131 passed, 0 failed.
- Source-only `git diff --check`: 0 diagnostics.
- Full-tree `git diff --check`: clean (zero diagnostics).
- Forward apply, complete byte comparison, reverse apply, and forward reconstruction all succeeded.

## Claim boundary

The exact claim covers the published Linux x64 package, wrapper, analyzable bundle, embedded plain-JavaScript graph, generated accounting, and recovery payloads. The equivalent-source claim covers the frozen `src` overlay plus authenticated semantic tests. Platform-native behavior not present in the Linux x64 artifact and original upstream TypeScript spelling are outside the claim.

Run `RECOVERY_RUNBOOK.md` for the single complete verifier and focused reproduction commands.
