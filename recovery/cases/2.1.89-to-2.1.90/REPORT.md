# Claude Code 2.1.89 → 2.1.90 recovery report

## Result

The recoverable 2.1.90 release is complete at the published-code layer.

- The authenticated 2.1.90 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.89 bundle and the case's 1,985,545-byte delta.
- The complete 19-member npm package tree reconstructs exactly. All
  43,069,612 unpacked member bytes and target modes match the published
  archive.
- Every one of the target bundle's 13,064,141 UTF-16 code units is covered by
  the attribution inventory.
- Every one of its 4,213,780 JavaScript tokens is classified as matched,
  moved, changed, or explicitly unresolved.
- The case includes the complete binding-aware bundle diff, compact statement
  diff, and rename ledger.
- Six incremental patches recover target-backed behavior in nine repository
  source files, with a reversible full-tree lineage proof and 20 focused
  tests: 15 for the 2.1.90 increment and five inherited 2.1.89 regressions.

The exact original 2.1.90 TypeScript tree is not uniquely recoverable.
Neither 2.1.89 nor 2.1.90 publishes a source map, so the build erased types,
comments, formatting, many local names, and some module boundaries. The case
is therefore labeled `generated-complete-source-partial`: the published
executable and package are exact, while source-facing TypeScript is bounded
to behavior supported directly by target evidence.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, target SHA-256 `06918590…` |
| Published package tree | Exact, 19 members and 43,069,612 bytes |
| Target generated offsets | Complete, 13,064,141 / 13,064,141 UTF-16 units |
| Target JavaScript tokens | Complete classification, 4,213,780 / 4,213,780 |
| Full readable bundle diff | Complete comparison view |
| Incremental repository source | Six patches, nine 2.1.90 files |
| Original authored 2.1.90 spelling | Partially unobservable |

## Two baselines, kept separate

This case needs two different baselines:

1. **2.1.89 is the adjacent generated baseline.** Exact delta, package,
   structural, and readable comparisons are all 2.1.89 → 2.1.90.
2. **2.1.88 is the source-ownership oracle.** Its bundle and matching source
   map identify baseline module ownership for a longer 2.1.88 → 2.1.90
   attribution comparison.

The 2.1.88 map is never applied to 2.1.89 offsets. The manifest names these
roles separately as `baselineBundle`, `sourceOracleBundle`, and
`sourceOracleMap`, and the aggregate gate checks the correct hash for each
report.

## Immutable evidence

[`manifest.json`](./manifest.json) pins all inputs by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.89 npm tarball | 16,493,038 | `680e35001b24b604f58958e3a324bb758be3c069c0a3f89585156256f17a9c87` |
| 2.1.89 `cli.js` | 13,081,065 | `a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01` |
| 2.1.90 npm tarball | 16,512,072 | `8e49c90ebaec565b5fb0af744bebc53c1fd36262453cb4f309c12f6127b55418` |
| 2.1.90 `cli.js` | 13,128,331 | `069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 193,386 | `9ade5a1962402a246bb71772946b1f28bb03974672ee5ba41a6920d054856bd8` |

Both npm tarballs were authenticated against their registry SHA-1, SHA-512
SRI, and ECDSA registry signatures. The resulting exhaustive comparison is
stored as [`package-members.json`](./package-members.json).

The pinned official changelog is fetched at commit
`a50a91999b671e707cebad39542eade7154a00fa`; its 2.1.90 section has 19
entries. Release notes are corroborating localization evidence. Published
artifact bytes remain the oracle.

## Package-member diff

The adjacent packages each contain 19 members:

| Status | Members |
| --- | ---: |
| Unchanged | 13 |
| Changed | 6 |
| Added | 0 |
| Removed | 0 |

Only two members change content:

- `cli.js` grows by 47,266 bytes.
- `package.json` changes only `"version": "2.1.89"` to `"2.1.90"`.

`sdk-tools.d.ts` is byte-identical at 117,129 bytes. The remaining four
reported changes are mode-only: each bundled ripgrep executable changes from
`0644` to `0755` while retaining identical bytes.

`reconstruct-package.mjs` copies unchanged and content-identical members,
applies target modes, changes the package version, and reconstructs `cli.js`
from the exact delta. It then compares every member with the authenticated
target archive. The reconstructed framed tree SHA-256 is:

```text
23d1ac51403cbc1046cf7519d85c9a025f89f05bdeb447dbdaa65d5cf14fe45c
```

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.89 baseline bundle | 13,081,065 | `a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01` |
| Delta | 1,985,545 | `a9f3e0b9fc736ae1129cc4e8ffcd82c9327e08f8d91be8e7cd3ca46540b7089e` |
| Reconstructed 2.1.90 bundle | 13,128,331 | `069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9` |

The builder reconstructs to a temporary file and byte-compares the result
before reporting `exact-delta-verified`.

## Exhaustive attribution and token accounting

The 2.1.88 bundle/map source oracle contains 4,756 sources and 2,068,722
mapped segments. The attribution report inventories 4,552 target initializer
regions and 43,530 target partitions. Partitions plus exact anchors cover all
13,064,141 target UTF-16 code units, leaving zero unaccounted.

This is exact offset accounting with evidence-ranked target ownership, not a
claim that the 2.1.88 source map maps 2.1.90 directly.

The structural ledger classifies the complete target:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,166 | 3,714,350 |
| Moved candidate | 976 | 14,844 |
| Coarse changed candidate | 320 | 179,767 |
| Unresolved pairing | 813 | 304,819 |
| **Total** | **18,275** | **4,213,780** |

Unresolved tokens are present in the exact target and readable diff; only
their baseline pairing is withheld.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
contains the full Git-style comparison after conservative Program-scope
binding alignment. It records:

- 12,536 structurally unique statement pairs;
- 17,753 accepted binding alignments;
- 95,561 identifier edits; and
- 4,590 rejected unsafe or ambiguous alignments.

The target comparison-invariant hash remains identical before alpha rename,
after rename, and after statement normalization. This makes the output a
checked comparison representation, not executable source.

## Source-facing recovery

The incremental 2.1.90 overlay changes nine files:

- `src/QueryEngine.ts`;
- `src/cli/transports/SSETransport.ts`;
- `src/components/HelpV2/General.tsx`;
- `src/screens/REPL.tsx`;
- `src/tools/PowerShellTool/readOnlyValidation.ts`;
- `src/types/logs.ts`;
- `src/utils/permissions/filesystem.ts`;
- `src/utils/plugins/marketplaceManager.ts`; and
- `src/utils/sessionStorage.ts`.

The recovered behavior includes:

- retaining an existing marketplace clone after a failed pull when
  `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE` is truthy;
- protecting `.husky` in accept-edits mode;
- removing `ipconfig /displaydns` from automatic read-only approval;
- opening rate-limit options at most once per REPL lifetime;
- buffering SSE chunks and joining only at a complete frame boundary;
- incrementally recording QueryEngine transcript tails with parent chaining;
- preserving resume-critical attachments;
- loading project and worktree session metadata concurrently;
- newly filtering background, daemon, SDK, and loop sessions from the resume
  picker while preserving the existing sidechain and team filters; and
- showing the `/powerup` help hint at terminal height 44 or greater.

The exact reconstructed generated bundle contains the complete shipped
`/powerup` implementation and every other 2.1.90 change; the source-facing
overlay claims only the target-backed HelpV2 hint.

The source lineage is independently pinned:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Recovered 2.1.89 base | 1,903 | 30,388,323 | `b1724f0656a658c9113c06e5f7ebf94a2d97161c104fa6c59e0c962ddd5434d3` |
| Applied 2.1.90 overlay | 1,903 | 30,392,826 | `9be3f19a65aa46760fd3ababffefe74cc6eb1f81cb12b57bfb5e16662425ce25` |

`verify-source-lineage.mjs` copies the current tree, reverse-applies all six
patches in reverse order, proves the base hash, reapplies them in order, and
byte-compares the reconstructed target with the repository. It also builds
all nine changed files and runs the 20 focused lineage tests described above.

For `General.tsx`, the exact outer React-compiler cache behavior is recovered,
but the 2.1.88 inline source-map payload remains byte-identical. The target
publishes no replacement map, so inventing new VLQ mappings or claiming an
authored constant name would be less accurate than preserving the observable
boundary.

## Aggregate verification

Run:

```sh
CASE=recovery/cases/2.1.89-to-2.1.90
ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$ARTIFACTS" \
  --baseline-tarball "$ARTIFACTS/2.1.89/package.tgz"
```

Expected top-level status:

```text
complete-recovery-verified
```

The gate verifies evidence identity, source-oracle correspondence, target
fragments, bidirectional source lineage, focused recovery tests, exact delta,
attribution coverage, structural accounting, readable-diff integrity, and
the exact reconstructed package tree.
