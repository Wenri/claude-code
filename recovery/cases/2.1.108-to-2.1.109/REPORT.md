# Claude Code 2.1.108 → 2.1.109 recovery report

## Result

Claude Code 2.1.109 is complete at the published-package and generated-code
layers.

- The authenticated 2.1.109 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.108 bundle and the exact Zstandard dictionary delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,160,435 unpacked member bytes, paths, types, modes, and link targets
  match the authenticated target.
- Eighteen members are byte-identical. The exhaustive changed set is
  `package/cli.js` and the version-only `package/package.json`;
  `package/sdk-tools.d.ts` is unchanged.
- All 13,477,492 target UTF-16 code units are covered by attribution, and all
  4,302,774 target JavaScript tokens are classified.
- All ten meaningful alpha-normalized runtime hunks map to the one published
  behavior: a rotating progress hint for the extended-thinking indicator.
- A reversible source-facing overlay localizes that behavior across three
  source paths.

Neither adjacent package contains a source map. Exact erased TypeScript
names, types, comments, formatting, and module boundaries remain partially
unobservable, so the case is labeled
`generated-complete-source-partial`.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, SHA-256 `3dc52acc…8bb7` |
| Published package tree | Exact, 20 members and 49,160,435 bytes |
| Public declarations | Exact, byte-identical |
| Target generated offsets | 13,477,492 / 13,477,492 |
| Target JavaScript tokens | 4,302,774 / 4,302,774 classified |
| Incremental source overlay | Reversible patch on 3 paths |
| Original authored spelling | Partially unobservable |

## Adjacent-release evidence

The executable comparison uses the authenticated adjacent npm artifacts for
2.1.108 and 2.1.109. Registry and Git evidence independently establish this
one-step transition:

| Release | npm publication time | Tag commit |
| --- | --- | --- |
| 2.1.108 | `2026-04-14T18:35:26.902Z` | `5c18c787f262242a4266a12d2d1123808394fbce` |
| 2.1.109 | `2026-04-15T03:45:21.462Z` | `f348a16da8280fced433f24ede16de612dd55ffd` |

The 2.1.109 tag commit has the 2.1.108 tag commit as its sole parent. Its tree
is `1462186bf28fecaa3bb8abd91fbdac420040882c`. The pinned official changelog
section has one bullet:

> Improved the extended-thinking indicator with a rotating progress hint

The public Git history establishes adjacency and release intent but does not
expose the authored implementation. The signed npm artifacts remain the
executable authority.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.108 npm tarball | 18,621,246 | `be20b29860d7d708043eedf9a36bb1422e5094e7de427cbcbca4068b00e0d9b8` |
| 2.1.108 `cli.js` | 13,542,838 | `dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73` |
| 2.1.109 npm tarball | 18,621,822 | `0449b9d05b2141ba51c7a5262a7c62e68c73098b87e4fc97b5e1a517aaaf7128` |
| 2.1.109 `cli.js` | 13,543,570 | `3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7` |
| Unchanged `sdk-tools.d.ts` | 117,636 | `434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 226,508 | `5ae4283ec121bd2130d7eec177ad931a55dd46a4ab2a8f69fc6546a04e17db8a` |

Both npm tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature
verification under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Exact package and generated-code recovery

The exhaustive package report records 18 unchanged and two changed members,
with no additions, removals, or mode-only changes. The target framed-tree
SHA-256 is:

```text
d44addbf39a4d0265d529a8b93de2d8641c1ec8e5d288f833b6a9bb30bbe277b
```

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is 1,800,138 bytes with
SHA-256
`e80feeb44fb51733ff0e2d0abaeb23008ce56a6de4b7daecd7407cb4e131b478`.
Replay produces the exact 13,543,570-byte target bundle. The metadata change
is the unique version replacement 2.1.108 → 2.1.109. The public declarations
are byte-identical. The delta also preserves the target's
`external-build-2193` provenance stamp.

## Exhaustive generated-code accounting

The attribution inventory retains 4,756 exact 2.1.88 source-owner rows, 4,658
target initializer regions, and 39,005 exhaustive target partitions. Exact
anchors plus partitions account for every target UTF-16 unit.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 19,068 | 4,190,574 |
| Moved candidate | 108 | 1,579 |
| Coarse changed candidate | 8 | 421 |
| Unresolved pairing | 93 | 110,200 |
| **Total** | **19,277** | **4,302,774** |

`unresolved` means the conservative matcher withheld a 2.1.108 pairing.
Those tokens remain present in the exact target bundle, token ledger, and
complete readable diff. The exact structural fraction is approximately
97.43%, and the resolved structural fraction is approximately 97.44%.

The readable comparison covers 19,274 baseline and 19,277 target statements,
with 13,603 structurally unique pairs, 13,416 accepted bindings, 68,125
identifier edits, and 9,392 rejected unsafe alignments. The comparison
invariant remains
`21b89cb2dd0576a1c6f4a650c8cef42aad73394b6ed68bdbefce9aca29e5a5fa`
through every accepted normalization.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is a reversible 7,484-byte patch with 92 insertions, 32 deletions, and
SHA-256
`d1c44f0e1794150e4adac92caf40938893ccf25e579d970bf8cf903c7a3b69db`.
It changes:

- `src/components/ThinkingIndicator.tsx`: adds the indicator renderer and
  fourteen timed hints from 1 to 165 seconds;
- `src/components/Messages.tsx`: accepts and renders `showThinkingHint`
  before streaming assistant text; and
- `src/screens/REPL.tsx`: delegates the display to `Messages`, resets
  thinking mode during loading-state cleanup, and removes the former
  five-hint local timer and inline row.

The published target contains a pre-existing generated spinner-state boundary
that is not represented in the current authored reconstruction. The overlay
uses the current tree's equivalent `streamMode === "thinking"` gate. Exact
strings, timing, render placement, reset, and teardown behavior are
target-backed; exact original TypeScript spelling and that erased state-store
boundary remain inferred.

## Source lineage and verification

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.108 base | 1,933 | 30,748,085 | `9123013c…e96` |
| Applied 2.1.109 overlay | 1,934 | 30,749,350 | `8ae464c7…c67` |

The complete gate reverse-applies the patch, checks the exact base tree,
reapplies it, byte-compares the result, syntax-builds all three changed paths,
runs the adjacent-bundle recovery test, reconstructs the exact bundle, and
compares every reconstructed package member.

```sh
CASE=recovery/cases/2.1.108-to-2.1.109
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.108/package.tgz"
```

Expected status: `complete-recovery-verified`.
