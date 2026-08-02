# Claude Code 2.1.111 → 2.1.112 recovery report

## Result

Claude Code 2.1.112 is complete at the published-package and generated-code
layers.

- The authenticated 2.1.112 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.111 bundle and the exact Zstandard dictionary delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,328,681 unpacked member bytes, paths, types, modes, and link targets
  match the authenticated target.
- Eighteen members are byte-identical. The exhaustive changed set is
  `package/cli.js` and the version-only `package/package.json`; the public
  declarations are unchanged.
- All 13,645,106 target UTF-16 code units are covered by attribution, and all
  4,335,166 target JavaScript tokens are classified.
- A reversible three-file source-facing overlay localizes the defensible
  2.1.112 hotfix in the cumulative source mirror.

Neither adjacent package contains a source map. Exact erased TypeScript
names, types, comments, formatting, and module boundaries remain partially
unobservable, so the case is labeled
`generated-complete-source-partial`.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, SHA-256 `bc335828…163f` |
| Published package tree | Exact, 20 members and 49,328,681 bytes |
| Public declarations | Exact and unchanged |
| Target generated offsets | 13,645,106 / 13,645,106 |
| Target JavaScript tokens | 4,335,166 / 4,335,166 classified |
| Incremental source overlay | Reversible, target-backed patch |
| Original authored spelling | Partially unobservable |

## Adjacent-release evidence

The executable comparison uses authenticated adjacent npm artifacts for
2.1.111 and 2.1.112:

| Release | npm publication time | Tag commit |
| --- | --- | --- |
| 2.1.111 | `2026-04-16T15:16:09.415Z` | `bf77ee65bc2805d18a7c6fce61fa2b04cdafcf88` |
| 2.1.112 | `2026-04-16T19:23:46.419Z` | `2b53fac3b2dd381bfb29f456f43c0b3eb9b3ebff` |

The public Git tags are in a direct parent relationship:

```text
bf77ee65bc2805d18a7c6fce61fa2b04cdafcf88
  ↓
2b53fac3b2dd381bfb29f456f43c0b3eb9b3ebff
```

The target tag has tree
`e740b6148e4274524e52d58b6a2d341a430d6282`. Its public commit changes the
changelog, not the authored implementation, so the signed npm packages remain
the executable authority.

The pinned official 2.1.112 changelog section contains one bullet and is 80
bytes, SHA-256
`30b0015d131c30e3a66ab13ddb342ccb7e6556be4a9afb51ec96789534bb38b6`:

> Fixed "claude-opus-4-7 is temporarily unavailable" for auto mode

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.111 npm tarball | 18,679,259 | `db1a51e547a465917523bc366fc4180a7a2f5a5c6d4261c03894d0ebfd07ef18` |
| 2.1.111 `cli.js` | 13,711,605 | `8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0` |
| 2.1.112 npm tarball | 18,679,326 | `84379969ea53a0e5fd231a8f77debe4c7cb17dd971f4809d10d33f9aeca5de09` |
| 2.1.112 `cli.js` | 13,711,684 | `bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f` |
| Unchanged declarations | 117,768 | `98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 235,064 | `b9db282b7f2562708967e9a89140d8bcbf980d71976555788b83bff2f23c09aa` |

Both npm tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature
verification under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Exact package and generated-code recovery

The exhaustive package report records 18 unchanged and two changed members,
with no additions, removals, declaration changes, or mode-only changes. The
target framed-tree SHA-256 is:

```text
938bdf827e5fa7181cff5360cb2f028447cf865bd26c129d1edbcaa8af377fac
```

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is 1,028,916 bytes with
SHA-256
`c74631367b90863c7f521f096d806536e96de26c4536e1e9251d4a626d85844a`.
Replay produces the exact 13,711,684-byte target bundle. The only other
package change is the unique metadata replacement 2.1.111 → 2.1.112. The
117,768-byte declaration file is byte-identical.

The exact bundle also changes its generated provenance stamp from
`external-build-2172` to `external-build-2239`. That stamp and associated
minifier-name churn are retained byte-for-byte by the generated recovery; no
authored-source placement is invented for build metadata.

## Exhaustive generated-code accounting

The attribution inventory retains 4,756 exact 2.1.88 source-owner rows,
4,684 target initializer regions, and 34,366 exhaustive target partitions.
Exact anchors plus partitions account for every target UTF-16 unit.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 19,451 | 4,252,777 |
| Moved candidate | 0 | 0 |
| Coarse changed candidate | 0 | 0 |
| Unresolved pairing | 75 | 82,389 |
| **Total** | **19,526** | **4,335,166** |

`unresolved` means the conservative matcher withheld a 2.1.111 pairing. Those
tokens remain present in the exact target bundle, token ledger, and complete
readable diff. Both the exact and resolved structural fractions are
approximately 98.10%.

The readable comparison covers 19,525 baseline and 19,526 target statements,
with 13,805 structurally unique pairs, 9,161 accepted binding alignments,
24,359 identifier edits, and 9,615 rejected unsafe alignments. The comparison
invariant remains
`2471a6b61446834ad5b795f8bc65ba9d2a6b1f12019757ac6d8acd1527c1fb5b`
through every accepted normalization.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is a reversible 2,911-byte incremental patch, SHA-256
`31835938183f03bdef564e84b909c1c61cf4334c5b1c127e9154ba7a780b40c7`.
It affects three existing source paths, with 16 insertions and five deletions:

- `src/utils/betas.ts` adds a model-temperature capability predicate that
  rejects canonical Opus 4.7 model names;
- `src/services/api/claude.ts` applies that capability guard when constructing
  the main request, while preserving the existing thinking-mode rule; and
- `src/utils/sideQuery.ts` applies the same guard to explicit side-query
  temperatures after model normalization.

The descriptive source helper name `modelSupportsTemperature` is defensible
placement, not a claim about erased upstream spelling. The adjacent target
bundle proves the predicate and both call sites, but minification makes the
original TypeScript identifier unobservable.

The generated/package layer remains the complete claim. A structured-output
source-placement gap already present in the recovered 2.1.111 base is not a
2.1.112 delta and is not silently folded into this overlay. Build provenance
changes likewise remain generated-only. No other historical source gap is
upgraded by this narrowly scoped hotfix.

## Source lineage and verification

The source-lineage gate reverse-applies the overlay, checks the exact 2.1.111
base tree, reapplies it, byte-compares the result, syntax-builds all three
changed source paths, and runs focused adjacent-bundle/source tests.

| Source tree | Files | Bytes | Framed manifest SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.111 base | 1,950 | 30,859,073 | `9599bad7f1d9cb0fddb2abde183d3800c60ebf413c9a6a027be41a8aecfb6644` |
| Recovered 2.1.112-facing target | 1,950 | 30,859,372 | `a4a78ad2e102ea43ab739cf19ab1018ed52a1c809171f73b77e7c9e973ad9195` |

The verified repository base is commit
`5e168e7272e2eb510b16d7141538bb3f4836749a`, with `src` Git tree
`e7ad7e73883d144c33df5d264dc03733e4777934`.

```sh
CASE=recovery/cases/2.1.111-to-2.1.112
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.111/package.tgz"
```

Expected status: `complete-recovery-verified`.
