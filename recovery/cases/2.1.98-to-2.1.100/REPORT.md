# Claude Code 2.1.98 → 2.1.100 recovery report

## Result

The recoverable Claude Code 2.1.100 release is complete at the
published-code layer. Upstream did not publish version 2.1.99, so 2.1.98 is
the immediately preceding published baseline for this recovery.

- The authenticated 2.1.100 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.98 bundle and the case's exact Zstandard dictionary
  delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,085,135 unpacked member bytes, paths, types, and modes match the
  authenticated target archive.
- Eighteen package members are byte-identical. The exhaustive changed set is
  `cli.js` and the version-only `package.json`.
- The adjacent `sdk-tools.d.ts` files are byte-identical, so this release has
  no public declaration change and requires no declaration delta.
- Every one of the target bundle's 13,403,094 UTF-16 code units is covered by
  the attribution inventory.
- Every one of its 4,290,969 JavaScript tokens is classified.
- The binding-aware readable comparison covers the complete bundle.
- A reversible, target-backed source-facing overlay advances the repository
  from its verified 2.1.98 source state to the recovered 2.1.100 state.

The exact original 2.1.100 TypeScript tree is not uniquely recoverable.
Neither adjacent npm package contains a source map. Names, types, comments,
formatting, and some authored module boundaries were erased by the build.
The case is therefore labeled `generated-complete-source-partial`: the
published executable and package tree are exact, while TypeScript changes are
applied only where the generated target supports a defensible placement.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, target SHA-256 `d490cc3e…9be` |
| Published package tree | Exact, 20 members and 49,085,135 bytes |
| Public declarations | Unchanged and byte-identical |
| Target generated offsets | Complete, 13,403,094 / 13,403,094 UTF-16 units |
| Target JavaScript tokens | Complete classification, 4,290,969 / 4,290,969 |
| Full readable bundle diff | Complete comparison view |
| Incremental repository source | Partial, one reversible patch on 3 paths |
| Original authored 2.1.100 spelling | Partially unobservable |

## Published-version adjacency

The npm registry packument has neither a version nor a publication-time entry
for `2.1.99`. An exact lookup for
`@anthropic-ai/claude-code@2.1.99` returns HTTP 404 with
`version not found: 2.1.99`.

```text
2.1.98   published 2026-04-09T18:08:49.739Z
2.1.99   not published by upstream
2.1.100  published 2026-04-10T05:00:41.623Z
```

The skipped number is not modeled as an unknown intermediate bundle. Every
exact delta, member comparison, structural pairing, and readable comparison
in this case is directly 2.1.98 → 2.1.100.

The official lightweight tags `v2.1.98` and `v2.1.100` both resolve to
commit `c5600e0b1e9bb6ddf750cf7441c4d4fffbb7c917`. The changelog pinned at
that commit begins with 2.1.98, whose section has 57 bullets; it has no
2.1.99 or 2.1.100 section. Consequently, this changelog is retained only as
pinned provenance. It is not 2.1.100 behavior attribution, and no recovery
claim is derived from nonexistent 2.1.100 release notes.

## Baseline roles

This case keeps two baselines separate:

1. **2.1.98 is the adjacent generated baseline.** Exact bundle, declaration,
   package, structural, and readable comparisons are all 2.1.98 → 2.1.100.
2. **2.1.88 is the source-ownership oracle.** Its matching bundle and source
   map identify exact baseline ownership for attribution.

The 2.1.88 map is never applied directly to 2.1.98 or 2.1.100 offsets.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.98 npm tarball | 18,574,200 | `a536437ce8a79c1908bc73a197fa9c86497fa2757121a6f6236cd439228c0b7b` |
| 2.1.98 `cli.js` | 13,471,101 | `27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556` |
| 2.1.100 npm tarball | 18,573,250 | `0e48a9da69db72f92cf126d9541a976a36918b549011e98dd880e21f195aa9b0` |
| 2.1.100 `cli.js` | 13,468,528 | `d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be` |
| Adjacent `sdk-tools.d.ts` | 117,378 | `9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 212,809 | `5e847610e0030533e2c1b80741b9842a331c404617b9902397b45a70e0f85f14` |

Both npm tarballs pass their registry SHA-1, SHA-512 SRI, and ECDSA P-256
signature checks under registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The key's SPKI SHA-256 is
`fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1`.
The exhaustive authenticated result is stored in
[`package-members.json`](./package-members.json).

The GitHub-tag anomaly does not weaken the npm artifact identity. The
authenticated registry tarball is the target oracle, and the deterministic
recovery is checked against every byte of that tarball.

## Package-member diff

| Status | Members |
| --- | ---: |
| Unchanged | 18 |
| Changed | 2 |
| Added | 0 |
| Removed | 0 |
| Mode-only changed | 0 |

The changed set is exhaustive:

- `package/cli.js` shrinks by 2,573 bytes, from 13,471,101 to 13,468,528.
- `package/package.json` changes only the version from 2.1.98 to 2.1.100.

`package/sdk-tools.d.ts`, every native executable, seccomp helper, ripgrep
binary, license, and readme are byte-identical. The exact target
package-tree SHA-256 is:

```text
77664e78764fb8a12061576b840eb3efa6cd9f0405b6189f6c8b2edca33a83f7
```

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.98 baseline bundle | 13,471,101 | `27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556` |
| Delta | 1,471,024 | `17a70bec81bb61a95ff9b3ec1fd211dbd4c1d280f25c04c296aebe600a5a3f84` |
| Reconstructed 2.1.100 bundle | 13,468,528 | `d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be` |

The package reconstructor applies that delta, uniquely changes the package
version, copies the 18 unchanged members with their target modes, and
compares all 20 outputs with the authenticated target.

## Exhaustive generated-code accounting

The source oracle contains 4,756 sources and 2,068,722 mapped segments. The
attribution inventory records 4,604 target initializer regions, 39,997
target partitions, and 39,996 exact anchors. Partitions plus exact anchors
cover all 13,403,094 target UTF-16 code units, leaving zero unaccounted.

The structural ledger classifies every target token:

| Classification | Tokens |
| --- | ---: |
| Matched | 4,192,305 |
| Moved candidate | 0 |
| Coarse changed candidate | 0 |
| Unresolved pairing | 98,664 |
| **Total** | **4,290,969** |

`unresolved` means the conservative matcher withheld a 2.1.98 pairing. Those
tokens are still present in the exact bundle, structural ledger, and readable
full-bundle diff.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
contains the complete Git-style comparison after conservative Program-scope
binding alignment. It records:

- 13,178 structurally unique statement pairs;
- 10,781 accepted binding alignments;
- 54,294 identifier edits; and
- 8,968 rejected unsafe alignments.

The target comparison-invariant hash is identical before alpha rename, after
rename, and after statement normalization. This is a checked comparison
representation, not executable or authored source.

## Source-facing recovery

The consolidated reversible source patch is
[`recovered/thinking-progress-and-prompts.patch`](./recovered/thinking-progress-and-prompts.patch).
It changes three existing paths and recovers three target-backed behavior
clusters:

- `src/screens/REPL.tsx` adds long-thinking milestones at 30, 90, and 270
  seconds. The timers exist only while the REPL is loading in `thinking`
  mode, reset outside that state, are cleared on effect cleanup, and render
  below the spinner:
  - `Thinking a bit longer… still working on it…`
  - `This is a harder one… it might take a few more minutes…`
  - `Hang tight… really working through this one…`
- `src/components/Spinner/useStalledAnimation.ts` moves the no-token stall
  threshold from 3 seconds to 10 seconds and the fade interval from 2 seconds
  to 10 seconds. The exact recovered calculation is a 10-second threshold
  followed by a 10-second linear fade.
- `src/constants/prompts.ts` removes the obsolete
  `getOutputEfficiencySection` owner and its system-prompt insertion. The
  authenticated 2.1.98 bundle contains both its internal
  `# Communicating with the user` branch and external
  `# Output efficiency` branch; the 2.1.100 bundle contains neither.

Three additional prompt changes are exact in the recovered target bundle but
remain bundle-only:

- the end-of-turn communication guidance becomes a one- or two-sentence
  summary of what changed and what is next;
- exploratory questions receive a 2–3 sentence recommendation with the main
  tradeoff; and
- numeric anchors limit text between tool calls to 25 words and final
  responses to 100 words unless the task needs more detail.

The 2.1.98 source tree lacks the authored experiment scaffolding needed to
place those three prompt fragments honestly. They therefore remain exact in
the deterministic bundle recovery and are verified against both adjacent
bundles, but no speculative TypeScript owner is invented.

The source patch contains 29 insertions and 33 deletions across the three
paths. Its 1,283,098 bytes have SHA-256:

```text
741a41d12819f597003f2440290e317cfea8ad4faa282260a94bb6885af2e939
```

The source lineage is independently pinned:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Recovered 2.1.98 base | 1,933 | 30,702,094 | `781e5ebbb94fc3dffaf2121db9bae55aed8ad12efeb0579919822094fe499a9b` |
| Applied 2.1.100 overlay | 1,933 | 30,699,758 | `47eb501c55779f8661dcd50c6b86c298fd85711ebe81300dd43b0a1539d58dad` |

The lineage gate reverse-applies the patch to reproduce the exact 2.1.98
tree, reapplies it, byte-compares the result with the repository, Bun-builds
all three changed source paths, and runs four target-backed semantic tests.
The base is additionally pinned to commit
`5ecd35c9e33fc10ec040d98e15eff6da20b569e0`, full Git tree
`5be7981c901c7a586d1f1a2e8517a81cbb6c4adc`, and `src` Git tree
`fd41ca07c4ca03756801b218462eab83c6fa3baf`.

## Verification

Acquire immutable evidence and run the aggregate gate:

```sh
CASE=recovery/cases/2.1.98-to-2.1.100
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.98/package.tgz"
```

Expected result:

```text
status          complete-recovery-verified
bundle bytes    13468528
bundle sha256   d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be
package members 20
package bytes   49085135
package sha256  77664e78764fb8a12061576b840eb3efa6cd9f0405b6189f6c8b2edca33a83f7
source files    1933
semantic tests  4
```

For the complete construction procedure, see
[`RECOVERY_RUNBOOK.md`](./RECOVERY_RUNBOOK.md).

## Semantic source audit

The fail-closed `compiled-ast-function-semantics-v1` ledger accounts for all 80
structurally nonmatched target units and reports zero first-party source
runtime gaps. The first-party target behavior is therefore semantically
reproduced by the historical source plus
[`semantic-supplement.patch`](./semantic-supplement.patch). No changed unit is
classified as dependency runtime, but the historical source tree still lacks
a pinned application dependency manifest, lockfile, and hermetic build recipe;
whole-bundle semantic equivalence from source is therefore not claimed.
